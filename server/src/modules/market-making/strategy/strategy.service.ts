/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import * as ccxt from 'ccxt';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import {
  createPureMarketMakingStrategyKey,
  createStrategyKey,
} from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { DexVolumeStrategyService } from './dex-volume.strategy.service';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
import {
  ArbitrageStrategyDto,
  DexAdapterId,
  PureMarketMakingStrategyDto,
  VolumeExecutionVenue,
} from './strategy.dto';
import { StrategyControllerRegistry } from './strategy-controller.registry';
import {
  StrategyRuntimeSession,
  StrategyType,
} from './strategy-controller.types';
import { StrategyOrderIntent } from './strategy-intent.types';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';

type BaseVolumeStrategyParams = {
  exchangeName: string;
  symbol: string;
  baseIncrementPercentage: number;
  baseIntervalTime: number;
  baseTradeAmount: number;
  numTrades: number;
  userId: string;
  clientId: string;
  pricePushRate: number;
  executionVenue: VolumeExecutionVenue;
  postOnlySide?: 'buy' | 'sell';
  executedTrades?: number;
};

type CexVolumeStrategyParams = BaseVolumeStrategyParams & {
  executionVenue: 'cex';
};

type DexVolumeStrategyParams = BaseVolumeStrategyParams & {
  executionVenue: 'dex';
  dexId: DexAdapterId;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  feeTier: number;
  slippageBps?: number;
  recipient?: string;
};

type VolumeStrategyParams = CexVolumeStrategyParams | DexVolumeStrategyParams;

@Injectable()
export class StrategyService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new CustomLogger(StrategyService.name);
  private readonly sessions = new Map<string, StrategyRuntimeSession>();
  private readonly latestIntentsByStrategy = new Map<
    string,
    StrategyOrderIntent[]
  >();

  private generateRunId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository: Repository<StrategyInstance>,
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
    @Optional()
    private readonly strategyIntentExecutionService?: StrategyIntentExecutionService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly quoteExecutorManagerService?: QuoteExecutorManagerService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    private readonly strategyControllerRegistry?: StrategyControllerRegistry,
    @Optional()
    private readonly dexVolumeStrategyService?: DexVolumeStrategyService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register('strategy-service', this, 20);
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('strategy-service');
  }

  async start(): Promise<void> {
    const runningStrategies = await this.getRunningStrategies();
    const nowMs = Date.now();

    for (const strategy of runningStrategies) {
      this.sessions.set(strategy.strategyKey, {
        runId: this.generateRunId(),
        strategyKey: strategy.strategyKey,
        strategyType: strategy.strategyType as StrategyType,
        userId: strategy.userId,
        clientId: strategy.clientId,
        marketMakingOrderId:
          strategy.marketMakingOrderId ||
          (strategy.strategyType === 'pureMarketMaking'
            ? strategy.clientId
            : undefined),
        cadenceMs: this.getCadenceMs(
          strategy.parameters,
          strategy.strategyType,
        ),
        nextRunAtMs: nowMs,
        params: strategy.parameters,
      });
    }
  }

  async stop(): Promise<void> {
    this.sessions.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }

  async onTick(ts: string): Promise<void> {
    const nowMs = Date.now();
    const sessions = [...this.sessions.values()].sort((a, b) =>
      a.strategyKey.localeCompare(b.strategyKey),
    );

    for (const session of sessions) {
      const capturedRunId = session.runId;

      if (session.nextRunAtMs > nowMs) {
        continue;
      }
      const activeSession = this.sessions.get(session.strategyKey);

      if (!activeSession || activeSession.runId !== capturedRunId) {
        continue;
      }

      try {
        await this.runSession(session, ts);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorTrace = error instanceof Error ? error.stack : undefined;

        this.logger.error(
          `onTick runSession failed for strategyKey=${session.strategyKey} ts=${ts}: ${errorMessage}`,
          errorTrace,
        );
      } finally {
        const nextSession = this.sessions.get(session.strategyKey);

        if (nextSession && nextSession.runId === capturedRunId) {
          nextSession.nextRunAtMs += nextSession.cadenceMs;
          this.sessions.set(session.strategyKey, nextSession);
        }
      }
    }
  }

  async getRunningStrategies(): Promise<StrategyInstance[]> {
    return await this.strategyInstanceRepository.find({
      where: { status: 'running' },
    });
  }

  async getAllStrategies(): Promise<StrategyInstance[]> {
    return await this.strategyInstanceRepository.find();
  }

  getSupportedControllerTypes(): StrategyType[] {
    return (
      this.strategyControllerRegistry?.listControllerTypes() || [
        'arbitrage',
        'pureMarketMaking',
        'volume',
      ]
    );
  }

  async getStrategyInstanceKey(strategyKey: string): Promise<StrategyInstance> {
    return await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });
  }

  async rerunStrategy(strategyKey: string): Promise<void> {
    const strategyInstance = await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });

    if (!strategyInstance) {
      throw new Error(`Strategy with key ${strategyKey} not found.`);
    }

    const controller = this.strategyControllerRegistry?.getController(
      strategyInstance.strategyType,
    );

    if (controller) {
      await controller.rerun(strategyInstance, this);

      return;
    }

    if (strategyInstance.strategyType === 'arbitrage') {
      await this.startArbitrageStrategyForUser(
        strategyInstance.parameters as ArbitrageStrategyDto,
        strategyInstance.parameters.checkIntervalSeconds,
        strategyInstance.parameters.maxOpenOrders,
      );

      return;
    }

    if (strategyInstance.strategyType === 'pureMarketMaking') {
      await this.executePureMarketMakingStrategy(
        strategyInstance.parameters as PureMarketMakingStrategyDto,
      );

      return;
    }

    if (strategyInstance.strategyType === 'volume') {
      await this.executeVolumeStrategy(
        strategyInstance.parameters.exchangeName,
        strategyInstance.parameters.symbol,
        strategyInstance.parameters.baseIncrementPercentage,
        strategyInstance.parameters.baseIntervalTime,
        strategyInstance.parameters.baseTradeAmount,
        strategyInstance.parameters.numTrades,
        strategyInstance.parameters.userId,
        strategyInstance.parameters.clientId,
        strategyInstance.parameters.pricePushRate,
        strategyInstance.parameters.postOnlySide,
        strategyInstance.parameters.executionVenue,
        strategyInstance.parameters.dexId,
        strategyInstance.parameters.chainId,
        strategyInstance.parameters.tokenIn,
        strategyInstance.parameters.tokenOut,
        strategyInstance.parameters.feeTier,
        strategyInstance.parameters.slippageBps,
        strategyInstance.parameters.recipient,
      );

      return;
    }

    throw new Error(`Unknown strategy type: ${strategyInstance.strategyType}`);
  }

  async startArbitrageStrategyForUser(
    strategyParamsDto: ArbitrageStrategyDto,
    checkIntervalSeconds: number,
    maxOpenOrders: number,
  ) {
    const { userId, clientId } = strategyParamsDto;
    const strategyKey = createStrategyKey({
      type: 'arbitrage',
      user_id: userId,
      client_id: clientId,
    });

    const cadenceMs = Math.max(1000, Number(checkIntervalSeconds || 10) * 1000);

    await this.upsertStrategyInstance(
      strategyKey,
      userId,
      clientId,
      'arbitrage',
      { ...strategyParamsDto, checkIntervalSeconds, maxOpenOrders },
    );
    this.upsertSession(
      strategyKey,
      'arbitrage',
      userId,
      clientId,
      cadenceMs,
      strategyParamsDto,
    );
  }

  async executePureMarketMakingStrategy(
    strategyParamsDto: PureMarketMakingStrategyDto,
  ) {
    const marketMakingOrderId =
      strategyParamsDto.marketMakingOrderId || strategyParamsDto.clientId;

    if (!marketMakingOrderId) {
      throw new Error(
        'Pure market making strategy requires marketMakingOrderId (or clientId fallback)',
      );
    }

    const strategyKey = createPureMarketMakingStrategyKey(marketMakingOrderId);
    const normalizedParams: PureMarketMakingStrategyDto = {
      ...strategyParamsDto,
      marketMakingOrderId,
      clientId: marketMakingOrderId,
    };

    const cadenceMs = Math.max(1000, Number(normalizedParams.orderRefreshTime));

    await this.upsertStrategyInstance(
      strategyKey,
      normalizedParams.userId,
      marketMakingOrderId,
      'pureMarketMaking',
      normalizedParams,
      marketMakingOrderId,
    );
    this.upsertSession(
      strategyKey,
      'pureMarketMaking',
      normalizedParams.userId,
      marketMakingOrderId,
      cadenceMs,
      normalizedParams,
      marketMakingOrderId,
    );
  }

  async executeMMCycle(strategyParamsDto: PureMarketMakingStrategyDto) {
    const marketMakingOrderId =
      strategyParamsDto.marketMakingOrderId || strategyParamsDto.clientId;

    if (!marketMakingOrderId) {
      throw new Error(
        'Pure market making cycle requires marketMakingOrderId (or clientId fallback)',
      );
    }
    const strategyKey = createPureMarketMakingStrategyKey(marketMakingOrderId);

    const intents = await this.buildPureMarketMakingIntents(
      strategyKey,
      {
        ...strategyParamsDto,
        clientId: marketMakingOrderId,
        marketMakingOrderId,
      },
      getRFC3339Timestamp(),
    );

    await this.publishIntents(strategyKey, intents);
  }

  async executeVolumeStrategy(
    exchangeName: string | undefined,
    symbol: string | undefined,
    baseIncrementPercentage: number,
    baseIntervalTime: number,
    baseTradeAmount: number,
    numTrades: number,
    userId: string,
    clientId: string,
    pricePushRate: number,
    postOnlySide?: 'buy' | 'sell',
    executionVenue: VolumeExecutionVenue = 'cex',
    dexId?: DexAdapterId,
    chainId?: number,
    tokenIn?: string,
    tokenOut?: string,
    feeTier?: number,
    slippageBps?: number,
    recipient?: string,
  ) {
    const strategyKey = createStrategyKey({
      type: 'volume',
      user_id: userId,
      client_id: clientId,
    });

    const params: VolumeStrategyParams =
      executionVenue === 'dex'
        ? this.buildDexVolumeParams({
            exchangeName,
            symbol,
            baseIncrementPercentage,
            baseIntervalTime,
            baseTradeAmount,
            numTrades,
            userId,
            clientId,
            pricePushRate,
            postOnlySide,
            dexId,
            chainId,
            tokenIn,
            tokenOut,
            feeTier,
            slippageBps,
            recipient,
          })
        : this.buildCexVolumeParams({
            exchangeName,
            symbol,
            baseIncrementPercentage,
            baseIntervalTime,
            baseTradeAmount,
            numTrades,
            userId,
            clientId,
            pricePushRate,
            postOnlySide,
          });

    const cadenceMs = Math.max(1000, Number(baseIntervalTime || 10) * 1000);

    await this.upsertStrategyInstance(
      strategyKey,
      userId,
      clientId,
      'volume',
      params,
    );
    this.upsertSession(
      strategyKey,
      'volume',
      userId,
      clientId,
      cadenceMs,
      params,
    );
  }

  async stopStrategyForUser(
    userId: string,
    clientId: string,
    strategyType?: string,
  ) {
    if (!strategyType) {
      return;
    }

    const resolvedStrategyType = strategyType as StrategyType;
    const strategyKey =
      resolvedStrategyType === 'pureMarketMaking'
        ? createPureMarketMakingStrategyKey(clientId)
        : createStrategyKey({
            type: resolvedStrategyType,
            user_id: userId,
            client_id: clientId,
          });

    await this.strategyInstanceRepository.update(
      { strategyKey },
      { status: 'stopped', updatedAt: new Date() },
    );

    this.sessions.delete(strategyKey);

    const stopIntent: StrategyOrderIntent = {
      type: 'STOP_CONTROLLER',
      intentId: `${strategyKey}:${Date.now()}:stop`,
      strategyInstanceId: strategyKey,
      strategyKey,
      userId,
      clientId,
      exchange: '',
      pair: '',
      side: 'buy',
      price: '0',
      qty: '0',
      createdAt: getRFC3339Timestamp(),
      status: 'NEW',
    };

    await this.publishIntents(strategyKey, [stopIntent]);
  }

  async stopMarketMakingStrategyForOrder(
    marketMakingOrderId: string,
    userId = 'system',
  ): Promise<void> {
    if (!marketMakingOrderId) {
      return;
    }
    await this.stopStrategyForUser(
      userId,
      marketMakingOrderId,
      'pureMarketMaking',
    );
  }

  async linkDefinitionToStrategyInstance(
    userId: string,
    clientId: string,
    strategyType: StrategyType,
    definitionId: string,
    definitionVersion = '1.0.0',
    marketMakingOrderId?: string,
  ): Promise<void> {
    const strategyKey =
      strategyType === 'pureMarketMaking'
        ? createPureMarketMakingStrategyKey(marketMakingOrderId || clientId)
        : createStrategyKey({
            type: strategyType,
            user_id: userId,
            client_id: clientId,
          });

    await this.strategyInstanceRepository.update(
      { strategyKey },
      {
        definitionId,
        definitionVersion,
        marketMakingOrderId: marketMakingOrderId || undefined,
        updatedAt: new Date(),
      },
    );
  }

  stopVolumeStrategy(userId: string, clientId: string) {
    return this.stopStrategyForUser(userId, clientId, 'volume');
  }

  async evaluateArbitrageOpportunityVWAP(
    exchangeA: ccxt.Exchange,
    exchangeB: ccxt.Exchange,
    strategyParamsDto: ArbitrageStrategyDto,
  ) {
    const { userId, clientId, pair, amountToTrade, minProfitability } =
      strategyParamsDto;

    const orderBookA = await exchangeA.fetchOrderBook(pair);
    const orderBookB = await exchangeB.fetchOrderBook(pair);

    const vwapA = this.calculateVWAPForAmount(orderBookA, amountToTrade, 'buy');
    const vwapB = this.calculateVWAPForAmount(
      orderBookB,
      amountToTrade,
      'sell',
    );

    if (vwapA.isLessThanOrEqualTo(0) || vwapB.isLessThanOrEqualTo(0)) {
      return;
    }

    const strategyKey = createStrategyKey({
      type: 'arbitrage',
      user_id: userId,
      client_id: clientId,
    });

    const threshold = new BigNumber(minProfitability);
    const intents: StrategyOrderIntent[] = [];
    const ts = getRFC3339Timestamp();

    if (vwapB.minus(vwapA).dividedBy(vwapA).isGreaterThanOrEqualTo(threshold)) {
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeA.id,
          pair,
          'buy',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-buy',
        ),
      );
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeB.id,
          pair,
          'sell',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-sell',
        ),
      );
    }

    if (vwapA.minus(vwapB).dividedBy(vwapB).isGreaterThanOrEqualTo(threshold)) {
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeB.id,
          pair,
          'buy',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-buy',
        ),
      );
      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          exchangeA.id,
          pair,
          'sell',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-sell',
        ),
      );
    }

    if (intents.length > 0) {
      await this.publishIntents(strategyKey, intents);
    }
  }

  public async checkAndCleanFilledOrders(): Promise<boolean> {
    return true;
  }

  getLatestIntentsForStrategy(strategyKey: string): StrategyOrderIntent[] {
    return this.latestIntentsByStrategy.get(strategyKey) || [];
  }

  private upsertSession(
    strategyKey: string,
    strategyType: StrategyType,
    userId: string,
    clientId: string,
    cadenceMs: number,
    params: StrategyRuntimeSession['params'],
    marketMakingOrderId?: string,
  ): void {
    this.sessions.set(strategyKey, {
      runId: this.generateRunId(),
      strategyKey,
      strategyType,
      userId,
      clientId,
      marketMakingOrderId,
      cadenceMs,
      params,
      nextRunAtMs: Date.now(),
    });
  }

  private async upsertStrategyInstance(
    strategyKey: string,
    userId: string,
    clientId: string,
    strategyType: StrategyType,
    parameters: Record<string, any>,
    marketMakingOrderId?: string,
  ): Promise<void> {
    const existing = await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });

    if (existing) {
      await this.strategyInstanceRepository.update(
        { strategyKey },
        {
          status: 'running',
          strategyType,
          parameters,
          marketMakingOrderId: marketMakingOrderId || null,
          updatedAt: new Date(),
        },
      );

      return;
    }

    const instance = this.strategyInstanceRepository.create({
      strategyKey,
      userId,
      clientId,
      strategyType,
      parameters,
      marketMakingOrderId: marketMakingOrderId || null,
      status: 'running',
      startPrice: await this.fetchStartPrice(strategyType, parameters),
    });

    await this.strategyInstanceRepository.save(instance);
  }

  public async fetchStartPrice(
    strategyType: StrategyType,
    parameters: Record<string, any>,
  ): Promise<number> {
    if (strategyType === 'volume') {
      return 0;
    }

    const pair = parameters.pair;
    const exchangeName =
      strategyType === 'pureMarketMaking' && parameters.oracleExchangeName
        ? parameters.oracleExchangeName
        : parameters.exchangeName || parameters.exchangeAName;
    const exchange = this.exchangeInitService.getExchange(exchangeName);
    const ticker = await exchange.fetchTicker(pair);

    return Number(ticker.last || 0);
  }

  public getCadenceMs(
    parameters: Record<string, any>,
    strategyType: string,
  ): number {
    const controller =
      this.strategyControllerRegistry?.getController(strategyType);

    if (controller) {
      return controller.getCadenceMs(parameters, this);
    }

    if (strategyType === 'arbitrage') {
      return Math.max(
        1000,
        Number(parameters?.checkIntervalSeconds || 10) * 1000,
      );
    }

    if (strategyType === 'pureMarketMaking') {
      return Math.max(1000, Number(parameters?.orderRefreshTime || 10000));
    }

    return Math.max(1000, Number(parameters?.baseIntervalTime || 10) * 1000);
  }

  private async runSession(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<void> {
    const controller = this.strategyControllerRegistry?.getController(
      session.strategyType,
    );

    if (controller) {
      await controller.runSession(session, ts, this);

      return;
    }

    if (session.strategyType === 'pureMarketMaking') {
      await this.runPureMarketMakingSession(
        session.strategyKey,
        session.params as PureMarketMakingStrategyDto,
        ts,
      );

      return;
    }

    if (session.strategyType === 'arbitrage') {
      await this.runArbitrageSession(session.params as ArbitrageStrategyDto);

      return;
    }

    if (session.strategyType === 'volume') {
      await this.runVolumeSession(session, ts);

      return;
    }

    throw new Error(`Unknown strategy type: ${session.strategyType}`);
  }

  async runPureMarketMakingSession(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
  ): Promise<void> {
    const intents = await this.buildPureMarketMakingIntents(
      strategyKey,
      params,
      ts,
    );

    await this.publishIntents(strategyKey, intents);
  }

  async runArbitrageSession(params: ArbitrageStrategyDto): Promise<void> {
    const exchangeA = this.exchangeInitService.getExchange(
      params.exchangeAName,
    );
    const exchangeB = this.exchangeInitService.getExchange(
      params.exchangeBName,
    );

    await this.evaluateArbitrageOpportunityVWAP(exchangeA, exchangeB, params);
  }

  async runVolumeSession(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<void> {
    const params = session.params as VolumeStrategyParams;
    const executedTrades = Number(params.executedTrades || 0);
    const activeRunId = session.runId;

    const isSameActiveSession = (
      active: StrategyRuntimeSession | undefined,
    ): active is StrategyRuntimeSession =>
      !!active &&
      active.userId === session.userId &&
      active.clientId === session.clientId &&
      active.strategyType === session.strategyType &&
      active.runId === activeRunId;

    const executeDexVolumeCycle = async (
      strategyKey: string,
      dexParams: DexVolumeStrategyParams,
      executedTradesCount: number,
    ): Promise<boolean> => {
      if (!this.dexVolumeStrategyService) {
        this.logger.error(
          `Dex volume service is not available. Cannot execute ${strategyKey}`,
        );

        return false;
      }

      const side = this.resolveVolumeSide(
        dexParams.postOnlySide,
        executedTradesCount,
      );

      const result = await this.dexVolumeStrategyService.executeCycle({
        dexId: dexParams.dexId,
        chainId: dexParams.chainId,
        tokenIn: dexParams.tokenIn,
        tokenOut: dexParams.tokenOut,
        feeTier: dexParams.feeTier,
        baseTradeAmount: dexParams.baseTradeAmount,
        baseIncrementPercentage: dexParams.baseIncrementPercentage,
        pricePushRate: dexParams.pricePushRate,
        executedTrades: executedTradesCount,
        side,
        slippageBps: dexParams.slippageBps,
        recipient: dexParams.recipient,
      });

      this.logger.log(
        `DEX volume cycle executed for ${strategyKey}: txHash=${result.txHash}, side=${result.side}, amountIn=${result.amountIn}`,
      );

      return true;
    };

    if (executedTrades >= Number(params.numTrades || 0)) {
      const activeBeforeStop = this.sessions.get(session.strategyKey);

      if (!isSameActiveSession(activeBeforeStop)) {
        this.logger.warn(
          `Skipping stale volume stop for ${session.strategyKey}: active session changed`,
        );

        return;
      }

      await this.stopStrategyForUser(
        session.userId,
        session.clientId,
        session.strategyType,
      );

      return;
    }

    let intents: StrategyOrderIntent[] = [];
    let didExecute = false;

    if (params.executionVenue === 'dex') {
      didExecute = await executeDexVolumeCycle(
        session.strategyKey,
        params,
        executedTrades,
      );
    } else {
      intents = await this.buildVolumeIntents(session.strategyKey, params, ts);
      didExecute = intents.length > 0;
    }

    if (!didExecute) {
      return;
    }

    const activeBeforePublish = this.sessions.get(session.strategyKey);

    if (!isSameActiveSession(activeBeforePublish)) {
      this.logger.warn(
        `Skipping stale volume tick before publish for ${session.strategyKey}: active session changed`,
      );

      return;
    }

    if (intents.length > 0) {
      await this.publishIntents(session.strategyKey, intents);
    }

    const nextParams: VolumeStrategyParams = {
      ...params,
      executedTrades: executedTrades + 1,
    };

    const activeBeforePersist = this.sessions.get(session.strategyKey);

    if (!isSameActiveSession(activeBeforePersist)) {
      this.logger.warn(
        `Skipping stale volume tick before persist for ${session.strategyKey}: active session changed`,
      );

      return;
    }

    await this.persistStrategyParams(session.strategyKey, nextParams);

    const currentSession = this.sessions.get(session.strategyKey);

    if (isSameActiveSession(currentSession)) {
      this.sessions.set(session.strategyKey, {
        ...currentSession,
        params: nextParams,
      });
    } else {
      this.logger.warn(
        `Skipping stale volume tick write-back for ${session.strategyKey}: active session changed`,
      );
    }
  }

  private async buildVolumeIntents(
    strategyKey: string,
    params: CexVolumeStrategyParams,
    ts: string,
  ): Promise<StrategyOrderIntent[]> {
    const exchange = this.exchangeInitService.getExchange(params.exchangeName);
    const orderBook = await exchange.fetchOrderBook(params.symbol);
    const bestBid = this.toPositiveNumber(orderBook?.bids?.[0]?.[0]);
    const bestAsk = this.toPositiveNumber(orderBook?.asks?.[0]?.[0]);

    if (bestBid === undefined || bestAsk === undefined) {
      this.logger.warn(
        `Skipping volume cycle for ${strategyKey}: missing best bid/ask on ${params.exchangeName} ${params.symbol}`,
      );

      return [];
    }
    const mid = new BigNumber(bestBid).plus(bestAsk).dividedBy(2);
    const pushMultiplier = new BigNumber(1).plus(
      new BigNumber(params.pricePushRate || 0)
        .dividedBy(100)
        .multipliedBy(Number(params.executedTrades || 0)),
    );
    const basePrice = mid.multipliedBy(pushMultiplier);
    const offsetMultiplier = new BigNumber(
      params.baseIncrementPercentage || 0,
    ).dividedBy(100);

    const side = this.resolveVolumeSide(
      params.postOnlySide,
      Number(params.executedTrades || 0),
    );
    const price =
      side === 'buy'
        ? basePrice.multipliedBy(new BigNumber(1).minus(offsetMultiplier))
        : basePrice.multipliedBy(new BigNumber(1).plus(offsetMultiplier));
    const qty = new BigNumber(params.baseTradeAmount);

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping volume cycle for ${strategyKey}: invalid non-positive price ${price.toFixed()} (executedTrades=${
          params.executedTrades || 0
        }, params=${JSON.stringify({
          exchangeName: params.exchangeName,
          symbol: params.symbol,
          baseIncrementPercentage: params.baseIncrementPercentage,
          pricePushRate: params.pricePushRate,
        })})`,
      );

      return [];
    }

    if (!qty.isFinite() || qty.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping volume cycle for ${strategyKey}: invalid qty ${params.baseTradeAmount}`,
      );

      return [];
    }

    return [
      this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        exchange.id,
        params.symbol,
        side,
        price,
        qty,
        ts,
        `volume-${params.executedTrades || 0}`,
      ),
    ];
  }

  private async buildPureMarketMakingIntents(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
  ): Promise<StrategyOrderIntent[]> {
    const intents: StrategyOrderIntent[] = [];
    const exchange = this.exchangeInitService.getExchange(params.exchangeName);
    const priceExchange = params.oracleExchangeName
      ? this.exchangeInitService.getExchange(params.oracleExchangeName)
      : exchange;
    let priceSource: BigNumber;

    try {
      priceSource = new BigNumber(
        await this.getPriceSource(
          priceExchange,
          params.pair,
          params.priceSourceType,
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Skipping cycle for ${strategyKey}: cannot resolve price source for ${params.exchangeName} ${params.pair} (${error.message})`,
      );

      return intents;
    }

    if (!priceSource.isFinite() || priceSource.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping cycle for ${strategyKey}: invalid price source ${priceSource.toFixed()} for ${
          params.exchangeName
        } ${params.pair}`,
      );

      return intents;
    }

    const openOrders =
      this.exchangeOrderTrackerService?.getOpenOrders(strategyKey) || [];
    const existingOpenOrdersBySide = {
      buy: openOrders.filter((order) => order.side === 'buy').length,
      sell: openOrders.filter((order) => order.side === 'sell').length,
    };

    const quotes = this.quoteExecutorManagerService
      ? this.quoteExecutorManagerService.buildQuotes({
          midPrice: priceSource.toFixed(),
          numberOfLayers: params.numberOfLayers,
          bidSpread: params.bidSpread,
          askSpread: params.askSpread,
          orderAmount: new BigNumber(params.orderAmount).toFixed(),
          amountChangePerLayer: params.amountChangePerLayer,
          amountChangeType: params.amountChangeType,
          inventorySkewFactor: Number(params.inventorySkewFactor || 0),
          inventoryTargetBaseRatio: Number(
            params.inventoryTargetBaseRatio || 0.5,
          ),
          currentBaseRatio: Number(params.currentBaseRatio || 0.5),
          makerHeavyMode: Boolean(params.makerHeavyMode),
          makerHeavyBiasBps: Number(params.makerHeavyBiasBps || 0),
          hangingOrdersEnabled: Boolean(params.hangingOrdersEnabled),
          existingOpenOrdersBySide,
        })
      : this.buildLegacyQuotes(params, priceSource);

    for (const quote of quotes) {
      if (!quote.shouldCreate) {
        continue;
      }
      const quotePrice = new BigNumber(quote.price);

      if (
        quote.side === 'buy' &&
        params.ceilingPrice !== undefined &&
        priceSource.isGreaterThan(params.ceilingPrice)
      ) {
        continue;
      }
      if (
        quote.side === 'sell' &&
        params.floorPrice !== undefined &&
        priceSource.isLessThan(params.floorPrice)
      ) {
        continue;
      }

      intents.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          params.userId,
          params.clientId,
          exchange.id,
          params.pair,
          quote.side,
          quotePrice,
          new BigNumber(quote.qty),
          ts,
          `mm-layer-${quote.layer}-${quote.side}`,
        ),
      );
    }

    return intents;
  }

  private buildLegacyQuotes(
    params: PureMarketMakingStrategyDto,
    priceSource: BigNumber,
  ): Array<{
    layer: number;
    side: 'buy' | 'sell';
    price: string;
    qty: string;
    shouldCreate: boolean;
  }> {
    const quotes: Array<{
      layer: number;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
      shouldCreate: boolean;
    }> = [];

    let currentOrderAmount = new BigNumber(params.orderAmount);

    for (let layer = 1; layer <= params.numberOfLayers; layer++) {
      if (layer > 1) {
        if (params.amountChangeType === 'fixed') {
          currentOrderAmount = currentOrderAmount.plus(
            params.amountChangePerLayer,
          );
        } else {
          currentOrderAmount = currentOrderAmount.plus(
            currentOrderAmount.multipliedBy(
              new BigNumber(params.amountChangePerLayer).dividedBy(100),
            ),
          );
        }
      }

      const layerBidSpread = new BigNumber(params.bidSpread).multipliedBy(
        layer,
      );
      const layerAskSpread = new BigNumber(params.askSpread).multipliedBy(
        layer,
      );
      const buyPrice = priceSource.multipliedBy(
        new BigNumber(1).minus(layerBidSpread),
      );
      const sellPrice = priceSource.multipliedBy(
        new BigNumber(1).plus(layerAskSpread),
      );

      quotes.push({
        layer,
        side: 'buy',
        price: buyPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
        shouldCreate: true,
      });
      quotes.push({
        layer,
        side: 'sell',
        price: sellPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
        shouldCreate: true,
      });
    }

    return quotes;
  }

  private createIntent(
    strategyInstanceId: string,
    strategyKey: string,
    userId: string,
    clientId: string,
    exchange: string,
    pair: string,
    side: 'buy' | 'sell',
    price: BigNumber,
    qty: BigNumber,
    ts: string,
    suffix: string,
  ): StrategyOrderIntent {
    return {
      type: 'CREATE_LIMIT_ORDER',
      intentId: `${strategyKey}:${ts}:${suffix}`,
      strategyInstanceId,
      strategyKey,
      userId,
      clientId,
      exchange,
      pair,
      side,
      price: price.toFixed(),
      qty: qty.toFixed(),
      createdAt: ts,
      status: 'NEW',
    };
  }

  private async publishIntents(
    strategyKey: string,
    intents: StrategyOrderIntent[],
  ): Promise<void> {
    if (intents.length === 0) {
      return;
    }

    this.latestIntentsByStrategy.set(strategyKey, intents);
    for (const intent of intents) {
      await this.strategyIntentStoreService?.upsertIntent(intent);
    }

    const intentExecutionDriver = String(
      this.configService?.get('strategy.intent_execution_driver', 'worker') ||
        'worker',
    ).toLowerCase();

    if (intentExecutionDriver === 'sync') {
      await this.strategyIntentExecutionService?.consumeIntents(intents);
    }

    this.logger.log(
      `Published ${intents.length} intents for ${strategyKey} (driver=${intentExecutionDriver})`,
    );
  }

  private async getPriceSource(
    exchange: ccxt.Exchange,
    pair: string,
    priceSourceType: PriceSourceType,
  ): Promise<number> {
    const orderBook = await exchange.fetchOrderBook(pair);
    const bestBid = this.toPositiveNumber(orderBook?.bids?.[0]?.[0]);
    const bestAsk = this.toPositiveNumber(orderBook?.asks?.[0]?.[0]);

    if (priceSourceType === PriceSourceType.MID_PRICE) {
      if (bestBid !== undefined && bestAsk !== undefined) {
        return new BigNumber(bestBid).plus(bestAsk).dividedBy(2).toNumber();
      }
    }

    if (priceSourceType === PriceSourceType.BEST_BID) {
      if (bestBid !== undefined) {
        return Number(bestBid);
      }
    }

    if (priceSourceType === PriceSourceType.BEST_ASK) {
      if (bestAsk !== undefined) {
        return Number(bestAsk);
      }
    }

    const ticker = await exchange.fetchTicker(pair);
    const fallbackPrice =
      this.toPositiveNumber(ticker?.last) ??
      this.toPositiveNumber(ticker?.bid) ??
      this.toPositiveNumber(ticker?.ask);

    if (fallbackPrice !== undefined) {
      return fallbackPrice;
    }

    throw new Error('no usable price in order book or ticker');
  }

  private calculateVWAPForAmount(
    orderBook: ccxt.OrderBook,
    amountToTrade: number,
    direction: 'buy' | 'sell',
  ): BigNumber {
    let volumeAccumulated = new BigNumber(0);
    let volumePriceProductSum = new BigNumber(0);
    const amountToTradeBn = new BigNumber(amountToTrade);
    const orders =
      direction === 'buy'
        ? Array.isArray(orderBook?.asks)
          ? orderBook.asks
          : []
        : Array.isArray(orderBook?.bids)
        ? orderBook.bids
        : [];

    for (const [price, volume] of orders) {
      const volumeToUse = BigNumber.min(
        new BigNumber(volume),
        amountToTradeBn.minus(volumeAccumulated),
      );

      volumePriceProductSum = volumePriceProductSum.plus(
        new BigNumber(price).multipliedBy(volumeToUse),
      );
      volumeAccumulated = volumeAccumulated.plus(volumeToUse);

      if (volumeAccumulated.isGreaterThanOrEqualTo(amountToTradeBn)) {
        break;
      }
    }

    if (volumeAccumulated.isLessThanOrEqualTo(0)) {
      return new BigNumber(0);
    }

    return volumePriceProductSum.dividedBy(volumeAccumulated);
  }

  private resolveVolumeSide(
    postOnlySide: 'buy' | 'sell' | undefined,
    executedTrades: number,
  ): 'buy' | 'sell' {
    if (postOnlySide) {
      return postOnlySide;
    }

    return executedTrades % 2 === 0 ? 'buy' : 'sell';
  }

  private buildCexVolumeParams(input: {
    exchangeName: string | undefined;
    symbol: string | undefined;
    baseIncrementPercentage: number;
    baseIntervalTime: number;
    baseTradeAmount: number;
    numTrades: number;
    userId: string;
    clientId: string;
    pricePushRate: number;
    postOnlySide?: 'buy' | 'sell';
  }): CexVolumeStrategyParams {
    const exchangeName = String(input.exchangeName || '').trim();
    const symbol = String(input.symbol || '').trim();

    if (!exchangeName) {
      throw new Error('exchangeName is required for cex volume strategy');
    }
    if (!symbol) {
      throw new Error('symbol is required for cex volume strategy');
    }

    return {
      executionVenue: 'cex',
      exchangeName,
      symbol,
      baseIncrementPercentage: input.baseIncrementPercentage,
      baseIntervalTime: input.baseIntervalTime,
      baseTradeAmount: input.baseTradeAmount,
      numTrades: input.numTrades,
      userId: input.userId,
      clientId: input.clientId,
      pricePushRate: input.pricePushRate,
      postOnlySide: input.postOnlySide,
      executedTrades: 0,
    };
  }

  private buildDexVolumeParams(input: {
    exchangeName: string | undefined;
    symbol: string | undefined;
    baseIncrementPercentage: number;
    baseIntervalTime: number;
    baseTradeAmount: number;
    numTrades: number;
    userId: string;
    clientId: string;
    pricePushRate: number;
    postOnlySide?: 'buy' | 'sell';
    dexId?: DexAdapterId;
    chainId?: number;
    tokenIn?: string;
    tokenOut?: string;
    feeTier?: number;
    slippageBps?: number;
    recipient?: string;
  }): DexVolumeStrategyParams {
    if (!input.dexId) {
      throw new Error('dexId is required for dex volume strategy');
    }
    if (!Number.isFinite(input.chainId) || Number(input.chainId) <= 0) {
      throw new Error(
        'chainId must be a positive number for dex volume strategy',
      );
    }

    const tokenIn = String(input.tokenIn || '').trim();
    const tokenOut = String(input.tokenOut || '').trim();

    if (!tokenIn || !tokenOut) {
      throw new Error(
        'tokenIn and tokenOut are required for dex volume strategy',
      );
    }
    if (!Number.isFinite(input.feeTier) || Number(input.feeTier) <= 0) {
      throw new Error(
        'feeTier must be a positive number for dex volume strategy',
      );
    }

    const syntheticSymbol =
      String(input.symbol || '').trim() || `${tokenIn}/${tokenOut}`;

    return {
      executionVenue: 'dex',
      exchangeName: String(input.exchangeName || input.dexId),
      symbol: syntheticSymbol,
      baseIncrementPercentage: input.baseIncrementPercentage,
      baseIntervalTime: input.baseIntervalTime,
      baseTradeAmount: input.baseTradeAmount,
      numTrades: input.numTrades,
      userId: input.userId,
      clientId: input.clientId,
      pricePushRate: input.pricePushRate,
      postOnlySide: input.postOnlySide,
      executedTrades: 0,
      dexId: input.dexId,
      chainId: Number(input.chainId),
      tokenIn,
      tokenOut,
      feeTier: Number(input.feeTier),
      slippageBps: input.slippageBps,
      recipient: input.recipient,
    };
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }

  private async persistStrategyParams(
    strategyKey: string,
    params: VolumeStrategyParams,
  ): Promise<void> {
    await this.strategyInstanceRepository.update(
      { strategyKey },
      {
        parameters: params as Record<string, any>,
        updatedAt: new Date(),
      },
    );
  }
}

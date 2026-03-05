/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
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
import { ExecutorAction } from './executor-action.types';
import { ExecutorOrchestratorService } from './executor-orchestrator.service';
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
import {
  normalizeExecutionCategory,
  StrategyExecutionCategory,
} from './strategy-execution-category';
import { StrategyOrderIntent } from './strategy-intent.types';
import { StrategyMarketDataProviderService } from './strategy-market-data-provider.service';

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
  executionCategory: StrategyExecutionCategory;
  executionVenue?: VolumeExecutionVenue;
  postOnlySide?: 'buy' | 'sell';
  executedTrades?: number;
};

type CexVolumeStrategyParams = BaseVolumeStrategyParams & {
  executionCategory: 'clob_cex' | 'clob_dex';
};

type AmmDexVolumeStrategyParams = BaseVolumeStrategyParams & {
  executionCategory: 'amm_dex';
  executionVenue: 'dex';
  dexId: DexAdapterId;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  feeTier: number;
  slippageBps?: number;
  recipient?: string;
};

type VolumeStrategyParams =
  | CexVolumeStrategyParams
  | AmmDexVolumeStrategyParams;

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
    private readonly quoteExecutorManagerService?: QuoteExecutorManagerService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly strategyControllerRegistry?: StrategyControllerRegistry,
    @Optional()
    private readonly executorOrchestratorService?: ExecutorOrchestratorService,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
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

    throw new Error(
      `Strategy controller for type ${strategyInstance.strategyType} is not registered`,
    );
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

    const actions = await this.buildPureMarketMakingActions(
      strategyKey,
      {
        ...strategyParamsDto,
        clientId: marketMakingOrderId,
        marketMakingOrderId,
      },
      getRFC3339Timestamp(),
    );

    await this.publishIntents(strategyKey, actions);
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
    executionCategoryInput?: string,
  ) {
    const strategyKey = createStrategyKey({
      type: 'volume',
      user_id: userId,
      client_id: clientId,
    });

    const executionCategory = normalizeExecutionCategory(
      executionCategoryInput || executionVenue,
    );

    if (executionCategory === 'clob_dex') {
      throw new Error(
        'executionCategory clob_dex is not implemented yet. Use clob_cex or amm_dex',
      );
    }

    const params: VolumeStrategyParams =
      executionCategory === 'amm_dex'
        ? this.buildAmmDexVolumeParams({
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
        : this.buildClobVolumeParams({
            executionCategory,
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

  async buildArbitrageActions(
    strategyKey: string,
    strategyParamsDto: ArbitrageStrategyDto,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const { userId, clientId, pair, amountToTrade, minProfitability } =
      strategyParamsDto;

    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    const orderBookA =
      await this.strategyMarketDataProviderService.getOrderBook(
        strategyParamsDto.exchangeAName,
        pair,
      );
    const orderBookB =
      await this.strategyMarketDataProviderService.getOrderBook(
        strategyParamsDto.exchangeBName,
        pair,
      );

    const vwapA = this.calculateVWAPForAmount(orderBookA, amountToTrade, 'buy');
    const vwapB = this.calculateVWAPForAmount(
      orderBookB,
      amountToTrade,
      'sell',
    );

    if (vwapA.isLessThanOrEqualTo(0) || vwapB.isLessThanOrEqualTo(0)) {
      return [];
    }

    const threshold = new BigNumber(minProfitability);
    const actions: ExecutorAction[] = [];
    const executionCategory =
      String(
        (strategyParamsDto as any).executionCategory || '',
      ).toLowerCase() === 'clob_dex'
        ? 'clob_dex'
        : 'clob_cex';

    if (vwapB.minus(vwapA).dividedBy(vwapA).isGreaterThanOrEqualTo(threshold)) {
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeAName,
          pair,
          'buy',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-buy',
          executionCategory,
        ),
      );
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeBName,
          pair,
          'sell',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-sell',
          executionCategory,
        ),
      );
    }

    if (vwapA.minus(vwapB).dividedBy(vwapB).isGreaterThanOrEqualTo(threshold)) {
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeBName,
          pair,
          'buy',
          vwapB,
          new BigNumber(amountToTrade),
          ts,
          'arb-b-buy',
          executionCategory,
        ),
      );
      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          userId,
          clientId,
          strategyParamsDto.exchangeAName,
          pair,
          'sell',
          vwapA,
          new BigNumber(amountToTrade),
          ts,
          'arb-a-sell',
          executionCategory,
        ),
      );
    }

    return actions;
  }

  async evaluateArbitrageOpportunityVWAP(
    strategyParamsDto: ArbitrageStrategyDto,
  ) {
    const strategyKey = createStrategyKey({
      type: 'arbitrage',
      user_id: strategyParamsDto.userId,
      client_id: strategyParamsDto.clientId,
    });

    const actions = await this.buildArbitrageActions(
      strategyKey,
      strategyParamsDto,
      getRFC3339Timestamp(),
    );

    if (actions.length > 0) {
      await this.publishIntents(strategyKey, actions);
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
      const venue = String(parameters.executionVenue || '').toLowerCase();
      const category = String(parameters.executionCategory || '').toLowerCase();

      if (venue === 'dex' || category === 'amm_dex') {
        return 0;
      }

      const referenceExchange = String(parameters.exchangeName || '').trim();
      const referencePair = String(parameters.symbol || '').trim();

      if (
        this.strategyMarketDataProviderService &&
        referenceExchange &&
        referencePair
      ) {
        try {
          const ref =
            await this.strategyMarketDataProviderService.getReferencePrice(
              referenceExchange,
              referencePair,
              PriceSourceType.MID_PRICE,
            );

          return Number(ref || 0);
        } catch {
          return 0;
        }
      }

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

    throw new Error(
      `Strategy controller for type ${strategyType} is not registered`,
    );
  }

  private async runSession(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<void> {
    const controller = this.strategyControllerRegistry?.getController(
      session.strategyType,
    );

    if (controller) {
      const actions = await controller.decideActions(session, ts, this);

      if (actions.length > 0) {
        await this.publishIntents(session.strategyKey, actions);

        if (typeof controller.onActionsPublished === 'function') {
          await controller.onActionsPublished(session, actions, this);
        }
      }

      return;
    }

    throw new Error(
      `Strategy controller for type ${session.strategyType} is not registered`,
    );
  }

  async buildVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const params = session.params as VolumeStrategyParams;
    const executedTrades = Number(params.executedTrades || 0);

    if (executedTrades >= Number(params.numTrades || 0)) {
      const activeBeforeStop = this.sessions.get(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        this.logger.warn(
          `Skipping stale volume stop for ${session.strategyKey}: active session changed`,
        );

        return [];
      }

      await this.stopStrategyForUser(
        session.userId,
        session.clientId,
        session.strategyType,
      );

      return [];
    }

    if (params.executionCategory === 'amm_dex') {
      const side = this.resolveVolumeSide(params.postOnlySide, executedTrades);
      const amountIn = this.computeAmmAmountIn(params, executedTrades);

      return [
        {
          type: 'EXECUTE_AMM_SWAP',
          intentId: `${session.strategyKey}:${ts}:amm-${executedTrades}`,
          strategyInstanceId: session.strategyKey,
          strategyKey: session.strategyKey,
          userId: session.userId,
          clientId: session.clientId,
          exchange: params.exchangeName,
          pair: params.symbol,
          side,
          price: '0',
          qty: amountIn,
          executionCategory: 'amm_dex',
          metadata: {
            dexId: params.dexId,
            chainId: params.chainId,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            feeTier: params.feeTier,
            baseTradeAmount: params.baseTradeAmount,
            baseIncrementPercentage: params.baseIncrementPercentage,
            pricePushRate: params.pricePushRate,
            executedTrades,
            slippageBps: params.slippageBps,
            recipient: params.recipient,
          },
          createdAt: ts,
          status: 'NEW',
        },
      ];
    }

    return await this.buildVolumeActions(session.strategyKey, params, ts);
  }

  async onVolumeActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
  ): Promise<void> {
    if (actions.length === 0) {
      return;
    }

    const activeBeforePersist = this.sessions.get(session.strategyKey);

    if (!this.isSameActiveSession(activeBeforePersist, session)) {
      this.logger.warn(
        `Skipping stale volume tick before persist for ${session.strategyKey}: active session changed`,
      );

      return;
    }

    const params = activeBeforePersist.params as VolumeStrategyParams;
    const nextParams: VolumeStrategyParams = {
      ...params,
      executedTrades: Number(params.executedTrades || 0) + 1,
    };

    await this.persistStrategyParams(session.strategyKey, nextParams);

    const currentSession = this.sessions.get(session.strategyKey);

    if (this.isSameActiveSession(currentSession, session)) {
      this.sessions.set(session.strategyKey, {
        ...currentSession,
        params: nextParams,
      });

      return;
    }

    this.logger.warn(
      `Skipping stale volume tick write-back for ${session.strategyKey}: active session changed`,
    );
  }

  private isSameActiveSession(
    active: StrategyRuntimeSession | undefined,
    expected: StrategyRuntimeSession,
  ): active is StrategyRuntimeSession {
    return (
      !!active &&
      active.userId === expected.userId &&
      active.clientId === expected.clientId &&
      active.strategyType === expected.strategyType &&
      active.runId === expected.runId
    );
  }

  async buildVolumeActions(
    strategyKey: string,
    params: CexVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    const { bestBid, bestAsk } =
      await this.strategyMarketDataProviderService.getBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

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
        params.exchangeName,
        params.symbol,
        side,
        price,
        qty,
        ts,
        `volume-${params.executedTrades || 0}`,
        params.executionCategory,
      ),
    ];
  }

  async buildPureMarketMakingActions(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const actions: ExecutorAction[] = [];
    const priceExchange = params.oracleExchangeName
      ? params.oracleExchangeName
      : params.exchangeName;
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

      return actions;
    }

    if (!priceSource.isFinite() || priceSource.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping cycle for ${strategyKey}: invalid price source ${priceSource.toFixed()} for ${
          params.exchangeName
        } ${params.pair}`,
      );

      return actions;
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

      actions.push(
        this.createIntent(
          strategyKey,
          strategyKey,
          params.userId,
          params.clientId,
          params.exchangeName,
          params.pair,
          quote.side,
          quotePrice,
          new BigNumber(quote.qty),
          ts,
          `mm-layer-${quote.layer}-${quote.side}`,
          'clob_cex',
        ),
      );
    }

    return actions;
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
    executionCategory?: StrategyExecutionCategory,
    metadata?: Record<string, unknown>,
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
      executionCategory,
      metadata,
      createdAt: ts,
      status: 'NEW',
    };
  }

  private async publishIntents(
    strategyKey: string,
    intents: ExecutorAction[],
  ): Promise<void> {
    if (intents.length === 0) {
      return;
    }

    const publishedIntents =
      await this.executorOrchestratorService?.dispatchActions(
        strategyKey,
        intents as ExecutorAction[],
      );

    if (publishedIntents && publishedIntents.length > 0) {
      this.latestIntentsByStrategy.set(strategyKey, publishedIntents);

      return;
    }

    throw new Error('executor orchestrator did not publish intents');
  }

  private async getPriceSource(
    exchangeName: string,
    pair: string,
    priceSourceType: PriceSourceType,
  ): Promise<number> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    return await this.strategyMarketDataProviderService.getReferencePrice(
      exchangeName,
      pair,
      priceSourceType,
    );
  }

  private calculateVWAPForAmount(
    orderBook: {
      bids?: Array<[number, number]>;
      asks?: Array<[number, number]>;
    },
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

  private computeAmmAmountIn(
    params: AmmDexVolumeStrategyParams,
    executedTrades: number,
  ): string {
    const baseAmount = new BigNumber(params.baseTradeAmount || 0);

    if (!baseAmount.isFinite() || baseAmount.isLessThanOrEqualTo(0)) {
      return '0';
    }

    const pushMultiplier = new BigNumber(1).plus(
      new BigNumber(params.pricePushRate || 0)
        .dividedBy(100)
        .multipliedBy(executedTrades),
    );
    const incrementMultiplier = new BigNumber(1).plus(
      new BigNumber(params.baseIncrementPercentage || 0).dividedBy(100),
    );

    return baseAmount
      .multipliedBy(pushMultiplier)
      .multipliedBy(incrementMultiplier)
      .toFixed();
  }

  private buildClobVolumeParams(input: {
    executionCategory: 'clob_cex' | 'clob_dex';
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
      executionCategory: input.executionCategory,
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

  private buildAmmDexVolumeParams(input: {
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
  }): AmmDexVolumeStrategyParams {
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
      executionCategory: 'amm_dex',
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

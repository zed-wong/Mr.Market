/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  StrategyInstance,
  type StrategyInstanceDefinitionSnapshot,
} from 'src/common/entities/market-making/strategy-instances.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import {
  createPureMarketMakingStrategyKey,
  createStrategyKey,
} from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { TrackedOrderShutdownService } from '../../trackers/tracked-order-shutdown.service';
import { ExecutorAction } from '../config/executor-action.types';
import {
  ArbitrageStrategyDto,
  DexAdapterId,
  ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ExecuteDualAccountVolumeStrategyDto,
  ExecuteEfficientDualAccountVolumeStrategyDto,
  PureMarketMakingStrategyDto,
  VolumeExecutionVenue,
} from '../config/strategy.dto';
import {
  StrategyRuntimeSession,
  type StrategyType,
} from '../config/strategy-controller.types';
import { normalizeExecutionCategory } from '../config/strategy-execution-category';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import type {
  ConnectorHealthStatus,
  VolumeStrategyParams,
} from '../config/strategy-params.types';
import { TimeIndicatorStrategyDto } from '../config/timeIndicator.dto';
import { PureMarketMakingStrategyController } from '../controllers/pure-market-making-strategy.controller';
import { VolumeStrategyController } from '../controllers/volume-strategy.controller';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import * as dualAccountConfig from '../dual-account/dual-account-config';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { AdaptivePmmStateService } from '../pmm/adaptive-pmm-state.service';
import { QuotePlannerService } from '../quote/quote-planner.service';
import { StrategyStartupRecoveryService } from '../recovery/strategy-startup-recovery.service';
import {
  StrategySessionRegistryCallbacks,
  StrategySessionRegistryService,
} from './strategy-session-registry.service';

@Injectable()
export class StrategyInstanceLifecycleService {
  private readonly stoppingStrategyKeys = new Set<string>();

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository: Repository<StrategyInstance>,
    @Optional()
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository?: Repository<MarketMakingOrder>,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly trackedOrderShutdownService?: TrackedOrderShutdownService,
    @Optional()
    private readonly strategySessionRegistryService?: StrategySessionRegistryService,
    @Optional()
    private readonly quotePlannerService?: QuotePlannerService,
    @Optional()
    private readonly adaptivePmmStateService?: AdaptivePmmStateService,
    @Optional()
    private readonly volumeStrategyController?: VolumeStrategyController,
    @Optional()
    private readonly strategyStartupRecoveryService?: StrategyStartupRecoveryService,
  ) {}

  isStrategyStopping(strategyKey: string): boolean {
    return this.stoppingStrategyKeys.has(strategyKey);
  }

  async getRunningStrategies(
    logger: Pick<CustomLogger, 'warn'>,
  ): Promise<StrategyInstance[]> {
    const runningStrategies = await this.strategyInstanceRepository.find({
      where: { status: 'running' },
    });
    const eligibleStrategies: StrategyInstance[] = [];

    for (const strategy of runningStrategies) {
      if (await this.isStrategyRuntimeEligible(strategy, logger)) {
        eligibleStrategies.push(strategy);
        continue;
      }

      await this.strategyInstanceRepository.update(
        { strategyKey: strategy.strategyKey },
        { status: 'stopped', updatedAt: getRFC3339Timestamp() },
      );
      logger.warn(
        `Skipping stale strategy restore for ${strategy.strategyKey}: bound market-making order is not running`,
      );
    }

    return eligibleStrategies;
  }

  private async isStrategyRuntimeEligible(
    strategy: StrategyInstance,
    logger: Pick<CustomLogger, 'warn'>,
  ): Promise<boolean> {
    if (strategy.status !== 'running') {
      return false;
    }

    const orderId = String(strategy.marketMakingOrderId || '').trim();

    if (!orderId) {
      const isLegacyDualAdminDirect =
        (strategy.strategyType === 'dualAccountVolume' ||
          strategy.strategyType === 'dualAccountBestCapacityVolume') &&
        String(strategy.userId || '').trim() === 'admin-direct';

      if (isLegacyDualAdminDirect) {
        await this.strategyInstanceRepository.update(
          { strategyKey: strategy.strategyKey },
          { status: 'failed', updatedAt: getRFC3339Timestamp() },
        );
        logger.warn(
          `Skipping orphan admin-direct dual-account strategy ${strategy.strategyKey}: missing marketMakingOrderId binding`,
        );

        return false;
      }
    }

    if (!orderId || !this.marketMakingOrderRepository) {
      return true;
    }

    const marketMakingOrder = await this.marketMakingOrderRepository.findOne({
      where: { orderId },
    });

    return marketMakingOrder?.state === 'running';
  }

  async upsertStrategyInstance(
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
          updatedAt: getRFC3339Timestamp(),
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

  async rollbackFailedStrategyStart(
    strategyKey: string,
    userId: string,
    clientId: string,
  ): Promise<void> {
    this.strategySessionRegistry.pendingActivationStrategies.delete(
      strategyKey,
    );

    const activeSession =
      this.strategySessionRegistry.sessions.get(strategyKey);

    await this.removeSession(strategyKey, activeSession);
    await this.trackedOrderShutdownService?.cancelTrackedOrdersForStrategy(
      strategyKey,
    );
    await this.strategyIntentStoreService?.cancelPendingIntents(
      strategyKey,
      'strategy start failed before session activation',
    );
    this.strategyIntentStoreService?.clearLatestIntentsForStrategy(strategyKey);

    const instance = await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });

    if (!instance) {
      return;
    }

    const hasOrderBinding = String(instance.marketMakingOrderId || '').trim();
    const matchesCaller =
      String(instance.userId || '').trim() === String(userId || '').trim() &&
      String(instance.clientId || '').trim() === String(clientId || '').trim();

    if (!hasOrderBinding && matchesCaller) {
      await this.strategyInstanceRepository.delete({ strategyKey });

      return;
    }

    await this.strategyInstanceRepository.update(
      { strategyKey },
      { status: 'failed', updatedAt: getRFC3339Timestamp() },
    );
  }

  async startArbitrageStrategyForUser(
    strategyParamsDto: ArbitrageStrategyDto,
    checkIntervalSeconds: number,
    maxOpenOrders: number,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
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
    await this.upsertSession(
      strategyKey,
      'arbitrage',
      userId,
      clientId,
      cadenceMs,
      strategyParamsDto as unknown as StrategyRuntimeSession['params'],
      callbacks,
    );
  }

  async executePureMarketMakingStrategy(
    strategyParamsDto: PureMarketMakingStrategyDto,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
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
    await this.upsertSession(
      strategyKey,
      'pureMarketMaking',
      normalizedParams.userId,
      marketMakingOrderId,
      cadenceMs,
      normalizedParams as unknown as StrategyRuntimeSession['params'],
      callbacks,
      marketMakingOrderId,
    );
  }

  async executeMMCycle(
    strategyParamsDto: PureMarketMakingStrategyDto,
    controller: PureMarketMakingStrategyController,
    runtime: {
      getSession: (key: string) => StrategyRuntimeSession | undefined;
      setSession: (key: string, session: StrategyRuntimeSession) => void;
      getConnectorHealthStatus: (exchange: string) => ConnectorHealthStatus;
      setConnectorHealthStatus: (
        exchange: string,
        status: ConnectorHealthStatus,
      ) => void;
      stopStrategyForUser: (
        userId: string,
        clientId: string,
        strategyType?: string,
      ) => Promise<void>;
      publishIntents: (
        strategyKey: string,
        intents: ExecutorAction[],
      ) => Promise<void>;
      logger: CustomLogger;
    },
  ): Promise<void> {
    const marketMakingOrderId =
      strategyParamsDto.marketMakingOrderId || strategyParamsDto.clientId;

    if (!marketMakingOrderId) {
      throw new Error(
        'Pure market making cycle requires marketMakingOrderId (or clientId fallback)',
      );
    }

    const strategyKey = createPureMarketMakingStrategyKey(marketMakingOrderId);
    const actions = await controller.buildPureMarketMakingActions(
      strategyKey,
      {
        ...strategyParamsDto,
        clientId: marketMakingOrderId,
        marketMakingOrderId,
      },
      getRFC3339Timestamp(),
      {
        getSession: runtime.getSession,
        setSession: runtime.setSession,
        getConnectorHealthStatus: runtime.getConnectorHealthStatus,
        setConnectorHealthStatus: runtime.setConnectorHealthStatus,
        stopStrategyForUser: runtime.stopStrategyForUser,
        logger: runtime.logger,
      },
    );

    await runtime.publishIntents(strategyKey, actions);
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
    postOnlySide: 'buy' | 'sell' | undefined,
    executionVenue: VolumeExecutionVenue,
    dexId: DexAdapterId | undefined,
    chainId: number | undefined,
    tokenIn: string | undefined,
    tokenOut: string | undefined,
    feeTier: number | undefined,
    slippageBps: number | undefined,
    recipient: string | undefined,
    executionCategoryInput: string | undefined,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
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

    const controller = this.getVolumeStrategyController();
    const params: VolumeStrategyParams =
      executionCategory === 'amm_dex'
        ? controller.buildAmmDexVolumeParams({
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
        : controller.buildClobVolumeParams({
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
    await this.upsertSession(
      strategyKey,
      'volume',
      userId,
      clientId,
      cadenceMs,
      params,
      callbacks,
    );
  }

  async executeDualAccountVolumeStrategy(
    params: ExecuteDualAccountVolumeStrategyDto,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
    const normalizedParams =
      dualAccountConfig.normalizeDualAccountStrategyParams(params);
    const strategyKey = createStrategyKey({
      type: 'dualAccountVolume',
      user_id: params.userId,
      client_id: params.clientId,
    });
    const cadenceMs =
      dualAccountConfig.resolveNextDualAccountCadenceMs(normalizedParams);

    await this.upsertStrategyInstance(
      strategyKey,
      params.userId,
      params.clientId,
      'dualAccountVolume',
      normalizedParams,
      params.marketMakingOrderId || params.clientId,
    );
    try {
      await this.upsertSession(
        strategyKey,
        'dualAccountVolume',
        params.userId,
        params.clientId,
        cadenceMs,
        normalizedParams,
        callbacks,
        params.marketMakingOrderId || params.clientId,
      );
    } catch (error) {
      await this.rollbackFailedStrategyStart(
        strategyKey,
        params.userId,
        params.clientId,
      );
      throw error;
    }
  }

  async executeDualAccountBestCapacityVolumeStrategy(
    params: ExecuteDualAccountBestCapacityVolumeStrategyDto,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
    const normalizedParams =
      dualAccountConfig.normalizeDualAccountBestCapacityStrategyParams(params);
    const strategyKey = createStrategyKey({
      type: 'dualAccountBestCapacityVolume',
      user_id: params.userId,
      client_id: params.clientId,
    });
    const cadenceMs =
      dualAccountConfig.resolveNextDualAccountCadenceMs(normalizedParams);

    await this.upsertStrategyInstance(
      strategyKey,
      params.userId,
      params.clientId,
      'dualAccountBestCapacityVolume',
      normalizedParams,
      params.marketMakingOrderId || params.clientId,
    );
    try {
      await this.upsertSession(
        strategyKey,
        'dualAccountBestCapacityVolume',
        params.userId,
        params.clientId,
        cadenceMs,
        normalizedParams,
        callbacks,
        params.marketMakingOrderId || params.clientId,
      );
    } catch (error) {
      await this.rollbackFailedStrategyStart(
        strategyKey,
        params.userId,
        params.clientId,
      );
      throw error;
    }
  }

  async executeEfficientDualAccountVolumeStrategy(
    params: ExecuteEfficientDualAccountVolumeStrategyDto,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
    const normalizedParams =
      dualAccountConfig.normalizeEfficientDualAccountVolumeStrategyParams(
        params,
      );
    const strategyKey = createStrategyKey({
      type: 'efficientDualAccountVolume',
      user_id: params.userId,
      client_id: params.clientId,
    });
    const cadenceMs =
      dualAccountConfig.resolveNextDualAccountCadenceMs(normalizedParams);

    await this.upsertStrategyInstance(
      strategyKey,
      params.userId,
      params.clientId,
      'efficientDualAccountVolume',
      normalizedParams,
      params.marketMakingOrderId || params.clientId,
    );
    try {
      await this.upsertSession(
        strategyKey,
        'efficientDualAccountVolume',
        params.userId,
        params.clientId,
        cadenceMs,
        normalizedParams,
        callbacks,
        params.marketMakingOrderId || params.clientId,
      );
    } catch (error) {
      await this.rollbackFailedStrategyStart(
        strategyKey,
        params.userId,
        params.clientId,
      );
      throw error;
    }
  }

  async executeTimeIndicatorStrategy(
    params: TimeIndicatorStrategyDto,
    callbacks: StrategySessionRegistryCallbacks,
  ): Promise<void> {
    const { userId, clientId } = params;
    const strategyKey = createStrategyKey({
      type: 'timeIndicator',
      user_id: userId,
      client_id: clientId,
    });
    const cadenceMs = Math.max(1000, Number(params.tickIntervalMs || 60000));

    await this.upsertStrategyInstance(
      strategyKey,
      userId,
      clientId,
      'timeIndicator',
      params,
    );
    await this.upsertSession(
      strategyKey,
      'timeIndicator',
      userId,
      clientId,
      cadenceMs,
      params as unknown as StrategyRuntimeSession['params'],
      callbacks,
    );
  }

  async activateStrategyFromPersistence(
    strategy: StrategyInstance,
    nextRunAtMs: number,
    logger: CustomLogger,
    getCadenceMs: (
      parameters: Record<string, any>,
      strategyType: string,
    ) => number,
    upsertSession: (
      strategyKey: string,
      strategyType: StrategyType,
      userId: string,
      clientId: string,
      cadenceMs: number,
      params: StrategyRuntimeSession['params'],
      marketMakingOrderId?: string,
      nextRunAtMs?: number,
      runId?: string,
    ) => Promise<StrategyRuntimeSession>,
  ): Promise<void> {
    try {
      const recoveryResult =
        (await this.strategyStartupRecoveryService?.restoreRuntimeStateForStrategy(
          strategy,
        )) || {
          success: true,
          blockedReasons: [],
        };

      if (!recoveryResult.success) {
        await this.strategyInstanceRepository.update(
          { strategyKey: strategy.strategyKey },
          {
            status: 'failed',
            updatedAt: getRFC3339Timestamp(),
          },
        );
        logger.warn(
          `Blocked startup for ${
            strategy.strategyKey
          }: ${recoveryResult.blockedReasons.join('; ')}`,
        );

        return;
      }

      await upsertSession(
        strategy.strategyKey,
        strategy.strategyType as StrategyType,
        strategy.userId,
        strategy.clientId,
        getCadenceMs(strategy.parameters, strategy.strategyType),
        strategy.parameters,
        strategy.marketMakingOrderId ||
          (strategy.strategyType === 'pureMarketMaking'
            ? strategy.clientId
            : undefined),
        nextRunAtMs,
        this.generateRunId(),
      );
    } catch (error) {
      await this.rollbackFailedStrategyStart(
        strategy.strategyKey,
        strategy.userId,
        strategy.clientId,
      );
      throw error;
    }
  }

  async fetchStartPrice(
    strategyType: StrategyType,
    parameters: Record<string, any>,
  ): Promise<number> {
    if (
      strategyType === 'volume' ||
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume' ||
      strategyType === 'efficientDualAccountVolume'
    ) {
      const venue = String(parameters.executionVenue || '').toLowerCase();
      const category = String(parameters.executionCategory || '').toLowerCase();

      if (venue === 'dex' || category === 'amm_dex') {
        return 0;
      }

      const referenceExchange = String(parameters.exchangeName || '').trim();
      const referencePair = dualAccountConfig.resolveRuntimePair(
        parameters as VolumeStrategyParams,
      );

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

  async stopStrategyForUser(
    userId: string,
    clientId: string,
    strategyType: string | undefined,
    publishIntents: (
      strategyKey: string,
      intents: StrategyOrderIntent[],
    ) => Promise<void>,
  ): Promise<void> {
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

    this.stoppingStrategyKeys.add(strategyKey);

    try {
      await this.strategyInstanceRepository.update(
        { strategyKey },
        { status: 'stopped', updatedAt: getRFC3339Timestamp() },
      );
      this.strategySessionRegistry.pendingActivationStrategies.delete(
        strategyKey,
      );

      const activeSession =
        this.strategySessionRegistry.sessions.get(strategyKey);

      await this.trackedOrderShutdownService?.cancelTrackedOrdersForStrategy(
        strategyKey,
      );

      await this.removeSession(strategyKey, activeSession);
      await this.strategyIntentStoreService?.cancelPendingIntents(
        strategyKey,
        'strategy stopped before intent execution',
      );

      const stopIntent: StrategyOrderIntent = {
        type: 'STOP_CONTROLLER',
        intentId: `${strategyKey}:${Date.now()}:stop`,
        runtimeInstanceKey: strategyKey,
        strategyKey,
        userId,
        clientId,
        exchange: '',
        pair: '',
        side: 'buy',
        price: '0',
        qty: '0',
        createdAt: getRFC3339Timestamp(),
        status: 'CANCELLED',
        metadata: {
          reason: 'strategy stopped',
        },
      };

      await publishIntents(strategyKey, [stopIntent]);
      this.strategyIntentStoreService?.clearLatestIntentsForStrategy(
        strategyKey,
      );
    } finally {
      this.stoppingStrategyKeys.delete(strategyKey);
    }
  }

  async stopMarketMakingStrategyForOrder(
    marketMakingOrderId: string,
    userId: string | undefined,
    publishIntents: (
      strategyKey: string,
      intents: StrategyOrderIntent[],
    ) => Promise<void>,
  ): Promise<void> {
    if (!marketMakingOrderId) {
      return;
    }

    await this.stopStrategyForUser(
      userId || 'system',
      marketMakingOrderId,
      'pureMarketMaking',
      publishIntents,
    );
  }

  async linkDefinitionToStrategyInstance(
    userId: string,
    clientId: string,
    strategyType: StrategyType,
    strategyDefinitionId: string,
    marketMakingOrderId?: string,
    strategyDefinitionSnapshot?: StrategyInstanceDefinitionSnapshot,
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
        strategyDefinitionId,
        strategyDefinitionSnapshot,
        marketMakingOrderId: marketMakingOrderId || undefined,
        updatedAt: getRFC3339Timestamp(),
      },
    );
  }

  async cancelAllRunningStrategies(reason: string): Promise<void> {
    for (const session of [...this.strategySessionRegistry.sessions.values()]) {
      this.stoppingStrategyKeys.add(session.strategyKey);

      try {
        await this.strategyInstanceRepository.update(
          { strategyKey: session.strategyKey },
          { status: 'stopped', updatedAt: getRFC3339Timestamp() },
        );

        if (
          session.strategyType === 'pureMarketMaking' ||
          session.strategyType === 'dualAccountVolume' ||
          session.strategyType === 'dualAccountBestCapacityVolume' ||
          session.strategyType === 'efficientDualAccountVolume'
        ) {
          await this.trackedOrderShutdownService?.cancelTrackedOrdersForStrategy(
            session.strategyKey,
          );
          await this.trackedOrderShutdownService?.forceTrackedOrdersTerminal(
            session.strategyKey,
          );
        }

        await this.strategyIntentStoreService?.cancelPendingIntents(
          session.strategyKey,
          `strategy stopped during ${reason}`,
        );
        await this.strategySessionRegistry.detachSessionFromExecutor(session);
      } finally {
        this.stoppingStrategyKeys.delete(session.strategyKey);
      }
    }
  }

  private get strategySessionRegistry(): StrategySessionRegistryService {
    if (!this.strategySessionRegistryService) {
      throw new Error('StrategySessionRegistryService is not available');
    }

    return this.strategySessionRegistryService;
  }

  private getVolumeStrategyController(): VolumeStrategyController {
    if (!this.volumeStrategyController) {
      throw new Error('volume strategy controller is not available');
    }

    return this.volumeStrategyController;
  }

  private async upsertSession(
    strategyKey: string,
    strategyType: StrategyType,
    userId: string,
    clientId: string,
    cadenceMs: number,
    params: StrategyRuntimeSession['params'],
    callbacks: StrategySessionRegistryCallbacks,
    marketMakingOrderId?: string,
    nextRunAtMs = Date.now(),
    runId = this.generateRunId(),
  ): Promise<StrategyRuntimeSession> {
    return await this.strategySessionRegistry.upsertSession(
      strategyKey,
      strategyType,
      userId,
      clientId,
      cadenceMs,
      params,
      callbacks,
      marketMakingOrderId,
      nextRunAtMs,
      runId,
    );
  }

  private generateRunId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async removeSession(
    strategyKey: string,
    session = this.strategySessionRegistry.sessions.get(strategyKey),
  ): Promise<void> {
    await this.strategySessionRegistry.removeSession(strategyKey, session);
    this.quotePlannerService?.clearStrategyState(strategyKey);
    this.adaptivePmmStateService?.clearStrategyState(strategyKey);
  }
}

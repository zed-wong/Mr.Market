/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  StrategyInstance,
  type StrategyInstanceDefinitionSnapshot,
} from 'src/common/entities/market-making/strategy-instances.entity';
import { createStrategyKey } from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';
import { TickComponent } from '../tick/tick-component.interface';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { ExecutorAction } from './config/executor-action.types';
import {
  ArbitrageStrategyDto,
  DexAdapterId,
  ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ExecuteDualAccountVolumeStrategyDto,
  ExecuteEfficientDualAccountVolumeStrategyDto,
  PureMarketMakingStrategyDto,
  VolumeExecutionVenue,
} from './config/strategy.dto';
import type {
  StrategyRuntimeSession,
  StrategyType,
} from './config/strategy-controller.types';
import { StrategyOrderIntent } from './config/strategy-intent.types';
import type { ConnectorHealthStatus } from './config/strategy-params.types';
import { TimeIndicatorStrategyDto } from './config/timeIndicator.dto';
import { ArbitrageStrategyController } from './controllers/arbitrage-strategy.controller';
import { PureMarketMakingStrategyController } from './controllers/pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { ExchangePairExecutorSession } from './execution/exchange-pair-executor';
import { ExecutorRegistry } from './execution/executor-registry';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from './intent/quote-executor-manager.service';
import { PmmMarkoutEvaluatorService } from './observation/pmm-markout-evaluator.service';
import { RuntimeObservationService } from './observation/runtime-observation.service';
import { StrategyInstanceLifecycleService } from './runtime/strategy-instance-lifecycle.service';
import { StrategySessionRegistryService } from './runtime/strategy-session-registry.service';
import { StrategyWatcherManagerService } from './runtime/strategy-watcher-manager.service';
import {
  FillSettlementService,
  SettlementFill,
} from './settlement/fill-settlement.service';

@Injectable()
export class StrategyService
  implements
    TickComponent,
    OnModuleInit,
    OnModuleDestroy,
    OnApplicationShutdown
{
  private readonly logger = new CustomLogger(StrategyService.name);
  private exchangeOrderTrackerService?: ExchangeOrderTrackerService;
  private quoteExecutorManagerService?: QuoteExecutorManagerService;
  private pmmMarkoutEvaluatorService?: PmmMarkoutEvaluatorService;
  private runtimeObservationService?: RuntimeObservationService;
  private detachExchangeReadyListener?: () => void;

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
    private readonly strategyControllerRegistry?: StrategyControllerRegistry,
    @Optional()
    private readonly executorOrchestratorService?: ExecutorOrchestratorService,
    @Optional()
    private readonly executorRegistry?: ExecutorRegistry,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
    @Optional()
    private readonly fillSettlementService?: FillSettlementService,
    @Optional()
    private readonly strategyWatcherManagerService?: StrategyWatcherManagerService,
    @Optional()
    private readonly arbitrageStrategyController?: ArbitrageStrategyController,
    @Optional()
    private readonly pureMarketMakingStrategyController?: PureMarketMakingStrategyController,
    @Optional()
    private readonly strategySessionRegistryService?: StrategySessionRegistryService,
    @Optional()
    private readonly strategyInstanceLifecycleService?: StrategyInstanceLifecycleService,
  ) {}

  private get strategySessionRegistry(): StrategySessionRegistryService {
    if (!this.strategySessionRegistryService) {
      throw new Error('StrategySessionRegistryService is not available');
    }

    return this.strategySessionRegistryService;
  }

  private get sessions(): Map<string, StrategyRuntimeSession> {
    return this.strategySessionRegistry.sessions;
  }

  private get strategyInstanceLifecycle(): StrategyInstanceLifecycleService {
    if (!this.strategyInstanceLifecycleService) {
      throw new Error('StrategyInstanceLifecycleService is not available');
    }

    return this.strategyInstanceLifecycleService;
  }

  private getSessionRegistryCallbacks() {
    return {
      runSession: async (session: ExchangePairExecutorSession, ts: string) => {
        await this.runSession(session, ts);
      },
      handleSessionFill: async (
        session: StrategyRuntimeSession,
        fill: SettlementFill,
      ) => {
        await this.fillSettlementService?.handleSessionFill(session, fill);
      },
      logSessionTickError: (
        strategyKey: string,
        ts: string,
        error: unknown,
      ) => {
        this.logSessionTickError(strategyKey, ts, error);
      },
      activateStrategyFromPersistence: async (
        strategy: StrategyInstance,
        nextRunAtMs: number,
      ) => {
        await this.activateStrategyFromPersistence(strategy, nextRunAtMs);
      },
    };
  }

  private getPureMarketMakingStrategyController(): PureMarketMakingStrategyController {
    if (!this.pureMarketMakingStrategyController) {
      throw new Error(
        'pure market-making strategy controller is not available',
      );
    }

    if (this.quoteExecutorManagerService) {
      (
        this.pureMarketMakingStrategyController as any
      ).quoteExecutorManagerService = this.quoteExecutorManagerService;
    }
    if (this.exchangeOrderTrackerService) {
      (
        this.pureMarketMakingStrategyController as any
      ).exchangeOrderTrackerService = this.exchangeOrderTrackerService;
    }
    if (this.pmmMarkoutEvaluatorService) {
      (
        this.pureMarketMakingStrategyController as any
      ).pmmMarkoutEvaluatorService = this.pmmMarkoutEvaluatorService;
    }
    if (this.runtimeObservationService) {
      (
        this.pureMarketMakingStrategyController as any
      ).runtimeObservationService = this.runtimeObservationService;
    }

    return this.pureMarketMakingStrategyController;
  }

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register('strategy-service', this, 20);
    this.detachExchangeReadyListener = this.exchangeInitService.onExchangeReady(
      (exchangeName, accountLabel) =>
        this.activatePendingStrategiesForExchange(exchangeName, accountLabel),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('strategy-service');
    this.detachExchangeReadyListener?.();
    this.detachExchangeReadyListener = undefined;
  }

  async start(): Promise<void> {
    const runningStrategies = await this.getRunningStrategies();
    const nowMs = Date.now();

    for (const strategy of runningStrategies) {
      await this.restoreOrQueueStrategy(strategy, nowMs);
    }
  }

  async stop(): Promise<void> {
    await this.cancelAllRunningStrategies('service stop');
    this.strategySessionRegistry.clear();
    this.executorRegistry?.clear();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    await this.cancelAllRunningStrategies(signal || 'shutdown');
  }

  async health(): Promise<boolean> {
    return true;
  }

  getConnectorHealthStatus(exchange: string): ConnectorHealthStatus {
    return this.strategySessionRegistry.getConnectorHealthStatus(exchange);
  }

  async onTick(ts: string): Promise<void> {
    await this.onTickForPooledExecutors(ts);
  }

  async routeFillForExchangePair(
    exchange: string,
    pair: string,
    fill: {
      orderId?: string;
      exchangeOrderId?: string | null;
      clientOrderId?: string | null;
      accountLabel?: string | null;
      fillId?: string | null;
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
      cumulativeQty?: string;
      feeAmount?: string;
      feeAsset?: string;
      receivedAt?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    const executor = this.executorRegistry?.getExecutor(exchange, pair);

    if (!executor) {
      return false;
    }

    await executor.onFill(fill);

    return true;
  }

  private async onTickForPooledExecutors(ts: string): Promise<void> {
    const executors = this.executorRegistry?.getActiveExecutors() || [];
    const strategyTickStartedAtMs = Date.now();

    await Promise.all(
      executors.map(async (executor) => {
        const executorStartedAtMs = Date.now();
        const activeSessionCount = executor.getActiveSessions().length;
        const dueSessionCount =
          executor.getDueSessionCount(executorStartedAtMs);

        try {
          await executor.onTick(ts);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorTrace = error instanceof Error ? error.stack : undefined;

          this.logger.error(
            `onTick executor failed for exchange=${executor.exchange} pair=${executor.pair} ts=${ts}: ${errorMessage}`,
            errorTrace,
          );
        } finally {
          this.runtimeTimingService?.recordDuration(
            'strategy.executor.tick',
            Date.now() - executorStartedAtMs,
            {
              activeSessionCount,
              dueSessionCount,
              exchange: executor.exchange,
              pair: executor.pair,
              tickTs: ts,
            },
            { warnThresholdMs: 250 },
          );
        }
      }),
    );

    this.runtimeTimingService?.recordDuration(
      'strategy.tick',
      Date.now() - strategyTickStartedAtMs,
      {
        executorCount: executors.length,
        tickTs: ts,
      },
      { warnThresholdMs: 500 },
    );
  }

  async getRunningStrategies(): Promise<StrategyInstance[]> {
    return await this.strategyInstanceLifecycle.getRunningStrategies(
      this.logger,
    );
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
    await this.strategyInstanceLifecycle.startArbitrageStrategyForUser(
      strategyParamsDto,
      checkIntervalSeconds,
      maxOpenOrders,
      this.getSessionRegistryCallbacks(),
    );
  }

  async executePureMarketMakingStrategy(
    strategyParamsDto: PureMarketMakingStrategyDto,
  ) {
    await this.strategyInstanceLifecycle.executePureMarketMakingStrategy(
      strategyParamsDto,
      this.getSessionRegistryCallbacks(),
    );
  }

  async executeMMCycle(strategyParamsDto: PureMarketMakingStrategyDto) {
    await this.strategyInstanceLifecycle.executeMMCycle(
      strategyParamsDto,
      this.getPureMarketMakingStrategyController(),
      {
        getSession: (key) => this.sessions.get(key),
        setSession: (key, session) => this.sessions.set(key, session),
        getConnectorHealthStatus: (exchange) =>
          this.getConnectorHealthStatus(exchange),
        setConnectorHealthStatus: (exchange, status) =>
          this.setConnectorHealthStatus(exchange, status),
        stopStrategyForUser: (userId, clientId, strategyType) =>
          this.stopStrategyForUser(userId, clientId, strategyType),
        publishIntents: (strategyKey, intents) =>
          this.publishIntents(strategyKey, intents),
        logger: this.logger,
      },
    );
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
    await this.strategyInstanceLifecycle.executeVolumeStrategy(
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
      executionVenue,
      dexId,
      chainId,
      tokenIn,
      tokenOut,
      feeTier,
      slippageBps,
      recipient,
      executionCategoryInput,
      this.getSessionRegistryCallbacks(),
    );
  }

  async executeDualAccountVolumeStrategy(
    params: ExecuteDualAccountVolumeStrategyDto,
  ): Promise<void> {
    await this.strategyInstanceLifecycle.executeDualAccountVolumeStrategy(
      params,
      this.getSessionRegistryCallbacks(),
    );
  }

  async executeDualAccountBestCapacityVolumeStrategy(
    params: ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ): Promise<void> {
    await this.strategyInstanceLifecycle.executeDualAccountBestCapacityVolumeStrategy(
      params,
      this.getSessionRegistryCallbacks(),
    );
  }

  async executeEfficientDualAccountVolumeStrategy(
    params: ExecuteEfficientDualAccountVolumeStrategyDto,
  ): Promise<void> {
    await this.strategyInstanceLifecycle.executeEfficientDualAccountVolumeStrategy(
      params,
      this.getSessionRegistryCallbacks(),
    );
  }

  async stopStrategyForUser(
    userId: string,
    clientId: string,
    strategyType?: string,
  ) {
    await this.strategyInstanceLifecycle.stopStrategyForUser(
      userId,
      clientId,
      strategyType,
      (strategyKey, intents) => this.publishIntents(strategyKey, intents),
    );
  }

  async stopMarketMakingStrategyForOrder(
    marketMakingOrderId: string,
    userId = 'system',
  ): Promise<void> {
    await this.strategyInstanceLifecycle.stopMarketMakingStrategyForOrder(
      marketMakingOrderId,
      userId,
      (strategyKey, intents) => this.publishIntents(strategyKey, intents),
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
    await this.strategyInstanceLifecycle.linkDefinitionToStrategyInstance(
      userId,
      clientId,
      strategyType,
      strategyDefinitionId,
      marketMakingOrderId,
      strategyDefinitionSnapshot,
    );
  }

  stopVolumeStrategy(userId: string, clientId: string) {
    return this.stopStrategyForUser(userId, clientId, 'volume');
  }

  async evaluateArbitrageOpportunityVWAP(
    strategyParamsDto: ArbitrageStrategyDto,
  ) {
    const strategyKey = createStrategyKey({
      type: 'arbitrage',
      user_id: strategyParamsDto.userId,
      client_id: strategyParamsDto.clientId,
    });

    if (!this.arbitrageStrategyController) {
      throw new Error('arbitrage strategy controller is not available');
    }

    const actions =
      await this.arbitrageStrategyController.buildArbitrageActions(
        strategyKey,
        strategyParamsDto,
        getRFC3339Timestamp(),
      );

    if (actions.length > 0) {
      await this.publishIntents(strategyKey, actions);
    }
  }

  getLatestIntentsForStrategy(strategyKey: string): StrategyOrderIntent[] {
    return (
      this.strategyIntentStoreService?.getLatestIntentsForStrategy(
        strategyKey,
      ) || []
    );
  }

  clearIntentsForStrategy(strategyKey: string): void {
    this.strategyIntentStoreService?.clearLatestIntentsForStrategy(strategyKey);
  }

  private async upsertSession(
    strategyKey: string,
    strategyType: StrategyType,
    userId: string,
    clientId: string,
    cadenceMs: number,
    params: StrategyRuntimeSession['params'],
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
      this.getSessionRegistryCallbacks(),
      marketMakingOrderId,
      nextRunAtMs,
      runId,
    );
  }

  private async restoreOrQueueStrategy(
    strategy: StrategyInstance,
    nextRunAtMs: number,
  ): Promise<void> {
    await this.strategySessionRegistry.restoreOrQueueStrategy(
      strategy,
      nextRunAtMs,
      this.getSessionRegistryCallbacks(),
    );
  }
  private async activatePendingStrategiesForExchange(
    exchangeName: string,
    accountLabel: string,
  ): Promise<void> {
    await this.strategySessionRegistry.activatePendingStrategiesForExchange(
      exchangeName,
      accountLabel,
      this.getSessionRegistryCallbacks(),
    );
  }

  private async activateStrategyFromPersistence(
    strategy: StrategyInstance,
    nextRunAtMs: number,
  ): Promise<void> {
    await this.strategyInstanceLifecycle.activateStrategyFromPersistence(
      strategy,
      nextRunAtMs,
      this.logger,
      (parameters, strategyType) => this.getCadenceMs(parameters, strategyType),
      (...args) => this.upsertSession(...args),
    );
  }

  public async fetchStartPrice(
    strategyType: StrategyType,
    parameters: Record<string, any>,
  ): Promise<number> {
    return await this.strategyInstanceLifecycle.fetchStartPrice(
      strategyType,
      parameters,
    );
  }

  public getCadenceMs(
    parameters: Record<string, any>,
    strategyType: string,
  ): number {
    const controller =
      this.strategyControllerRegistry?.getController(strategyType);

    if (controller) {
      return controller.getCadenceMs(parameters);
    }

    throw new Error(
      `Strategy controller for type ${strategyType} is not registered`,
    );
  }

  private async runSession(
    session: ExchangePairExecutorSession,
    ts: string,
  ): Promise<void> {
    const startedAtMs = Date.now();

    try {
      const controller = this.strategyControllerRegistry?.getController(
        session.strategyType,
      );

      if (controller) {
        const actions = await controller.decideActions({
          session,
          ts,
          stopStrategyForUser: (userId, clientId, strategyType) =>
            this.stopStrategyForUser(userId, clientId, strategyType),
        });

        if (actions.length > 0) {
          await this.publishIntents(session.strategyKey, actions);

          if (typeof controller.onActionsPublished === 'function') {
            await controller.onActionsPublished(
              {
                session,
                ts,
                stopStrategyForUser: (userId, clientId, strategyType) =>
                  this.stopStrategyForUser(userId, clientId, strategyType),
              },
              actions,
            );
          }
        }

        return;
      }

      throw new Error(
        `Strategy controller for type ${session.strategyType} is not registered`,
      );
    } finally {
      this.runtimeTimingService?.recordDuration(
        'strategy.session.tick',
        Date.now() - startedAtMs,
        {
          accountLabel: session.accountLabel || 'default',
          exchange: session.exchange,
          pair: session.pair,
          strategyKey: session.strategyKey,
          strategyType: session.strategyType,
          tickTs: ts,
        },
        { warnThresholdMs: 200 },
      );
    }
  }

  private async publishIntents(
    strategyKey: string,
    intents: ExecutorAction[],
  ): Promise<void> {
    if (intents.length === 0) {
      return;
    }

    if (
      this.strategyInstanceLifecycle.isStrategyStopping(strategyKey) &&
      intents.some((intent) => intent.type !== 'STOP_CONTROLLER')
    ) {
      return;
    }

    if (!this.strategyIntentStoreService || !this.executorOrchestratorService) {
      throw new Error('strategy intent publisher is not available');
    }

    await this.strategyIntentStoreService.publishIntents(
      strategyKey,
      intents,
      (dispatchStrategyKey, dispatchIntents) =>
        this.executorOrchestratorService!.dispatchActions(
          dispatchStrategyKey,
          dispatchIntents,
        ),
    );
  }
  // ========== Time Indicator Strategy ==========

  async executeTimeIndicatorStrategy(
    params: TimeIndicatorStrategyDto,
  ): Promise<void> {
    await this.strategyInstanceLifecycle.executeTimeIndicatorStrategy(
      params,
      this.getSessionRegistryCallbacks(),
    );
  }

  private async removeSession(
    strategyKey: string,
    session = this.sessions.get(strategyKey),
  ): Promise<void> {
    await this.strategyInstanceLifecycle.removeSession(strategyKey, session);
  }

  private logSessionTickError(
    strategyKey: string,
    ts: string,
    error: unknown,
  ): void {
    const session = this.sessions.get(strategyKey);
    const exchange =
      session?.strategyType === 'pureMarketMaking'
        ? this.readString(
            (session.params as unknown as PureMarketMakingStrategyDto)
              .exchangeName,
          )
        : '';

    if (exchange) {
      this.setConnectorHealthStatus(exchange, 'DEGRADED');
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorTrace = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      `onTick runSession failed for strategyKey=${strategyKey} ts=${ts}: ${errorMessage}`,
      errorTrace,
    );
  }

  private setConnectorHealthStatus(
    exchange: string,
    status: ConnectorHealthStatus,
  ): void {
    this.strategySessionRegistry.setConnectorHealthStatus(exchange, status);
  }

  private async cancelAllRunningStrategies(reason: string): Promise<void> {
    await this.strategyInstanceLifecycle.cancelAllRunningStrategies(reason);
  }
  private readString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return fallback;
  }
}

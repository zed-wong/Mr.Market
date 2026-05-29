/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
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

import { OrderScopedBalanceQueryService } from '../balance-state/order-scoped-balance-query.service';
import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from '../execution/exchange-order-mapping.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { KillSwitchService } from '../risk/kill-switch.service';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';
import { TickComponent } from '../tick/tick-component.interface';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from '../trackers/exchange-order-tracker.service';
import { OrderBookIngestionService } from '../trackers/order-book-ingestion.service';
import { UserStreamIngestionService } from '../trackers/user-stream-ingestion.service';
import { ExecutorAction } from './config/executor-action.types';
import {
  ArbitrageStrategyDto,
  DexAdapterId,
  ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ExecuteDualAccountVolumeStrategyDto,
  PureMarketMakingStrategyDto,
  VolumeExecutionVenue,
} from './config/strategy.dto';
import type {
  StrategyRuntimeSession,
  StrategyType,
} from './config/strategy-controller.types';
import {
  normalizeExecutionCategory,
  StrategyExecutionCategory,
} from './config/strategy-execution-category';
import { StrategyOrderIntent } from './config/strategy-intent.types';
import type {
  CexVolumeStrategyParams,
  ConnectorHealthStatus,
  DualAccountActiveCycleState,
  DualAccountBalanceSnapshot,
  DualAccountBehaviorProfile,
  DualAccountBestCapacityCandidate,
  DualAccountExecutionPlan,
  DualAccountPairBalances,
  DualAccountRebalanceCandidate,
  DualAccountResolvedAccounts,
  DualAccountTradeabilityPlan,
  DualAccountVolumeStrategyParams,
  PooledExecutorTarget,
  VolumeStrategyParams,
} from './config/strategy-params.types';
import { TimeIndicatorStrategyDto } from './config/timeIndicator.dto';
import { ArbitrageStrategyController } from './controllers/arbitrage-strategy.controller';
import { PureMarketMakingStrategyController } from './controllers/pure-market-making-strategy.controller';
import { VolumeStrategyController } from './controllers/volume-strategy.controller';
import {
  calcCross,
  calcEma,
  calcRsi,
  safePct,
} from './controllers/indicators/technical-indicators';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import {
  AdaptivePmmSignalSnapshot,
  StrategyMarketDataProviderService,
} from './data/strategy-market-data-provider.service';
import * as dualAccountConfig from './dual-account/dual-account-config';
import {
  DualAccountCapacityDiagnostics,
  DualAccountPlannerService,
} from './dual-account/dual-account-planner.service';
import { ExchangePairExecutorSession } from './execution/exchange-pair-executor';
import { ExecutorRegistry } from './execution/executor-registry';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from './intent/quote-executor-manager.service';
import { PmmMarkoutEvaluatorService } from './observation/pmm-markout-evaluator.service';
import {
  RuntimeObservationService,
  StrategyRuntimePressureSnapshot,
} from './observation/runtime-observation.service';
import { AdaptivePmmStateService } from './pmm/adaptive-pmm-state.service';
import { QuotePlannerService } from './quote/quote-planner.service';
import { StrategyStartupRecoveryService } from './recovery/strategy-startup-recovery.service';
import { StrategyWatcherManagerService } from './runtime/strategy-watcher-manager.service';
import { FillSettlementService } from './settlement/fill-settlement.service';

@Injectable()
export class StrategyService
  implements
    TickComponent,
    OnModuleInit,
    OnModuleDestroy,
    OnApplicationShutdown
{
  private readonly logger = new CustomLogger(StrategyService.name);
  private readonly sessions = new Map<string, StrategyRuntimeSession>();
  private readonly pendingActivationStrategies = new Map<
    string,
    StrategyInstance
  >();
  private readonly stoppingStrategyKeys = new Set<string>();
  private readonly loggedDualAccountBestCapacityIgnoredConfigWarnings =
    new Set<string>();
  private readonly connectorHealthByExchange = new Map<
    string,
    ConnectorHealthStatus
  >();
  private detachExchangeReadyListener?: () => void;

  private generateRunId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository: Repository<StrategyInstance>,
    @Optional()
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository?: Repository<MarketMakingOrder>,
    @Optional()
    @InjectRepository(StrategyExecutionHistory)
    private readonly strategyExecutionHistoryRepository?: Repository<StrategyExecutionHistory>,
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
    @Optional()
    private readonly executorRegistry?: ExecutorRegistry,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly orderBookIngestionService?: OrderBookIngestionService,
    @Optional()
    private readonly userStreamIngestionService?: UserStreamIngestionService,
    @Optional()
    private readonly balanceLedgerService?: BalanceLedgerService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly exchangeOrderMappingService?: ExchangeOrderMappingService,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
    @Optional()
    private readonly fillSettlementService?: FillSettlementService,
    @Optional()
    private readonly pmmMarkoutEvaluatorService?: PmmMarkoutEvaluatorService,
    @Optional()
    private readonly runtimeObservationService?: RuntimeObservationService,
    @Optional()
    private readonly strategyStartupRecoveryService?: StrategyStartupRecoveryService,
    @Optional()
    private readonly killSwitchService?: KillSwitchService,
    @Optional()
    private readonly strategyWatcherManagerService?: StrategyWatcherManagerService,
    @Optional()
    private readonly orderScopedBalanceQueryService?: OrderScopedBalanceQueryService,
    @Optional()
    private readonly quotePlannerService?: QuotePlannerService,
    @Optional()
    private readonly arbitrageStrategyController?: ArbitrageStrategyController,
    @Optional()
    private readonly volumeStrategyController?: VolumeStrategyController,
    @Optional()
    private readonly dualAccountPlannerService?: DualAccountPlannerService,
    @Optional()
    private readonly adaptivePmmStateService?: AdaptivePmmStateService,
    @Optional()
    private readonly pureMarketMakingStrategyController?: PureMarketMakingStrategyController,
  ) {}

  private getQuotePlanner(): QuotePlannerService {
    if (!this.quotePlannerService) {
      throw new Error('QuotePlannerService is not available');
    }

    return this.quotePlannerService;
  }

  private getAdaptivePmmState(): AdaptivePmmStateService {
    if (!this.adaptivePmmStateService) {
      throw new Error('AdaptivePmmStateService is not available');
    }

    return this.adaptivePmmStateService;
  }

  private get adaptivePmmWarmupStartedAtByStrategy(): Map<string, number> {
    return this.getAdaptivePmmState().adaptivePmmWarmupStartedAtByStrategy;
  }

  private get adaptivePmmWarmupTicksByStrategy(): Map<string, number> {
    return this.getAdaptivePmmState().adaptivePmmWarmupTicksByStrategy;
  }

  private getPureMarketMakingStrategyController(): PureMarketMakingStrategyController {
    return (
      this.pureMarketMakingStrategyController ||
      new PureMarketMakingStrategyController(
        this.quoteExecutorManagerService,
        this.exchangeOrderTrackerService,
        this.strategyMarketDataProviderService,
        this.strategyIntentStoreService,
        this.pmmMarkoutEvaluatorService,
        this.runtimeObservationService,
        this.adaptivePmmStateService,
        this.orderScopedBalanceQueryService,
        this.quotePlannerService,
        this.fillSettlementService,
        this.killSwitchService,
      )
    );
  }

  private getVolumeStrategyController(): VolumeStrategyController {
    if (!this.volumeStrategyController) {
      throw new Error('volume strategy controller is not available');
    }

    return this.volumeStrategyController;
  }

  private getDualAccountPlanner(): DualAccountPlannerService {
    return (
      this.dualAccountPlannerService ||
      new DualAccountPlannerService(
        this.exchangeConnectorAdapterService,
        this.orderScopedBalanceQueryService,
        this.strategyMarketDataProviderService,
        this.volumeStrategyController,
      )
    );
  }

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register('strategy-service', this, 20);
    this.detachExchangeReadyListener = this.exchangeInitService.onExchangeReady(
      (exchangeName, accountLabel) =>
        this.activatePendingStrategiesForExchange(
          exchangeName,
          accountLabel,
        ),
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
    this.sessions.clear();
    this.pendingActivationStrategies.clear();
    this.executorRegistry?.clear();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    await this.cancelAllRunningStrategies(signal || 'shutdown');
  }

  async health(): Promise<boolean> {
    return true;
  }

  getConnectorHealthStatus(exchange: string): ConnectorHealthStatus {
    return this.connectorHealthByExchange.get(exchange) || 'CONNECTED';
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
    const runningStrategies = await this.strategyInstanceRepository.find({
      where: { status: 'running' },
    });

    const eligibleStrategies: StrategyInstance[] = [];

    for (const strategy of runningStrategies) {
      if (await this.isStrategyRuntimeEligible(strategy)) {
        eligibleStrategies.push(strategy);
        continue;
      }

      await this.strategyInstanceRepository.update(
        { strategyKey: strategy.strategyKey },
        { status: 'stopped', updatedAt: getRFC3339Timestamp() },
      );
      this.logger.warn(
        `Skipping stale strategy restore for ${strategy.strategyKey}: bound market-making order is not running`,
      );
    }

    return eligibleStrategies;
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

  private async isStrategyRuntimeEligible(
    strategy: StrategyInstance,
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
        this.logger.warn(
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
    await this.upsertSession(
      strategyKey,
      'arbitrage',
      userId,
      clientId,
      cadenceMs,
      strategyParamsDto as unknown as StrategyRuntimeSession['params'],
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
    await this.upsertSession(
      strategyKey,
      'pureMarketMaking',
      normalizedParams.userId,
      marketMakingOrderId,
      cadenceMs,
      normalizedParams as unknown as StrategyRuntimeSession['params'],
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
        ? this.getVolumeStrategyController().buildAmmDexVolumeParams({
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
        : this.getVolumeStrategyController().buildClobVolumeParams({
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
    );
  }

  async executeDualAccountVolumeStrategy(
    params: ExecuteDualAccountVolumeStrategyDto,
  ): Promise<void> {
    const normalizedParams = this.normalizeDualAccountStrategyParams(params);
    const strategyKey = createStrategyKey({
      type: 'dualAccountVolume',
      user_id: params.userId,
      client_id: params.clientId,
    });
    const cadenceMs = this.resolveNextDualAccountCadenceMs(normalizedParams);

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
  ): Promise<void> {
    const normalizedParams =
      this.normalizeDualAccountBestCapacityStrategyParams(params);
    const strategyKey = createStrategyKey({
      type: 'dualAccountBestCapacityVolume',
      user_id: params.userId,
      client_id: params.clientId,
    });
    const cadenceMs = this.resolveNextDualAccountCadenceMs(normalizedParams);

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

    this.stoppingStrategyKeys.add(strategyKey);

    try {
      await this.strategyInstanceRepository.update(
        { strategyKey },
        { status: 'stopped', updatedAt: getRFC3339Timestamp() },
      );
      this.pendingActivationStrategies.delete(strategyKey);

      const activeSession = this.sessions.get(strategyKey);

      await this.cancelTrackedOrdersForStrategy(strategyKey);

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

      await this.publishIntents(strategyKey, [stopIntent]);
      this.strategyIntentStoreService?.clearLatestIntentsForStrategy(
        strategyKey,
      );
    } finally {
      this.stoppingStrategyKeys.delete(strategyKey);
    }
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

  stopVolumeStrategy(userId: string, clientId: string) {
    return this.stopStrategyForUser(userId, clientId, 'volume');
  }

  async buildArbitrageActions(
    strategyKey: string,
    strategyParamsDto: ArbitrageStrategyDto,
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (!this.arbitrageStrategyController) {
      throw new Error('arbitrage strategy controller is not available');
    }

    return await this.arbitrageStrategyController.buildArbitrageActions(
      strategyKey,
      strategyParamsDto,
      ts,
    );
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
    const existingSession = this.sessions.get(strategyKey);

    if (existingSession) {
      await this.detachSessionFromExecutor(existingSession);
    }

    const pooledTarget = this.resolvePooledExecutorTarget(
      strategyType,
      params,
      clientId,
      marketMakingOrderId,
    );

    if (this.executorRegistry && pooledTarget) {
      const accountLabel = this.resolveAccountLabel(strategyType, params);
      const executor = this.executorRegistry.getOrCreateExecutor(
        pooledTarget.exchange,
        pooledTarget.pair,
        {
          onTick: async (session, ts) => {
            await this.runSession(session, ts);
          },
          onFill: async (session, fill) => {
            await this.handleSessionFill(session, fill);
          },
          onTickError: async (session, error, ts) => {
            this.logSessionTickError(session.strategyKey, ts, error);
          },
          onFillError: async (session, error, fill) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorTrace = error instanceof Error ? error.stack : undefined;

            this.logger.error(
              `onFill handler failed for strategyKey=${
                session.strategyKey
              } exchange=${pooledTarget.exchange} pair=${
                pooledTarget.pair
              } clientOrderId=${fill.clientOrderId || ''}: ${errorMessage}`,
              errorTrace,
            );

            if (
              errorMessage.includes('insufficient locked balance') ||
              errorMessage.includes('insufficient available balance')
            ) {
              this.logger.error(
                `CRITICAL: Fill ledger error for strategyKey=${session.strategyKey} exchangeOrderId=${fill.exchangeOrderId}: ${errorMessage}`,
              );
            }
          },
        },
      );
      const pooledSession = await executor.addOrder(
        pooledTarget.orderId,
        userId,
        {
          strategyKey,
          strategyType,
          clientId,
          cadenceMs,
          accountLabel,
          params,
          marketMakingOrderId,
          nextRunAtMs,
          runId,
        },
      );

      this.strategyWatcherManagerService?.startPrivateWatchers(
        strategyType,
        pooledTarget.exchange,
        pooledTarget.pair,
        params,
      );
      this.strategyWatcherManagerService?.startBalanceWatchers(
        strategyType,
        pooledTarget.exchange,
        params,
      );
      this.logger.log(
        `Order book ingestion available=${Boolean(
          this.orderBookIngestionService,
        )} for ${pooledTarget.exchange} ${pooledTarget.pair}`,
      );
      this.orderBookIngestionService?.ensureSubscribed(
        pooledTarget.exchange,
        pooledTarget.pair,
      );

      this.sessions.set(strategyKey, pooledSession);

      return pooledSession;
    }

    throw new Error(
      `Cannot create session for strategyKey=${strategyKey}: executorRegistry not available or pooledTarget unresolved`,
    );
  }

  private async restoreOrQueueStrategy(
    strategy: StrategyInstance,
    nextRunAtMs: number,
  ): Promise<void> {
    if (!this.canActivateStrategyImmediately(strategy)) {
      this.pendingActivationStrategies.set(strategy.strategyKey, strategy);
      this.logger.log(
        `Queued pending activation for ${strategy.strategyKey}: exchange not ready yet`,
      );

      return;
    }

    await this.activateStrategyFromPersistence(strategy, nextRunAtMs);
  }

  private canActivateStrategyImmediately(strategy: StrategyInstance): boolean {
    const strategyType = strategy.strategyType as StrategyType;
    const params = strategy.parameters as StrategyRuntimeSession['params'];
    const target = this.resolvePooledExecutorTarget(
      strategyType,
      params,
      strategy.clientId,
      strategy.marketMakingOrderId ||
        (strategy.strategyType === 'pureMarketMaking'
          ? strategy.clientId
          : undefined),
    );

    if (!target) {
      return true;
    }

    return this.resolveRequiredAccountLabels(strategyType, params).every(
      (accountLabel) =>
        this.exchangeInitService.isReady(target.exchange, accountLabel),
    );
  }

  private async activatePendingStrategiesForExchange(
    exchangeName: string,
    accountLabel: string,
  ): Promise<void> {
    const pendingStrategies = [...this.pendingActivationStrategies.values()];

    for (const strategy of pendingStrategies) {
      const strategyType = strategy.strategyType as StrategyType;
      const params = strategy.parameters as StrategyRuntimeSession['params'];
      const target = this.resolvePooledExecutorTarget(
        strategyType,
        params,
        strategy.clientId,
        strategy.marketMakingOrderId ||
          (strategy.strategyType === 'pureMarketMaking'
            ? strategy.clientId
            : undefined),
      );

      if (!target || target.exchange !== exchangeName) {
        continue;
      }

      const requiredAccountLabels = this.resolveRequiredAccountLabels(
        strategyType,
        params,
      );

      if (!requiredAccountLabels.includes(accountLabel)) {
        continue;
      }

      if (
        !requiredAccountLabels.every((label) =>
          this.exchangeInitService.isReady(exchangeName, label),
        )
      ) {
        continue;
      }

      this.pendingActivationStrategies.delete(strategy.strategyKey);

      try {
        await this.activateStrategyFromPersistence(strategy, Date.now());
        this.logger.log(
          `Activated pending strategy ${strategy.strategyKey} after ${exchangeName}:${accountLabel} became ready`,
        );
      } catch (error) {
        this.pendingActivationStrategies.set(strategy.strategyKey, strategy);
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.logger.warn(
          `Pending activation failed for ${strategy.strategyKey} on ${exchangeName}:${accountLabel}: ${errorMessage}`,
        );
      }
    }
  }

  private async activateStrategyFromPersistence(
    strategy: StrategyInstance,
    nextRunAtMs: number,
  ): Promise<void> {
    try {
      const recoveryResult = await this.restoreRuntimeStateForStrategy(
        strategy,
      );

      if (!recoveryResult.success) {
        await this.strategyInstanceRepository.update(
          { strategyKey: strategy.strategyKey },
          {
            status: 'failed',
            updatedAt: getRFC3339Timestamp(),
          },
        );
        this.logger.warn(
          `Blocked startup for ${strategy.strategyKey}: ${recoveryResult.blockedReasons.join(
            '; ',
          )}`,
        );

        return;
      }

      await this.upsertSession(
        strategy.strategyKey,
        strategy.strategyType as StrategyType,
        strategy.userId,
        strategy.clientId,
        this.getCadenceMs(strategy.parameters, strategy.strategyType),
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

  private async rollbackFailedStrategyStart(
    strategyKey: string,
    userId: string,
    clientId: string,
  ): Promise<void> {
    this.pendingActivationStrategies.delete(strategyKey);

    const activeSession = this.sessions.get(strategyKey);

    await this.removeSession(strategyKey, activeSession);
    await this.cancelTrackedOrdersForStrategy(strategyKey);
    await this.strategyIntentStoreService?.cancelPendingIntents(
      strategyKey,
      'strategy start failed before session activation',
    );
    this.strategyIntentStoreService?.clearLatestIntentsForStrategy(
      strategyKey,
    );

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

  public async fetchStartPrice(
    strategyType: StrategyType,
    parameters: Record<string, any>,
  ): Promise<number> {
    if (
      strategyType === 'volume' ||
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume'
    ) {
      const venue = String(parameters.executionVenue || '').toLowerCase();
      const category = String(parameters.executionCategory || '').toLowerCase();

      if (venue === 'dex' || category === 'amm_dex') {
        return 0;
      }

      const referenceExchange = String(parameters.exchangeName || '').trim();
      const referencePair = this.resolveRuntimePair(
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
    session: ExchangePairExecutorSession,
    ts: string,
  ): Promise<void> {
    const startedAtMs = Date.now();

    try {
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

  async buildVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.getVolumeStrategyController().buildVolumeSessionActions(
      session,
      ts,
      this,
    );
  }

  async onVolumeActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
  ): Promise<void> {
    await this.getVolumeStrategyController().onVolumeActionsPublished(
      session,
      actions,
      this,
    );
  }

  getActiveStrategySession(
    strategyKey: string,
  ): StrategyRuntimeSession | undefined {
    return this.sessions.get(strategyKey);
  }

  setActiveStrategySession(
    strategyKey: string,
    session: StrategyRuntimeSession,
  ): void {
    this.sessions.set(strategyKey, session);
  }

  isSameActiveSession(
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
    return await this.getVolumeStrategyController().buildVolumeActions(
      strategyKey,
      params,
      ts,
    );
  }

  async buildDualAccountVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.buildDualAccountSessionActions(session, ts, 'classic');
  }

  async buildDualAccountBestCapacityVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.buildDualAccountSessionActions(
      session,
      ts,
      'best_capacity',
    );
  }

  private async buildDualAccountSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
    selectionModel: 'classic' | 'best_capacity',
  ): Promise<ExecutorAction[]> {
    const activeSession = this.sessions.get(session.strategyKey);
    const persistedParams = (
      await this.strategyInstanceRepository.findOne({
        where: { strategyKey: session.strategyKey },
      })
    )?.parameters as Partial<DualAccountVolumeStrategyParams> | undefined;
    const runtimeParams =
      (activeSession?.params as DualAccountVolumeStrategyParams) ||
      (session.params as DualAccountVolumeStrategyParams);
    let latestParams = this.mergeDualAccountConfigIntoRuntime(
      runtimeParams,
      persistedParams,
    );
    const activeTrackedOrders = this.getCancelableTrackedOrders(
      session.strategyKey,
    );

    if (activeTrackedOrders.length === 0) {
      latestParams = await this.finalizeSettledDualAccountCycle(
        session,
        latestParams,
      );
    }

    if (this.isSameActiveSession(activeSession, session) && activeSession) {
      activeSession.params = latestParams;
      activeSession.cadenceMs =
        this.resolveNextDualAccountCadenceMs(latestParams);
      this.sessions.set(session.strategyKey, activeSession);
    }

    const completedCycles = Number(latestParams.completedCycles || 0);
    const tradedQuoteVolume = Number(
      latestParams.tradedQuoteVolume || activeSession?.tradedQuoteVolume || 0,
    );
    const targetQuoteVolume = Number(latestParams.targetQuoteVolume || 0);

    if (latestParams.repairRequired) {
      const repairAction = await this.maybeBuildDualAccountRebalanceAction(
        session.strategyKey,
        latestParams,
        'buy',
        new BigNumber(0),
        new BigNumber(0),
        new BigNumber(0),
        await this.resolveDualAccountFeeBufferRate(
          latestParams.exchangeName,
          latestParams.symbol,
        ),
        Number(latestParams.publishedCycles || 0),
        ts,
      );

      return repairAction ? [repairAction] : [];
    }

    const maxCompletedCycles = Number(latestParams.numTrades || 0);

    if (maxCompletedCycles > 0 && completedCycles >= maxCompletedCycles) {
      const activeBeforeStop = this.sessions.get(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        this.logger.warn(
          `Skipping stale dual-account volume stop for ${session.strategyKey}: active session changed`,
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

    if (targetQuoteVolume > 0 && tradedQuoteVolume >= targetQuoteVolume) {
      const activeBeforeStop = this.sessions.get(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        this.logger.warn(
          `Skipping stale dual-account target-volume stop for ${session.strategyKey}: active session changed`,
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

    if (activeTrackedOrders.length > 0) {
      return [];
    }

    return selectionModel === 'best_capacity'
      ? await this.buildDualAccountBestCapacityVolumeActions(
          session.strategyKey,
          latestParams,
          ts,
        )
      : await this.buildDualAccountVolumeActions(
          session.strategyKey,
          latestParams,
          ts,
        );
  }

  async onDualAccountVolumeActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
  ): Promise<void> {
    if (actions.length === 0) {
      return;
    }

    const activeBeforePersist = this.sessions.get(session.strategyKey);

    if (!this.isSameActiveSession(activeBeforePersist, session)) {
      this.logger.warn(
        `Skipping stale dual-account volume tick before persist for ${session.strategyKey}: active session changed`,
      );

      return;
    }

    const params =
      activeBeforePersist.params as DualAccountVolumeStrategyParams;
    const persistedStrategy = await this.strategyInstanceRepository.findOne({
      where: { strategyKey: session.strategyKey },
    });
    const persistedParams = persistedStrategy?.parameters as
      | Partial<DualAccountVolumeStrategyParams>
      | undefined;
    const mergedParams = this.mergeDualAccountConfigIntoRuntime(
      params,
      persistedParams,
    );
    const shouldIncrementPublishedCycles = actions.some(
      (action) => !this.isDualAccountRebalanceAction(action),
    );
    const tradeAction = actions.find(
      (action) => !this.isDualAccountRebalanceAction(action),
    );
    const metadata =
      tradeAction &&
      tradeAction.metadata &&
      typeof tradeAction.metadata === 'object'
        ? (tradeAction.metadata as Record<string, unknown>)
        : undefined;
    const consecutiveFallbackCycles =
      metadata && metadata.consecutiveFallbackCycles !== undefined
        ? Number(metadata.consecutiveFallbackCycles)
        : Number(mergedParams.consecutiveFallbackCycles || 0);
    const nextParams: DualAccountVolumeStrategyParams = {
      ...mergedParams,
      publishedCycles:
        Number(mergedParams.publishedCycles || 0) +
        (shouldIncrementPublishedCycles ? 1 : 0),
      consecutiveFallbackCycles: Number.isFinite(consecutiveFallbackCycles)
        ? consecutiveFallbackCycles
        : Number(mergedParams.consecutiveFallbackCycles || 0),
      orderBookReady:
        this.strategyMarketDataProviderService?.hasTrackedOrderBook(
          mergedParams.exchangeName,
          mergedParams.symbol,
        ) || false,
      activeCycle: this.buildActiveDualAccountCycleState(tradeAction),
    };

    await this.persistStrategyParams(session.strategyKey, nextParams);

    const currentSession = this.sessions.get(session.strategyKey);

    if (this.isSameActiveSession(currentSession, session)) {
      currentSession.params = nextParams;
      currentSession.cadenceMs =
        this.resolveNextDualAccountCadenceMs(nextParams);
      this.sessions.set(session.strategyKey, currentSession);

      return;
    }

    this.logger.warn(
      `Skipping stale dual-account volume tick write-back for ${session.strategyKey}: active session changed`,
    );
  }

  private isDualAccountRebalanceAction(action: ExecutorAction): boolean {
    return this.getDualAccountPlanner().isRebalanceAction(action);
  }

  async buildDualAccountVolumeActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    const trackedBestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

    if (!trackedBestBidAsk) {
      if (params.orderBookReady) {
        this.logger.warn(
          `Skipping dual-account volume cycle for ${strategyKey}: tracked order book unavailable`,
        );
      }

      this.logger.warn(
        `Deferring dual-account volume cycle for ${strategyKey}: waiting for tracked order book`,
      );

      return [];
    }

    const { bestBid, bestAsk } = trackedBestBidAsk;
    const feeBufferRate = await this.resolveDualAccountFeeBufferRate(
      params.exchangeName,
      params.symbol,
    );

    const publishedCycles = Number(params.publishedCycles || 0);
    const bestBidBn = new BigNumber(bestBid);
    const bestAskBn = new BigNumber(bestAsk);
    const spread = bestAskBn.minus(bestBidBn);

    if (spread.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: no spread bestBid=${bestBid} bestAsk=${bestAsk}`,
      );

      return [];
    }

    const spreadPosition = new BigNumber(Math.random());
    const price = bestBidBn.plus(spread.multipliedBy(spreadPosition));
    const decisionStartedAtMs = Date.now();
    const balanceSnapshot = await this.loadDualAccountBalanceSnapshot(
      params,
      'execution',
    );

    if (!balanceSnapshot) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: balance cache unavailable or stale`,
      );

      return [];
    }

    const cycleRoles = this.resolveDualAccountCycleRoles(params);
    const alternatingParams = {
      ...params,
      makerAccountLabel: cycleRoles.makerAccountLabel,
      takerAccountLabel: cycleRoles.takerAccountLabel,
    };
    const rotatedBalanceSnapshot =
      cycleRoles.makerAccountLabel === params.makerAccountLabel &&
      cycleRoles.takerAccountLabel === params.takerAccountLabel
        ? balanceSnapshot
        : {
            makerBalances: balanceSnapshot.takerBalances,
            takerBalances: balanceSnapshot.makerBalances,
          };
    const preferredSide = await this.resolveDualAccountPreferredSide(
      alternatingParams,
      publishedCycles,
      rotatedBalanceSnapshot.makerBalances,
    );

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping dual-account volume cycle for ${strategyKey}: invalid non-positive price ${price.toFixed()}`,
      );

      return [];
    }

    const resolvedExecution = await this.resolveDualAccountExecutionPlan(
      strategyKey,
      alternatingParams,
      preferredSide,
      price,
      bestBidBn,
      bestAskBn,
      feeBufferRate,
      rotatedBalanceSnapshot,
    );
    const decisionDurationMs = Date.now() - decisionStartedAtMs;

    if (!resolvedExecution) {
      const rebalanceAction = await this.maybeBuildDualAccountRebalanceAction(
        strategyKey,
        params,
        preferredSide,
        bestBidBn,
        bestAskBn,
        price,
        feeBufferRate,
        publishedCycles,
        ts,
        balanceSnapshot,
      );

      if (rebalanceAction) {
        return [rebalanceAction];
      }

      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: no tradable side found`,
      );

      return [];
    }

    const {
      side,
      resolvedAccounts,
      profile,
      requestedQty,
      adjustedQuote,
      sideReason,
      fallbackReason,
    } = resolvedExecution;

    const tickId = ts;
    const cycleId = `${strategyKey}:cycle:${publishedCycles}:${tickId}`;
    const accountBuyBias = profile.buyBias ?? params.buyBias;
    const fallbackApplied = side !== preferredSide;
    const capacityDiagnostics = balanceSnapshot
      ? this.buildDualAccountCapacityDiagnostics(
          alternatingParams,
          adjustedQuote.price,
          feeBufferRate,
          rotatedBalanceSnapshot,
          preferredSide,
          side,
          adjustedQuote.qty,
        )
      : null;
    const consecutiveFallbackCycles = fallbackApplied
      ? Number(params.consecutiveFallbackCycles || 0) + 1
      : 0;
    const estimatedLegNotional = adjustedQuote.qty.multipliedBy(
      adjustedQuote.price,
    );
    const estimatedTotalFee = estimatedLegNotional.multipliedBy(feeBufferRate);
    const netEdgeEstimate = estimatedTotalFee.negated();

    this.logger.log(
      [
        'Dual-account volume decision',
        `strategy=${strategyKey}`,
        `cycle=${cycleId}`,
        `tick=${tickId}`,
        `preferredSide=${preferredSide}`,
        `selectedSide=${side}`,
        `sideReason=${sideReason}`,
        `fallbackReason=${fallbackReason || 'n/a'}`,
        `bestBid=${bestBid}`,
        `bestAsk=${bestAsk}`,
        `spread=${spread.toFixed()}`,
        `spreadPosition=${spreadPosition.toFixed(4)}`,
        `rawPrice=${price.toFixed()}`,
        `price=${adjustedQuote.price.toFixed()}`,
        `requestedQty=${requestedQty.toFixed()}`,
        `effectiveQty=${adjustedQuote.qty.toFixed()}`,
        `maker=${resolvedAccounts.makerAccountLabel}`,
        `taker=${resolvedAccounts.takerAccountLabel}`,
        `capacity=${resolvedAccounts.capacity?.toFixed() ?? 'unknown'}`,
        `buyCapacity=${
          capacityDiagnostics?.buyCapacity.toFixed() ?? 'unknown'
        }`,
        `sellCapacity=${
          capacityDiagnostics?.sellCapacity.toFixed() ?? 'unknown'
        }`,
        `capacityLimiter=${capacityDiagnostics?.capacityLimiter ?? 'unknown'}`,
        `consecutiveFallbackCycles=${consecutiveFallbackCycles}`,
        `estimatedTotalFee=${estimatedTotalFee.toFixed()}`,
        `netEdgeEstimate=${netEdgeEstimate.toFixed()}`,
        `rebalanceNeeded=${capacityDiagnostics?.rebalanceNeeded ?? false}`,
        `decisionDurationMs=${decisionDurationMs}`,
      ].join(' | '),
    );

    return [
      this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        params.exchangeName,
        params.symbol,
        side,
        adjustedQuote.price,
        adjustedQuote.qty,
        ts,
        `dual-account-volume-maker-${publishedCycles}`,
        params.executionCategory,
        {
          cycleId,
          tickId,
          orderId: `${params.clientId}:cycle:${publishedCycles}`,
          role: 'maker',
          preferredSide,
          selectedSide: side,
          sideReason,
          fallbackApplied,
          fallbackReason,
          makerAccountLabel: resolvedAccounts.makerAccountLabel,
          takerAccountLabel: resolvedAccounts.takerAccountLabel,
          configuredMakerAccountLabel: params.makerAccountLabel,
          configuredTakerAccountLabel: params.takerAccountLabel,
          dynamicRoleSwitching: Boolean(params.dynamicRoleSwitching),
          cycleMode: params.cycleMode || 'alternating',
          makerProtectionMode: params.makerProtectionMode || 'alive_only',
          activeHours: profile.activeHours,
          buyBias: accountBuyBias,
          requestedQty: requestedQty.toFixed(),
          effectiveQty: adjustedQuote.qty.toFixed(),
          buyCapacity: capacityDiagnostics?.buyCapacity.toFixed(),
          sellCapacity: capacityDiagnostics?.sellCapacity.toFixed(),
          preferredSideCapacity:
            capacityDiagnostics?.preferredSideCapacity.toFixed(),
          selectedSideCapacity:
            capacityDiagnostics?.selectedSideCapacity.toFixed(),
          capacityUtilization:
            capacityDiagnostics?.capacityUtilization.toFixed(),
          capacityLimited: capacityDiagnostics?.capacityLimited,
          capacityLimiter: capacityDiagnostics?.capacityLimiter,
          consecutiveFallbackCycles,
          estimatedTotalFee: estimatedTotalFee.toFixed(),
          netEdgeEstimate: netEdgeEstimate.toFixed(),
          feeBufferRate: feeBufferRate.toFixed(),
          rebalanceNeeded: capacityDiagnostics?.rebalanceNeeded ?? false,
        },
        true,
        resolvedAccounts.makerAccountLabel,
      ),
    ];
  }

  async buildDualAccountBestCapacityVolumeActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    this.maybeWarnDualAccountBestCapacityIgnoredFields(strategyKey, params);

    const trackedBestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

    if (!trackedBestBidAsk) {
      if (params.orderBookReady) {
        this.logger.warn(
          `Skipping dual-account best-capacity volume cycle for ${strategyKey}: tracked order book unavailable`,
        );
      }

      this.logger.warn(
        `Deferring dual-account best-capacity volume cycle for ${strategyKey}: waiting for tracked order book`,
      );

      return [];
    }

    const { bestBid, bestAsk } = trackedBestBidAsk;
    const feeBufferRate = await this.resolveDualAccountFeeBufferRate(
      params.exchangeName,
      params.symbol,
    );
    const publishedCycles = Number(params.publishedCycles || 0);
    const bestBidBn = new BigNumber(bestBid);
    const bestAskBn = new BigNumber(bestAsk);
    const spread = bestAskBn.minus(bestBidBn);

    if (spread.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping dual-account best-capacity volume cycle for ${strategyKey}: no spread bestBid=${bestBid} bestAsk=${bestAsk}`,
      );

      return [];
    }

    const spreadPosition = new BigNumber(Math.random());
    const price = bestBidBn.plus(spread.multipliedBy(spreadPosition));
    const decisionStartedAtMs = Date.now();
    const balanceSnapshot = await this.loadDualAccountBalanceSnapshot(
      params,
      'execution',
    );

    if (!balanceSnapshot) {
      return [];
    }

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping dual-account best-capacity volume cycle for ${strategyKey}: invalid non-positive price ${price.toFixed()}`,
      );

      return [];
    }

    const rawCandidates = this.buildDualAccountBestCapacityCandidates(
      params,
      price,
      feeBufferRate,
      balanceSnapshot,
    );
    const resolvedExecution =
      await this.resolveBestExecutableDualAccountCandidate(
        strategyKey,
        params,
        rawCandidates,
        price,
        bestBidBn,
        bestAskBn,
        feeBufferRate,
      );
    const decisionDurationMs = Date.now() - decisionStartedAtMs;

    if (!resolvedExecution) {
      const rebalanceAction = await this.maybeBuildDualAccountRebalanceAction(
        strategyKey,
        params,
        'buy',
        bestBidBn,
        bestAskBn,
        price,
        feeBufferRate,
        publishedCycles,
        ts,
        balanceSnapshot,
      );

      if (rebalanceAction) {
        return [rebalanceAction];
      }

      this.logger.warn(
        `Skipping dual-account best-capacity volume cycle for ${strategyKey}: no executable candidate found`,
      );

      return [];
    }

    const {
      side,
      resolvedAccounts,
      profile,
      requestedQty,
      adjustedQuote,
      candidate,
    } = resolvedExecution;
    const cycleId = `${strategyKey}:cycle:${publishedCycles}:${ts}`;
    const accountBuyBias = profile.buyBias ?? params.buyBias;
    const selectedCapacity = candidate.capacity;
    const estimatedLegNotional = adjustedQuote.qty.multipliedBy(
      adjustedQuote.price,
    );
    const estimatedTotalFee = estimatedLegNotional.multipliedBy(feeBufferRate);
    const netEdgeEstimate = estimatedTotalFee.negated();

    this.logger.log(
      [
        'Dual-account best-capacity decision',
        `strategy=${strategyKey}`,
        `cycle=${cycleId}`,
        `tick=${ts}`,
        'selectionModel=best_capacity',
        `candidateRank=${candidate.candidateRank}`,
        `candidateCount=${rawCandidates.length}`,
        `selectedSide=${side}`,
        `price=${adjustedQuote.price.toFixed()}`,
        `requestedQty=${requestedQty.toFixed()}`,
        `effectiveQty=${adjustedQuote.qty.toFixed()}`,
        `selectedCapacity=${selectedCapacity.toFixed()}`,
        `matchedQuoteProgress=${new BigNumber(
          params.totalMatchedQuoteVolume || 0,
        ).toFixed()}`,
        `targetQuoteVolume=${new BigNumber(
          params.targetQuoteVolume || 0,
        ).toFixed()}`,
        `maker=${resolvedAccounts.makerAccountLabel}`,
        `taker=${resolvedAccounts.takerAccountLabel}`,
        `decisionDurationMs=${decisionDurationMs}`,
      ].join(' | '),
    );

    return [
      this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        params.exchangeName,
        params.symbol,
        side,
        adjustedQuote.price,
        adjustedQuote.qty,
        ts,
        `dual-account-best-capacity-volume-maker-${publishedCycles}`,
        params.executionCategory,
        {
          cycleId,
          tickId: ts,
          orderId: `${params.clientId}:cycle:${publishedCycles}`,
          role: 'maker',
          selectionModel: 'best_capacity',
          candidateRank: candidate.candidateRank,
          candidateCount: rawCandidates.length,
          buyCapacityConfigured: this.findDualAccountCandidateCapacity(
            rawCandidates,
            'buy',
            'configured',
          )?.toFixed(),
          sellCapacityConfigured: this.findDualAccountCandidateCapacity(
            rawCandidates,
            'sell',
            'configured',
          )?.toFixed(),
          buyCapacitySwapped: this.findDualAccountCandidateCapacity(
            rawCandidates,
            'buy',
            'swapped',
          )?.toFixed(),
          sellCapacitySwapped: this.findDualAccountCandidateCapacity(
            rawCandidates,
            'sell',
            'swapped',
          )?.toFixed(),
          selectedCapacity: selectedCapacity.toFixed(),
          selectedMakerAccountLabel: resolvedAccounts.makerAccountLabel,
          selectedTakerAccountLabel: resolvedAccounts.takerAccountLabel,
          rebalanced: false,
          makerAccountLabel: resolvedAccounts.makerAccountLabel,
          takerAccountLabel: resolvedAccounts.takerAccountLabel,
          configuredMakerAccountLabel: params.makerAccountLabel,
          configuredTakerAccountLabel: params.takerAccountLabel,
          dynamicRoleSwitching: Boolean(params.dynamicRoleSwitching),
          cycleMode: params.cycleMode || 'alternating',
          makerProtectionMode: params.makerProtectionMode || 'alive_only',
          activeHours: profile.activeHours,
          buyBias: accountBuyBias,
          requestedQty: requestedQty.toFixed(),
          effectiveQty: adjustedQuote.qty.toFixed(),
          estimatedTotalFee: estimatedTotalFee.toFixed(),
          netEdgeEstimate: netEdgeEstimate.toFixed(),
          feeBufferRate: feeBufferRate.toFixed(),
        },
        true,
        resolvedAccounts.makerAccountLabel,
      ),
    ];
  }

  private async resolveDualAccountCycleAccounts(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<DualAccountResolvedAccounts | null> {
    const configured: DualAccountResolvedAccounts = {
      makerAccountLabel: params.makerAccountLabel,
      takerAccountLabel: params.takerAccountLabel,
    };

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      return configured;
    }

    const snapshot =
      balanceSnapshot ||
      (await this.loadDualAccountBalanceSnapshot(params, 'execution'));

    if (!snapshot) {
      return configured;
    }
    const { makerBalances, takerBalances } = snapshot;

    return this.resolveDualAccountCycleAccountsFromBalances(
      params,
      side,
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
  }

  private resolveDualAccountCycleAccountsFromBalances(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
  ): DualAccountResolvedAccounts {
    return this.getDualAccountPlanner().resolveCycleAccountsFromBalances(
      params,
      side,
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
  }

  private computeDualAccountCapacity(
    makerBalances: {
      base: BigNumber;
      quote: BigNumber;
    },
    takerBalances: {
      base: BigNumber;
      quote: BigNumber;
    },
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
  ): BigNumber {
    return this.getDualAccountPlanner().computeCapacity(
      makerBalances,
      takerBalances,
      side,
      price,
      feeBufferRate,
    );
  }

  private buildDualAccountCapacityDiagnostics(
    params: DualAccountVolumeStrategyParams,
    price: BigNumber,
    feeBufferRate: BigNumber,
    snapshot: DualAccountBalanceSnapshot,
    preferredSide: 'buy' | 'sell',
    selectedSide: 'buy' | 'sell',
    effectiveQty: BigNumber,
  ): DualAccountCapacityDiagnostics {
    return this.getDualAccountPlanner().buildCapacityDiagnostics(
      params,
      price,
      feeBufferRate,
      snapshot,
      preferredSide,
      selectedSide,
      effectiveQty,
    );
  }

  private resolveDualAccountCapacityLimiter(
    resolvedAccounts: DualAccountResolvedAccounts,
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
  ):
    | 'maker_base'
    | 'maker_quote'
    | 'taker_base'
    | 'taker_quote'
    | 'balanced'
    | 'unknown' {
    return this.getDualAccountPlanner().resolveCapacityLimiter(
      resolvedAccounts,
      side,
      price,
      feeBufferRate,
    );
  }

  private async resolveDualAccountExecutionPlan(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<DualAccountExecutionPlan | null> {
    const fallbackSide = preferredSide === 'buy' ? 'sell' : 'buy';
    const tradeAmountVarianceSample = Math.random();

    const preferredExecution = await this.evaluateDualAccountExecutionForSide(
      strategyKey,
      params,
      preferredSide,
      price,
      tradeAmountVarianceSample,
      bestBid,
      bestAsk,
      feeBufferRate,
      balanceSnapshot,
    );

    if (preferredExecution) {
      return {
        ...preferredExecution,
        sideReason: 'preferred_side_tradable',
      };
    }

    this.logger.log(
      [
        'Dual-account volume side fallback',
        `strategy=${strategyKey}`,
        `preferredSide=${preferredSide}`,
        `fallbackSide=${fallbackSide}`,
        'fallbackReason=preferred_side_not_tradable',
      ].join(' | '),
    );

    const fallbackExecution = await this.evaluateDualAccountExecutionForSide(
      strategyKey,
      params,
      fallbackSide,
      price,
      tradeAmountVarianceSample,
      bestBid,
      bestAsk,
      feeBufferRate,
      balanceSnapshot,
    );

    if (!fallbackExecution) {
      return null;
    }

    return {
      ...fallbackExecution,
      sideReason: 'fallback_side_tradable',
      fallbackReason: 'preferred_side_not_tradable',
    };
  }

  private buildDualAccountBestCapacityCandidates(
    params: DualAccountVolumeStrategyParams,
    price: BigNumber,
    feeBufferRate: BigNumber,
    snapshot: DualAccountBalanceSnapshot,
  ): DualAccountBestCapacityCandidate[] {
    return this.getDualAccountPlanner().buildBestCapacityCandidates(
      params,
      price,
      feeBufferRate,
      snapshot,
    );
  }

  private computeDualAccountImbalanceRatio(
    primaryCapacity: BigNumber,
    oppositeCapacity: BigNumber,
  ): BigNumber {
    return this.getDualAccountPlanner().computeImbalanceRatio(
      primaryCapacity,
      oppositeCapacity,
    );
  }

  private scoreDualAccountBestCapacityCandidate(
    params: Pick<
      DualAccountVolumeStrategyParams,
      'targetQuoteVolume' | 'totalMatchedQuoteVolume'
    >,
    candidate: Pick<
      DualAccountBestCapacityCandidate,
      'capacity' | 'futureOppositeCapacity' | 'imbalanceRatio'
    >,
    price: BigNumber,
  ): BigNumber {
    return this.getDualAccountPlanner().scoreBestCapacityCandidate(
      params,
      candidate,
      price,
    );
  }

  private async resolveBestExecutableDualAccountCandidate(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    candidates: DualAccountBestCapacityCandidate[],
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
  ): Promise<
    | (DualAccountExecutionPlan & {
        candidate: DualAccountBestCapacityCandidate;
      })
    | null
  > {
    const tradeAmountVarianceSample = Math.random();

    for (const candidate of candidates) {
      const execution =
        await this.evaluateDualAccountExecutionForSideWithAccounts(
          strategyKey,
          params,
          candidate.side,
          {
            makerAccountLabel: candidate.makerAccountLabel,
            takerAccountLabel: candidate.takerAccountLabel,
            makerBalances: candidate.makerBalances,
            takerBalances: candidate.takerBalances,
            capacity: candidate.capacity,
          },
          price,
          tradeAmountVarianceSample,
          bestBid,
          bestAsk,
          feeBufferRate,
        );

      if (execution) {
        return {
          ...execution,
          candidate,
          sideReason: 'preferred_side_tradable',
        };
      }
    }

    return null;
  }

  private async maybeBuildDualAccountRebalanceAction(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    bestBid: BigNumber,
    bestAsk: BigNumber,
    price: BigNumber,
    feeBufferRate: BigNumber,
    publishedCycles: number,
    ts: string,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<ExecutorAction | null> {
    const snapshot =
      balanceSnapshot ||
      (await this.loadDualAccountBalanceSnapshot(params, 'rebalance'));

    if (!snapshot) {
      return null;
    }
    const { makerBalances, takerBalances } = snapshot;

    const passiveCandidates = (
      await Promise.all([
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestAsk,
          params.makerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestAsk,
          params.takerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestBid,
          params.makerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestBid,
          params.takerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
      ])
    ).filter(
      (candidate): candidate is DualAccountRebalanceCandidate =>
        candidate !== null,
    );

    const aggressiveCandidates = (
      await Promise.all([
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.makerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.takerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.makerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.takerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
      ])
    ).filter(
      (candidate): candidate is DualAccountRebalanceCandidate =>
        candidate !== null,
    );

    const selectBestRebalanceCandidate = (
      candidates: DualAccountRebalanceCandidate[],
    ): DualAccountRebalanceCandidate | null => {
      if (candidates.length === 0) {
        return null;
      }

      return candidates.reduce((best, candidate) => {
        const bestScore = best.restoredCapacityScore.minus(
          best.rebalanceCostScore,
        );
        const candidateScore = candidate.restoredCapacityScore.minus(
          candidate.rebalanceCostScore,
        );

        if (candidateScore.isGreaterThan(bestScore)) {
          return candidate;
        }

        return best;
      });
    };

    const selectedPassive = selectBestRebalanceCandidate(passiveCandidates);
    const selectedAggressive =
      selectBestRebalanceCandidate(aggressiveCandidates);

    if (!selectedPassive && !selectedAggressive) {
      return null;
    }

    const passiveNetScore = selectedPassive
      ? selectedPassive.restoredCapacityScore.minus(
          selectedPassive.rebalanceCostScore,
        )
      : null;
    const aggressiveNetScore = selectedAggressive
      ? selectedAggressive.restoredCapacityScore.minus(
          selectedAggressive.rebalanceCostScore,
        )
      : null;

    const selected =
      selectedPassive &&
      (!selectedAggressive ||
        !aggressiveNetScore ||
        !passiveNetScore ||
        aggressiveNetScore.isLessThanOrEqualTo(
          passiveNetScore.multipliedBy(1.05),
        ))
        ? selectedPassive
        : selectedAggressive;

    if (!selected) {
      return null;
    }

    this.logger.log(
      `Dual-account volume ${strategyKey}: scheduling rebalance account=${
        selected.accountLabel
      } side=${selected.side} qty=${selected.action.qty} price=${
        selected.action.price
      } restoredSide=${selected.futureExecution.side} restoredMaker=${
        selected.futureExecution.resolvedAccounts.makerAccountLabel
      } restoredTaker=${
        selected.futureExecution.resolvedAccounts.takerAccountLabel
      } restoredCapacity=${selected.futureExecution.capacity.toFixed()}`,
    );

    return selected.action;
  }

  private async buildDualAccountRebalanceCandidate(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    futurePrice: BigNumber,
    executionPrice: BigNumber,
    accountLabel: string,
    side: 'buy' | 'sell',
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
    publishedCycles: number,
    ts: string,
  ): Promise<DualAccountRebalanceCandidate | null> {
    if (!executionPrice.isFinite() || executionPrice.isLessThanOrEqualTo(0)) {
      return null;
    }

    const nextMakerBalances = this.cloneDualAccountPairBalances(makerBalances);
    const nextTakerBalances = this.cloneDualAccountPairBalances(takerBalances);
    const selectedBalances =
      accountLabel === params.makerAccountLabel
        ? nextMakerBalances
        : nextTakerBalances;

    const maxAffordableQty =
      side === 'buy'
        ? selectedBalances.quote
            .dividedBy(executionPrice)
            .multipliedBy(new BigNumber(1).minus(feeBufferRate))
        : selectedBalances.base;
    const requestedQty = BigNumber.min(
      new BigNumber(params.baseTradeAmount),
      maxAffordableQty,
    );

    if (!requestedQty.isFinite() || requestedQty.isLessThanOrEqualTo(0)) {
      return null;
    }

    const adjustedQuote = await this.getQuotePlanner().quantizeAndValidateQuote(
      `${strategyKey}:rebalance`,
      params.exchangeName,
      params.symbol,
      accountLabel,
      side,
      0,
      `dual-account-rebalance:${accountLabel}:${side}`,
      requestedQty,
      executionPrice,
      selectedBalances,
    );

    if (!adjustedQuote) {
      return null;
    }

    if (side === 'buy') {
      selectedBalances.base = selectedBalances.base.plus(adjustedQuote.qty);
    } else {
      selectedBalances.quote = selectedBalances.quote.plus(
        adjustedQuote.qty.multipliedBy(adjustedQuote.price),
      );
    }

    const futureExecution = this.resolveBestDualAccountTradeabilityFromBalances(
      params,
      preferredSide,
      futurePrice,
      nextMakerBalances,
      nextTakerBalances,
      feeBufferRate,
    );

    if (!futureExecution) {
      return null;
    }

    const orderId = `${params.clientId}:rebalance:${publishedCycles}:${accountLabel}:${side}:${ts}`;
    const cycleId = `${strategyKey}:rebalance:${ts}:${accountLabel}:${side}`;

    const rebalanceNotional = adjustedQuote.qty.multipliedBy(
      adjustedQuote.price,
    );
    const rebalanceCostScore = rebalanceNotional.multipliedBy(feeBufferRate);
    const restoredCapacityScore = futureExecution.capacity;
    const mode = executionPrice.isEqualTo(futurePrice)
      ? 'passive'
      : 'aggressive';

    return {
      action: this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        params.exchangeName,
        params.symbol,
        side,
        adjustedQuote.price,
        adjustedQuote.qty,
        ts,
        `dual-account-volume-rebalance-${publishedCycles}-${accountLabel}-${side}`,
        params.executionCategory,
        {
          cycleId,
          orderId,
          role: 'rebalance',
          rebalance: true,
          rebalanceReason: 'no_tradable_side',
          rebalanceAccountLabel: accountLabel,
          makerAccountLabel: futureExecution.resolvedAccounts.makerAccountLabel,
          takerAccountLabel: futureExecution.resolvedAccounts.takerAccountLabel,
          configuredMakerAccountLabel: params.makerAccountLabel,
          configuredTakerAccountLabel: params.takerAccountLabel,
          preferredSide,
          restoredSide: futureExecution.side,
          restoredCapacity: futureExecution.capacity.toFixed(),
          targetQty: new BigNumber(params.baseTradeAmount).toFixed(),
          requestedQty: requestedQty.toFixed(),
          effectiveQty: adjustedQuote.qty.toFixed(),
        },
        false,
        accountLabel,
        'IOC',
      ),
      futureExecution,
      accountLabel,
      side,
      restoredCapacityScore,
      rebalanceCostScore,
      mode,
    };
  }

  private resolveBestDualAccountTradeabilityFromBalances(
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    price: BigNumber,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
  ): DualAccountTradeabilityPlan | null {
    const preferredTradeability =
      this.evaluateDualAccountTradeabilityForSideFromBalances(
        params,
        preferredSide,
        price,
        makerBalances,
        takerBalances,
        feeBufferRate,
      );

    if (preferredTradeability) {
      return preferredTradeability;
    }

    return this.evaluateDualAccountTradeabilityForSideFromBalances(
      params,
      preferredSide === 'buy' ? 'sell' : 'buy',
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
  }

  private evaluateDualAccountTradeabilityForSideFromBalances(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
  ): DualAccountTradeabilityPlan | null {
    const resolvedAccounts = this.resolveDualAccountCycleAccountsFromBalances(
      params,
      side,
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
    const profile = this.resolveDualAccountBehaviorProfile(
      params,
      resolvedAccounts.makerAccountLabel,
    );

    if (!this.isWithinDualAccountProfileWindow(profile)) {
      return null;
    }

    const capacity = resolvedAccounts.capacity;

    if (!capacity || !capacity.isFinite() || capacity.isLessThanOrEqualTo(0)) {
      return null;
    }

    return {
      side,
      resolvedAccounts,
      profile,
      capacity,
    };
  }

  private cloneDualAccountPairBalances(
    balances: DualAccountPairBalances,
  ): DualAccountPairBalances {
    return this.getDualAccountPlanner().clonePairBalances(balances);
  }

  private async evaluateDualAccountExecutionForSide(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    tradeAmountVarianceSample: number,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<DualAccountExecutionPlan | null> {
    const resolvedAccounts = await this.resolveDualAccountCycleAccounts(
      params,
      side,
      price,
      feeBufferRate,
      balanceSnapshot,
    );

    if (!resolvedAccounts) {
      this.logger.warn(
        `Dual-account volume ${strategyKey}: unable to resolve maker/taker accounts for side=${side}`,
      );

      return null;
    }

    return await this.evaluateDualAccountExecutionForSideWithAccounts(
      strategyKey,
      params,
      side,
      resolvedAccounts,
      price,
      tradeAmountVarianceSample,
      bestBid,
      bestAsk,
      feeBufferRate,
    );
  }

  private async evaluateDualAccountExecutionForSideWithAccounts(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    resolvedAccounts: DualAccountResolvedAccounts,
    price: BigNumber,
    tradeAmountVarianceSample: number,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
  ): Promise<DualAccountExecutionPlan | null> {
    const profile = this.resolveDualAccountBehaviorProfile(
      params,
      resolvedAccounts.makerAccountLabel,
    );

    if (!this.isWithinDualAccountProfileWindow(profile)) {
      this.logger.log(
        `Dual-account volume ${strategyKey}: maker account ${resolvedAccounts.makerAccountLabel} is outside active hours for side=${side}`,
      );

      return null;
    }

    const requestedQty = this.isBestCapacityConfig(params)
      ? new BigNumber(params.maxOrderAmount || 0)
      : new BigNumber(
          this.applyVariance(
            params.baseTradeAmount,
            profile.tradeAmountVariance ?? params.tradeAmountVariance,
            profile.tradeAmountMultiplier,
            tradeAmountVarianceSample,
          ),
        );

    if (!requestedQty.isFinite() || requestedQty.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Dual-account volume ${strategyKey}: invalid qty ${
          (params.maxOrderAmount ?? params.baseTradeAmount) || 0
        } for side=${side}`,
      );

      return null;
    }

    const adjustedQuote = await this.quantizeAndAdaptDualAccountQuote(
      strategyKey,
      params,
      side,
      price,
      requestedQty,
      resolvedAccounts,
      bestBid,
      bestAsk,
      feeBufferRate,
    );

    if (!adjustedQuote) {
      return null;
    }

    return {
      side,
      resolvedAccounts,
      profile,
      requestedQty,
      adjustedQuote,
      sideReason: 'preferred_side_tradable',
    };
  }

  private async quantizeAndAdaptDualAccountQuote(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    rawPrice: BigNumber,
    requestedQty: BigNumber,
    resolvedAccounts: DualAccountResolvedAccounts,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
  ): Promise<{ price: BigNumber; qty: BigNumber } | null> {
    let effectivePrice = rawPrice;

    if (this.exchangeConnectorAdapterService) {
      const initialQuantized =
        this.exchangeConnectorAdapterService.quantizeOrder(
          params.exchangeName,
          params.symbol,
          requestedQty.toFixed(),
          rawPrice.toFixed(),
          resolvedAccounts.makerAccountLabel,
        );

      effectivePrice = new BigNumber(initialQuantized.price);
    }

    effectivePrice = this.normalizeDualAccountMakerPrice(
      strategyKey,
      params,
      side,
      requestedQty,
      effectivePrice,
      resolvedAccounts.makerAccountLabel,
      bestBid,
      bestAsk,
    );

    if (!effectivePrice) {
      return null;
    }

    if (!effectivePrice.isFinite() || effectivePrice.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping dual-account volume cycle for ${strategyKey}: invalid quantized price ${effectivePrice.toFixed()}`,
      );

      return null;
    }

    const capacity =
      resolvedAccounts.makerBalances && resolvedAccounts.takerBalances
        ? this.computeDualAccountCapacity(
            resolvedAccounts.makerBalances,
            resolvedAccounts.takerBalances,
            side,
            effectivePrice,
            feeBufferRate,
          )
        : resolvedAccounts.capacity;
    const rules = this.exchangeConnectorAdapterService
      ? await this.exchangeConnectorAdapterService.loadTradingRules(
          params.exchangeName,
          params.symbol,
          resolvedAccounts.makerAccountLabel,
        )
      : {};
    let effectiveQty = requestedQty;

    if (
      capacity &&
      capacity.isFinite() &&
      capacity.isGreaterThanOrEqualTo(0) &&
      effectiveQty.isGreaterThan(capacity)
    ) {
      this.logger.log(
        `Reducing dual-account volume qty for ${strategyKey}: requested=${requestedQty.toFixed()} effective=${capacity.toFixed()} capacity=${capacity.toFixed()} side=${side} maker=${
          resolvedAccounts.makerAccountLabel
        } taker=${
          resolvedAccounts.takerAccountLabel
        } qtyReason=capacity_limited`,
      );
      effectiveQty = capacity;
    }

    if (rules.amountMax && effectiveQty.isGreaterThan(rules.amountMax)) {
      const cappedQty = new BigNumber(rules.amountMax);

      this.logger.log(
        `Capping dual-account volume qty for ${strategyKey}: effective=${effectiveQty.toFixed()} capped=${cappedQty.toFixed()} amountMax=${cappedQty.toFixed()} side=${side} maker=${
          resolvedAccounts.makerAccountLabel
        } taker=${
          resolvedAccounts.takerAccountLabel
        } qtyReason=exchange_amount_max`,
      );
      effectiveQty = cappedQty;
    }

    if (rules.costMax) {
      const maxNotionalQty = new BigNumber(rules.costMax).dividedBy(
        effectivePrice,
      );

      if (effectiveQty.isGreaterThan(maxNotionalQty)) {
        this.logger.log(
          `Capping dual-account volume qty for ${strategyKey}: effective=${effectiveQty.toFixed()} capped=${maxNotionalQty.toFixed()} costMax=${new BigNumber(
            rules.costMax,
          ).toFixed()} side=${side} maker=${
            resolvedAccounts.makerAccountLabel
          } taker=${
            resolvedAccounts.takerAccountLabel
          } qtyReason=exchange_cost_max`,
        );
        effectiveQty = maxNotionalQty;
      }
    }

    if (!effectiveQty.isFinite() || effectiveQty.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: adapted qty ${effectiveQty.toFixed()} is non-positive after balance and rule checks`,
      );

      return null;
    }

    const effectiveCost = effectiveQty.multipliedBy(effectivePrice);

    if (
      (rules.amountMin && effectiveQty.isLessThan(rules.amountMin)) ||
      (rules.costMin && effectiveCost.isLessThan(rules.costMin))
    ) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: adapted qty ${effectiveQty.toFixed()}@${effectivePrice.toFixed()} is below exchange minimums before quantization qtyReason=below_exchange_minimums`,
      );

      return null;
    }

    let qty = effectiveQty;

    if (this.exchangeConnectorAdapterService) {
      try {
        const quantized = this.exchangeConnectorAdapterService.quantizeOrder(
          params.exchangeName,
          params.symbol,
          effectiveQty.toFixed(),
          effectivePrice.toFixed(),
          resolvedAccounts.makerAccountLabel,
        );

        effectivePrice = new BigNumber(quantized.price);
        qty = new BigNumber(quantized.qty);
      } catch (error) {
        this.logger.warn(
          `Skipping dual-account volume cycle for ${strategyKey}: quantization rejected qty ${effectiveQty.toFixed()}@${effectivePrice.toFixed()} for side=${side} maker=${
            resolvedAccounts.makerAccountLabel
          } taker=${resolvedAccounts.takerAccountLabel}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        return null;
      }
    }

    effectivePrice = this.normalizeDualAccountMakerPrice(
      strategyKey,
      params,
      side,
      qty,
      effectivePrice,
      resolvedAccounts.makerAccountLabel,
      bestBid,
      bestAsk,
    );

    if (!effectivePrice) {
      return null;
    }

    if (
      !qty.isFinite() ||
      qty.isLessThanOrEqualTo(0) ||
      !effectivePrice.isFinite() ||
      effectivePrice.isLessThanOrEqualTo(0) ||
      (rules.amountMin && qty.isLessThan(rules.amountMin)) ||
      (rules.amountMax && qty.isGreaterThan(rules.amountMax)) ||
      (rules.costMin &&
        qty.multipliedBy(effectivePrice).isLessThan(rules.costMin)) ||
      (rules.costMax &&
        qty.multipliedBy(effectivePrice).isGreaterThan(rules.costMax))
    ) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: quantized qty ${qty.toFixed()}@${effectivePrice.toFixed()} is outside exchange limits or non-positive`,
      );

      return null;
    }

    if (resolvedAccounts.makerBalances && resolvedAccounts.takerBalances) {
      const quantizedCapacity = this.computeDualAccountCapacity(
        resolvedAccounts.makerBalances,
        resolvedAccounts.takerBalances,
        side,
        effectivePrice,
        feeBufferRate,
      );

      if (qty.isGreaterThan(quantizedCapacity)) {
        this.logger.warn(
          `Skipping dual-account volume cycle for ${strategyKey}: quantized qty ${qty.toFixed()} exceeds live capacity ${quantizedCapacity.toFixed()} for side=${side} maker=${
            resolvedAccounts.makerAccountLabel
          } taker=${resolvedAccounts.takerAccountLabel}`,
        );

        return null;
      }
    }

    return { price: effectivePrice, qty };
  }

  private async resolveDualAccountFeeBufferRate(
    exchangeName: string,
    pair: string,
  ): Promise<BigNumber> {
    return await this.getDualAccountPlanner().resolveFeeBufferRate(
      exchangeName,
      pair,
    );
  }

  private findDualAccountCandidateCapacity(
    candidates: DualAccountBestCapacityCandidate[],
    side: 'buy' | 'sell',
    roleAssignment: 'configured' | 'swapped',
  ): BigNumber | undefined {
    return this.getDualAccountPlanner().findCandidateCapacity(
      candidates,
      side,
      roleAssignment,
    );
  }

  private async loadDualAccountBalanceSnapshot(
    params: DualAccountVolumeStrategyParams,
    context: 'execution' | 'rebalance',
  ): Promise<DualAccountBalanceSnapshot | null> {
    return await this.getDualAccountPlanner().loadBalanceSnapshot(params, context);
  }

  private async resolveDualAccountPreferredSide(
    params: DualAccountVolumeStrategyParams,
    publishedCycles: number,
    makerBalances?: DualAccountPairBalances,
  ): Promise<'buy' | 'sell'> {
    return await this.getDualAccountPlanner().resolvePreferredSide(
      params,
      publishedCycles,
      makerBalances,
    );
  }

  private async resolveInventoryReferencePrice(
    exchangeName: string,
    pair: string,
  ): Promise<BigNumber> {
    return await this.getDualAccountPlanner().resolveInventoryReferencePrice(
      exchangeName,
      pair,
    );
  }

  private normalizeDualAccountMakerPrice(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    qty: BigNumber,
    candidatePrice: BigNumber,
    accountLabel: string,
    bestBid: BigNumber,
    bestAsk: BigNumber,
  ): BigNumber | null {
    return this.getDualAccountPlanner().normalizeMakerPrice(
      strategyKey,
      params,
      side,
      qty,
      candidatePrice,
      accountLabel,
      bestBid,
      bestAsk,
    );
  }

  private isDualAccountMakerPriceValid(
    side: 'buy' | 'sell',
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
  ): boolean {
    return this.getDualAccountPlanner().isMakerPriceValid(
      side,
      price,
      bestBid,
      bestAsk,
    );
  }

  async buildPureMarketMakingActions(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
  ): Promise<ExecutorAction[]> {
    return await this.getPureMarketMakingStrategyController().buildPureMarketMakingActions(
      strategyKey,
      params,
      ts,
      {
        getSession: (key) => this.sessions.get(key),
        setSession: (key, session) => this.sessions.set(key, session),
        getConnectorHealthStatus: (exchange) =>
          this.getConnectorHealthStatus(exchange),
        setConnectorHealthStatus: (exchange, status) =>
          this.setConnectorHealthStatus(exchange, status),
        stopStrategyForUser: (userId, clientId, strategyType) =>
          this.stopStrategyForUser(userId, clientId, strategyType),
        logger: this.logger,
      },
    );
  }

  private async resolveOrderScopedInventoryRatio(
    params: PureMarketMakingStrategyDto,
    referencePrice: BigNumber,
  ): Promise<number> {
    return (
      (await this.orderScopedBalanceQueryService?.resolveInventoryRatio(
        params,
        referencePrice,
      )) ?? Number(params.currentBaseRatio || 0.5)
    );
  }

  private async resolveAdaptivePmmLayerCountFromBudget(
    params: PureMarketMakingStrategyDto,
    referencePrice: BigNumber,
    availableBalances: {
      base: BigNumber;
      quote: BigNumber;
      assets: { base: string; quote: string };
    } | null,
  ): Promise<number> {
    return this.getAdaptivePmmState().resolveAdaptivePmmLayerCountFromBudget(
      params,
      referencePrice,
      availableBalances,
    );
  }

  private shouldReadAdaptivePmmSignals(
    params: PureMarketMakingStrategyDto,
  ): boolean {
    return this.getAdaptivePmmState().shouldReadAdaptivePmmSignals(params);
  }

  private resolveAdaptivePmmWarmupState(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    signalSnapshot: AdaptivePmmSignalSnapshot | null,
    minSamples: number,
  ): {
    active: boolean;
    reason: string | null;
    bidSpread: number;
    askSpread: number;
    orderAmount: string;
  } {
    return this.getAdaptivePmmState().resolveAdaptivePmmWarmupState(
      strategyKey,
      params,
      signalSnapshot,
      minSamples,
    );
  }

  private resolveAdaptivePmmRuntimePressure(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
  ): StrategyRuntimePressureSnapshot | null {
    return this.getAdaptivePmmState().resolveAdaptivePmmRuntimePressure(
      strategyKey,
      params,
      this.runtimeObservationService,
    );
  }

  private resolveAdaptivePmmRuntimePressureWiden(
    params: PureMarketMakingStrategyDto,
    pressure: StrategyRuntimePressureSnapshot | null,
  ): number {
    return this.getAdaptivePmmState().resolveAdaptivePmmRuntimePressureWiden(
      params,
      pressure,
    );
  }

  private applyAdaptivePmmRuntimePressureCadence(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    pressure: StrategyRuntimePressureSnapshot | null,
  ): void {
    const session = this.sessions.get(strategyKey);

    if (
      this.getAdaptivePmmState().applyAdaptivePmmRuntimePressureCadence(
        params,
        pressure,
        session,
      ) &&
      session
    ) {
      this.sessions.set(strategyKey, session);
    }
  }

  private restoreAdaptivePmmRuntimePressureCadence(
    params: PureMarketMakingStrategyDto,
    session: StrategyRuntimeSession,
  ): void {
    if (
      this.getAdaptivePmmState().restoreAdaptivePmmRuntimePressureCadence(
        params,
        session,
      )
    ) {
      this.sessions.set(session.strategyKey, session);
    }
  }

  private resolveAdaptivePmmWarmupSizeRatio(
    value: number | undefined,
  ): BigNumber {
    return this.getAdaptivePmmState().resolveAdaptivePmmWarmupSizeRatio(value);
  }

  private resolveAdaptivePmmSideRecoveryState(
    params: PureMarketMakingStrategyDto,
    toxicityState: {
      buyLastPausedUntilMs?: number | null;
      sellLastPausedUntilMs?: number | null;
    } | null,
  ): {
    buyActive: boolean;
    sellActive: boolean;
    buyWidenBps: number;
    sellWidenBps: number;
    buySizeRatio: number;
    sellSizeRatio: number;
  } {
    return this.getAdaptivePmmState().resolveAdaptivePmmSideRecoveryState(
      params,
      toxicityState,
    );
  }

  private resolveAdaptivePmmSideRecovery(
    lastPausedUntilMs: number | null | undefined,
    nowMs: number,
    windowMs: number,
    baseWidenBps: number,
    floorRatio: number,
  ): { active: boolean; widenBps: number; sizeRatio: number } {
    return this.getAdaptivePmmState().resolveAdaptivePmmSideRecovery(
      lastPausedUntilMs,
      nowMs,
      windowMs,
      baseWidenBps,
      floorRatio,
    );
  }

  private shouldBlockAdaptivePmmForMarketSafety(
    signalSnapshot: AdaptivePmmSignalSnapshot,
  ): boolean {
    return this.getAdaptivePmmState().shouldBlockAdaptivePmmForMarketSafety(
      signalSnapshot,
    );
  }

  private isAdaptivePmmReservationPaused(
    params: PureMarketMakingStrategyDto,
  ): boolean {
    return this.getAdaptivePmmState().isAdaptivePmmReservationPaused(params);
  }

  private appendAdaptivePmmSafetyCancels(
    actions: ExecutorAction[],
    cancelledExchangeOrderIds: Set<string>,
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
    liveOrders: TrackedOrder[],
  ): void {
    this.getAdaptivePmmState().appendAdaptivePmmSafetyCancels(
      actions,
      cancelledExchangeOrderIds,
      strategyKey,
      params,
      ts,
      liveOrders,
    );
  }

  private logAdaptivePmmDecisionSnapshot(
    strategyKey: string,
    snapshot: {
      params: PureMarketMakingStrategyDto;
      reason: string;
      signalSnapshot: AdaptivePmmSignalSnapshot | null;
      toxicityState: {
        buyScore: number;
        sellScore: number;
        buyPausedUntilMs: number | null;
        sellPausedUntilMs: number | null;
        buyLastPausedUntilMs?: number | null;
        sellLastPausedUntilMs?: number | null;
      } | null;
      actions: number;
      layers: number;
      realizedVolatility?: number | null;
      orderBookImbalance?: number | null;
      buyPaused?: boolean;
      sellPaused?: boolean;
      warmupActive?: boolean;
      warmupReason?: string | null;
      softStale?: boolean;
      buyRecoveryActive?: boolean;
      sellRecoveryActive?: boolean;
      runtimePressure?: StrategyRuntimePressureSnapshot | null;
      runtimePressureWiden?: number;
    },
  ): void {
    this.getAdaptivePmmState().logAdaptivePmmDecisionSnapshot(
      strategyKey,
      snapshot,
    );
  }

  private buildAdaptivePmmDecisionMetadata(
    strategyKey: string,
    snapshot: {
      reason: string;
      signalSnapshot: AdaptivePmmSignalSnapshot | null;
      toxicityState: {
        buyScore: number;
        sellScore: number;
        buyPausedUntilMs: number | null;
        sellPausedUntilMs: number | null;
        buyLastPausedUntilMs?: number | null;
        sellLastPausedUntilMs?: number | null;
      } | null;
      actions: number;
      layers: number;
      realizedVolatility?: number | null;
      orderBookImbalance?: number | null;
      buyPaused?: boolean;
      sellPaused?: boolean;
      warmupActive?: boolean;
      warmupReason?: string | null;
      softStale?: boolean;
      buyRecoveryActive?: boolean;
      sellRecoveryActive?: boolean;
      runtimePressure?: StrategyRuntimePressureSnapshot | null;
      runtimePressureWiden?: number;
    },
  ): Record<string, unknown> {
    return this.getAdaptivePmmState().buildAdaptivePmmDecisionMetadata(
      strategyKey,
      snapshot,
    );
  }

  private async persistAdaptivePmmDecisionSnapshot(
    params: PureMarketMakingStrategyDto,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.getAdaptivePmmState().persistAdaptivePmmDecisionSnapshot(
      params,
      metadata,
    );
  }

  private updateAdaptivePmmCadence(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    realizedVolatility: number | null,
  ): void {
    const session = this.sessions.get(strategyKey);

    if (
      this.getAdaptivePmmState().updateAdaptivePmmCadence(
        params,
        realizedVolatility,
        session,
      ) &&
      session
    ) {
      this.sessions.set(strategyKey, session);
    }
  }

  private createIntent(
    runtimeInstanceKey: string,
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
    postOnly?: boolean,
    accountLabel?: string,
    timeInForce?: 'GTC' | 'IOC',
  ): StrategyOrderIntent {
    if (!this.strategyIntentStoreService) {
      throw new Error('strategy intent store is not available');
    }

    return this.strategyIntentStoreService.createLimitOrderIntent(
      runtimeInstanceKey,
      strategyKey,
      userId,
      clientId,
      exchange,
      pair,
      side,
      price,
      qty,
      ts,
      suffix,
      executionCategory,
      metadata,
      postOnly,
      accountLabel,
      timeInForce,
    );
  }

  private async publishIntents(
    strategyKey: string,
    intents: ExecutorAction[],
  ): Promise<void> {
    if (intents.length === 0) {
      return;
    }

    if (
      this.stoppingStrategyKeys.has(strategyKey) &&
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

  private resolveVolumeSide(
    postOnlySide: 'buy' | 'sell' | 'inventory_balance' | undefined,
    executedTrades: number,
    buyBias?: number,
  ): 'buy' | 'sell' {
    return this.getVolumeStrategyController().resolveVolumeSide(
      postOnlySide,
      executedTrades,
      buyBias,
    );
  }

  async persistStrategyParams(
    strategyKey: string,
    params: VolumeStrategyParams | DualAccountVolumeStrategyParams,
  ): Promise<void> {
    await this.strategyInstanceRepository.update(
      { strategyKey },
      {
        parameters: params as Record<string, any>,
        updatedAt: getRFC3339Timestamp(),
      },
    );
  }

  // ========== Time Indicator Strategy ==========

  async executeTimeIndicatorStrategy(
    params: TimeIndicatorStrategyDto,
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
    );
  }

  async buildTimeIndicatorActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const params = session.params as unknown as TimeIndicatorStrategyDto;
    const { userId, clientId, exchangeName, symbol } = params;

    // Time window check
    if (!this.isWithinTimeWindow(params)) {
      this.logger.debug(
        `[${exchangeName}:${symbol}] Outside time window — skipping.`,
      );

      return [];
    }

    // Exchange validation
    const ex = this.exchangeInitService.getExchange(exchangeName);

    if (!ex) {
      this.logger.error(`Exchange '${exchangeName}' is not initialized.`);

      return [];
    }

    try {
      if (!ex.markets || Object.keys(ex.markets).length === 0) {
        await ex.loadMarkets();
      }
    } catch (e: unknown) {
      const { message } = this.toErrorDetails(e);

      this.logger.error(`[${exchangeName}] loadMarkets failed: ${message}`);

      return [];
    }

    if (!ex.markets[symbol]) {
      this.logger.error(`[${exchangeName}] Unknown symbol '${symbol}'.`);

      return [];
    }

    if (ex.timeframes && !ex.timeframes[params.timeframe]) {
      this.logger.error(
        `[${exchangeName}:${symbol}] Unsupported timeframe '${params.timeframe}'.`,
      );

      return [];
    }

    // Max concurrent positions check
    if (params.maxConcurrentPositions && params.maxConcurrentPositions > 0) {
      try {
        const openOrders = await ex.fetchOpenOrders(symbol);

        if (openOrders.length >= params.maxConcurrentPositions) {
          this.logger.warn(
            `[${exchangeName}:${symbol}] Open orders (${openOrders.length}) >= maxConcurrentPositions (${params.maxConcurrentPositions}). Skipping.`,
          );

          return [];
        }
      } catch (e: unknown) {
        const { message } = this.toErrorDetails(e);

        this.logger.warn(
          `[${exchangeName}:${symbol}] fetchOpenOrders failed (${message}). Proceeding anyway.`,
        );
      }
    }

    // Fetch candles
    const ohlcv = await this.fetchCandles(
      ex,
      symbol,
      params.timeframe,
      params.lookback,
    );
    const minBarsNeeded = Math.max(params.emaSlow, params.rsiPeriod) + 2;

    if (!ohlcv || ohlcv.length < minBarsNeeded) {
      this.logger.warn(`[${exchangeName}:${symbol}] Not enough candles yet.`);

      return [];
    }

    // Calculate indicators
    const closes = ohlcv.map((c) => c[4]);
    const emaF = calcEma(closes, params.emaFast);
    const emaS = calcEma(closes, params.emaSlow);
    const rsiV = calcRsi(closes, params.rsiPeriod);

    const last = closes[closes.length - 1];
    const lastEmaF = emaF[emaF.length - 1];
    const lastEmaS = emaS[emaS.length - 1];
    const prevEmaF = emaF[emaF.length - 2];
    const prevEmaS = emaS[emaS.length - 2];
    const lastRsi = rsiV[rsiV.length - 1];

    if (
      [lastEmaF, lastEmaS, prevEmaF, prevEmaS, lastRsi].some(
        (x) => x === undefined || Number.isNaN(x),
      )
    ) {
      this.logger.debug(
        `[${exchangeName}:${symbol}] Indicators not ready (NaN).`,
      );

      return [];
    }

    // Determine signal
    const signal = calcCross(prevEmaF!, prevEmaS!, lastEmaF!, lastEmaS!);
    const rsiBuyOk =
      params.rsiBuyBelow === undefined || lastRsi! <= params.rsiBuyBelow!;
    const rsiSellOk =
      params.rsiSellAbove === undefined || lastRsi! >= params.rsiSellAbove!;
    const hasRsiThresholds =
      params.rsiBuyBelow !== undefined && params.rsiSellAbove !== undefined;

    let side: 'buy' | 'sell' | null = null;

    if (params.indicatorMode === 'ema') {
      if (signal === 'CROSS_UP') side = 'buy';
      else if (signal === 'CROSS_DOWN') side = 'sell';
    } else if (params.indicatorMode === 'rsi') {
      if (!hasRsiThresholds) {
        this.logger.warn(
          `[${exchangeName}:${symbol}] RSI mode requires both rsiBuyBelow and rsiSellAbove thresholds.`,
        );

        return [];
      }
      if (rsiBuyOk && !rsiSellOk) side = 'buy';
      else if (rsiSellOk && !rsiBuyOk) side = 'sell';
    } else if (params.indicatorMode === 'both') {
      if (signal === 'CROSS_UP' && rsiBuyOk) side = 'buy';
      else if (signal === 'CROSS_DOWN' && rsiSellOk) side = 'sell';
    }

    if (!side) {
      this.logger.debug(`[${exchangeName}:${symbol}] No trade signal.`);

      return [];
    }

    // Balance & sizing
    const parsedSymbol = this.parseBaseQuote(symbol);

    if (!parsedSymbol) {
      this.logger.error(
        `[${exchangeName}] Unable to parse symbol '${symbol}' into base/quote`,
      );

      return [];
    }
    const { base, quote } = parsedSymbol;

    const availableBalances = await this.getAvailableBalancesForPair(
      exchangeName,
      symbol,
    );

    if (!availableBalances) {
      this.logger.warn(
        `[${exchangeName}:${symbol}] Skipping time-indicator tick: balance cache unavailable or stale.`,
      );

      return [];
    }

    const freeBase = Number(availableBalances.base.toFixed());
    const freeQuote = Number(availableBalances.quote.toFixed());

    const amountBaseRaw =
      params.orderMode === 'base' ? params.orderSize : params.orderSize / last;

    if (side === 'sell' && freeBase < amountBaseRaw * 1.01) {
      this.logger.warn(
        `[${exchangeName}:${symbol}] Insufficient ${base} to sell.`,
      );

      return [];
    }
    if (side === 'buy' && freeQuote < amountBaseRaw * last * 1.01) {
      this.logger.warn(
        `[${exchangeName}:${symbol}] Insufficient ${quote} to buy.`,
      );

      return [];
    }

    const market = ex.markets[symbol];
    const amountPrec = (x: number) =>
      parseFloat(ex.amountToPrecision(symbol, x));
    const pricePrec = (x: number) => parseFloat(ex.priceToPrecision(symbol, x));

    let amountBase = amountPrec(amountBaseRaw);

    if (market?.limits?.amount?.min && amountBase < market.limits.amount.min) {
      amountBase = amountPrec(market.limits.amount.min);
    }
    if (
      market?.limits?.cost?.min &&
      amountBase * last < market.limits.cost.min
    ) {
      const needed = market.limits.cost.min / last;

      amountBase = amountPrec(Math.max(amountBase, needed));
    }

    const bps = params.slippageBps ?? 10;
    const entryPriceRaw =
      side === 'buy' ? last * (1 - bps / 10_000) : last * (1 + bps / 10_000);
    const entryPrice = pricePrec(entryPriceRaw);

    this.logger.log(
      `[${exchangeName}:${symbol}] ${side.toUpperCase()} ${amountBase} @ ${entryPrice} (EMA${
        params.emaFast
      }/${params.emaSlow}, RSI=${lastRsi!.toFixed(2)})`,
    );

    return [
      {
        type: 'CREATE_LIMIT_ORDER',
        intentId: `${session.strategyKey}:${ts}:indicator-entry`,
        runtimeInstanceKey: session.strategyKey,
        strategyKey: session.strategyKey,
        userId,
        clientId,
        exchange: ex.id,
        pair: symbol,
        side,
        price: String(entryPrice),
        qty: String(amountBase),
        executionCategory: 'clob_cex',
        metadata: {
          emaFast: lastEmaF,
          emaSlow: lastEmaS,
          rsi: lastRsi,
          signal,
          stopLossPct: safePct(params.stopLossPct),
          takeProfitPct: safePct(params.takeProfitPct),
        },
        createdAt: ts,
        status: 'NEW',
      },
    ];
  }

  private async removeSession(
    strategyKey: string,
    session = this.sessions.get(strategyKey),
  ): Promise<void> {
    if (session) {
      await this.detachSessionFromExecutor(session);
    }

    this.sessions.delete(strategyKey);
    this.getQuotePlanner().clearStrategyState(strategyKey);
    this.getAdaptivePmmState().clearStrategyState(strategyKey);
  }

  private async cancelTrackedOrdersForStrategy(
    strategyKey: string,
    timeoutMs = 10_000,
  ): Promise<void> {
    const openOrders = this.getCancelableTrackedOrders(strategyKey);

    await Promise.all(
      openOrders.map(async (order) => {
        try {
          const result =
            await this.exchangeConnectorAdapterService?.cancelOrder(
              order.exchange,
              order.pair,
              order.exchangeOrderId,
              order.accountLabel,
            );
          const cancelSucceeded = this.isCancelResultFinal(result);

          this.exchangeOrderTrackerService?.upsertOrder(
            cancelSucceeded
              ? {
                  ...order,
                  status: 'cancelled',
                  updatedAt: getRFC3339Timestamp(),
                }
              : {
                  ...order,
                  status: 'pending_cancel',
                  updatedAt: getRFC3339Timestamp(),
                },
          );
        } catch (error) {
          this.logger.warn(
            `Failed cancel-all order cleanup for ${strategyKey}:${
              order.exchangeOrderId
            }: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    await this.waitForTrackedOrdersToSettle(strategyKey, timeoutMs);
  }

  private async detachSessionFromExecutor(
    session: StrategyRuntimeSession,
  ): Promise<void> {
    if (!this.executorRegistry) {
      return;
    }

    const pooledTarget = this.resolvePooledExecutorTarget(
      session.strategyType,
      session.params,
      session.clientId,
      session.marketMakingOrderId,
    );

    if (!pooledTarget) {
      return;
    }

    const executor = this.executorRegistry.getExecutor(
      pooledTarget.exchange,
      pooledTarget.pair,
    );

    if (!executor) {
      return;
    }

    await executor.removeOrder(pooledTarget.orderId);
    this.executorRegistry.removeExecutorIfEmpty(
      pooledTarget.exchange,
      pooledTarget.pair,
    );

    this.strategyWatcherManagerService?.stopPrivateWatchers(
      session.strategyType,
      pooledTarget.exchange,
      pooledTarget.pair,
      session.params,
    );
    this.strategyWatcherManagerService?.stopBalanceWatchers(
      session.strategyType,
      pooledTarget.exchange,
      session.params,
    );
    this.orderBookIngestionService?.releaseSubscription(
      pooledTarget.exchange,
      pooledTarget.pair,
    );
  }

  private resolvePooledExecutorTarget(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
    clientId: string,
    marketMakingOrderId?: string,
  ): PooledExecutorTarget | null {
    if (strategyType === 'pureMarketMaking') {
      const exchange = String(
        (params as unknown as PureMarketMakingStrategyDto).exchangeName || '',
      ).trim();
      const pair = String(
        (params as unknown as PureMarketMakingStrategyDto).pair || '',
      ).trim();
      const orderId = String(marketMakingOrderId || clientId || '').trim();

      if (exchange && pair && orderId) {
        return { exchange, pair, orderId };
      }

      return null;
    }

    if (
      strategyType === 'volume' ||
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume'
    ) {
      const exchange = String(
        (params as unknown as VolumeStrategyParams).exchangeName || '',
      ).trim();
      const pair = this.resolveRuntimePair(
        params as unknown as VolumeStrategyParams,
      );
      const orderId = String(clientId || '').trim();

      if (exchange && pair && orderId) {
        return { exchange, pair, orderId };
      }

      return null;
    }

    if (strategyType === 'timeIndicator') {
      const exchange = String(
        (params as unknown as TimeIndicatorStrategyDto).exchangeName || '',
      ).trim();
      const pair = String(
        (params as unknown as TimeIndicatorStrategyDto).symbol || '',
      ).trim();
      const orderId = String(clientId || '').trim();

      if (exchange && pair && orderId) {
        return { exchange, pair, orderId };
      }
    }

    return null;
  }

  private resolveAccountLabel(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
  ): string | undefined {
    return this.strategyWatcherManagerService?.resolveAccountLabel(
      strategyType,
      params,
    );
  }

  private resolveRequiredAccountLabels(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
  ): string[] {
    return (
      this.strategyWatcherManagerService?.resolveRequiredAccountLabels(
        strategyType,
        params,
      ) || ['default']
    );
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

  private async handleSessionFill(
    session: StrategyRuntimeSession,
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
    },
  ): Promise<void> {
    if (
      session.strategyType !== 'pureMarketMaking' &&
      session.strategyType !== 'dualAccountVolume' &&
      session.strategyType !== 'dualAccountBestCapacityVolume'
    ) {
      return;
    }

    const trackedOrder =
      this.fillSettlementService?.resolveTrackedOrderForFill(session, fill);
    const settlementFill =
      this.fillSettlementService?.buildIncrementalSettlementFill(
        trackedOrder,
        fill,
      ) || null;

    if (!settlementFill) {
      return;
    }

    let settled = false;

    try {
      settled =
        (await this.fillSettlementService?.settleFillForSession(
          session,
          settlementFill,
        )) || false;
    } catch (error) {
      this.fillSettlementService?.pauseFillSettlementReservations(
        session,
        settlementFill,
      );
      throw error;
    }

    if (!settled) {
      return;
    }

    this.fillSettlementService?.markTrackedFillSettled(
      trackedOrder,
      settlementFill,
    );
    this.runtimeObservationService?.recordSessionPnL(session, settlementFill, {
      includeTradedQuoteVolume:
        session.strategyType === 'pureMarketMaking' ||
        trackedOrder?.role === 'taker',
    });

    if (
      session.strategyType === 'dualAccountVolume' ||
      session.strategyType === 'dualAccountBestCapacityVolume'
    ) {
      const persistedParams = (
        await this.strategyInstanceRepository.findOne({
          where: { strategyKey: session.strategyKey },
        })
      )?.parameters as Partial<DualAccountVolumeStrategyParams> | undefined;
      let nextParams = this.mergeDualAccountFillRuntimeIntoPersisted(
        session.params as DualAccountVolumeStrategyParams,
        persistedParams,
      );

      if (trackedOrder) {
        nextParams = await this.applyDualAccountFillProgress(
          session,
          fill,
          trackedOrder,
          nextParams,
        );
      }

      session.params = nextParams;
      session.tradedQuoteVolume = Number(nextParams.tradedQuoteVolume || 0);
      await this.persistStrategyParams(session.strategyKey, nextParams);
      session.nextRunAtMs = Math.min(session.nextRunAtMs, Date.now());

      return;
    }

    session.lastFillTimestamp = Date.now();
    this.runtimeObservationService?.recordPureMarketMakingMarkout(
      session,
      fill,
      session.lastFillTimestamp,
    );
    const delayMs = Number(
      (session.params as unknown as PureMarketMakingStrategyDto)
        .filledOrderDelay || 0,
    );

    session.nextRunAtMs =
      Number.isFinite(delayMs) && delayMs > 0
        ? Math.max(session.nextRunAtMs, session.lastFillTimestamp + delayMs)
        : Math.min(session.nextRunAtMs, Date.now());
  }

  private resolveDualAccountCycleRoles(
    params: DualAccountVolumeStrategyParams,
  ): { makerAccountLabel: string; takerAccountLabel: string } {
    return this.getDualAccountPlanner().resolveCycleRoles(params);
  }

  private advanceDualAccountCycleRolesAfterSuccess(
    params: DualAccountVolumeStrategyParams,
    activeCycle: DualAccountActiveCycleState,
  ): DualAccountVolumeStrategyParams {
    return this.getDualAccountPlanner().advanceCycleRolesAfterSuccess(
      params,
      activeCycle,
    );
  }

  private buildActiveDualAccountCycleState(
    action?: ExecutorAction,
  ): DualAccountActiveCycleState | undefined {
    return this.getDualAccountPlanner().buildActiveCycleState(action);
  }

  private async applyDualAccountFillProgress(
    session: StrategyRuntimeSession,
    fill: {
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
    },
    trackedOrder: TrackedOrder,
    params: DualAccountVolumeStrategyParams,
  ): Promise<DualAccountVolumeStrategyParams> {
    if (trackedOrder.role === 'rebalance' || !params.activeCycle) {
      return params;
    }

    const fillQty = new BigNumber(fill.qty || 0);

    if (!fillQty.isFinite() || fillQty.isLessThanOrEqualTo(0)) {
      return params;
    }

    const activeCycle = { ...params.activeCycle };

    if (trackedOrder.orderId !== activeCycle.orderId) {
      return params;
    }

    if (
      trackedOrder.role === 'maker' &&
      trackedOrder.accountLabel === activeCycle.makerAccountLabel
    ) {
      const makerFilledQty = new BigNumber(
        activeCycle.makerFilledQty || 0,
      ).plus(fillQty);

      return {
        ...params,
        activeCycle: this.updateMatchedDualAccountCycleMetrics({
          ...activeCycle,
          makerFilledQty: makerFilledQty.toFixed(),
        }),
      };
    }

    if (
      trackedOrder.role === 'taker' &&
      trackedOrder.accountLabel === activeCycle.takerAccountLabel
    ) {
      return {
        ...params,
        activeCycle: this.updateMatchedDualAccountCycleMetrics({
          ...activeCycle,
          takerFilledQty: new BigNumber(activeCycle.takerFilledQty || 0)
            .plus(fillQty)
            .toFixed(),
        }),
      };
    }

    return params;
  }

  private updateMatchedDualAccountCycleMetrics(
    activeCycle: DualAccountActiveCycleState,
  ): DualAccountActiveCycleState {
    const makerFilledQty = new BigNumber(activeCycle.makerFilledQty || 0);
    const takerFilledQty = new BigNumber(activeCycle.takerFilledQty || 0);
    const matchedFilledQty = BigNumber.min(makerFilledQty, takerFilledQty);
    const price = new BigNumber(activeCycle.price || 0);
    const matchedQuoteVolume =
      matchedFilledQty.isFinite() && price.isFinite()
        ? matchedFilledQty.multipliedBy(price)
        : new BigNumber(0);

    return {
      ...activeCycle,
      matchedFilledQty: matchedFilledQty.isFinite()
        ? matchedFilledQty.toFixed()
        : '0',
      matchedQuoteVolume: matchedQuoteVolume.isFinite()
        ? matchedQuoteVolume.toFixed()
        : '0',
    };
  }

  private async finalizeSettledDualAccountCycle(
    session: StrategyRuntimeSession,
    params: DualAccountVolumeStrategyParams,
  ): Promise<DualAccountVolumeStrategyParams> {
    if (!params.activeCycle) {
      return params;
    }

    const makerFilledQty = new BigNumber(
      params.activeCycle.makerFilledQty || 0,
    );
    const takerFilledQty = new BigNumber(
      params.activeCycle.takerFilledQty || 0,
    );
    const nextParams: DualAccountVolumeStrategyParams = {
      ...params,
      activeCycle: undefined,
    };

    if (!makerFilledQty.isFinite() || makerFilledQty.isLessThanOrEqualTo(0)) {
      await this.persistStrategyParams(session.strategyKey, nextParams);

      return nextParams;
    }

    const matchedFilledQty = BigNumber.min(
      makerFilledQty,
      takerFilledQty.isFinite() ? takerFilledQty : new BigNumber(0),
    );

    if (
      matchedFilledQty.isGreaterThan(0) &&
      makerFilledQty.isEqualTo(takerFilledQty)
    ) {
      const matchedQuoteVolume = new BigNumber(
        params.activeCycle.matchedQuoteVolume || 0,
      );

      nextParams.completedCycles = Number(nextParams.completedCycles || 0) + 1;
      nextParams.totalMatchedBaseVolume = new BigNumber(
        nextParams.totalMatchedBaseVolume || 0,
      )
        .plus(matchedFilledQty)
        .toNumber();
      nextParams.totalMatchedQuoteVolume = new BigNumber(
        nextParams.totalMatchedQuoteVolume || 0,
      )
        .plus(matchedQuoteVolume.isFinite() ? matchedQuoteVolume : 0)
        .toNumber();
      nextParams.activeCycle = undefined;
      Object.assign(
        nextParams,
        this.advanceDualAccountCycleRolesAfterSuccess(
          nextParams,
          params.activeCycle,
        ),
      );
      nextParams.repairRequired = false;
      nextParams.repairReason = undefined;
      await this.persistStrategyParams(session.strategyKey, nextParams);

      return nextParams;
    }

    this.logger.warn(
      `Dual-account cycle settled under-hedged for ${
        session.strategyKey
      }: cycle=${
        params.activeCycle.cycleId
      } makerFilledQty=${makerFilledQty.toFixed()} takerFilledQty=${takerFilledQty.toFixed()}`,
    );
    nextParams.repairRequired = true;
    nextParams.repairReason = 'paired_fill_mismatch';
    await this.persistStrategyParams(session.strategyKey, nextParams);

    return nextParams;
  }

  private setConnectorHealthStatus(
    exchange: string,
    status: ConnectorHealthStatus,
  ): void {
    const normalizedExchange = this.readString(exchange);

    if (!normalizedExchange) {
      return;
    }

    const previousStatus =
      this.connectorHealthByExchange.get(normalizedExchange);

    if (previousStatus === status) {
      return;
    }

    this.connectorHealthByExchange.set(normalizedExchange, status);
    this.logger.log(
      `Connector health ${normalizedExchange}: ${
        previousStatus || 'CONNECTED'
      } -> ${status}`,
    );
  }

  private async getAvailableBalancesForPair(
    exchangeName: string,
    pair: string,
    accountLabel?: string,
    marketMakingOrderId?: string,
  ): Promise<{
    base: BigNumber;
    quote: BigNumber;
    assets: { base: string; quote: string };
  } | null> {
    return (
      (await this.orderScopedBalanceQueryService?.getAvailableBalancesForPair(
        exchangeName,
        pair,
        accountLabel,
        marketMakingOrderId,
      )) || null
    );
  }

  private async restoreDualAccountVolumeRuntimeState(
    strategy: StrategyInstance,
  ): Promise<void> {
    const trackedOrders = this.getCancelableTrackedOrders(strategy.strategyKey);

    const danglingMakerOrders = trackedOrders.filter(
      (order) => order.role === 'maker',
    );

    if (danglingMakerOrders.length === 0) {
      return;
    }

    await Promise.all(
      danglingMakerOrders.map(async (order) => {
        try {
          const result =
            await this.exchangeConnectorAdapterService?.cancelOrder(
              order.exchange,
              order.pair,
              order.exchangeOrderId,
              order.accountLabel,
            );
          const cancelSucceeded = this.isCancelResultFinal(result);

          this.exchangeOrderTrackerService?.upsertOrder({
            ...order,
            status: cancelSucceeded ? 'cancelled' : 'pending_cancel',
            updatedAt: getRFC3339Timestamp(),
          });
        } catch (error) {
          this.logger.warn(
            `Failed dual-account startup maker cleanup for ${
              strategy.strategyKey
            }:${order.exchangeOrderId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );

    await this.waitForTrackedOrdersToSettle(strategy.strategyKey, 10_000);
  }

  private async restoreRuntimeStateForStrategy(
    strategy: StrategyInstance,
  ): Promise<{ success: boolean; blockedReasons: string[] }> {
    const result = {
      success: true,
      blockedReasons: [] as string[],
    };

    if (
      strategy.strategyType === 'dualAccountVolume' ||
      strategy.strategyType === 'dualAccountBestCapacityVolume'
    ) {
      await this.restoreDualAccountVolumeRuntimeState(strategy);

      return result;
    }

    if (
      strategy.strategyType !== 'pureMarketMaking' ||
      !this.exchangeConnectorAdapterService
    ) {
      return result;
    }

    const params = strategy.parameters as PureMarketMakingStrategyDto;
    const exchange = this.readString(params.exchangeName);
    const pair = this.readString(params.pair);

    if (!exchange || !pair) {
      return result;
    }

    let openOrders: any[] = [];

    try {
      openOrders = await this.exchangeConnectorAdapterService.fetchOpenOrders(
        exchange,
        pair,
        params.accountLabel,
      );
    } catch (error) {
      const { message } = this.toErrorDetails(error);

      this.logger.warn(
        `Startup reconciliation skipped for ${strategy.strategyKey}: fetchOpenOrders failed (${message})`,
      );

      return {
        success: false,
        blockedReasons: [`fetchOpenOrders failed: ${message}`],
      };
    }

    const trackedOrders = (((
      this.exchangeOrderTrackerService as any
    )?.getTrackedOrders?.(strategy.strategyKey) as TrackedOrder[]) ||
      []) as TrackedOrder[];
    const trackedByExchangeOrderId = new Map(
      trackedOrders.map((order) => [order.exchangeOrderId, order]),
    );
    const seenOpenExchangeOrderIds = new Set<string>();

    for (const openOrder of openOrders) {
      const exchangeOrderId = this.readString(openOrder?.id);
      const clientOrderId = this.readString(
        openOrder?.clientOrderId || openOrder?.clientOid,
      );

      if (!exchangeOrderId) {
        continue;
      }

      seenOpenExchangeOrderIds.add(exchangeOrderId);

      const trackedOrder = trackedByExchangeOrderId.get(exchangeOrderId);

      if (trackedOrder) {
        this.exchangeOrderTrackerService?.upsertOrder({
          ...trackedOrder,
          clientOrderId: clientOrderId || trackedOrder.clientOrderId,
          price: this.readString(openOrder?.price, trackedOrder.price),
          qty: this.readString(
            openOrder?.amount || openOrder?.qty,
            trackedOrder.qty,
          ),
          cumulativeFilledQty: this.readString(
            openOrder?.filled,
            trackedOrder.cumulativeFilledQty || '0',
          ),
          status:
            this.normalizeExchangeOrderStatus(openOrder?.status) ||
            trackedOrder.status,
          updatedAt: getRFC3339Timestamp(),
        });
        continue;
      }

      if (
        !(await this.isOrderOwnedByStrategy(
          strategy,
          clientOrderId,
          exchangeOrderId,
        ))
      ) {
        continue;
      }

      const mappedRecovery = await this.strategyStartupRecoveryService?.restoreMappedOpenOrder(
        strategy,
        exchange,
        pair,
        exchangeOrderId,
        clientOrderId,
        openOrder,
        params.accountLabel,
      );

      if (mappedRecovery?.status === 'restored') {
        continue;
      }

      if (mappedRecovery?.status === 'blocked') {
        result.success = false;
        result.blockedReasons.push(mappedRecovery.reason);
        continue;
      }

      await this.cancelRecoveredExchangeOrder(
        strategy,
        exchange,
        pair,
        exchangeOrderId,
        clientOrderId,
        openOrder,
        params.accountLabel,
      );
    }

    for (const trackedOrder of trackedOrders) {
      if (
        this.isTrackedOrderTerminal(trackedOrder.status) ||
        seenOpenExchangeOrderIds.has(trackedOrder.exchangeOrderId)
      ) {
        continue;
      }

      try {
        const latest: Awaited<
          ReturnType<ExchangeConnectorAdapterService['fetchOrder']>
        > = this.runtimeTimingService
          ? await this.runtimeTimingService.measureAsync(
              'strategy.fetch-order',
              {
                accountLabel: trackedOrder.accountLabel || 'default',
                exchange: trackedOrder.exchange,
                exchangeOrderId: trackedOrder.exchangeOrderId,
                pair: trackedOrder.pair,
                reason: 'startup-reconciliation',
              },
              () =>
                this.exchangeConnectorAdapterService.fetchOrder(
                  trackedOrder.exchange,
                  trackedOrder.pair,
                  trackedOrder.exchangeOrderId,
                  trackedOrder.accountLabel,
                ),
              { warnThresholdMs: 500 },
            )
          : await this.exchangeConnectorAdapterService.fetchOrder(
              trackedOrder.exchange,
              trackedOrder.pair,
              trackedOrder.exchangeOrderId,
              trackedOrder.accountLabel,
            );

        if (!latest) {
          continue;
        }

        this.exchangeOrderTrackerService?.upsertOrder({
          ...trackedOrder,
          clientOrderId:
            this.readString(latest?.clientOrderId || latest?.clientOid) ||
            trackedOrder.clientOrderId,
          price: this.readString(latest?.price, trackedOrder.price),
          qty: this.readString(latest?.amount || latest?.qty, trackedOrder.qty),
          cumulativeFilledQty: this.readString(
            latest?.filled,
            trackedOrder.cumulativeFilledQty || '0',
          ),
          status:
            this.normalizeExchangeOrderStatus(latest?.status) ||
            trackedOrder.status,
          updatedAt: getRFC3339Timestamp(),
        });
      } catch (error) {
        const { message } = this.toErrorDetails(error);

        this.logger.warn(
          `Startup fetchOrder reconciliation skipped for ${trackedOrder.exchangeOrderId}: ${message}`,
        );
      }
    }

    try {
      const createRecovery =
        await this.strategyStartupRecoveryService?.recoverInterruptedCreateIntentReservations(
          strategy,
          openOrders,
        );

      if (createRecovery && !createRecovery.success) {
        result.success = false;
        result.blockedReasons.push(...createRecovery.blockedReasons);
      }
    } catch (error) {
      const reason = `interrupted create intent recovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.success = false;
      result.blockedReasons.push(reason);
      this.logger.warn(
        `Startup interrupted intent recovery skipped for ${strategy.strategyKey}: ${reason}`,
      );
    }

    try {
      const cancelRecovery =
        await this.strategyStartupRecoveryService?.recoverInterruptedCancelIntentsForStrategy(
          strategy,
          openOrders,
        );

      if (cancelRecovery && !cancelRecovery.success) {
        result.success = false;
        result.blockedReasons.push(...cancelRecovery.blockedReasons);
      }
    } catch (error) {
      const reason = `interrupted cancel intent recovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.success = false;
      result.blockedReasons.push(reason);
      this.logger.warn(
        `Startup interrupted cancel recovery skipped for ${strategy.strategyKey}: ${reason}`,
      );
    }

    return result;
  }

  private async cancelAllRunningStrategies(reason: string): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      this.stoppingStrategyKeys.add(session.strategyKey);

      try {
        await this.strategyInstanceRepository.update(
          { strategyKey: session.strategyKey },
          { status: 'stopped', updatedAt: getRFC3339Timestamp() },
        );

        if (
          session.strategyType === 'pureMarketMaking' ||
          session.strategyType === 'dualAccountVolume' ||
          session.strategyType === 'dualAccountBestCapacityVolume'
        ) {
          await this.cancelTrackedOrdersForStrategy(session.strategyKey);
          await this.forceTrackedOrdersTerminal(session.strategyKey);
        }

        await this.strategyIntentStoreService?.cancelPendingIntents(
          session.strategyKey,
          `strategy stopped during ${reason}`,
        );
        await this.detachSessionFromExecutor(session);
      } finally {
        this.stoppingStrategyKeys.delete(session.strategyKey);
      }
    }
  }

  private getCancelableTrackedOrders(strategyKey: string): TrackedOrder[] {
    const trackedOrders =
      ((this.exchangeOrderTrackerService as any)?.getTrackedOrders?.(
        strategyKey,
      ) as TrackedOrder[]) ||
      this.exchangeOrderTrackerService?.getOpenOrders(strategyKey) ||
      [];

    return trackedOrders.filter(
      (order) =>
        order?.exchangeOrderId &&
        !this.isTrackedOrderTerminal(String(order.status || '')),
    );
  }

  private async waitForTrackedOrdersToSettle(
    strategyKey: string,
    timeoutMs: number,
  ): Promise<void> {
    if (
      !this.exchangeOrderTrackerService ||
      !this.exchangeConnectorAdapterService ||
      timeoutMs <= 0
    ) {
      return;
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pendingOrders = this.getCancelableTrackedOrders(strategyKey);

      if (pendingOrders.length === 0) {
        return;
      }

      await Promise.all(
        pendingOrders.map(async (order) => {
          try {
            const latest: Awaited<
              ReturnType<ExchangeConnectorAdapterService['fetchOrder']>
            > = this.runtimeTimingService
              ? await this.runtimeTimingService.measureAsync(
                  'strategy.fetch-order',
                  {
                    accountLabel: order.accountLabel || 'default',
                    exchange: order.exchange,
                    exchangeOrderId: order.exchangeOrderId,
                    pair: order.pair,
                    reason: 'shutdown-settle',
                  },
                  () =>
                    this.exchangeConnectorAdapterService?.fetchOrder(
                      order.exchange,
                      order.pair,
                      order.exchangeOrderId,
                      order.accountLabel,
                    ) as Promise<
                      Awaited<
                        ReturnType<
                          ExchangeConnectorAdapterService['fetchOrder']
                        >
                      >
                    >,
                  { warnThresholdMs: 500 },
                )
              : await this.exchangeConnectorAdapterService?.fetchOrder(
                  order.exchange,
                  order.pair,
                  order.exchangeOrderId,
                  order.accountLabel,
                );

            if (!latest) {
              return;
            }

            this.exchangeOrderTrackerService?.upsertOrder({
              ...order,
              clientOrderId:
                this.readString(latest?.clientOrderId || latest?.clientOid) ||
                order.clientOrderId,
              cumulativeFilledQty: this.readString(
                latest?.filled,
                order.cumulativeFilledQty || '0',
              ),
              status:
                this.normalizeExchangeOrderStatus(latest?.status) ||
                order.status,
              updatedAt: getRFC3339Timestamp(),
            });
          } catch {
            return;
          }
        }),
      );

      await this.sleep(200);
    }
  }

  private async forceTrackedOrdersTerminal(
    strategyKey: string,
    status: TrackedOrder['status'] = 'cancelled',
  ): Promise<void> {
    const trackedOrders = this.getCancelableTrackedOrders(strategyKey);

    for (const order of trackedOrders) {
      this.exchangeOrderTrackerService?.upsertOrder({
        ...order,
        status,
        updatedAt: getRFC3339Timestamp(),
      });
    }
  }

  private async shouldTriggerKillSwitch(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
  ): Promise<boolean> {
    const session = this.sessions.get(strategyKey);
    const decision = this.killSwitchService?.evaluatePureMarketMaking(
      session,
      params,
    );

    if (!session || !decision?.triggered) {
      return false;
    }

    this.logger.warn(
      `Kill switch triggered for ${strategyKey}: ${decision.reason}`,
    );
    await this.stopStrategyForUser(
      session.userId,
      session.clientId,
      session.strategyType,
    );

    return true;
  }

  private mergeDualAccountFillRuntimeIntoPersisted(
    runtime: DualAccountVolumeStrategyParams,
    persisted?: Partial<DualAccountVolumeStrategyParams>,
  ): DualAccountVolumeStrategyParams {
    if (!persisted) {
      return runtime;
    }

    const next: DualAccountVolumeStrategyParams = {
      ...runtime,
    };

    if (Number.isFinite(Number(persisted.publishedCycles))) {
      next.publishedCycles = Math.max(
        Number(runtime.publishedCycles || 0),
        Number(persisted.publishedCycles),
      );
    }

    if (Number.isFinite(Number(persisted.completedCycles))) {
      next.completedCycles = Math.max(
        Number(runtime.completedCycles || 0),
        Number(persisted.completedCycles),
      );
    }

    if (Number.isFinite(Number(persisted.tradedQuoteVolume))) {
      next.tradedQuoteVolume = Math.max(
        Number(runtime.tradedQuoteVolume || 0),
        Number(persisted.tradedQuoteVolume),
      );
    }

    return next;
  }

  private async isOrderOwnedByStrategy(
    strategy: StrategyInstance,
    clientOrderId: string,
    exchangeOrderId: string,
  ): Promise<boolean> {
    const strategyOrderId = this.readString(
      strategy.marketMakingOrderId,
      strategy.clientId,
    );

    if (!strategyOrderId || !this.exchangeOrderMappingService) {
      return false;
    }

    if (clientOrderId) {
      const byClientOrderId =
        await this.exchangeOrderMappingService.findByClientOrderId(
          clientOrderId,
        );

      if (byClientOrderId?.orderId === strategyOrderId) {
        return true;
      }
    }

    if (exchangeOrderId) {
      const byExchangeOrderId =
        await this.exchangeOrderMappingService.findByExchangeOrderId(
          exchangeOrderId,
        );

      if (byExchangeOrderId?.orderId === strategyOrderId) {
        return true;
      }
    }

    return false;
  }

  private async cancelRecoveredExchangeOrder(
    strategy: StrategyInstance,
    exchange: string,
    pair: string,
    exchangeOrderId: string,
    clientOrderId: string,
    openOrder: Record<string, any>,
    accountLabel?: string,
  ): Promise<void> {
    try {
      const result = await this.exchangeConnectorAdapterService?.cancelOrder(
        exchange,
        pair,
        exchangeOrderId,
        accountLabel,
      );
      const nextStatus = this.isCancelResultFinal(result)
        ? 'cancelled'
        : 'pending_cancel';

      this.exchangeOrderTrackerService?.upsertOrder({
        orderId: this.readString(
          strategy.marketMakingOrderId,
          strategy.clientId,
        ),
        strategyKey: strategy.strategyKey,
        exchange,
        accountLabel,
        pair,
        exchangeOrderId,
        clientOrderId: clientOrderId || undefined,
        side: openOrder?.side === 'sell' ? 'sell' : 'buy',
        price: this.readString(openOrder?.price, '0'),
        qty: this.readString(openOrder?.amount || openOrder?.qty, '0'),
        cumulativeFilledQty: this.readString(openOrder?.filled, '0'),
        status: nextStatus,
        createdAt: getRFC3339Timestamp(),
        updatedAt: getRFC3339Timestamp(),
      });
    } catch (error) {
      const { message } = this.toErrorDetails(error);

      this.logger.warn(
        `Failed startup orphan cleanup for ${strategy.strategyKey}:${exchangeOrderId}: ${message}`,
      );
    }
  }

  private isTrackedOrderTerminal(status: string): boolean {
    return ['filled', 'cancelled', 'failed'].includes(
      String(status || '').toLowerCase(),
    );
  }

  private isCancelResultFinal(result: Record<string, unknown> | undefined) {
    const status = String(result?.status || '').toLowerCase();

    return (
      !status || !['new', 'open', 'pending', 'pending_cancel'].includes(status)
    );
  }

  private normalizeExchangeOrderStatus(
    status: unknown,
  ): TrackedOrder['status'] | null {
    const normalized = String(status || '')
      .trim()
      .toLowerCase();

    if (!normalized) {
      return null;
    }
    if (normalized === 'open' || normalized === 'new') {
      return 'open';
    }
    if (
      normalized === 'partially_filled' ||
      normalized === 'partially-filled'
    ) {
      return 'partially_filled';
    }
    if (normalized === 'pending_cancel') {
      return 'pending_cancel';
    }
    if (normalized === 'closed' || normalized === 'filled') {
      return 'filled';
    }
    if (normalized === 'canceled' || normalized === 'cancelled') {
      return 'cancelled';
    }

    return 'failed';
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isWithinTimeWindow(params: TimeIndicatorStrategyDto): boolean {
    const now = new Date();
    const wd = now.getDay();
    const hr = now.getHours();

    if (params.allowedWeekdays?.length && !params.allowedWeekdays.includes(wd))
      return false;
    if (params.allowedHours?.length && !params.allowedHours.includes(hr))
      return false;

    return true;
  }

  private async fetchCandles(
    ex: any,
    symbol: string,
    timeframe: string,
    lookback: number,
  ): Promise<number[][]> {
    try {
      const limit = Math.max(lookback, 200);

      return await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
    } catch (e: unknown) {
      const { message } = this.toErrorDetails(e);

      this.logger.error(
        `fetchOHLCV error on ${ex.id} ${symbol} ${timeframe}: ${message}`,
      );

      return [];
    }
  }

  private parseBaseQuote(
    symbol: string,
  ): { base: string; quote: string } | null {
    if (symbol.includes('/')) {
      const [base, quote] = symbol.split('/');

      if (base && quote) {
        return { base, quote };
      }

      return null;
    }

    const knownQuotes = [
      'USDT',
      'USDC',
      'BUSD',
      'USD',
      'BTC',
      'ETH',
      'BNB',
      'EUR',
    ];
    const upper = symbol.toUpperCase();

    for (const q of knownQuotes) {
      if (upper.endsWith(q) && upper.length > q.length) {
        return {
          base: symbol.slice(0, symbol.length - q.length),
          quote: symbol.slice(symbol.length - q.length),
        };
      }
    }

    return null;
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

  private mergeDualAccountConfigIntoRuntime(
    runtime: DualAccountVolumeStrategyParams,
    persisted?: Partial<DualAccountVolumeStrategyParams>,
  ): DualAccountVolumeStrategyParams {
    return dualAccountConfig.mergeDualAccountConfigIntoRuntime(
      runtime,
      persisted,
    );
  }

  private resolveNextDualAccountCadenceMs(
    params: DualAccountVolumeStrategyParams,
  ): number {
    return dualAccountConfig.resolveNextDualAccountCadenceMs(params);
  }

  private resolveDualAccountBehaviorProfile(
    params: DualAccountVolumeStrategyParams,
    accountLabel: string,
  ): DualAccountBehaviorProfile {
    return dualAccountConfig.resolveDualAccountBehaviorProfile(
      params,
      accountLabel,
    );
  }

  private normalizeDualAccountStrategyParams(
    params: ExecuteDualAccountVolumeStrategyDto,
  ): DualAccountVolumeStrategyParams {
    return dualAccountConfig.normalizeDualAccountStrategyParams(params);
  }

  private normalizeDualAccountBestCapacityStrategyParams(
    params: ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ): DualAccountVolumeStrategyParams {
    return dualAccountConfig.normalizeDualAccountBestCapacityStrategyParams(
      params,
    );
  }

  private isBestCapacityConfig(
    params: DualAccountVolumeStrategyParams,
  ): boolean {
    return dualAccountConfig.isBestCapacityConfig(params);
  }

  private resolveStrategyInputPair(symbol: unknown, pair: unknown): string {
    return dualAccountConfig.resolveStrategyInputPair(symbol, pair);
  }

  private resolveRuntimePair(
    params: Pick<VolumeStrategyParams, 'symbol' | 'pair'>,
  ): string {
    return dualAccountConfig.resolveRuntimePair(params);
  }

  private maybeWarnDualAccountBestCapacityIgnoredFields(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
  ): void {
    if (
      this.loggedDualAccountBestCapacityIgnoredConfigWarnings.has(strategyKey)
    ) {
      return;
    }

    const ignoredFields: string[] = [];

    if (params.dynamicRoleSwitching) {
      ignoredFields.push('dynamicRoleSwitching');
    }
    if (params.postOnlySide !== undefined) {
      ignoredFields.push('postOnlySide');
    }
    if (params.buyBias !== undefined) {
      ignoredFields.push('buyBias');
    }

    if (ignoredFields.length === 0) {
      return;
    }

    this.loggedDualAccountBestCapacityIgnoredConfigWarnings.add(strategyKey);
    this.logger.warn(
      `Dual-account best-capacity strategy ${strategyKey}: ignoring config fields ${ignoredFields.join(
        ', ',
      )}`,
    );
  }

  private applyVariance(
    baseValue: number,
    variance?: number,
    multiplier?: number,
    varianceSample?: number,
  ): number {
    return dualAccountConfig.applyVariance(
      baseValue,
      variance,
      multiplier,
      varianceSample,
    );
  }

  private isWithinDualAccountProfileWindow(
    profile: DualAccountBehaviorProfile,
  ): boolean {
    return dualAccountConfig.isWithinDualAccountProfileWindow(profile);
  }

  private toErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }

    return { message: String(error) };
  }

}

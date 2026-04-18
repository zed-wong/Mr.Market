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
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
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

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from '../execution/exchange-order-mapping.service';
import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { BalanceStateRefreshService } from '../balance-state/balance-state-refresh.service';
import { BalanceLedgerService } from '../ledger/balance-ledger.service';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from '../trackers/exchange-order-tracker.service';
import { OrderBookIngestionService } from '../trackers/order-book-ingestion.service';
import { UserStreamIngestionService } from '../trackers/user-stream-ingestion.service';
import { ExecutorAction } from './config/executor-action.types';
import type {
  AmmDexVolumeStrategyParams,
  CexVolumeStrategyParams,
  ConnectorHealthStatus,
  DualAccountBalanceSnapshot,
  DualAccountBestCapacityCandidate,
  DualAccountBehaviorProfile,
  DualAccountExecutionPlan,
  DualAccountPairBalances,
  DualAccountRebalanceCandidate,
  DualAccountResolvedAccounts,
  DualAccountTradeabilityPlan,
  DualAccountVolumeStrategyParams,
  PooledExecutorTarget,
  VolumeStrategyParams,
} from './config/strategy-params.types';
import {
  ArbitrageStrategyDto,
  DexAdapterId,
  DualAccountBehaviorProfileDto,
  DualAccountBehaviorProfilesDto,
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
import { TimeIndicatorStrategyDto } from './config/timeIndicator.dto';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { StrategyMarketDataProviderService } from './data/strategy-market-data-provider.service';
import { ExecutorRegistry } from './execution/executor-registry';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from './intent/quote-executor-manager.service';

type DualAccountCapacityDiagnostics = {
  buyCapacity: BigNumber;
  sellCapacity: BigNumber;
  preferredSideCapacity: BigNumber;
  selectedSideCapacity: BigNumber;
  capacityUtilization: BigNumber;
  capacityLimited: boolean;
  capacityLimiter:
    | 'maker_base'
    | 'maker_quote'
    | 'taker_base'
    | 'taker_quote'
    | 'balanced'
    | 'unknown';
  rebalanceNeeded: boolean;
};

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
  private readonly latestIntentsByStrategy = new Map<
    string,
    StrategyOrderIntent[]
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
    private readonly balanceStateCacheService?: BalanceStateCacheService,
    @Optional()
    private readonly balanceStateRefreshService?: BalanceStateRefreshService,
    @Optional()
    private readonly balanceLedgerService?: BalanceLedgerService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly exchangeOrderMappingService?: ExchangeOrderMappingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register('strategy-service', this, 20);
    this.detachExchangeReadyListener = this.exchangeInitService.onExchangeReady(
      (exchangeName, accountLabel) =>
        void this.activatePendingStrategiesForExchange(
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
      fillId?: string | null;
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
      cumulativeQty?: string;
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

    for (const executor of executors) {
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
      }
    }
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
        { status: 'stopped', updatedAt: new Date() },
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
    );
    await this.upsertSession(
      strategyKey,
      'dualAccountVolume',
      params.userId,
      params.clientId,
      cadenceMs,
      normalizedParams,
    );
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
    );
    await this.upsertSession(
      strategyKey,
      'dualAccountBestCapacityVolume',
      params.userId,
      params.clientId,
      cadenceMs,
      normalizedParams,
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

    this.stoppingStrategyKeys.add(strategyKey);

    try {
      await this.strategyInstanceRepository.update(
        { strategyKey },
        { status: 'stopped', updatedAt: new Date() },
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
        status: 'CANCELLED',
        metadata: {
          reason: 'strategy stopped',
        },
      };

      await this.publishIntents(strategyKey, [stopIntent]);
      this.latestIntentsByStrategy.delete(strategyKey);
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
    definitionId: string,
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

  clearIntentsForStrategy(strategyKey: string): void {
    this.latestIntentsByStrategy.delete(strategyKey);
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

      this.startPrivateOrderWatcher(
        strategyType,
        pooledTarget.exchange,
        pooledTarget.pair,
        accountLabel,
      );
      this.startBalanceWatchers(strategyType, pooledTarget.exchange, params);
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
    await this.restoreRuntimeStateForStrategy(strategy);
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
      currentSession.params = nextParams;
      this.sessions.set(session.strategyKey, currentSession);

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

    const trackedBestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

    if (!trackedBestBidAsk) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: tracked order book unavailable`,
      );

      return [];
    }

    const { bestBid, bestAsk } = trackedBestBidAsk;

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
    const latestParams = this.mergeDualAccountConfigIntoRuntime(
      runtimeParams,
      persistedParams,
    );

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

    if (this.getCancelableTrackedOrders(session.strategyKey).length > 0) {
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
    if (!action.metadata || typeof action.metadata !== 'object') {
      return false;
    }

    const metadata = action.metadata as Record<string, unknown>;

    return metadata.role === 'rebalance' || metadata.rebalance === true;
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
    const preferredSide = await this.resolveDualAccountPreferredSide(
      params,
      publishedCycles,
      balanceSnapshot?.makerBalances || undefined,
    );

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping dual-account volume cycle for ${strategyKey}: invalid non-positive price ${price.toFixed()}`,
      );

      return [];
    }

    const resolvedExecution = await this.resolveDualAccountExecutionPlan(
      strategyKey,
      params,
      preferredSide,
      price,
      bestBidBn,
      bestAskBn,
      feeBufferRate,
      balanceSnapshot,
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
    const makerDelayMs = this.resolveDualAccountMakerDelayMs(
      params,
      resolvedAccounts.makerAccountLabel,
    );
    const accountBuyBias = profile.buyBias ?? params.buyBias;
    const fallbackApplied = side !== preferredSide;
    const capacityDiagnostics = balanceSnapshot
      ? this.buildDualAccountCapacityDiagnostics(
          params,
          adjustedQuote.price,
          feeBufferRate,
          balanceSnapshot,
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
        `makerDelayMs=${makerDelayMs}`,
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
          makerDelayMs,
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
    const makerDelayMs = this.resolveDualAccountMakerDelayMs(
      params,
      resolvedAccounts.makerAccountLabel,
    );
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
          makerDelayMs,
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
    const configured: DualAccountResolvedAccounts = {
      makerAccountLabel: params.makerAccountLabel,
      takerAccountLabel: params.takerAccountLabel,
    };
    const capacity1 = this.computeDualAccountCapacity(
      makerBalances,
      takerBalances,
      side,
      price,
      feeBufferRate,
    );
    const capacity2 = this.computeDualAccountCapacity(
      takerBalances,
      makerBalances,
      side,
      price,
      feeBufferRate,
    );

    if (params.dynamicRoleSwitching && capacity2.isGreaterThan(capacity1)) {
      this.logger.log(
        `Dynamic role switching: swapping maker=${params.makerAccountLabel}→${
          params.takerAccountLabel
        } taker=${params.takerAccountLabel}→${
          params.makerAccountLabel
        } for side=${side} (capacity configured=${capacity1.toFixed()} swapped=${capacity2.toFixed()})`,
      );

      return {
        makerAccountLabel: params.takerAccountLabel,
        takerAccountLabel: params.makerAccountLabel,
        makerBalances: takerBalances,
        takerBalances: makerBalances,
        capacity: capacity2,
      };
    }

    return {
      ...configured,
      makerBalances,
      takerBalances,
      capacity: capacity1,
    };
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
    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      return new BigNumber(0);
    }

    const retainFactor = feeBufferRate.isFinite()
      ? BigNumber.max(
          new BigNumber(1).minus(
            feeBufferRate.isGreaterThanOrEqualTo(0) ? feeBufferRate : 0,
          ),
          new BigNumber(0),
        )
      : new BigNumber(1);

    return side === 'buy'
      ? BigNumber.min(
          makerBalances.quote.dividedBy(price).multipliedBy(retainFactor),
          takerBalances.base,
        )
      : BigNumber.min(
          makerBalances.base,
          takerBalances.quote.dividedBy(price).multipliedBy(retainFactor),
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
    const buyResolved = this.resolveDualAccountCycleAccountsFromBalances(
      params,
      'buy',
      price,
      snapshot.makerBalances,
      snapshot.takerBalances,
      feeBufferRate,
    );
    const sellResolved = this.resolveDualAccountCycleAccountsFromBalances(
      params,
      'sell',
      price,
      snapshot.makerBalances,
      snapshot.takerBalances,
      feeBufferRate,
    );
    const buyCapacity = buyResolved.capacity || new BigNumber(0);
    const sellCapacity = sellResolved.capacity || new BigNumber(0);
    const preferredSideCapacity =
      preferredSide === 'buy' ? buyCapacity : sellCapacity;
    const selectedSideCapacity =
      selectedSide === 'buy' ? buyCapacity : sellCapacity;
    const capacityUtilization = selectedSideCapacity.isGreaterThan(0)
      ? effectiveQty.dividedBy(selectedSideCapacity)
      : new BigNumber(0);
    const smallerCapacity = BigNumber.min(buyCapacity, sellCapacity);
    const largerCapacity = BigNumber.max(buyCapacity, sellCapacity);
    const imbalanceRatio = smallerCapacity.isGreaterThan(0)
      ? largerCapacity.dividedBy(smallerCapacity)
      : new BigNumber(Infinity);

    return {
      buyCapacity,
      sellCapacity,
      preferredSideCapacity,
      selectedSideCapacity,
      capacityUtilization,
      capacityLimited: selectedSideCapacity.isGreaterThan(0)
        ? effectiveQty.isGreaterThanOrEqualTo(selectedSideCapacity)
        : false,
      capacityLimiter: this.resolveDualAccountCapacityLimiter(
        selectedSide === 'buy' ? buyResolved : sellResolved,
        selectedSide,
        price,
        feeBufferRate,
      ),
      rebalanceNeeded:
        buyCapacity.isLessThanOrEqualTo(0) ||
        sellCapacity.isLessThanOrEqualTo(0) ||
        preferredSideCapacity.isLessThanOrEqualTo(0) ||
        imbalanceRatio.isGreaterThanOrEqualTo(2),
    };
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
    if (
      !resolvedAccounts.makerBalances ||
      !resolvedAccounts.takerBalances ||
      !price.isFinite() ||
      price.isLessThanOrEqualTo(0)
    ) {
      return 'unknown';
    }

    const retainFactor = feeBufferRate.isFinite()
      ? BigNumber.max(
          new BigNumber(1).minus(
            feeBufferRate.isGreaterThanOrEqualTo(0) ? feeBufferRate : 0,
          ),
          new BigNumber(0),
        )
      : new BigNumber(1);

    if (side === 'buy') {
      const makerQuoteCapacity = resolvedAccounts.makerBalances.quote
        .dividedBy(price)
        .multipliedBy(retainFactor);
      const takerBaseCapacity = resolvedAccounts.takerBalances.base;

      if (makerQuoteCapacity.isLessThan(takerBaseCapacity)) {
        return 'maker_quote';
      }
      if (takerBaseCapacity.isLessThan(makerQuoteCapacity)) {
        return 'taker_base';
      }

      return 'balanced';
    }

    const makerBaseCapacity = resolvedAccounts.makerBalances.base;
    const takerQuoteCapacity = resolvedAccounts.takerBalances.quote
      .dividedBy(price)
      .multipliedBy(retainFactor);

    if (makerBaseCapacity.isLessThan(takerQuoteCapacity)) {
      return 'maker_base';
    }
    if (takerQuoteCapacity.isLessThan(makerBaseCapacity)) {
      return 'taker_quote';
    }

    return 'balanced';
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
    const retainFactor = feeBufferRate.isFinite()
      ? BigNumber.max(
          new BigNumber(1).minus(
            feeBufferRate.isGreaterThanOrEqualTo(0) ? feeBufferRate : 0,
          ),
          new BigNumber(0),
        )
      : new BigNumber(1);
    const candidates: Omit<DualAccountBestCapacityCandidate, 'candidateRank'>[] =
      ([
        {
          side: 'buy' as const,
          makerAccountLabel: params.makerAccountLabel,
          takerAccountLabel: params.takerAccountLabel,
          makerBalances: snapshot.makerBalances,
          takerBalances: snapshot.takerBalances,
          capacity: BigNumber.min(
            snapshot.makerBalances.quote
              .dividedBy(price)
              .multipliedBy(retainFactor),
            snapshot.takerBalances.base,
          ),
          roleAssignment: 'configured' as const,
        },
        {
          side: 'buy' as const,
          makerAccountLabel: params.takerAccountLabel,
          takerAccountLabel: params.makerAccountLabel,
          makerBalances: snapshot.takerBalances,
          takerBalances: snapshot.makerBalances,
          capacity: BigNumber.min(
            snapshot.takerBalances.quote
              .dividedBy(price)
              .multipliedBy(retainFactor),
            snapshot.makerBalances.base,
          ),
          roleAssignment: 'swapped' as const,
        },
        {
          side: 'sell' as const,
          makerAccountLabel: params.makerAccountLabel,
          takerAccountLabel: params.takerAccountLabel,
          makerBalances: snapshot.makerBalances,
          takerBalances: snapshot.takerBalances,
          capacity: BigNumber.min(
            snapshot.makerBalances.base,
            snapshot.takerBalances.quote
              .dividedBy(price)
              .multipliedBy(retainFactor),
          ),
          roleAssignment: 'configured' as const,
        },
        {
          side: 'sell' as const,
          makerAccountLabel: params.takerAccountLabel,
          takerAccountLabel: params.makerAccountLabel,
          makerBalances: snapshot.takerBalances,
          takerBalances: snapshot.makerBalances,
          capacity: BigNumber.min(
            snapshot.takerBalances.base,
            snapshot.makerBalances.quote
              .dividedBy(price)
              .multipliedBy(retainFactor),
          ),
          roleAssignment: 'swapped' as const,
        },
      ] as const).filter(
        (candidate) =>
          candidate.capacity.isFinite() && candidate.capacity.isGreaterThan(0),
      );

    candidates.sort((left, right) => {
      const capacityComparison = right.capacity.comparedTo(left.capacity);

      if (capacityComparison !== 0) {
        return capacityComparison;
      }

      if (left.roleAssignment !== right.roleAssignment) {
        return left.roleAssignment === 'configured' ? -1 : 1;
      }

      if (left.side !== right.side) {
        return left.side === 'buy' ? -1 : 1;
      }

      return 0;
    });

    return candidates.map((candidate, index) => ({
      ...candidate,
      candidateRank: index + 1,
    }));
  }

  private async resolveBestExecutableDualAccountCandidate(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    candidates: DualAccountBestCapacityCandidate[],
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
  ): Promise<(DualAccountExecutionPlan & { candidate: DualAccountBestCapacityCandidate }) | null> {
    const tradeAmountVarianceSample = Math.random();

    for (const candidate of candidates) {
      const execution = await this.evaluateDualAccountExecutionForSideWithAccounts(
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

    const candidates = (
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

    if (candidates.length === 0) {
      return null;
    }

    const selected = candidates.reduce((best, candidate) =>
      candidate.futureExecution.capacity.isGreaterThan(
        best.futureExecution.capacity,
      )
        ? candidate
        : best,
    );

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

    const adjustedQuote = await this.quantizeAndValidateQuote(
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
    return {
      base: new BigNumber(balances.base),
      quote: new BigNumber(balances.quote),
      assets: {
        ...balances.assets,
      },
    };
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

    const profile = this.resolveDualAccountBehaviorProfile(
      params,
      resolvedAccounts.makerAccountLabel,
    );

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
        `Dual-account volume ${strategyKey}: invalid qty ${(params.maxOrderAmount ?? params.baseTradeAmount) || 0} for side=${side}`,
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
    if (!this.exchangeConnectorAdapterService) {
      return new BigNumber(0);
    }

    try {
      const rules = await this.exchangeConnectorAdapterService.loadTradingRules(
        exchangeName,
        pair,
      );
      const makerFee = new BigNumber(rules.makerFee || 0);
      const takerFee = new BigNumber(rules.takerFee || 0);

      const totalFeeRate = makerFee.plus(takerFee);

      if (!totalFeeRate.isFinite() || totalFeeRate.isLessThanOrEqualTo(0)) {
        return new BigNumber(0);
      }

      return totalFeeRate;
    } catch (error) {
      this.logger.warn(
        `Failed to load dual-account fee buffer for ${exchangeName} ${pair}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return new BigNumber(0);
    }
  }

  private findDualAccountCandidateCapacity(
    candidates: DualAccountBestCapacityCandidate[],
    side: 'buy' | 'sell',
    roleAssignment: 'configured' | 'swapped',
  ): BigNumber | undefined {
    return candidates.find(
      (candidate) =>
        candidate.side === side && candidate.roleAssignment === roleAssignment,
    )?.capacity;
  }

  private async loadDualAccountBalanceSnapshot(
    params: DualAccountVolumeStrategyParams,
    context: 'execution' | 'rebalance',
  ): Promise<DualAccountBalanceSnapshot | null> {
    try {
      const [makerBalances, takerBalances] = await Promise.all([
        this.getAvailableBalancesForPair(
          params.exchangeName,
          params.symbol,
          params.makerAccountLabel,
        ),
        this.getAvailableBalancesForPair(
          params.exchangeName,
          params.symbol,
          params.takerAccountLabel,
        ),
      ]);

      if (!makerBalances || !takerBalances) {
        return null;
      }

      return {
        makerBalances,
        takerBalances,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load dual-account ${context} balances for ${
          params.exchangeName
        } ${params.symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

  private async resolveDualAccountPreferredSide(
    params: DualAccountVolumeStrategyParams,
    publishedCycles: number,
    makerBalances?: DualAccountPairBalances,
  ): Promise<'buy' | 'sell'> {
    if (params.postOnlySide !== 'inventory_balance') {
      return this.resolveVolumeSide(
        params.postOnlySide,
        publishedCycles,
        params.buyBias,
      );
    }

    const resolvedMakerBalances =
      makerBalances ||
      (await this.getAvailableBalancesForPair(
        params.exchangeName,
        params.symbol,
        params.makerAccountLabel,
      ));

    if (!resolvedMakerBalances) {
      return this.resolveVolumeSide(undefined, publishedCycles, params.buyBias);
    }

    const quoteValue = resolvedMakerBalances.quote;
    const baseValue = resolvedMakerBalances.base.multipliedBy(
      await this.resolveInventoryReferencePrice(
        params.exchangeName,
        params.symbol,
      ),
    );
    const totalValue = quoteValue.plus(baseValue);

    if (!totalValue.isFinite() || totalValue.isLessThanOrEqualTo(0)) {
      return this.resolveVolumeSide(undefined, publishedCycles, params.buyBias);
    }

    const imbalance = quoteValue.minus(baseValue).dividedBy(totalValue);

    if (imbalance.isGreaterThan(0.05)) {
      return 'buy';
    }

    if (imbalance.isLessThan(-0.05)) {
      return 'sell';
    }

    return this.resolveVolumeSide(undefined, publishedCycles, params.buyBias);
  }

  private async resolveInventoryReferencePrice(
    exchangeName: string,
    pair: string,
  ): Promise<BigNumber> {
    const trackedBestBidAsk =
      this.strategyMarketDataProviderService?.getTrackedBestBidAsk(
        exchangeName,
        pair,
      );

    if (trackedBestBidAsk?.bestBid && trackedBestBidAsk?.bestAsk) {
      return new BigNumber(trackedBestBidAsk.bestBid)
        .plus(trackedBestBidAsk.bestAsk)
        .dividedBy(2);
    }

    const bestBidAsk =
      await this.strategyMarketDataProviderService?.getBestBidAsk(
        exchangeName,
        pair,
      );

    if (bestBidAsk?.bestBid && bestBidAsk?.bestAsk) {
      return new BigNumber(bestBidAsk.bestBid)
        .plus(bestBidAsk.bestAsk)
        .dividedBy(2);
    }

    return new BigNumber(1);
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
    if (
      this.isDualAccountMakerPriceValid(side, candidatePrice, bestBid, bestAsk)
    ) {
      return candidatePrice;
    }

    const boundaryPrice = side === 'buy' ? bestBid : bestAsk;
    let adjustedPrice = boundaryPrice;

    if (this.exchangeConnectorAdapterService) {
      const quantized = this.exchangeConnectorAdapterService.quantizeOrder(
        params.exchangeName,
        params.symbol,
        qty.toFixed(),
        boundaryPrice.toFixed(),
        accountLabel,
      );

      adjustedPrice = new BigNumber(quantized.price);
    }

    if (
      this.isDualAccountMakerPriceValid(side, adjustedPrice, bestBid, bestAsk)
    ) {
      this.logger.log(
        [
          'Adjusted dual-account maker price',
          `strategy=${strategyKey}`,
          `side=${side}`,
          `original=${candidatePrice.toFixed()}`,
          `adjusted=${adjustedPrice.toFixed()}`,
          `bestBid=${bestBid.toFixed()}`,
          `bestAsk=${bestAsk.toFixed()}`,
          'reason=quantized_outside_top_of_book',
        ].join(' | '),
      );

      return adjustedPrice;
    }

    this.logger.warn(
      [
        'Skipping dual-account volume cycle after invalid maker price quantization',
        `strategy=${strategyKey}`,
        `side=${side}`,
        `candidate=${candidatePrice.toFixed()}`,
        `adjusted=${adjustedPrice.toFixed()}`,
        `bestBid=${bestBid.toFixed()}`,
        `bestAsk=${bestAsk.toFixed()}`,
      ].join(' | '),
    );

    return null;
  }

  private isDualAccountMakerPriceValid(
    side: 'buy' | 'sell',
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
  ): boolean {
    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      return false;
    }

    return side === 'buy'
      ? price.isGreaterThanOrEqualTo(bestBid) && price.isLessThan(bestAsk)
      : price.isGreaterThan(bestBid) && price.isLessThanOrEqualTo(bestAsk);
  }

  async buildPureMarketMakingActions(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const actions: ExecutorAction[] = [];
    const cancelledExchangeOrderIds = new Set<string>();
    const priceExchange = params.oracleExchangeName
      ? params.oracleExchangeName
      : params.exchangeName;

    if (await this.shouldTriggerKillSwitch(strategyKey, params)) {
      return [];
    }

    if (this.getConnectorHealthStatus(params.exchangeName) !== 'CONNECTED') {
      return [];
    }
    let priceSource: BigNumber;

    try {
      priceSource = new BigNumber(
        await this.getPriceSource(
          priceExchange,
          params.pair,
          params.priceSourceType,
        ),
      );
      this.setConnectorHealthStatus(params.exchangeName, 'CONNECTED');
    } catch (error) {
      this.setConnectorHealthStatus(params.exchangeName, 'DISCONNECTED');
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

    const activeOrders =
      this.exchangeOrderTrackerService?.getActiveSlotOrders?.(strategyKey) ||
      this.exchangeOrderTrackerService?.getOpenOrders?.(strategyKey) ||
      [];
    const liveOrders =
      this.exchangeOrderTrackerService?.getLiveOrders?.(strategyKey) ||
      activeOrders.filter(
        (order) =>
          order.status === 'open' || order.status === 'partially_filled',
      );
    const session = this.sessions.get(strategyKey);
    const filledOrderDelay = Number(params.filledOrderDelay || 0);

    if (
      session &&
      Number.isFinite(filledOrderDelay) &&
      filledOrderDelay > 0 &&
      typeof session.lastFillTimestamp === 'number' &&
      Date.now() - session.lastFillTimestamp < filledOrderDelay
    ) {
      return [];
    }

    const liveOrdersBySide = {
      buy: liveOrders.filter((order) => order.side === 'buy').length,
      sell: liveOrders.filter((order) => order.side === 'sell').length,
    };
    const staleCancellationActions = this.buildStaleOrderActions(
      strategyKey,
      params,
      ts,
      priceSource,
      liveOrders,
    );

    for (const action of staleCancellationActions) {
      actions.push(action);
      if (action.mixinOrderId) {
        cancelledExchangeOrderIds.add(action.mixinOrderId);
      }
    }

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
        })
      : this.buildLegacyQuotes(params, priceSource);

    this.logger.log(
      `[${strategyKey}] midPrice=${priceSource.toFixed()} bidSpread=${
        params.bidSpread
      } askSpread=${params.askSpread} layers=${
        params.numberOfLayers
      } liveBuys=${liveOrdersBySide.buy} liveSells=${liveOrdersBySide.sell}`,
    );

    const minimumSpread = Number(params.minimumSpread || 0);
    const availableBalances = await this.getAvailableBalancesForPair(
      params.exchangeName,
      params.pair,
      params.accountLabel,
    );
    const targetActionBySlot = new Map<string, ExecutorAction>();

    for (const quote of quotes) {
      const slotKey = quote.slotKey || `layer-${quote.layer}-${quote.side}`;
      const quotePrice = new BigNumber(quote.price);

      if (
        quote.side === 'buy' &&
        params.ceilingPrice !== undefined &&
        params.ceilingPrice > 0 &&
        priceSource.isGreaterThan(params.ceilingPrice)
      ) {
        this.logger.log(
          `[${strategyKey}] Skipped ${slotKey} buy: price ${priceSource.toFixed()} > ceilingPrice ${
            params.ceilingPrice
          }`,
        );
        continue;
      }
      if (
        quote.side === 'sell' &&
        params.floorPrice !== undefined &&
        params.floorPrice > 0 &&
        priceSource.isLessThan(params.floorPrice)
      ) {
        this.logger.log(
          `[${strategyKey}] Skipped ${slotKey} sell: price ${priceSource.toFixed()} < floorPrice ${
            params.floorPrice
          }`,
        );
        continue;
      }

      const effectiveSpread = quotePrice
        .minus(priceSource)
        .abs()
        .dividedBy(priceSource);
      const effectiveMinimumSpread = Math.max(
        minimumSpread,
        this.estimateMakerFeeSpread(params.exchangeName, params.pair),
      );

      if (
        Number.isFinite(effectiveMinimumSpread) &&
        effectiveMinimumSpread > 0 &&
        effectiveSpread.isLessThan(effectiveMinimumSpread)
      ) {
        this.logger.log(
          `[${strategyKey}] Skipped ${slotKey} ${quote.qty}@${
            quote.price
          }: effective spread ${effectiveSpread.toFixed()} < effectiveMinimumSpread ${effectiveMinimumSpread}`,
        );
        continue;
      }

      const quantized = await this.quantizeAndValidateQuote(
        strategyKey,
        params.exchangeName,
        params.pair,
        params.accountLabel,
        quote.side,
        quote.layer,
        slotKey,
        new BigNumber(quote.qty),
        quotePrice,
        availableBalances,
      );

      if (!quantized) {
        continue;
      }

      targetActionBySlot.set(slotKey, {
        ...this.createIntent(
          strategyKey,
          strategyKey,
          params.userId,
          params.clientId,
          params.exchangeName,
          params.pair,
          quote.side,
          quantized.price,
          quantized.qty,
          ts,
          `mm-${slotKey}`,
          'clob_cex',
          undefined,
          true,
          params.accountLabel,
        ),
        slotKey,
      });
    }

    const unassignedActiveOrders = activeOrders.filter(
      (order) => !order.slotKey,
    );

    for (const order of unassignedActiveOrders) {
      this.appendCancelAction(
        actions,
        cancelledExchangeOrderIds,
        this.buildCancelOrderAction(
          strategyKey,
          params,
          order,
          ts,
          'unassigned',
        ),
      );
    }

    if (unassignedActiveOrders.length > 0) {
      return actions;
    }

    const activeOrderBySlot = new Map<string, TrackedOrder>();

    for (const order of activeOrders) {
      if (!order.slotKey) {
        continue;
      }
      if (activeOrderBySlot.has(order.slotKey)) {
        this.logger.log(
          `[${strategyKey}] reason=slot_occupied slotKey=${order.slotKey} exchangeOrderId=${order.exchangeOrderId}`,
        );
        continue;
      }
      activeOrderBySlot.set(order.slotKey, order);
    }

    const tolerance = new BigNumber(params.orderRefreshTolerancePct || 0);
    const slotKeys = new Set<string>([
      ...targetActionBySlot.keys(),
      ...activeOrderBySlot.keys(),
    ]);

    for (const slotKey of slotKeys) {
      const targetAction = targetActionBySlot.get(slotKey);
      const currentOrder = activeOrderBySlot.get(slotKey);

      if (!currentOrder && targetAction) {
        actions.push(targetAction);
        continue;
      }

      if (currentOrder && !targetAction) {
        this.appendCancelAction(
          actions,
          cancelledExchangeOrderIds,
          this.buildCancelOrderAction(
            strategyKey,
            params,
            currentOrder,
            ts,
            slotKey,
          ),
        );
        continue;
      }

      if (!currentOrder || !targetAction) {
        continue;
      }

      if (
        currentOrder.status === 'pending_create' ||
        currentOrder.status === 'pending_cancel'
      ) {
        this.logger.log(
          `[${strategyKey}] reason=waiting_cancel slotKey=${slotKey} status=${currentOrder.status}`,
        );
        continue;
      }

      if (this.isQuoteWithinTolerance(currentOrder, targetAction, tolerance)) {
        this.logger.log(
          `[${strategyKey}] reason=within_tolerance slotKey=${slotKey} exchangeOrderId=${currentOrder.exchangeOrderId}`,
        );
        continue;
      }

      this.appendCancelAction(
        actions,
        cancelledExchangeOrderIds,
        this.buildCancelOrderAction(
          strategyKey,
          params,
          currentOrder,
          ts,
          slotKey,
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
    slotKey: string;
    side: 'buy' | 'sell';
    price: string;
    qty: string;
  }> {
    const quotes: Array<{
      layer: number;
      slotKey: string;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
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
        slotKey: `layer-${layer}-buy`,
        side: 'buy',
        price: buyPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
      });
      quotes.push({
        layer,
        slotKey: `layer-${layer}-sell`,
        side: 'sell',
        price: sellPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
      });
    }

    return quotes;
  }

  private isQuoteWithinTolerance(
    order: TrackedOrder,
    action: ExecutorAction,
    tolerance: BigNumber,
  ): boolean {
    if (order.side !== action.side) {
      return false;
    }

    if (tolerance.isLessThanOrEqualTo(0)) {
      return order.price === action.price && order.qty === action.qty;
    }

    const actionPrice = new BigNumber(action.price);

    if (!actionPrice.isFinite() || actionPrice.isLessThanOrEqualTo(0)) {
      return false;
    }

    return new BigNumber(order.price)
      .minus(action.price)
      .abs()
      .dividedBy(actionPrice)
      .isLessThan(tolerance);
  }

  private buildCancelOrderAction(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    order: Pick<
      TrackedOrder,
      'exchangeOrderId' | 'side' | 'price' | 'qty' | 'slotKey' | 'status'
    >,
    ts: string,
    reason: string,
  ): ExecutorAction | null {
    if (
      !order.exchangeOrderId ||
      order.status === 'pending_cancel' ||
      order.status === 'cancelled' ||
      order.status === 'filled'
    ) {
      return null;
    }

    return {
      type: 'CANCEL_ORDER',
      intentId: `${strategyKey}:${ts}:cancel-${reason}-${order.exchangeOrderId}`,
      strategyInstanceId: strategyKey,
      strategyKey,
      userId: params.userId,
      clientId: params.clientId,
      exchange: params.exchangeName,
      accountLabel: params.accountLabel,
      pair: params.pair,
      side: order.side,
      price: order.price,
      qty: order.qty,
      mixinOrderId: order.exchangeOrderId,
      slotKey: order.slotKey,
      createdAt: ts,
    };
  }

  private appendCancelAction(
    actions: ExecutorAction[],
    cancelledExchangeOrderIds: Set<string>,
    action: ExecutorAction | null,
  ): void {
    if (
      !action?.mixinOrderId ||
      cancelledExchangeOrderIds.has(action.mixinOrderId)
    ) {
      return;
    }

    cancelledExchangeOrderIds.add(action.mixinOrderId);
    actions.push(action);
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
    postOnly?: boolean,
    accountLabel?: string,
    timeInForce?: 'GTC' | 'IOC',
  ): StrategyOrderIntent {
    return {
      type: 'CREATE_LIMIT_ORDER',
      intentId: `${strategyKey}:${ts}:${suffix}`,
      strategyInstanceId,
      strategyKey,
      userId,
      clientId,
      exchange,
      accountLabel,
      pair,
      side,
      price: price.toFixed(),
      qty: qty.toFixed(),
      executionCategory,
      postOnly,
      timeInForce,
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

    if (
      this.stoppingStrategyKeys.has(strategyKey) &&
      intents.some((intent) => intent.type !== 'STOP_CONTROLLER')
    ) {
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
    postOnlySide: 'buy' | 'sell' | 'inventory_balance' | undefined,
    executedTrades: number,
    buyBias?: number,
  ): 'buy' | 'sell' {
    if (postOnlySide === 'buy' || postOnlySide === 'sell') {
      return postOnlySide;
    }

    const normalizedBuyBias =
      this.readUnitIntervalNumber(buyBias) ??
      (executedTrades > 0 ? 0.5 : undefined);

    if (normalizedBuyBias === undefined) {
      return executedTrades % 2 === 0 ? 'buy' : 'sell';
    }

    return Math.random() < normalizedBuyBias ? 'buy' : 'sell';
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
    params: VolumeStrategyParams | DualAccountVolumeStrategyParams,
  ): Promise<void> {
    await this.strategyInstanceRepository.update(
      { strategyKey },
      {
        parameters: params as Record<string, any>,
        updatedAt: new Date(),
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
    const emaF = this.calcEma(closes, params.emaFast);
    const emaS = this.calcEma(closes, params.emaSlow);
    const rsiV = this.calcRsi(closes, params.rsiPeriod);

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
    const signal = this.calcCross(prevEmaF!, prevEmaS!, lastEmaF!, lastEmaS!);
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

    let balances;

    try {
      balances = await ex.fetchBalance();
    } catch (e: unknown) {
      const { message } = this.toErrorDetails(e);

      this.logger.error(`[${exchangeName}] fetchBalance failed: ${message}`);

      return [];
    }

    const amountBaseRaw =
      params.orderMode === 'base' ? params.orderSize : params.orderSize / last;

    const freeBase = balances.free?.[base] ?? 0;
    const freeQuote = balances.free?.[quote] ?? 0;

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
        strategyInstanceId: session.strategyKey,
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
          stopLossPct: this.safePct(params.stopLossPct),
          takeProfitPct: this.safePct(params.takeProfitPct),
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
          const status = String(result?.status || '').toLowerCase();

          this.exchangeOrderTrackerService?.upsertOrder(
            status === 'canceled' || status === 'cancelled'
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

    this.stopPrivateOrderWatcher(
      session.strategyType,
      pooledTarget.exchange,
      pooledTarget.pair,
      this.resolveAccountLabel(session.strategyType, session.params),
    );
    this.stopBalanceWatchers(
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
      const pair = String(
        (params as unknown as VolumeStrategyParams).symbol || '',
      ).trim();
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
    if (
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume'
    ) {
      const accountLabel = String(
        (params as unknown as DualAccountVolumeStrategyParams)
          .makerAccountLabel || 'default',
      ).trim();

      return accountLabel || 'default';
    }

    if (strategyType !== 'pureMarketMaking') {
      return undefined;
    }

    const accountLabel = String(
      (params as unknown as PureMarketMakingStrategyDto).accountLabel ||
        'default',
    ).trim();

    return accountLabel || 'default';
  }

  private resolveRequiredAccountLabels(
    strategyType: StrategyType,
    params: StrategyRuntimeSession['params'],
  ): string[] {
    if (
      strategyType === 'dualAccountVolume' ||
      strategyType === 'dualAccountBestCapacityVolume'
    ) {
      const dualParams = params as unknown as DualAccountVolumeStrategyParams;

      return [dualParams.makerAccountLabel, dualParams.takerAccountLabel]
        .map((label) => String(label || '').trim() || 'default')
        .filter((label, index, labels) => labels.indexOf(label) === index);
    }

    const accountLabel = this.resolveAccountLabel(strategyType, params);

    return accountLabel ? [accountLabel] : ['default'];
  }

  private startPrivateOrderWatcher(
    strategyType: StrategyType,
    exchange: string,
    pair: string,
    accountLabel?: string,
  ): void {
    if (strategyType !== 'pureMarketMaking') {
      return;
    }

    this.userStreamIngestionService?.startOrderWatcher({
      exchange,
      accountLabel: accountLabel || 'default',
      symbol: pair,
    });
    this.userStreamIngestionService?.startTradeWatcher({
      exchange,
      accountLabel: accountLabel || 'default',
      symbol: pair,
    });
  }

  private startBalanceWatchers(
    strategyType: StrategyType,
    exchange: string,
    params: StrategyRuntimeSession['params'],
  ): void {
    if (
      strategyType !== 'dualAccountVolume' &&
      strategyType !== 'dualAccountBestCapacityVolume'
    ) {
      return;
    }

    const dualParams = params as DualAccountVolumeStrategyParams;

    for (const accountLabel of [
      dualParams.makerAccountLabel,
      dualParams.takerAccountLabel,
    ]) {
      this.userStreamIngestionService?.startBalanceWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
      });
      this.balanceStateRefreshService?.registerAccount(
        exchange,
        accountLabel || 'default',
      );
    }
  }

  private stopBalanceWatchers(
    strategyType: StrategyType,
    exchange: string,
    params: StrategyRuntimeSession['params'],
  ): void {
    if (
      strategyType !== 'dualAccountVolume' &&
      strategyType !== 'dualAccountBestCapacityVolume'
    ) {
      return;
    }

    const dualParams = params as DualAccountVolumeStrategyParams;

    for (const accountLabel of [
      dualParams.makerAccountLabel,
      dualParams.takerAccountLabel,
    ]) {
      this.userStreamIngestionService?.stopBalanceWatcher({
        exchange,
        accountLabel: accountLabel || 'default',
      });
      this.balanceStateRefreshService?.releaseAccount(
        exchange,
        accountLabel || 'default',
      );
    }
  }

  private stopPrivateOrderWatcher(
    strategyType: StrategyType,
    exchange: string,
    pair: string,
    accountLabel?: string,
  ): void {
    if (strategyType !== 'pureMarketMaking') {
      return;
    }

    this.userStreamIngestionService?.stopOrderWatcher({
      exchange,
      accountLabel: accountLabel || 'default',
      symbol: pair,
    });
    this.userStreamIngestionService?.stopTradeWatcher({
      exchange,
      accountLabel: accountLabel || 'default',
      symbol: pair,
    });
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
      exchangeOrderId?: string | null;
      clientOrderId?: string | null;
      fillId?: string | null;
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
      cumulativeQty?: string;
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

    await this.applyFillToBalanceLedger(session, fill);
    this.recordSessionPnL(session, fill, {
      includeTradedQuoteVolume:
        session.strategyType !== 'dualAccountVolume' &&
        session.strategyType !== 'dualAccountBestCapacityVolume',
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
      const nextParams = this.mergeDualAccountFillRuntimeIntoPersisted(
        session.params as DualAccountVolumeStrategyParams,
        persistedParams,
      );

      session.params = nextParams;
      session.tradedQuoteVolume = Number(nextParams.tradedQuoteVolume || 0);
      await this.persistStrategyParams(
        session.strategyKey,
        nextParams,
      );
      session.nextRunAtMs = Math.min(session.nextRunAtMs, Date.now());

      return;
    }

    session.lastFillTimestamp = Date.now();
    const delayMs = Number(
      (session.params as unknown as PureMarketMakingStrategyDto)
        .filledOrderDelay || 0,
    );

    session.nextRunAtMs =
      Number.isFinite(delayMs) && delayMs > 0
        ? Math.max(session.nextRunAtMs, session.lastFillTimestamp + delayMs)
        : Math.min(session.nextRunAtMs, Date.now());
  }

  private async applyFillToBalanceLedger(
    session: StrategyRuntimeSession,
    fill: {
      exchangeOrderId?: string | null;
      clientOrderId?: string | null;
      fillId?: string | null;
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
      cumulativeQty?: string;
      receivedAt?: string;
    },
  ): Promise<void> {
    if (!this.balanceLedgerService || !fill.side || !fill.price || !fill.qty) {
      return;
    }

    const pair = this.readString(
      session.params?.pair,
      this.readString(session.params?.symbol, ''),
    );
    const assets = pair ? this.parseBaseQuote(pair) : null;

    if (!assets) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${session.strategyKey}: pair is missing or unparseable`,
      );

      return;
    }

    const price = new BigNumber(fill.price);
    const qty = new BigNumber(fill.qty);

    if (
      !price.isFinite() ||
      !qty.isFinite() ||
      price.isLessThanOrEqualTo(0) ||
      qty.isLessThanOrEqualTo(0)
    ) {
      this.logger.warn(
        `Skipping fill ledger update for strategyKey=${
          session.strategyKey
        }: invalid fill price/qty price=${fill.price || ''} qty=${
          fill.qty || ''
        }`,
      );

      return;
    }

    const quoteAmount = price.multipliedBy(qty);
    const eventKey = this.buildFillLedgerEventKey(session, fill);
    const baseAmount = qty.toFixed();
    const quoteDelta =
      fill.side === 'buy'
        ? quoteAmount.negated().toFixed()
        : quoteAmount.toFixed();
    const baseDelta =
      fill.side === 'buy' ? baseAmount : qty.negated().toFixed();

    await this.balanceLedgerService.adjust({
      userId: session.userId,
      assetId: assets.base,
      amount: baseDelta,
      idempotencyKey: `${eventKey}:base`,
      refType: 'market_making_fill',
      refId: fill.exchangeOrderId || fill.clientOrderId || session.strategyKey,
    });

    await this.balanceLedgerService.adjust({
      userId: session.userId,
      assetId: assets.quote,
      amount: quoteDelta,
      idempotencyKey: `${eventKey}:quote`,
      refType: 'market_making_fill',
      refId: fill.exchangeOrderId || fill.clientOrderId || session.strategyKey,
    });
  }

  private buildFillLedgerEventKey(
    session: StrategyRuntimeSession,
    fill: {
      exchangeOrderId?: string | null;
      clientOrderId?: string | null;
      fillId?: string | null;
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
      cumulativeQty?: string;
      receivedAt?: string;
    },
  ): string {
    const stableIdentity =
      fill.fillId ||
      [
        fill.exchangeOrderId || '',
        fill.clientOrderId || '',
        fill.side || '',
        fill.price || '',
        fill.cumulativeQty || fill.qty || '',
      ].join(':');

    return ['mm-fill', session.strategyKey, stableIdentity].join(':');
  }

  private estimateMakerFeeSpread(exchangeName: string, pair: string): number {
    try {
      const exchange = this.exchangeInitService.getExchange(exchangeName);
      const market = exchange?.markets?.[pair];
      const makerFee = Number(
        market?.maker || exchange?.fees?.trading?.maker || 0,
      );

      return Number.isFinite(makerFee) && makerFee > 0 ? makerFee * 2 : 0;
    } catch {
      return 0;
    }
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
  ): Promise<{
    base: BigNumber;
    quote: BigNumber;
    assets: { base: string; quote: string };
  } | null> {
    const assets = this.parseBaseQuote(pair);

    if (!assets) {
      return null;
    }

    const normalizedAccountLabel = accountLabel || 'default';
    const cachedBase = this.balanceStateCacheService?.getBalance(
      exchangeName,
      normalizedAccountLabel,
      assets.base,
    );
    const cachedQuote = this.balanceStateCacheService?.getBalance(
      exchangeName,
      normalizedAccountLabel,
      assets.quote,
    );
    const nowMs = Date.now();
    const cachedFresh =
      (this.balanceStateCacheService?.isFresh(cachedBase, nowMs) ?? false) &&
      (this.balanceStateCacheService?.isFresh(cachedQuote, nowMs) ?? false);

    if (cachedFresh) {
      return {
        base: new BigNumber(cachedBase.free || 0),
        quote: new BigNumber(cachedQuote.free || 0),
        assets,
      };
    }

    const balance = await this.exchangeConnectorAdapterService?.fetchBalance(
      exchangeName,
      accountLabel,
    );
    this.balanceStateCacheService?.applyBalanceSnapshot(
      exchangeName,
      normalizedAccountLabel,
      balance || {},
      getRFC3339Timestamp(),
      'rest',
    );

    return {
      base: new BigNumber(balance?.free?.[assets.base] || 0),
      quote: new BigNumber(balance?.free?.[assets.quote] || 0),
      assets,
    };
  }

  private async quantizeAndValidateQuote(
    strategyKey: string,
    exchangeName: string,
    pair: string,
    accountLabel: string | undefined,
    side: 'buy' | 'sell',
    layer: number,
    slotKey: string,
    rawQty: BigNumber,
    rawPrice: BigNumber,
    availableBalances: {
      base: BigNumber;
      quote: BigNumber;
      assets: { base: string; quote: string };
    } | null,
  ): Promise<{ price: BigNumber; qty: BigNumber } | null> {
    if (!this.exchangeConnectorAdapterService) {
      return { price: rawPrice, qty: rawQty };
    }

    if (!availableBalances) {
      this.logger.warn(
        `[${strategyKey}] reason=insufficient_balance slotKey=${slotKey} ${side} ${rawQty.toFixed()}@${rawPrice.toFixed()}: available balances unavailable for ${exchangeName} ${pair}`,
      );

      return null;
    }

    const { base, quote } = availableBalances;
    const rules = await this.exchangeConnectorAdapterService.loadTradingRules(
      exchangeName,
      pair,
      accountLabel,
    );
    const rawNotional = rawQty.multipliedBy(rawPrice);

    if (
      rawQty.isLessThanOrEqualTo(0) ||
      rawPrice.isLessThanOrEqualTo(0) ||
      (rules.amountMin && rawQty.isLessThan(rules.amountMin)) ||
      (rules.costMin && rawNotional.isLessThan(rules.costMin))
    ) {
      const rejectionReasons: string[] = [];

      if (rawQty.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(`raw qty ${rawQty.toFixed()} <= 0`);
      }
      if (rawPrice.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(`raw price ${rawPrice.toFixed()} <= 0`);
      }
      if (rules.amountMin && rawQty.isLessThan(rules.amountMin)) {
        rejectionReasons.push(
          `raw qty ${rawQty.toFixed()} ${
            availableBalances.assets.base
          } < amountMin ${new BigNumber(rules.amountMin).toFixed()} ${
            availableBalances.assets.base
          }`,
        );
      }
      if (rules.costMin && rawNotional.isLessThan(rules.costMin)) {
        rejectionReasons.push(
          `raw notional ${rawNotional.toFixed()} ${
            availableBalances.assets.quote
          } (${rawQty.toFixed()} ${
            availableBalances.assets.base
          } * ${rawPrice.toFixed()} ${availableBalances.assets.quote}/${
            availableBalances.assets.base
          }) < costMin ${new BigNumber(rules.costMin).toFixed()} ${
            availableBalances.assets.quote
          }`,
        );
      }
      this.logger.warn(
        `[${strategyKey}] reason=insufficient_balance slotKey=${slotKey} ${side} ${rawQty.toFixed()}@${rawPrice.toFixed()}: ${rejectionReasons.join(
          '; ',
        )}`,
      );

      return null;
    }

    let quantized: { price: string; qty: string };

    try {
      quantized = this.exchangeConnectorAdapterService.quantizeOrder(
        exchangeName,
        pair,
        rawQty.toFixed(),
        rawPrice.toFixed(),
        accountLabel,
      );
    } catch (error) {
      this.logger.warn(
        `[${strategyKey}] reason=quantization_rejected slotKey=${slotKey} ${side} ${rawQty.toFixed()}@${rawPrice.toFixed()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }

    const price = new BigNumber(quantized.price);
    const qty = new BigNumber(quantized.qty);

    if (
      qty.isLessThanOrEqualTo(0) ||
      price.isLessThanOrEqualTo(0) ||
      (rules.amountMin && qty.isLessThan(rules.amountMin)) ||
      (rules.costMin && qty.multipliedBy(price).isLessThan(rules.costMin))
    ) {
      const rejectionReasons: string[] = [];

      if (qty.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(
          `quantized qty ${qty.toFixed()} <= 0 (rawQty=${rawQty.toFixed()})`,
        );
      }
      if (price.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(
          `quantized price ${price.toFixed()} <= 0 (rawPrice=${rawPrice.toFixed()})`,
        );
      }
      if (rules.amountMin && qty.isLessThan(rules.amountMin)) {
        rejectionReasons.push(
          `qty ${qty.toFixed()} ${
            availableBalances.assets.base
          } < amountMin ${new BigNumber(rules.amountMin).toFixed()} ${
            availableBalances.assets.base
          }`,
        );
      }
      if (rules.costMin && qty.multipliedBy(price).isLessThan(rules.costMin)) {
        rejectionReasons.push(
          `notional ${qty.multipliedBy(price).toFixed()} ${
            availableBalances.assets.quote
          } (${qty.toFixed()} ${
            availableBalances.assets.base
          } * ${price.toFixed()} ${availableBalances.assets.quote}/${
            availableBalances.assets.base
          }) < costMin ${new BigNumber(rules.costMin).toFixed()} ${
            availableBalances.assets.quote
          }`,
        );
      }
      this.logger.warn(
        `[${strategyKey}] reason=insufficient_balance slotKey=${slotKey} ${side} ${rawQty.toFixed()}@${rawPrice.toFixed()}: ${rejectionReasons.join(
          '; ',
        )}`,
      );

      return null;
    }

    const notional = qty.multipliedBy(price);

    if (side === 'buy' && quote.isLessThan(notional)) {
      this.logger.warn(
        `[${strategyKey}] reason=insufficient_balance slotKey=${slotKey} ${side} ${qty.toFixed()}@${price.toFixed()}: insufficient quote balance ${quote.toFixed()} ${
          availableBalances.assets.quote
        } < required ${notional.toFixed()}`,
      );

      return null;
    }
    if (side === 'sell' && base.isLessThan(qty)) {
      this.logger.warn(
        `[${strategyKey}] reason=insufficient_balance slotKey=${slotKey} ${side} ${qty.toFixed()}@${price.toFixed()}: insufficient base balance ${base.toFixed()} ${
          availableBalances.assets.base
        } < required ${qty.toFixed()}`,
      );

      return null;
    }

    if (side === 'buy') {
      availableBalances.quote = quote.minus(notional);
    } else {
      availableBalances.base = base.minus(qty);
    }

    return { price, qty };
  }

  private buildStaleOrderActions(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
    midPrice: BigNumber,
    openOrders: Array<{
      exchangeOrderId: string;
      slotKey?: string;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
      createdAt: string;
      status: string;
    }>,
  ): ExecutorAction[] {
    const maxOrderAge = Number(params.maxOrderAge || 0);
    const hangingOrdersCancelPct = Number(params.hangingOrdersCancelPct || 0);

    return openOrders
      .filter((order) => {
        const ageMs = Date.now() - Date.parse(order.createdAt || ts);
        const driftPct = new BigNumber(order.price)
          .minus(midPrice)
          .abs()
          .dividedBy(midPrice);

        return (
          (Number.isFinite(maxOrderAge) &&
            maxOrderAge > 0 &&
            ageMs > maxOrderAge) ||
          (Number.isFinite(hangingOrdersCancelPct) &&
            hangingOrdersCancelPct > 0 &&
            driftPct.isGreaterThan(hangingOrdersCancelPct))
        );
      })
      .map((order, index) => ({
        type: 'CANCEL_ORDER' as const,
        intentId: `${strategyKey}:${ts}:stale-cancel-${index}`,
        strategyInstanceId: strategyKey,
        strategyKey,
        userId: params.userId,
        clientId: params.clientId,
        exchange: params.exchangeName,
        accountLabel: params.accountLabel,
        pair: params.pair,
        side: order.side,
        price: order.price,
        qty: order.qty,
        mixinOrderId: order.exchangeOrderId,
        createdAt: ts,
      }));
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
          const status = String(result?.status || '').toLowerCase();

          this.exchangeOrderTrackerService?.upsertOrder({
            ...order,
            status:
              status === 'canceled' || status === 'cancelled'
                ? 'cancelled'
                : 'pending_cancel',
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
  ): Promise<void> {
    if (
      strategy.strategyType === 'dualAccountVolume' ||
      strategy.strategyType === 'dualAccountBestCapacityVolume'
    ) {
      await this.restoreDualAccountVolumeRuntimeState(strategy);

      return;
    }

    if (
      strategy.strategyType !== 'pureMarketMaking' ||
      !this.exchangeConnectorAdapterService
    ) {
      return;
    }

    const params = strategy.parameters as PureMarketMakingStrategyDto;
    const exchange = this.readString(params.exchangeName);
    const pair = this.readString(params.pair);

    if (!exchange || !pair) {
      return;
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

      return;
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
        const latest = await this.exchangeConnectorAdapterService.fetchOrder(
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
  }

  private async cancelAllRunningStrategies(reason: string): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      this.stoppingStrategyKeys.add(session.strategyKey);

      try {
        await this.strategyInstanceRepository.update(
          { strategyKey: session.strategyKey },
          { status: 'stopped', updatedAt: new Date() },
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
            const latest =
              await this.exchangeConnectorAdapterService?.fetchOrder(
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
    const threshold = params.killSwitchThreshold;
    const session = this.sessions.get(strategyKey);

    if (threshold === undefined || threshold === null || !session) {
      return false;
    }

    const realizedPnl = Number(session.realizedPnlQuote || 0);

    if (!Number.isFinite(realizedPnl)) {
      return false;
    }

    const parsedAbsolute = this.parseKillSwitchAbsoluteThreshold(threshold);
    const parsedPercent = this.parseKillSwitchPercentThreshold(threshold);

    const hitAbsolute =
      parsedAbsolute !== null &&
      realizedPnl <= parsedAbsolute.negated().toNumber();
    const hitPercent =
      parsedPercent !== null &&
      Number(session.tradedQuoteVolume || 0) > 0 &&
      Math.abs(realizedPnl) / Number(session.tradedQuoteVolume || 0) >=
        parsedPercent &&
      realizedPnl < 0;

    if (!hitAbsolute && !hitPercent) {
      return false;
    }

    this.logger.warn(
      `Kill switch triggered for ${strategyKey}: realizedPnl=${realizedPnl} threshold=${String(
        threshold,
      )}`,
    );
    await this.stopStrategyForUser(
      session.userId,
      session.clientId,
      session.strategyType,
    );

    return true;
  }

  private recordSessionPnL(
    session: StrategyRuntimeSession,
    fill: {
      side?: 'buy' | 'sell';
      price?: string;
      qty?: string;
    },
    options?: {
      includeTradedQuoteVolume?: boolean;
    },
  ): void {
    if (!fill.side || !fill.price || !fill.qty) {
      return;
    }

    const price = new BigNumber(fill.price);
    const qty = new BigNumber(fill.qty);

    if (
      !price.isFinite() ||
      !qty.isFinite() ||
      price.isLessThanOrEqualTo(0) ||
      qty.isLessThanOrEqualTo(0)
    ) {
      return;
    }

    const currentInventoryQty = new BigNumber(session.inventoryBaseQty || 0);
    const currentInventoryCost = new BigNumber(session.inventoryCostQuote || 0);
    const currentRealizedPnl = new BigNumber(session.realizedPnlQuote || 0);
    const includeTradedQuoteVolume =
      options?.includeTradedQuoteVolume ?? true;
    const currentTradedVolume = new BigNumber(session.tradedQuoteVolume || 0);
    const fillNotional = price.multipliedBy(qty);

    let nextInventoryQty = currentInventoryQty;
    let nextInventoryCost = currentInventoryCost;
    let nextRealizedPnl = currentRealizedPnl;

    if (fill.side === 'buy') {
      nextInventoryQty = currentInventoryQty.plus(qty);
      nextInventoryCost = currentInventoryCost.plus(fillNotional);
    } else {
      const matchedQty = BigNumber.min(qty, currentInventoryQty);

      if (matchedQty.isGreaterThan(0) && currentInventoryQty.isGreaterThan(0)) {
        const averageCost = currentInventoryCost.dividedBy(currentInventoryQty);
        const matchedCost = averageCost.multipliedBy(matchedQty);
        const matchedProceeds = price.multipliedBy(matchedQty);

        nextRealizedPnl = nextRealizedPnl.plus(
          matchedProceeds.minus(matchedCost),
        );
        nextInventoryQty = currentInventoryQty.minus(matchedQty);
        nextInventoryCost = BigNumber.max(
          currentInventoryCost.minus(matchedCost),
          0,
        );
      }
    }

    session.inventoryBaseQty = nextInventoryQty.toNumber();
    session.inventoryCostQuote = nextInventoryCost.toNumber();
    session.realizedPnlQuote = nextRealizedPnl.toNumber();
    if (includeTradedQuoteVolume) {
      session.tradedQuoteVolume = currentTradedVolume
        .plus(fillNotional)
        .toNumber();
    }
    session.params = {
      ...session.params,
      inventoryBaseQty: session.inventoryBaseQty,
      inventoryCostQuote: session.inventoryCostQuote,
      realizedPnlQuote: session.realizedPnlQuote,
      ...(includeTradedQuoteVolume
        ? {
            tradedQuoteVolume: session.tradedQuoteVolume,
          }
        : {}),
    };
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
      next.publishedCycles = Number(persisted.publishedCycles);
    }

    if (Number.isFinite(Number(persisted.completedCycles))) {
      next.completedCycles = Number(persisted.completedCycles);
    }

    if (Number.isFinite(Number(persisted.tradedQuoteVolume))) {
      next.tradedQuoteVolume = Number(persisted.tradedQuoteVolume);
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
      const nextStatus =
        this.normalizeExchangeOrderStatus(result?.status) || 'pending_cancel';

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

  private parseKillSwitchAbsoluteThreshold(
    threshold: number | string,
  ): BigNumber | null {
    if (typeof threshold === 'string' && threshold.trim().endsWith('%')) {
      return null;
    }

    const parsed = new BigNumber(threshold);

    if (!parsed.isFinite() || parsed.isLessThanOrEqualTo(0)) {
      return null;
    }

    return parsed;
  }

  private parseKillSwitchPercentThreshold(
    threshold: number | string,
  ): number | null {
    if (typeof threshold !== 'string') {
      return null;
    }

    const trimmed = threshold.trim();

    if (!trimmed.endsWith('%')) {
      return null;
    }

    const parsed = Number(trimmed.slice(0, -1));

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed / 100;
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
    if (!persisted) {
      return runtime;
    }

    const merged: DualAccountVolumeStrategyParams = {
      ...runtime,
    };

    if (typeof persisted.exchangeName === 'string') {
      merged.exchangeName = this.readString(
        persisted.exchangeName,
        runtime.exchangeName,
      );
    }

    if (typeof persisted.symbol === 'string') {
      merged.symbol = this.readString(persisted.symbol, runtime.symbol);
    }

    if (Number.isFinite(Number(persisted.baseIncrementPercentage))) {
      merged.baseIncrementPercentage = Number(
        persisted.baseIncrementPercentage,
      );
    }

    if (Number.isFinite(Number(persisted.baseIntervalTime))) {
      merged.baseIntervalTime = Number(persisted.baseIntervalTime);
    }

    if (Number.isFinite(Number(persisted.baseTradeAmount))) {
      merged.baseTradeAmount = Number(persisted.baseTradeAmount);
    }

    if (Number.isFinite(Number(persisted.numTrades))) {
      merged.numTrades = Number(persisted.numTrades);
    }

    if (Number.isFinite(Number(persisted.pricePushRate))) {
      merged.pricePushRate = Number(persisted.pricePushRate);
    }

    if (Number.isFinite(Number(persisted.tradeAmountVariance))) {
      merged.tradeAmountVariance = this.readNonNegativeNumber(
        persisted.tradeAmountVariance,
      );
    }

    if (Number.isFinite(Number(persisted.priceOffsetVariance))) {
      merged.priceOffsetVariance = this.readNonNegativeNumber(
        persisted.priceOffsetVariance,
      );
    }

    if (Number.isFinite(Number(persisted.cadenceVariance))) {
      merged.cadenceVariance = this.readNonNegativeNumber(
        persisted.cadenceVariance,
      );
    }

    if (Number.isFinite(Number(persisted.makerDelayVariance))) {
      merged.makerDelayVariance = this.readNonNegativeNumber(
        persisted.makerDelayVariance,
      );
    }

    if (Number.isFinite(Number(persisted.buyBias))) {
      merged.buyBias = this.readUnitIntervalNumber(persisted.buyBias);
    }

    if (
      persisted.accountProfiles &&
      typeof persisted.accountProfiles === 'object' &&
      !Array.isArray(persisted.accountProfiles)
    ) {
      merged.accountProfiles =
        persisted.accountProfiles as DualAccountBehaviorProfilesDto;
    }

    if (
      persisted.postOnlySide === 'buy' ||
      persisted.postOnlySide === 'sell' ||
      persisted.postOnlySide === undefined
    ) {
      merged.postOnlySide = persisted.postOnlySide;
    }

    if (typeof persisted.dynamicRoleSwitching === 'boolean') {
      merged.dynamicRoleSwitching = persisted.dynamicRoleSwitching;
    }

    if (persisted.targetQuoteVolume === undefined) {
      merged.targetQuoteVolume = undefined;
    } else if (Number.isFinite(Number(persisted.targetQuoteVolume))) {
      merged.targetQuoteVolume = Number(persisted.targetQuoteVolume);
    }

    return merged;
  }

  private resolveNextDualAccountCadenceMs(
    params: DualAccountVolumeStrategyParams,
  ): number {
    const baseCadenceSeconds =
      params.interval ?? params.baseIntervalTime ?? 10;
    const cadenceSeconds = this.isBestCapacityConfig(params)
      ? baseCadenceSeconds
      : this.applyVariance(baseCadenceSeconds, params.cadenceVariance);

    return Math.max(1000, cadenceSeconds * 1000);
  }

  private resolveDualAccountMakerDelayMs(
    params: DualAccountVolumeStrategyParams,
    accountLabel: string,
  ): number {
    if (this.isBestCapacityConfig(params)) {
      return Math.max(0, Math.round(params.makerDelayMs || 0));
    }

    const profile = this.resolveDualAccountBehaviorProfile(
      params,
      accountLabel,
    );
    const delayMs = this.applyVariance(
      params.makerDelayMs || 0,
      profile.makerDelayVariance ?? params.makerDelayVariance,
      profile.makerDelayMultiplier,
    );

    return Math.max(0, Math.round(delayMs));
  }

  private resolveDualAccountBehaviorProfile(
    params: DualAccountVolumeStrategyParams,
    accountLabel: string,
  ): DualAccountBehaviorProfile {
    const profiles = params.accountProfiles;

    if (!profiles) {
      return {};
    }

    const candidate =
      accountLabel === params.makerAccountLabel
        ? profiles.maker
        : accountLabel === params.takerAccountLabel
        ? profiles.taker
        : undefined;

    return candidate ? this.normalizeBehaviorProfile(candidate) : {};
  }

  private normalizeDualAccountStrategyParams(
    params: ExecuteDualAccountVolumeStrategyDto,
  ): DualAccountVolumeStrategyParams {
    const makerAccountLabel = String(params.makerAccountLabel || '').trim();
    const takerAccountLabel = String(params.takerAccountLabel || '').trim();

    if (!makerAccountLabel || !takerAccountLabel) {
      throw new Error(
        'Dual account volume strategy requires makerAccountLabel and takerAccountLabel',
      );
    }

    if (makerAccountLabel === takerAccountLabel) {
      throw new Error(
        'Dual account volume strategy requires different maker and taker account labels',
      );
    }

    return {
      exchangeName: String(params.exchangeName || '').trim(),
      symbol: String(params.symbol || '').trim(),
      baseIncrementPercentage: Number(params.baseIncrementPercentage || 0),
      baseIntervalTime: Number(params.baseIntervalTime || 10),
      baseTradeAmount: Number(params.baseTradeAmount || 0),
      numTrades: Number(params.numTrades || 0),
      userId: params.userId,
      clientId: params.clientId,
      pricePushRate: Number(params.pricePushRate || 0),
      executionCategory: 'clob_cex',
      executionVenue: 'cex',
      postOnlySide: params.postOnlySide,
      makerAccountLabel,
      takerAccountLabel,
      makerDelayMs: Number(params.makerDelayMs || 0),
      tradeAmountVariance: this.readNonNegativeNumber(
        params.tradeAmountVariance,
      ),
      priceOffsetVariance: this.readNonNegativeNumber(
        params.priceOffsetVariance,
      ),
      cadenceVariance: this.readNonNegativeNumber(params.cadenceVariance),
      makerDelayVariance: this.readNonNegativeNumber(params.makerDelayVariance),
      buyBias: this.readUnitIntervalNumber(params.buyBias),
      accountProfiles: params.accountProfiles,
      dynamicRoleSwitching: Boolean(params.dynamicRoleSwitching),
      targetQuoteVolume:
        params.targetQuoteVolume !== undefined
          ? Number(params.targetQuoteVolume)
          : undefined,
      publishedCycles: 0,
      completedCycles: 0,
      orderBookReady: false,
      consecutiveFallbackCycles: 0,
      tradedQuoteVolume: 0,
      realizedPnlQuote: 0,
      inventoryBaseQty: 0,
      inventoryCostQuote: 0,
    };
  }

  private normalizeDualAccountBestCapacityStrategyParams(
    params: ExecuteDualAccountBestCapacityVolumeStrategyDto,
  ): DualAccountVolumeStrategyParams {
    const makerAccountLabel = String(params.makerAccountLabel || '').trim();
    const takerAccountLabel = String(params.takerAccountLabel || '').trim();

    if (!makerAccountLabel || !takerAccountLabel) {
      throw new Error(
        'Dual account best-capacity strategy requires makerAccountLabel and takerAccountLabel',
      );
    }

    if (makerAccountLabel === takerAccountLabel) {
      throw new Error(
        'Dual account best-capacity strategy requires different maker and taker account labels',
      );
    }

    const maxOrderAmount = Number(params.maxOrderAmount || 0);
    const interval = Number(params.interval || 10);
    const dailyVolumeTarget =
      params.dailyVolumeTarget !== undefined
        ? Number(params.dailyVolumeTarget)
        : undefined;

    return {
      exchangeName: String(params.exchangeName || '').trim(),
      symbol: String(params.symbol || '').trim(),
      baseIncrementPercentage: 0,
      baseIntervalTime: interval,
      baseTradeAmount: maxOrderAmount,
      maxOrderAmount,
      interval,
      numTrades: 0,
      userId: params.userId,
      clientId: params.clientId,
      pricePushRate: 0,
      executionCategory: 'clob_cex',
      executionVenue: 'cex',
      makerAccountLabel,
      takerAccountLabel,
      makerDelayMs: Number(params.makerDelayMs || 0),
      dailyVolumeTarget,
      targetQuoteVolume: dailyVolumeTarget,
      publishedCycles: 0,
      completedCycles: 0,
      orderBookReady: false,
      consecutiveFallbackCycles: 0,
      tradedQuoteVolume: 0,
      realizedPnlQuote: 0,
      inventoryBaseQty: 0,
      inventoryCostQuote: 0,
    };
  }

  private isBestCapacityConfig(
    params: DualAccountVolumeStrategyParams,
  ): boolean {
    return Number.isFinite(Number(params.maxOrderAmount));
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

  private normalizeBehaviorProfile(
    profile: Partial<DualAccountBehaviorProfileDto>,
  ): DualAccountBehaviorProfile {
    return {
      tradeAmountMultiplier: profile.tradeAmountMultiplier,
      tradeAmountVariance: profile.tradeAmountVariance,
      priceOffsetMultiplier: profile.priceOffsetMultiplier,
      priceOffsetVariance: profile.priceOffsetVariance,
      cadenceMultiplier: profile.cadenceMultiplier,
      cadenceVariance: profile.cadenceVariance,
      makerDelayMultiplier: profile.makerDelayMultiplier,
      makerDelayVariance: profile.makerDelayVariance,
      buyBias: profile.buyBias,
      activeHours: profile.activeHours,
    };
  }

  private applyVariance(
    baseValue: number,
    variance?: number,
    multiplier?: number,
    varianceSample?: number,
  ): number {
    const normalizedBase = new BigNumber(baseValue);

    if (!normalizedBase.isFinite()) {
      return normalizedBase.toNumber();
    }

    const normalizedMultiplier =
      multiplier !== undefined ? this.readPositiveNumber(multiplier) ?? 1 : 1;
    const effectiveBase = normalizedBase.multipliedBy(normalizedMultiplier);
    const normalizedVariance = this.readNonNegativeNumber(variance);

    if (!normalizedVariance || normalizedVariance <= 0) {
      return effectiveBase.toNumber();
    }

    const sample = this.readUnitIntervalNumber(varianceSample) ?? Math.random();
    const swing = new BigNumber(sample * 2 - 1).multipliedBy(
      normalizedVariance,
    );

    return effectiveBase.multipliedBy(new BigNumber(1).plus(swing)).toNumber();
  }

  private readPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private readNonNegativeNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  private readUnitIntervalNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
      ? parsed
      : undefined;
  }

  private isWithinDualAccountProfileWindow(
    profile: DualAccountBehaviorProfile,
  ): boolean {
    if (!profile.activeHours?.length) {
      return true;
    }

    return profile.activeHours.includes(new Date().getHours());
  }

  private toErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }

    return { message: String(error) };
  }

  private calcEma(series: number[], period: number): number[] {
    if (period <= 0) return series.map(() => NaN);
    const k = 2 / (period + 1);
    const out: number[] = [];
    let prev: number | undefined;

    for (let i = 0; i < series.length; i++) {
      const v = series[i];

      if (i === 0 || prev === undefined) {
        prev = v;
        out.push(v);
      } else {
        const e = (v - prev) * k + prev;

        out.push(e);
        prev = e;
      }
    }

    return out;
  }

  private calcRsi(series: number[], period: number): number[] {
    if (period <= 0 || series.length < period + 1)
      return new Array(series.length).fill(NaN);

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < series.length; i++) {
      const ch = series[i] - series[i - 1];

      gains.push(ch > 0 ? ch : 0);
      losses.push(ch < 0 ? -ch : 0);
    }

    let avgGain = this.avg(gains.slice(0, period));
    let avgLoss = this.avg(losses.slice(0, period));
    const rsiArr = new Array(series.length).fill(NaN);

    for (let i = period - 1; i < gains.length; i++) {
      if (i >= period) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      }
      const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
      const val = 100 - 100 / (1 + rs);

      rsiArr[i + 1] = val;
    }

    return rsiArr;
  }

  private avg(arr: number[]): number {
    if (!arr.length) return 0;

    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private calcCross(
    prevFast: number,
    prevSlow: number,
    fast: number,
    slow: number,
  ): 'CROSS_UP' | 'CROSS_DOWN' | 'NONE' {
    const wasBelow = prevFast <= prevSlow;
    const nowAbove = fast > slow;
    const wasAbove = prevFast >= prevSlow;
    const nowBelow = fast < slow;

    if (wasBelow && nowAbove) return 'CROSS_UP';
    if (wasAbove && nowBelow) return 'CROSS_DOWN';

    return 'NONE';
  }

  private safePct(v?: number): number | undefined {
    if (v === undefined || v === null) return undefined;
    const n = Number(v);

    if (!Number.isFinite(n) || n <= 0) return undefined;

    return n;
  }
}

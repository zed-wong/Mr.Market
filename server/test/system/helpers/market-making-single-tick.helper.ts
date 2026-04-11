import { getQueueToken } from '@nestjs/bull';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type { Job } from 'bull';
import type * as ccxt from 'ccxt';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { MarketMakingPaymentState } from 'src/common/entities/orders/payment-state.entity';
import {
  MarketMakingOrder,
  type MarketMakingOrderStrategySnapshot,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { createPureMarketMakingStrategyKey } from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';
import { MarketdataService } from 'src/modules/data/market-data/market-data.service';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';
import { ExchangeConnectorAdapterService } from 'src/modules/market-making/execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from 'src/modules/market-making/execution/exchange-order-mapping.service';
import { FillRoutingService } from 'src/modules/market-making/execution/fill-routing.service';
import { FeeService } from 'src/modules/market-making/fee/fee.service';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { NetworkMappingService } from 'src/modules/market-making/network-mapping/network-mapping.service';
import { DualAccountVolumeStrategyController } from 'src/modules/market-making/strategy/controllers/dual-account-volume-strategy.controller';
import { PureMarketMakingStrategyController } from 'src/modules/market-making/strategy/controllers/pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from 'src/modules/market-making/strategy/controllers/strategy-controller.registry';
import { StrategyMarketDataProviderService } from 'src/modules/market-making/strategy/data/strategy-market-data-provider.service';
import { StrategyConfigResolverService } from 'src/modules/market-making/strategy/dex/strategy-config-resolver.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyIntentExecutionService } from 'src/modules/market-making/strategy/execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyIntentWorkerService } from 'src/modules/market-making/strategy/execution/strategy-intent-worker.service';
import { StrategyRuntimeDispatcherService } from 'src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service';
import { ExecutorOrchestratorService } from 'src/modules/market-making/strategy/intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from 'src/modules/market-making/strategy/intent/quote-executor-manager.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { ClockTickCoordinatorService } from 'src/modules/market-making/tick/clock-tick-coordinator.service';
import type { TickComponent } from 'src/modules/market-making/tick/tick-component.interface';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import { OrderBookTrackerService } from 'src/modules/market-making/trackers/order-book-tracker.service';
import { PrivateStreamIngestionService } from 'src/modules/market-making/trackers/private-stream-ingestion.service';
import { PrivateStreamTrackerService } from 'src/modules/market-making/trackers/private-stream-tracker.service';
import { MarketMakingOrderProcessor } from 'src/modules/market-making/user-orders/market-making.processor';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { MixinClientService } from 'src/modules/mixin/client/mixin-client.service';
import { TransactionService } from 'src/modules/mixin/transaction/transaction.service';
import { WithdrawalService } from 'src/modules/mixin/withdrawal/withdrawal.service';
import type { Repository } from 'typeorm';

import {
  createSystemTestDatabaseConfig,
  readSystemSandboxConfig,
  type SandboxExchangeTestConfig,
  waitForInitializedExchange,
} from './sandbox-system.helper';

const SINGLE_TICK_TEST_ENTITIES = [
  Contribution,
  ExchangeOrderMapping,
  MarketMakingOrder,
  MarketMakingOrderIntent,
  MarketMakingPaymentState,
  MixinUser,
  SimplyGrowOrder,
  StrategyDefinition,
  StrategyExecutionHistory,
  StrategyInstance,
  StrategyOrderIntentEntity,
  TrackedOrderEntity,
];

type RuntimeFixture = {
  order: MarketMakingOrder;
  strategyDefinition: StrategyDefinition;
  strategyKey: string;
};

type PureMarketMakingRuntimeOverrides = {
  askSpread?: number;
  amountChangePerLayer?: number;
  amountChangeType?: 'fixed' | 'percentage';
  bidSpread?: number;
  filledOrderDelay?: number;
  hangingOrdersEnabled?: boolean;
  hangingOrdersCancelPct?: number;
  maxOrderAge?: number;
  minimumSpread?: number;
  numberOfLayers?: number;
  orderAmount?: number;
  orderRefreshTolerancePct?: number;
  orderId?: string;
  orderRefreshTime?: number;
  pair?: string;
  userId?: string;
};

type SingleTickHelperOptions = {
  intentExecutionDriver?: 'sync' | 'worker';
  intentWorkerMaxInFlight?: number;
  intentWorkerMaxInFlightPerExchange?: number;
  intentWorkerPollIntervalMs?: number;
};

export class MarketMakingSingleTickHelper {
  private readonly config: SandboxExchangeTestConfig;
  private readonly databaseConfig = createSystemTestDatabaseConfig(
    'market-making-single-tick',
  );
  private readonly options: SingleTickHelperOptions;
  private exchange!: ccxt.Exchange;
  private clockTickCoordinatorService!: ClockTickCoordinatorService;
  private exchangeOrderMappingRepository!: Repository<ExchangeOrderMapping>;
  private exchangeOrderTrackerService!: ExchangeOrderTrackerService;
  private exchangeInitService!: ExchangeInitService;
  private executorRegistry!: ExecutorRegistry;
  private marketMakingOrderProcessor!: MarketMakingOrderProcessor;
  private marketMakingOrderRepository!: Repository<MarketMakingOrder>;
  private moduleRef!: TestingModule;
  private orderBookTrackerService!: OrderBookTrackerService;
  private privateStreamIngestionService!: PrivateStreamIngestionService;
  private privateStreamTrackerService!: PrivateStreamTrackerService;
  private readonly runtimeOrderIds = new Set<string>();
  private strategyDefinitionRepository!: Repository<StrategyDefinition>;
  private strategyIntentExecutionService!: StrategyIntentExecutionService;
  private strategyIntentWorkerService!: StrategyIntentWorkerService;
  private strategyExecutionHistoryRepository!: Repository<StrategyExecutionHistory>;
  private strategyOrderIntentRepository!: Repository<StrategyOrderIntentEntity>;

  constructor(
    config: SandboxExchangeTestConfig = readSystemSandboxConfig(),
    options: SingleTickHelperOptions = {},
  ) {
    this.config = config;
    this.options = options;
  }

  getConfig(): SandboxExchangeTestConfig {
    return this.config;
  }

  getExchange(): ccxt.Exchange {
    return this.exchange;
  }

  getExchangeForAccount(accountLabel?: string): ccxt.Exchange {
    return this.exchangeInitService.getExchange(
      this.config.exchangeId,
      accountLabel || this.config.accountLabel,
    );
  }

  getExecutorSession(exchange: string, pair: string, orderId: string) {
    return this.executorRegistry
      .getExecutor(exchange, pair)
      ?.getSession(orderId);
  }

  getExecutor(exchange: string, pair: string) {
    return this.executorRegistry.getExecutor(exchange, pair);
  }

  getClockTickCoordinatorService(): ClockTickCoordinatorService {
    return this.clockTickCoordinatorService;
  }

  getOrderBookTrackerService(): OrderBookTrackerService {
    return this.orderBookTrackerService;
  }

  getPrivateStreamIngestionService(): PrivateStreamIngestionService {
    return this.privateStreamIngestionService;
  }

  getPrivateStreamTrackerService(): PrivateStreamTrackerService {
    return this.privateStreamTrackerService;
  }

  getModuleRef(): TestingModule {
    return this.moduleRef;
  }

  async startWorker(): Promise<void> {
    await this.strategyIntentWorkerService.onModuleInit();
  }

  async stopWorker(): Promise<void> {
    if (this.strategyIntentWorkerService) {
      await this.strategyIntentWorkerService.onModuleDestroy();
    }
  }

  async init(): Promise<void> {
    if (this.moduleRef) {
      return;
    }

    const cacheManagerMock = {
      get: async () => undefined,
      set: async () => undefined,
    };
    const configServiceMock = {
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'strategy.exchange_min_request_interval_ms') {
          return this.config.minRequestIntervalMs;
        }
        if (key === 'strategy.execute_intents') {
          return true;
        }
        if (key === 'strategy.intent_execution_driver') {
          return this.options.intentExecutionDriver || 'sync';
        }
        if (key === 'strategy.intent_worker_poll_interval_ms') {
          return this.options.intentWorkerPollIntervalMs ?? 10;
        }
        if (key === 'strategy.intent_worker_max_in_flight') {
          return this.options.intentWorkerMaxInFlight ?? 4;
        }
        if (key === 'strategy.intent_worker_max_in_flight_per_exchange') {
          return this.options.intentWorkerMaxInFlightPerExchange ?? 1;
        }

        return defaultValue;
      },
    };
    const exchangeApiKeyServiceMock = {
      readDecryptedAPIKeys: async () => [],
      readSupportedExchanges: async () => [],
      seedApiKeysFromEnv: async () => 0,
    };

    this.moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...this.databaseConfig.options,
          dropSchema: true,
          entities: SINGLE_TICK_TEST_ENTITIES,
          synchronize: true,
        }),
        TypeOrmModule.forFeature(SINGLE_TICK_TEST_ENTITIES),
      ],
      providers: [
        ExchangeConnectorAdapterService,
        ExchangeInitService,
        ExchangeOrderMappingService,
        ExchangeOrderTrackerService,
        ExecutorOrchestratorService,
        ExecutorRegistry,
        FillRoutingService,
        MarketMakingRuntimeService,
        MarketMakingOrderProcessor,
        ClockTickCoordinatorService,
        OrderBookTrackerService,
        PrivateStreamIngestionService,
        PrivateStreamTrackerService,
        DualAccountVolumeStrategyController,
        PureMarketMakingStrategyController,
        QuoteExecutorManagerService,
        StrategyIntentExecutionService,
        StrategyIntentStoreService,
        StrategyIntentWorkerService,
        StrategyMarketDataProviderService,
        StrategyRuntimeDispatcherService,
        StrategyService,
        UserOrdersService,
        {
          provide: CACHE_MANAGER,
          useValue: cacheManagerMock,
        },
        {
          provide: CampaignService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: ExchangeApiKeyService,
          useValue: exchangeApiKeyServiceMock,
        },
        {
          provide: FeeService,
          useValue: {},
        },
        {
          provide: GrowdataRepository,
          useValue: {},
        },
        {
          provide: MarketdataService,
          useValue: {
            getTickerPrice: async () => null,
          },
        },
        {
          provide: MixinClientService,
          useValue: {},
        },
        {
          provide: NetworkMappingService,
          useValue: {},
        },
        {
          provide: StrategyConfigResolverService,
          useValue: {
            getDefinitionControllerType: (definition: StrategyDefinition) =>
              definition.controllerType || definition.executorType,
          },
        },
        {
          provide: StrategyControllerRegistry,
          useFactory: (
            dualAccountVolumeController: DualAccountVolumeStrategyController,
            pureMarketMakingController: PureMarketMakingStrategyController,
          ) =>
            new StrategyControllerRegistry([
              pureMarketMakingController,
              dualAccountVolumeController,
            ]),
          inject: [
            DualAccountVolumeStrategyController,
            PureMarketMakingStrategyController,
          ],
        },
        {
          provide: TransactionService,
          useValue: {},
        },
        {
          provide: WithdrawalService,
          useValue: {},
        },
        {
          provide: BalanceLedgerService,
          useValue: {},
        },
        {
          provide: getQueueToken('market-making'),
          useValue: {
            add: async () => undefined,
            getJob: async () => null,
          },
        },
      ],
    }).compile();

    this.exchangeOrderMappingRepository = this.moduleRef.get(
      getRepositoryToken(ExchangeOrderMapping),
    );
    this.clockTickCoordinatorService = this.moduleRef.get(
      ClockTickCoordinatorService,
    );
    this.exchangeOrderTrackerService = this.moduleRef.get(
      ExchangeOrderTrackerService,
    );
    this.exchangeInitService = this.moduleRef.get(ExchangeInitService);
    this.executorRegistry = this.moduleRef.get(ExecutorRegistry);
    this.marketMakingOrderProcessor = this.moduleRef.get(
      MarketMakingOrderProcessor,
    );
    this.marketMakingOrderRepository = this.moduleRef.get(
      getRepositoryToken(MarketMakingOrder),
    );
    this.orderBookTrackerService = this.moduleRef.get(OrderBookTrackerService);
    this.strategyDefinitionRepository = this.moduleRef.get(
      getRepositoryToken(StrategyDefinition),
    );
    this.strategyIntentExecutionService = this.moduleRef.get(
      StrategyIntentExecutionService,
    );
    this.strategyIntentWorkerService = this.moduleRef.get(
      StrategyIntentWorkerService,
    );
    this.strategyExecutionHistoryRepository = this.moduleRef.get(
      getRepositoryToken(StrategyExecutionHistory),
    );
    this.strategyOrderIntentRepository = this.moduleRef.get(
      getRepositoryToken(StrategyOrderIntentEntity),
    );
    this.privateStreamIngestionService = this.moduleRef.get(
      PrivateStreamIngestionService,
    );
    this.privateStreamTrackerService = this.moduleRef.get(
      PrivateStreamTrackerService,
    );

    this.exchange = await waitForInitializedExchange(
      this.exchangeInitService,
      this.config.exchangeId,
      this.config.accountLabel,
    );

    for (const component of [
      this.orderBookTrackerService,
      this.exchangeOrderTrackerService,
      this.privateStreamTrackerService,
      this.moduleRef.get(StrategyService),
    ]) {
      const lifecycleComponent = component as TickComponent & {
        onModuleInit?: () => Promise<void>;
      };

      if (typeof lifecycleComponent.onModuleInit === 'function') {
        await lifecycleComponent.onModuleInit();
      }
    }
  }

  async close(): Promise<void> {
    try {
      await this.stopWorker();
      await this.cleanupAllRuntimeOrders();

      if (this.exchange && typeof this.exchange.close === 'function') {
        await this.exchange.close();
      }
    } finally {
      if (this.moduleRef) {
        await this.moduleRef.close();
      }

      this.databaseConfig.cleanup();
    }
  }

  async createPersistedPureMarketMakingOrder(
    overrides: PureMarketMakingRuntimeOverrides = {},
  ): Promise<RuntimeFixture> {
    const orderId = overrides.orderId || `mmtick${Date.now().toString(36)}`;
    const userId = overrides.userId || 'runtime-user';
    const pair = overrides.pair || this.config.symbol;
    const bidSpread = overrides.bidSpread ?? 0.001;
    const askSpread = overrides.askSpread ?? 0.001;
    const orderAmount = overrides.orderAmount ?? 0.0002;
    const orderRefreshTime = overrides.orderRefreshTime ?? 60000;
    const numberOfLayers = overrides.numberOfLayers ?? 1;
    const amountChangePerLayer = overrides.amountChangePerLayer ?? 0;
    const amountChangeType = overrides.amountChangeType || 'fixed';
    const strategyDefinition = await this.strategyDefinitionRepository.save(
      this.strategyDefinitionRepository.create({
        key: `pure-market-making-${orderId}`,
        name: `Pure MM ${orderId}`,
        controllerType: 'pureMarketMaking',
        configSchema: {},
        defaultConfig: {},
        enabled: true,
        visibility: 'system',
      }),
    );
    const order = await this.marketMakingOrderRepository.save(
      this.marketMakingOrderRepository.create({
        orderId,
        userId,
        pair,
        exchangeName: this.config.exchangeId,
        strategyDefinitionId: strategyDefinition.id,
        strategySnapshot: this.buildPureMarketMakingStrategySnapshot(orderId, {
          amountChangePerLayer,
          amountChangeType,
          askSpread,
          bidSpread,
          filledOrderDelay: overrides.filledOrderDelay,
          hangingOrdersEnabled: overrides.hangingOrdersEnabled,
          hangingOrdersCancelPct: overrides.hangingOrdersCancelPct,
          maxOrderAge: overrides.maxOrderAge,
          minimumSpread: overrides.minimumSpread,
          orderAmount,
          orderRefreshTolerancePct: overrides.orderRefreshTolerancePct,
          orderRefreshTime,
          numberOfLayers,
          pair,
          userId,
        }),
        bidSpread: String(bidSpread),
        askSpread: String(askSpread),
        orderAmount: String(orderAmount),
        orderRefreshTime: String(orderRefreshTime),
        numberOfLayers: String(numberOfLayers),
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: String(amountChangePerLayer),
        amountChangeType,
        ceilingPrice: '0',
        floorPrice: '0',
        state: 'created',
        createdAt: getRFC3339Timestamp(),
        rewardAddress: 'runtime-test-reward',
      }),
    );

    this.runtimeOrderIds.add(order.orderId);

    return {
      order,
      strategyDefinition,
      strategyKey: createPureMarketMakingStrategyKey(order.orderId),
    };
  }

  async startOrder(orderId: string, userId: string): Promise<void> {
    await this.marketMakingOrderProcessor.handleStartMM({
      data: { userId, orderId },
    } as unknown as Job<{ userId: string; orderId: string }>);
  }

  async runSingleTick(orderId: string): Promise<void> {
    const order = await this.marketMakingOrderRepository.findOneByOrFail({
      orderId,
    });
    const executor = this.executorRegistry.getExecutor(
      order.exchangeName,
      order.pair,
    );

    if (!executor) {
      throw new Error(
        `Executor not found for ${order.exchangeName} ${order.pair}`,
      );
    }

    await executor.onTick(getRFC3339Timestamp());
  }

  async runCoordinatorTick(): Promise<void> {
    await this.clockTickCoordinatorService.tickOnce();
  }

  async stopOrder(orderId: string, userId: string): Promise<void> {
    await this.marketMakingOrderProcessor.handleStopMM({
      data: { userId, orderId },
    } as unknown as Job<{ userId: string; orderId: string }>);
  }

  async flushPrivateStreamEvents(): Promise<void> {
    await this.privateStreamTrackerService.onTick(getRFC3339Timestamp());
  }

  async forceSessionReadyForNextTick(orderId: string): Promise<void> {
    const order = await this.marketMakingOrderRepository.findOneByOrFail({
      orderId,
    });
    const session = this.getExecutorSession(
      order.exchangeName,
      order.pair,
      order.orderId,
    );

    if (!session) {
      throw new Error(
        `Executor session not found for ${order.exchangeName} ${order.pair}`,
      );
    }

    session.nextRunAtMs = Date.now();
  }

  async listStrategyIntents(
    orderId: string,
  ): Promise<StrategyOrderIntentEntity[]> {
    return await this.strategyOrderIntentRepository.find({
      where: { clientId: orderId },
      order: { createdAt: 'ASC', intentId: 'ASC' },
    });
  }

  async listOrderMappings(orderId: string): Promise<ExchangeOrderMapping[]> {
    return await this.exchangeOrderMappingRepository.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  async listExecutionHistory(
    orderId: string,
  ): Promise<StrategyExecutionHistory[]> {
    return await this.strategyExecutionHistoryRepository.find({
      where: { clientId: orderId },
      order: { executedAt: 'ASC' },
    });
  }

  async waitForIntentStatuses(
    orderId: string,
    expectedStatuses: string[],
    timeoutMs = 30000,
  ): Promise<StrategyOrderIntentEntity[]> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const intents = await this.listStrategyIntents(orderId);
      const statuses = intents.map((intent) => intent.status);

      if (
        statuses.length === expectedStatuses.length &&
        statuses.every((status, index) => status === expectedStatuses[index])
      ) {
        return intents;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return await this.listStrategyIntents(orderId);
  }

  getOpenTrackedOrders(strategyKey: string) {
    return this.exchangeOrderTrackerService.getOpenOrders(strategyKey);
  }

  async consumeStoredIntents(intentIds: string[]): Promise<void> {
    const intents: StrategyOrderIntentEntity[] = [];

    for (const intentId of intentIds) {
      const intent = await this.strategyOrderIntentRepository.findOneBy({
        intentId,
      });

      if (!intent) {
        throw new Error(`Intent not found: ${intentId}`);
      }

      intents.push(intent);
    }

    await this.strategyIntentExecutionService.consumeIntents(
      intents.map((intent) => ({
        type: intent.type as
          | 'CREATE_LIMIT_ORDER'
          | 'CANCEL_ORDER'
          | 'REPLACE_ORDER'
          | 'EXECUTE_AMM_SWAP'
          | 'STOP_CONTROLLER'
          | 'STOP_EXECUTOR',
        intentId: intent.intentId,
        strategyInstanceId: intent.strategyInstanceId,
        strategyKey: intent.strategyKey,
        userId: intent.userId,
        clientId: intent.clientId,
        exchange: intent.exchange,
        pair: intent.pair,
        side: intent.side as 'buy' | 'sell',
        price: intent.price,
        qty: intent.qty,
        mixinOrderId: intent.mixinOrderId,
        executionCategory: intent.executionCategory as
          | 'clob_cex'
          | 'clob_dex'
          | 'amm_dex'
          | undefined,
        metadata: intent.metadata || undefined,
        createdAt: intent.createdAt,
        status: intent.status as 'NEW' | 'SENT' | 'ACKED' | 'FAILED' | 'DONE',
      })),
    );
  }

  getTrackedOrder(exchange: string, exchangeOrderId: string) {
    return this.exchangeOrderTrackerService.getByExchangeOrderId(
      exchange,
      exchangeOrderId,
    );
  }

  async fetchExchangeOrder(
    exchangeOrderId: string,
    pair: string,
  ): Promise<ccxt.Order> {
    return await this.exchange.fetchOrder(exchangeOrderId, pair);
  }

  async cleanupRuntimeOrder(orderId: string): Promise<void> {
    const order = await this.marketMakingOrderRepository.findOneBy({ orderId });

    if (!order) {
      this.runtimeOrderIds.delete(orderId);

      return;
    }

    const mappings = await this.listOrderMappings(orderId);

    for (const mapping of [...mappings].reverse()) {
      try {
        const fetched = await this.exchange.fetchOrder(
          mapping.exchangeOrderId,
          order.pair,
        );
        const status = String(fetched?.status || '').toLowerCase();

        if (
          status === 'canceled' ||
          status === 'cancelled' ||
          status === 'closed'
        ) {
          continue;
        }

        await this.exchange.cancelOrder(mapping.exchangeOrderId, order.pair);
      } catch {
        continue;
      }
    }

    this.runtimeOrderIds.delete(orderId);
  }

  private buildPureMarketMakingStrategySnapshot(
    orderId: string,
    overrides: {
      askSpread: number;
      amountChangePerLayer: number;
      amountChangeType: 'fixed' | 'percentage';
      bidSpread: number;
      filledOrderDelay?: number;
      hangingOrdersEnabled?: boolean;
      hangingOrdersCancelPct?: number;
      maxOrderAge?: number;
      minimumSpread?: number;
      numberOfLayers: number;
      orderAmount: number;
      orderRefreshTolerancePct?: number;
      orderRefreshTime: number;
      pair: string;
      userId: string;
    },
  ): MarketMakingOrderStrategySnapshot {
    return {
      controllerType: 'pureMarketMaking',
      resolvedConfig: {
        userId: overrides.userId,
        clientId: orderId,
        marketMakingOrderId: orderId,
        pair: overrides.pair,
        exchangeName: this.config.exchangeId,
        accountLabel: this.config.accountLabel,
        bidSpread: overrides.bidSpread,
        askSpread: overrides.askSpread,
        orderAmount: overrides.orderAmount,
        orderRefreshTime: overrides.orderRefreshTime,
        numberOfLayers: overrides.numberOfLayers,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: overrides.amountChangePerLayer,
        amountChangeType: overrides.amountChangeType,
        hangingOrdersEnabled: Boolean(overrides.hangingOrdersEnabled),
        minimumSpread: overrides.minimumSpread,
        orderRefreshTolerancePct: overrides.orderRefreshTolerancePct,
        filledOrderDelay: overrides.filledOrderDelay,
        maxOrderAge: overrides.maxOrderAge,
        hangingOrdersCancelPct: overrides.hangingOrdersCancelPct,
      },
    };
  }

  private async cleanupAllRuntimeOrders(): Promise<void> {
    for (const orderId of [...this.runtimeOrderIds]) {
      await this.cleanupRuntimeOrder(orderId);
    }
  }
}

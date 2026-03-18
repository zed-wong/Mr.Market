import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { createPureMarketMakingStrategyKey } from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { MarketMakingPaymentState } from 'src/common/entities/orders/payment-state.entity';
import {
  MarketMakingOrder,
  type MarketMakingOrderStrategySnapshot,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
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
import { LocalCampaignService } from 'src/modules/market-making/local-campaign/local-campaign.service';
import { NetworkMappingService } from 'src/modules/market-making/network-mapping/network-mapping.service';
import { PureMarketMakingStrategyController } from 'src/modules/market-making/strategy/controllers/pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from 'src/modules/market-making/strategy/controllers/strategy-controller.registry';
import { StrategyMarketDataProviderService } from 'src/modules/market-making/strategy/data/strategy-market-data-provider.service';
import { StrategyConfigResolverService } from 'src/modules/market-making/strategy/dex/strategy-config-resolver.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyIntentExecutionService } from 'src/modules/market-making/strategy/execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyRuntimeDispatcherService } from 'src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service';
import { ExecutorOrchestratorService } from 'src/modules/market-making/strategy/intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from 'src/modules/market-making/strategy/intent/quote-executor-manager.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import { OrderBookTrackerService } from 'src/modules/market-making/trackers/order-book-tracker.service';
import { PrivateStreamIngestionService } from 'src/modules/market-making/trackers/private-stream-ingestion.service';
import { PrivateStreamTrackerService } from 'src/modules/market-making/trackers/private-stream-tracker.service';
import { MarketMakingOrderProcessor } from 'src/modules/market-making/user-orders/market-making.processor';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { MixinClientService } from 'src/modules/mixin/client/mixin-client.service';
import { TransactionService } from 'src/modules/mixin/transaction/transaction.service';
import { WithdrawalService } from 'src/modules/mixin/withdrawal/withdrawal.service';

import {
  pollUntil,
  readSystemSandboxConfig,
  type SandboxExchangeTestConfig,
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
  hangingOrdersEnabled?: boolean;
  numberOfLayers?: number;
  orderAmount?: number;
  orderId?: string;
  orderRefreshTime?: number;
  pair?: string;
  userId?: string;
};

export class MarketMakingSingleTickHelper {
  private readonly config: SandboxExchangeTestConfig;
  private exchange: any;
  private exchangeOrderMappingRepository!: Repository<ExchangeOrderMapping>;
  private exchangeOrderTrackerService!: ExchangeOrderTrackerService;
  private exchangeInitService!: ExchangeInitService;
  private executorRegistry!: ExecutorRegistry;
  private marketMakingOrderProcessor!: MarketMakingOrderProcessor;
  private marketMakingOrderRepository!: Repository<MarketMakingOrder>;
  private moduleRef!: TestingModule;
  private privateStreamIngestionService!: PrivateStreamIngestionService;
  private privateStreamTrackerService!: PrivateStreamTrackerService;
  private readonly runtimeOrderIds = new Set<string>();
  private strategyDefinitionRepository!: Repository<StrategyDefinition>;
  private strategyExecutionHistoryRepository!: Repository<StrategyExecutionHistory>;
  private strategyOrderIntentRepository!: Repository<StrategyOrderIntentEntity>;

  constructor(config: SandboxExchangeTestConfig = readSystemSandboxConfig()) {
    this.config = config;
  }

  getConfig(): SandboxExchangeTestConfig {
    return this.config;
  }

  getExchange(): any {
    return this.exchange;
  }

  getExchangeForAccount(accountLabel?: string): any {
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

  getPrivateStreamIngestionService(): PrivateStreamIngestionService {
    return this.privateStreamIngestionService;
  }

  getPrivateStreamTrackerService(): PrivateStreamTrackerService {
    return this.privateStreamTrackerService;
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
          return 'sync';
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
          type: 'sqlite',
          database: ':memory:',
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
        MarketMakingOrderProcessor,
        OrderBookTrackerService,
        PrivateStreamIngestionService,
        PrivateStreamTrackerService,
        PureMarketMakingStrategyController,
        QuoteExecutorManagerService,
        StrategyIntentExecutionService,
        StrategyIntentStoreService,
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
          provide: LocalCampaignService,
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
            pureMarketMakingController: PureMarketMakingStrategyController,
          ) => new StrategyControllerRegistry([pureMarketMakingController]),
          inject: [PureMarketMakingStrategyController],
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
    this.strategyDefinitionRepository = this.moduleRef.get(
      getRepositoryToken(StrategyDefinition),
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

    this.exchange = await pollUntil(
      async () => {
        try {
          return this.exchangeInitService.getExchange(
            this.config.exchangeId,
            this.config.accountLabel,
          );
        } catch {
          return null;
        }
      },
      async (exchange) => Boolean(exchange),
      {
        description: `sandbox exchange ${this.config.exchangeId} to initialize`,
      },
    );
  }

  async close(): Promise<void> {
    await this.cleanupAllRuntimeOrders();

    if (this.exchange && typeof this.exchange.close === 'function') {
      await this.exchange.close();
    }

    if (this.moduleRef) {
      await this.moduleRef.close();
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
          hangingOrdersEnabled: overrides.hangingOrdersEnabled,
          orderAmount,
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
    } as any);
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

  async stopOrder(orderId: string, userId: string): Promise<void> {
    await this.marketMakingOrderProcessor.handleStopMM({
      data: { userId, orderId },
    } as any);
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

  getOpenTrackedOrders(strategyKey: string) {
    return this.exchangeOrderTrackerService.getOpenOrders(strategyKey);
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
  ): Promise<any> {
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
      hangingOrdersEnabled?: boolean;
      numberOfLayers: number;
      orderAmount: number;
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
      },
    };
  }

  private async cleanupAllRuntimeOrders(): Promise<void> {
    for (const orderId of [...this.runtimeOrderIds]) {
      await this.cleanupRuntimeOrder(orderId);
    }
  }
}

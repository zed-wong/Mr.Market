import { getQueueToken } from '@nestjs/bull';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type * as ccxt from 'ccxt';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
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
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';
import { FeeService } from 'src/modules/market-making/fee/fee.service';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { LocalCampaignService } from 'src/modules/market-making/local-campaign/local-campaign.service';
import { NetworkMappingService } from 'src/modules/market-making/network-mapping/network-mapping.service';
import { StrategyConfigResolverService } from 'src/modules/market-making/strategy/dex/strategy-config-resolver.service';
import {
  type ExchangePairExecutor,
  type ExchangePairExecutorSession,
} from 'src/modules/market-making/strategy/execution/exchange-pair-executor';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyRuntimeDispatcherService } from 'src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service';
import { ExecutorOrchestratorService } from 'src/modules/market-making/strategy/intent/executor-orchestrator.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { MarketMakingOrderProcessor } from 'src/modules/market-making/user-orders/market-making.processor';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { MixinClientService } from 'src/modules/mixin/client/mixin-client.service';
import { TransactionService } from 'src/modules/mixin/transaction/transaction.service';
import { WithdrawalService } from 'src/modules/mixin/withdrawal/withdrawal.service';
import type { Repository } from 'typeorm';

import {
  readSystemSandboxConfig,
  type SandboxExchangeTestConfig,
  waitForInitializedExchange,
} from './sandbox-system.helper';

const RUNTIME_TEST_ENTITIES = [
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

type RuntimeFixtureOverrides = {
  exchangeName?: string;
  orderId?: string;
  pair?: string;
  strategySnapshot?: MarketMakingOrderStrategySnapshot;
  userId?: string;
};

type RuntimeFixture = {
  order: MarketMakingOrder;
  strategyDefinition: StrategyDefinition;
  strategyKey: string;
};

export class MarketMakingRuntimeHelper {
  private readonly config: SandboxExchangeTestConfig;
  private exchange!: ccxt.Exchange;
  private exchangeInitService!: ExchangeInitService;
  private executorRegistry!: ExecutorRegistry;
  private marketMakingOrderProcessor!: MarketMakingOrderProcessor;
  private marketMakingOrderRepository!: Repository<MarketMakingOrder>;
  private moduleRef!: TestingModule;
  private strategyDefinitionRepository!: Repository<StrategyDefinition>;
  private strategyExecutionHistoryRepository!: Repository<StrategyExecutionHistory>;
  private strategyInstanceRepository!: Repository<StrategyInstance>;
  private strategyOrderIntentRepository!: Repository<StrategyOrderIntentEntity>;

  constructor(config: SandboxExchangeTestConfig = readSystemSandboxConfig()) {
    this.config = config;
  }

  getConfig(): SandboxExchangeTestConfig {
    return this.config;
  }

  getExchange(): ccxt.Exchange {
    return this.exchange;
  }

  getProcessor(): MarketMakingOrderProcessor {
    return this.marketMakingOrderProcessor;
  }

  getExecutor(
    exchange: string,
    pair: string,
  ): ExchangePairExecutor | undefined {
    return this.executorRegistry.getExecutor(exchange, pair);
  }

  getExecutorSession(
    exchange: string,
    pair: string,
    orderId: string,
  ): ExchangePairExecutorSession | undefined {
    return this.getExecutor(exchange, pair)?.getSession(orderId);
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
          return false;
        }
        if (key === 'strategy.intent_execution_driver') {
          return 'worker';
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
          entities: RUNTIME_TEST_ENTITIES,
          synchronize: true,
        }),
        TypeOrmModule.forFeature(RUNTIME_TEST_ENTITIES),
      ],
      providers: [
        ExchangeInitService,
        ExecutorOrchestratorService,
        ExecutorRegistry,
        MarketMakingRuntimeService,
        MarketMakingOrderProcessor,
        StrategyConfigResolverService,
        StrategyIntentStoreService,
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
          provide: MixinClientService,
          useValue: {},
        },
        {
          provide: NetworkMappingService,
          useValue: {},
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
    this.strategyInstanceRepository = this.moduleRef.get(
      getRepositoryToken(StrategyInstance),
    );
    this.strategyOrderIntentRepository = this.moduleRef.get(
      getRepositoryToken(StrategyOrderIntentEntity),
    );

    this.exchange = await waitForInitializedExchange(
      this.exchangeInitService,
      this.config.exchangeId,
      this.config.accountLabel,
    );
  }

  async close(): Promise<void> {
    if (this.exchange && typeof this.exchange.close === 'function') {
      await this.exchange.close();
    }

    if (this.moduleRef) {
      await this.moduleRef.close();
    }
  }

  async createPersistedPureMarketMakingOrder(
    overrides: RuntimeFixtureOverrides = {},
  ): Promise<RuntimeFixture> {
    const orderId =
      overrides.orderId || `mm-runtime-${Date.now().toString(36)}`;
    const userId = overrides.userId || 'runtime-user';
    const pair = overrides.pair || this.config.symbol;
    const exchangeName = overrides.exchangeName || this.config.exchangeId;
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
    const strategySnapshot =
      overrides.strategySnapshot ||
      this.buildPureMarketMakingStrategySnapshot({
        exchangeName,
        orderId,
        pair,
        userId,
      });
    const order = await this.marketMakingOrderRepository.save(
      this.marketMakingOrderRepository.create({
        orderId,
        userId,
        pair,
        exchangeName,
        strategyDefinitionId: strategyDefinition.id,
        strategySnapshot,
        bidSpread: '0.001',
        askSpread: '0.001',
        orderAmount: '0.0002',
        orderRefreshTime: '60000',
        numberOfLayers: '1',
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: '0',
        amountChangeType: 'fixed',
        ceilingPrice: '0',
        floorPrice: '0',
        state: 'created',
        createdAt: getRFC3339Timestamp(),
        rewardAddress: 'runtime-test-reward',
      }),
    );

    return {
      order,
      strategyDefinition,
      strategyKey: createPureMarketMakingStrategyKey(orderId),
    };
  }

  async findOrder(orderId: string): Promise<MarketMakingOrder | null> {
    return await this.marketMakingOrderRepository.findOneBy({ orderId });
  }

  async fetchExchangeTicker(pair = this.config.symbol): Promise<ccxt.Ticker> {
    return await this.exchange.fetchTicker(pair);
  }

  async findStrategyInstance(
    orderId: string,
  ): Promise<StrategyInstance | null> {
    return await this.strategyInstanceRepository.findOneBy({
      strategyKey: createPureMarketMakingStrategyKey(orderId),
    });
  }

  async listStrategyIntents(): Promise<StrategyOrderIntentEntity[]> {
    return await this.strategyOrderIntentRepository.find({
      order: {
        createdAt: 'ASC',
        intentId: 'ASC',
      },
    });
  }

  async countExecutionHistory(): Promise<number> {
    return await this.strategyExecutionHistoryRepository.count();
  }

  private buildPureMarketMakingStrategySnapshot(params: {
    exchangeName: string;
    orderId: string;
    pair: string;
    userId: string;
  }): MarketMakingOrderStrategySnapshot {
    return {
      controllerType: 'pureMarketMaking',
      resolvedConfig: {
        userId: params.userId,
        clientId: params.orderId,
        marketMakingOrderId: params.orderId,
        pair: params.pair,
        exchangeName: params.exchangeName,
        bidSpread: 0.001,
        askSpread: 0.001,
        orderAmount: 0.0002,
        orderRefreshTime: 60000,
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        ceilingPrice: 0,
        floorPrice: 0,
      },
    };
  }
}

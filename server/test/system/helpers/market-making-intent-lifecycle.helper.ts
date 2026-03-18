import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { MarketMakingPaymentState } from 'src/common/entities/orders/payment-state.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { createPureMarketMakingStrategyKey } from 'src/common/helpers/strategyKey';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { ExchangeConnectorAdapterService } from 'src/modules/market-making/execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from 'src/modules/market-making/execution/exchange-order-mapping.service';
import { StrategyMarketDataProviderService } from 'src/modules/market-making/strategy/data/strategy-market-data-provider.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyIntentExecutionService } from 'src/modules/market-making/strategy/execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyIntentWorkerService } from 'src/modules/market-making/strategy/execution/strategy-intent-worker.service';
import { ExecutorOrchestratorService } from 'src/modules/market-making/strategy/intent/executor-orchestrator.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';

type DeferredPlacement = {
  callIndex: number;
  clientOrderId: string;
  exchangeOrderId: string;
  resolve: (value: { id: string; status: string }) => void;
  reject: (reason?: unknown) => void;
};

type PublishOverrides = {
  clientId?: string;
  exchangeName?: string;
  orderAmount?: number;
  pair?: string;
  userId?: string;
};

type LifecycleHelperOptions = {
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

const LIFECYCLE_TEST_ENTITIES = [
  Contribution,
  ExchangeOrderMapping,
  MarketMakingOrder,
  MarketMakingOrderIntent,
  MarketMakingPaymentState,
  MixinUser,
  SimplyGrowOrder,
  StrategyExecutionHistory,
  StrategyInstance,
  StrategyOrderIntentEntity,
];

export class MarketMakingIntentLifecycleHelper {
  private readonly options: LifecycleHelperOptions;
  private moduleRef!: TestingModule;
  private strategyService!: StrategyService;
  private strategyIntentExecutionService!: StrategyIntentExecutionService;
  private strategyIntentWorkerService!: StrategyIntentWorkerService;
  private strategyOrderIntentRepository!: Repository<StrategyOrderIntentEntity>;
  private strategyExecutionHistoryRepository!: Repository<StrategyExecutionHistory>;
  private exchangeOrderMappingRepository!: Repository<ExchangeOrderMapping>;
  private pendingPlacements: DeferredPlacement[] = [];
  private placementCallCount = 0;

  constructor(options: LifecycleHelperOptions = {}) {
    this.options = options;
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
        if (key === 'strategy.execute_intents') {
          return true;
        }
        if (key === 'strategy.intent_execution_driver') {
          return 'worker';
        }
        if (key === 'strategy.intent_worker_poll_interval_ms') {
          return 10;
        }
        if (key === 'strategy.intent_worker_max_in_flight') {
          return 4;
        }
        if (key === 'strategy.intent_worker_max_in_flight_per_exchange') {
          return 1;
        }
        if (key === 'strategy.intent_max_retries') {
          return this.options.maxRetries ?? 0;
        }
        if (key === 'strategy.intent_retry_base_delay_ms') {
          return this.options.retryBaseDelayMs ?? 10;
        }

        return defaultValue;
      },
    };
    const exchangeConnectorAdapterMock = {
      placeLimitOrder: jest.fn(
        async (
          _exchange: string,
          _pair: string,
          _side: string,
          _qty: string,
          _price: string,
          clientOrderId: string,
        ) =>
          await new Promise<{ id: string; status: string }>(
            (resolve, reject) => {
              const callIndex = this.placementCallCount++;
              const exchangeOrderId = `ex-${clientOrderId}`;

              this.pendingPlacements.push({
                callIndex,
                clientOrderId,
                exchangeOrderId,
                resolve,
                reject,
              });
            },
          ),
      ),
      cancelOrder: jest.fn(),
      fetchOrder: jest.fn(),
    };
    const exchangeInitServiceMock = {
      getExchange: jest.fn(),
      getSupportedExchanges: jest.fn(() => ['binance']),
    };
    const strategyMarketDataProviderServiceMock = {
      getReferencePrice: jest.fn(async () => 100),
      getBestBidAsk: jest.fn(async () => ({ bestBid: 99.5, bestAsk: 100.5 })),
      getOrderBook: jest.fn(async () => ({
        bids: [[99.5, 10]],
        asks: [[100.5, 10]],
      })),
    };

    this.moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: LIFECYCLE_TEST_ENTITIES,
          synchronize: true,
        }),
        TypeOrmModule.forFeature(LIFECYCLE_TEST_ENTITIES),
      ],
      providers: [
        ExchangeOrderMappingService,
        ExchangeOrderTrackerService,
        ExecutorOrchestratorService,
        ExecutorRegistry,
        StrategyIntentExecutionService,
        StrategyIntentStoreService,
        StrategyIntentWorkerService,
        StrategyService,
        {
          provide: CACHE_MANAGER,
          useValue: cacheManagerMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: ExchangeConnectorAdapterService,
          useValue: exchangeConnectorAdapterMock,
        },
        {
          provide: ExchangeInitService,
          useValue: exchangeInitServiceMock,
        },
        {
          provide: StrategyMarketDataProviderService,
          useValue: strategyMarketDataProviderServiceMock,
        },
      ],
    }).compile();

    this.strategyService = this.moduleRef.get(StrategyService);
    this.strategyIntentExecutionService = this.moduleRef.get(
      StrategyIntentExecutionService,
    );
    this.strategyIntentWorkerService = this.moduleRef.get(
      StrategyIntentWorkerService,
    );
    this.strategyOrderIntentRepository = this.moduleRef.get(
      getRepositoryToken(StrategyOrderIntentEntity),
    );
    this.strategyExecutionHistoryRepository = this.moduleRef.get(
      getRepositoryToken(StrategyExecutionHistory),
    );
    this.exchangeOrderMappingRepository = this.moduleRef.get(
      getRepositoryToken(ExchangeOrderMapping),
    );
  }

  async close(): Promise<void> {
    while (this.pendingPlacements.length > 0) {
      this.rejectNextPlacement('helper shutdown');
    }

    await this.stopWorker();

    if (this.moduleRef) {
      await this.moduleRef.close();
    }
  }

  async publishPureMarketMakingCycle(
    overrides: PublishOverrides = {},
  ): Promise<string> {
    const userId = overrides.userId || 'system-user-1';
    const clientId = overrides.clientId || 'system-order-1';
    const pair = overrides.pair || 'BTC/USDT';
    const exchangeName = overrides.exchangeName || 'binance';

    await this.strategyService.executeMMCycle({
      userId,
      clientId,
      pair,
      exchangeName,
      bidSpread: 0.01,
      askSpread: 0.01,
      orderAmount: overrides.orderAmount || 0.5,
      orderRefreshTime: 60000,
      numberOfLayers: 1,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      ceilingPrice: undefined,
      floorPrice: undefined,
    });

    return createPureMarketMakingStrategyKey(clientId);
  }

  async startWorker(): Promise<void> {
    await this.strategyIntentWorkerService.onModuleInit();
  }

  async stopWorker(): Promise<void> {
    if (this.strategyIntentWorkerService) {
      await this.strategyIntentWorkerService.onModuleDestroy();
    }
  }

  async listStrategyIntents(
    strategyKey: string,
  ): Promise<StrategyOrderIntentEntity[]> {
    return await this.strategyOrderIntentRepository.find({
      where: { strategyKey },
      order: {
        createdAt: 'ASC',
        intentId: 'ASC',
      },
    });
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

  async listExecutionHistory(): Promise<StrategyExecutionHistory[]> {
    return await this.strategyExecutionHistoryRepository.find({
      order: {
        executedAt: 'ASC',
      },
    });
  }

  async listOrderMappings(): Promise<ExchangeOrderMapping[]> {
    return await this.exchangeOrderMappingRepository.find({
      order: {
        clientOrderId: 'ASC',
      },
    });
  }

  async waitForIntentStatuses(
    strategyKey: string,
    expectedStatuses: string[],
    timeoutMs = 4000,
  ): Promise<StrategyOrderIntentEntity[]> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const intents = await this.listStrategyIntents(strategyKey);
      const statuses = intents.map((intent) => intent.status);

      if (
        statuses.length === expectedStatuses.length &&
        statuses.every((status, index) => status === expectedStatuses[index])
      ) {
        return intents;
      }

      await this.sleep(10);
    }

    return await this.listStrategyIntents(strategyKey);
  }

  getPendingPlacements(): Array<{
    callIndex: number;
    clientOrderId: string;
    exchangeOrderId: string;
  }> {
    return this.pendingPlacements.map((placement) => ({
      callIndex: placement.callIndex,
      clientOrderId: placement.clientOrderId,
      exchangeOrderId: placement.exchangeOrderId,
    }));
  }

  async waitForPendingPlacements(
    expectedCount: number,
    timeoutMs = 4000,
  ): Promise<
    Array<{
      callIndex: number;
      clientOrderId: string;
      exchangeOrderId: string;
    }>
  > {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const pendingPlacements = this.getPendingPlacements();

      if (pendingPlacements.length === expectedCount) {
        return pendingPlacements;
      }

      await this.sleep(10);
    }

    return this.getPendingPlacements();
  }

  releaseNextPlacement(status = 'open'): void {
    const placement = this.pendingPlacements.shift();

    if (!placement) {
      throw new Error('No pending placements to release');
    }

    placement.resolve({
      id: placement.exchangeOrderId,
      status,
    });
  }

  rejectNextPlacement(message = 'simulated placement failure'): void {
    const placement = this.pendingPlacements.shift();

    if (!placement) {
      throw new Error('No pending placements to reject');
    }

    placement.reject(new Error(message));
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

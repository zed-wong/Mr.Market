import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import 'reflect-metadata';
import { BalanceReadModel } from 'src/common/entities/ledger/balance-read-model.entity';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { MarketMakingPaymentState } from 'src/common/entities/orders/payment-state.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';
import { FeeService } from 'src/modules/market-making/fee/fee.service';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { LocalCampaignService } from 'src/modules/market-making/local-campaign/local-campaign.service';
import { NetworkMappingService } from 'src/modules/market-making/network-mapping/network-mapping.service';
import { StrategyConfigResolverService } from 'src/modules/market-making/strategy/dex/strategy-config-resolver.service';
import { StrategyRuntimeDispatcherService } from 'src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { MarketMakingOrderProcessor } from 'src/modules/market-making/user-orders/market-making.processor';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { MixinClientService } from 'src/modules/mixin/client/mixin-client.service';
import { SnapshotsService } from 'src/modules/mixin/snapshots/snapshots.service';
import { TransactionService } from 'src/modules/mixin/transaction/transaction.service';
import { WithdrawalService } from 'src/modules/mixin/withdrawal/withdrawal.service';
import type { Repository } from 'typeorm';

type QueueJob = {
  id: string;
  name: string;
  data: any;
  opts: Record<string, any>;
  attemptsMade: number;
  queue: FakeQueue;
};

class FakeQueue {
  private readonly jobs = new Map<string, QueueJob>();
  private readonly handlers = new Map<
    string,
    (job: QueueJob) => Promise<void>
  >();
  private readonly immediateJobs = new Set<string>();

  registerHandler(
    name: string,
    handler: (job: QueueJob) => Promise<void>,
    options?: { immediate?: boolean },
  ): void {
    this.handlers.set(name, handler);
    if (options?.immediate) {
      this.immediateJobs.add(name);
    }
  }

  async add(
    name: string,
    data: any,
    opts: Record<string, any> = {},
  ): Promise<QueueJob> {
    const jobId = opts.jobId || `${name}_${this.jobs.size + 1}`;
    const job: QueueJob = {
      id: String(jobId),
      name,
      data,
      opts,
      attemptsMade: 0,
      queue: this,
    };

    this.jobs.set(job.id, job);

    if (this.immediateJobs.has(name)) {
      await this.runJob(job.id);
    }

    return job;
  }

  async getJob(jobId: string): Promise<QueueJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Queue job ${jobId} not found`);
    }

    const handler = this.handlers.get(job.name);

    if (!handler) {
      throw new Error(`No handler registered for ${job.name}`);
    }

    await handler(job);
    this.jobs.delete(job.id);
  }
}

const PAYMENT_TEST_ENTITIES = [
  BalanceReadModel,
  LedgerEntry,
  MarketMakingOrder,
  MarketMakingOrderIntent,
  MarketMakingPaymentState,
  SimplyGrowOrder,
  StrategyDefinition,
  StrategyExecutionHistory,
];

type PaymentIntentFixture = {
  orderId: string;
  memo: string;
  userId: string;
  marketMakingPairId: string;
  strategyDefinitionId: string;
};

export class MarketMakingPaymentHelper {
  private readonly marketMakingQueue = new FakeQueue();
  private readonly snapshotsQueue = {
    client: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    },
  };
  private readonly strategyServiceStub = {
    executePureMarketMakingStrategy: jest.fn().mockResolvedValue(undefined),
    startArbitrageStrategyForUser: jest.fn().mockResolvedValue(undefined),
    executeTimeIndicatorStrategy: jest.fn().mockResolvedValue(undefined),
    executeVolumeStrategy: jest.fn().mockResolvedValue(undefined),
    linkDefinitionToStrategyInstance: jest.fn().mockResolvedValue(undefined),
    stopStrategyForUser: jest.fn().mockResolvedValue(undefined),
  };
  private readonly transactionServiceStub = {
    refund: jest.fn().mockResolvedValue(undefined),
    transfer: jest.fn().mockResolvedValue(undefined),
  };
  private marketMakingOrderIntentRepository!: Repository<MarketMakingOrderIntent>;
  private marketMakingOrderRepository!: Repository<MarketMakingOrder>;
  private moduleRef!: TestingModule;
  private paymentStateRepository!: Repository<MarketMakingPaymentState>;
  private snapshotsService!: SnapshotsService;
  private strategyDefinitionRepository!: Repository<StrategyDefinition>;
  private userOrdersService!: UserOrdersService;
  private balanceLedgerService!: BalanceLedgerService;

  async init(): Promise<void> {
    if (this.moduleRef) {
      return;
    }

    const pairConfig = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      enable: true,
      exchange_id: 'binance',
      symbol: 'BTC/USDT',
      base_asset_id: 'asset-base',
      quote_asset_id: 'asset-quote',
    };

    this.moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: PAYMENT_TEST_ENTITIES,
          synchronize: true,
        }),
        TypeOrmModule.forFeature(PAYMENT_TEST_ENTITIES),
      ],
      providers: [
        BalanceLedgerService,
        MarketMakingOrderProcessor,
        SnapshotsService,
        StrategyConfigResolverService,
        StrategyRuntimeDispatcherService,
        UserOrdersService,
        {
          provide: CampaignService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
        {
          provide: ExchangeApiKeyService,
          useValue: {},
        },
        {
          provide: FeeService,
          useValue: {
            calculateMoveFundsFee: jest.fn().mockResolvedValue({
              base_fee_id: 'asset-base',
              quote_fee_id: 'asset-quote',
              base_fee_amount: '0',
              quote_fee_amount: '0',
              market_making_fee_percentage: '0',
            }),
          },
        },
        {
          provide: GrowdataRepository,
          useValue: {
            findMarketMakingPairById: jest
              .fn()
              .mockImplementation(async (pairId: string) =>
                pairId === pairConfig.id ? pairConfig : null,
              ),
          },
        },
        {
          provide: LocalCampaignService,
          useValue: {},
        },
        {
          provide: MixinClientService,
          useValue: {
            client: {
              safe: {
                fetchSafeSnapshots: jest.fn(),
              },
            },
          },
        },
        {
          provide: NetworkMappingService,
          useValue: {},
        },
        {
          provide: StrategyService,
          useValue: this.strategyServiceStub,
        },
        {
          provide: TransactionService,
          useValue: this.transactionServiceStub,
        },
        {
          provide: WithdrawalService,
          useValue: {},
        },
        {
          provide: getQueueToken('market-making'),
          useValue: this.marketMakingQueue,
        },
        {
          provide: getQueueToken('snapshots'),
          useValue: this.snapshotsQueue,
        },
      ],
    }).compile();

    this.balanceLedgerService = this.moduleRef.get(BalanceLedgerService);
    this.marketMakingOrderIntentRepository = this.moduleRef.get(
      getRepositoryToken(MarketMakingOrderIntent),
    );
    this.marketMakingOrderRepository = this.moduleRef.get(
      getRepositoryToken(MarketMakingOrder),
    );
    this.paymentStateRepository = this.moduleRef.get(
      getRepositoryToken(MarketMakingPaymentState),
    );
    this.snapshotsService = this.moduleRef.get(SnapshotsService);
    this.strategyDefinitionRepository = this.moduleRef.get(
      getRepositoryToken(StrategyDefinition),
    );
    this.userOrdersService = this.moduleRef.get(UserOrdersService);

    const processor = this.moduleRef.get(MarketMakingOrderProcessor);

    this.marketMakingQueue.registerHandler(
      'process_market_making_snapshots',
      async (job) => {
        await processor.handleProcessMMSnapshot(job as any);
      },
      { immediate: true },
    );
    this.marketMakingQueue.registerHandler(
      'check_payment_complete',
      async (job) => {
        await processor.handleCheckPaymentComplete(job as any);
      },
    );
  }

  async close(): Promise<void> {
    await this.moduleRef?.close();
  }

  async createIntent(params?: {
    userId?: string;
    marketMakingPairId?: string;
    configOverrides?: Record<string, unknown>;
  }): Promise<PaymentIntentFixture> {
    const userId = params?.userId || '123e4567-e89b-12d3-a456-426614174100';
    const marketMakingPairId =
      params?.marketMakingPairId || '123e4567-e89b-12d3-a456-426614174001';
    const definition = await this.strategyDefinitionRepository.save(
      this.strategyDefinitionRepository.create({
        id: '123e4567-e89b-12d3-a456-426614174200',
        key: `pure-mm-${Date.now()}`,
        name: 'Pure MM Payment Test',
        controllerType: 'pureMarketMaking',
        configSchema: {},
        defaultConfig: {
          bidSpread: 0.001,
          askSpread: 0.001,
          orderAmount: 0.01,
          orderRefreshTime: 15000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        enabled: true,
        visibility: 'system',
      }),
    );
    const result = await this.userOrdersService.createMarketMakingOrderIntent({
      userId,
      marketMakingPairId,
      strategyDefinitionId: definition.id,
      configOverrides: params?.configOverrides,
    });

    return {
      orderId: result.orderId,
      memo: result.memo,
      userId,
      marketMakingPairId,
      strategyDefinitionId: definition.id,
    };
  }

  async ingestSnapshot(params: {
    snapshotId: string;
    assetId: string;
    amount: string;
    userId: string;
    memo: string;
  }): Promise<void> {
    await this.snapshotsService.handleSnapshot({
      snapshot_id: params.snapshotId,
      created_at: getRFC3339Timestamp(),
      asset_id: params.assetId,
      amount: params.amount,
      opponent_id: params.userId,
      memo: Buffer.from(params.memo, 'utf-8').toString('hex'),
    } as any);
  }

  async runQueuedPaymentCheck(orderId: string): Promise<void> {
    await this.marketMakingQueue.runJob(`check_payment_${orderId}`);
  }

  async findPaymentState(orderId: string) {
    return await this.paymentStateRepository.findOneBy({ orderId });
  }

  async findIntent(orderId: string) {
    return await this.marketMakingOrderIntentRepository.findOneBy({ orderId });
  }

  async findOrder(orderId: string) {
    return await this.marketMakingOrderRepository.findOneBy({ orderId });
  }

  async getBalance(userId: string, assetId: string) {
    return await this.balanceLedgerService.getBalance(userId, assetId);
  }

  async getQueuedMarketMakingJob(jobId: string) {
    return await this.marketMakingQueue.getJob(jobId);
  }

  async startOrder(orderId: string, userId: string): Promise<void> {
    const processor = this.moduleRef.get(MarketMakingOrderProcessor);

    await processor.handleStartMM({
      data: { orderId, userId },
      queue: this.marketMakingQueue,
    } as any);
  }

  getStrategyServiceStub() {
    return this.strategyServiceStub;
  }
}

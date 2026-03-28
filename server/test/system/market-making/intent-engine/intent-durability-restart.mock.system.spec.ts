import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { DurabilityService } from 'src/modules/market-making/durability/durability.service';
import { ExchangeConnectorAdapterService } from 'src/modules/market-making/execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from 'src/modules/market-making/execution/exchange-order-mapping.service';
import { StrategyOrderIntent } from 'src/modules/market-making/strategy/config/strategy-intent.types';
import { StrategyIntentExecutionService } from 'src/modules/market-making/strategy/execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyIntentWorkerService } from 'src/modules/market-making/strategy/execution/strategy-intent-worker.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import type { Repository } from 'typeorm';

import { ConsumerReceipt } from '../../../../src/common/entities/system/consumer-receipt.entity';
import { OutboxEvent } from '../../../../src/common/entities/system/outbox-event.entity';
import {
  createSystemTestDatabaseConfig,
  pollUntil,
} from '../../helpers/sandbox-system.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('intent-durability-restart');

const TEST_ENTITIES = [
  StrategyOrderIntentEntity,
  StrategyExecutionHistory,
  ExchangeOrderMapping,
  OutboxEvent,
  ConsumerReceipt,
];

const databaseConfig = createSystemTestDatabaseConfig(
  'intent-durability-restart',
);

type BuiltModule = {
  historyRepository: Repository<StrategyExecutionHistory>;
  intentRepository: Repository<StrategyOrderIntentEntity>;
  intentStoreService: StrategyIntentStoreService;
  mappingRepository: Repository<ExchangeOrderMapping>;
  moduleRef: TestingModule;
  outboxRepository: Repository<OutboxEvent>;
  placeLimitOrder: jest.Mock;
  receiptRepository: Repository<ConsumerReceipt>;
  workerService: StrategyIntentWorkerService;
};

const buildIntent = (
  overrides?: Partial<StrategyOrderIntent>,
): StrategyOrderIntent => ({
  type: 'CREATE_LIMIT_ORDER',
  intentId: 'restart-intent-1',
  strategyInstanceId: 'strategy-instance-1',
  strategyKey: 'u1-c1-pureMarketMaking',
  userId: 'u1',
  clientId: 'c1',
  exchange: 'binance',
  pair: 'BTC/USDT',
  side: 'buy',
  price: '100',
  qty: '1',
  createdAt: '2026-03-20T00:00:00.000Z',
  status: 'NEW',
  ...(overrides || {}),
});

const createConfigService = () =>
  ({
    get: jest.fn((key: string, defaultValue?: unknown) => {
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
        return 2;
      }
      if (key === 'strategy.intent_worker_max_in_flight_per_exchange') {
        return 1;
      }
      if (key === 'strategy.intent_max_retries') {
        return 0;
      }
      if (key === 'strategy.intent_retry_base_delay_ms') {
        return 10;
      }

      return defaultValue;
    }),
  } as unknown as ConfigService);

async function createModule(
  placeLimitOrder: jest.Mock = jest
    .fn()
    .mockResolvedValue({ id: 'exchange-order-1', status: 'open' }),
): Promise<BuiltModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        ...databaseConfig.options,
        dropSchema: false,
        entities: TEST_ENTITIES,
        synchronize: true,
      }),
      TypeOrmModule.forFeature(TEST_ENTITIES),
    ],
    providers: [
      DurabilityService,
      ExchangeOrderMappingService,
      ExchangeOrderTrackerService,
      StrategyIntentExecutionService,
      StrategyIntentStoreService,
      StrategyIntentWorkerService,
      {
        provide: ConfigService,
        useValue: createConfigService(),
      },
      {
        provide: ExchangeConnectorAdapterService,
        useValue: {
          placeLimitOrder,
          cancelOrder: jest.fn(),
          fetchOrder: jest.fn(),
        },
      },
    ],
  }).compile();

  return {
    moduleRef,
    workerService: moduleRef.get(StrategyIntentWorkerService),
    intentStoreService: moduleRef.get(StrategyIntentStoreService),
    intentRepository: moduleRef.get(
      getRepositoryToken(StrategyOrderIntentEntity),
    ),
    mappingRepository: moduleRef.get(getRepositoryToken(ExchangeOrderMapping)),
    historyRepository: moduleRef.get(
      getRepositoryToken(StrategyExecutionHistory),
    ),
    outboxRepository: moduleRef.get(getRepositoryToken(OutboxEvent)),
    receiptRepository: moduleRef.get(getRepositoryToken(ConsumerReceipt)),
    placeLimitOrder,
  };
}

describe('Intent durability restart parity (mock system)', () => {
  jest.setTimeout(30000);

  afterAll(() => {
    databaseConfig.cleanup();
    log.suite('temporary database removed', {
      databasePath: databaseConfig.databasePath,
    });
  });

  it('restarts a fresh worker process and skips a re-delivered intent via persisted durability receipts', async () => {
    log.step('booting first worker module');
    const firstModule = await createModule();
    let firstModuleClosed = false;

    try {
      await firstModule.intentStoreService.upsertIntent(buildIntent());

      log.step('starting first worker loop');
      await firstModule.workerService.onModuleInit();

      const firstPassIntent = await pollUntil(
        async () =>
          await firstModule.intentRepository.findOneByOrFail({
            intentId: 'restart-intent-1',
          }),
        async (intent) => intent.status === 'DONE',
        {
          description: 'first worker pass to finish the stored intent',
          intervalMs: 25,
        },
      );

      expect(firstModule.placeLimitOrder).toHaveBeenCalledTimes(1);
      expect(await firstModule.mappingRepository.count()).toBe(1);
      expect(await firstModule.historyRepository.count()).toBe(1);
      expect(await firstModule.receiptRepository.count()).toBe(1);
      expect(await firstModule.outboxRepository.count()).toBe(1);

      log.step('rewinding intent status to NEW while keeping durability receipt');
      await firstModule.intentRepository.save({
        ...firstPassIntent,
        status: 'NEW',
        updatedAt: getRFC3339Timestamp(),
      });

      await firstModule.workerService.onModuleDestroy();
      await firstModule.moduleRef.close();
      firstModuleClosed = true;
    } finally {
      if (!firstModuleClosed) {
        await firstModule.workerService
          .onModuleDestroy()
          .catch(() => undefined);
        await firstModule.moduleRef.close().catch(() => undefined);
      }
    }

    log.step('booting second worker module against the same sqlite database');
    const secondPlaceLimitOrder = jest
      .fn()
      .mockResolvedValue({ id: 'exchange-order-2', status: 'open' });
    const secondModule = await createModule(secondPlaceLimitOrder);

    try {
      await secondModule.workerService.onModuleInit();

      const secondPassIntent = await pollUntil(
        async () =>
          await secondModule.intentRepository.findOneByOrFail({
            intentId: 'restart-intent-1',
          }),
        async (intent) => intent.status === 'DONE',
        {
          description:
            'second worker pass to mark the intent done via durability receipt',
          intervalMs: 25,
        },
      );

      log.result('restart pass completed', {
        status: secondPassIntent.status,
        mixinOrderId: secondPassIntent.mixinOrderId,
      });

      expect(secondModule.placeLimitOrder).not.toHaveBeenCalled();
      expect(await secondModule.mappingRepository.count()).toBe(1);
      expect(await secondModule.historyRepository.count()).toBe(1);
      expect(await secondModule.receiptRepository.count()).toBe(1);
      expect(await secondModule.outboxRepository.count()).toBe(1);
    } finally {
      await secondModule.workerService.onModuleDestroy();
      await secondModule.moduleRef.close();
    }
  });
});

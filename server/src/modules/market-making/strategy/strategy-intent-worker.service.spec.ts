import { ConfigService } from '@nestjs/config';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';

import { StrategyIntentWorkerService } from './strategy-intent-worker.service';

const wait = async (ms: number) =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (
  condition: () => boolean,
  timeoutMs = 1000,
): Promise<void> => {
  const startedAt = Date.now();

  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Condition wait timed out');
    }
    await wait(5);
  }
};

const createConfigService = (overrides?: Record<string, number | string>) =>
  ({
    get: jest.fn((key: string, defaultValue?: number | string) => {
      const values: Record<string, number | string> = {
        'strategy.intent_execution_driver': 'worker',
        'strategy.intent_worker_poll_interval_ms': 5,
        'strategy.intent_worker_max_in_flight': 2,
        'strategy.intent_worker_max_in_flight_per_exchange': 2,
        ...(overrides || {}),
      };

      return values[key] ?? defaultValue;
    }),
  } as unknown as ConfigService);

const createHeadIntent = (
  strategyKey: string,
  intentId: string,
  exchange = 'binance',
  status: StrategyOrderIntentEntity['status'] = 'NEW',
): StrategyOrderIntentEntity => ({
  intentId,
  strategyInstanceId: strategyKey,
  strategyKey,
  userId: strategyKey,
  clientId: strategyKey,
  type: 'CREATE_LIMIT_ORDER',
  exchange,
  pair: 'BTC/USDT',
  side: 'buy',
  price: '100',
  qty: '1',
  status,
  createdAt: '2026-02-11T00:00:00.000Z',
  updatedAt: '2026-02-11T00:00:00.000Z',
});

describe('StrategyIntentWorkerService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('executes intents concurrently up to configured max in-flight', async () => {
    const processed = new Set<string>();
    let active = 0;
    let maxActive = 0;

    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest
        .fn()
        .mockResolvedValue(['s1', 's2', 's3']),
      getHeadIntent: jest.fn(async (strategyKey: string) =>
        createHeadIntent(strategyKey, `${strategyKey}-intent`),
      ),
    };

    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn((intentId: string) =>
        processed.has(intentId),
      ),
      consumeIntents: jest.fn(async (intents) => {
        const intentId = intents[0].intentId;

        active += 1;
        maxActive = Math.max(maxActive, active);
        await wait(25);
        processed.add(intentId);
        active -= 1;
      }),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService({
        'strategy.intent_worker_max_in_flight': 2,
      }),
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await waitFor(
      () =>
        strategyIntentExecutionService.consumeIntents.mock.calls.length >= 3,
    );
    expect(maxActive).toBe(2);
    await service.onModuleDestroy();
  });

  it('does not execute later intents when head-of-line is not NEW', async () => {
    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn().mockResolvedValue(['s1']),
      getHeadIntent: jest
        .fn()
        .mockResolvedValue(
          createHeadIntent('s1', 's1-old', 'binance', 'FAILED'),
        ),
    };
    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn().mockReturnValue(false),
      consumeIntents: jest.fn(),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService(),
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await wait(40);
    await service.onModuleDestroy();

    expect(
      strategyIntentExecutionService.consumeIntents,
    ).not.toHaveBeenCalled();
  });

  it('enforces per-exchange in-flight cap', async () => {
    const processed = new Set<string>();
    let activeByExchange = 0;
    let maxActiveByExchange = 0;

    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn().mockResolvedValue(['s1', 's2']),
      getHeadIntent: jest
        .fn()
        .mockImplementation(async (strategyKey: string) =>
          createHeadIntent(strategyKey, `${strategyKey}-intent`, 'binance'),
        ),
    };

    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn((intentId: string) =>
        processed.has(intentId),
      ),
      consumeIntents: jest.fn(async (intents) => {
        const intentId = intents[0].intentId;

        activeByExchange += 1;
        maxActiveByExchange = Math.max(maxActiveByExchange, activeByExchange);
        await wait(25);
        processed.add(intentId);
        activeByExchange -= 1;
      }),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService({
        'strategy.intent_worker_max_in_flight': 2,
        'strategy.intent_worker_max_in_flight_per_exchange': 1,
      }),
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await waitFor(
      () =>
        strategyIntentExecutionService.consumeIntents.mock.calls.length >= 2,
    );
    expect(maxActiveByExchange).toBe(1);
    await service.onModuleDestroy();
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
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
  executionCategory: 'clob_cex',
  metadata: null,
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
      getNextNewIntent: jest.fn(async (strategyKey: string) =>
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
      undefined as any,
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

  it('executes the oldest NEW intent even when an older FAILED intent exists', async () => {
    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn().mockResolvedValue(['s1']),
      getNextNewIntent: jest
        .fn()
        .mockResolvedValue(createHeadIntent('s1', 's1-next', 'binance')),
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
    };
    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn().mockReturnValue(false),
      consumeIntents: jest.fn(async () => {}),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService(),
      {
        findOne: jest.fn().mockResolvedValue({
          strategyKey: 's1',
          status: 'running',
        }),
      } as any,
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await wait(40);
    await service.onModuleDestroy();

    expect(strategyIntentExecutionService.consumeIntents).toHaveBeenCalledWith([
      expect.objectContaining({
        intentId: 's1-next',
        strategyKey: 's1',
      }),
    ]);
  });

  it('enforces per-exchange in-flight cap', async () => {
    const processed = new Set<string>();
    let activeByExchange = 0;
    let maxActiveByExchange = 0;

    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn().mockResolvedValue(['s1', 's2']),
      getNextNewIntent: jest
        .fn()
        .mockImplementation(async (strategyKey: string) =>
          createHeadIntent(strategyKey, `${strategyKey}-intent`, 'binance'),
        ),
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
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
      {
        findOne: jest.fn().mockResolvedValue({
          status: 'running',
        }),
      } as any,
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

  it('serializes head intents for the same strategy key while one is already in flight', async () => {
    const processed = new Set<string>();
    const intentsByStrategy = {
      shared: [
        createHeadIntent('shared', 'shared-intent-1'),
        createHeadIntent('shared', 'shared-intent-2'),
      ],
    };
    let activeForStrategy = 0;
    let maxActiveForStrategy = 0;
    const completedIntentIds: string[] = [];

    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn(async () => {
        return Object.entries(intentsByStrategy)
          .filter(([, intents]) =>
            intents.some((intent) => intent.status === 'NEW'),
          )
          .map(([strategyKey]) => strategyKey);
      }),
      getNextNewIntent: jest.fn(async (strategyKey: string) => {
        return (
          intentsByStrategy[
            strategyKey as keyof typeof intentsByStrategy
          ]?.find((intent) => intent.status === 'NEW') || null
        );
      }),
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
    };

    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn((intentId: string) =>
        processed.has(intentId),
      ),
      consumeIntents: jest.fn(async (intents) => {
        const intentId = intents[0].intentId;

        activeForStrategy += 1;
        maxActiveForStrategy = Math.max(
          maxActiveForStrategy,
          activeForStrategy,
        );
        await wait(25);

        const matchingIntent = intentsByStrategy.shared.find(
          (candidate) => candidate.intentId === intentId,
        );

        if (matchingIntent) {
          matchingIntent.status = 'DONE';
        }

        processed.add(intentId);
        completedIntentIds.push(intentId);
        activeForStrategy -= 1;
      }),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService({
        'strategy.intent_worker_max_in_flight': 2,
        'strategy.intent_worker_max_in_flight_per_exchange': 2,
      }),
      {
        findOne: jest.fn().mockResolvedValue({
          status: 'running',
        }),
      } as any,
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await waitFor(() => completedIntentIds.length === 2);
    await service.onModuleDestroy();

    expect(maxActiveForStrategy).toBe(1);
    expect(completedIntentIds).toEqual(['shared-intent-1', 'shared-intent-2']);
  });

  it('does not dispatch the same in-flight intent twice even if it appears under multiple strategy keys', async () => {
    const processed = new Set<string>();
    const duplicateIntentId = 'shared-intent';
    let active = 0;
    let maxActive = 0;

    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn().mockResolvedValue(['s1', 's2']),
      getNextNewIntent: jest.fn(async (strategyKey: string) => ({
        ...createHeadIntent(strategyKey, duplicateIntentId),
        strategyInstanceId: strategyKey,
        userId: `${strategyKey}-user`,
        clientId: `${strategyKey}-client`,
      })),
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
    };

    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn((intentId: string) =>
        processed.has(intentId),
      ),
      consumeIntents: jest.fn(async (intents) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await wait(25);
        processed.add(intents[0].intentId);
        active -= 1;
      }),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService({
        'strategy.intent_worker_max_in_flight': 2,
        'strategy.intent_worker_max_in_flight_per_exchange': 2,
      }),
      {
        findOne: jest.fn().mockResolvedValue({
          status: 'running',
        }),
      } as any,
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await waitFor(
      () =>
        strategyIntentExecutionService.consumeIntents.mock.calls.length === 1,
    );
    await wait(40);
    await service.onModuleDestroy();

    expect(maxActive).toBe(1);
    expect(strategyIntentExecutionService.consumeIntents).toHaveBeenCalledTimes(
      1,
    );
  });

  it('maps execution category and metadata from stored intent entity', async () => {
    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn().mockResolvedValue(['s1']),
      getNextNewIntent: jest.fn().mockResolvedValue({
        ...createHeadIntent('s1', 's1-amm', 'uniswapV3'),
        type: 'EXECUTE_AMM_SWAP',
        executionCategory: 'amm_dex',
        metadata: { dexId: 'uniswapV3', chainId: 1 },
      }),
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
    };
    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn().mockReturnValue(false),
      consumeIntents: jest.fn(async () => {}),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService(),
      {
        findOne: jest.fn().mockResolvedValue({
          status: 'running',
        }),
      } as any,
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await waitFor(
      () => strategyIntentExecutionService.consumeIntents.mock.calls.length > 0,
    );
    await service.onModuleDestroy();

    expect(strategyIntentExecutionService.consumeIntents).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'EXECUTE_AMM_SWAP',
        executionCategory: 'amm_dex',
        metadata: expect.objectContaining({ dexId: 'uniswapV3', chainId: 1 }),
      }),
    ]);
  });

  it('cancels pending intents for stopped strategies before dispatch', async () => {
    const strategyIntentStoreService = {
      listStrategyKeysWithNewIntents: jest.fn().mockResolvedValue(['s1']),
      getNextNewIntent: jest.fn(),
      cancelPendingIntents: jest.fn().mockResolvedValue(2),
    };
    const strategyIntentExecutionService = {
      hasProcessedIntent: jest.fn().mockReturnValue(false),
      consumeIntents: jest.fn(),
    };

    const service = new StrategyIntentWorkerService(
      createConfigService(),
      {
        findOne: jest.fn().mockResolvedValue({
          strategyKey: 's1',
          status: 'stopped',
        }),
      } as any,
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.onModuleInit();
    await wait(40);
    await service.onModuleDestroy();

    expect(
      strategyIntentStoreService.cancelPendingIntents,
    ).toHaveBeenCalledWith('s1', 'strategy stopped before intent execution');
    expect(
      strategyIntentExecutionService.consumeIntents,
    ).not.toHaveBeenCalled();
  });
});

import { ConfigService } from '@nestjs/config';

import { ExecutorAction } from './executor-action.types';
import { ExecutorOrchestratorService } from './executor-orchestrator.service';

describe('ExecutorOrchestratorService', () => {
  const strategyIntentStoreService = {
    upsertIntent: jest.fn().mockResolvedValue(undefined),
  };
  const strategyIntentExecutionService = {
    consumeIntents: jest.fn().mockResolvedValue(undefined),
  };

  const createConfigService = (driver = 'worker') =>
    ({
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'strategy.intent_execution_driver') {
          return driver;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService);

  const baseAction: ExecutorAction = {
    type: 'CREATE_LIMIT_ORDER',
    intentId: 'intent-1',
    strategyInstanceId: 'strategy-1',
    strategyKey: 'u1-c1-pureMarketMaking',
    userId: 'u1',
    clientId: 'c1',
    exchange: 'binance',
    pair: 'BTC/USDT',
    side: 'buy',
    price: '100',
    qty: '1',
    executionCategory: 'clob_cex',
    metadata: { source: 'test' },
    createdAt: '2026-03-04T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists actions as NEW intents and skips sync consume in worker mode', async () => {
    const service = new ExecutorOrchestratorService(
      createConfigService('worker'),
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    const intents = await service.dispatchActions('u1-c1-pureMarketMaking', [
      baseAction,
    ]);

    expect(strategyIntentStoreService.upsertIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-1',
        status: 'NEW',
        executionCategory: 'clob_cex',
        metadata: expect.objectContaining({ source: 'test' }),
      }),
    );
    expect(
      strategyIntentExecutionService.consumeIntents,
    ).not.toHaveBeenCalled();
    expect(intents).toHaveLength(1);
    expect(intents[0].status).toBe('NEW');
  });

  it('consumes intents synchronously in sync mode', async () => {
    const service = new ExecutorOrchestratorService(
      createConfigService('sync'),
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.dispatchActions('u1-c1-pureMarketMaking', [baseAction]);

    expect(strategyIntentExecutionService.consumeIntents).toHaveBeenCalledWith([
      expect.objectContaining({
        intentId: 'intent-1',
        status: 'NEW',
      }),
    ]);
  });

  it('keeps explicit status when provided', async () => {
    const service = new ExecutorOrchestratorService(
      createConfigService('worker'),
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    await service.dispatchActions('u1-c1-pureMarketMaking', [
      { ...baseAction, intentId: 'intent-acked', status: 'ACKED' },
    ]);

    expect(strategyIntentStoreService.upsertIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-acked',
        status: 'ACKED',
      }),
    );
  });

  it('returns empty list for empty action set', async () => {
    const service = new ExecutorOrchestratorService(
      createConfigService('worker'),
      strategyIntentStoreService as any,
      strategyIntentExecutionService as any,
    );

    const intents = await service.dispatchActions('u1-c1-pureMarketMaking', []);

    expect(intents).toEqual([]);
    expect(strategyIntentStoreService.upsertIntent).not.toHaveBeenCalled();
  });
});

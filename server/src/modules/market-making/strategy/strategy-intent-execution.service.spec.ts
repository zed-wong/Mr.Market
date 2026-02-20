import { ConfigService } from '@nestjs/config';

import { StrategyOrderIntent } from './strategy-intent.types';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';

describe('StrategyIntentExecutionService', () => {
  const tradeService = {
    executeLimitTrade: jest.fn().mockResolvedValue({ id: 'order-1' }),
  };

  const exchange = {
    cancelOrder: jest.fn().mockResolvedValue(undefined),
  };

  const exchangeInitService = {
    getExchange: jest.fn().mockReturnValue(exchange),
  };

  const exchangeConnectorAdapterService = {
    placeLimitOrder: jest
      .fn()
      .mockResolvedValue({ id: 'order-1', status: 'open' }),
    cancelOrder: jest
      .fn()
      .mockResolvedValue({ id: 'exchange-order-1', status: 'canceled' }),
  };

  const exchangeOrderTrackerService = {
    upsertOrder: jest.fn(),
  };

  const intentStoreService = {
    updateIntentStatus: jest.fn().mockResolvedValue(undefined),
    attachMixinOrderId: jest.fn().mockResolvedValue(undefined),
  };

  const durabilityService = {
    isProcessed: jest.fn().mockResolvedValue(false),
    markProcessed: jest.fn().mockResolvedValue(true),
    appendOutboxEvent: jest.fn().mockResolvedValue(undefined),
  };

  const createConfigService = (executeIntents: boolean) =>
    ({
      get: jest.fn((key: string, defaultValue?: boolean) => {
        if (key === 'strategy.execute_intents') {
          return executeIntents;
        }
        if (key === 'strategy.intent_max_retries') {
          return 2;
        }
        if (key === 'strategy.intent_retry_base_delay_ms') {
          return 1;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService);

  const baseIntent: StrategyOrderIntent = {
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
    createdAt: '2026-02-11T00:00:00.000Z',
    status: 'NEW',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes CREATE_LIMIT_ORDER intents once (idempotent)', async () => {
    const service = new StrategyIntentExecutionService(
      tradeService as any,
      exchangeInitService as any,
      createConfigService(true),
      durabilityService as any,
      intentStoreService as any,
      exchangeConnectorAdapterService as any,
      exchangeOrderTrackerService as any,
    );

    await service.consumeIntents([baseIntent, baseIntent]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(1);
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'SENT',
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'ACKED',
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'DONE',
    );
    expect(intentStoreService.attachMixinOrderId).toHaveBeenCalledWith(
      baseIntent.intentId,
      'order-1',
    );
    expect(exchangeConnectorAdapterService.placeLimitOrder).toHaveBeenCalled();
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalled();
  });

  it('does not execute intents when execution is disabled', async () => {
    const service = new StrategyIntentExecutionService(
      tradeService as any,
      exchangeInitService as any,
      createConfigService(false),
      durabilityService as any,
      intentStoreService as any,
      exchangeConnectorAdapterService as any,
      exchangeOrderTrackerService as any,
    );

    await service.consumeIntents([baseIntent]);

    expect(tradeService.executeLimitTrade).not.toHaveBeenCalled();
    expect(service.hasProcessedIntent(baseIntent.intentId)).toBe(true);
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'DONE',
    );
  });

  it('executes CANCEL_ORDER through exchange adapter', async () => {
    const service = new StrategyIntentExecutionService(
      tradeService as any,
      exchangeInitService as any,
      createConfigService(true),
      durabilityService as any,
      intentStoreService as any,
      exchangeConnectorAdapterService as any,
      exchangeOrderTrackerService as any,
    );
    const cancelIntent: StrategyOrderIntent = {
      ...baseIntent,
      intentId: 'intent-cancel',
      type: 'CANCEL_ORDER',
      mixinOrderId: 'exchange-order-1',
    };

    await service.consumeIntents([cancelIntent]);

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'exchange-order-1',
    );
  });

  it('marks intent FAILED when execution throws', async () => {
    exchangeConnectorAdapterService.placeLimitOrder.mockRejectedValue(
      new Error('exchange down'),
    );
    const service = new StrategyIntentExecutionService(
      tradeService as any,
      exchangeInitService as any,
      createConfigService(true),
      durabilityService as any,
      intentStoreService as any,
      exchangeConnectorAdapterService as any,
      exchangeOrderTrackerService as any,
    );

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'exchange down',
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      'exchange down',
    );
  });

  it('retries and succeeds on second attempt', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ id: 'order-retry', status: 'open' });
    const service = new StrategyIntentExecutionService(
      tradeService as any,
      exchangeInitService as any,
      createConfigService(true),
      durabilityService as any,
      intentStoreService as any,
      exchangeConnectorAdapterService as any,
      exchangeOrderTrackerService as any,
    );

    await service.consumeIntents([{ ...baseIntent, intentId: 'retry-intent' }]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(2);
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'retry-intent',
      'DONE',
    );
  });
});

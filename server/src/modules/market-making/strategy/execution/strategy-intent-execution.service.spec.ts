/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { buildSubmittedClientOrderId } from 'src/common/helpers/client-order-id';

import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { DexVolumeStrategyService } from '../dex/dex-volume.strategy.service';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';

const createExecutionHistoryRepository = () => ({
  create: jest.fn((payload) => payload),
  save: jest.fn().mockResolvedValue(undefined),
});

describe('StrategyIntentExecutionService', () => {
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
    getTrackedOrders: jest.fn().mockReturnValue([]),
    getActiveSlotOrders: jest.fn().mockReturnValue([]),
    getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
  };

  const exchangeOrderMappingService = {
    countMappingsForOrder: jest.fn().mockResolvedValue(0),
    createMapping: jest.fn().mockResolvedValue(undefined),
  };

  const dexVolumeStrategyService = {
    executeCycle: jest.fn().mockResolvedValue({
      txHash: '0xamm',
      side: 'buy',
      tokenIn: '0x1',
      tokenOut: '0x2',
      amountIn: '100',
      quotedAmountOut: '99',
      minAmountOut: '95',
      slippageBps: 100,
    }),
  } as unknown as DexVolumeStrategyService;

  const intentStoreService = {
    updateIntentStatus: jest.fn().mockResolvedValue(undefined),
    attachMixinOrderId: jest.fn().mockResolvedValue(undefined),
  };

  const durabilityService = {
    isProcessed: jest.fn().mockResolvedValue(false),
    markProcessed: jest.fn().mockResolvedValue(true),
    appendOutboxEvent: jest.fn().mockResolvedValue(undefined),
  };

  const strategyInstanceRepository = {
    findOne: jest.fn().mockResolvedValue({
      strategyKey: 'u1-c1-pureMarketMaking',
      status: 'running',
      parameters: {},
    }),
    update: jest.fn().mockResolvedValue(undefined),
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

  const createService = (
    executeIntents: boolean,
    configService = createConfigService(executeIntents),
    executionHistoryRepository = createExecutionHistoryRepository(),
  ) =>
    new StrategyIntentExecutionService(
      configService,
      exchangeConnectorAdapterService as any,
      executionHistoryRepository as any,
      strategyInstanceRepository as any,
      durabilityService as any,
      intentStoreService as any,
      exchangeOrderTrackerService as any,
      exchangeOrderMappingService as any,
      dexVolumeStrategyService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    exchangeConnectorAdapterService.placeLimitOrder.mockResolvedValue({
      id: 'order-1',
      status: 'open',
    });
    exchangeConnectorAdapterService.cancelOrder.mockResolvedValue({
      id: 'exchange-order-1',
      status: 'canceled',
    });
    exchangeOrderMappingService.countMappingsForOrder.mockResolvedValue(0);
    strategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'u1-c1-pureMarketMaking',
      status: 'running',
      parameters: {},
    });
    strategyInstanceRepository.update.mockResolvedValue(undefined);
  });

  it('executes CREATE_LIMIT_ORDER intents once (idempotent)', async () => {
    const service = createService(true);

    await service.consumeIntents([baseIntent, baseIntent]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(1);
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      buildSubmittedClientOrderId('c1', 0),
      { postOnly: false, timeInForce: undefined },
      undefined,
    );
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
    expect(exchangeOrderMappingService.createMapping).toHaveBeenCalledWith({
      orderId: 'c1',
      exchangeOrderId: 'order-1',
      clientOrderId: buildSubmittedClientOrderId('c1', 0),
    });
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'order-1',
        clientOrderId: buildSubmittedClientOrderId('c1', 0),
        status: 'pending_create',
      }),
    );
  });

  it('passes postOnly to limit-order execution', async () => {
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'intent-post-only',
        postOnly: true,
      },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      buildSubmittedClientOrderId('c1', 0),
      { postOnly: true, timeInForce: undefined },
      undefined,
    );
  });

  it('executes dual-account maker then taker and persists completed cycles', async () => {
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'dual-maker',
        accountLabel: 'maker',
        metadata: {
          role: 'maker',
          takerAccountLabel: 'taker',
          makerDelayMs: 0,
          cycleId: 'cycle-1',
          orderId: 'dual-cycle-1',
        },
      },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenNthCalledWith(
      1,
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      buildSubmittedClientOrderId('dual-cycle-1', 0),
      { postOnly: false, timeInForce: undefined },
      'maker',
    );
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenNthCalledWith(
      2,
      'binance',
      'BTC/USDT',
      'sell',
      '1',
      '100',
      buildSubmittedClientOrderId('dual-cycle-1', 1),
      { postOnly: false, timeInForce: 'IOC' },
      'taker',
    );
    expect(strategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: 'u1-c1-pureMarketMaking' },
      expect.objectContaining({
        parameters: expect.objectContaining({ completedCycles: 1 }),
      }),
    );
  });

  it('cancels maker on dual-account taker failure', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockResolvedValueOnce({ id: 'maker-order', status: 'open' })
      .mockRejectedValue(new Error('taker failed'));
    const service = createService(true);

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'dual-maker-fail',
          accountLabel: 'maker',
          metadata: {
            role: 'maker',
            takerAccountLabel: 'taker',
            makerDelayMs: 0,
            cycleId: 'cycle-2',
            orderId: 'dual-cycle-2',
          },
        },
      ]),
    ).rejects.toThrow('taker failed');

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'maker-order',
      'maker',
    );
    expect(strategyInstanceRepository.update).not.toHaveBeenCalled();
  });

  it('deduplicates create intents when the slot already has an active tracked order', async () => {
    exchangeOrderTrackerService.getActiveSlotOrders.mockReturnValueOnce([
      {
        slotKey: 'layer-1-buy',
        status: 'open',
      },
    ]);
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'intent-slot-dedup',
        slotKey: 'layer-1-buy',
      },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-slot-dedup',
      'DONE',
    );
  });

  it('deduplicates create intents when an equivalent order is already pending_create', async () => {
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValueOnce([
      {
        side: 'buy',
        status: 'pending_create',
        price: '100',
        qty: '1',
      },
    ]);
    const service = createService(true);

    await service.consumeIntents([baseIntent]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'DONE',
    );
  });

  it('deduplicates cancel intents when the tracked order is already pending cancel', async () => {
    exchangeOrderTrackerService.getByExchangeOrderId.mockReturnValueOnce({
      status: 'pending_cancel',
    });
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'intent-cancel-dedup',
        type: 'CANCEL_ORDER',
        mixinOrderId: 'exchange-order-1',
      },
    ]);

    expect(exchangeConnectorAdapterService.cancelOrder).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-cancel-dedup',
      'DONE',
    );
  });

  it('does not execute intents when execution is disabled', async () => {
    const service = createService(false);

    await service.consumeIntents([baseIntent]);

    expect(service.hasProcessedIntent(baseIntent.intentId)).toBe(true);
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'DONE',
    );
  });

  it('parses string false for strategy.execute_intents safely', async () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'strategy.execute_intents') {
          return 'false';
        }
        if (key === 'strategy.intent_max_retries') {
          return 2;
        }
        if (key === 'strategy.intent_retry_base_delay_ms') {
          return 1;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;
    const service = createService(false, configService);

    await service.consumeIntents([
      { ...baseIntent, intentId: 'intent-string' },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
  });

  it('skips execution when strategy.execute_intents config is missing', async () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'strategy.execute_intents') {
          return defaultValue;
        }
        if (key === 'strategy.intent_max_retries') {
          return 2;
        }
        if (key === 'strategy.intent_retry_base_delay_ms') {
          return 1;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;
    const service = createService(false, configService);

    await service.consumeIntents([
      { ...baseIntent, intentId: 'intent-default-false' },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
  });

  it('executes CANCEL_ORDER through exchange adapter', async () => {
    const service = createService(true);
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
      undefined,
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'exchange-order-1',
        status: 'cancelled',
      }),
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-cancel',
      'DONE',
    );
    expect(durabilityService.appendOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'strategy.intent.executed',
        aggregateId: 'intent-cancel',
      }),
    );
    expect(durabilityService.markProcessed).toHaveBeenCalledWith(
      'strategy-intent-execution',
      'intent-cancel',
    );
  });

  it('rejects CANCEL_ORDER intents without mixinOrderId', async () => {
    const service = createService(true);

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'intent-cancel-missing-order',
          type: 'CANCEL_ORDER',
          mixinOrderId: undefined,
        },
      ]),
    ).rejects.toThrow('CANCEL_ORDER intent missing mixinOrderId');

    expect(exchangeConnectorAdapterService.cancelOrder).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-cancel-missing-order',
      'FAILED',
      'CANCEL_ORDER intent missing mixinOrderId',
    );
  });

  it('marks intent FAILED when execution throws', async () => {
    exchangeConnectorAdapterService.placeLimitOrder.mockRejectedValue(
      new Error('exchange down'),
    );
    const service = createService(true);

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'exchange down',
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      'exchange down',
    );
  });

  it('cancels an in-flight intent when the strategy is stopped before execution', async () => {
    strategyInstanceRepository.findOne.mockResolvedValueOnce({
      strategyKey: baseIntent.strategyKey,
      status: 'stopped',
    });
    const service = createService(true);

    await expect(service.consumeIntents([baseIntent])).resolves.toBeUndefined();

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'CANCELLED',
      'strategy stopped before intent execution',
    );
    expect(intentStoreService.updateIntentStatus).not.toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      expect.anything(),
    );
  });

  it('cancels retries when the strategy stops between attempts', async () => {
    exchangeConnectorAdapterService.placeLimitOrder.mockRejectedValueOnce(
      new Error('temporary'),
    );
    strategyInstanceRepository.findOne
      .mockResolvedValueOnce({
        strategyKey: baseIntent.strategyKey,
        status: 'running',
      })
      .mockResolvedValueOnce({
        strategyKey: baseIntent.strategyKey,
        status: 'running',
      })
      .mockResolvedValueOnce({
        strategyKey: baseIntent.strategyKey,
        status: 'stopped',
      });
    const service = createService(true);

    await expect(
      service.consumeIntents([{ ...baseIntent, intentId: 'retry-stop' }]),
    ).resolves.toBeUndefined();

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(1);
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'retry-stop',
      'CANCELLED',
      'strategy stopped before intent execution',
    );
  });

  it('retries and succeeds on second attempt', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ id: 'order-retry', status: 'open' });
    const service = createService(true);

    await service.consumeIntents([{ ...baseIntent, intentId: 'retry-intent' }]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(2);
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'retry-intent',
      'DONE',
    );
  });

  it('falls back to safe retry defaults for invalid config values', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        id: 'order-after-default-retries',
        status: 'open',
      });

    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'strategy.execute_intents') {
          return true;
        }
        if (key === 'strategy.intent_max_retries') {
          return 'NaN';
        }
        if (key === 'strategy.intent_retry_base_delay_ms') {
          return -10;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;

    const service = createService(true, configService);

    await service.consumeIntents([
      { ...baseIntent, intentId: 'invalid-config' },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(3);
  });

  it('executes EXECUTE_AMM_SWAP through dex volume strategy service', async () => {
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'amm-intent-1',
        type: 'EXECUTE_AMM_SWAP',
        executionCategory: 'amm_dex',
        metadata: {
          dexId: 'uniswapV3',
          chainId: 1,
          tokenIn: '0x0000000000000000000000000000000000000001',
          tokenOut: '0x0000000000000000000000000000000000000002',
          feeTier: 3000,
          baseTradeAmount: 1,
          baseIncrementPercentage: 0.1,
          pricePushRate: 0,
          executedTrades: 0,
          slippageBps: 100,
        },
      },
    ]);

    expect(dexVolumeStrategyService.executeCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        dexId: 'uniswapV3',
        chainId: 1,
        side: 'buy',
      }),
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'amm-intent-1',
      'DONE',
    );
  });

  it('rejects EXECUTE_AMM_SWAP with incomplete metadata', async () => {
    const service = createService(true);

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'amm-intent-bad',
          type: 'EXECUTE_AMM_SWAP',
          executionCategory: 'amm_dex',
          metadata: {
            dexId: 'uniswapV3',
            chainId: 1,
          },
        },
      ]),
    ).rejects.toThrow('EXECUTE_AMM_SWAP intent metadata is incomplete');
  });

  it('increments clientOrderId sequence per order and honors metadata.orderId', async () => {
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'intent-a',
        metadata: { orderId: 'mm-order-1' },
      },
      {
        ...baseIntent,
        intentId: 'intent-b',
        metadata: { orderId: 'mm-order-1' },
      },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenNthCalledWith(
      1,
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      buildSubmittedClientOrderId('mm-order-1', 0),
      { postOnly: false, timeInForce: undefined },
      undefined,
    );
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenNthCalledWith(
      2,
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      buildSubmittedClientOrderId('mm-order-1', 1),
      { postOnly: false, timeInForce: undefined },
      undefined,
    );
  });

  it('skips exchange side effects when durability marks an intent as already processed', async () => {
    durabilityService.isProcessed.mockResolvedValueOnce(true);
    const service = createService(true);

    await service.consumeIntents([
      { ...baseIntent, intentId: 'already-processed-intent' },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'already-processed-intent',
      'DONE',
    );
    expect(durabilityService.markProcessed).not.toHaveBeenCalled();
  });

  it('resumes clientOrderId sequencing from persisted mapping count after service restart', async () => {
    const metadata = { orderId: 'mm-order-restart' };
    const firstService = createService(true);

    exchangeOrderMappingService.countMappingsForOrder.mockResolvedValueOnce(2);
    await firstService.consumeIntents([
      {
        ...baseIntent,
        intentId: 'intent-before-restart',
        metadata,
      },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenLastCalledWith(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      buildSubmittedClientOrderId('mm-order-restart', 2),
      { postOnly: false, timeInForce: undefined },
      undefined,
    );

    jest.clearAllMocks();
    exchangeConnectorAdapterService.placeLimitOrder.mockResolvedValue({
      id: 'order-after-restart',
      status: 'open',
    });
    exchangeConnectorAdapterService.cancelOrder.mockResolvedValue({
      id: 'exchange-order-1',
      status: 'canceled',
    });
    exchangeOrderMappingService.countMappingsForOrder.mockResolvedValueOnce(3);

    const restartedService = createService(true);

    await restartedService.consumeIntents([
      {
        ...baseIntent,
        intentId: 'intent-after-restart',
        metadata,
      },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      buildSubmittedClientOrderId('mm-order-restart', 3),
      { postOnly: false, timeInForce: undefined },
      undefined,
    );
  });
});

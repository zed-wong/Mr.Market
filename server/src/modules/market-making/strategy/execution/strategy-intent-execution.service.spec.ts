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
  const trackedOrders = new Map<string, Record<string, unknown>>();
  const toTrackedOrderKey = (
    exchange: string,
    accountLabel: string | undefined,
    exchangeOrderId: string,
  ) => `${exchange}:${accountLabel || 'default'}:${exchangeOrderId}`;
  const exchangeConnectorAdapterService = {
    placeLimitOrder: jest
      .fn()
      .mockResolvedValue({ id: 'order-1', status: 'open' }),
    fetchOrder: jest
      .fn()
      .mockResolvedValue({ id: 'order-1', status: 'open', filled: '0' }),
    quantizeOrder: jest.fn(
      (_exchange: string, _pair: string, qty: string, price: string) => ({
        qty,
        price,
      }),
    ),
    cancelOrder: jest
      .fn()
      .mockResolvedValue({ id: 'exchange-order-1', status: 'canceled' }),
    fetchOrderBook: jest
      .fn()
      .mockResolvedValue({ bids: [[100, 1]], asks: [[101, 1]] }),
  };

  const exchangeOrderTrackerService = {
    upsertOrder: jest.fn((order: Record<string, unknown>) => {
      trackedOrders.set(
        toTrackedOrderKey(
          String(order.exchange),
          typeof order.accountLabel === 'string'
            ? order.accountLabel
            : undefined,
          String(order.exchangeOrderId),
        ),
        order,
      );
    }),
    getTrackedOrders: jest.fn((strategyKey: string) =>
      [...trackedOrders.values()].filter(
        (order) => order.strategyKey === strategyKey,
      ),
    ),
    getActiveSlotOrders: jest.fn((strategyKey: string) =>
      [...trackedOrders.values()].filter(
        (order) =>
          order.strategyKey === strategyKey &&
          [
            'pending_create',
            'open',
            'partially_filled',
            'pending_cancel',
          ].includes(String(order.status)),
      ),
    ),
    getByExchangeOrderId: jest.fn(
      (exchange: string, exchangeOrderId: string, accountLabel?: string) =>
        trackedOrders.get(
          toTrackedOrderKey(exchange, accountLabel, exchangeOrderId),
        ),
    ),
  };

  const exchangeOrderMappingService = {
    countMappingsForOrder: jest.fn().mockResolvedValue(0),
    reserveMapping: jest.fn().mockResolvedValue(undefined),
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
    getMixinOrderId: jest.fn().mockResolvedValue(undefined),
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

  const createConfigService = (
    executeIntents: boolean,
    overrides?: Record<string, unknown>,
  ) =>
    ({
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          'strategy.execute_intents': executeIntents,
          'strategy.intent_max_retries': 2,
          'strategy.intent_retry_base_delay_ms': 1,
          ...(overrides || {}),
        };

        return values[key] ?? defaultValue;
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
    trackedOrders.clear();
    exchangeConnectorAdapterService.placeLimitOrder
      .mockReset()
      .mockResolvedValue({
        id: 'order-1',
        status: 'open',
      });
    exchangeConnectorAdapterService.cancelOrder.mockReset().mockResolvedValue({
      id: 'exchange-order-1',
      status: 'canceled',
    });
    exchangeConnectorAdapterService.fetchOrder.mockReset().mockResolvedValue({
      id: 'order-1',
      status: 'open',
      filled: '0',
    });
    exchangeConnectorAdapterService.fetchOrderBook
      .mockReset()
      .mockResolvedValue({ bids: [[100, 1]], asks: [[101, 1]] });
    exchangeConnectorAdapterService.quantizeOrder
      .mockReset()
      .mockImplementation(
        (_exchange: string, _pair: string, qty: string, price: string) => ({
          qty,
          price,
        }),
      );
    exchangeOrderTrackerService.upsertOrder.mockClear();
    exchangeOrderTrackerService.upsertOrder.mockImplementation(
      (order: Record<string, unknown>) => {
        trackedOrders.set(
          toTrackedOrderKey(
            String(order.exchange),
            typeof order.accountLabel === 'string'
              ? order.accountLabel
              : undefined,
            String(order.exchangeOrderId),
          ),
          order,
        );
      },
    );
    exchangeOrderTrackerService.getTrackedOrders
      .mockReset()
      .mockImplementation((strategyKey: string) =>
        [...trackedOrders.values()].filter(
          (order) => order.strategyKey === strategyKey,
        ),
      );
    exchangeOrderTrackerService.getActiveSlotOrders
      .mockReset()
      .mockImplementation((strategyKey: string) =>
        [...trackedOrders.values()].filter(
          (order) =>
            order.strategyKey === strategyKey &&
            [
              'pending_create',
              'open',
              'partially_filled',
              'pending_cancel',
            ].includes(String(order.status)),
        ),
      );
    exchangeOrderTrackerService.getByExchangeOrderId
      .mockReset()
      .mockImplementation(
        (exchange: string, exchangeOrderId: string, accountLabel?: string) =>
          trackedOrders.get(
            toTrackedOrderKey(exchange, accountLabel, exchangeOrderId),
          ),
      );
    exchangeOrderMappingService.countMappingsForOrder
      .mockReset()
      .mockResolvedValue(0);
    exchangeOrderMappingService.reserveMapping
      .mockReset()
      .mockResolvedValue(undefined);
    exchangeOrderMappingService.createMapping
      .mockReset()
      .mockResolvedValue(undefined);
    strategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'u1-c1-pureMarketMaking',
      status: 'running',
      parameters: {},
    });
    strategyInstanceRepository.update.mockResolvedValue(undefined);
    intentStoreService.getMixinOrderId.mockResolvedValue(undefined);
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
    expect(exchangeOrderMappingService.reserveMapping).toHaveBeenCalledWith({
      orderId: 'c1',
      clientOrderId: buildSubmittedClientOrderId('c1', 0),
    });
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

  it('executes an immediate inline taker IOC after a dual-account maker ack', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockResolvedValueOnce({ id: 'maker-order-1', status: 'open' })
      .mockResolvedValueOnce({
        id: 'taker-order-1',
        status: 'closed',
        filled: '1',
      });
    exchangeConnectorAdapterService.fetchOrder
      .mockResolvedValueOnce({
        id: 'maker-order-1',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-1',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-1',
        status: 'closed',
        filled: '1',
      });
    const service = createService(
      true,
      createConfigService(true, {
        'strategy.dual_account_inline_taker_max_delay_ms': 0,
      }),
    );

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'dual-maker',
        accountLabel: 'maker',
        metadata: {
          role: 'maker',
          takerAccountLabel: 'taker',
          cycleId: 'cycle-1',
          orderId: 'dual-cycle-1',
        },
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
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(2);
    expect(exchangeConnectorAdapterService.fetchOrder).toHaveBeenCalledTimes(3);
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).toHaveBeenCalledTimes(2);
    expect(exchangeConnectorAdapterService.cancelOrder).not.toHaveBeenCalled();
    expect(strategyInstanceRepository.update).not.toHaveBeenCalled();
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'dual-cycle-1',
        accountLabel: 'maker',
        role: 'maker',
        exchangeOrderId: 'maker-order-1',
      }),
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'dual-cycle-1',
        accountLabel: 'taker',
        role: 'taker',
        exchangeOrderId: 'taker-order-1',
      }),
    );
  });

  it('fails IOC intents that return neither an exchange order id nor any fill', async () => {
    exchangeConnectorAdapterService.placeLimitOrder.mockResolvedValueOnce({
      status: 'expired',
      filled: '0',
    });
    const service = createService(true);

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'ioc-no-ack',
          timeInForce: 'IOC',
        },
      ]),
    ).rejects.toThrow('IOC order not acknowledged: status=expired');

    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'ioc-no-ack',
      'FAILED',
      'IOC order not acknowledged: status=expired',
    );
  });

  it('keeps dynamic maker/taker metadata when the inline taker uses swapped accounts', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockResolvedValueOnce({ id: 'maker-order-3', status: 'open' })
      .mockResolvedValueOnce({
        id: 'taker-order-3',
        status: 'closed',
        filled: '1',
      });
    exchangeConnectorAdapterService.fetchOrder
      .mockResolvedValueOnce({
        id: 'maker-order-3',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-3',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-3',
        status: 'closed',
        filled: '1',
      });
    const service = createService(
      true,
      createConfigService(true, {
        'strategy.dual_account_inline_taker_max_delay_ms': 0,
      }),
    );

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'dual-maker-dynamic',
        accountLabel: 'taker',
        metadata: {
          role: 'maker',
          makerAccountLabel: 'taker',
          takerAccountLabel: 'maker',
          configuredMakerAccountLabel: 'maker',
          configuredTakerAccountLabel: 'taker',
          dynamicRoleSwitching: true,
          cycleId: 'cycle-3',
          orderId: 'dual-cycle-3',
        },
      },
    ]);

    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'dual-cycle-3',
        accountLabel: 'taker',
        role: 'maker',
      }),
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'dual-cycle-3',
        accountLabel: 'maker',
        role: 'taker',
      }),
    );
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(2);
  });

  it('tracks rebalance intents without running the inline dual-account taker flow', async () => {
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'dual-rebalance',
        accountLabel: 'maker',
        timeInForce: 'IOC',
        metadata: {
          role: 'rebalance',
          orderId: 'dual-rebalance-1',
          cycleId: 'rebalance-1',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
        },
      },
    ]);

    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'dual-rebalance-1',
        role: 'rebalance',
        accountLabel: 'maker',
      }),
    );
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(1);
    expect(strategyInstanceRepository.update).not.toHaveBeenCalled();
  });

  it('cancels the maker leg when the inline taker fails', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockResolvedValueOnce({ id: 'maker-order-cancel', status: 'open' })
      .mockRejectedValue(new Error('taker IOC rejected'));
    exchangeConnectorAdapterService.fetchOrder
      .mockResolvedValueOnce({
        id: 'maker-order-cancel',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-cancel',
        status: 'open',
        filled: '0',
      });
    const service = createService(
      true,
      createConfigService(true, {
        'strategy.dual_account_inline_taker_max_delay_ms': 0,
      }),
    );

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'dual-maker-cancel',
          accountLabel: 'maker',
          metadata: {
            role: 'maker',
            takerAccountLabel: 'taker',
            cycleId: 'cycle-cancel',
            orderId: 'dual-cycle-cancel',
          },
        },
      ]),
    ).rejects.toThrow('taker IOC rejected');

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'maker-order-cancel',
      'maker',
    );
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderId: 'dual-cycle-cancel',
        exchangeOrderId: 'maker-order-cancel',
        accountLabel: 'maker',
        role: 'maker',
        status: 'cancelled',
      }),
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'dual-maker-cancel:inline-taker',
      'FAILED',
      'taker IOC rejected',
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'dual-maker-cancel',
      'FAILED',
      'taker IOC rejected',
    );
  });

  it('treats matched partial maker and taker fills as success without top-of-book checks', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockResolvedValueOnce({
        id: 'maker-order-partial',
        status: 'open',
      })
      .mockResolvedValueOnce({
        id: 'taker-order-partial',
        status: 'closed',
        filled: '0.4',
      });
    exchangeConnectorAdapterService.fetchOrder
      .mockResolvedValueOnce({
        id: 'maker-order-partial',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-partial',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-partial',
        status: 'closed',
        filled: '0.4',
      });
    exchangeConnectorAdapterService.fetchOrderBook
      .mockResolvedValueOnce({ bids: [[100, 1]], asks: [[100, 1]] })
      .mockResolvedValueOnce({ bids: [[100, 1]], asks: [[100, 1]] });
    const service = createService(
      true,
      createConfigService(true, {
        'strategy.dual_account_inline_taker_max_delay_ms': 0,
      }),
    );

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'dual-maker-partial',
          accountLabel: 'maker',
          metadata: {
            role: 'maker',
            takerAccountLabel: 'taker',
            cycleId: 'cycle-partial',
            orderId: 'dual-cycle-partial',
          },
        },
      ]),
    ).resolves.toBeUndefined();

    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).toHaveBeenCalledTimes(2);
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'dual-maker-partial:inline-taker',
      'DONE',
    );
    expect(exchangeConnectorAdapterService.cancelOrder).not.toHaveBeenCalled();
  });

  it('fails the cycle and cancels the maker when taker fill is not paired by maker fill', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockResolvedValueOnce({ id: 'maker-order-mismatch', status: 'open' })
      .mockResolvedValueOnce({
        id: 'taker-order-mismatch',
        status: 'closed',
        filled: '1',
      });
    exchangeConnectorAdapterService.fetchOrder.mockResolvedValue({
      id: 'maker-order-mismatch',
      status: 'open',
      filled: '0',
    });
    const service = createService(
      true,
      createConfigService(true, {
        'strategy.dual_account_inline_taker_max_delay_ms': 0,
      }),
    );

    jest
      .spyOn(service as any, 'sleep')
      .mockImplementation(async () => undefined);
    const nowSpy = jest.spyOn(Date, 'now');
    let nowMs = 0;

    nowSpy.mockImplementation(() => {
      nowMs += 250;

      return nowMs;
    });

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'dual-maker-mismatch',
          accountLabel: 'maker',
          metadata: {
            role: 'maker',
            takerAccountLabel: 'taker',
            cycleId: 'cycle-mismatch',
            orderId: 'dual-cycle-mismatch',
          },
        },
      ]),
    ).rejects.toThrow(
      'Immediate dual-account paired fill mismatch between maker and taker',
    );

    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'dual-maker-mismatch:inline-taker',
      'FAILED',
      expect.stringContaining(
        'Immediate dual-account paired fill mismatch between maker and taker',
      ),
    );
    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'maker-order-mismatch',
      'maker',
    );

    nowSpy.mockRestore();
  });

  it('honors the configured random delay before immediate dual-account taker dispatch', async () => {
    exchangeConnectorAdapterService.placeLimitOrder
      .mockResolvedValueOnce({ id: 'maker-order-delay', status: 'open' })
      .mockResolvedValueOnce({
        id: 'taker-order-delay',
        status: 'closed',
        filled: '1',
      });
    exchangeConnectorAdapterService.fetchOrder
      .mockResolvedValueOnce({
        id: 'maker-order-delay',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-delay',
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-delay',
        status: 'closed',
        filled: '1',
      });
    const service = createService(
      true,
      createConfigService(true, {
        'strategy.dual_account_inline_taker_max_delay_ms': 1_000,
      }),
    );
    const sleepSpy = jest
      .spyOn(service as any, 'sleep')
      .mockImplementation(async () => undefined);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'dual-maker-delay',
        accountLabel: 'maker',
        metadata: {
          role: 'maker',
          takerAccountLabel: 'taker',
          cycleId: 'cycle-delay',
          orderId: 'dual-cycle-delay',
        },
      },
    ]);

    expect(sleepSpy).toHaveBeenCalledWith(500);

    randomSpy.mockRestore();
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
    exchangeConnectorAdapterService.placeLimitOrder.mockRejectedValue(
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
    ]);
    trackedOrders.clear();
    await service.consumeIntents([
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
    trackedOrders.clear();
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
  it('reserves clientOrderId before placement so repeated order ids advance after restart', async () => {
    const metadata = { orderId: 'mm-order-repeat' };

    exchangeConnectorAdapterService.placeLimitOrder
      .mockRejectedValueOnce(
        new Error('mexc {"msg":"duplicate client order id","code":400}'),
      )
      .mockRejectedValueOnce(
        new Error('mexc {"msg":"duplicate client order id","code":400}'),
      )
      .mockRejectedValueOnce(
        new Error('mexc {"msg":"duplicate client order id","code":400}'),
      );
    exchangeOrderMappingService.countMappingsForOrder.mockResolvedValueOnce(0);

    const firstService = createService(true);

    await expect(
      firstService.consumeIntents([
        {
          ...baseIntent,
          intentId: 'intent-before-restart',
          metadata,
        },
      ]),
    ).rejects.toThrow('duplicate client order id');

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(3);
    expect(exchangeOrderMappingService.createMapping).not.toHaveBeenCalled();
    expect(exchangeOrderMappingService.reserveMapping).toHaveBeenCalledWith({
      orderId: 'mm-order-repeat',
      clientOrderId: buildSubmittedClientOrderId('mm-order-repeat', 0),
    });

    jest.clearAllMocks();
    trackedOrders.clear();
    exchangeConnectorAdapterService.placeLimitOrder.mockResolvedValue({
      id: 'order-after-restart',
      status: 'open',
    });
    exchangeOrderMappingService.countMappingsForOrder.mockResolvedValueOnce(1);

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
      buildSubmittedClientOrderId('mm-order-repeat', 1),
      { postOnly: false, timeInForce: undefined },
      undefined,
    );
  });
});

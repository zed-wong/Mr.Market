import 'reflect-metadata';
jest.mock(
  'src/common/entities/market-making/strategy-execution-history.entity',
  () => ({
    StrategyExecutionHistory: class StrategyExecutionHistory {},
  }),
);

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

  const orderReservationService = {
    reserveForLimitOrder: jest.fn().mockResolvedValue({
      orderId: 'c1',
      assetId: 'USDT',
      amount: '100',
      applied: true,
    }),
    releaseLimitOrderReservation: jest.fn().mockResolvedValue({
      orderId: 'c1',
      assetId: 'USDT',
      amount: '100',
      applied: true,
    }),
    releaseRemainingLimitOrderReservation: jest.fn().mockResolvedValue({
      orderId: 'c1',
      assetId: 'USDT',
      amount: '100',
      applied: true,
    }),
    isReservationPausedForLimitOrder: jest.fn().mockReturnValue(false),
    pauseReservationForLimitOrder: jest.fn(),
  };

  const intentStoreService = {
    updateIntentStatus: jest.fn().mockResolvedValue(undefined),
    attachMixinOrderId: jest.fn().mockResolvedValue(undefined),
    getMixinOrderId: jest.fn().mockResolvedValue(undefined),
    batchUpsertIntents: jest.fn().mockResolvedValue(undefined),
    cancelPendingRiskIncreasingIntents: jest.fn().mockResolvedValue(0),
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

  const marketMakingOrderRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const strategyMarketDataProviderService = {
    getTrackedOrderBookFreshness: jest.fn().mockReturnValue({
      fresh: true,
      ageMs: 100,
      freshnessTimestamp: '2026-02-11T00:00:00.000Z',
    }),
  };

  const exchangeApiKeyService = {
    readAPIKey: jest.fn().mockResolvedValue({
      key_id: 'api-key-1',
      exchange: 'binance',
      permissions: 'read-trade',
      validation_status: 'valid',
    }),
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
    runtimeInstanceKey: 'strategy-1',
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
    reservationService?: typeof orderReservationService,
    orderRepository?: typeof marketMakingOrderRepository,
    marketDataProvider?: typeof strategyMarketDataProviderService,
    apiKeyService?: typeof exchangeApiKeyService,
    runtimeObservationService?: { recordIntentFailure: jest.Mock },
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
      reservationService as any,
      orderRepository as any,
      marketDataProvider as any,
      apiKeyService as any,
      runtimeObservationService as any,
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
    orderReservationService.reserveForLimitOrder.mockReset().mockResolvedValue({
      orderId: 'c1',
      assetId: 'USDT',
      amount: '100',
      applied: true,
    });
    orderReservationService.releaseLimitOrderReservation
      .mockReset()
      .mockResolvedValue({
        orderId: 'c1',
        assetId: 'USDT',
        amount: '100',
        applied: true,
      });
    orderReservationService.releaseRemainingLimitOrderReservation
      .mockReset()
      .mockResolvedValue({
        orderId: 'c1',
        assetId: 'USDT',
        amount: '100',
        applied: true,
      });
    orderReservationService.isReservationPausedForLimitOrder
      .mockReset()
      .mockReturnValue(false);
    orderReservationService.pauseReservationForLimitOrder.mockReset();
    strategyInstanceRepository.findOne.mockResolvedValue({
      strategyKey: 'u1-c1-pureMarketMaking',
      status: 'running',
      parameters: {},
    });
    strategyInstanceRepository.update.mockResolvedValue(undefined);
    marketMakingOrderRepository.findOne.mockReset().mockResolvedValue(null);
    strategyMarketDataProviderService.getTrackedOrderBookFreshness
      .mockReset()
      .mockReturnValue({
        fresh: true,
        ageMs: 100,
        freshnessTimestamp: '2026-02-11T00:00:00.000Z',
      });
    exchangeApiKeyService.readAPIKey.mockReset().mockResolvedValue({
      key_id: 'api-key-1',
      exchange: 'binance',
      permissions: 'read-trade',
      validation_status: 'valid',
    });
    intentStoreService.getMixinOrderId.mockResolvedValue(undefined);
    intentStoreService.batchUpsertIntents.mockReset().mockResolvedValue(
      undefined,
    );
    intentStoreService.cancelPendingRiskIncreasingIntents
      .mockReset()
      .mockResolvedValue(0);
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

  it('reserves order funds before exchange create', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
    );
    const callOrder: string[] = [];

    orderReservationService.reserveForLimitOrder.mockImplementation(
      async () => {
        callOrder.push('reserve');

        return {
          orderId: 'c1',
          assetId: 'USDT',
          amount: '100',
          applied: true,
        };
      },
    );
    exchangeConnectorAdapterService.placeLimitOrder.mockImplementation(
      async () => {
        callOrder.push('place');

        return { id: 'order-1', status: 'open' };
      },
    );

    await service.consumeIntents([baseIntent]);

    expect(orderReservationService.reserveForLimitOrder).toHaveBeenCalledWith({
      orderId: 'c1',
      userId: 'u1',
      intentId: 'intent-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1',
    });
    expect(callOrder).toEqual(['reserve', 'place']);
  });

  it('does not create exchange order when reservation fails', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
    );

    orderReservationService.reserveForLimitOrder.mockRejectedValue(
      new Error('insufficient available balance for lock'),
    );

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'insufficient available balance for lock',
    );

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      'insufficient available balance for lock',
    );
  });

  it('fails risk gate before reservation or exchange call', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
    );
    const invalidIntent: StrategyOrderIntent = {
      ...baseIntent,
      intentId: 'intent-risk-fail',
      qty: '0',
    };

    await expect(service.consumeIntents([invalidIntent])).rejects.toThrow(
      'risk gate rejected create intent: invalid quantity',
    );

    expect(orderReservationService.reserveForLimitOrder).not.toHaveBeenCalled();
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-risk-fail',
      'FAILED',
      'risk gate rejected create intent: invalid quantity',
    );
  });

  it('fails order-state risk gate before reservation or exchange call', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
      marketMakingOrderRepository,
    );

    marketMakingOrderRepository.findOne.mockResolvedValue({
      orderId: 'c1',
      state: 'paused',
    });

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'risk gate rejected create intent: order state paused',
    );

    expect(orderReservationService.reserveForLimitOrder).not.toHaveBeenCalled();
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      'risk gate rejected create intent: order state paused',
    );
  });

  it('fails market-data freshness risk gate before reservation or exchange call', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
      marketMakingOrderRepository,
      strategyMarketDataProviderService,
    );

    strategyMarketDataProviderService.getTrackedOrderBookFreshness.mockReturnValue(
      {
        fresh: false,
        ageMs: null,
        freshnessTimestamp: null,
      },
    );

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'risk gate rejected create intent: stale market data for binance BTC/USDT',
    );

    expect(orderReservationService.reserveForLimitOrder).not.toHaveBeenCalled();
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      'risk gate rejected create intent: stale market data for binance BTC/USDT',
    );
  });

  it('fails API-key health risk gate before reservation or exchange call', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
      marketMakingOrderRepository,
      strategyMarketDataProviderService,
      exchangeApiKeyService,
    );

    exchangeApiKeyService.readAPIKey.mockResolvedValue({
      key_id: 'api-key-1',
      exchange: 'binance',
      permissions: 'read-trade',
      validation_status: 'invalid',
    });

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          accountLabel: 'api-key-1',
        },
      ]),
    ).rejects.toThrow(
      'risk gate rejected create intent: API key health invalid',
    );

    expect(orderReservationService.reserveForLimitOrder).not.toHaveBeenCalled();
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      'risk gate rejected create intent: API key health invalid',
    );
  });

  it('releases reservation when exchange create fails', async () => {
    const runtimeObservationService = { recordIntentFailure: jest.fn() };
    const service = createService(
      true,
      createConfigService(true, { 'strategy.intent_max_retries': 0 }),
      createExecutionHistoryRepository(),
      orderReservationService,
      undefined,
      undefined,
      undefined,
      runtimeObservationService,
    );

    const error = new Error('exchange rejected order');

    exchangeConnectorAdapterService.placeLimitOrder.mockRejectedValue(error);

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'exchange rejected order',
    );

    expect(
      orderReservationService.releaseLimitOrderReservation,
    ).toHaveBeenCalledWith({
      orderId: 'c1',
      userId: 'u1',
      intentId: 'intent-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1',
      reason: 'exchange_create_failed',
    });
    expect(runtimeObservationService.recordIntentFailure).toHaveBeenCalledWith(
      baseIntent,
      error,
    );
  });

  it('pauses reservation when exchange rejects create for balance', async () => {
    const service = createService(
      true,
      createConfigService(true, { 'strategy.intent_max_retries': 0 }),
      createExecutionHistoryRepository(),
      orderReservationService,
    );

    exchangeConnectorAdapterService.placeLimitOrder.mockRejectedValue(
      new Error('mexc {"msg":"Oversold","code":30005}'),
    );

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'Oversold',
    );

    expect(
      orderReservationService.pauseReservationForLimitOrder,
    ).toHaveBeenCalledWith(
      {
        orderId: 'c1',
        userId: 'u1',
        intentId: 'intent-1',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
      },
      {
        source: 'exchange_create_failed',
        reason: 'exchange_balance_rejected',
        strategyKey: 'u1-c1-pureMarketMaking',
        refType: 'strategy_order_intent',
        refId: 'intent-1',
      },
    );
  });

  it('blocks dual-account maker create when inline taker reservation is paused', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
    );

    orderReservationService.isReservationPausedForLimitOrder.mockReturnValue(
      true,
    );

    await expect(
      service.consumeIntents([
        {
          ...baseIntent,
          intentId: 'dual-maker-paused-taker',
          strategyKey: 'admin-direct-o1-efficientDualAccountVolume',
          clientId: 'o1',
          accountLabel: '2',
          metadata: {
            role: 'maker',
            baseOrderId: 'o1',
            orderId: 'o1:2',
            takerAccountLabel: '5',
          },
        },
      ]),
    ).rejects.toThrow('inline taker reservation paused');

    expect(
      orderReservationService.isReservationPausedForLimitOrder,
    ).toHaveBeenCalledWith({
      orderId: 'o1:5',
      userId: 'u1',
      intentId: 'dual-maker-paused-taker:inline-taker',
      pair: 'BTC/USDT',
      side: 'sell',
      price: '100',
      qty: '1',
    });
    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).not.toHaveBeenCalled();
  });

  it('releases reservation and fails intent when exchange create returns rejected status', async () => {
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
    );

    exchangeConnectorAdapterService.placeLimitOrder.mockResolvedValue({
      id: 'order-1',
      status: 'rejected',
    });

    await expect(service.consumeIntents([baseIntent])).rejects.toThrow(
      'exchange create returned terminal status failed',
    );

    expect(
      orderReservationService.releaseLimitOrderReservation,
    ).toHaveBeenCalledWith({
      orderId: 'c1',
      userId: 'u1',
      intentId: 'intent-1',
      releaseId: buildSubmittedClientOrderId('c1', 0),
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1',
      reason: 'exchange_create_rejected',
    });
    expect(exchangeOrderTrackerService.upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'order-1',
        status: 'failed',
      }),
    );
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      baseIntent.intentId,
      'FAILED',
      'exchange create returned terminal status failed',
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
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-1',
        status: 'closed',
        filled: '1',
      });
    const service = createService(true);

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
    expect(exchangeConnectorAdapterService.fetchOrder).toHaveBeenCalledTimes(4);
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).toHaveBeenCalledWith('binance', 'BTC/USDT');
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

  it('cancels maker and skips inline taker when maker is not exclusive top-of-book', async () => {
    exchangeConnectorAdapterService.placeLimitOrder.mockResolvedValueOnce({
      id: 'maker-order-crowded',
      status: 'open',
    });
    exchangeConnectorAdapterService.fetchOrder.mockResolvedValue({
      id: 'maker-order-crowded',
      status: 'open',
      filled: '0',
    });
    exchangeConnectorAdapterService.fetchOrderBook.mockResolvedValue({
      bids: [[100, 2]],
      asks: [[101, 1]],
    });
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'dual-maker-crowded-book',
        accountLabel: 'maker',
        metadata: {
          role: 'maker',
          takerAccountLabel: 'taker',
          cycleId: 'cycle-crowded-book',
          orderId: 'dual-cycle-crowded-book',
        },
      },
    ]);

    expect(
      exchangeConnectorAdapterService.placeLimitOrder,
    ).toHaveBeenCalledTimes(1);
    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'maker-order-crowded',
      'maker',
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

  it('treats matched partial maker and taker fills as success while only requiring the maker to remain open', async () => {
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
        status: 'open',
        filled: '0',
      })
      .mockResolvedValueOnce({
        id: 'maker-order-partial',
        status: 'closed',
        filled: '0.4',
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
    ).toHaveBeenCalledWith('binance', 'BTC/USDT');
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'dual-maker-partial:inline-taker',
      'DONE',
    );
    expect(exchangeConnectorAdapterService.cancelOrder).not.toHaveBeenCalled();
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
      { releaseReservation: false },
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

  it('releases remaining reservation when cancel ack is final', async () => {
    trackedOrders.set(
      toTrackedOrderKey('binance', undefined, 'exchange-order-1'),
      {
        orderId: 'c1',
        strategyKey: 'u1-c1-pureMarketMaking',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-order-1',
        clientOrderId: buildSubmittedClientOrderId('c1', 0),
        side: 'buy',
        price: '100',
        qty: '1',
        cumulativeFilledQty: '0.25',
        status: 'open',
      },
    );
    const service = createService(
      true,
      createConfigService(true),
      createExecutionHistoryRepository(),
      orderReservationService,
    );
    const cancelIntent: StrategyOrderIntent = {
      ...baseIntent,
      intentId: 'intent-cancel',
      type: 'CANCEL_ORDER',
      mixinOrderId: 'exchange-order-1',
    };

    await service.consumeIntents([cancelIntent]);

    expect(
      orderReservationService.releaseRemainingLimitOrderReservation,
    ).toHaveBeenCalledWith({
      orderId: 'c1',
      userId: 'u1',
      intentId: 'intent-cancel',
      releaseId: buildSubmittedClientOrderId('c1', 0),
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '1',
      filledQty: '0.25',
      reason: 'exchange_order_cancelled',
    });
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

  it('handles STOP_CONTROLLER by marking stopping and enqueueing cancel intents without exchange mutation', async () => {
    trackedOrders.set('binance:maker:maker-ex-1', {
      orderId: 'order-1',
      strategyKey: baseIntent.strategyKey,
      exchange: 'binance',
      accountLabel: 'maker',
      pair: 'BTC/USDT',
      exchangeOrderId: 'maker-ex-1',
      slotKey: 'cycle-1-maker',
      role: 'maker',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-06-08T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z',
    });
    trackedOrders.set('binance:taker:taker-ex-1', {
      orderId: 'order-1',
      strategyKey: baseIntent.strategyKey,
      exchange: 'binance',
      accountLabel: 'taker',
      pair: 'BTC/USDT',
      exchangeOrderId: 'taker-ex-1',
      role: 'taker',
      side: 'sell',
      price: '100',
      qty: '1',
      status: 'filled',
      createdAt: '2026-06-08T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z',
    });
    const service = createService(true);

    await service.consumeIntents([
      {
        ...baseIntent,
        intentId: 'intent-stop',
        type: 'STOP_CONTROLLER',
        exchange: '',
        pair: '',
        price: '0',
        qty: '0',
      },
    ]);

    expect(strategyInstanceRepository.update).toHaveBeenCalledWith(
      { strategyKey: baseIntent.strategyKey },
      expect.objectContaining({ status: 'stopping' }),
    );
    expect(
      intentStoreService.cancelPendingRiskIncreasingIntents,
    ).toHaveBeenCalledWith(
      baseIntent.strategyKey,
      'strategy stopping before intent execution',
    );
    expect(intentStoreService.batchUpsertIntents).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'CANCEL_ORDER',
        strategyKey: baseIntent.strategyKey,
        exchange: 'binance',
        accountLabel: 'maker',
        pair: 'BTC/USDT',
        mixinOrderId: 'maker-ex-1',
        metadata: expect.objectContaining({
          reason: 'strategy_stop',
          stopIntentId: 'intent-stop',
          orderId: 'order-1',
          role: 'maker',
        }),
      }),
    ]);
    expect(exchangeConnectorAdapterService.cancelOrder).not.toHaveBeenCalled();
    expect(intentStoreService.updateIntentStatus).toHaveBeenCalledWith(
      'intent-stop',
      'DONE',
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

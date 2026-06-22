/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';

describe('ExchangeOrderTrackerService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const flushPromises = async () =>
    await new Promise((resolve) => setImmediate(resolve));

  it('upserts order states and returns open orders by strategy', async () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.500Z',
    });

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-2',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'filled',
      createdAt: '2026-02-11T00:00:01.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    const openOrders = service.getOpenOrders('u1-c1-pureMarketMaking');

    expect(openOrders).toHaveLength(1);
    expect(openOrders[0].exchangeOrderId).toBe('ex-1');
  });

  it('releases reservations when a tracked order becomes cancelled', async () => {
    const marketMakingOrderRepository = {
      findOne: jest.fn().mockResolvedValue({ userId: 'admin-direct' }),
    };
    const orderReservationService = {
      releaseRemainingLimitOrderReservation: jest.fn().mockResolvedValue({
        applied: true,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined,
      undefined,
      undefined,
      undefined,
      marketMakingOrderRepository as any,
      undefined,
      orderReservationService as any,
    );

    service.upsertOrder({
      orderId: 'order-1',
      strategyKey: 'order-1-pureMarketMaking',
      exchange: 'mexc',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client-1',
      side: 'buy',
      price: '58.2',
      qty: '0.02',
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'order-1',
      strategyKey: 'order-1-pureMarketMaking',
      exchange: 'mexc',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client-1',
      side: 'buy',
      price: '58.2',
      qty: '0.02',
      cumulativeFilledQty: '0',
      status: 'cancelled',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    await flushPromises();

    expect(
      orderReservationService.releaseRemainingLimitOrderReservation,
    ).toHaveBeenCalledWith({
      orderId: 'order-1',
      userOrderId: 'order-1',
      accountLabel: 'default',
      userId: 'admin-direct',
      intentId: 'client-1',
      releaseId: 'client-1',
      pair: 'XIN/USDT',
      side: 'buy',
      price: '58.2',
      qty: '0.02',
      filledQty: '0',
      reason: 'exchange_order_cancelled',
    });
  });

  it('releases terminal scoped-account reservations with the root user order id', async () => {
    const marketMakingOrderRepository = {
      findOne: jest.fn().mockResolvedValue({ userId: 'admin-direct' }),
    };
    const orderReservationService = {
      releaseRemainingLimitOrderReservation: jest.fn().mockResolvedValue({
        applied: true,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined,
      undefined,
      undefined,
      undefined,
      marketMakingOrderRepository as any,
      undefined,
      orderReservationService as any,
    );

    service.upsertOrder({
      orderId: 'order-1:4',
      strategyKey: 'admin-direct-order-1-efficientDualAccountVolume',
      exchange: 'mexc',
      accountLabel: '4',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-4',
      clientOrderId: 'client-4',
      side: 'sell',
      price: '54',
      qty: '0.3',
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'order-1:4',
      strategyKey: 'admin-direct-order-1-efficientDualAccountVolume',
      exchange: 'mexc',
      accountLabel: '4',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-4',
      clientOrderId: 'client-4',
      side: 'sell',
      price: '54',
      qty: '0.3',
      cumulativeFilledQty: '0',
      status: 'cancelled',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    await flushPromises();

    expect(
      orderReservationService.releaseRemainingLimitOrderReservation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1:4',
        userOrderId: 'order-1',
        accountLabel: '4',
        userId: 'admin-direct',
        reason: 'exchange_order_cancelled',
      }),
    );
    expect(marketMakingOrderRepository.findOne).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
    });
  });

  it('preserves previous price and qty when a terminal update omits usable values', async () => {
    const marketMakingOrderRepository = {
      findOne: jest.fn().mockResolvedValue({ userId: 'admin-direct' }),
    };
    const orderReservationService = {
      releaseRemainingLimitOrderReservation: jest.fn().mockResolvedValue({
        applied: true,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined,
      undefined,
      undefined,
      undefined,
      marketMakingOrderRepository as any,
      undefined,
      orderReservationService as any,
    );

    service.upsertOrder({
      orderId: 'order-1',
      strategyKey: 'order-1-pureMarketMaking',
      exchange: 'mexc',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client-1',
      side: 'sell',
      price: '59.65',
      qty: '0.02',
      cumulativeFilledQty: '0',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'order-1',
      strategyKey: 'order-1-pureMarketMaking',
      exchange: 'mexc',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client-1',
      side: 'sell',
      price: '0',
      qty: '0',
      cumulativeFilledQty: '0',
      status: 'cancelled',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    await flushPromises();

    expect(
      orderReservationService.releaseRemainingLimitOrderReservation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'sell',
        price: '59.65',
        qty: '0.02',
        reason: 'exchange_order_cancelled',
      }),
    );
  });

  it('skips terminal reservation release when disabled by caller', async () => {
    const orderReservationService = {
      releaseRemainingLimitOrderReservation: jest.fn().mockResolvedValue({
        applied: true,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      orderReservationService as any,
    );

    service.upsertOrder({
      orderId: 'order-1',
      strategyKey: 'order-1-pureMarketMaking',
      exchange: 'mexc',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client-1',
      side: 'buy',
      price: '58.2',
      qty: '0.02',
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder(
      {
        orderId: 'order-1',
        strategyKey: 'order-1-pureMarketMaking',
        exchange: 'mexc',
        pair: 'XIN/USDT',
        exchangeOrderId: 'ex-1',
        clientOrderId: 'client-1',
        side: 'buy',
        price: '58.2',
        qty: '0.02',
        cumulativeFilledQty: '0',
        status: 'cancelled',
        createdAt: '2026-02-11T00:00:00.000Z',
        updatedAt: '2026-02-11T00:00:01.000Z',
      },
      { releaseReservation: false },
    );

    await flushPromises();

    expect(
      orderReservationService.releaseRemainingLimitOrderReservation,
    ).not.toHaveBeenCalled();
  });

  it('splits live orders from active slot orders', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'pending-create',
      slotKey: 'layer-1-buy',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'open-order',
      slotKey: 'layer-1-sell',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'pending-cancel',
      slotKey: 'layer-2-buy',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'pending_cancel',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(
      service.getLiveOrders('strategy-1').map((order) => order.exchangeOrderId),
    ).toEqual(['open-order']);
    expect(
      service
        .getActiveSlotOrders('strategy-1')
        .map((order) => order.exchangeOrderId),
    ).toEqual(['pending-create', 'open-order', 'pending-cancel']);
  });

  it('summarizes tracked orders with bounded sampling', () => {
    const service = new ExchangeOrderTrackerService();

    Array.from({ length: 8 }, (_, index) => {
      service.upsertOrder({
        orderId: `order-${index}`,
        strategyKey: 'summary-test-strategy',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: `summary-${index}`,
        side: index % 2 === 0 ? 'buy' : 'sell',
        price: '100',
        qty: '1',
        status:
          index === 6 ? 'failed' : index === 7 ? 'external_missing' : 'open',
        createdAt: '2026-02-11T00:00:00.000Z',
        updatedAt: '2026-02-11T00:00:00.000Z',
      });
    });

    const summary = service.getTrackedOrderSummary(3);

    expect(summary.totalOrders).toBe(8);
    expect(summary.sample).toHaveLength(3);
    expect(summary.sampledOrders).toBe(3);
    expect(summary.truncated).toBe(true);
    expect(summary.byStatus).toEqual({
      open: 6,
      failed: 1,
      external_missing: 1,
    });
  });

  it('summarizes tracked orders from maintained counters without iterating the cache', () => {
    const service = new ExchangeOrderTrackerService();

    Array.from({ length: 12 }, (_, index) => {
      service.upsertOrder({
        orderId: `bounded-${index}`,
        strategyKey: 'summary-boundedness-strategy',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: `bounded-${index}`,
        side: 'buy',
        price: '100',
        qty: '1',
        status: index < 7 ? 'open' : index < 10 ? 'partially_filled' : 'failed',
        createdAt: '2026-02-11T00:00:00.000Z',
        updatedAt: '2026-02-11T00:00:00.000Z',
      });
    });

    const valuesSpy = jest
      .spyOn((service as any).orders, 'values')
      .mockImplementation(() => {
        throw new Error('summary must not iterate every tracked order');
      });

    const summary = service.getTrackedOrderSummary(2);

    expect(valuesSpy).not.toHaveBeenCalled();
    expect(summary.totalOrders).toBe(12);
    expect(summary.sample).toHaveLength(2);
    expect(summary.sampledOrders).toBe(2);
    expect(summary.truncated).toBe(true);
    expect(summary.byStatus).toEqual({
      open: 7,
      partially_filled: 3,
      failed: 2,
    });
  });

  it('keeps tracked-order summary counts correct across updates and removals', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'summary-update-1',
      strategyKey: 'summary-update-strategy',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'summary-update-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'summary-update-2',
      strategyKey: 'summary-update-strategy',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'summary-update-2',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'summary-update-1',
      strategyKey: 'summary-update-strategy',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'summary-update-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });
    service.upsertOrder({
      orderId: 'summary-update-1',
      strategyKey: 'summary-update-strategy',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'summary-update-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:02.000Z',
    });

    expect(service.removeTrackedOrder('binance', 'summary-update-2')).toBe(
      true,
    );
    expect(service.removeTrackedOrder('binance', 'missing-order')).toBe(false);

    expect(service.getTrackedOrderSummary(10)).toMatchObject({
      totalOrders: 1,
      sampledOrders: 1,
      byStatus: { open: 1 },
      truncated: false,
    });
  });

  it('hydrates tracked-order summary counts from persisted rows', async () => {
    const trackedOrderRepository = {
      find: jest.fn().mockResolvedValue([
        {
          orderId: 'persisted-1',
          strategyKey: 'persisted-summary-strategy',
          exchange: 'binance',
          accountLabel: null,
          pair: 'BTC/USDT',
          exchangeOrderId: 'persisted-1',
          clientOrderId: null,
          slotKey: null,
          role: null,
          side: 'buy',
          price: '100',
          qty: '1',
          cumulativeFilledQty: '0',
          status: 'open',
          createdAt: '2026-02-11T00:00:00.000Z',
          updatedAt: '2026-02-11T00:00:00.000Z',
        },
        {
          orderId: 'persisted-2',
          strategyKey: 'persisted-summary-strategy',
          exchange: 'binance',
          accountLabel: null,
          pair: 'BTC/USDT',
          exchangeOrderId: 'persisted-2',
          clientOrderId: null,
          slotKey: null,
          role: null,
          side: 'sell',
          price: '101',
          qty: '1',
          cumulativeFilledQty: '0',
          status: 'cancelled',
          createdAt: '2026-02-11T00:00:00.000Z',
          updatedAt: '2026-02-11T00:00:00.000Z',
        },
      ]),
    };
    const service = new ExchangeOrderTrackerService(
      undefined,
      undefined,
      trackedOrderRepository as any,
    );

    await service.onModuleInit();

    expect(service.getTrackedOrderSummary(10)).toMatchObject({
      totalOrders: 2,
      sampledOrders: 2,
      byStatus: { open: 1, cancelled: 1 },
      truncated: false,
    });
  });

  it('reconciles open order snapshots into internal/external mismatch states', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'internal-open',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    const report = service.reconcileOpenOrderSnapshot({
      exchange: 'binance',
      pair: 'BTC/USDT',
      openOrders: [
        {
          id: 'external-open',
          side: 'sell',
          price: '101',
          amount: '2',
          filled: '0.5',
        },
      ],
      observedAt: '2026-02-11T00:00:01.000Z',
    });

    expect(report).toEqual({
      internalMissing: ['external-open'],
      externalMissing: ['internal-open'],
    });
    expect(service.getTrackedOrders('strategy-1')[0].status).toBe(
      'external_missing',
    );

    const missingExternal = service.getTrackedOrders(
      'internal_missing:binance:default:BTC/USDT',
    );

    expect(missingExternal).toHaveLength(1);
    expect(missingExternal[0]).toEqual(
      expect.objectContaining({
        exchangeOrderId: 'external-open',
        status: 'internal_missing',
        side: 'sell',
        price: '101',
        qty: '2',
        cumulativeFilledQty: '0.5',
      }),
    );
  });

  it('adopts a locally acknowledged order after an internal-missing placeholder was created first', () => {
    const service = new ExchangeOrderTrackerService();

    service.reconcileOpenOrderSnapshot({
      exchange: 'binance',
      pair: 'BTC/USDT',
      openOrders: [
        {
          id: 'ex-race',
          clientOrderId: 'client-race',
          side: 'buy',
          price: '100',
          amount: '1',
          filled: '0',
        },
      ],
      observedAt: '2026-02-11T00:00:00.000Z',
    });

    service.upsertOrder({
      orderId: 'order-1',
      strategyKey: 'order-1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-race',
      clientOrderId: 'client-race',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:01.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    const adoptedOrder = service.getByExchangeOrderId('binance', 'ex-race');

    expect(adoptedOrder).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        strategyKey: 'order-1-pureMarketMaking',
        exchangeOrderId: 'ex-race',
        clientOrderId: 'client-race',
        status: 'pending_create',
      }),
    );
    expect(
      service.getTrackedOrders('internal_missing:binance:default:BTC/USDT'),
    ).toHaveLength(0);
  });

  it('reconciles order status through the off-tick poller', async () => {
    const adapter = {
      fetchOrder: jest.fn().mockResolvedValue({ id: 'ex-1', status: 'closed' }),
    };
    const service = new ExchangeOrderTrackerService(adapter as any);

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');

    const tracked = service.getByExchangeOrderId('binance', 'ex-1');

    expect(tracked?.status).toBe('filled');
  });

  it('reconciles pending_create orders without exchangeOrderId by clientOrderId', async () => {
    const adapter = {
      fetchOrderByClientOrderId: jest.fn().mockResolvedValue({
        id: 'ex-recovered',
        status: 'open',
        filled: '0',
      }),
      fetchOpenOrders: jest.fn().mockResolvedValue([{ id: 'ex-recovered' }]),
    };
    const orderReservationService = {
      releaseLimitOrderReservation: jest.fn(),
    };
    const service = new ExchangeOrderTrackerService(
      adapter as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      orderReservationService as any,
    );

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: '',
      clientOrderId: 'client-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');

    expect(adapter.fetchOrderByClientOrderId).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'client-1',
      undefined,
    );
    expect(
      service.getByExchangeOrderId('binance', 'ex-recovered')?.status,
    ).toBe('open');
    expect(
      orderReservationService.releaseLimitOrderReservation,
    ).not.toHaveBeenCalled();
  });

  it('recovers Hyperliquid pending_create orders after restart by 128-bit clientOrderId', async () => {
    const clientOrderId = '0x78b03881f575d18f8a3c345fdd99afc5';
    const adapter = {
      fetchOrderByClientOrderId: jest.fn().mockResolvedValue({
        id: 'hl-ex-recovered',
        status: 'open',
        filled: '0',
      }),
      fetchOpenOrders: jest.fn().mockResolvedValue([
        { id: 'hl-ex-recovered' },
      ]),
    };
    const orderReservationService = {
      releaseLimitOrderReservation: jest.fn(),
    };
    const service = new ExchangeOrderTrackerService(
      adapter as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      orderReservationService as any,
    );

    service.upsertOrder({
      orderId: 'order-hl',
      strategyKey: 'order-hl-pureMarketMaking',
      exchange: 'hyperliquid',
      accountLabel: 'hl-wallet-1',
      pair: 'BTC/USDC',
      exchangeOrderId: '',
      clientOrderId,
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');

    expect(adapter.fetchOrderByClientOrderId).toHaveBeenCalledWith(
      'hyperliquid',
      'BTC/USDC',
      clientOrderId,
      'hl-wallet-1',
    );
    expect(
      service.getByExchangeOrderId(
        'hyperliquid',
        'hl-ex-recovered',
        'hl-wallet-1',
      )?.status,
    ).toBe('open');
    expect(
      orderReservationService.releaseLimitOrderReservation,
    ).not.toHaveBeenCalled();
  });

  it('reconciles open-order snapshots during off-tick polling when available', async () => {
    const adapter = {
      fetchOrder: jest.fn().mockResolvedValue({ id: 'ex-1', status: 'open' }),
      fetchOpenOrders: jest.fn().mockResolvedValue([{ id: 'external-open' }]),
    };
    const service = new ExchangeOrderTrackerService(adapter as any);

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');

    expect(adapter.fetchOpenOrders).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      undefined,
    );
    expect(service.getTrackedOrders('u1-c1-pureMarketMaking')[0].status).toBe(
      'external_missing',
    );
    expect(
      service.getTrackedOrders('internal_missing:binance:default:BTC/USDT')[0]
        .exchangeOrderId,
    ).toBe('external-open');
  });

  it('self-heals stopped market-making orders without re-polling them on later reconciliation passes', async () => {
    const adapter = {
      fetchOrder: jest.fn(),
    };
    const strategyInstanceRepository = {
      findOne: jest.fn().mockResolvedValue({
        strategyKey: 'u1-c1-pureMarketMaking',
        status: 'running',
        marketMakingOrderId: 'order-1',
      }),
    };
    const marketMakingOrderRepository = {
      findOne: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        state: 'stopped',
      }),
    };
    const service = new ExchangeOrderTrackerService(
      adapter as any,
      undefined as any,
      undefined as any,
      strategyInstanceRepository as any,
      marketMakingOrderRepository as any,
    );

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');
    await service.pollDueOrders('2026-02-11T00:00:02.000Z');

    expect(adapter.fetchOrder).not.toHaveBeenCalled();
    expect(service.getByExchangeOrderId('binance', 'ex-1')?.status).toBe(
      'cancelled',
    );
  });

  it('routes recovered REST fill deltas through the executor exactly once', async () => {
    const onFill = jest.fn();
    const adapter = {
      fetchOrder: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'ex-1',
          status: 'partially_filled',
          filled: '0.5',
        })
        .mockResolvedValueOnce({
          id: 'ex-1',
          status: 'partially_filled',
          filled: '0.5',
        }),
    };
    const executorRegistry = {
      getExecutor: jest.fn().mockReturnValue({
        getSession: jest.fn((orderId: string) =>
          orderId === 'u1-c1' ? { orderId } : undefined,
        ),
        onFill,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      adapter as any,
      executorRegistry as any,
    );

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'mm-1',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');
    await service.pollDueOrders('2026-02-11T00:00:02.000Z');

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-1',
        clientOrderId: 'mm-1',
        qty: '0.5',
        cumulativeQty: '0.5',
      }),
    );
  });

  it('routes directly observed unsettled fill progress through the executor', async () => {
    const onFill = jest.fn().mockResolvedValue(undefined);
    const executorRegistry = {
      getExecutor: jest.fn().mockReturnValue({
        getSession: jest.fn((orderId: string) =>
          orderId === 'order-1:2' ? { orderId } : undefined,
        ),
        onFill,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined,
      executorRegistry as any,
    );

    service.upsertOrder({
      orderId: 'order-1:2',
      strategyKey: 'strategy-1',
      exchange: 'mexc',
      accountLabel: '2',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client-1',
      side: 'buy',
      price: '53.84',
      qty: '0.1',
      cumulativeFilledQty: '0',
      settledFilledQty: '0',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    service.upsertOrder({
      orderId: 'order-1:2',
      strategyKey: 'strategy-1',
      exchange: 'mexc',
      accountLabel: '2',
      pair: 'XIN/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'client-1',
      side: 'buy',
      price: '53.84',
      qty: '0.1',
      cumulativeFilledQty: '0.1',
      settledFilledQty: '0',
      status: 'filled',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    await flushPromises();

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1:2',
        exchangeOrderId: 'ex-1',
        clientOrderId: 'client-1',
        accountLabel: '2',
        qty: '0.1',
        cumulativeQty: '0.1',
      }),
    );
  });

  it('repairs stored filled but unsettled tracked orders on tick', async () => {
    const onFill = jest.fn().mockResolvedValue(undefined);
    const executorRegistry = {
      getExecutor: jest.fn().mockReturnValue({
        getSession: jest.fn((orderId: string) =>
          orderId === 'order-1' ? { orderId } : undefined,
        ),
        onFill,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined,
      executorRegistry as any,
    );

    service.upsertOrder(
      {
        orderId: 'order-1:5',
        strategyKey: 'strategy-1',
        exchange: 'mexc',
        accountLabel: '5',
        pair: 'XIN/USDT',
        exchangeOrderId: 'ex-2',
        clientOrderId: 'client-2',
        side: 'sell',
        price: '53.84',
        qty: '0.25',
        cumulativeFilledQty: '0.25',
        settledFilledQty: '0.1',
        status: 'filled',
        createdAt: '2026-02-11T00:00:00.000Z',
        updatedAt: '2026-02-11T00:00:01.000Z',
      },
      { settleFill: false },
    );

    await service.onTick('2026-02-11T00:00:02.000Z');

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        exchangeOrderId: 'ex-2',
        accountLabel: '5',
        qty: '0.15',
        cumulativeQty: '0.25',
      }),
    );

    service.markFillSettled({
      exchange: 'mexc',
      accountLabel: '5',
      exchangeOrderId: 'ex-2',
      cumulativeQty: '0.25',
    });

    await service.onTick('2026-02-11T00:00:03.000Z');

    expect(onFill).toHaveBeenCalledTimes(1);
  });

  it('rejects illegal transitions and keeps cumulative fills monotonic', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0.4',
      status: 'partially_filled',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0.1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    const tracked = service.getByExchangeOrderId('binance', 'ex-1');

    expect(tracked?.status).toBe('partially_filled');
    expect(tracked?.cumulativeFilledQty).toBe('0.4');
  });

  it('tracks settled fill progress monotonically per exchange order', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'sell',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0.4',
      status: 'partially_filled',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    service.markFillSettled({
      exchange: 'binance',
      exchangeOrderId: 'ex-1',
      cumulativeQty: '0.4',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });
    service.markFillSettled({
      exchange: 'binance',
      exchangeOrderId: 'ex-1',
      cumulativeQty: '0.2',
      updatedAt: '2026-02-11T00:00:02.000Z',
    });

    const tracked = service.getByExchangeOrderId('binance', 'ex-1');

    expect(tracked?.settledFilledQty).toBe('0.4');
  });

  it('keeps same exchange order id from different exchanges isolated', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'client-1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'client-2',
      strategyKey: 'strategy-1',
      exchange: 'mexc',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(service.getByExchangeOrderId('binance', 'same-id')?.exchange).toBe(
      'binance',
    );
    expect(service.getByExchangeOrderId('mexc', 'same-id')?.exchange).toBe(
      'mexc',
    );
  });

  it('keeps same exchange order id from different accounts isolated', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'client-1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      accountLabel: 'default',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'client-2',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      accountLabel: 'account2',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(
      service.getByExchangeOrderId('binance', 'same-id', 'default')?.side,
    ).toBe('buy');
    expect(
      service.getByExchangeOrderId('binance', 'same-id', 'account2')?.side,
    ).toBe('sell');
  });

  it('marks user stream activity and uses the slow off-tick poll interval', async () => {
    const adapter = {
      fetchOrder: jest.fn().mockResolvedValue({ id: 'ex-1', status: 'open' }),
    };
    const service = new ExchangeOrderTrackerService(adapter as any);

    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      accountLabel: 'default',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    service.markUserStreamActivity('binance', 'default');

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');

    expect(adapter.fetchOrder).toHaveBeenCalledTimes(1);

    adapter.fetchOrder.mockClear();

    await service.pollDueOrders('2026-02-11T00:00:02.000Z');

    expect(adapter.fetchOrder).toHaveBeenCalledTimes(0);
  });

  it('uses the fast off-tick poll interval when user stream is silent', async () => {
    const adapter = {
      fetchOrder: jest.fn().mockResolvedValue({ id: 'ex-1', status: 'open' }),
    };
    const service = new ExchangeOrderTrackerService(adapter as any);

    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z');

    expect(adapter.fetchOrder).toHaveBeenCalledTimes(1);

    adapter.fetchOrder.mockClear();

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6_000);

    await service.pollDueOrders('2026-02-11T00:00:07.000Z');

    expect(adapter.fetchOrder).toHaveBeenCalledTimes(1);
  });

  it('polls within the configured reconciliation budget per pass', async () => {
    const adapter = {
      fetchOrder: jest.fn().mockResolvedValue({ id: 'x', status: 'open' }),
    };
    const service = new ExchangeOrderTrackerService(adapter as any);

    for (let i = 0; i < 5; i++) {
      service.upsertOrder({
        orderId: `o${i}`,
        strategyKey: 'strategy-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: `ex-${i}`,
        side: 'buy',
        price: '100',
        qty: '1',
        status: 'open',
        createdAt: '2026-02-11T00:00:00.000Z',
        updatedAt: '2026-02-11T00:00:00.000Z',
      });
    }

    await service.pollDueOrders('2026-02-11T00:00:01.000Z', {
      totalBudget: 3,
      perExchangeBudget: 3,
    });

    expect(adapter.fetchOrder).toHaveBeenCalledTimes(3);
  });

  it('prioritizes pending_create and pending_cancel orders', async () => {
    const fetchedIds: string[] = [];
    const adapter = {
      fetchOrder: jest
        .fn()
        .mockImplementation(
          (_exchange: string, _pair: string, exchangeOrderId: string) => {
            fetchedIds.push(exchangeOrderId);

            return Promise.resolve({ id: exchangeOrderId, status: 'open' });
          },
        ),
    };
    const service = new ExchangeOrderTrackerService(adapter as any);

    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'open-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'o2',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'pending-1',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'o3',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'open-2',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.pollDueOrders('2026-02-11T00:00:01.000Z', {
      totalBudget: 3,
      perExchangeBudget: 3,
    });

    expect(fetchedIds[0]).toBe('pending-1');
  });
});

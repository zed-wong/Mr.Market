/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';

import { ExchangeConnectorAdapterService } from './exchange-connector-adapter.service';

describe('ExchangeConnectorAdapterService', () => {
  const exchange = {
    createOrder: jest.fn().mockResolvedValue({ id: 'ex-order-1' }),
    cancelOrder: jest
      .fn()
      .mockResolvedValue({ id: 'ex-order-1', status: 'canceled' }),
    fetchOrder: jest
      .fn()
      .mockResolvedValue({ id: 'ex-order-1', status: 'open' }),
    fetchOpenOrders: jest.fn().mockResolvedValue([{ id: 'ex-order-1' }]),
    fetchOrderBook: jest.fn().mockResolvedValue({ bids: [], asks: [] }),
    fetchBalance: jest.fn().mockResolvedValue({ free: { BTC: 1, USDT: 1000 } }),
    watchOrderBook: jest.fn().mockResolvedValue({ bids: [], asks: [] }),
    watchBalance: jest.fn().mockResolvedValue({ total: {} }),
    loadMarkets: jest.fn().mockResolvedValue(undefined),
    amountToPrecision: jest.fn((_pair: string, amount: number) =>
      amount.toFixed(4),
    ),
    priceToPrecision: jest.fn((_pair: string, price: number) =>
      price.toFixed(2),
    ),
    markets: {
      'BTC/USDT': {
        limits: {
          amount: { min: 0.001, max: 5 },
          cost: { min: 10, max: 500 },
        },
        precision: { amount: 4, price: 2 },
        maker: 0.001,
        taker: 0.002,
      },
    },
  };

  const exchangeInitService = {
    getExchange: jest.fn().mockReturnValue(exchange),
  };

  const createConfigService = (
    minRequestIntervalMs = 1,
    requestTimeoutMs = 15_000,
  ) =>
    ({
      get: jest.fn((key: string, defaultValue?: number) => {
        if (key === 'strategy.exchange_min_request_interval_ms') {
          return minRequestIntervalMs;
        }
        if (key === 'strategy.exchange_request_timeout_ms') {
          return requestTimeoutMs;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('places and cancels limit orders through adapter', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(),
    );

    await service.placeLimitOrder(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      'order-1:0',
      { postOnly: true },
    );
    await service.cancelOrder('binance', 'BTC/USDT', 'ex-order-1');

    expect(exchange.createOrder).toHaveBeenCalledWith(
      'BTC/USDT',
      'limit',
      'buy',
      1,
      100,
      { clientOrderId: 'order-1:0', postOnly: true },
    );
    expect(exchange.cancelOrder).toHaveBeenCalledWith('ex-order-1', 'BTC/USDT');
  });

  it('passes IOC timeInForce through limit-order placement', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(),
    );

    await service.placeLimitOrder(
      'hyperliquid',
      'BTC/USDT',
      'sell',
      '1',
      '100',
      'order-1:1',
      { timeInForce: 'IOC' },
      'maker',
    );

    expect(exchange.createOrder).toHaveBeenCalledWith(
      'BTC/USDT',
      'limit',
      'sell',
      1,
      100,
      { clientOrderId: 'order-1:1', timeInForce: 'IOC' },
    );
    expect(exchangeInitService.getExchange).toHaveBeenCalledWith(
      'hyperliquid',
      'maker',
    );
  });

  it('fetches order/open-orders/orderbook through adapter', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(),
    );

    await service.fetchOrder('binance', 'BTC/USDT', 'ex-order-1');
    await service.fetchOpenOrders('binance', 'BTC/USDT');
    await service.fetchOrderBook('binance', 'BTC/USDT');

    expect(exchange.fetchOrder).toHaveBeenCalled();
    expect(exchange.fetchOpenOrders).toHaveBeenCalledWith('BTC/USDT');
    expect(exchange.fetchOrderBook).toHaveBeenCalledWith('BTC/USDT');
  });

  it('starts market and user streams when watch methods exist', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(),
    );

    await service.watchOrderBook('binance', 'BTC/USDT');
    await service.watchBalance('binance', 'default');

    expect(exchange.watchOrderBook).toHaveBeenCalledWith('BTC/USDT');
    expect(exchange.watchBalance).toHaveBeenCalled();
    expect(exchangeInitService.getExchange).toHaveBeenCalledWith(
      'binance',
      'default',
    );
  });

  it('loads trading rules and fetches balances through adapter', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(),
    );

    await expect(
      service.loadTradingRules('binance', 'BTC/USDT'),
    ).resolves.toEqual({
      amountMin: 0.001,
      amountMax: 5,
      costMin: 10,
      costMax: 500,
      makerFee: 0.001,
      takerFee: 0.002,
    });
    await service.fetchBalance('binance');

    expect(exchange.fetchBalance).toHaveBeenCalled();
  });

  it('quantizes orders through ccxt precision helpers', () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(),
    );

    expect(
      service.quantizeOrder('binance', 'BTC/USDT', '0.123456', '100.987'),
    ).toEqual({
      qty: '0.1235',
      price: '100.99',
    });
    expect(exchange.amountToPrecision).toHaveBeenCalledWith(
      'BTC/USDT',
      0.123456,
    );
    expect(exchange.priceToPrecision).toHaveBeenCalledWith('BTC/USDT', 100.987);
  });

  it('serializes concurrent calls per exchange and applies interval after prior completion', async () => {
    const minIntervalMs = 20;
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(minIntervalMs),
    );

    let resolveFirstOrder!: (value: any) => void;
    let firstResolvedAtMs = 0;
    let secondCallAtMs = 0;

    const firstOrder = new Promise<any>((resolve) => {
      resolveFirstOrder = resolve;
    });

    exchange.createOrder
      .mockImplementationOnce(async () => await firstOrder)
      .mockImplementationOnce(async () => {
        secondCallAtMs = Date.now();

        return { id: 'ex-order-2' };
      });

    const firstCall = service.placeLimitOrder(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
    );

    await Promise.resolve();

    const secondCall = service.placeLimitOrder(
      'binance',
      'BTC/USDT',
      'buy',
      '2',
      '101',
    );

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(exchange.createOrder).toHaveBeenCalledTimes(1);

    firstResolvedAtMs = Date.now();
    resolveFirstOrder({ id: 'ex-order-1' });

    await Promise.all([firstCall, secondCall]);

    expect(exchange.createOrder).toHaveBeenCalledTimes(2);
    expect(secondCallAtMs - firstResolvedAtMs).toBeGreaterThanOrEqual(
      minIntervalMs,
    );
  });

  it('does not serialize concurrent writes across different accounts on the same exchange', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(50),
    );

    let resolveMaker!: (value: any) => void;
    let takerCallAtMs = 0;

    exchange.createOrder
      .mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            resolveMaker = resolve;
          }),
      )
      .mockImplementationOnce(async () => {
        takerCallAtMs = Date.now();

        return { id: 'ex-order-2' };
      });

    const makerPromise = service.placeLimitOrder(
      'hyperliquid',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      'maker-order',
      undefined,
      'maker',
    );

    await Promise.resolve();
    const beforeTaker = Date.now();
    const takerPromise = service.placeLimitOrder(
      'hyperliquid',
      'BTC/USDT',
      'sell',
      '1',
      '101',
      'taker-order',
      { timeInForce: 'IOC' },
      'taker',
    );

    await takerPromise;

    expect(exchange.createOrder).toHaveBeenCalledTimes(2);
    expect(takerCallAtMs - beforeTaker).toBeLessThan(50);

    resolveMaker({ id: 'ex-order-1' });
    await makerPromise;
  });

  it('keeps same-account priority ordering while other-account market reads can proceed independently', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(0),
    );
    const callOrder: string[] = [];
    let resolveFetchOrder!: (value: any) => void;

    exchange.fetchOrder.mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          resolveFetchOrder = resolve;
        }),
    );
    exchange.fetchOrderBook.mockImplementation(async () => {
      callOrder.push('fetchOrderBook');

      return { bids: [], asks: [] };
    });
    exchange.createOrder.mockImplementation(async () => {
      callOrder.push('createOrder');

      return { id: 'ex-order-2' };
    });

    const stateRead = service.fetchOrder(
      'binance',
      'BTC/USDT',
      'ex-order-1',
      'maker',
    );

    await Promise.resolve();
    const otherAccountMarketRead = service.fetchOrderBook(
      'binance',
      'BTC/USDT',
    );
    const sameAccountWrite = service.placeLimitOrder(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
      undefined,
      undefined,
      'maker',
    );

    resolveFetchOrder({ id: 'ex-order-1', status: 'open' });
    await Promise.all([stateRead, otherAccountMarketRead, sameAccountWrite]);

    expect(callOrder).toContain('fetchOrderBook');
    expect(callOrder).toContain('createOrder');
    expect(callOrder.indexOf('createOrder')).toBeLessThan(callOrder.length);
  });

  it('times out a hung request and releases the exchange queue for later work', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(0, 20),
    );

    exchange.createOrder.mockImplementationOnce(
      async () => await new Promise(() => undefined),
    );
    exchange.fetchOrderBook.mockResolvedValueOnce({ bids: [], asks: [] });

    const stuckWrite = service.placeLimitOrder(
      'binance',
      'BTC/USDT',
      'buy',
      '1',
      '100',
    );

    await Promise.resolve();

    const queuedRead = service.fetchOrderBook('binance', 'BTC/USDT');

    await expect(stuckWrite).rejects.toThrow(
      'Exchange request timed out after 20ms',
    );
    await expect(queuedRead).resolves.toEqual({ bids: [], asks: [] });
    expect(exchange.fetchOrderBook).toHaveBeenCalledTimes(1);
  });
});

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
    amountToPrecision: jest.fn((_pair: string, amount: number) => amount.toFixed(4)),
    priceToPrecision: jest.fn((_pair: string, price: number) => price.toFixed(2)),
    markets: {
      'BTC/USDT': {
        limits: { amount: { min: 0.001 }, cost: { min: 10 } },
        precision: { amount: 4, price: 2 },
        maker: 0.001,
      },
    },
  };

  const exchangeInitService = {
    getExchange: jest.fn().mockReturnValue(exchange),
  };

  const createConfigService = (minRequestIntervalMs = 1) =>
    ({
      get: jest.fn((key: string, defaultValue?: number) => {
        if (key === 'strategy.exchange_min_request_interval_ms') {
          return minRequestIntervalMs;
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
    await service.watchBalance('binance');

    expect(exchange.watchOrderBook).toHaveBeenCalledWith('BTC/USDT');
    expect(exchange.watchBalance).toHaveBeenCalled();
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
      costMin: 10,
      makerFee: 0.001,
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
    expect(exchange.amountToPrecision).toHaveBeenCalledWith('BTC/USDT', 0.123456);
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
});

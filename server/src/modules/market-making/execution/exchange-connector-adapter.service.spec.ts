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
    watchOrderBook: jest.fn().mockResolvedValue({ bids: [], asks: [] }),
    watchBalance: jest.fn().mockResolvedValue({ total: {} }),
  };

  const exchangeInitService = {
    getExchange: jest.fn().mockReturnValue(exchange),
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: number) => {
      if (key === 'strategy.exchange_min_request_interval_ms') {
        return 1;
      }

      return defaultValue;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('places and cancels limit orders through adapter', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      configService,
    );

    await service.placeLimitOrder('binance', 'BTC/USDT', 'buy', '1', '100');
    await service.cancelOrder('binance', 'BTC/USDT', 'ex-order-1');

    expect(exchange.createOrder).toHaveBeenCalledWith(
      'BTC/USDT',
      'limit',
      'buy',
      1,
      100,
    );
    expect(exchange.cancelOrder).toHaveBeenCalledWith('ex-order-1', 'BTC/USDT');
  });

  it('fetches order/open-orders/orderbook through adapter', async () => {
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      configService,
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
      configService,
    );

    await service.watchOrderBook('binance', 'BTC/USDT');
    await service.watchBalance('binance');

    expect(exchange.watchOrderBook).toHaveBeenCalledWith('BTC/USDT');
    expect(exchange.watchBalance).toHaveBeenCalled();
  });
});

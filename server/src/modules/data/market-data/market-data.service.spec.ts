/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';

import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from '../../infrastructure/logger/logger.service';
import { MarketdataService } from './market-data.service';

jest.mock('../../infrastructure/logger/logger.service');

const mockCacheManager = () => ({
  get: jest.fn(),
  set: jest.fn(),
});

const mockExchangeInitService = () => ({
  getExchange: jest.fn(),
  getSupportedExchanges: jest.fn(),
});

describe('MarketdataService subscriptions', () => {
  let service: MarketdataService;
  let exchangeInitService: { getExchange: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketdataService,
        { provide: CACHE_MANAGER, useFactory: mockCacheManager },
        { provide: ExchangeInitService, useFactory: mockExchangeInitService },
        CustomLogger,
      ],
    }).compile();

    service = module.get<MarketdataService>(MarketdataService);
    exchangeInitService = module.get(ExchangeInitService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shares a single order book stream across multiple consumers', async () => {
    const watchOrderBook = jest
      .fn()
      .mockResolvedValueOnce({ bids: [[1, 2]], asks: [[3, 4]] });
    const consumerA = jest.fn();
    const consumerB = jest.fn();

    exchangeInitService.getExchange.mockReturnValue({
      watchOrderBook,
      has: { watchOrderBook: true },
    });

    service.subscribeOrderBook('binance', 'BTC/USDT', 'a', consumerA);
    service.subscribeOrderBook('binance', 'BTC/USDT', 'b', consumerB);

    await Promise.resolve();
    service.unsubscribeOrderBook('binance', 'BTC/USDT', 'a');
    service.unsubscribeOrderBook('binance', 'BTC/USDT', 'b');
    await Promise.resolve();

    expect((service as any).orderBookSubscriptionTasks.size).toBe(1);
    expect((service as any).orderBookListeners.size).toBe(0);
    expect(watchOrderBook.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(consumerA).toHaveBeenCalledWith({
      bids: [[1, 2]],
      asks: [[3, 4]],
    });
    expect(consumerB).toHaveBeenCalledWith({
      bids: [[1, 2]],
      asks: [[3, 4]],
    });
  });

  it('uses watchTickers capability for watchTickers subscriptions', async () => {
    const watchTickers = jest
      .fn()
      .mockResolvedValueOnce({ BTCUSDT: { last: 1 } });

    exchangeInitService.getExchange.mockReturnValue({
      watchTickers,
      has: { watchTickers: true },
    });

    const work = service.watchTickers('binance', ['BTC/USDT'], jest.fn());

    service.unsubscribeData('tickers', 'binance', undefined, ['BTC/USDT']);
    await work;

    expect(watchTickers).toHaveBeenCalled();
  });

  it('unsubscribes order book using the full composite key', () => {
    (service as any).activeSubscriptions.set(
      'orderbook:binance:BTC/USDT',
      true,
    );
    (service as any).orderBookListeners.set(
      'orderbook:binance:BTC/USDT',
      new Map([['consumer', jest.fn()]]),
    );

    service.unsubscribeOrderBook('binance', 'BTC/USDT', 'consumer');

    expect(
      (service as any).activeSubscriptions.has('orderbook:binance:BTC/USDT'),
    ).toBe(false);
  });
});

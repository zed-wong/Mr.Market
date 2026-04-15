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

// Mock setup for ccxt
const mockFetchTickers = jest.fn();
const mockFetchOHLCV = jest.fn();

jest.mock('ccxt', () => ({
  pro: {
    binance: jest.fn(() => ({
      fetchTickers: mockFetchTickers,
      fetchOHLCV: mockFetchOHLCV,
      has: { fetchTickers: true, fetchOHLCV: true },
      name: 'binance',
    })),
    mexc: jest.fn(() => ({
      // Mock other exchanges
    })),
    bitfinex: jest.fn(() => ({
      // ...
    })),
    okx: jest.fn(() => ({})),
    gateio: jest.fn(() => ({})),
    lbank: jest.fn(() => ({})),
  },
}));

const mockExchangeInitService = () => ({
  getExchange: jest.fn(),
  getSupportedExchanges: jest.fn(),
});

describe('MarketdataService', () => {
  let service: MarketdataService;
  let cacheManager;
  let exchangeInitService;

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
    cacheManager = module.get(CACHE_MANAGER);
    exchangeInitService = module.get<ExchangeInitService>(ExchangeInitService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTickers', () => {
    it('fetches tickers successfully from a supported exchange', async () => {
      const expectedTickers = { BTCUSD: { last: 50000 } };

      mockFetchTickers.mockResolvedValue(expectedTickers);
      exchangeInitService.getExchange.mockReturnValue({
        fetchTickers: mockFetchTickers,
        has: { fetchTickers: true },
        name: 'binance',
      });

      const tickers = await service.getTickers('binance', ['BTCUSD']);

      expect(tickers).toEqual(expectedTickers);
      expect(mockFetchTickers).toHaveBeenCalledWith(['BTCUSD']);
    });

    it('throws an error when fetchTickers fails', async () => {
      mockFetchTickers.mockRejectedValue(new Error('API call failed'));
      exchangeInitService.getExchange.mockReturnValue({
        fetchTickers: mockFetchTickers,
        has: { fetchTickers: true },
        name: 'binance',
      });

      await expect(service.getTickers('binance', ['BTCUSD'])).rejects.toThrow(
        'API call failed',
      );
    });
  });

  describe('getOHLCVData', () => {
    it('fetches OHLCV data successfully', async () => {
      const expectedOHLCV = [[1609459200000, 29000, 29500, 28500, 29300, 1200]];

      mockFetchOHLCV.mockResolvedValue(expectedOHLCV);
      exchangeInitService.getExchange.mockReturnValue({
        fetchOHLCV: mockFetchOHLCV,
        has: { fetchOHLCV: true },
        name: 'binance',
      });

      const OHLCV = await service.getOHLCVData('binance', 'BTCUSD');

      expect(OHLCV).toEqual(
        expectedOHLCV.map((data) => ({
          timestamp: data[0],
          open: data[1],
          close: data[2],
          high: data[3],
          low: data[4],
          volume: data[5],
        })),
      );
      expect(mockFetchOHLCV).toHaveBeenCalledWith(
        'BTCUSD',
        '1m',
        undefined,
        30,
      );
    });
  });

  describe('getSupportedPairs', () => {
    it('returns supported pairs from cache if available', async () => {
      const cachedPairs = [{ symbol: 'BTCUSD', price: 50000 }];

      cacheManager.get.mockResolvedValue(JSON.stringify(cachedPairs));

      const pairs = await service.getSupportedPairs();

      expect(pairs).toEqual(cachedPairs);
      expect(cacheManager.get).toHaveBeenCalledWith('supported-pairs');
    });
  });

  describe('subscriptions', () => {
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
});

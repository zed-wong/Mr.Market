import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { MarketdataService } from '../../../data/market-data/market-data.service';
import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import { OrderBookTrackerService } from '../../trackers/order-book-tracker.service';
import { StrategyMarketDataProviderService } from './strategy-market-data-provider.service';

describe('StrategyMarketDataProviderService', () => {
  const configService = {
    get: jest.fn().mockReturnValue(0),
  };
  const orderBookTrackerService = {
    getOrderBook: jest.fn(),
    getLastUpdateAt: jest.fn(),
    getMidPriceHistory: jest.fn(),
  };
  const exchangeConnectorAdapterService = {
    fetchOrderBook: jest.fn(),
  };
  const marketdataService = {
    getTickerPrice: jest.fn(),
  };

  let service: StrategyMarketDataProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(undefined);
    orderBookTrackerService.getMidPriceHistory.mockReturnValue([]);
    service = new StrategyMarketDataProviderService(
      configService as any,
      orderBookTrackerService as unknown as OrderBookTrackerService,
      exchangeConnectorAdapterService as unknown as ExchangeConnectorAdapterService,
      marketdataService as unknown as MarketdataService,
    );
  });

  it('prefers tracker order book for reference price', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[102, 1]],
      sequence: 1,
    });

    const result = await service.getReferencePrice(
      'binance',
      'BTC/USDT',
      PriceSourceType.MID_PRICE,
    );

    expect(result).toBe(101);
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
    expect(marketdataService.getTickerPrice).not.toHaveBeenCalled();
  });

  it('falls back to connector order book for reference price', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue(undefined);
    exchangeConnectorAdapterService.fetchOrderBook.mockResolvedValue({
      bids: [[99, 1]],
      asks: [[101, 1]],
    });

    const result = await service.getReferencePrice(
      'binance',
      'BTC/USDT',
      PriceSourceType.MID_PRICE,
    );

    expect(result).toBe(100);
    expect(marketdataService.getTickerPrice).not.toHaveBeenCalled();
  });

  it('accepts uppercase price source values from stored/runtime configs', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue(undefined);
    exchangeConnectorAdapterService.fetchOrderBook.mockResolvedValue({
      bids: [[99, 1]],
      asks: [[101, 1]],
    });

    const result = await service.getReferencePrice(
      'binance',
      'BTC/USDT',
      'MID_PRICE' as unknown as PriceSourceType,
    );

    expect(result).toBe(100);
  });

  it('uses tracked microprice as a reference price source', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 3]],
      asks: [[102, 1]],
      sequence: 1,
    });

    const result = await service.getReferencePrice(
      'binance',
      'BTC/USDT',
      'MICROPRICE' as unknown as PriceSourceType,
    );

    expect(result).toBe(101.5);
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
    expect(marketdataService.getTickerPrice).not.toHaveBeenCalled();
  });

  it('falls back to ticker for reference price when books unavailable', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue(undefined);
    exchangeConnectorAdapterService.fetchOrderBook.mockRejectedValue(
      new Error('connector down'),
    );
    marketdataService.getTickerPrice.mockResolvedValue({ last: 123.45 });

    const result = await service.getReferencePrice(
      'binance',
      'BTC/USDT',
      PriceSourceType.LAST_PRICE,
    );

    expect(result).toBe(123.45);
  });

  it('does not fall back to ticker for mid price when books are unavailable', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue(undefined);
    exchangeConnectorAdapterService.fetchOrderBook.mockResolvedValue({
      bids: [],
      asks: [],
    });
    marketdataService.getTickerPrice.mockResolvedValue({ last: 123.45 });

    await expect(
      service.getReferencePrice(
        'binance',
        'BTC/USDT',
        PriceSourceType.MID_PRICE,
      ),
    ).rejects.toThrow('no usable order book');
    expect(marketdataService.getTickerPrice).not.toHaveBeenCalled();
  });

  it('returns best bid/ask from tracker first', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[30000, 1]],
      asks: [[30001, 1]],
      sequence: 2,
    });

    const result = await service.getBestBidAsk('binance', 'BTC/USDT');

    expect(result).toEqual({ bestBid: 30000, bestAsk: 30001 });
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
  });

  it('returns tracked best bid/ask without connector fallback', () => {
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[30000, 1]],
      asks: [[30001, 1]],
      sequence: 2,
    });

    const result = service.getTrackedBestBidAsk('binance', 'BTC/USDT');

    expect(result).toEqual({ bestBid: 30000, bestAsk: 30001 });
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
  });

  it('returns null when tracked best bid/ask is unavailable', () => {
    orderBookTrackerService.getOrderBook.mockReturnValue(undefined);

    const result = service.getTrackedBestBidAsk('binance', 'BTC/USDT');

    expect(result).toBeNull();
  });

  it('returns tracked reference price snapshot without connector fallback', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[102, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 1000);

    const result = service.getTrackedReferencePriceSnapshot(
      'binance',
      'BTC/USDT',
      PriceSourceType.MID_PRICE,
      5000,
    );

    expect(result).toEqual({
      price: 101,
      sourceType: PriceSourceType.MID_PRICE,
      ageMs: 1000,
    });
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
    expect(marketdataService.getTickerPrice).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('returns null for stale tracked reference price snapshot', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[102, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 6000);

    const result = service.getTrackedReferencePriceSnapshot(
      'binance',
      'BTC/USDT',
      PriceSourceType.MID_PRICE,
      5000,
    );

    expect(result).toBeNull();
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('returns tracked microprice without connector fallback', () => {
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 3]],
      asks: [[102, 1]],
      sequence: 2,
    });

    const result = service.getTrackedMicroprice('binance', 'BTC/USDT');

    expect(result).toBe(101.5);
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
  });

  it('returns tracked order book imbalance by depth', () => {
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [
        [100, 1],
        [99, 1],
      ],
      asks: [
        [102, 1],
        [103, 1],
      ],
      sequence: 2,
    });

    const result = service.getTrackedOrderBookImbalance(
      'binance',
      'BTC/USDT',
      2,
    );

    expect(result).toBeCloseTo(-6 / 404, 10);
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
  });

  it('returns tracked order book depth notional by depth', () => {
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [
        [100, 1],
        [99, 1],
      ],
      asks: [
        [102, 1],
        [103, 1],
      ],
      sequence: 2,
    });

    const result = service.getTrackedOrderBookDepthNotional(
      'binance',
      'BTC/USDT',
      2,
    );

    expect(result).toBe(404);
  });

  it('smooths tracked order book imbalance with EWMA', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 3]],
      asks: [[100, 1]],
      sequence: 1,
    });

    expect(
      service.getSmoothedTrackedOrderBookImbalance(
        'binance',
        'BTC/USDT',
        1,
        1000,
      ),
    ).toBe(0.5);

    jest.spyOn(Date, 'now').mockReturnValue(2000);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[100, 3]],
      sequence: 2,
    });

    const result = service.getSmoothedTrackedOrderBookImbalance(
      'binance',
      'BTC/USDT',
      1,
      1000,
    );

    expect(result).toBeCloseTo(-0.1321205588, 10);

    jest.restoreAllMocks();
  });

  it('returns mid price history from tracker', () => {
    orderBookTrackerService.getMidPriceHistory.mockReturnValue([
      { price: 100, ts: 1000, sequence: 1 },
    ]);

    const result = service.getTrackedMidPriceHistory(
      'binance',
      'BTC/USDT',
      5000,
    );

    expect(result).toEqual([{ price: 100, ts: 1000, sequence: 1 }]);
    expect(orderBookTrackerService.getMidPriceHistory).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      5000,
    );
  });

  it('returns realized volatility from tracked mid price history', () => {
    orderBookTrackerService.getMidPriceHistory.mockReturnValue([
      { price: 100, ts: 1000, sequence: 1 },
      { price: 110, ts: 2000, sequence: 2 },
      { price: 121, ts: 3000, sequence: 3 },
    ]);

    const result = service.getRealizedVolatility('binance', 'BTC/USDT', 5000);

    expect(result).toBeCloseTo(0, 10);
  });

  it('builds an adaptive PMM signal snapshot from tracked data only', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 3]],
      asks: [[102, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 1000);
    orderBookTrackerService.getMidPriceHistory.mockReturnValue([
      { price: 100, ts: now - 2000, sequence: 1 },
      { price: 101, ts: now, sequence: 2 },
    ]);

    const result = service.getAdaptivePmmSignalSnapshot('binance', 'BTC/USDT', {
      priceSourceType: PriceSourceType.MICROPRICE,
      sigmaWindowMs: 5000,
      staleSoftMs: 2000,
      staleHardMs: 10000,
      imbalanceDepthLevels: 1,
      imbalanceMinDepthNotional: 0,
      imbalanceSmoothingMs: 0,
      marketCrashWindowMs: 5000,
      marketCrashBps: 500,
    });

    expect(result.referencePrice?.price).toBe(101.5);
    expect(result.referencePrice?.sourceType).toBe(PriceSourceType.MICROPRICE);
    expect(result.microprice).toBe(101.5);
    expect(result.imbalance).toBeCloseTo(198 / 402, 10);
    expect(result.freshness).toEqual({
      status: 'fresh',
      ageMs: 1000,
      staleSoftMs: 2000,
      staleHardMs: 10000,
    });
    expect(result.crash).toEqual({
      crashed: false,
      changeBps: 100,
      windowMs: 5000,
      thresholdBps: 500,
    });
    expect(result.unavailableReasons).toEqual([]);
    expect(
      exchangeConnectorAdapterService.fetchOrderBook,
    ).not.toHaveBeenCalled();
    expect(marketdataService.getTickerPrice).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('omits imbalance from adaptive PMM snapshot when depth is too thin', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[102, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 1000);

    const result = service.getAdaptivePmmSignalSnapshot('binance', 'BTC/USDT', {
      imbalanceDepthLevels: 1,
      imbalanceMinDepthNotional: 1000,
    });

    expect(result.imbalance).toBeNull();
    expect(result.imbalanceDepthNotional).toBe(202);
    expect(result.unavailableReasons).toContain('insufficient_imbalance_depth');

    jest.restoreAllMocks();
  });

  it('marks adaptive PMM snapshot as soft stale before hard stale', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[102, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 5000);

    const result = service.getAdaptivePmmSignalSnapshot('binance', 'BTC/USDT', {
      staleSoftMs: 2000,
      staleHardMs: 10000,
    });

    expect(result.freshness.status).toBe('soft_stale');
    expect(result.unavailableReasons).toContain('soft_stale_order_book');
    expect(result.unavailableReasons).not.toContain('hard_stale_order_book');

    jest.restoreAllMocks();
  });

  it('marks adaptive PMM snapshot as hard stale at the hard threshold', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[102, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 10000);

    const result = service.getAdaptivePmmSignalSnapshot('binance', 'BTC/USDT', {
      staleSoftMs: 2000,
      staleHardMs: 10000,
    });

    expect(result.freshness.status).toBe('hard_stale');
    expect(result.unavailableReasons).toContain('hard_stale_order_book');

    jest.restoreAllMocks();
  });

  it('marks adaptive PMM snapshot as crashed when mid changes beyond threshold', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[95, 1]],
      asks: [[97, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 1000);
    orderBookTrackerService.getMidPriceHistory.mockReturnValue([
      { price: 100, ts: now - 5000, sequence: 1 },
      { price: 94, ts: now, sequence: 2 },
    ]);

    const result = service.getAdaptivePmmSignalSnapshot('binance', 'BTC/USDT', {
      marketCrashWindowMs: 60000,
      marketCrashBps: 500,
    });

    expect(result.crash).toEqual({
      crashed: true,
      changeBps: -600,
      windowMs: 60000,
      thresholdBps: 500,
    });
    expect(result.unavailableReasons).toContain('market_crash');

    jest.restoreAllMocks();
  });

  it('treats zero market crash threshold as disabled', () => {
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[95, 1]],
      asks: [[97, 1]],
      sequence: 2,
    });
    orderBookTrackerService.getLastUpdateAt.mockReturnValue(now - 1000);
    orderBookTrackerService.getMidPriceHistory.mockReturnValue([
      { price: 100, ts: now - 5000, sequence: 1 },
      { price: 94, ts: now, sequence: 2 },
    ]);

    const result = service.getAdaptivePmmSignalSnapshot('binance', 'BTC/USDT', {
      marketCrashWindowMs: 60000,
      marketCrashBps: 0,
    });

    expect(result.crash).toEqual({
      crashed: false,
      changeBps: null,
      windowMs: 60000,
      thresholdBps: null,
    });
    expect(result.unavailableReasons).not.toContain('market_crash');

    jest.restoreAllMocks();
  });

  it('reports tracked order book readiness from tracked best bid/ask availability', () => {
    orderBookTrackerService.getOrderBook
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({
        bids: [[30000, 1]],
        asks: [[30001, 1]],
        sequence: 2,
      });

    expect(service.hasTrackedOrderBook('binance', 'BTC/USDT')).toBe(false);
    expect(service.hasTrackedOrderBook('binance', 'BTC/USDT')).toBe(true);
  });

  it('loads full order book from connector fallback', async () => {
    orderBookTrackerService.getOrderBook.mockReturnValue(undefined);
    exchangeConnectorAdapterService.fetchOrderBook.mockResolvedValue({
      bids: [
        [10, 1],
        [9, 2],
      ],
      asks: [
        [11, 1],
        [12, 2],
      ],
    });

    const result = await service.getOrderBook('binance', 'BTC/USDT');

    expect(result).toEqual({
      bids: [
        [10, 1],
        [9, 2],
      ],
      asks: [
        [11, 1],
        [12, 2],
      ],
    });
  });
});

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

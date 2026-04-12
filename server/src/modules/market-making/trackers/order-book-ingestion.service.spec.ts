import { MarketdataService } from '../../data/market-data/market-data.service';
import { OrderBookIngestionService } from './order-book-ingestion.service';
import { OrderBookTrackerService } from './order-book-tracker.service';

describe('OrderBookIngestionService', () => {
  it('subscribes once per exchange pair and forwards snapshots to the tracker', () => {
    const marketdataService = {
      subscribeOrderBook: jest.fn(),
      unsubscribeOrderBook: jest.fn(),
    };
    const exchangeConnectorAdapterService = {
      fetchOrderBook: jest.fn().mockResolvedValue({
        bids: [[99, 1]],
        asks: [[101, 2]],
        nonce: 5,
      }),
    };
    const orderBookTrackerService = {
      queueSnapshot: jest.fn(),
      getOrderBook: jest.fn().mockReturnValue(undefined),
    };
    const service = new OrderBookIngestionService(
      marketdataService as unknown as MarketdataService,
      exchangeConnectorAdapterService as any,
      orderBookTrackerService as unknown as OrderBookTrackerService,
    );

    service.ensureSubscribed('binance', 'BTC/USDT');
    service.ensureSubscribed('binance', 'BTC/USDT');

    expect(marketdataService.subscribeOrderBook).toHaveBeenCalledTimes(1);

    const onData = marketdataService.subscribeOrderBook.mock.calls[0][3];

    onData({
      bids: [[100, 1]],
      asks: [[101, 2]],
      nonce: 7,
    });

    expect(orderBookTrackerService.queueSnapshot).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      {
        bids: [[100, 1]],
        asks: [[101, 2]],
        sequence: 7,
      },
    );

    service.releaseSubscription('binance', 'BTC/USDT');
    expect(marketdataService.unsubscribeOrderBook).not.toHaveBeenCalled();

    service.releaseSubscription('binance', 'BTC/USDT');
    expect(marketdataService.unsubscribeOrderBook).toHaveBeenCalledTimes(1);
  });

  it('still forwards unusable streamed books to the tracker queue', () => {
    const marketdataService = {
      subscribeOrderBook: jest.fn(),
      unsubscribeOrderBook: jest.fn(),
    };
    const exchangeConnectorAdapterService = {
      fetchOrderBook: jest.fn().mockResolvedValue({
        bids: [],
        asks: [],
        nonce: 3,
      }),
    };
    const orderBookTrackerService = {
      queueSnapshot: jest.fn(),
      getOrderBook: jest.fn().mockReturnValue(undefined),
    };
    const service = new OrderBookIngestionService(
      marketdataService as unknown as MarketdataService,
      exchangeConnectorAdapterService as any,
      orderBookTrackerService as unknown as OrderBookTrackerService,
    );

    service.ensureSubscribed('mexc', 'XIN/USDT');

    const onData = marketdataService.subscribeOrderBook.mock.calls[0][3];

    onData({
      bids: [],
      asks: [],
      nonce: 9,
    });

    expect(orderBookTrackerService.queueSnapshot).toHaveBeenCalledWith(
      'mexc',
      'XIN/USDT',
      {
        bids: [],
        asks: [],
        sequence: 9,
      },
    );
  });

  it('seeds the tracker from REST before waiting for websocket updates', async () => {
    const marketdataService = {
      subscribeOrderBook: jest.fn(),
      unsubscribeOrderBook: jest.fn(),
    };
    const exchangeConnectorAdapterService = {
      fetchOrderBook: jest.fn().mockResolvedValue({
        bids: [[59.8, 1.2]],
        asks: [[60.1, 0.8]],
        nonce: 11,
      }),
    };
    const orderBookTrackerService = {
      queueSnapshot: jest.fn(),
      getOrderBook: jest.fn().mockReturnValue(undefined),
    };
    const service = new OrderBookIngestionService(
      marketdataService as unknown as MarketdataService,
      exchangeConnectorAdapterService as any,
      orderBookTrackerService as unknown as OrderBookTrackerService,
    );

    service.ensureSubscribed('mexc', 'XIN/USDT');
    await Promise.resolve();
    await Promise.resolve();

    expect(exchangeConnectorAdapterService.fetchOrderBook).toHaveBeenCalledWith(
      'mexc',
      'XIN/USDT',
    );
    expect(orderBookTrackerService.queueSnapshot).toHaveBeenCalledWith(
      'mexc',
      'XIN/USDT',
      {
        bids: [[59.8, 1.2]],
        asks: [[60.1, 0.8]],
        sequence: 11,
      },
    );
  });

  it('skips REST seed when a live book already exists in the tracker', async () => {
    const marketdataService = {
      subscribeOrderBook: jest.fn(),
      unsubscribeOrderBook: jest.fn(),
    };
    const exchangeConnectorAdapterService = {
      fetchOrderBook: jest.fn().mockResolvedValue({
        bids: [[59.8, 1.2]],
        asks: [[60.1, 0.8]],
        nonce: 11,
      }),
    };
    const orderBookTrackerService = {
      queueSnapshot: jest.fn(),
      getOrderBook: jest.fn().mockReturnValue({
        bids: [[60, 1]],
        asks: [[61, 2]],
        sequence: 20,
      }),
    };
    const service = new OrderBookIngestionService(
      marketdataService as unknown as MarketdataService,
      exchangeConnectorAdapterService as any,
      orderBookTrackerService as unknown as OrderBookTrackerService,
    );

    service.ensureSubscribed('mexc', 'XIN/USDT');
    await Promise.resolve();
    await Promise.resolve();

    expect(exchangeConnectorAdapterService.fetchOrderBook).toHaveBeenCalledWith(
      'mexc',
      'XIN/USDT',
    );
    expect(orderBookTrackerService.queueSnapshot).not.toHaveBeenCalled();

    const onData = marketdataService.subscribeOrderBook.mock.calls[0][3];

    onData({
      bids: [[62, 3]],
      asks: [[63, 4]],
      nonce: 30,
    });

    expect(orderBookTrackerService.queueSnapshot).toHaveBeenCalledWith(
      'mexc',
      'XIN/USDT',
      {
        bids: [[62, 3]],
        asks: [[63, 4]],
        sequence: 30,
      },
    );
  });
});

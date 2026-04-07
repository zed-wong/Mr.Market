import { MarketdataService } from '../../data/market-data/market-data.service';
import { OrderBookTrackerService } from './order-book-tracker.service';
import { OrderBookIngestionService } from './order-book-ingestion.service';

describe('OrderBookIngestionService', () => {
  it('subscribes once per exchange pair and forwards snapshots to the tracker', () => {
    const marketdataService = {
      subscribeOrderBook: jest.fn(),
      unsubscribeOrderBook: jest.fn(),
    };
    const orderBookTrackerService = {
      queueSnapshot: jest.fn(),
    };
    const service = new OrderBookIngestionService(
      marketdataService as unknown as MarketdataService,
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
});

import { OrderBookTrackerService } from './order-book-tracker.service';

describe('OrderBookTrackerService', () => {
  it('applies queued snapshots and deltas on tick', async () => {
    const service = new OrderBookTrackerService();

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[100, 1]],
      asks: [[101, 1]],
      sequence: 1,
    });
    service.queueDelta('binance', 'BTC/USDT', {
      bids: [[100, 2]],
      asks: [],
      sequence: 2,
    });

    await service.onTick('2026-02-11T00:00:00.000Z');

    const orderBook = service.getOrderBook('binance', 'BTC/USDT');

    expect(orderBook?.bids[0][0]).toBe(100);
    expect(orderBook?.bids[0][1]).toBe(2);
    expect(orderBook?.asks[0][0]).toBe(101);
  });
});

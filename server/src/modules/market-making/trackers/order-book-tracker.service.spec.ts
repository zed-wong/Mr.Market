import { OrderBookTrackerService } from './order-book-tracker.service';

describe('OrderBookTrackerService', () => {
  it('applies queued snapshots on tick', async () => {
    const service = new OrderBookTrackerService();

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[100, 2]],
      asks: [[101, 1]],
      sequence: 1,
    });

    await service.onTick('2026-02-11T00:00:00.000Z');

    const orderBook = service.getOrderBook('binance', 'BTC/USDT');

    expect(orderBook?.bids[0][0]).toBe(100);
    expect(orderBook?.bids[0][1]).toBe(2);
    expect(orderBook?.asks[0][0]).toBe(101);
  });

  it('applies snapshots immediately without waiting for tick', async () => {
    const service = new OrderBookTrackerService();

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[100, 1]],
      asks: [[101, 1]],
      sequence: 1,
    });

    await new Promise((resolve) => setImmediate(resolve));

    const orderBook = service.getOrderBook('binance', 'BTC/USDT');

    expect(orderBook).toBeDefined();
    expect(orderBook?.bids[0][0]).toBe(100);
    expect(orderBook?.asks[0][0]).toBe(101);
  });

  it('reports staleness when no updates received within threshold', async () => {
    const service = new OrderBookTrackerService();
    const now = 1000000;

    jest.spyOn(Date, 'now').mockReturnValue(now);

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[100, 1]],
      asks: [[101, 1]],
      sequence: 1,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(service.isStale('binance', 'BTC/USDT', 5000)).toBe(false);

    jest.spyOn(Date, 'now').mockReturnValue(now + 6000);

    expect(service.isStale('binance', 'BTC/USDT', 5000)).toBe(true);

    jest.restoreAllMocks();
  });

  it('rejects crossed books where best bid >= best ask', async () => {
    const service = new OrderBookTrackerService();

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[101, 1]],
      asks: [[100, 1]],
      sequence: 1,
    });

    await new Promise((resolve) => setImmediate(resolve));

    const orderBook = service.getOrderBook('binance', 'BTC/USDT');

    expect(orderBook).toBeUndefined();
  });

  it('preserves existing valid book when new snapshot is crossed', async () => {
    const service = new OrderBookTrackerService();

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[100, 1]],
      asks: [[101, 1]],
      sequence: 1,
    });

    await new Promise((resolve) => setImmediate(resolve));

    const validBook = service.getOrderBook('binance', 'BTC/USDT');
    expect(validBook).toBeDefined();
    expect(validBook?.bids[0][0]).toBe(100);

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[105, 1]],
      asks: [[100, 1]],
      sequence: 2,
    });

    await new Promise((resolve) => setImmediate(resolve));

    const afterCrossed = service.getOrderBook('binance', 'BTC/USDT');
    expect(afterCrossed?.bids[0][0]).toBe(100);
    expect(afterCrossed?.asks[0][0]).toBe(101);
    expect(afterCrossed?.sequence).toBe(1);
  });

  it('returns lastUpdateAt after a valid snapshot is applied', async () => {
    const service = new OrderBookTrackerService();
    const now = 1234567890;

    jest.spyOn(Date, 'now').mockReturnValue(now);

    expect(service.getLastUpdateAt('binance', 'BTC/USDT')).toBeUndefined();

    service.queueSnapshot('binance', 'BTC/USDT', {
      bids: [[100, 1]],
      asks: [[101, 1]],
      sequence: 1,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(service.getLastUpdateAt('binance', 'BTC/USDT')).toBe(now);

    jest.restoreAllMocks();
  });

  it('queueDelta is a no-op', async () => {
    const service = new OrderBookTrackerService();

    service.queueDelta('binance', 'BTC/USDT', {
      bids: [[100, 2]],
      asks: [],
      sequence: 2,
    });

    await new Promise((resolve) => setImmediate(resolve));

    const orderBook = service.getOrderBook('binance', 'BTC/USDT');
    expect(orderBook).toBeUndefined();
  });
});

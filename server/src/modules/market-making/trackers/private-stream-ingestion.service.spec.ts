import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

import { PrivateStreamIngestionService } from './private-stream-ingestion.service';
import { PrivateStreamTrackerService } from './private-stream-tracker.service';

describe('PrivateStreamIngestionService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queues order updates from watchOrders into the private stream tracker', async () => {
    const queueAccountEvent = jest.fn();
    const watchOrders = jest.fn().mockResolvedValue([
      {
        id: 'exchange-order-1',
        clientOrderId: 'client-1',
        status: 'closed',
        symbol: 'BTC/USDT',
      },
    ]);
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue({
        watchOrders,
      }),
    } as unknown as ExchangeInitService;
    const privateStreamTrackerService = {
      queueAccountEvent,
    } as unknown as PrivateStreamTrackerService;
    const service = new PrivateStreamIngestionService(
      exchangeInitService,
      privateStreamTrackerService,
    );

    service.startOrderWatcher({
      exchange: 'binance',
      accountLabel: 'default',
      symbol: 'BTC/USDT',
    });

    await waitFor(() => queueAccountEvent.mock.calls.length === 1);
    service.stopAllWatchers();

    expect(watchOrders).toHaveBeenCalledWith(
      'BTC/USDT',
      undefined,
      undefined,
      undefined,
    );
    expect(queueAccountEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'binance',
        accountLabel: 'default',
        eventType: 'watch_orders',
        payload: expect.objectContaining({
          id: 'exchange-order-1',
          clientOrderId: 'client-1',
          status: 'closed',
          symbol: 'BTC/USDT',
        }),
      }),
    );
  });

  it('stops watching when the exchange does not support watchOrders', async () => {
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue({}),
    } as unknown as ExchangeInitService;
    const privateStreamTrackerService = {
      queueAccountEvent: jest.fn(),
    } as unknown as PrivateStreamTrackerService;
    const service = new PrivateStreamIngestionService(
      exchangeInitService,
      privateStreamTrackerService,
    );

    service.startOrderWatcher({
      exchange: 'binance',
      accountLabel: 'default',
    });

    await waitFor(
      () =>
        service.isWatching({
          exchange: 'binance',
          accountLabel: 'default',
        }) === false,
    );
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for condition');
}

import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { UserStreamNormalizerRegistryService } from '../user-stream';
import { UserStreamIngestionService } from './user-stream-ingestion.service';
import { UserStreamTrackerService } from './user-stream-tracker.service';

type SleepSpyTarget = {
  sleep(ms: number): Promise<void>;
};

describe('UserStreamIngestionService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queues one account event per order when watchOrders returns an array', async () => {
    const queueAccountEvent = jest.fn();
    const watchOrders = jest.fn().mockImplementation(async () => {
      service.stopAllWatchers();

      return [
        { id: 'ex-1', clientOrderId: 'client-1', status: 'open' },
        { id: 'ex-2', clientOrderId: 'client-2', status: 'closed' },
        { id: 'ex-3', clientOrderId: 'client-3', status: 'filled' },
      ];
    });
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue({ watchOrders }),
    } as unknown as ExchangeInitService;

    const service = new UserStreamIngestionService(exchangeInitService, {
      queueAccountEvent,
    } as unknown as UserStreamTrackerService, {
      getNormalizer: jest.fn().mockReturnValue({
        normalizeOrder: jest
          .fn()
          .mockImplementation(
            (
              exchange: string,
              accountLabel: string,
              rawPayload: Record<string, unknown>,
              receivedAt: string,
            ) => ({
              exchange,
              accountLabel,
              kind: 'order',
              payload: {
                exchangeOrderId: rawPayload.id,
                clientOrderId: rawPayload.clientOrderId,
                raw: rawPayload,
              },
              receivedAt,
            }),
          ),
      }),
    } as unknown as UserStreamNormalizerRegistryService);

    service.startOrderWatcher({
      exchange: 'binance',
      accountLabel: 'default',
      symbol: 'BTC/USDT',
    });

    await waitFor(() => queueAccountEvent.mock.calls.length === 3);

    expect(
      queueAccountEvent.mock.calls.map(
        ([event]) => event.payload.exchangeOrderId,
      ),
    ).toEqual(['ex-1', 'ex-2', 'ex-3']);
  });

  it('queues a single account event when watchOrders returns one order object', async () => {
    const queueAccountEvent = jest.fn();
    const watchOrders = jest.fn().mockImplementation(async () => {
      service.stopAllWatchers();

      return {
        id: 'ex-1',
        clientOrderId: 'client-1',
        status: 'filled',
      };
    });

    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchOrders }),
      } as unknown as ExchangeInitService,
      { queueAccountEvent } as unknown as UserStreamTrackerService,
      {
        getNormalizer: jest.fn().mockReturnValue({
          normalizeOrder: jest
            .fn()
            .mockImplementation(
              (
                exchange: string,
                accountLabel: string,
                rawPayload: Record<string, unknown>,
                receivedAt: string,
              ) => ({
                exchange,
                accountLabel,
                kind: 'order',
                payload: {
                  exchangeOrderId: rawPayload.id,
                  clientOrderId: rawPayload.clientOrderId,
                  raw: rawPayload,
                },
                receivedAt,
              }),
            ),
        }),
      } as unknown as UserStreamNormalizerRegistryService,
    );

    service.startOrderWatcher({
      exchange: 'binance',
      accountLabel: 'default',
      symbol: 'BTC/USDT',
    });

    await waitFor(() => queueAccountEvent.mock.calls.length === 1);
    expect(queueAccountEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'order',
        payload: expect.objectContaining({
          exchangeOrderId: 'ex-1',
          clientOrderId: 'client-1',
          raw: expect.objectContaining({
            id: 'ex-1',
            clientOrderId: 'client-1',
          }),
        }),
      }),
    );
  });

  it('queues trade events when watchMyTrades returns fills', async () => {
    const queueAccountEvent = jest.fn();
    const watchMyTrades = jest.fn().mockImplementation(async () => {
      service.stopAllWatchers();

      return [
        {
          id: 'trade-1',
          orderId: 'ex-1',
          clientOrderId: 'client-1',
          amount: '0.5',
          price: '100',
          side: 'buy',
        },
      ];
    });
    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchMyTrades }),
      } as unknown as ExchangeInitService,
      { queueAccountEvent } as unknown as UserStreamTrackerService,
      {
        getNormalizer: jest.fn().mockReturnValue({
          normalizeTrade: jest
            .fn()
            .mockImplementation(
              (
                exchange: string,
                accountLabel: string,
                rawPayload: Record<string, unknown>,
                receivedAt: string,
              ) => ({
                exchange,
                accountLabel,
                kind: 'trade',
                payload: {
                  exchangeOrderId: rawPayload.orderId,
                  clientOrderId: rawPayload.clientOrderId,
                  fillId: rawPayload.id,
                  qty: rawPayload.amount,
                  raw: rawPayload,
                },
                receivedAt,
              }),
            ),
        }),
      } as unknown as UserStreamNormalizerRegistryService,
    );

    service.startTradeWatcher({
      exchange: 'binance',
      accountLabel: 'default',
      symbol: 'BTC/USDT',
    });

    await waitFor(() => queueAccountEvent.mock.calls.length === 1);
    expect(queueAccountEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'trade',
        payload: expect.objectContaining({
          exchangeOrderId: 'ex-1',
          clientOrderId: 'client-1',
          fillId: 'trade-1',
          qty: '0.5',
        }),
      }),
    );
  });

  it('queues balance events when watchBalance returns account balances', async () => {
    const queueAccountEvent = jest.fn();
    const watchBalance = jest.fn().mockImplementation(async () => {
      service.stopAllWatchers();

      return {
        free: { BTC: 1, USDT: 100 },
        used: { BTC: 0.1 },
      };
    });
    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchBalance }),
      } as unknown as ExchangeInitService,
      { queueAccountEvent } as unknown as UserStreamTrackerService,
      {
        getNormalizer: jest.fn().mockReturnValue({
          normalizeBalance: jest.fn().mockReturnValue([
            {
              exchange: 'binance',
              accountLabel: 'maker',
              kind: 'balance',
              payload: {
                asset: 'BTC',
                free: '1',
                used: '0.1',
                source: 'ws',
              },
              receivedAt: '2026-04-14T00:00:00.000Z',
            },
            {
              exchange: 'binance',
              accountLabel: 'maker',
              kind: 'balance',
              payload: {
                asset: 'USDT',
                free: '100',
                source: 'ws',
              },
              receivedAt: '2026-04-14T00:00:00.000Z',
            },
          ]),
        }),
      } as unknown as UserStreamNormalizerRegistryService,
    );

    service.startBalanceWatcher({
      exchange: 'binance',
      accountLabel: 'maker',
    });

    await waitFor(() => queueAccountEvent.mock.calls.length === 2);
    expect(
      queueAccountEvent.mock.calls.map(([event]) => event.kind),
    ).toEqual(['balance', 'balance']);
    expect(queueAccountEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountLabel: 'maker',
        payload: expect.objectContaining({
          asset: 'BTC',
          free: '1',
          used: '0.1',
          source: 'ws',
        }),
      }),
    );
  });

  it.each([null, undefined, 123])(
    'skips queueing when watchOrders returns %p',
    async (value) => {
      const queueAccountEvent = jest.fn();
      const watchOrders = jest.fn().mockImplementation(async () => {
        service.stopAllWatchers();

        return value;
      });

      const service = new UserStreamIngestionService(
        {
          getExchange: jest.fn().mockReturnValue({ watchOrders }),
        } as unknown as ExchangeInitService,
        { queueAccountEvent } as unknown as UserStreamTrackerService,
      );

      service.startOrderWatcher({
        exchange: 'binance',
        accountLabel: 'default',
      });

      await waitFor(() => !service.isWatching({ exchange: 'binance' }));
      expect(queueAccountEvent).not.toHaveBeenCalled();
    },
  );

  it('stops watching and warns when the exchange does not support watchOrders', async () => {
    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({}),
      } as unknown as ExchangeInitService,
      {
        queueAccountEvent: jest.fn(),
      } as unknown as UserStreamTrackerService,
    );
    const logger = Reflect.get(service, 'logger') as CustomLogger;
    const warnSpy = jest
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);

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

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('retries immediately after the first watchOrders failure', async () => {
    const queueAccountEvent = jest.fn();
    const sleepSpy = jest
      .spyOn(
        UserStreamIngestionService.prototype as unknown as SleepSpyTarget,
        'sleep',
      )
      .mockResolvedValue(undefined);
    const watchOrders = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(async () => {
        service.stopAllWatchers();

        return [{ id: 'ex-1', status: 'filled' }];
      });

    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchOrders }),
      } as unknown as ExchangeInitService,
      { queueAccountEvent } as unknown as UserStreamTrackerService,
    );

    service.startOrderWatcher({ exchange: 'binance', accountLabel: 'default' });

    await waitFor(() => watchOrders.mock.calls.length === 2);

    expect(sleepSpy).not.toHaveBeenCalled();
    expect(queueAccountEvent).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff after consecutive failures', async () => {
    const sleepSpy = jest
      .spyOn(
        UserStreamIngestionService.prototype as unknown as SleepSpyTarget,
        'sleep',
      )
      .mockResolvedValue(undefined);
    const watchOrders = jest
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockRejectedValueOnce(new Error('e4'))
      .mockImplementationOnce(async () => {
        service.stopAllWatchers();

        return [];
      });

    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchOrders }),
      } as unknown as ExchangeInitService,
      {
        queueAccountEvent: jest.fn(),
      } as unknown as UserStreamTrackerService,
    );

    service.startOrderWatcher({ exchange: 'binance', accountLabel: 'default' });

    await waitFor(() => watchOrders.mock.calls.length === 5);

    expect(sleepSpy.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
  });

  it('resets backoff to immediate after a successful watchOrders call', async () => {
    const sleepSpy = jest
      .spyOn(
        UserStreamIngestionService.prototype as unknown as SleepSpyTarget,
        'sleep',
      )
      .mockResolvedValue(undefined);
    const watchOrders = jest
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockResolvedValueOnce([{ id: 'filled-1', status: 'filled' }])
      .mockRejectedValueOnce(new Error('e4'))
      .mockImplementationOnce(async () => {
        service.stopAllWatchers();

        return [];
      });

    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchOrders }),
      } as unknown as ExchangeInitService,
      {
        queueAccountEvent: jest.fn(),
      } as unknown as UserStreamTrackerService,
    );

    service.startOrderWatcher({ exchange: 'binance', accountLabel: 'default' });

    await waitFor(() => watchOrders.mock.calls.length === 6);

    expect(sleepSpy.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it('caps backoff at 30 seconds', async () => {
    const sleepSpy = jest
      .spyOn(
        UserStreamIngestionService.prototype as unknown as SleepSpyTarget,
        'sleep',
      )
      .mockResolvedValue(undefined);
    const watchOrders = jest.fn();

    for (let index = 0; index < 10; index += 1) {
      watchOrders.mockRejectedValueOnce(new Error(`e${index}`));
    }

    watchOrders.mockImplementationOnce(async () => {
      service.stopAllWatchers();

      return [];
    });

    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchOrders }),
      } as unknown as ExchangeInitService,
      {
        queueAccountEvent: jest.fn(),
      } as unknown as UserStreamTrackerService,
    );

    service.startOrderWatcher({ exchange: 'binance', accountLabel: 'default' });

    await waitFor(() => watchOrders.mock.calls.length === 11);

    expect(sleepSpy.mock.calls.map(([ms]) => ms)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000,
    ]);
  });

  it('shares one watcher across multiple sessions on the same account', async () => {
    const pending = createDeferred<unknown>();
    const watchOrders = jest.fn().mockReturnValue(pending.promise);
    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchOrders }),
      } as unknown as ExchangeInitService,
      {
        queueAccountEvent: jest.fn(),
      } as unknown as UserStreamTrackerService,
    );
    const params = {
      exchange: 'binance',
      accountLabel: 'default',
      symbol: 'BTC/USDT',
    };

    service.startOrderWatcher(params);
    await waitFor(() => watchOrders.mock.calls.length === 1);

    service.startOrderWatcher(params);

    expect(watchOrders).toHaveBeenCalledTimes(1);
    expect(service.getWatcherRefCount(params)).toBe(2);
    expect(service.getActiveWatcherCount()).toBe(1);

    service.stopAllWatchers();
    pending.resolve([]);
  });

  it('keeps the watcher alive until the last shared session stops', async () => {
    const pending = createDeferred<unknown>();
    const watchOrders = jest.fn().mockReturnValue(pending.promise);
    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn().mockReturnValue({ watchOrders }),
      } as unknown as ExchangeInitService,
      {
        queueAccountEvent: jest.fn(),
      } as unknown as UserStreamTrackerService,
    );
    const params = {
      exchange: 'binance',
      accountLabel: 'default',
      symbol: 'BTC/USDT',
    };

    service.startOrderWatcher(params);
    await waitFor(() => watchOrders.mock.calls.length === 1);
    service.startOrderWatcher(params);

    service.stopOrderWatcher(params);
    expect(service.isWatching(params)).toBe(true);
    expect(service.getWatcherRefCount(params)).toBe(1);

    service.stopOrderWatcher(params);
    expect(service.isWatching(params)).toBe(false);
    expect(service.getWatcherRefCount(params)).toBe(0);

    pending.resolve([]);
  });

  it('creates separate watchers for different accounts', async () => {
    const firstPending = createDeferred<unknown>();
    const secondPending = createDeferred<unknown>();
    const watchOrdersDefault = jest.fn().mockReturnValue(firstPending.promise);
    const watchOrdersSecond = jest.fn().mockReturnValue(secondPending.promise);
    const service = new UserStreamIngestionService(
      {
        getExchange: jest.fn((_exchange: string, accountLabel?: string) =>
          accountLabel === 'account2'
            ? { watchOrders: watchOrdersSecond }
            : { watchOrders: watchOrdersDefault },
        ),
      } as unknown as ExchangeInitService,
      {
        queueAccountEvent: jest.fn(),
      } as unknown as UserStreamTrackerService,
    );

    service.startOrderWatcher({
      exchange: 'binance',
      accountLabel: 'default',
      symbol: 'BTC/USDT',
    });
    service.startOrderWatcher({
      exchange: 'binance',
      accountLabel: 'account2',
      symbol: 'BTC/USDT',
    });

    await waitFor(
      () =>
        watchOrdersDefault.mock.calls.length === 1 &&
        watchOrdersSecond.mock.calls.length === 1,
    );

    expect(service.getActiveWatcherCount()).toBe(2);

    service.stopAllWatchers();
    firstPending.resolve([]);
    secondPending.resolve([]);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

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

import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';

import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';
import {
  getSystemSandboxSkipReason,
  readSystemSandboxConfig,
} from '../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';

type WatchOrdersCapableExchange = {
  watchOrders?: (...args: unknown[]) => Promise<unknown>;
};

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const skipReason = envSkipReason;
const log = createSystemTestLogger('private-fill-reconnect');

if (skipReason) {
  logSystemSkip('private fill reconnect suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Private stream reconnect parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('recovers from one watchOrders failure and still routes the next recovered event through the runtime surface', async () => {
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
    });
    const { order, strategyKey } = fixture;
    const onFill = jest.fn();

    await helper.startOrder(order.orderId, order.userId);
    await helper.runSingleTick(order.orderId);

    const trackedOrder = helper
      .getOpenTrackedOrders(strategyKey)
      .find((candidate) => candidate.side === 'buy');

    expect(trackedOrder).toBeDefined();

    const executor = helper.getExecutor(order.exchangeName, order.pair);

    executor?.configure({
      onFill: async (_session, fill) => {
        onFill(fill);
      },
    });

    const exchangeInitService = helper.getModuleRef().get(ExchangeInitService);
    const exchange = exchangeInitService.getExchange(
      order.exchangeName,
      config!.accountLabel,
    ) as unknown as WatchOrdersCapableExchange;

    const originalWatchOrders = exchange.watchOrders?.bind(exchange);
    const recoveredEvent = {
      id: trackedOrder?.exchangeOrderId,
      clientOrderId: trackedOrder?.clientOrderId,
      symbol: order.pair,
      side: trackedOrder?.side,
      price: trackedOrder?.price,
      filled: trackedOrder?.qty,
      amount: trackedOrder?.qty,
      status: 'closed',
    };
    let watchCallCount = 0;

    exchange.watchOrders = jest.fn(async (...args: unknown[]) => {
      watchCallCount += 1;

      if (watchCallCount === 1) {
        throw new Error('simulated watchOrders disconnect');
      }

      helper.getPrivateStreamIngestionService().stopAllWatchers();

      if (watchCallCount === 2) {
        return [recoveredEvent];
      }

      return await originalWatchOrders?.(...(args as []));
    });

    try {
      helper.getPrivateStreamIngestionService().stopAllWatchers();
      helper.getPrivateStreamIngestionService().startOrderWatcher({
        exchange: order.exchangeName,
        accountLabel: config!.accountLabel,
        symbol: order.pair,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await helper.flushPrivateStreamEvents();

      log.result('reconnect path observed', {
        watchCallCount,
        onFillCallCount: onFill.mock.calls.length,
      });

      expect(watchCallCount).toBeGreaterThanOrEqual(2);
      expect(onFill).toHaveBeenCalledWith(
        expect.objectContaining({
          exchangeOrderId: trackedOrder?.exchangeOrderId,
        }),
      );
    } finally {
      if (originalWatchOrders) {
        exchange.watchOrders = originalWatchOrders;
      }
      helper.getPrivateStreamIngestionService().stopAllWatchers();
    }
  });
});

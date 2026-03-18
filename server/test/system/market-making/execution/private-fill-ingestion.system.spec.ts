import { pollUntil } from '../../helpers/sandbox-system.helper';
import {
  getSystemSandboxSkipReason,
  readSystemSandboxConfig,
} from '../../helpers/sandbox-system.helper';
import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const skipReason = envSkipReason;

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(
    `[system] Skipping private-fill ingestion suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Private fill ingestion parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
  });

  afterAll(async () => {
    await helper?.close();
  });

  it('starts a real watchOrders loop, routes a deterministic private-stream fill to the pooled executor, and stops the watcher on stop_mm', async () => {
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
    });
    const { order, strategyKey } = fixture;
    const onFill = jest.fn();

    await helper.startOrder(order.orderId, order.userId);

    await pollUntil(
      async () => helper.getPrivateStreamIngestionService().isWatching({
        exchange: order.exchangeName,
        accountLabel: config!.accountLabel,
        symbol: order.pair,
      }),
      async (isWatching) => isWatching === true,
      {
        description: 'private order watcher to start',
        intervalMs: 250,
      },
    );

    const executor = helper.getExecutor(order.exchangeName, order.pair);

    expect(executor).toBeDefined();

    executor?.configure({
      onFill: async (_session, fill) => {
        onFill(fill);
      },
    });

    await helper.runSingleTick(order.orderId);

    const trackedOrder = helper
      .getOpenTrackedOrders(strategyKey)
      .find((candidate) => candidate.side === 'buy');

    expect(trackedOrder).toBeDefined();

    helper.getPrivateStreamTrackerService().queueAccountEvent({
      exchange: order.exchangeName,
      accountLabel: config!.accountLabel,
      eventType: 'watch_orders',
      payload: {
        id: trackedOrder?.exchangeOrderId,
        clientOrderId: trackedOrder?.clientOrderId,
        symbol: order.pair,
        side: trackedOrder?.side,
        price: trackedOrder?.price,
        filled: trackedOrder?.qty,
        amount: trackedOrder?.qty,
        status: 'closed',
      },
      receivedAt: new Date().toISOString(),
    });

    await pollUntil(
      async () => {
        await helper.flushPrivateStreamEvents();
        return onFill.mock.calls.length;
      },
      async (callCount) => callCount > 0,
      {
        description: 'live private-stream fill to route to the executor',
        intervalMs: 1000,
        timeoutMs: 60000,
      },
    );

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: trackedOrder?.exchangeOrderId,
      }),
    );

    await helper.stopOrder(order.orderId, order.userId);

    await pollUntil(
      async () => helper.getPrivateStreamIngestionService().isWatching({
        exchange: order.exchangeName,
        accountLabel: config!.accountLabel,
        symbol: order.pair,
      }),
      async (isWatching) => isWatching === false,
      {
        description: 'private order watcher to stop',
        intervalMs: 250,
      },
    );
  });
});

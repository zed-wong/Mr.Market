import BigNumber from 'bignumber.js';

import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';
import { pollUntil } from '../../helpers/sandbox-system.helper';
import {
  getSystemSandboxSkipReason,
  readSystemSandboxConfig,
} from '../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const skipReason = envSkipReason;
const log = createSystemTestLogger('private-partial-fill-ingestion');

if (skipReason) {
  logSystemSkip('private partial-fill ingestion suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Private partial-fill ingestion parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
    log.suite('helper ready', {
      exchangeId: config?.exchangeId,
      accountLabel: config?.accountLabel,
    });
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('routes a deterministic partially_filled private-stream event and updates the tracked order status', async () => {
    log.step('creating partial-fill fixture');
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
    });
    const { order, strategyKey } = fixture;
    const onFill = jest.fn();

    log.result('fixture created', {
      orderId: order.orderId,
      pair: order.pair,
      exchangeName: order.exchangeName,
    });

    log.step('starting order');
    await helper.startOrder(order.orderId, order.userId);

    log.step('waiting for watchOrders subscription');
    await pollUntil(
      async () =>
        helper.getUserStreamIngestionService().isWatching({
          exchange: order.exchangeName,
          accountLabel: config!.accountLabel,
          symbol: order.pair,
        }),
      async (isWatching) => isWatching === true,
      {
        description: 'private order watcher to start for partial-fill test',
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

    log.step('running single tick to create tracked orders');
    await helper.runSingleTick(order.orderId);

    const trackedOrder = helper
      .getOpenTrackedOrders(strategyKey)
      .find((candidate) => candidate.side === 'buy');

    expect(trackedOrder).toBeDefined();

    const partialQty = new BigNumber(trackedOrder!.qty).dividedBy(2).toFixed();

    log.result('tracked order selected', {
      exchangeOrderId: trackedOrder?.exchangeOrderId,
      clientOrderId: trackedOrder?.clientOrderId,
      side: trackedOrder?.side,
      qty: trackedOrder?.qty,
      partialQty,
    });

    log.step('queueing deterministic partially_filled private-stream event');
    helper.getUserStreamTrackerService().queueAccountEvent({
      exchange: order.exchangeName,
      accountLabel: config!.accountLabel,
      kind: 'order',
      payload: {
        exchangeOrderId: trackedOrder?.exchangeOrderId,
        clientOrderId: trackedOrder?.clientOrderId,
        pair: order.pair,
        side: trackedOrder?.side,
        price: trackedOrder?.price,
        cumulativeQty: partialQty,
        status: 'partially_filled',
        raw: {},
      },
      receivedAt: new Date().toISOString(),
    });

    log.step(
      'flushing private-stream events until executor receives partial fill',
    );
    await pollUntil(
      async () => {
        await helper.flushPrivateStreamEvents();

        return onFill.mock.calls.length;
      },
      async (callCount) => callCount > 0,
      {
        description:
          'deterministic partial-fill event to route to the executor',
        intervalMs: 250,
        timeoutMs: 30000,
      },
    );

    const updatedTrackedOrder = await pollUntil(
      async () =>
        helper.getTrackedOrder(
          order.exchangeName,
          trackedOrder!.exchangeOrderId,
        ),
      async (candidate) => candidate?.status === 'partially_filled',
      {
        description: 'tracked order to reflect partially_filled status',
        intervalMs: 250,
        timeoutMs: 30000,
      },
    );

    log.result('partial fill routed', {
      callbackCount: onFill.mock.calls.length,
      trackedStatus: updatedTrackedOrder?.status,
      trackedQty: updatedTrackedOrder?.qty,
    });

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: trackedOrder?.exchangeOrderId,
        clientOrderId: trackedOrder?.clientOrderId,
        qty: partialQty,
      }),
    );
    expect(updatedTrackedOrder).toEqual(
      expect.objectContaining({
        exchangeOrderId: trackedOrder?.exchangeOrderId,
        status: 'partially_filled',
      }),
    );

    log.step('stopping partial-fill fixture order');
    await helper.stopOrder(order.orderId, order.userId);
  });
});

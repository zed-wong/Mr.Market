import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';
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
const log = createSystemTestLogger('clock-tick-single-cycle');

if (skipReason) {
  logSystemSkip('clock tick single-cycle suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Clock tick coordinator parity (system)', () => {
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

  it('runs one full coordinator tick through the registered production components and generates intents', async () => {
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
    });
    const { order } = fixture;

    log.step('starting order');
    await helper.startOrder(order.orderId, order.userId);

    log.step('queueing tracked order book snapshot for coordinator path');
    helper
      .getOrderBookTrackerService()
      .queueSnapshot(order.exchangeName, order.pair, {
        bids: [[100, 1]],
        asks: [[101, 1]],
        sequence: 1,
      });

    log.step('running coordinator tick');
    await helper.runCoordinatorTick();

    const intents = await helper.listStrategyIntents(order.orderId);
    const trackedBook = helper
      .getOrderBookTrackerService()
      .getOrderBook(order.exchangeName, order.pair);

    log.result('coordinator tick completed', {
      orderId: order.orderId,
      intentCount: intents.length,
      trackedSequence: trackedBook?.sequence,
    });

    expect(trackedBook).toMatchObject({ sequence: 1 });
    expect(intents).toHaveLength(2);
  });

  it('stops on the first thrown component error under the current coordinator contract', async () => {
    const coordinator = helper.getClockTickCoordinatorService();
    const executionOrder: string[] = [];

    coordinator.register(
      'test-failing-component',
      {
        start: async () => undefined,
        stop: async () => undefined,
        health: async () => true,
        onTick: async () => {
          executionOrder.push('failing');
          throw new Error('boom');
        },
      },
      9990,
    );
    coordinator.register(
      'test-after-failure-component',
      {
        start: async () => undefined,
        stop: async () => undefined,
        health: async () => true,
        onTick: async () => {
          executionOrder.push('after-failure');
        },
      },
      9991,
    );

    try {
      await expect(helper.runCoordinatorTick()).rejects.toThrow('boom');

      log.result('coordinator failure path observed', {
        executionOrder,
      });

      expect(executionOrder).toEqual(['failing']);
    } finally {
      coordinator.unregister('test-failing-component');
      coordinator.unregister('test-after-failure-component');
    }
  });
});

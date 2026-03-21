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
const log = createSystemTestLogger('pure-mm-single-tick');

if (skipReason) {
  logSystemSkip('pure market-making single tick suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Pure market making single tick parity (system)', () => {
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

  it('runs one real executor tick and persists the resulting sandbox orders', async () => {
    log.step('creating persisted order fixture');
    const fixture = await helper.createPersistedPureMarketMakingOrder();
    const { order, strategyKey } = fixture;

    log.result('fixture created', {
      orderId: order.orderId,
      pair: order.pair,
      exchangeName: order.exchangeName,
    });

    log.step('starting order');
    await helper.startOrder(order.orderId, order.userId);
    log.step('running single executor tick');
    await helper.runSingleTick(order.orderId);

    const intents = await helper.listStrategyIntents(order.orderId);
    const mappings = await helper.listOrderMappings(order.orderId);
    const history = await helper.listExecutionHistory(order.orderId);
    const trackedOrders = helper.getOpenTrackedOrders(strategyKey);

    log.result('tick artifacts collected', {
      intentCount: intents.length,
      mappingCount: mappings.length,
      historyCount: history.length,
      trackedOrderCount: trackedOrders.length,
    });

    expect(intents).toHaveLength(2);
    expect(intents.map((intent) => intent.side).sort()).toEqual([
      'buy',
      'sell',
    ]);
    expect(intents.every((intent) => intent.status === 'DONE')).toBe(true);

    expect(mappings).toHaveLength(2);
    expect(mappings.every((mapping) => mapping.orderId === order.orderId)).toBe(
      true,
    );

    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.side).sort()).toEqual(['buy', 'sell']);

    expect(trackedOrders).toHaveLength(2);
    expect(
      trackedOrders.map((trackedOrder) => trackedOrder.side).sort(),
    ).toEqual(['buy', 'sell']);
    expect(
      trackedOrders.every((trackedOrder) => trackedOrder.status === 'open'),
    ).toBe(true);

    for (const mapping of mappings) {
      log.check('fetching persisted exchange order', {
        exchangeOrderId: mapping.exchangeOrderId,
      });
      const exchangeOrder = await helper.fetchExchangeOrder(
        mapping.exchangeOrderId,
        order.pair,
      );

      expect(String(exchangeOrder?.id || '')).toBe(mapping.exchangeOrderId);
    }
  });
});

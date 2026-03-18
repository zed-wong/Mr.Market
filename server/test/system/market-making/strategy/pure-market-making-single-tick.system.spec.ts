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
    `[system] Skipping pure market-making single tick suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Pure market making single tick parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
  });

  afterAll(async () => {
    await helper?.close();
  });

  it('runs one real executor tick and persists the resulting sandbox orders', async () => {
    const fixture = await helper.createPersistedPureMarketMakingOrder();
    const { order, strategyKey } = fixture;

    await helper.startOrder(order.orderId, order.userId);
    await helper.runSingleTick(order.orderId);

    const intents = await helper.listStrategyIntents(order.orderId);
    const mappings = await helper.listOrderMappings(order.orderId);
    const history = await helper.listExecutionHistory(order.orderId);
    const trackedOrders = helper.getOpenTrackedOrders(strategyKey);

    expect(intents).toHaveLength(2);
    expect(intents.map((intent) => intent.side).sort()).toEqual([
      'buy',
      'sell',
    ]);
    expect(intents.every((intent) => intent.status === 'DONE')).toBe(true);

    expect(mappings).toHaveLength(2);
    expect(
      mappings.every((mapping) => mapping.orderId === order.orderId),
    ).toBe(true);

    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.side).sort()).toEqual(['buy', 'sell']);

    expect(trackedOrders).toHaveLength(2);
    expect(trackedOrders.map((trackedOrder) => trackedOrder.side).sort()).toEqual(
      ['buy', 'sell'],
    );
    expect(trackedOrders.every((trackedOrder) => trackedOrder.status === 'open')).toBe(
      true,
    );

    for (const mapping of mappings) {
      const exchangeOrder = await helper.fetchExchangeOrder(
        mapping.exchangeOrderId,
        order.pair,
      );

      expect(String(exchangeOrder?.id || '')).toBe(mapping.exchangeOrderId);
    }
  });
});

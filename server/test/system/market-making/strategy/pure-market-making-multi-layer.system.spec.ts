import BigNumber from 'bignumber.js';

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
    `[system] Skipping pure market-making multi-layer suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Pure market making multi-layer parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
  });

  afterAll(async () => {
    await helper?.close();
  });

  it('places a layered ladder once and preserves hanging orders on the next tick', async () => {
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      amountChangePerLayer: 0.0001,
      bidSpread: 0.001,
      askSpread: 0.001,
      hangingOrdersEnabled: true,
      numberOfLayers: 3,
      orderAmount: 0.0002,
    });
    const { order, strategyKey } = fixture;

    await helper.startOrder(order.orderId, order.userId);
    await helper.runSingleTick(order.orderId);

    const intents = await helper.listStrategyIntents(order.orderId);
    const mappings = await helper.listOrderMappings(order.orderId);
    const history = await helper.listExecutionHistory(order.orderId);
    const trackedOrders = helper.getOpenTrackedOrders(strategyKey);

    expect(intents).toHaveLength(6);
    expect(mappings).toHaveLength(6);
    expect(history).toHaveLength(6);
    expect(trackedOrders).toHaveLength(6);

    const buyIntents = intents.filter((intent) => intent.side === 'buy');
    const sellIntents = intents.filter((intent) => intent.side === 'sell');

    expect(buyIntents).toHaveLength(3);
    expect(sellIntents).toHaveLength(3);
    expect(intents.every((intent) => intent.status === 'DONE')).toBe(true);

    const buyPrices = buyIntents.map((intent) => new BigNumber(intent.price));
    const sellPrices = sellIntents.map((intent) => new BigNumber(intent.price));
    const buyQtys = buyIntents.map((intent) => new BigNumber(intent.qty));
    const sellQtys = sellIntents.map((intent) => new BigNumber(intent.qty));

    expect(buyPrices[0].isGreaterThan(buyPrices[1])).toBe(true);
    expect(buyPrices[1].isGreaterThan(buyPrices[2])).toBe(true);
    expect(sellPrices[0].isLessThan(sellPrices[1])).toBe(true);
    expect(sellPrices[1].isLessThan(sellPrices[2])).toBe(true);

    expect(buyQtys.map((qty) => qty.toFixed())).toEqual([
      '0.0002',
      '0.0003',
      '0.0004',
    ]);
    expect(sellQtys.map((qty) => qty.toFixed())).toEqual([
      '0.0002',
      '0.0003',
      '0.0004',
    ]);

    expect(
      trackedOrders.every((trackedOrder) => trackedOrder.status === 'open'),
    ).toBe(true);

    await helper.forceSessionReadyForNextTick(order.orderId);
    await helper.runSingleTick(order.orderId);

    expect(await helper.listStrategyIntents(order.orderId)).toHaveLength(6);
    expect(await helper.listOrderMappings(order.orderId)).toHaveLength(6);
    expect(await helper.listExecutionHistory(order.orderId)).toHaveLength(6);
    expect(helper.getOpenTrackedOrders(strategyKey)).toHaveLength(6);
  });
});

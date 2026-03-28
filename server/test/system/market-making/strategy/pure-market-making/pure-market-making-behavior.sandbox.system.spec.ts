import { buildSubmittedClientOrderId } from 'src/common/helpers/client-order-id';
import BigNumber from 'bignumber.js';

import { MarketMakingSingleTickHelper } from '../../../helpers/market-making-single-tick.helper';
import {
  getSystemSandboxSkipReason,
  readSystemSandboxConfig,
} from '../../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../../helpers/system-test-log.helper';

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const skipReason = envSkipReason;
const log = createSystemTestLogger('pure-mm-behavior');

if (skipReason) {
  logSystemSkip('pure market-making behavior suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Pure market making behavior parity (sandbox system)', () => {
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

    await helper.startOrder(order.orderId, order.userId);
    await helper.runSingleTick(order.orderId);

    const intents = await helper.listStrategyIntents(order.orderId);
    const mappings = await helper.listOrderMappings(order.orderId);
    const history = await helper.listExecutionHistory(order.orderId);
    const trackedOrders = helper.getOpenTrackedOrders(strategyKey);

    log.result('single tick artifacts collected', {
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
      const exchangeOrder = await helper.fetchExchangeOrder(
        mapping.exchangeOrderId,
        order.pair,
      );

      expect(String(exchangeOrder?.id || '')).toBe(mapping.exchangeOrderId);
    }
  });

  it('places a layered ladder once and preserves hanging orders on the next tick', async () => {
    log.step('creating layered fixture');
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

  it('reuses one executor session across repeated eligible ticks and increments submitted clientOrderId values deterministically', async () => {
    log.step('creating cadence fixture');
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
      orderRefreshTime: 60000,
    });
    const { order, strategyKey } = fixture;

    await helper.startOrder(order.orderId, order.userId);

    const initialSession = helper.getExecutorSession(
      order.exchangeName,
      order.pair,
      order.orderId,
    );

    expect(initialSession).toBeDefined();
    expect(initialSession?.cadenceMs).toBe(60000);

    const initialRunId = initialSession?.runId;
    const initialNextRunAtMs = initialSession?.nextRunAtMs || 0;

    await helper.runSingleTick(order.orderId);

    const afterFirstTickSession = helper.getExecutorSession(
      order.exchangeName,
      order.pair,
      order.orderId,
    );

    expect(afterFirstTickSession?.runId).toBe(initialRunId);
    expect((afterFirstTickSession?.nextRunAtMs || 0) > initialNextRunAtMs).toBe(
      true,
    );
    expect(await helper.listStrategyIntents(order.orderId)).toHaveLength(2);

    await helper.runSingleTick(order.orderId);
    expect(await helper.listStrategyIntents(order.orderId)).toHaveLength(2);

    await helper.forceSessionReadyForNextTick(order.orderId);
    await helper.runSingleTick(order.orderId);

    const intents = await helper.listStrategyIntents(order.orderId);
    const mappings = await helper.listOrderMappings(order.orderId);
    const history = await helper.listExecutionHistory(order.orderId);
    const trackedOrders = helper.getOpenTrackedOrders(strategyKey);
    const afterSecondEligibleTickSession = helper.getExecutorSession(
      order.exchangeName,
      order.pair,
      order.orderId,
    );

    expect(afterSecondEligibleTickSession?.runId).toBe(initialRunId);
    expect(intents).toHaveLength(4);
    expect(mappings).toHaveLength(4);
    expect(history).toHaveLength(4);
    expect(trackedOrders).toHaveLength(4);

    const submittedClientOrderIds = history
      .map((entry) => String(entry.metadata?.clientOrderId || ''))
      .sort();

    expect(submittedClientOrderIds).toEqual(
      [
        buildSubmittedClientOrderId(order.orderId, 0),
        buildSubmittedClientOrderId(order.orderId, 1),
        buildSubmittedClientOrderId(order.orderId, 2),
        buildSubmittedClientOrderId(order.orderId, 3),
      ].sort(),
    );
  });

  it('does not emit new intents when the next cadence window is far in the future', async () => {
    log.step('creating far-future cadence fixture');
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
      orderRefreshTime: 60000,
    });
    const { order } = fixture;

    await helper.startOrder(order.orderId, order.userId);
    await helper.runSingleTick(order.orderId);

    const session = helper.getExecutorSession(
      order.exchangeName,
      order.pair,
      order.orderId,
    );
    const initialIntentCount = (await helper.listStrategyIntents(order.orderId))
      .length;

    expect(session).toBeDefined();
    session!.nextRunAtMs = Date.now() + 999_999_999;

    await helper.runSingleTick(order.orderId);

    const finalIntentCount = (await helper.listStrategyIntents(order.orderId))
      .length;

    expect(finalIntentCount).toBe(initialIntentCount);
  });
});

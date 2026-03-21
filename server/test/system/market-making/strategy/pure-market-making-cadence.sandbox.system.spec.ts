import { buildSubmittedClientOrderId } from 'src/common/helpers/client-order-id';

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
const log = createSystemTestLogger('pure-mm-cadence');

if (skipReason) {
  logSystemSkip('pure market-making cadence suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Pure market making cadence parity (system)', () => {
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

  it('reuses one executor session across repeated eligible ticks and increments submitted clientOrderId values deterministically', async () => {
    log.step('creating cadence fixture');
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
      orderRefreshTime: 60000,
    });
    const { order, strategyKey } = fixture;

    log.result('fixture created', {
      orderId: order.orderId,
      pair: order.pair,
      cadenceMs: 60000,
    });

    log.step('starting order');
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

    log.check('initial executor session', {
      runId: initialRunId,
      nextRunAtMs: initialNextRunAtMs,
    });

    log.step('running first eligible tick');
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
    log.result('first tick complete', {
      runId: afterFirstTickSession?.runId,
      nextRunAtMs: afterFirstTickSession?.nextRunAtMs,
      intentCount: 2,
    });

    log.step('running ineligible tick to confirm cadence guard');
    await helper.runSingleTick(order.orderId);
    expect(await helper.listStrategyIntents(order.orderId)).toHaveLength(2);

    log.step('forcing next eligible tick');
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

    log.result('second eligible tick complete', {
      runId: afterSecondEligibleTickSession?.runId,
      intentCount: intents.length,
      mappingCount: mappings.length,
      historyCount: history.length,
      trackedOrderCount: trackedOrders.length,
    });

    expect(afterSecondEligibleTickSession?.runId).toBe(initialRunId);
    expect(intents).toHaveLength(4);
    expect(mappings).toHaveLength(4);
    expect(history).toHaveLength(4);
    expect(trackedOrders).toHaveLength(4);

    const submittedClientOrderIds = history
      .map((entry) => String(entry.metadata?.clientOrderId || ''))
      .sort();

    log.check('submitted client order ids', {
      orderId: order.orderId,
      submittedClientOrderIds,
    });

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

    log.check('far future cadence set', {
      orderId: order.orderId,
      nextRunAtMs: session!.nextRunAtMs,
      initialIntentCount,
    });

    await helper.runSingleTick(order.orderId);

    const finalIntentCount = (await helper.listStrategyIntents(order.orderId))
      .length;

    log.result('far future cadence guard verified', {
      orderId: order.orderId,
      initialIntentCount,
      finalIntentCount,
    });

    expect(finalIntentCount).toBe(initialIntentCount);
  });
});

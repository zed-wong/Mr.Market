import { buildSubmittedClientOrderId } from 'src/common/helpers/client-order-id';

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
    `[system] Skipping pure market-making cadence suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Pure market making cadence parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
  });

  afterAll(async () => {
    await helper?.close();
  });

  it('reuses one executor session across repeated eligible ticks and increments submitted clientOrderId values deterministically', async () => {
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
});

import { MarketMakingIntentLifecycleHelper } from '../../helpers/market-making-intent-lifecycle.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('pure-mm-intent-lifecycle');

describe('Pure market making intent lifecycle (system)', () => {
  jest.setTimeout(30000);

  let helper: MarketMakingIntentLifecycleHelper;

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingIntentLifecycleHelper();
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('persists NEW intents, advances them through SENT, and finishes with DONE plus execution history', async () => {
    log.step('publishing one pure market making cycle');
    const strategyKey = await helper.publishPureMarketMakingCycle({
      clientId: 'system-order-lifecycle-1',
    });

    const newIntents = await helper.waitForIntentStatuses(strategyKey, [
      'NEW',
      'NEW',
    ]);

    log.result('new intents persisted', {
      strategyKey,
      statuses: newIntents.map((intent) => intent.status),
      intentIds: newIntents.map((intent) => intent.intentId),
    });

    expect(newIntents).toHaveLength(2);
    expect(newIntents.every((intent) => intent.status === 'NEW')).toBe(true);

    log.step('starting worker to consume intents');
    await helper.startWorker();

    const sentAndQueued = await helper.waitForIntentStatuses(strategyKey, [
      'SENT',
      'NEW',
    ]);
    const firstPendingPlacement = helper.getPendingPlacements()[0];

    log.result('first head intent dispatched', {
      statuses: sentAndQueued.map((intent) => intent.status),
      firstPendingPlacement,
    });

    expect(firstPendingPlacement).toBeDefined();
    expect(sentAndQueued[0]?.status).toBe('SENT');
    expect(sentAndQueued[1]?.status).toBe('NEW');

    log.step('releasing first placement');
    helper.releaseNextPlacement();

    const secondSent = await helper.waitForIntentStatuses(strategyKey, [
      'DONE',
      'SENT',
    ]);
    const secondPendingPlacement = helper.getPendingPlacements()[0];

    log.result('second head intent dispatched', {
      statuses: secondSent.map((intent) => intent.status),
      secondPendingPlacement,
    });

    expect(secondPendingPlacement).toBeDefined();
    expect(secondSent[0]?.status).toBe('DONE');
    expect(secondSent[1]?.status).toBe('SENT');

    log.step('releasing second placement');
    helper.releaseNextPlacement();

    const doneIntents = await helper.waitForIntentStatuses(strategyKey, [
      'DONE',
      'DONE',
    ]);
    const history = await helper.listExecutionHistory();
    const mappings = await helper.listOrderMappings();

    log.result('lifecycle complete', {
      statuses: doneIntents.map((intent) => intent.status),
      historyCount: history.length,
      mappingCount: mappings.length,
      mappingClientOrderIds: mappings.map((mapping) => mapping.clientOrderId),
    });

    expect(doneIntents).toHaveLength(2);
    expect(doneIntents.every((intent) => intent.status === 'DONE')).toBe(true);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.status).sort()).toEqual([
      'open',
      'open',
    ]);
    expect(mappings).toHaveLength(2);
    expect(
      mappings.every(
        (mapping) => mapping.clientOrderId && mapping.exchangeOrderId,
      ),
    ).toBe(true);
  });
});

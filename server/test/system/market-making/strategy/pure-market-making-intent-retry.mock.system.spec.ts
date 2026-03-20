import {
  createSystemTestLogger,
} from '../../helpers/system-test-log.helper';
import { MarketMakingIntentLifecycleHelper } from '../../helpers/market-making-intent-lifecycle.helper';

const log = createSystemTestLogger('pure-mm-intent-retry');

describe('Pure market making intent retry handling (system)', () => {
  jest.setTimeout(30000);

  let helper: MarketMakingIntentLifecycleHelper;

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingIntentLifecycleHelper({
      maxRetries: 1,
      retryBaseDelayMs: 10,
    });
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('retries a failed placement and still finishes the intent lifecycle with DONE', async () => {
    log.step('publishing one pure market making cycle');
    const strategyKey = await helper.publishPureMarketMakingCycle({
      clientId: 'system-order-retry-1',
    });
    await helper.waitForIntentStatuses(strategyKey, ['NEW', 'NEW']);

    log.step('starting worker');
    await helper.startWorker();

    const firstSent = await helper.waitForIntentStatuses(strategyKey, [
      'SENT',
      'NEW',
    ]);
    const firstPendingPlacements = await helper.waitForPendingPlacements(1);
    log.result('first attempt dispatched', {
      statuses: firstSent.map((intent) => intent.status),
      pendingPlacements: firstPendingPlacements,
    });

    expect(firstPendingPlacements).toHaveLength(1);

    log.step('rejecting first placement to trigger retry');
    helper.rejectNextPlacement('simulated timeout');

    const retriedPending = await helper.waitForPendingPlacements(1);
    log.result('retry attempt queued', {
      pendingPlacements: retriedPending,
    });

    expect(retriedPending).toHaveLength(1);
    expect(retriedPending[0]?.callIndex).toBe(1);

    log.step('releasing retried first placement');
    helper.releaseNextPlacement();

    await helper.waitForIntentStatuses(strategyKey, ['DONE', 'SENT']);
    await helper.waitForPendingPlacements(1);
    log.step('releasing second placement');
    helper.releaseNextPlacement();

    const doneIntents = await helper.waitForIntentStatuses(strategyKey, [
      'DONE',
      'DONE',
    ]);
    const history = await helper.listExecutionHistory();
    const mappings = await helper.listOrderMappings();
    log.result('retry lifecycle complete', {
      statuses: doneIntents.map((intent) => intent.status),
      historyCount: history.length,
      mappingCount: mappings.length,
      pendingPlacements: helper.getPendingPlacements(),
    });

    expect(doneIntents.every((intent) => intent.status === 'DONE')).toBe(true);
    expect(history).toHaveLength(2);
    expect(mappings).toHaveLength(2);
    expect(helper.getPendingPlacements()).toHaveLength(0);
  });
});

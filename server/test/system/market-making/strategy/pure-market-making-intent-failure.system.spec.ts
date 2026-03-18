import { createSystemTestLogger } from '../../helpers/system-test-log.helper';
import { MarketMakingIntentLifecycleHelper } from '../../helpers/market-making-intent-lifecycle.helper';

const log = createSystemTestLogger('pure-mm-intent-failure');

describe('Pure market making intent failure handling (system)', () => {
  jest.setTimeout(30000);

  let helper: MarketMakingIntentLifecycleHelper;

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingIntentLifecycleHelper({
      maxRetries: 0,
      retryBaseDelayMs: 10,
    });
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('marks the head intent FAILED when placement exhausts retries and does not persist history or mappings', async () => {
    log.step('publishing one pure market making cycle');
    const strategyKey = await helper.publishPureMarketMakingCycle({
      clientId: 'system-order-failure-1',
    });
    await helper.waitForIntentStatuses(strategyKey, ['NEW', 'NEW']);

    log.step('starting worker');
    await helper.startWorker();

    const firstSent = await helper.waitForIntentStatuses(strategyKey, [
      'SENT',
      'NEW',
    ]);
    const firstPendingPlacements = await helper.waitForPendingPlacements(1);
    log.result('head intent dispatched', {
      statuses: firstSent.map((intent) => intent.status),
      pendingPlacements: firstPendingPlacements,
    });

    expect(firstPendingPlacements).toHaveLength(1);

    log.step('rejecting placement with retries exhausted');
    helper.rejectNextPlacement('exchange down');

    const failedState = await helper.waitForIntentStatuses(strategyKey, [
      'FAILED',
      'NEW',
    ]);
    const history = await helper.listExecutionHistory();
    const mappings = await helper.listOrderMappings();
    log.result('failure state captured', {
      statuses: failedState.map((intent) => intent.status),
      errors: failedState.map((intent) => intent.errorReason || ''),
      historyCount: history.length,
      mappingCount: mappings.length,
    });

    expect(failedState[0]?.status).toBe('FAILED');
    expect(failedState[0]?.errorReason).toContain('exchange down');
    expect(failedState[1]?.status).toBe('NEW');
    expect(history).toHaveLength(0);
    expect(mappings).toHaveLength(0);
  });
});

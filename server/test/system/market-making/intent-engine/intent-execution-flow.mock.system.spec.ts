import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { MarketMakingIntentLifecycleHelper } from '../../helpers/market-making-intent-lifecycle.helper';
import { pollUntil } from '../../helpers/sandbox-system.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('intent-execution-flow');

describe('Intent execution flow (mock system)', () => {
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

  afterEach(async () => {
    // Drain any leftover pending placements so they don't leak into the next test
    while (helper?.getPendingPlacements().length) {
      helper.rejectNextPlacement('test cleanup');
    }
    await helper?.stopWorker();
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('persists NEW intents, advances them through SENT, and finishes with DONE plus execution history', async () => {
    const baselineHistoryCount = (await helper.listExecutionHistory()).length;
    const baselineMappingCount = (await helper.listOrderMappings()).length;

    log.step('publishing one pure market making cycle');
    const strategyKey = await helper.publishPureMarketMakingCycle({
      clientId: 'system-order-lifecycle-1',
    });

    const newIntents = await helper.waitForIntentStatuses(strategyKey, [
      'NEW',
      'NEW',
    ]);

    expect(newIntents).toHaveLength(2);
    expect(newIntents.every((intent) => intent.status === 'NEW')).toBe(true);

    log.step('starting worker to consume intents');
    await helper.startWorker();

    const sentAndQueued = await helper.waitForIntentStatuses(strategyKey, [
      'SENT',
      'NEW',
    ]);
    const firstPendingPlacement = (await helper.waitForPendingPlacements(1))[0];

    expect(firstPendingPlacement).toBeDefined();
    expect(sentAndQueued[0]?.status).toBe('SENT');
    expect(sentAndQueued[1]?.status).toBe('NEW');

    log.step('releasing first placement');
    helper.releaseNextPlacement();

    const secondSent = await helper.waitForIntentStatuses(strategyKey, [
      'DONE',
      'SENT',
    ]);
    const secondPendingPlacement = (
      await helper.waitForPendingPlacements(1)
    )[0];

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
    const addedHistory = history.slice(baselineHistoryCount);
    const addedMappings = mappings.slice(baselineMappingCount);

    log.result('lifecycle complete', {
      statuses: doneIntents.map((intent) => intent.status),
      addedHistoryCount: addedHistory.length,
      addedMappingCount: addedMappings.length,
      mappingClientOrderIds: addedMappings.map(
        (mapping) => mapping.clientOrderId,
      ),
    });

    expect(doneIntents).toHaveLength(2);
    expect(doneIntents.every((intent) => intent.status === 'DONE')).toBe(true);
    expect(addedHistory).toHaveLength(2);
    expect(addedHistory.map((entry) => entry.status).sort()).toEqual([
      'open',
      'open',
    ]);
    expect(addedMappings).toHaveLength(2);
    expect(
      addedMappings.every(
        (mapping) => mapping.clientOrderId && mapping.exchangeOrderId,
      ),
    ).toBe(true);
  });

  it('retries a failed placement and still finishes the intent lifecycle with DONE', async () => {
    const baselineHistoryCount = (await helper.listExecutionHistory()).length;
    const baselineMappingCount = (await helper.listOrderMappings()).length;

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
    const firstAttempt = firstPendingPlacements[0];

    expect(firstAttempt).toBeDefined();
    expect(firstSent[0]?.status).toBe('SENT');

    log.step('rejecting first placement to trigger retry');
    helper.rejectNextPlacement('simulated timeout');

    const retriedPending = await helper.waitForPendingPlacements(1);
    const retryAttempt = retriedPending[0];

    log.result('retry attempt queued', {
      firstAttempt,
      retryAttempt,
    });

    expect(retryAttempt).toBeDefined();
    expect(
      (retryAttempt?.callIndex || 0) > (firstAttempt?.callIndex || 0),
    ).toBe(true);

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
      addedHistoryCount: history.length - baselineHistoryCount,
      addedMappingCount: mappings.length - baselineMappingCount,
      pendingPlacements: helper.getPendingPlacements(),
    });

    expect(doneIntents.every((intent) => intent.status === 'DONE')).toBe(true);
    expect(history.length - baselineHistoryCount).toBe(2);
    expect(mappings.length - baselineMappingCount).toBe(2);
    expect(helper.getPendingPlacements()).toHaveLength(0);
  });

  it('marks the head intent FAILED when placement exhausts retries and does not persist history or mappings', async () => {
    const baselineHistoryCount = (await helper.listExecutionHistory()).length;
    const baselineMappingCount = (await helper.listOrderMappings()).length;

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

    expect(firstPendingPlacements).toHaveLength(1);
    expect(firstSent[0]?.status).toBe('SENT');

    log.step('rejecting placement until retries are exhausted');
    helper.rejectNextPlacement('exchange down');
    await helper.waitForPendingPlacements(1);
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
      addedHistoryCount: history.length - baselineHistoryCount,
      addedMappingCount: mappings.length - baselineMappingCount,
    });

    expect(failedState[0]?.status).toBe('FAILED');
    expect(failedState[0]?.errorReason).toContain('exchange down');
    expect(failedState[1]?.status).toBe('NEW');
    expect(history.length - baselineHistoryCount).toBe(0);
    expect(mappings.length - baselineMappingCount).toBe(0);
  });

  it('logs an execution error when the worker sees an exchange placement failure', async () => {
    const worker = helper.getIntentWorkerService();
    const logger = Reflect.get(worker, 'logger') as CustomLogger;
    const errorSpy = jest
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);

    log.step('publishing one pure market making cycle');
    const strategyKey = await helper.publishPureMarketMakingCycle({
      clientId: 'system-order-worker-error-1',
    });

    await helper.waitForIntentStatuses(strategyKey, ['NEW', 'NEW']);

    log.step('starting worker');
    await helper.startWorker();
    await helper.waitForIntentStatuses(strategyKey, ['SENT', 'NEW']);
    await helper.waitForPendingPlacements(1);

    log.step('rejecting placement to trigger worker error logging');
    helper.rejectNextPlacement('exchange api unavailable');
    await helper.waitForPendingPlacements(1);
    helper.rejectNextPlacement('exchange api unavailable');

    const failedState = await helper.waitForIntentStatuses(strategyKey, [
      'FAILED',
      'NEW',
    ]);

    log.result('worker failure observed', {
      statuses: failedState.map((intent) => intent.status),
      errorReason: failedState[0]?.errorReason,
      loggerErrorCalls: errorSpy.mock.calls.length,
    });

    expect(failedState[0]?.status).toBe('FAILED');
    expect(failedState[0]?.errorReason).toContain('exchange api unavailable');

    // The DB status is set before the worker's async logger path runs, so wait
    // for the logger side effect instead of sleeping on scheduler timing.
    await pollUntil(
      async () => errorSpy.mock.calls.length,
      async (callCount) => callCount > 0,
      {
        description: 'worker error logger to record the failed placement',
        intervalMs: 10,
        timeoutMs: 1000,
      },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Intent execution failed for'),
    );
  });
});

import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { MarketMakingIntentLifecycleHelper } from '../../helpers/market-making-intent-lifecycle.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('pure-mm-intent-worker-error');

describe('Pure market making intent worker error logging (system)', () => {
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
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Intent execution failed for'),
    );
  });
});

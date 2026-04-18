/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExchangeOrderReconciliationRunner } from './exchange-order-reconciliation-runner';

describe('ExchangeOrderReconciliationRunner', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
  });

  it('runs reconciliation off tick through the tracker poller', async () => {
    const exchangeOrderTrackerService = {
      pollDueOrders: jest.fn().mockResolvedValue(2),
    };
    const runner = new ExchangeOrderReconciliationRunner(
      exchangeOrderTrackerService as any,
    );

    await expect(runner.runNow('2026-04-18T00:00:01.000Z')).resolves.toBe(2);
    expect(exchangeOrderTrackerService.pollDueOrders).toHaveBeenCalledWith(
      '2026-04-18T00:00:01.000Z',
    );
  });

  it('does not overlap reconciliation passes', async () => {
    let resolvePoll: ((value: number) => void) | undefined;
    const exchangeOrderTrackerService = {
      pollDueOrders: jest.fn(
        () =>
          new Promise<number>((resolve) => {
            resolvePoll = resolve;
          }),
      ),
    };
    const runner = new ExchangeOrderReconciliationRunner(
      exchangeOrderTrackerService as any,
    );

    const firstRun = runner.runNow('2026-04-18T00:00:01.000Z');

    await expect(runner.runNow('2026-04-18T00:00:01.500Z')).resolves.toBe(0);

    resolvePoll?.(1);

    await expect(firstRun).resolves.toBe(1);
    expect(exchangeOrderTrackerService.pollDueOrders).toHaveBeenCalledTimes(1);
  });
});

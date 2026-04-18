/* eslint-disable @typescript-eslint/no-explicit-any */
import { MarketMakingEventBus } from '../events/market-making-event-bus.service';
import { BalanceRefreshScheduler } from './balance-refresh-scheduler';

describe('BalanceRefreshScheduler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refreshes a registered account when the balance cache turns stale', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const marketMakingEventBus = new MarketMakingEventBus();
    const balanceStateRefreshService = {
      getRegisteredAccounts: jest
        .fn()
        .mockReturnValue([{ exchange: 'binance', accountLabel: 'maker' }]),
      isRegisteredAccount: jest.fn().mockReturnValue(true),
      refreshDueAccounts: jest.fn().mockResolvedValue(['binance:maker']),
    };
    const scheduler = new BalanceRefreshScheduler(
      balanceStateRefreshService as any,
      marketMakingEventBus,
    );

    await scheduler.onModuleInit();

    marketMakingEventBus.emitBalanceStale({
      exchange: 'binance',
      accountLabel: 'maker',
      staleAt: '2026-04-18T00:00:20.000Z',
    });

    await expect(scheduler.runNow('2026-04-18T00:00:21.000Z')).resolves.toEqual(
      ['binance:maker'],
    );
    expect(balanceStateRefreshService.refreshDueAccounts).toHaveBeenCalledWith(
      [{ exchange: 'binance', accountLabel: 'maker' }],
      '2026-04-18T00:00:21.000Z',
    );

    await scheduler.onModuleDestroy();
  });

  it('refreshes registered accounts when stream health degrades', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const marketMakingEventBus = new MarketMakingEventBus();
    const balanceStateRefreshService = {
      getRegisteredAccounts: jest
        .fn()
        .mockReturnValue([{ exchange: 'binance', accountLabel: 'maker' }]),
      isRegisteredAccount: jest.fn().mockReturnValue(true),
      refreshDueAccounts: jest.fn().mockResolvedValue(['binance:maker']),
    };
    const scheduler = new BalanceRefreshScheduler(
      balanceStateRefreshService as any,
      marketMakingEventBus,
    );

    await scheduler.onModuleInit();

    marketMakingEventBus.emitStreamHealthChanged({
      exchange: 'binance',
      accountLabel: 'maker',
      previousHealth: 'healthy',
      health: 'degraded',
      changedAt: '2026-04-18T00:00:21.000Z',
    });

    await scheduler.runNow('2026-04-18T00:00:21.500Z');

    expect(balanceStateRefreshService.refreshDueAccounts).toHaveBeenCalledWith(
      [{ exchange: 'binance', accountLabel: 'maker' }],
      '2026-04-18T00:00:21.500Z',
    );

    await scheduler.onModuleDestroy();
  });

  it('does not overlap refresh passes', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    let resolveRefresh: ((value: string[]) => void) | undefined;
    const balanceStateRefreshService = {
      getRegisteredAccounts: jest
        .fn()
        .mockReturnValue([{ exchange: 'binance', accountLabel: 'maker' }]),
      isRegisteredAccount: jest.fn().mockReturnValue(true),
      refreshDueAccounts: jest.fn(
        () =>
          new Promise<string[]>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    };
    const scheduler = new BalanceRefreshScheduler(
      balanceStateRefreshService as any,
    );
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(Date.parse('2026-04-18T00:02:00.000Z'));
    await scheduler.onModuleInit();

    const firstRun = scheduler.runNow('2026-04-18T00:02:00.000Z');

    await expect(scheduler.runNow('2026-04-18T00:02:00.500Z')).resolves.toEqual(
      [],
    );

    resolveRefresh?.(['binance:maker']);

    await expect(firstRun).resolves.toEqual(['binance:maker']);
    expect(balanceStateRefreshService.refreshDueAccounts).toHaveBeenCalledTimes(
      1,
    );

    await scheduler.onModuleDestroy();
  });
});

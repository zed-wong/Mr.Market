/* eslint-disable @typescript-eslint/no-explicit-any */
import { BalanceStateCacheService } from './balance-state-cache.service';
import { BalanceStateRefreshService } from './balance-state-refresh.service';

describe('BalanceStateRefreshService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('refreshes registered accounts when the user stream is silent', async () => {
    const exchangeConnectorAdapterService = {
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 1, USDT: 100 },
      }),
    };
    const balanceStateCacheService = new BalanceStateCacheService();
    const userStreamTrackerService = {
      getLastRecvTime: jest.fn().mockReturnValue(undefined),
    };
    const service = new BalanceStateRefreshService(
      undefined,
      exchangeConnectorAdapterService as any,
      balanceStateCacheService,
      userStreamTrackerService as any,
    );

    service.registerAccount('binance', 'maker');
    await service.onTick('2026-04-14T00:00:00.000Z');

    expect(exchangeConnectorAdapterService.fetchBalance).toHaveBeenCalledWith(
      'binance',
      'maker',
    );
    expect(
      balanceStateCacheService.getBalance('binance', 'maker', 'USDT'),
    ).toEqual(
      expect.objectContaining({
        free: '100',
        source: 'rest',
      }),
    );
    expect(service.getLastRefreshTime('binance', 'maker')).toBeTruthy();
  });

  it('reports healthy when recent user-stream events exist', () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-14T00:00:10.000Z'));
    const service = new BalanceStateRefreshService(
      undefined,
      undefined,
      undefined,
      {
        getLastRecvTime: jest
          .fn()
          .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z')),
      } as any,
    );

    expect(service.getHealthState('binance', 'maker')).toBe('healthy');
    jest.restoreAllMocks();
  });
});

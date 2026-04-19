/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServiceUnavailableException } from '@nestjs/common';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

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
      exchangeConnectorAdapterService as any,
      balanceStateCacheService,
      userStreamTrackerService as any,
    );

    service.registerAccount('binance', 'maker');
    await service.refreshDueAccounts(
      service.getRegisteredAccounts(),
      '2026-04-14T00:00:00.000Z',
    );

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

  it('keeps refreshing later accounts when one balance refresh fails', async () => {
    const exchangeConnectorAdapterService = {
      fetchBalance: jest
        .fn()
        .mockRejectedValueOnce(new Error('mexc fetch failed'))
        .mockResolvedValueOnce({ free: { USDT: 50 } }),
    };
    const balanceStateCacheService = new BalanceStateCacheService();
    const userStreamTrackerService = {
      getLastRecvTime: jest.fn().mockReturnValue(undefined),
    };
    const loggerWarnSpy = jest
      .spyOn(CustomLogger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new BalanceStateRefreshService(
      exchangeConnectorAdapterService as any,
      balanceStateCacheService,
      userStreamTrackerService as any,
    );

    service.registerAccount('mexc', 'maker');
    service.registerAccount('binance', 'maker');

    await expect(
      service.refreshDueAccounts(
        service.getRegisteredAccounts(),
        '2026-04-14T00:00:00.000Z',
      ),
    ).resolves.toEqual(['binance:maker']);

    expect(
      exchangeConnectorAdapterService.fetchBalance,
    ).toHaveBeenNthCalledWith(1, 'mexc', 'maker');
    expect(
      exchangeConnectorAdapterService.fetchBalance,
    ).toHaveBeenNthCalledWith(2, 'binance', 'maker');
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Balance refresh failed for mexc:maker'),
      expect.any(String),
    );
    expect(service.getLastRefreshTime('mexc', 'maker')).toBeUndefined();
    expect(service.getLastRefreshTime('binance', 'maker')).toBeTruthy();
  });

  it('reports healthy when recent user-stream events exist', () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:00:10.000Z'));
    const service = new BalanceStateRefreshService(undefined, undefined, {
      getLastRecvTime: jest
        .fn()
        .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z')),
    } as any);

    expect(service.getHealthState('binance', 'maker')).toBe('healthy');
    jest.restoreAllMocks();
  });

  it('reports healthy after a recent refresh even when the next refresh times out', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const exchangeConnectorAdapterService = {
      fetchBalance: jest
        .fn()
        .mockResolvedValueOnce({ free: { USDT: 50 } })
        .mockRejectedValueOnce(
          new ServiceUnavailableException('Exchange request timed out'),
        ),
    };
    const service = new BalanceStateRefreshService(
      exchangeConnectorAdapterService as any,
      new BalanceStateCacheService(),
      {
        getLastRecvTime: jest
          .fn()
          .mockReturnValue(Date.parse('2026-04-14T00:00:00.000Z')),
      } as any,
    );

    service.registerAccount('mexc', 'maker');

    nowSpy.mockReturnValue(Date.parse('2026-04-14T00:00:35.000Z'));
    await service.refreshDueAccounts(
      service.getRegisteredAccounts(),
      '2026-04-14T00:00:35.000Z',
    );

    nowSpy.mockReturnValue(Date.parse('2026-04-14T00:00:40.000Z'));
    await service.refreshDueAccounts(
      service.getRegisteredAccounts(),
      '2026-04-14T00:00:40.000Z',
    );

    expect(service.getHealthState('mexc', 'maker')).toBe('healthy');
    jest.restoreAllMocks();
  });
});

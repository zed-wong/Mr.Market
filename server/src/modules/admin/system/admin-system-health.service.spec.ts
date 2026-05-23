import { BadRequestException } from '@nestjs/common';

import { AdminSystemHealthService } from './admin-system-health.service';

const ts = (minute: number) =>
  `2026-05-23T00:${String(minute).padStart(2, '0')}:00.000Z`;

describe('AdminSystemHealthService', () => {
  function buildService(overrides: Partial<Record<string, any>> = {}) {
    const apiKeys = overrides.apiKeys || {
      count: jest.fn(async () => 2),
      find: jest.fn(async () => [
        {
          key_id: '1',
          exchange: 'binance',
          name: 'maker',
          permissions: 'read-trade',
          validation_status: 'valid',
          validated_at: ts(1),
          created_at: ts(0),
          api_key: 'must-not-leak',
          api_secret: 'must-not-leak',
        },
        {
          key_id: '2',
          exchange: 'mexc',
          name: 'backup',
          permissions: 'read',
          validation_status: 'pending',
          validated_at: null,
          created_at: ts(0),
          api_key: 'must-not-leak',
          api_secret: 'must-not-leak',
        },
      ]),
    };
    const health = overrides.health || {
      checkSnapshotPollingHealth: jest.fn(async () => ({
        status: 'warning',
        timestamp: ts(2),
        queue: {
          name: 'snapshots',
          isPaused: false,
          isPollingActive: true,
        },
        metrics: {
          waiting: 1,
          active: 0,
          completed: 10,
          failed: 0,
          delayed: 0,
        },
        issues: ['backlog'],
      })),
      getAllHealth: jest.fn(),
      getExchangeHealth: jest.fn(),
    };
    const metrics = overrides.metrics || {
      getRuntimeMetrics: jest.fn(() => ({
        stats: [
          {
            scope: 'tick',
            count: 1,
            totalDurationMs: 10,
            avgDurationMs: 10,
            maxDurationMs: 10,
            lastDurationMs: 10,
            lastRecordedAt: ts(3),
            lastMetadata: {},
          },
        ],
        recent: [
          {
            scope: 'tick',
            durationMs: 10,
            recordedAt: ts(3),
            metadata: {},
          },
        ],
      })),
    };
    const balanceRefresh = overrides.balanceRefresh || {
      getRegisteredAccounts: jest.fn(() => [
        { exchange: 'binance', accountLabel: 'maker' },
      ]),
      getHealthState: jest.fn(() => 'healthy'),
      getLastRefreshTime: jest.fn(() => ts(4)),
      refreshAccount: jest.fn(),
      refreshDueAccounts: jest.fn(),
    };
    const balanceCache = overrides.balanceCache || {
      getSnapshotDiagnostic: jest.fn(() => ({
        present: true,
        fresh: true,
        ageMs: 100,
        freshnessTimestamp: ts(5),
        source: 'ws',
      })),
      hasFreshAccountSnapshot: jest.fn(),
      isFresh: jest.fn(),
    };
    const userStream = overrides.userStream || {
      getQueueDepth: jest.fn(() => 0),
      getOrphanedFills: jest.fn(() => []),
      getDuplicateFillSuppressionCount: jest.fn(() => 0),
    };
    const userStreamIngestion = overrides.userStreamIngestion || {
      getActiveWatcherCount: jest.fn(() => 1),
    };
    const orderTracker = overrides.orderTracker || {
      getAllTrackedOrders: jest.fn(() => [
        {
          orderId: 'order-1',
          strategyKey: 'strategy-1',
          exchange: 'binance',
          pair: 'BTC/USDT',
          exchangeOrderId: 'exchange-1',
          side: 'buy',
          price: '10',
          qty: '1',
          status: 'open',
          createdAt: ts(0),
          updatedAt: ts(5),
        },
      ]),
    };

    return {
      service: new AdminSystemHealthService(
        apiKeys as any,
        health as any,
        metrics as any,
        balanceRefresh as any,
        balanceCache as any,
        userStream as any,
        userStreamIngestion as any,
        orderTracker as any,
      ),
      mocks: {
        apiKeys,
        health,
        metrics,
        balanceRefresh,
        balanceCache,
        userStream,
        userStreamIngestion,
        orderTracker,
      },
    };
  }

  it('returns bounded health groups from internal cached data without secrets', async () => {
    const { service } = buildService();
    const response = await service.getHealth();

    expect(response.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(response.filters.availableGroups).toEqual([
      'connector',
      'core',
      'orders',
      'queue',
      'runtime',
      'stream',
    ]);
    expect(response.services.some((row) => row.id === 'queue.snapshots')).toBe(
      true,
    );
    expect(
      response.services.some((row) => row.id === 'connector.api-keys'),
    ).toBe(true);
    expect(
      response.services.some(
        (row) => row.id === 'connector.balance-cache.binance.maker',
      ),
    ).toBe(true);
    expect(response.summary.total).toBe(response.services.length);
    expect(JSON.stringify(response)).not.toContain('must-not-leak');
    expect(response.limits.maxServices).toBe(100);
  });

  it('filters by real group and exact service id', async () => {
    const { service } = buildService();

    await expect(service.getHealth({ group: 'connector' })).resolves.toMatchObject({
      groups: [{ name: 'connector' }],
    });

    const response = await service.getHealth({
      service: 'connector.api-keys',
    });

    expect(response.services).toHaveLength(1);
    expect(response.services[0].id).toBe('connector.api-keys');
    expect(response.filters.availableServices.length).toBeGreaterThan(1);
  });

  it('rejects invalid filter identifiers', async () => {
    const { service } = buildService();

    await expect(service.getHealth({ group: '../secrets' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.getHealth({ service: 'x'.repeat(81) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not call private exchange, live balance, or mutating cache methods', async () => {
    const { service, mocks } = buildService();

    await service.getHealth();

    expect(mocks.health.checkSnapshotPollingHealth).toHaveBeenCalledTimes(1);
    expect(mocks.health.getAllHealth).not.toHaveBeenCalled();
    expect(mocks.health.getExchangeHealth).not.toHaveBeenCalled();
    expect(mocks.balanceRefresh.refreshAccount).not.toHaveBeenCalled();
    expect(mocks.balanceRefresh.refreshDueAccounts).not.toHaveBeenCalled();
    expect(mocks.balanceCache.hasFreshAccountSnapshot).not.toHaveBeenCalled();
    expect(mocks.balanceCache.isFresh).not.toHaveBeenCalled();
  });

  it('bounds connector account services and metadata rows', async () => {
    const accounts = Array.from({ length: 40 }, (_, index) => ({
      exchange: 'binance',
      accountLabel: `account-${index}`,
    }));
    const keys = Array.from({ length: 40 }, (_, index) => ({
      key_id: String(index),
      exchange: 'binance',
      name: `account-${index}`,
      permissions: 'read',
      validation_status: 'valid',
      created_at: ts(0),
    }));
    const { service, mocks } = buildService({
      apiKeys: {
        count: jest.fn(async () => 40),
        find: jest.fn(async () => keys.slice(0, 25)),
      },
      balanceRefresh: {
        getRegisteredAccounts: jest.fn(() => accounts),
        getHealthState: jest.fn(() => 'healthy'),
        getLastRefreshTime: jest.fn(() => ts(4)),
      },
    });
    const response = await service.getHealth({ group: 'connector' });

    expect(mocks.apiKeys.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
    expect(
      response.services.filter((row) =>
        row.id.startsWith('connector.balance-cache.'),
      ),
    ).toHaveLength(25);
    expect(response.services).toHaveLength(26);
  });
});

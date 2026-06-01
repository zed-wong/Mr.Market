import { BadRequestException } from '@nestjs/common';

import { AdminDashboardService } from './admin-dashboard.service';

type Row = Record<string, any>;

const ts = (minute: number) =>
  `2026-05-23T00:${String(minute).padStart(2, '0')}:00.000Z`;

function createRepository(rows: Row[]) {
  return {
    count: jest.fn(async (options?: { where?: Row }) => {
      const where = options?.where || {};

      return rows.filter((row) =>
        Object.entries(where).every(([key, value]) => {
          if (typeof value === 'object') {
            return true;
          }

          return row[key] === value;
        }),
      ).length;
    }),
    find: jest.fn(async (options?: { take?: number; order?: Row }) => {
      const take = options?.take ?? rows.length;
      const orderField = Object.keys(options?.order || {})[0];
      const sorted = orderField
        ? [...rows].sort((left, right) =>
            String(right[orderField] || '').localeCompare(
              String(left[orderField] || ''),
            ),
          )
        : rows;

      return sorted.slice(0, take);
    }),
  };
}

describe('AdminDashboardService', () => {
  function buildService(overrides: Partial<Record<string, any>> = {}) {
    const strategies = createRepository([
      {
        strategyKey: 'strategy-1',
        strategyType: 'market-making',
        status: 'running',
        strategyDefinitionId: 'definition-1',
        strategyDefinitionSnapshot: { definitionName: 'Direct MM' },
        marketMakingOrderId: 'order-1',
        createdAt: ts(1),
        updatedAt: ts(2),
      },
      {
        strategyKey: 'strategy-2',
        strategyType: 'market-making',
        status: 'stopped',
        createdAt: ts(3),
        updatedAt: ts(4),
      },
    ]);
    const definitions = createRepository([{ id: 'definition-1' }]);
    const intents = createRepository(
      Array.from({ length: 12 }, (_, index) => ({
        intentId: `intent-${index}`,
        runtimeInstanceKey: `runtime-${index}`,
        strategyKey: 'strategy-1',
        userId: 'user-1',
        clientId: 'client-1',
        type: 'CREATE_LIMIT_ORDER',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '10',
        qty: '1',
        status: index === 0 ? 'SENT' : 'DONE',
        createdAt: ts(index),
        updatedAt: ts(index),
      })),
    );
    const trackedOrders = createRepository(
      Array.from({ length: 12 }, (_, index) => ({
        trackingKey: `track-${index}`,
        orderId: `order-${index}`,
        strategyKey: 'strategy-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: `exchange-order-${index}`,
        side: 'buy',
        price: '10',
        qty: '1',
        cumulativeFilledQty: index === 0 ? '0.5' : undefined,
        status: index === 0 ? 'open' : 'filled',
        createdAt: ts(index),
        updatedAt: ts(index),
      })),
    );
    const balances = createRepository([
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'BTC',
        available: '1.5',
        locked: '0.5',
        total: '2',
        updatedAt: ts(5),
      },
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        available: '100',
        locked: '25',
        total: '125',
        updatedAt: ts(6),
      },
    ]);
    const marketPairs = createRepository([]);
    const apiKeys = createRepository([
      {
        key_id: '1',
        exchange: 'binance',
        name: 'maker',
        permissions: 'read-trade',
        validation_status: 'valid',
        validated_at: ts(7),
        created_at: ts(0),
        api_key: 'must-not-leak',
        api_secret: 'must-not-leak',
      },
    ]);
    const executions = createRepository([
      {
        amount: '2',
        price: '10',
        executedAt: ts(8),
      },
    ]);
    const metrics = {
      getRuntimeMetrics: jest.fn(() => ({
        stats: Array.from({ length: 12 }, (_, index) => ({
          scope: `scope-${index}`,
          count: 1,
          totalDurationMs: 1,
          avgDurationMs: 1,
          maxDurationMs: 1,
          lastDurationMs: 1,
          lastRecordedAt: ts(9),
          lastMetadata: {},
        })),
        recent: Array.from({ length: 12 }, (_, index) => ({
          scope: `scope-${index}`,
          durationMs: 1,
          recordedAt: ts(9),
          metadata: {},
        })),
      })),
    };
    const reconciliation = {
      reconcileLedgerInvariants: jest.fn(async () => ({
        checked: 2,
        violations: 0,
      })),
      reconcileIntentLifecycleConsistency: jest.fn(async () => ({
        checked: 12,
        violations: 1,
      })),
    };
    const health = {
      checkSnapshotPollingHealth: jest.fn(async () => ({
        status: 'warning',
        timestamp: ts(10),
        queue: { name: 'snapshots' },
        metrics: { waiting: 0 },
        issues: ['execution_blocked'],
      })),
    };

    return new AdminDashboardService(
      overrides.strategies || (strategies as any),
      overrides.definitions || (definitions as any),
      overrides.intents || (intents as any),
      overrides.trackedOrders || (trackedOrders as any),
      overrides.balances || (balances as any),
      overrides.marketPairs || (marketPairs as any),
      overrides.apiKeys || (apiKeys as any),
      overrides.executions || (executions as any),
      overrides.metrics || (metrics as any),
      overrides.reconciliation || (reconciliation as any),
      overrides.health || (health as any),
    );
  }

  it('returns bounded RFC3339 dashboard sections from existing data sources', async () => {
    const summary = await buildService().getSummary('24h');

    expect(summary.range.key).toBe('24h');
    expect(summary.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(summary.kpis.activeStrategies).toBe(1);
    expect(summary.kpis.openOrders).toBe(1);
    expect(summary.kpis.totalCapital).toBe('127');
    expect(summary.intents.recent).toHaveLength(10);
    expect(summary.orderFlow.recent).toHaveLength(10);
    expect(summary.runtime.stats).toHaveLength(10);
    expect(summary.runtime.recent).toHaveLength(10);
    expect(JSON.stringify(summary)).not.toContain('must-not-leak');
  });

  it('rejects unsupported ranges instead of silently accepting them', async () => {
    await expect(buildService().getSummary('all')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    ['repeated array values', ['24h', '7d']],
    ['nested object values', { value: '24h' }],
    ['non-string numeric values', 24],
    ['non-string boolean values', true],
  ])('rejects raw %s before using string methods', async (_label, value) => {
    await expect(buildService().getSummary(value)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reports tracked order totals consistently with the orders API all-time count', async () => {
    const trackedOrders = createRepository(
      Array.from({ length: 3 }, (_, index) => ({
        trackingKey: `track-${index}`,
        orderId: `order-${index}`,
        strategyKey: '**********',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: `exchange-order-${index}`,
        side: 'buy',
        price: '10',
        qty: '1',
        cumulativeFilledQty: undefined,
        status: index === 0 ? 'open' : 'filled',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: ts(index),
      })),
    );

    const summary = await buildService({ trackedOrders }).getSummary('24h');

    expect(summary.kpis.trackedOrders).toBe(3);
    expect(summary.orderFlow.total).toBe(3);
    expect(trackedOrders.count).toHaveBeenCalledWith();
  });

  it('groups capital by display symbol when ledger rows contain asset ids', async () => {
    const balances = createRepository([
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        available: '5',
        locked: '0',
        total: '5',
        updatedAt: ts(1),
      },
      {
        orderId: 'order-2',
        userId: 'user-1',
        assetId: 'asset-usdt',
        available: '10',
        locked: '1',
        total: '11',
        updatedAt: ts(2),
      },
      {
        orderId: 'order-3',
        userId: 'user-1',
        assetId: 'asset-eth',
        available: '0.25',
        locked: '0',
        total: '0.25',
        updatedAt: ts(3),
      },
    ]);
    const marketPairs = createRepository([
      {
        base_asset_id: 'asset-eth',
        base_symbol: 'ETH',
        quote_asset_id: 'asset-usdt',
        quote_symbol: 'USDT',
      },
    ]);

    const summary = await buildService({ balances, marketPairs }).getSummary(
      '24h',
    );

    expect(summary.capital.byAsset).toEqual([
      {
        asset: 'USDT',
        available: '15',
        locked: '1',
        total: '16',
      },
      {
        asset: 'ETH',
        available: '0.25',
        locked: '0',
        total: '0.25',
      },
    ]);
    expect(summary.capital.byAsset.map((row) => row.asset)).not.toContain(
      'asset-usdt',
    );
  });

  it('normalizes nested runtime and health timestamps to RFC3339 strings', async () => {
    const metrics = {
      getRuntimeMetrics: jest.fn(() => ({
        stats: [
          {
            scope: 'tick',
            lastRecordedAt: 'Sat May 23 2026 00:09:00 GMT+0000',
          },
        ],
        recent: [
          {
            scope: 'tick',
            recordedAt: 'Sat May 23 2026 00:10:00 GMT+0000',
          },
        ],
      })),
    };
    const health = {
      checkSnapshotPollingHealth: jest.fn(async () => ({
        status: 'healthy',
        timestamp: 'Sat May 23 2026 00:11:00 GMT+0000',
        queue: { lastPollTimestamp: Date.parse('2026-05-23T00:12:00.000Z') },
        metrics: { nested: { updatedAt: 'Sat May 23 2026 00:13:00 GMT+0000' } },
        issues: [],
      })),
    };

    const summary = await buildService({ metrics, health }).getSummary('24h');

    expect(summary.runtime.stats[0].lastRecordedAt).toBe(
      '2026-05-23T00:09:00.000Z',
    );
    expect(summary.runtime.recent[0].recordedAt).toBe(
      '2026-05-23T00:10:00.000Z',
    );
    expect(summary.health.timestamp).toBe('2026-05-23T00:11:00.000Z');
    expect(summary.health.queue).toEqual({
      lastPollTimestamp: '2026-05-23T00:12:00.000Z',
    });
    expect(summary.health.metrics).toEqual({
      nested: { updatedAt: '2026-05-23T00:13:00.000Z' },
    });
  });

  it('uses read-only reconciliation checks and avoids mutating reconciliation methods', async () => {
    const reconciliation = {
      reconcileLedgerInvariants: jest.fn(async () => ({
        checked: 0,
        violations: 0,
      })),
      reconcileIntentLifecycleConsistency: jest.fn(async () => ({
        checked: 0,
        violations: 0,
      })),
      reconcileEstimatedFeeCorrections: jest.fn(),
      reconcileFillsAgainstExchangeTrades: jest.fn(),
    };

    await buildService({ reconciliation }).getSummary();

    expect(reconciliation.reconcileLedgerInvariants).toHaveBeenCalledTimes(1);
    expect(
      reconciliation.reconcileIntentLifecycleConsistency,
    ).toHaveBeenCalledTimes(1);
    expect(
      reconciliation.reconcileEstimatedFeeCorrections,
    ).not.toHaveBeenCalled();
    expect(
      reconciliation.reconcileFillsAgainstExchangeTrades,
    ).not.toHaveBeenCalled();
  });
});

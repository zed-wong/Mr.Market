/* eslint-disable @typescript-eslint/no-explicit-any */
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';

import { StrategyIntentStoreService } from './strategy-intent-store.service';

const createIntent = (
  overrides?: Partial<StrategyOrderIntentEntity>,
): StrategyOrderIntentEntity => ({
  intentId: 'intent-1',
  strategyInstanceId: 'strategy-1',
  strategyKey: 'strategy-1',
  userId: 'user-1',
  clientId: 'client-1',
  type: 'CREATE_LIMIT_ORDER',
  exchange: 'binance',
  pair: 'BTC/USDT',
  side: 'buy',
  price: '100',
  qty: '1',
  executionCategory: 'clob_cex',
  metadata: { source: 'spec' },
  status: 'NEW',
  errorReason: undefined,
  createdAt: '2026-03-11T00:00:00.000Z',
  updatedAt: '2026-03-11T00:00:00.000Z',
  ...overrides,
});

const createRepository = (rows: StrategyOrderIntentEntity[] = []) => ({
  findOneBy: jest.fn(async ({ intentId }: { intentId: string }) => {
    return rows.find((row) => row.intentId === intentId) || null;
  }),
  save: jest.fn(
    async (
      payload: StrategyOrderIntentEntity | StrategyOrderIntentEntity[],
    ) => {
      const items = Array.isArray(payload) ? payload : [payload];

      for (const item of items) {
        const index = rows.findIndex((row) => row.intentId === item.intentId);

        if (index >= 0) {
          rows[index] = { ...item };
        } else {
          rows.push({ ...item });
        }
      }

      return payload;
    },
  ),
  find: jest.fn(
    async (
      options?:
        | {
            where?: {
              strategyKey?: string;
              status?: { _value?: string[] } | string;
            };
          }
        | undefined,
    ) => {
      const strategyKey = options?.where?.strategyKey;
      const statusFilter = options?.where?.status;
      const expectedStatuses = Array.isArray((statusFilter as any)?._value)
        ? (statusFilter as any)._value
        : typeof statusFilter === 'string'
        ? [statusFilter]
        : undefined;

      return rows
        .filter((row) => {
          if (strategyKey && row.strategyKey !== strategyKey) {
            return false;
          }

          if (expectedStatuses && !expectedStatuses.includes(row.status)) {
            return false;
          }

          return true;
        })
        .map((row) => ({ ...row }));
    },
  ),
  createQueryBuilder: jest.fn(() => {
    const state = {
      limit: 0,
      status: 'NEW',
    };
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest
        .fn()
        .mockImplementation((_sql: string, params: { status: string }) => {
          state.status = params.status;

          return builder;
        }),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation((limit: number) => {
        state.limit = limit;

        return builder;
      }),
      getRawMany: jest.fn(async () => {
        const firstByStrategy = new Map<string, StrategyOrderIntentEntity>();

        for (const row of rows) {
          if (row.status !== state.status) {
            continue;
          }

          const current = firstByStrategy.get(row.strategyKey);

          if (
            !current ||
            current.createdAt > row.createdAt ||
            (current.createdAt === row.createdAt &&
              current.strategyKey > row.strategyKey)
          ) {
            firstByStrategy.set(row.strategyKey, row);
          }
        }

        return [...firstByStrategy.values()]
          .sort((a, b) => {
            if (a.createdAt !== b.createdAt) {
              return a.createdAt.localeCompare(b.createdAt);
            }

            return a.strategyKey.localeCompare(b.strategyKey);
          })
          .slice(0, state.limit || undefined)
          .map((row) => ({ strategyKey: row.strategyKey }));
      }),
    };

    return builder;
  }),
  findOne: jest.fn(
    async ({
      where,
    }: {
      where: {
        strategyKey: string;
        status: { _value?: string } | string;
      };
    }) => {
      const expectedStatuses =
        typeof where.status === 'string'
          ? [where.status]
          : Array.isArray(where.status?._value)
          ? where.status._value
          : undefined;

      return (
        rows
          .filter(
            (row) =>
              row.strategyKey === where.strategyKey &&
              (!expectedStatuses || expectedStatuses.includes(row.status)),
          )
          .sort((a, b) => {
            if (a.createdAt !== b.createdAt) {
              return a.createdAt.localeCompare(b.createdAt);
            }

            return a.intentId.localeCompare(b.intentId);
          })[0] || null
      );
    },
  ),
});

describe('StrategyIntentStoreService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts new intents and preserves original createdAt on update', async () => {
    const rows: StrategyOrderIntentEntity[] = [];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await service.upsertIntent(createIntent() as any);
    await service.upsertIntent(
      createIntent({
        status: 'ACKED',
        createdAt: '2030-01-01T00:00:00.000Z',
      }) as any,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        intentId: 'intent-1',
        status: 'ACKED',
        createdAt: '2026-03-11T00:00:00.000Z',
      }),
    );
  });

  it('updates intent status when the row exists', async () => {
    const rows = [createIntent()];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await service.updateIntentStatus('intent-1', 'FAILED', 'boom');

    expect(rows[0]).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorReason: 'boom',
      }),
    );
  });

  it('no-ops missing status and mixin order id updates', async () => {
    const rows = [createIntent()];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await expect(
      service.updateIntentStatus('missing', 'DONE'),
    ).resolves.toBeUndefined();
    await expect(
      service.attachMixinOrderId('missing', 'ex-1'),
    ).resolves.toBeUndefined();

    expect(rows[0].mixinOrderId).toBeUndefined();
  });

  it('attaches mixin order id to an existing intent', async () => {
    const rows = [createIntent()];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await service.attachMixinOrderId('intent-1', 'ex-1');

    expect(rows[0]).toEqual(
      expect.objectContaining({
        mixinOrderId: 'ex-1',
      }),
    );
  });

  it('lists all rows and returns NEW strategy keys in stable order', async () => {
    const rows = [
      createIntent({
        intentId: 'intent-b1',
        strategyKey: 'b',
        createdAt: '2026-03-11T00:00:02.000Z',
      }),
      createIntent({
        intentId: 'intent-a1',
        strategyKey: 'a',
        createdAt: '2026-03-11T00:00:01.000Z',
      }),
      createIntent({
        intentId: 'intent-a2',
        strategyKey: 'a',
        createdAt: '2026-03-11T00:00:03.000Z',
      }),
      createIntent({
        intentId: 'intent-c-done',
        strategyKey: 'c',
        status: 'DONE',
      }),
    ];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await expect(service.listAll()).resolves.toHaveLength(4);
    await expect(service.listStrategyKeysWithNewIntents(2)).resolves.toEqual([
      'a',
      'b',
    ]);
    await expect(service.listStrategyKeysWithNewIntents(0)).resolves.toEqual(
      [],
    );
  });

  it('returns the oldest non-DONE head intent for a strategy', async () => {
    const rows = [
      createIntent({
        intentId: 'intent-2',
        strategyKey: 'strategy-1',
        createdAt: '2026-03-11T00:00:02.000Z',
      }),
      createIntent({
        intentId: 'intent-1',
        strategyKey: 'strategy-1',
        createdAt: '2026-03-11T00:00:01.000Z',
      }),
      createIntent({
        intentId: 'intent-3',
        strategyKey: 'strategy-1',
        status: 'DONE',
        createdAt: '2026-03-11T00:00:00.000Z',
      }),
    ];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await expect(service.getHeadIntent('strategy-1')).resolves.toEqual(
      expect.objectContaining({
        intentId: 'intent-1',
      }),
    );
    await expect(service.getHeadIntent('missing')).resolves.toBeNull();
  });

  it('returns the oldest NEW intent for a strategy', async () => {
    const rows = [
      createIntent({
        intentId: 'intent-failed',
        strategyKey: 'strategy-1',
        status: 'FAILED',
        createdAt: '2026-03-11T00:00:00.000Z',
      }),
      createIntent({
        intentId: 'intent-new-2',
        strategyKey: 'strategy-1',
        createdAt: '2026-03-11T00:00:02.000Z',
      }),
      createIntent({
        intentId: 'intent-new-1',
        strategyKey: 'strategy-1',
        createdAt: '2026-03-11T00:00:01.000Z',
      }),
    ];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await expect(service.getNextNewIntent('strategy-1')).resolves.toEqual(
      expect.objectContaining({
        intentId: 'intent-new-1',
      }),
    );
  });

  it('reports a blocked queue when a FAILED head intent has later NEW intents', async () => {
    const rows = [
      createIntent({
        intentId: 'intent-failed',
        strategyKey: 'strategy-1',
        status: 'FAILED',
        errorReason: 'minimum notional',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:05.000Z',
      }),
      createIntent({
        intentId: 'intent-new-1',
        strategyKey: 'strategy-1',
        createdAt: '2026-03-11T00:00:01.000Z',
      }),
    ];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await expect(service.getQueueState('strategy-1')).resolves.toEqual({
      blockedByFailure: true,
      headIntentStatus: 'FAILED',
      failedHeadIntentId: 'intent-failed',
      failedHeadUpdatedAt: '2026-03-11T00:00:05.000Z',
      failedHeadErrorReason: 'minimum notional',
    });
  });

  it('cancels pending intents for a strategy without touching terminal rows', async () => {
    const rows = [
      createIntent({
        intentId: 'intent-new',
        strategyKey: 'strategy-1',
        status: 'NEW',
      }),
      createIntent({
        intentId: 'intent-sent',
        strategyKey: 'strategy-1',
        status: 'SENT',
      }),
      createIntent({
        intentId: 'intent-acked',
        strategyKey: 'strategy-1',
        status: 'ACKED',
      }),
      createIntent({
        intentId: 'intent-failed',
        strategyKey: 'strategy-1',
        status: 'FAILED',
      }),
      createIntent({
        intentId: 'intent-done',
        strategyKey: 'strategy-1',
        status: 'DONE',
      }),
    ];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(repository as any);

    await expect(
      service.cancelPendingIntents(
        'strategy-1',
        'strategy stopped before intent execution',
      ),
    ).resolves.toBe(3);

    expect(
      rows
        .filter((row) =>
          ['intent-new', 'intent-sent', 'intent-acked'].includes(row.intentId),
        )
        .map((row) => row.status),
    ).toEqual(['CANCELLED', 'CANCELLED', 'CANCELLED']);
    expect(rows.find((row) => row.intentId === 'intent-failed')?.status).toBe(
      'FAILED',
    );
    expect(rows.find((row) => row.intentId === 'intent-done')?.status).toBe(
      'DONE',
    );
  });
});

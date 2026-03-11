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
  save: jest.fn(async (payload: StrategyOrderIntentEntity) => {
    const index = rows.findIndex((row) => row.intentId === payload.intentId);

    if (index >= 0) {
      rows[index] = { ...payload };
    } else {
      rows.push({ ...payload });
    }

    return payload;
  }),
  find: jest.fn(async () => rows.map((row) => ({ ...row }))),
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
        status: { _value?: string };
      };
    }) => {
      const excludedStatus = where.status?._value;

      return (
        rows
          .filter(
            (row) =>
              row.strategyKey === where.strategyKey &&
              row.status !== excludedStatus,
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
});

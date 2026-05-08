/* eslint-disable @typescript-eslint/no-explicit-any, unused-imports/no-unused-vars */
import { BadRequestException } from '@nestjs/common';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';

import { BalanceLedgerService } from './balance-ledger.service';

type Repo<T> = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
};

const createInMemoryRepos = () => {
  const entries: LedgerEntry[] = [];
  const balances = new Map<string, MarketMakingOrderBalance>();

  const ledgerEntryRepository: Repo<LedgerEntry> = {
    create: jest.fn((payload: LedgerEntry) => payload),
    save: jest.fn(async (payload: LedgerEntry) => {
      entries.push(payload);

      return payload;
    }),
    find: jest.fn(async ({ where }: any = {}) =>
      entries.filter(
        (item) =>
          (!where?.orderId || item.orderId === where.orderId) &&
          (!where?.userId || item.userId === where.userId) &&
          (!where?.assetId || item.assetId === where.assetId),
      ),
    ),
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.idempotencyKey) {
        return (
          entries.find(
            (item) => item.idempotencyKey === where.idempotencyKey,
          ) || null
        );
      }

      return null;
    }),
    findOneBy: jest.fn(async (where: any) => {
      if (where?.entryId) {
        return entries.find((item) => item.entryId === where.entryId) || null;
      }

      if (where?.idempotencyKey) {
        return (
          entries.find(
            (item) => item.idempotencyKey === where.idempotencyKey,
          ) || null
        );
      }

      return null;
    }),
  };

  const balanceReadModelRepository: Repo<MarketMakingOrderBalance> = {
    create: jest.fn((payload: MarketMakingOrderBalance) => payload),
    save: jest.fn(async (payload: MarketMakingOrderBalance) => {
      balances.set(`${payload.orderId}:${payload.assetId}`, payload);

      return payload;
    }),
    find: jest.fn(async ({ where }: any = {}) =>
      Array.from(balances.values()).filter(
        (item) =>
          (!where?.orderId || item.orderId === where.orderId) &&
          (!where?.userId || item.userId === where.userId) &&
          (!where?.assetId || item.assetId === where.assetId),
      ),
    ),
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.orderId && where?.assetId) {
        return balances.get(`${where.orderId}:${where.assetId}`) || null;
      }

      return null;
    }),
    findOneBy: jest.fn(async (where: any) => {
      if (where?.orderId && where?.assetId) {
        return balances.get(`${where.orderId}:${where.assetId}`) || null;
      }

      return null;
    }),
  };

  return {
    entries,
    balances,
    ledgerEntryRepository,
    balanceReadModelRepository,
  };
};

describe('BalanceLedgerService', () => {
  it('applies deposit_credit and projects balance totals', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '100',
      idempotencyKey: 'dep-1',
      refType: 'deposit',
      refId: 'snapshot-1',
    });

    const balance = await service.getBalance('order-1', 'asset-usdt');

    expect(balance.available).toBe('100');
    expect(balance.locked).toBe('0');
    expect(balance.total).toBe('100');
  });

  it('applies reserve_lock and reserve_release while preserving invariant total = available + locked', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '100',
      idempotencyKey: 'dep-1',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    await service.lockFunds({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '40',
      idempotencyKey: 'lock-1',
      refType: 'mm_lock',
      refId: 'order-1',
    });
    await service.unlockFunds({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '10',
      idempotencyKey: 'unlock-1',
      refType: 'mm_unlock',
      refId: 'order-1',
    });

    const balance = await service.getBalance('order-1', 'asset-usdt');

    expect(balance.available).toBe('70');
    expect(balance.locked).toBe('30');
    expect(balance.total).toBe('100');
  });

  it('sums locked balance for a user asset across order scopes', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '10',
      idempotencyKey: 'dep-user-asset-1',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    await service.creditDeposit({
      orderId: 'order-2',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '20',
      idempotencyKey: 'dep-user-asset-2',
      refType: 'deposit',
      refId: 'snapshot-2',
    });
    await service.creditDeposit({
      orderId: 'order-3',
      userId: 'u2',
      assetId: 'asset-usdt',
      amount: '30',
      idempotencyKey: 'dep-user-asset-3',
      refType: 'deposit',
      refId: 'snapshot-3',
    });
    await service.lockFunds({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '3',
      idempotencyKey: 'lock-user-asset-1',
      refType: 'reserve',
      refId: 'intent-1',
    });
    await service.lockFunds({
      orderId: 'order-2',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '4',
      idempotencyKey: 'lock-user-asset-2',
      refType: 'reserve',
      refId: 'intent-2',
    });
    await service.lockFunds({
      orderId: 'order-3',
      userId: 'u2',
      assetId: 'asset-usdt',
      amount: '5',
      idempotencyKey: 'lock-user-asset-3',
      refType: 'reserve',
      refId: 'intent-3',
    });

    await expect(
      service.getLockedBalanceForUserAsset('u1', 'asset-usdt'),
    ).resolves.toBe('7');
  });

  it('is idempotent per idempotency key', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    const first = await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '25',
      idempotencyKey: 'dep-duplicate',
      refType: 'deposit',
      refId: 'snapshot-dup',
    });
    const second = await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '25',
      idempotencyKey: 'dep-duplicate',
      refType: 'deposit',
      refId: 'snapshot-dup',
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(repos.entries).toHaveLength(1);
  });

  it('keeps two orders from the same user and asset isolated', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '25',
      idempotencyKey: 'dep-order-1',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    await service.creditDeposit({
      orderId: 'order-2',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '80',
      idempotencyKey: 'dep-order-2',
      refType: 'deposit',
      refId: 'snapshot-2',
    });

    const first = await service.getBalance('order-1', 'asset-usdt');
    const second = await service.getBalance('order-2', 'asset-usdt');

    expect(first.available).toBe('25');
    expect(second.available).toBe('80');
  });

  it('serializes data source transactions across different balances', async () => {
    const repos = createInMemoryRepos();
    let activeTransactions = 0;
    let maxActiveTransactions = 0;
    const dataSource = {
      transaction: jest.fn(async (callback: any) => {
        activeTransactions += 1;
        maxActiveTransactions = Math.max(
          maxActiveTransactions,
          activeTransactions,
        );
        if (activeTransactions > 1) {
          throw new Error('cannot start a transaction within a transaction');
        }

        try {
          await new Promise((resolve) => setTimeout(resolve, 10));

          return await callback({
            getRepository: (entity: any) =>
              entity === LedgerEntry
                ? repos.ledgerEntryRepository
                : repos.balanceReadModelRepository,
          });
        } finally {
          activeTransactions -= 1;
        }
      }),
    };
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
      undefined,
      dataSource as any,
    );

    await Promise.all([
      service.creditDeposit({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '25',
        idempotencyKey: 'dep-transaction-1',
        refType: 'deposit',
        refId: 'snapshot-1',
      }),
      service.creditDeposit({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-xin',
        amount: '2',
        idempotencyKey: 'dep-transaction-2',
        refType: 'deposit',
        refId: 'snapshot-2',
      }),
    ]);

    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(maxActiveTransactions).toBe(1);
  });

  it('serializes data source transactions across service instances', async () => {
    const repos = createInMemoryRepos();
    let activeTransactions = 0;
    let maxActiveTransactions = 0;
    const dataSource = {
      transaction: jest.fn(async (callback: any) => {
        activeTransactions += 1;
        maxActiveTransactions = Math.max(
          maxActiveTransactions,
          activeTransactions,
        );
        if (activeTransactions > 1) {
          throw new Error('cannot start a transaction within a transaction');
        }

        try {
          await new Promise((resolve) => setTimeout(resolve, 10));

          return await callback({
            getRepository: (entity: any) =>
              entity === LedgerEntry
                ? repos.ledgerEntryRepository
                : repos.balanceReadModelRepository,
          });
        } finally {
          activeTransactions -= 1;
        }
      }),
    };
    const firstService = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
      undefined,
      dataSource as any,
    );
    const secondService = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
      undefined,
      dataSource as any,
    );

    await Promise.all([
      firstService.creditDeposit({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '25',
        idempotencyKey: 'dep-cross-instance-1',
        refType: 'deposit',
        refId: 'snapshot-1',
      }),
      secondService.creditDeposit({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-xin',
        amount: '2',
        idempotencyKey: 'dep-cross-instance-2',
        refType: 'deposit',
        refId: 'snapshot-2',
      }),
    ]);

    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(maxActiveTransactions).toBe(1);
  });

  it('skips explicit data source transactions for sqlite', async () => {
    const repos = createInMemoryRepos();
    const dataSource = {
      options: { type: 'sqlite' },
      transaction: jest.fn(async () => {
        throw new Error('sqlite transaction should not be opened');
      }),
    };
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
      undefined,
      dataSource as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '25',
      idempotencyKey: 'dep-sqlite-no-transaction',
      refType: 'deposit',
      refId: 'snapshot-1',
    });

    const balance = await service.getBalance('order-1', 'asset-usdt');

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(balance.available).toBe('25');
  });

  it('rejects duplicate idempotency key with a different payload', async () => {
    const repos = createInMemoryRepos();
    const durabilityService = { appendOutboxEvent: jest.fn() };
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
      durabilityService as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '25',
      idempotencyKey: 'dep-duplicate',
      refType: 'deposit',
      refId: 'snapshot-dup',
    });

    await expect(
      service.creditDeposit({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '26',
        idempotencyKey: 'dep-duplicate',
        refType: 'deposit',
        refId: 'snapshot-dup',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(durabilityService.appendOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'ledger.idempotency_conflict',
        aggregateType: 'ledger_entry',
      }),
    );
  });

  it('rejects lock when available balance is insufficient', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await expect(
      service.lockFunds({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '10',
        idempotencyKey: 'lock-insufficient',
        refType: 'mm_lock',
        refId: 'order-2',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not apply balance mutation when duplicate idempotency insert error occurs', async () => {
    const repos = createInMemoryRepos();
    const balanceWriteCount: number[] = [];

    repos.balanceReadModelRepository.save = jest.fn(
      async (payload: MarketMakingOrderBalance) => {
        balanceWriteCount.push(1);
        repos.balances.set(`${payload.orderId}:${payload.assetId}`, payload);

        return payload;
      },
    );

    repos.ledgerEntryRepository.findOneBy = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        entryId: 'existing-entry',
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '10',
        type: 'deposit_credit',
        idempotencyKey: 'dup-key',
        idempotencyContentHash:
          '470235451c29baec8f5290e972ea792df172132a701f84237665c0cf0f66179d',
        createdAt: '2026-02-11T00:00:00.000Z',
      });
    repos.ledgerEntryRepository.save = jest
      .fn()
      .mockRejectedValue({ code: '23505', message: 'duplicate key value' });

    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    const result = await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '10',
      idempotencyKey: 'dup-key',
      refType: 'deposit',
      refId: 'snapshot-dup',
    });

    expect(result.applied).toBe(false);
    const balance = await service.getBalance('order-1', 'asset-usdt');

    expect(balance.available).toBe('0');
    expect(balance.locked).toBe('0');
    expect(balance.total).toBe('0');
    expect(balanceWriteCount.length).toBeLessThanOrEqual(1);
  });

  it('serializes concurrent mutations for the same order and asset', async () => {
    const entries: LedgerEntry[] = [];
    const balances = new Map<string, MarketMakingOrderBalance>();
    const key = 'order-1:asset-usdt';

    balances.set(key, {
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      available: '100',
      locked: '0',
      total: '100',
      initialDeposit: '100',
      realizedDelta: '0',
      feePaid: '0',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    const pause = async () =>
      await new Promise((resolve) => setTimeout(resolve, 5));

    const ledgerEntryRepository: Repo<LedgerEntry> = {
      create: jest.fn((payload: LedgerEntry) => payload),
      save: jest.fn(async (payload: LedgerEntry) => {
        await pause();
        entries.push(payload);

        return payload;
      }),
      find: jest.fn(async ({ where }: any) =>
        entries.filter(
          (item) =>
            item.orderId === where.orderId && item.assetId === where.assetId,
        ),
      ),
      findOne: jest.fn(async () => null),
      findOneBy: jest.fn(async (where: any) => {
        if (!where?.idempotencyKey) {
          return null;
        }

        return (
          entries.find(
            (item) => item.idempotencyKey === where.idempotencyKey,
          ) || null
        );
      }),
    };

    const balanceReadModelRepository: Repo<MarketMakingOrderBalance> = {
      create: jest.fn((payload: MarketMakingOrderBalance) => payload),
      save: jest.fn(async (payload: MarketMakingOrderBalance) => {
        await pause();
        balances.set(`${payload.orderId}:${payload.assetId}`, { ...payload });

        return payload;
      }),
      find: jest.fn(async () => Array.from(balances.values())),
      findOne: jest.fn(async ({ where }: any) => {
        const row = balances.get(`${where.orderId}:${where.assetId}`);

        return row ? { ...row } : null;
      }),
      findOneBy: jest.fn(async (where: any) => {
        const row = balances.get(`${where.orderId}:${where.assetId}`);

        return row ? { ...row } : null;
      }),
    };

    const service = new BalanceLedgerService(
      ledgerEntryRepository as any,
      balanceReadModelRepository as any,
    );

    const [first, second] = await Promise.allSettled([
      service.lockFunds({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '70',
        idempotencyKey: 'lock-serial-1',
        refType: 'mm_lock',
        refId: 'order-1',
      }),
      service.lockFunds({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '70',
        idempotencyKey: 'lock-serial-2',
        refType: 'mm_lock',
        refId: 'order-2',
      }),
    ]);

    const fulfilled = [first, second].filter(
      (result) => result.status === 'fulfilled',
    );
    const rejected = [first, second].filter(
      (result) => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const balance = await service.getBalance('order-1', 'asset-usdt');

    expect(balance.available).toBe('30');
    expect(balance.locked).toBe('70');
    expect(balance.total).toBe('100');
    expect((service as any).balanceMutationLocks.size).toBe(0);
  });

  it('rebuilds an order balance from ledger entries', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '100',
      idempotencyKey: 'dep-rebuild',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    await service.lockFunds({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '30',
      idempotencyKey: 'lock-rebuild',
      refType: 'reserve',
      refId: 'intent-1',
    });

    const result = await service.rebuildOrderBalance('order-1', 'asset-usdt');

    expect(result.matches).toBe(true);
    expect(result.expected.available).toBe('70');
    expect(result.expected.locked).toBe('30');
    expect(result.expected.total).toBe('100');
  });

  it('settles negative fill amounts against locked balance', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '100',
      idempotencyKey: 'dep-fill',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    await service.lockFunds({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '60',
      idempotencyKey: 'lock-fill',
      refType: 'reserve',
      refId: 'intent-1',
    });
    await service.adjust({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '-25',
      idempotencyKey: 'fill-quote',
      refType: 'market_making_fill',
      refId: 'trade-1',
    });

    const balance = await service.getBalance('order-1', 'asset-usdt');

    expect(balance.available).toBe('40');
    expect(balance.locked).toBe('35');
    expect(balance.total).toBe('75');
  });

  it('settles a fully filled buy by consuming locked quote and crediting received base', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'USDT',
      amount: '100',
      idempotencyKey: 'dep-full-fill-quote',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    await service.lockFunds({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'USDT',
      amount: '100',
      idempotencyKey: 'lock-full-fill-quote',
      refType: 'reserve',
      refId: 'intent-1',
    });
    await service.adjust({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'USDT',
      amount: '-100',
      idempotencyKey: 'fill-full-quote',
      refType: 'market_making_fill',
      refId: 'trade-1',
    });
    await service.adjust({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'BTC',
      amount: '1',
      idempotencyKey: 'fill-full-base',
      refType: 'market_making_fill',
      refId: 'trade-1',
    });

    const quoteBalance = await service.getBalance('order-1', 'USDT');
    const baseBalance = await service.getBalance('order-1', 'BTC');

    expect(quoteBalance.available).toBe('0');
    expect(quoteBalance.locked).toBe('0');
    expect(quoteBalance.total).toBe('0');
    expect(baseBalance.available).toBe('1');
    expect(baseBalance.locked).toBe('0');
    expect(baseBalance.total).toBe('1');
  });

  it('reverses fee debits without inflating realized delta', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'USDT',
      amount: '10',
      idempotencyKey: 'dep-fee-reversal',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    const feeDebit = await service.debitFee({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'USDT',
      amount: '0.1',
      idempotencyKey: 'estimated-fee',
      refType: 'market_making_estimated_fee',
      refId: 'trade-1',
    });

    await service.reverse({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'USDT',
      amount: '0.1',
      idempotencyKey: 'estimated-fee-reversal',
      refType: 'market_making_estimated_fee_reversal',
      refId: 'trade-1',
      reversalOf: feeDebit.entry.entryId,
    });

    const balance = await service.getBalance('order-1', 'USDT');
    const rebuild = await service.rebuildOrderBalance('order-1', 'USDT');

    expect(balance.available).toBe('10');
    expect(balance.feePaid).toBe('0');
    expect(balance.realizedDelta).toBe('0');
    expect(rebuild.matches).toBe(true);
  });

  it('rejects negative fill settlement without enough locked balance', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await expect(
      service.adjust({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '-25',
        idempotencyKey: 'fill-quote',
        refType: 'market_making_fill',
        refId: 'trade-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('pauses new reservation when rebuild detects a read-model mismatch', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      orderId: 'order-1',
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '100',
      idempotencyKey: 'dep-mismatch',
      refType: 'deposit',
      refId: 'snapshot-1',
    });

    const stored = repos.balances.get('order-1:asset-usdt');

    repos.balances.set('order-1:asset-usdt', {
      ...stored,
      available: '99',
    } as MarketMakingOrderBalance);

    const result = await service.rebuildOrderBalance('order-1', 'asset-usdt');

    expect(result.matches).toBe(false);
    await expect(
      service.lockFunds({
        orderId: 'order-1',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '1',
        idempotencyKey: 'lock-after-mismatch',
        refType: 'reserve',
        refId: 'intent-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

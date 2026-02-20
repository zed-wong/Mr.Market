import { BadRequestException } from '@nestjs/common';
import { BalanceReadModel } from 'src/common/entities/ledger/balance-read-model.entity';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';

import { BalanceLedgerService } from './balance-ledger.service';

type Repo<T> = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
};

const createInMemoryRepos = () => {
  const entries: LedgerEntry[] = [];
  const balances = new Map<string, BalanceReadModel>();

  const ledgerEntryRepository: Repo<LedgerEntry> = {
    create: jest.fn((payload: LedgerEntry) => payload),
    save: jest.fn(async (payload: LedgerEntry) => {
      entries.push(payload);

      return payload;
    }),
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

  const balanceReadModelRepository: Repo<BalanceReadModel> = {
    create: jest.fn((payload: BalanceReadModel) => payload),
    save: jest.fn(async (payload: BalanceReadModel) => {
      balances.set(`${payload.userId}:${payload.assetId}`, payload);

      return payload;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.userId && where?.assetId) {
        return balances.get(`${where.userId}:${where.assetId}`) || null;
      }

      return null;
    }),
    findOneBy: jest.fn(async (where: any) => {
      if (where?.userId && where?.assetId) {
        return balances.get(`${where.userId}:${where.assetId}`) || null;
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
  it('applies DEPOSIT_CREDIT and projects balance totals', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '100',
      idempotencyKey: 'dep-1',
      refType: 'deposit',
      refId: 'snapshot-1',
    });

    const balance = await service.getBalance('u1', 'asset-usdt');

    expect(balance.available).toBe('100');
    expect(balance.locked).toBe('0');
    expect(balance.total).toBe('100');
  });

  it('applies LOCK and UNLOCK while preserving invariant total = available + locked', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await service.creditDeposit({
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '100',
      idempotencyKey: 'dep-1',
      refType: 'deposit',
      refId: 'snapshot-1',
    });
    await service.lockFunds({
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '40',
      idempotencyKey: 'lock-1',
      refType: 'mm_lock',
      refId: 'order-1',
    });
    await service.unlockFunds({
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '10',
      idempotencyKey: 'unlock-1',
      refType: 'mm_unlock',
      refId: 'order-1',
    });

    const balance = await service.getBalance('u1', 'asset-usdt');

    expect(balance.available).toBe('70');
    expect(balance.locked).toBe('30');
    expect(balance.total).toBe('100');
  });

  it('is idempotent per idempotency key', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    const first = await service.creditDeposit({
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '25',
      idempotencyKey: 'dep-duplicate',
      refType: 'deposit',
      refId: 'snapshot-dup',
    });
    const second = await service.creditDeposit({
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

  it('rejects lock when available balance is insufficient', async () => {
    const repos = createInMemoryRepos();
    const service = new BalanceLedgerService(
      repos.ledgerEntryRepository as any,
      repos.balanceReadModelRepository as any,
    );

    await expect(
      service.lockFunds({
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
      async (payload: BalanceReadModel) => {
        balanceWriteCount.push(1);
        repos.balances.set(`${payload.userId}:${payload.assetId}`, payload);

        return payload;
      },
    );

    repos.ledgerEntryRepository.findOneBy = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        entryId: 'existing-entry',
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '10',
        type: 'DEPOSIT_CREDIT',
        idempotencyKey: 'dup-key',
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
      userId: 'u1',
      assetId: 'asset-usdt',
      amount: '10',
      idempotencyKey: 'dup-key',
      refType: 'deposit',
      refId: 'snapshot-dup',
    });

    expect(result.applied).toBe(false);
    const balance = await service.getBalance('u1', 'asset-usdt');

    expect(balance.available).toBe('0');
    expect(balance.locked).toBe('0');
    expect(balance.total).toBe('0');
    expect(balanceWriteCount.length).toBeLessThanOrEqual(1);
  });

  it('serializes concurrent mutations for the same user and asset', async () => {
    const entries: LedgerEntry[] = [];
    const balances = new Map<string, BalanceReadModel>();
    const key = 'u1:asset-usdt';

    balances.set(key, {
      userId: 'u1',
      assetId: 'asset-usdt',
      available: '100',
      locked: '0',
      total: '100',
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

    const balanceReadModelRepository: Repo<BalanceReadModel> = {
      create: jest.fn((payload: BalanceReadModel) => payload),
      save: jest.fn(async (payload: BalanceReadModel) => {
        await pause();
        balances.set(`${payload.userId}:${payload.assetId}`, { ...payload });

        return payload;
      }),
      findOne: jest.fn(async ({ where }: any) => {
        const row = balances.get(`${where.userId}:${where.assetId}`);

        return row ? { ...row } : null;
      }),
      findOneBy: jest.fn(async (where: any) => {
        const row = balances.get(`${where.userId}:${where.assetId}`);

        return row ? { ...row } : null;
      }),
    };

    const service = new BalanceLedgerService(
      ledgerEntryRepository as any,
      balanceReadModelRepository as any,
    );

    const [first, second] = await Promise.allSettled([
      service.lockFunds({
        userId: 'u1',
        assetId: 'asset-usdt',
        amount: '70',
        idempotencyKey: 'lock-serial-1',
        refType: 'mm_lock',
        refId: 'order-1',
      }),
      service.lockFunds({
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

    const balance = await service.getBalance('u1', 'asset-usdt');

    expect(balance.available).toBe('30');
    expect(balance.locked).toBe('70');
    expect(balance.total).toBe('100');
  });
});

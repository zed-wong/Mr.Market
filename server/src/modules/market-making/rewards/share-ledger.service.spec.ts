import { ShareLedgerService } from './share-ledger.service';

describe('ShareLedgerService', () => {
  it('mints and burns shares in append-only ledger', async () => {
    const entries: any[] = [];
    const repository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        entries.push(payload);

        return payload;
      }),
      find: jest.fn(async () => entries),
    };

    const service = new ShareLedgerService(repository as any);

    await service.mintShares('u1', '100', 'dep-1', '2026-02-11T00:00:00.000Z');
    await service.burnShares('u1', '20', 'wd-1', '2026-02-11T12:00:00.000Z');

    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('MINT');
    expect(entries[1].type).toBe('BURN');
  });

  it('computes time-weighted shares over a window', async () => {
    const entries = [
      {
        entryId: '1',
        userId: 'u1',
        type: 'MINT',
        amount: '100',
        refId: 'dep-1',
        createdAt: '2026-02-11T00:00:00.000Z',
      },
      {
        entryId: '2',
        userId: 'u1',
        type: 'BURN',
        amount: '40',
        refId: 'wd-1',
        createdAt: '2026-02-11T12:00:00.000Z',
      },
    ];

    const repository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => payload),
      find: jest.fn(async () => entries),
    };

    const service = new ShareLedgerService(repository as any);
    const weights = await service.computeTimeWeightedShares(
      '2026-02-11T00:00:00.000Z',
      '2026-02-12T00:00:00.000Z',
    );

    expect(weights[0].userId).toBe('u1');
    expect(weights[0].basisShares).toBe('80');
  });
});

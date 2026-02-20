import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  it('reports zero violations when ledger balances are valid', async () => {
    const balanceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: 'u1',
          assetId: 'usdt',
          available: '70',
          locked: '30',
          total: '100',
        },
      ]),
    };
    const orderTracker = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    const service = new ReconciliationService(
      balanceRepo as any,
      orderTracker as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );

    const report = await service.reconcileLedgerInvariants();

    expect(report.violations).toBe(0);
  });

  it('detects ledger invariant violations', async () => {
    const balanceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: 'u1',
          assetId: 'usdt',
          available: '60',
          locked: '30',
          total: '100',
        },
      ]),
    };
    const orderTracker = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    const service = new ReconciliationService(
      balanceRepo as any,
      orderTracker as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );

    const report = await service.reconcileLedgerInvariants();

    expect(report.violations).toBe(1);
  });

  it('detects reward consistency mismatch when allocations exceed reward amount', async () => {
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      {
        find: jest
          .fn()
          .mockResolvedValue([
            { txHash: 'tx-1', amount: '100', campaignId: 'c1', dayIndex: 1 },
          ]),
      } as any,
      {
        find: jest.fn().mockResolvedValue([
          { rewardTxHash: 'tx-1', amount: '80' },
          { rewardTxHash: 'tx-1', amount: '30' },
        ]),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );

    const report = await service.reconcileRewardConsistency();

    expect(report.violations).toBe(1);
  });

  it('detects stale SENT intents and DONE intents without exchange order id', async () => {
    const staleTs = '2026-01-01T00:00:00.000Z';
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        find: jest.fn().mockResolvedValue([
          {
            intentId: 'intent-1',
            type: 'CREATE_LIMIT_ORDER',
            status: 'DONE',
            mixinOrderId: null,
            createdAt: staleTs,
            updatedAt: staleTs,
          },
          {
            intentId: 'intent-2',
            type: 'CREATE_LIMIT_ORDER',
            status: 'SENT',
            mixinOrderId: null,
            createdAt: staleTs,
            updatedAt: staleTs,
          },
        ]),
      } as any,
    );

    const report = await service.reconcileIntentLifecycleConsistency();

    expect(report.violations).toBe(2);
  });
});

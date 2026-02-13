import { RewardPipelineService } from './reward-pipeline.service';

describe('RewardPipelineService', () => {
  it('creates reward allocations and credits ledger balances', async () => {
    const rewardRows: any[] = [];
    const allocationRows: any[] = [];

    const rewardLedgerRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        rewardRows.push(payload);

        return payload;
      }),
      findOneBy: jest.fn(async ({ txHash }) => {
        return rewardRows.find((row) => row.txHash === txHash) || null;
      }),
      find: jest.fn(async () => rewardRows),
    };

    const rewardAllocationRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        const index = allocationRows.findIndex(
          (row) => row.allocationId === payload.allocationId,
        );

        if (index >= 0) {
          allocationRows[index] = { ...allocationRows[index], ...payload };

          return allocationRows[index];
        }
        allocationRows.push(payload);

        return payload;
      }),
      find: jest.fn(async ({ where }) => {
        return allocationRows.filter(
          (row) => row.rewardTxHash === where.rewardTxHash,
        );
      }),
    };

    const balanceLedgerService = {
      creditReward: jest.fn().mockResolvedValue({ applied: true }),
    };
    const shareLedgerService = {
      computeTimeWeightedShares: jest.fn().mockResolvedValue([]),
    };

    const service = new RewardPipelineService(
      rewardLedgerRepository as any,
      rewardAllocationRepository as any,
      balanceLedgerService as any,
      shareLedgerService as any,
    );

    await service.observeReward({
      txHash: 'tx-1',
      token: 'HFT',
      amount: '100',
      campaignId: 'campaign-1',
      dayIndex: 1,
    });

    await service.createAllocations('tx-1', [
      { userId: 'u1', basisShares: '70' },
      { userId: 'u2', basisShares: '30' },
    ]);
    await service.distributeAllocations('tx-1');

    expect(allocationRows).toHaveLength(2);
    expect(balanceLedgerService.creditReward).toHaveBeenCalledTimes(2);
  });

  it('applies floor rounding and gives remainder to largest-share user', async () => {
    const rewardRows: any[] = [];
    const allocationRows: any[] = [];

    const rewardLedgerRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        rewardRows.push(payload);

        return payload;
      }),
      findOneBy: jest.fn(async ({ txHash }) => {
        return rewardRows.find((row) => row.txHash === txHash) || null;
      }),
      find: jest.fn(async () => rewardRows),
    };

    const rewardAllocationRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        allocationRows.push(payload);

        return payload;
      }),
      find: jest.fn(async ({ where }) => {
        return allocationRows.filter(
          (row) => row.rewardTxHash === where.rewardTxHash,
        );
      }),
    };

    const service = new RewardPipelineService(
      rewardLedgerRepository as any,
      rewardAllocationRepository as any,
      { creditReward: jest.fn().mockResolvedValue({ applied: true }) } as any,
      { computeTimeWeightedShares: jest.fn().mockResolvedValue([]) } as any,
    );

    await service.observeReward({
      txHash: 'tx-round',
      token: 'HFT',
      amount: '1',
      campaignId: 'campaign-1',
      dayIndex: 2,
    });

    await service.createAllocations('tx-round', [
      { userId: 'u1', basisShares: '1' },
      { userId: 'u2', basisShares: '1' },
      { userId: 'u3', basisShares: '1' },
    ]);

    expect(allocationRows).toHaveLength(3);
    const amounts = allocationRows.map((row) => row.amount);
    const total = amounts.reduce((acc, v) => Number(acc) + Number(v), 0);

    expect(Number(total.toFixed(8))).toBe(1);
    expect(Number(allocationRows[0].amount)).toBeGreaterThanOrEqual(
      Number(allocationRows[1].amount),
    );
  });
});

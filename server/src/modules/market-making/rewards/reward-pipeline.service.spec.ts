/* eslint-disable @typescript-eslint/no-explicit-any */
import BigNumber from 'bignumber.js';

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
      { userId: 'u1', orderId: 'order-1', basisShares: '70' },
      { userId: 'u2', orderId: 'order-2', basisShares: '30' },
    ]);
    await service.distributeAllocations('tx-1');

    expect(allocationRows).toHaveLength(2);
    expect(balanceLedgerService.creditReward).toHaveBeenCalledTimes(2);
    expect(balanceLedgerService.creditReward).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', userId: 'u1' }),
    );
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
      { userId: 'u1', orderId: 'order-1', basisShares: '1' },
      { userId: 'u2', orderId: 'order-2', basisShares: '1' },
      { userId: 'u3', orderId: 'order-3', basisShares: '1' },
    ]);

    expect(allocationRows).toHaveLength(3);
    const amounts = allocationRows.map((row) => row.amount);
    const total = amounts.reduce((acc, v) => Number(acc) + Number(v), 0);

    expect(Number(total.toFixed(8))).toBe(1);
    expect(Number(allocationRows[0].amount)).toBeGreaterThanOrEqual(
      Number(allocationRows[1].amount),
    );
  });

  it('records undistributed remainder when a reward has no positive internal shares', async () => {
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

    const reward = await service.observeReward({
      txHash: 'tx-zero-score',
      token: 'HFT',
      amount: '100',
      campaignId: 'campaign-1',
      dayIndex: 3,
    });
    reward.platformFee = '12.5';

    await service.createAllocations('tx-zero-score', [
      { userId: 'u1', orderId: 'order-1', basisShares: '0' },
      { userId: 'u2', orderId: 'order-2', basisShares: '0' },
    ]);

    expect(allocationRows).toHaveLength(0);
    expect(reward.platformFee).toBe('12.5');
    expect(reward.undistributedRemainder).toBe('87.5');
  });

  it('keeps reward accounting equal to gross payout after platform fee', async () => {
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

    const reward = await service.observeReward({
      txHash: 'tx-platform-fee',
      token: 'HFT',
      amount: '100',
      campaignId: 'campaign-1',
      dayIndex: 4,
    });
    reward.platformFee = '9.25';

    await service.createAllocations('tx-platform-fee', [
      { userId: 'u1', orderId: 'order-1', basisShares: '2' },
      { userId: 'u2', orderId: 'order-2', basisShares: '1' },
    ]);

    const allocated = allocationRows.reduce(
      (acc, row) => acc.plus(row.amount),
      new BigNumber(0),
    );
    const accounted = allocated
      .plus(reward.platformFee)
      .plus(reward.undistributedRemainder);

    expect(accounted.isEqualTo(reward.amount)).toBe(true);
    expect(reward.undistributedRemainder).toBe('0');
  });

  it('returns an existing reward for duplicate payout observations', async () => {
    const rewardRows: any[] = [];
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

    const service = new RewardPipelineService(
      rewardLedgerRepository as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { creditReward: jest.fn().mockResolvedValue({ applied: true }) } as any,
      { computeTimeWeightedShares: jest.fn().mockResolvedValue([]) } as any,
    );

    const first = await service.observeReward({
      txHash: 'tx-duplicate',
      token: 'HFT',
      amount: '100',
      campaignId: 'campaign-1',
      dayIndex: 5,
    });
    const second = await service.observeReward({
      txHash: 'tx-duplicate',
      token: 'HFT',
      amount: '200',
      campaignId: 'campaign-2',
      dayIndex: 6,
    });

    expect(second).toBe(first);
    expect(rewardLedgerRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite existing allocations for a settled reward day', async () => {
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

    const service = new RewardPipelineService(
      rewardLedgerRepository as any,
      rewardAllocationRepository as any,
      { creditReward: jest.fn().mockResolvedValue({ applied: true }) } as any,
      { computeTimeWeightedShares: jest.fn().mockResolvedValue([]) } as any,
    );

    const reward = await service.observeReward({
      txHash: 'tx-settled',
      token: 'HFT',
      amount: '100',
      campaignId: 'campaign-1',
      dayIndex: 7,
    });

    await service.createAllocations('tx-settled', [
      { userId: 'u1', orderId: 'order-1', basisShares: '1' },
    ]);
    allocationRows[0].status = 'CREDITED';
    reward.platformFee = '30';

    await service.createAllocations('tx-settled', [
      { userId: 'u1', orderId: 'order-1', basisShares: '1' },
      { userId: 'u2', orderId: 'order-2', basisShares: '9' },
    ]);

    expect(allocationRows).toHaveLength(1);
    expect(allocationRows[0].status).toBe('CREDITED');
    expect(allocationRows[0].amount).toBe('100');
    expect(reward.undistributedRemainder).toBe('0');
  });

  it('records oracle payout changes as separate correction reward facts', async () => {
    const rewardRows: any[] = [];
    const allocationRows: any[] = [];

    const rewardLedgerRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        const index = rewardRows.findIndex(
          (row) => row.txHash === payload.txHash,
        );

        if (index >= 0) {
          rewardRows[index] = { ...rewardRows[index], ...payload };

          return rewardRows[index];
        }
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
      txHash: 'tx-original',
      token: 'HFT',
      amount: '100',
      campaignId: 'campaign-1',
      dayIndex: 9,
    });
    await service.createAllocations('tx-original', [
      { userId: 'u1', orderId: 'order-1', basisShares: '1' },
    ]);
    allocationRows[0].status = 'CREDITED';

    const correction = await service.observeRewardCorrection({
      originalTxHash: 'tx-original',
      correctionTxHash: 'tx-correction',
      correctedAmount: '125',
    });
    const duplicateCorrection = await service.observeRewardCorrection({
      originalTxHash: 'tx-original',
      correctionTxHash: 'tx-correction',
      correctedAmount: '150',
    });
    const secondCorrection = await service.observeRewardCorrection({
      originalTxHash: 'tx-original',
      correctionTxHash: 'tx-correction-2',
      correctedAmount: '150',
    });

    expect(correction).toEqual(
      expect.objectContaining({
        txHash: 'tx-correction',
        amount: '25',
        campaignId: 'campaign-1',
        dayIndex: 9,
        status: 'CONFIRMED',
      }),
    );
    expect(duplicateCorrection).toBe(correction);
    expect(secondCorrection).toEqual(
      expect.objectContaining({
        txHash: 'tx-correction-2',
        amount: '25',
        correctionOf: 'tx-original',
      }),
    );
    expect(
      rewardRows.find((row) => row.txHash === 'tx-original')?.amount,
    ).toBe('100');
    expect(allocationRows).toHaveLength(1);
    expect(allocationRows[0]).toEqual(
      expect.objectContaining({
        rewardTxHash: 'tx-original',
        amount: '100',
        status: 'CREDITED',
      }),
    );
  });

  it('allocates rewards from eligible attributable quote fill volume only', async () => {
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

    const ledgerEntryRepository = {
      find: jest.fn().mockResolvedValue([
        {
          orderId: 'order-1',
          userId: 'u1',
          assetId: 'USDT',
          amount: '-80',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'fill-1',
          createdAt: '2026-05-04T01:00:00.000Z',
        },
        {
          orderId: 'order-2',
          userId: 'u2',
          assetId: 'USDT',
          amount: '20',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'fill-2',
          createdAt: '2026-05-04T01:30:00.000Z',
        },
        {
          orderId: 'order-3',
          userId: 'u3',
          assetId: 'BTC',
          amount: '1',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'fill-3',
          createdAt: '2026-05-04T01:45:00.000Z',
        },
        {
          orderId: '',
          userId: 'u4',
          assetId: 'USDT',
          amount: '1000',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'fill-missing-order',
          createdAt: '2026-05-04T01:45:00.000Z',
        },
        {
          orderId: 'order-5',
          userId: 'u5',
          assetId: 'USDT',
          amount: '1000',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'fill-outside-window',
          createdAt: '2026-05-05T01:00:00.000Z',
        },
      ]),
    };

    const service = new RewardPipelineService(
      rewardLedgerRepository as any,
      rewardAllocationRepository as any,
      { creditReward: jest.fn().mockResolvedValue({ applied: true }) } as any,
      { computeTimeWeightedShares: jest.fn().mockResolvedValue([]) } as any,
      ledgerEntryRepository as any,
    );

    await service.observeReward({
      txHash: 'tx-fill-score',
      token: 'HFT',
      amount: '100',
      campaignId: 'campaign-1',
      dayIndex: 8,
    });

    await service.createAllocationsFromEligibleFills(
      'tx-fill-score',
      'USDT',
      '2026-05-04T00:00:00.000Z',
      '2026-05-05T00:00:00.000Z',
    );

    expect(allocationRows).toHaveLength(2);
    expect(allocationRows.map((row) => row.userId)).toEqual(['u1', 'u2']);
    expect(allocationRows.map((row) => row.orderId)).toEqual([
      'order-1',
      'order-2',
    ]);
    expect(allocationRows.map((row) => row.basisShares)).toEqual(['80', '20']);
    expect(allocationRows.map((row) => row.amount)).toEqual(['80', '20']);
  });
});

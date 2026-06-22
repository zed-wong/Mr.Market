import { LpPositionReconciliationRunner } from './lp-position-reconciliation-runner.service';

describe('LpPositionReconciliationRunner', () => {
  it('routes structurally mismatched LP positions to manual review', async () => {
    const lpPositionService = {
      requireById: jest.fn().mockResolvedValue({
        id: 'position-1',
        liquidity: '100',
        tickLower: -120,
        tickUpper: 120,
      }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const runner = new LpPositionReconciliationRunner(
      lpPositionService as any,
    );

    const result = await runner.reconcilePosition('position-1', {
      owner: '0xwallet',
      liquidity: '99',
      tickLower: -120,
      tickUpper: 120,
    });

    expect(result).toEqual({
      positionId: 'position-1',
      matches: false,
      mismatches: ['liquidity'],
    });
    expect(lpPositionService.updateStatus).toHaveBeenCalledWith('position-1', {
      status: 'manual_review',
    });
  });
});

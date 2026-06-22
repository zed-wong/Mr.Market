import { PoolStateTrackerService } from './pool-state-tracker.service';

describe('PoolStateTrackerService', () => {
  it('caches pool state outside tick decisions', () => {
    const service = new PoolStateTrackerService();

    service.upsertPoolState({
      connectorId: 'uniswapV3',
      chainId: 1,
      poolAddress: '0xPOOL',
      currentTick: 10,
      sqrtPriceX96: '100',
      liquidity: '1000',
      observedAt: '2026-06-22T00:00:00.000Z',
    });

    expect(service.getPoolState('uniswapV3', 1, '0xpool')).toMatchObject({
      currentTick: 10,
      poolAddress: '0xpool',
    });
  });
});

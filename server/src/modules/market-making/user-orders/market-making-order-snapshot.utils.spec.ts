import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { mapStrategySnapshotToMarketMakingOrderFields } from './market-making-order-snapshot.utils';

describe('market-making order snapshot utils', () => {
  it('preserves uppercase MICROPRICE from strategy snapshots', () => {
    const result = mapStrategySnapshotToMarketMakingOrderFields({
      controllerType: 'pureMarketMaking',
      resolvedConfig: {
        priceSourceType: 'MICROPRICE',
      },
    } as any);

    expect(result.priceSourceType).toBe(PriceSourceType.MICROPRICE);
  });
});

import { describe, expect, it } from 'vitest';

import { normalizeConfigOverrides } from './helpers';

describe('normalizeConfigOverrides', () => {
  it('maps PMM quick fields to order amount and symmetric spreads', () => {
    expect(
      normalizeConfigOverrides(
        'pureMarketMaking',
        [{ key: 'numberOfLayers', value: '2' }],
        '10',
        '0.25',
      ),
    ).toEqual({
      numberOfLayers: 2,
      orderAmount: 10,
      bidSpread: 0.25,
      askSpread: 0.25,
    });
  });

  it('maps dual-account quick fields to base trade amount and increment percentage', () => {
    expect(
      normalizeConfigOverrides(
        'dualAccountVolume',
        [{ key: 'makerDelayMs', value: '250' }],
        '5',
        '0.4',
      ),
    ).toEqual({
      makerDelayMs: 250,
      baseTradeAmount: 5,
      baseIncrementPercentage: 0.4,
    });
  });
});

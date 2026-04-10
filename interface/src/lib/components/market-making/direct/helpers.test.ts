import { describe, expect, it } from 'vitest';

import { formatOrderAmountForDisplay, normalizeConfigOverrides, readPositiveOrderAmount, resolveMinOrderAmount } from './helpers';

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

  it('drops reserved system-managed fields from manual config rows', () => {
    expect(
      normalizeConfigOverrides(
        'dualAccountVolume',
        [
          { key: 'userId', value: 'spoofed-user' },
          { key: 'exchangeName', value: 'kraken' },
          { key: 'makerDelayMs', value: '250' },
        ],
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


describe('readPositiveOrderAmount', () => {
  it('returns empty string for zero and invalid values', () => {
    expect(readPositiveOrderAmount('0')).toBe('');
    expect(readPositiveOrderAmount('')).toBe('');
    expect(readPositiveOrderAmount('abc')).toBe('');
  });

  it('keeps positive numeric values', () => {
    expect(readPositiveOrderAmount('0.001')).toBe('0.001');
    expect(readPositiveOrderAmount(5)).toBe('5');
  });
});

describe('resolveMinOrderAmount', () => {
  it('prefers live exchange limits over persisted zero values', () => {
    expect(
      resolveMinOrderAmount(
        '0',
        [
          {
            symbol: 'BTC/USDT',
            limits: { amount: { min: 0.001 } },
          },
        ],
        'BTC/USDT',
      ),
    ).toBe('0.001');
  });

  it('falls back to persisted positive minimum when live market data is unavailable', () => {
    expect(resolveMinOrderAmount('0.5', [], 'BTC/USDT')).toBe('0.5');
  });

  it('derives a cost-based minimum order amount from the pair price', () => {
    expect(
      resolveMinOrderAmount(
        '0',
        [
          {
            symbol: 'BTC/USDT',
            limits: { cost: { min: 10 } },
          },
        ],
        'BTC/USDT',
        '20000',
        '1',
      ),
    ).toBe('0.0005');
  });

  it('hides non-positive minimums instead of rendering zero', () => {
    expect(resolveMinOrderAmount('0', [], 'BTC/USDT')).toBe('');
  });
});


describe('formatOrderAmountForDisplay', () => {
  it('rounds up to the configured amount step for display', () => {
    expect(formatOrderAmountForDisplay('0.0051234', '0.001')).toBe('0.006');
  });

  it('trims fallback display decimals when no amount step is available', () => {
    expect(formatOrderAmountForDisplay('1.230000')).toBe('1.23');
  });
});

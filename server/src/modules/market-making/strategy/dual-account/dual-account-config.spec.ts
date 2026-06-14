import {
  EFFICIENT_DUAL_ACCOUNT_VOLUME_MODES,
  normalizeEfficientDualAccountVolumeStrategyParams,
} from './dual-account-config';

describe('efficient dual-account volume config normalization', () => {
  const baseConfig = {
    exchangeName: 'binance',
    symbol: 'BTC/USDT',
    maxOrderAmount: 0.5,
    interval: 30,
    makerAccountLabel: 'maker-desk',
    takerAccountLabel: 'taker-desk',
    userId: 'admin-user',
    clientId: 'order-1',
  };

  it('normalizes minimal unified input to balanced best-capacity defaults', () => {
    const params =
      normalizeEfficientDualAccountVolumeStrategyParams(baseConfig);

    expect(params).toEqual(
      expect.objectContaining({
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        pair: 'BTC/USDT',
        maxOrderAmount: 0.5,
        interval: 30,
        baseTradeAmount: 0.5,
        baseIntervalTime: 30,
        mode: 'balanced',
        cycleMode: 'alternating',
        dynamicRoleSwitching: true,
        strategyContract: 'efficientDualAccountVolume',
        safetyBuffer: {
          kind: 'default_formula',
          exchangeCostMinMultiplier: 0.5,
          feeCostMultiplier: 2,
        },
      }),
    );
  });

  it('preserves explicit mode and optional variance fields', () => {
    const params = normalizeEfficientDualAccountVolumeStrategyParams({
      ...baseConfig,
      mode: 'fastest_volume',
      tradeAmountVariance: 0.25,
      priceOffsetVariance: 0.1,
    });

    expect(params.mode).toBe('fastest_volume');
    expect(params.tradeAmountVariance).toBe(0.25);
    expect(params.priceOffsetVariance).toBe(0.1);
  });

  it('forces hidden low-level mechanics overrides to unified defaults', () => {
    const params = normalizeEfficientDualAccountVolumeStrategyParams({
      ...baseConfig,
      cycleMode: 'static',
      dynamicRoleSwitching: false,
    });

    expect(params.cycleMode).toBe('alternating');
    expect(params.dynamicRoleSwitching).toBe(true);
  });

  it.each(EFFICIENT_DUAL_ACCOUNT_VOLUME_MODES)(
    'accepts supported mode %s',
    (mode) => {
      expect(
        normalizeEfficientDualAccountVolumeStrategyParams({
          ...baseConfig,
          mode,
        }).mode,
      ).toBe(mode);
    },
  );

  it.each([
    ['unsupported mode', { mode: 'classic' }],
    ['missing exchange', { exchangeName: '' }],
    ['invalid pair', { symbol: 'BTCUSDT' }],
    ['missing maker account', { makerAccountLabel: '' }],
    ['missing taker account', { takerAccountLabel: '' }],
    ['duplicate accounts', { takerAccountLabel: 'maker-desk' }],
    ['non-positive cycle size', { maxOrderAmount: 0 }],
    ['non-positive cooldown', { interval: 0 }],
    ['negative target volume', { dailyVolumeTarget: -1 }],
    ['trade variance out of bounds', { tradeAmountVariance: 1.5 }],
    ['price variance out of bounds', { priceOffsetVariance: -0.1 }],
  ])('rejects malformed unified input: %s', (_case, override) => {
    expect(() =>
      normalizeEfficientDualAccountVolumeStrategyParams({
        ...baseConfig,
        ...override,
      } as any),
    ).toThrow();
  });
});

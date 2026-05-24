import { describe, expect, it } from 'vitest';

import {
  aggregateBalancesByAsset,
  buildDirectOrderDiagnosis,
  buildGenericSchemaConfigOverrides,
  formatOrderAmountForDisplay,
  getDirectOrderActionAvailability,
  isBestCapacityDirectOrderControllerType,
  isDualAccountOrder,
  isDualDirectOrderControllerType,
  isSchemaDrivenDirectOrderControllerType,
  normalizeConfigOverrides,
  readPositiveOrderAmount,
  resolveInventorySkewAllocation,
  resolveMinOrderAmount,
} from './helpers';

const diagnosisNow = Date.parse('2026-05-24T00:00:00.000Z');

const baseDiagnosisStatus = {
  state: 'running',
  runtimeState: 'running',
  executorHealth: 'active',
  lastTickAt: '2026-05-23T23:59:50.000Z',
  lastUpdatedAt: '2026-05-23T23:59:55.000Z',
  privateStreamEventAt: '2026-05-23T23:59:55.000Z',
  openOrders: [],
  intents: [],
  recentErrors: [],
  streamHealth: [
    {
      accountLabel: 'main',
      state: 'live',
      order: true,
      trade: true,
      balance: true,
      lastEventAt: '2026-05-23T23:59:55.000Z',
    },
  ],
  balanceCacheStatus: [
    {
      accountLabel: 'main',
      asset: 'BTC',
      source: 'user_stream',
      freshnessTimestamp: '2026-05-23T23:59:55.000Z',
      stale: false,
    },
  ],
  userStreamRuntime: {
    activeWatcherCount: 1,
    queueDepth: 0,
    duplicateFillSuppressionCount: 0,
  },
  stale: false,
};

describe('buildDirectOrderDiagnosis', () => {
  it('diagnoses a healthy active order as running normally with evidence', () => {
    const diagnosis = buildDirectOrderDiagnosis(
      baseDiagnosisStatus,
      { runtimeState: 'running', warnings: [] },
      diagnosisNow,
    );

    expect(diagnosis.kind).toBe('normal');
    expect(diagnosis.title).toBe('Running normally');
    expect(diagnosis.summary).toContain('running normally');
    expect(diagnosis.evidence.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Tick freshness',
        'Stream health',
        'Balance cache',
        'Recent errors',
      ]),
    );
  });

  it('diagnoses a stopped order as intentionally stopped instead of failed', () => {
    const diagnosis = buildDirectOrderDiagnosis(
      {
        ...baseDiagnosisStatus,
        state: 'stopped',
        runtimeState: 'stopped',
        lastTickAt: null,
      },
      { runtimeState: 'stopped', warnings: [] },
      diagnosisNow,
    );

    expect(diagnosis.kind).toBe('stopped');
    expect(diagnosis.title).toBe('Intentionally stopped');
    expect(diagnosis.summary).toContain('intentionally stopped');
    expect(diagnosis.summary).toContain('not being treated as a runtime failure');
  });

  it('diagnoses failed or blocked orders with the blocking reason', () => {
    const diagnosis = buildDirectOrderDiagnosis(
      {
        ...baseDiagnosisStatus,
        runtimeState: 'failed',
        recentErrors: [{ ts: '2026-05-23T23:59:55.000Z', message: 'Exchange authentication failed' }],
      },
      { runtimeState: 'failed', warnings: ['execution_blocked'] },
      diagnosisNow,
    );

    expect(diagnosis.kind).toBe('blocked');
    expect(diagnosis.title).toBe('Failed or blocked');
    expect(diagnosis.summary).toContain('Blocking reason');
    expect(diagnosis.risks[0]).toContain('Execution is blocked');
  });

  it('diagnoses stale ticks, streams, or balances as operational risk', () => {
    const diagnosis = buildDirectOrderDiagnosis(
      {
        ...baseDiagnosisStatus,
        runtimeState: 'running',
        lastTickAt: '2026-05-23T23:55:00.000Z',
        streamHealth: [{ accountLabel: 'main', state: 'stale' }],
        balanceCacheStatus: [
          {
            accountLabel: 'main',
            asset: 'USDT',
            source: 'missing',
            freshnessTimestamp: null,
            stale: true,
          },
        ],
      },
      { runtimeState: 'running', warnings: [] },
      diagnosisNow,
    );

    expect(diagnosis.kind).toBe('risky');
    expect(diagnosis.title).toBe('Operational risk detected');
    expect(diagnosis.summary).toContain('operational risk');
    expect(diagnosis.risks.join(' ')).toContain('Last tick is stale');
    expect(diagnosis.risks.join(' ')).toContain('stream health is stale');
    expect(diagnosis.risks.join(' ')).toContain('balance cache is stale');
  });

  it.each(['degraded', 'reconnecting', 'silent', 'unknown'])(
    'treats %s stream health as operational risk',
    (streamState) => {
      const diagnosis = buildDirectOrderDiagnosis(
        {
          ...baseDiagnosisStatus,
          runtimeState: 'running',
          streamHealth: [
            {
              accountLabel: 'main',
              state: streamState,
              order: true,
              trade: true,
              balance: true,
              lastEventAt: '2026-05-23T23:59:55.000Z',
            },
          ],
        },
        { runtimeState: 'running', warnings: [] },
        diagnosisNow,
      );

      expect(diagnosis.kind).toBe('risky');
      expect(diagnosis.title).toBe('Operational risk detected');
      expect(diagnosis.risks.join(' ')).toContain(`stream health is ${streamState}`);
      expect(diagnosis.summary).not.toContain('running normally');
    },
  );

  it('treats partial running diagnostics as unknown risk instead of healthy', () => {
    const diagnosis = buildDirectOrderDiagnosis(
      {
        ...baseDiagnosisStatus,
        runtimeState: 'running',
        streamHealth: undefined,
        userStreamCapabilities: undefined,
        balanceCacheStatus: undefined,
      },
      { runtimeState: 'running', warnings: [] },
      diagnosisNow,
    );

    expect(diagnosis.kind).toBe('risky');
    expect(diagnosis.title).toBe('Operational risk detected');
    expect(diagnosis.risks.join(' ')).toContain('Stream health evidence is missing');
    expect(diagnosis.risks.join(' ')).toContain('Balance cache evidence is missing');
    expect(diagnosis.summary).not.toContain('running normally');
  });

  it('treats omitted diagnostic arrays as unknown risk instead of empty healthy evidence', () => {
    const { openOrders, intents, recentErrors, ...statusWithoutArrays } = baseDiagnosisStatus;

    const diagnosis = buildDirectOrderDiagnosis(
      {
        ...statusWithoutArrays,
        runtimeState: 'running',
      },
      { runtimeState: 'running', warnings: [] },
      diagnosisNow,
    );

    expect(diagnosis.kind).toBe('risky');
    expect(diagnosis.risks.join(' ')).toContain('Open-order diagnostics were not returned');
    expect(diagnosis.risks.join(' ')).toContain('Recent-intent diagnostics were not returned');
    expect(diagnosis.risks.join(' ')).toContain('Recent-error diagnostics were not returned');
    expect(diagnosis.evidence.find((item) => item.label === 'Open orders')?.value).toContain(
      'current exchange exposure is unknown',
    );
    expect(diagnosis.evidence.find((item) => item.label === 'Recent intents')?.value).toContain(
      'idle state are unknown',
    );
    expect(diagnosis.evidence.find((item) => item.label === 'Recent errors')?.value).toContain(
      'absence of blocking errors is unknown',
    );
    expect(diagnosis.summary).not.toContain('running normally');
  });

  it('includes stream capability evidence when returned', () => {
    const diagnosis = buildDirectOrderDiagnosis(
      {
        ...baseDiagnosisStatus,
        userStreamCapabilities: [
          {
            accountLabel: 'maker',
            watchOrders: true,
            watchTrades: true,
            watchBalance: true,
          },
          {
            accountLabel: 'taker',
            watchOrders: true,
            watchTrades: false,
            watchBalance: true,
          },
        ],
      },
      { runtimeState: 'running', warnings: [] },
      diagnosisNow,
    );

    const streamEvidence = diagnosis.evidence.find((item) => item.label === 'Stream health');
    expect(streamEvidence?.value).toContain('Capabilities returned for 2 accounts');
  });
});

describe('getDirectOrderActionAvailability', () => {
  it('offers stop but not remove or resume for stale persisted running orders', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'running',
        runtimeState: 'stale',
      }),
    ).toEqual({
      canStop: true,
      canResume: false,
      canRemove: false,
    });
  });

  it('treats created orders conservatively by hiding resume and remove', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'created',
        runtimeState: 'created',
      }),
    ).toEqual({
      canStop: true,
      canResume: false,
      canRemove: false,
    });
  });

  it('only allows resume and remove for persisted stopped orders', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'stopped',
        runtimeState: 'stopped',
      }),
    ).toEqual({
      canStop: false,
      canResume: true,
      canRemove: true,
    });
  });

  it('allows remove but not resume for persisted failed orders', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'failed',
        runtimeState: 'failed',
      }),
    ).toEqual({
      canStop: false,
      canResume: false,
      canRemove: true,
    });
  });

  it('does not infer removal from a derived gone runtime state', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'running',
        runtimeState: 'gone',
      }),
    ).toEqual({
      canStop: true,
      canResume: false,
      canRemove: false,
    });
  });
});

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
      bidSpread: 0.0025,
      askSpread: 0.0025,
    });
  });

  it('maps dual-account quick fields to base trade amount and increment percentage', () => {
    expect(
      normalizeConfigOverrides(
        'dualAccountVolume',
        [],
        '5',
        '0.4',
      ),
    ).toEqual({
      baseTradeAmount: 5,
      baseIncrementPercentage: 0.4,
    });
  });

  it('maps dual-account variance quick fields into config overrides', () => {
    expect(
      normalizeConfigOverrides(
        'dualAccountVolume',
        [],
        '5',
        '0.4',
        {
          intervalTime: '30',
          numTrades: '100',
          pricePushRate: '0',
          postOnlySide: 'buy',
          dynamicRoleSwitching: false,
          targetQuoteVolume: '',
          cadenceVariance: '0.25',
          tradeAmountVariance: '0.15',
          priceOffsetVariance: '0.2',
        },
      ),
    ).toEqual({
      baseTradeAmount: 5,
      baseIncrementPercentage: 0.4,
      baseIntervalTime: 30,
      numTrades: 100,
      pricePushRate: 0,
      postOnlySide: 'buy',
      cadenceVariance: 0.25,
      tradeAmountVariance: 0.15,
      priceOffsetVariance: 0.2,
    });
  });

  it('drops reserved system-managed fields from manual config rows', () => {
    expect(
      normalizeConfigOverrides(
        'dualAccountVolume',
        [
          { key: 'userId', value: 'spoofed-user' },
          { key: 'exchangeName', value: 'kraken' },
        ],
        '5',
        '0.4',
      ),
    ).toEqual({
      baseTradeAmount: 5,
      baseIncrementPercentage: 0.4,
    });
  });

  it('maps best-capacity dual-account quick fields to base trade amount and increment percentage', () => {
    expect(
      normalizeConfigOverrides(
        'dualAccountBestCapacityVolume',
        [],
        '5',
        '0.4',
      ),
    ).toEqual({
      maxOrderAmount: 5,
    });
  });
});

describe('direct controller helpers', () => {
  it('recognizes both dual direct-order controller types', () => {
    expect(isDualDirectOrderControllerType('dualAccountVolume')).toBe(true);
    expect(
      isDualDirectOrderControllerType('dualAccountBestCapacityVolume'),
    ).toBe(true);
    expect(isDualDirectOrderControllerType('pureMarketMaking')).toBe(false);
  });

  it('recognizes the best-capacity direct-order controller type', () => {
    expect(
      isBestCapacityDirectOrderControllerType(
        'dualAccountBestCapacityVolume',
      ),
    ).toBe(true);
    expect(isBestCapacityDirectOrderControllerType('dualAccountVolume')).toBe(
      false,
    );
  });

  it('detects controller types that should use schema-driven direct forms', () => {
    expect(isSchemaDrivenDirectOrderControllerType('arbitrage')).toBe(true);
    expect(isSchemaDrivenDirectOrderControllerType('pureMarketMaking')).toBe(
      false,
    );
  });
});

describe('isDualAccountOrder', () => {
  it('returns true when directExecutionMode is dual_account', () => {
    expect(
      isDualAccountOrder({
        directExecutionMode: 'dual_account',
        controllerType: 'unknownNewStrategy',
      }),
    ).toBe(true);
  });

  it('returns false when directExecutionMode is single_account', () => {
    expect(
      isDualAccountOrder({
        directExecutionMode: 'single_account',
        controllerType: 'dualAccountVolume',
      }),
    ).toBe(false);
  });

  it('falls back to controller type when directExecutionMode is null', () => {
    expect(
      isDualAccountOrder({
        directExecutionMode: null,
        controllerType: 'dualAccountVolume',
      }),
    ).toBe(true);
  });

  it('falls back to controller type when directExecutionMode is undefined', () => {
    expect(
      isDualAccountOrder({
        controllerType: 'dualAccountBestCapacityVolume',
        makerAccountLabel: '',
        takerAccountLabel: '',
      }),
    ).toBe(true);
  });

  it('returns true when both maker and taker account labels are present', () => {
    expect(
      isDualAccountOrder({
        directExecutionMode: undefined,
        controllerType: 'someNewStrategy',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
      }),
    ).toBe(true);
  });

  it('returns false for single-account controller types without explicit mode', () => {
    expect(
      isDualAccountOrder({
        directExecutionMode: undefined,
        controllerType: 'pureMarketMaking',
      }),
    ).toBe(false);
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

describe('buildGenericSchemaConfigOverrides', () => {
  it('keeps schema-declared user fields and strips runtime-owned fields', () => {
    expect(
      buildGenericSchemaConfigOverrides(
        {
          properties: {
            threshold: { type: 'number' },
            mode: { type: 'string' },
          },
        },
        {
          threshold: 5,
          mode: 'safe',
          exchangeName: 'binance',
          makerAccountLabel: 'maker',
          ignored: true,
        },
      ),
    ).toEqual({
      threshold: 5,
      mode: 'safe',
    });
  });
});

describe('resolveInventorySkewAllocation', () => {
  it('normalizes base inventory into quote value before calculating skew', () => {
    expect(
      resolveInventorySkewAllocation(
        [
          {
            asset: 'XIN',
            free: '0.34',
            used: '0',
            total: '0.34',
          },
          {
            asset: 'USDT',
            free: '10.4381106',
            used: '0',
            total: '10.4381106',
          },
        ],
        'XIN/USDT',
        '59.05',
        '59.35',
      ),
    ).toEqual({
      baseAsset: 'XIN',
      quoteAsset: 'USDT',
      basePercent: 66,
      quotePercent: 34,
    });
  });

  it('aggregates maker and taker balances for skew', () => {
    const aggregated = aggregateBalancesByAsset([
      { asset: 'BTC', free: '0.5', used: '0.1', total: '0.6', accountLabel: 'maker' },
      { asset: 'USDT', free: '1000', used: '200', total: '1200', accountLabel: 'maker' },
      { asset: 'BTC', free: '0.3', used: '0.05', total: '0.35', accountLabel: 'taker' },
      { asset: 'USDT', free: '500', used: '100', total: '600', accountLabel: 'taker' },
    ]);
    expect(
      resolveInventorySkewAllocation(aggregated, 'BTC/USDT', '50000', '50000'),
    ).toEqual({
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      basePercent: 96,
      quotePercent: 4,
    });
  });

  it('returns null when pair pricing is unavailable', () => {
    expect(
      resolveInventorySkewAllocation(
        [
          {
            asset: 'XIN',
            free: '0.34',
            used: '0',
            total: '0.34',
          },
          {
            asset: 'USDT',
            free: '10.4381106',
            used: '0',
            total: '10.4381106',
          },
        ],
        'XIN/USDT',
      ),
    ).toBeNull();
  });
});

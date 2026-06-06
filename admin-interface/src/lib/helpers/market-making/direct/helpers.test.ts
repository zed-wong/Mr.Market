import { describe, expect, it } from 'vitest';

import {
  aggregateBalancesByAsset,
  buildDirectReadinessRefreshKey,
  buildDirectOrderDiagnosis,
  EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
  buildDirectVariationConfigOverrides,
  describeDirectRuntimeBottleneck,
  describeDirectRuntimeNextAction,
  describeReadinessBlockingReason,
  describeReadinessMissingBalance,
  describeSafeDirectStartFailure,
  filterDirectCreateStrategies,
  formatDirectRuntimeRemainingEstimate,
  buildGenericSchemaConfigOverrides,
  formatOrderAmountForDisplay,
  formatReadinessAmount,
  getDirectOrderActionAvailability,
  getDirectReadinessSubmitStatus,
  getDirectRuntimeLifecycleView,
  getDirectVariationEditableFields,
  getEfficientDualAccountModeOptions,
  getLatestDirectRuntimeCycle,
  getReadinessCapitalRows,
  isDirectReadinessForCurrentSelection,
  initializeDirectVariationFormValues,
  isBestCapacityDirectOrderControllerType,
  isDualAccountOrder,
  isDualDirectOrderControllerType,
  isEfficientDualAccountStrategy,
  isSchemaDrivenDirectOrderControllerType,
  normalizeConfigOverrides,
  normalizeDirectRuntimeCycles,
  normalizeEfficientDualAccountMode,
  readPositiveOrderAmount,
  resolveInventorySkewAllocation,
  resolveMinOrderAmount,
} from './helpers';
import type { DirectVariationMetadata } from '$lib/types/hufi/admin-direct-market-making';

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

  it('falls back to persisted state when runtime state is missing', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'running',
        runtimeState: '',
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

  it('allows readiness-gated resume but not stop or remove for paused orders', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'paused',
        runtimeState: 'paused',
      }),
    ).toEqual({
      canStop: false,
      canResume: true,
      canRemove: false,
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

  it('allows stopping a persisted running order with a failed runtime state', () => {
    expect(
      getDirectOrderActionAvailability({
        state: 'running',
        runtimeState: 'failed',
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

  it('serializes efficient dual-account volume config with balanced mode by default', () => {
    expect(
      normalizeConfigOverrides(
        EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
        [
          { key: 'cycleMode', value: 'static' },
          { key: 'dynamicRoleSwitching', value: 'false' },
        ],
        '5',
        '0.4',
        {
          intervalTime: '30',
          numTrades: '100',
          pricePushRate: '0',
          postOnlySide: 'buy',
          dynamicRoleSwitching: false,
          targetQuoteVolume: '50000',
          cadenceVariance: '',
          tradeAmountVariance: '0.15',
          priceOffsetVariance: '0.2',
        },
      ),
    ).toEqual({
      maxOrderAmount: 5,
      mode: 'balanced',
      interval: 30,
      dailyVolumeTarget: 50000,
      tradeAmountVariance: 0.15,
      priceOffsetVariance: 0.2,
    });
  });

  it('serializes explicit efficient dual-account modes into payload config', () => {
    expect(
      normalizeConfigOverrides(
        EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
        [],
        '2',
        '',
        {
          intervalTime: '',
          numTrades: '',
          pricePushRate: '',
          postOnlySide: '',
          dynamicRoleSwitching: false,
          targetQuoteVolume: '',
          cadenceVariance: '',
          tradeAmountVariance: '',
          priceOffsetVariance: '',
          mode: 'fastest_volume',
        },
      ),
    ).toEqual({
      maxOrderAmount: 2,
      mode: 'fastest_volume',
    });
  });
});

describe('direct controller helpers', () => {
  it('recognizes both dual direct-order controller types', () => {
    expect(isDualDirectOrderControllerType('dualAccountVolume')).toBe(true);
    expect(
      isDualDirectOrderControllerType('dualAccountBestCapacityVolume'),
    ).toBe(true);
    expect(isDualDirectOrderControllerType(EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE)).toBe(true);
    expect(isDualDirectOrderControllerType('pureMarketMaking')).toBe(false);
  });

  it('recognizes the best-capacity direct-order controller type', () => {
    expect(
      isBestCapacityDirectOrderControllerType(
        'dualAccountBestCapacityVolume',
      ),
    ).toBe(true);
    expect(
      isBestCapacityDirectOrderControllerType(
        EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
      ),
    ).toBe(true);
    expect(isBestCapacityDirectOrderControllerType('dualAccountVolume')).toBe(
      false,
    );
  });

  it('detects controller types that should use schema-driven direct forms', () => {
    expect(isSchemaDrivenDirectOrderControllerType('arbitrage')).toBe(true);
    expect(
      isSchemaDrivenDirectOrderControllerType(
        EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
      ),
    ).toBe(false);
    expect(isSchemaDrivenDirectOrderControllerType('pureMarketMaking')).toBe(
      false,
    );
  });

  it('filters new-order strategies to Pure Market Making and Efficient Dual Account Volume', () => {
    const strategies = [
      { id: 'legacy-classic', key: 'dual-account-volume', name: 'dual account volume', controllerType: 'dualAccountVolume' },
      { id: 'legacy-best', key: 'dual-account-best-capacity-volume', name: 'dual account volume best capacity', controllerType: 'dualAccountBestCapacityVolume' },
      { id: 'pmm', key: 'pure-market-making', name: 'Pure Market Making', controllerType: 'pureMarketMaking' },
      { id: 'efficient', key: 'efficient-dual-account-volume', name: 'Efficient Dual Account Volume', controllerType: EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE },
    ];

    expect(filterDirectCreateStrategies(strategies).map((strategy) => strategy.id)).toEqual([
      'pmm',
      'efficient',
    ]);
  });

  it('keeps the create selector non-empty for a backfilled efficient strategy API fixture', () => {
    const strategies = [
      { id: 'pmm', key: 'pure_market_making', name: 'Pure Market Making', controllerType: 'pureMarketMaking' },
      { id: 'legacy-classic', key: 'dual_account_volume', name: 'Dual Account Volume', controllerType: 'dualAccountVolume' },
      { id: 'legacy-best', key: 'dual_account_best_capacity_volume', name: 'Dual Account Best Capacity Volume', controllerType: 'dualAccountBestCapacityVolume' },
      { id: 'efficient-backfilled', key: 'efficient_dual_account_volume', name: 'Efficient Dual Account Volume', controllerType: EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE },
    ];

    const selectableStrategies = filterDirectCreateStrategies(strategies);

    expect(selectableStrategies.map((strategy) => strategy.id)).toEqual([
      'pmm',
      'efficient-backfilled',
    ]);
    expect(selectableStrategies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pmm',
          name: 'Pure Market Making',
          controllerType: 'pureMarketMaking',
        }),
        expect.objectContaining({
          id: 'efficient-backfilled',
          name: 'Efficient Dual Account Volume',
          controllerType: EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
        }),
      ]),
    );
  });

  it('recognizes efficient strategies and exposes human mode copy', () => {
    expect(
      isEfficientDualAccountStrategy({
        id: 'efficient',
        key: 'efficient-dual-account-volume',
        controllerType: EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
      }),
    ).toBe(true);
    expect(normalizeEfficientDualAccountMode(undefined)).toBe('balanced');
    expect(normalizeEfficientDualAccountMode('unsupported')).toBe('balanced');
    expect(getEfficientDualAccountModeOptions().map((option) => option.value)).toEqual([
      'cheapest_capital',
      'balanced',
      'fastest_volume',
    ]);
    expect(
      getEfficientDualAccountModeOptions().find((option) => option.value === 'balanced')?.description,
    ).toContain('Balances');
  });

  it('blocks start while readiness is missing, loading, failed, stale, or blocked', () => {
    expect(
      getDirectReadinessSubmitStatus({
        requiredInputsComplete: false,
        loading: false,
        failed: false,
        displayedSignature: '',
        currentSignature: '',
        canStart: true,
      }),
    ).toBe('missing');
    expect(
      getDirectReadinessSubmitStatus({
        requiredInputsComplete: true,
        loading: true,
        failed: false,
        displayedSignature: 'a',
        currentSignature: 'a',
        canStart: true,
      }),
    ).toBe('loading');
    expect(
      getDirectReadinessSubmitStatus({
        requiredInputsComplete: true,
        loading: false,
        failed: true,
        displayedSignature: 'a',
        currentSignature: 'a',
        canStart: true,
      }),
    ).toBe('failed');
    expect(
      getDirectReadinessSubmitStatus({
        requiredInputsComplete: true,
        loading: false,
        failed: false,
        displayedSignature: 'old',
        currentSignature: 'new',
        canStart: true,
      }),
    ).toBe('stale');
    expect(
      getDirectReadinessSubmitStatus({
        requiredInputsComplete: true,
        loading: false,
        failed: false,
        displayedSignature: 'a',
        currentSignature: 'a',
        canStart: false,
      }),
    ).toBe('blocked');
    expect(
      getDirectReadinessSubmitStatus({
        requiredInputsComplete: true,
        loading: false,
        failed: false,
        displayedSignature: 'a',
        currentSignature: 'a',
        canStart: true,
      }),
    ).toBe('ready');
  });

  it('treats mode changes as stale until a matching readiness response arrives', () => {
    const balancedSignature = JSON.stringify({
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      strategyDefinitionId: 'def-efficient',
      makerApiKeyId: 'maker-key',
      takerApiKeyId: 'taker-key',
      configOverrides: {
        mode: 'balanced',
        maxOrderAmount: 0.01,
      },
    });
    const fastestVolumeSignature = JSON.stringify({
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      strategyDefinitionId: 'def-efficient',
      makerApiKeyId: 'maker-key',
      takerApiKeyId: 'taker-key',
      configOverrides: {
        mode: 'fastest_volume',
        maxOrderAmount: 0.01,
      },
    });
    const balancedReadiness = {
      canStart: true,
      mode: 'balanced' as const,
      bestFirstAction: null,
      maximumCycleQty: '0.01',
      recommendedCycleQty: '0.01',
      minimumCapitalByAccountAsset: [],
      recommendedCapitalByAccountAsset: [],
      missingBalances: [],
      estimatedCycles: {
        count: '1',
        basis: 'current_available_balances',
      },
      estimatedVolume: {
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        baseAmount: '0.01',
        quoteAmount: '500',
      },
      blockingReasons: [],
    };

    expect(
      isDirectReadinessForCurrentSelection({
        readiness: balancedReadiness,
        displayedSignature: balancedSignature,
        currentSignature: fastestVolumeSignature,
        selectedMode: 'fastest_volume',
      }),
    ).toBe(false);
    expect(
      getDirectReadinessSubmitStatus({
        requiredInputsComplete: true,
        loading: false,
        failed: false,
        displayedSignature: balancedSignature,
        currentSignature: fastestVolumeSignature,
        canStart: balancedReadiness.canStart,
      }),
    ).toBe('stale');
    expect(
      isDirectReadinessForCurrentSelection({
        readiness: balancedReadiness,
        displayedSignature: fastestVolumeSignature,
        currentSignature: fastestVolumeSignature,
        selectedMode: 'fastest_volume',
      }),
    ).toBe(false);
    expect(
      isDirectReadinessForCurrentSelection({
        readiness: {
          ...balancedReadiness,
          mode: 'fastest_volume',
        },
        displayedSignature: fastestVolumeSignature,
        currentSignature: fastestVolumeSignature,
        selectedMode: 'fastest_volume',
      }),
    ).toBe(true);
  });

  it('tracks mode and cycle-size changes as direct readiness refresh inputs', () => {
    const baseRefreshKeyInput = {
      showStartForm: true,
      isEfficientDualAccountStrategy: true,
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      strategyDefinitionId: 'def-efficient',
      makerApiKeyId: 'maker-key',
      takerApiKeyId: 'taker-key',
      controllerType: EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE,
      orderAmount: '0.01',
      orderSpread: '',
      intervalTime: '30',
      numTrades: '100',
      pricePushRate: '0',
      postOnlySide: 'buy',
      dynamicRoleSwitching: false,
      targetQuoteVolume: '',
      efficientMode: 'balanced' as const,
      configRows: [{ key: '', value: '' }],
      genericConfig: {},
    };

    const balancedKey = buildDirectReadinessRefreshKey(baseRefreshKeyInput);

    expect(
      buildDirectReadinessRefreshKey({
        ...baseRefreshKeyInput,
        efficientMode: 'fastest_volume',
      }),
    ).not.toBe(balancedKey);
    expect(
      buildDirectReadinessRefreshKey({
        ...baseRefreshKeyInput,
        orderAmount: '0.02',
      }),
    ).not.toBe(balancedKey);
  });

  it('preserves backend readiness numeric strings and units for display rows', () => {
    expect(formatReadinessAmount('0.12345678', 'BTC')).toBe('0.12345678 BTC');
    expect(
      getReadinessCapitalRows(
        [
          {
            accountLabel: 'maker-main',
            asset: 'USDT',
            amount: '100.00000001',
          },
          {
            accountLabel: 'taker-alt',
            asset: 'BTC',
            amount: '0.00250000',
          },
        ],
        'recommended',
      ),
    ).toEqual([
      {
        accountLabel: 'maker-main',
        asset: 'USDT',
        value: '100.00000001',
        label: '100.00000001 USDT',
        testId: 'readiness-recommended-maker-main-USDT',
      },
      {
        accountLabel: 'taker-alt',
        asset: 'BTC',
        value: '0.00250000',
        label: '0.00250000 BTC',
        testId: 'readiness-recommended-taker-alt-BTC',
      },
    ]);
  });

  it('translates readiness blockers and missing balances into actionable copy', () => {
    expect(
      describeReadinessMissingBalance({
        accountLabel: 'maker-main',
        asset: 'USDT',
        availableAmount: '4.00000001',
        minimumUsefulAmount: '15.00000000',
        missingAmount: '10.99999999',
      }),
    ).toContain('maker-main needs 10.99999999 USDT');
    expect(
      describeReadinessMissingBalance({
        accountLabel: 'maker-main',
        asset: 'USDT',
        availableAmount: '4.00000001',
        minimumUsefulAmount: '15.00000000',
        missingAmount: '10.99999999',
      }),
    ).toContain('Deposit the missing asset amount or lower the cycle limit');
    expect(
      describeReadinessBlockingReason({
        code: 'below_exchange_minimums',
        message: 'raw notional < costMin',
        accountLabel: 'taker-alt',
        asset: 'BTC',
      }),
    ).toBe(
      'taker-alt: Current balances cannot satisfy exchange minimums plus the safety buffer. (BTC)',
    );
    expect(
      describeReadinessBlockingReason({
        code: 'raw notional < costMin',
        message: 'raw notional < costMin',
      }),
    ).not.toContain('raw notional');
  });

  it('builds safe stale-start rejection copy from refreshed readiness without raw backend internals', () => {
    const unsafeBackendError = new Error(
      'candidate maker raw notional < costMin minimumNotional=10',
    );

    const refreshedReadiness = {
      canStart: false,
      mode: 'balanced' as const,
      bestFirstAction: null,
      maximumCycleQty: '0',
      recommendedCycleQty: '0',
      minimumCapitalByAccountAsset: [],
      recommendedCapitalByAccountAsset: [],
      missingBalances: [],
      estimatedCycles: {
        count: '0',
        basis: 'current_available_balances',
      },
      estimatedVolume: {
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        baseAmount: '0',
        quoteAmount: '0',
      },
      blockingReasons: [
        {
          code: 'below_exchange_minimums',
          message: 'raw notional < costMin',
          accountLabel: 'maker-main',
          asset: 'USDT',
        },
      ],
    };

    expect(
      describeSafeDirectStartFailure(refreshedReadiness, unsafeBackendError),
    ).toBe(
      'maker-main: Current balances cannot satisfy exchange minimums plus the safety buffer. (USDT)',
    );
    expect(
      describeSafeDirectStartFailure(null, unsafeBackendError),
    ).toBe(
      'Start was rejected after planner revalidation. Refresh readiness and resolve account, asset, or market-rule blockers before retrying.',
    );
    expect(
      describeSafeDirectStartFailure(null, unsafeBackendError),
    ).not.toMatch(/raw notional|costMin|candidate|minimumNotional/);
  });
});

describe('Efficient Dual Account runtime cycle helpers', () => {
  const readiness = {
    canStart: false,
    mode: 'balanced' as const,
    bestFirstAction: {
      makerAccountLabel: 'maker-main',
      takerAccountLabel: 'taker-alt',
      side: 'buy' as const,
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      quantity: '0.5',
      price: '30000',
      notional: '15000',
    },
    maximumCycleQty: '0.8',
    recommendedCycleQty: '0.5',
    minimumCapitalByAccountAsset: [],
    recommendedCapitalByAccountAsset: [],
    missingBalances: [
      {
        accountLabel: 'taker-alt',
        asset: 'BTC',
        availableAmount: '0.1',
        minimumUsefulAmount: '0.5',
        missingAmount: '0.4',
      },
    ],
    estimatedCycles: {
      count: '3',
      basis: 'current_available_balances',
    },
    estimatedVolume: {
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      baseAmount: '1.5',
      quoteAmount: '45000',
    },
    blockingReasons: [
      {
        code: 'below_exchange_minimums',
        message: 'raw notional < costMin',
        accountLabel: 'taker-alt',
        asset: 'BTC',
      },
    ],
  };

  it('normalizes grouped maker and inline taker cycle legs without losing failure reasons', () => {
    const cycles = normalizeDirectRuntimeCycles([
      {
        cycleId: 'cycle-2',
        aggregateStatus: 'failed',
        failureReason: 'taker IOC rejected',
        legs: [
          {
            cycleRole: 'taker',
            accountLabel: 'taker-alt',
            side: 'sell',
            plannedQty: '0.5',
            plannedPrice: '30000',
            filledQty: '0',
            notional: '15000',
            status: 'failed',
            failureReason: 'taker IOC rejected',
            linkedIntentId: 'intent-taker',
            linkedTrackedOrderId: null,
          },
          {
            cycleRole: 'maker',
            accountLabel: 'maker-main',
            side: 'buy',
            plannedQty: '0.5',
            plannedPrice: '30000',
            filledQty: '0.5',
            notional: '15000',
            status: 'filled',
            failureReason: null,
            linkedIntentId: 'intent-maker',
            linkedTrackedOrderId: 'tracked-maker',
          },
        ],
      },
      {
        cycleId: 'cycle-1',
        aggregateStatus: 'completed',
        legs: [],
      },
    ]);

    expect(cycles.map((cycle) => cycle.cycleId)).toEqual(['cycle-1', 'cycle-2']);
    expect(getLatestDirectRuntimeCycle(cycles)?.cycleId).toBe('cycle-2');
    expect(cycles[1].legs.map((leg) => leg.cycleRole)).toEqual(['maker', 'taker']);
    expect(cycles[1].legs[1]).toMatchObject({
      cycleRole: 'taker',
      accountLabel: 'taker-alt',
      side: 'sell',
      failureReason: 'taker IOC rejected',
      linkedIntentId: 'intent-taker',
    });
  });

  it('orders unpadded numeric cycle counters before selecting the latest cycle', () => {
    const cycles = normalizeDirectRuntimeCycles([
      {
        cycleId: 'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
        aggregateStatus: 'completed',
        legs: [],
      },
      {
        cycleId: 'efficient-dual-account-volume:cycle:2:2026-06-04T00:02:00.000Z',
        aggregateStatus: 'completed',
        legs: [],
      },
      {
        cycleId: 'efficient-dual-account-volume:cycle:9:2026-06-04T00:09:00.000Z',
        aggregateStatus: 'partial',
        legs: [],
      },
    ]);

    expect(cycles.map((cycle) => cycle.cycleId)).toEqual([
      'efficient-dual-account-volume:cycle:2:2026-06-04T00:02:00.000Z',
      'efficient-dual-account-volume:cycle:9:2026-06-04T00:09:00.000Z',
      'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
    ]);
    expect(getLatestDirectRuntimeCycle(cycles)?.cycleId).toBe(
      'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
    );
  });

  it('uses timestamp then backend order fallback for non-parseable cycle counters', () => {
    const timestampedCycles = normalizeDirectRuntimeCycles([
      {
        cycleId: 'runtime-cycle-alpha-2026-06-04T00:10:00.000Z',
        aggregateStatus: 'completed',
        legs: [],
      },
      {
        cycleId: 'runtime-cycle-beta-2026-06-04T00:09:00.000Z',
        aggregateStatus: 'completed',
        legs: [],
      },
    ]);
    const backendOrderedCycles = normalizeDirectRuntimeCycles([
      {
        cycleId: 'runtime-cycle-alpha',
        aggregateStatus: 'completed',
        legs: [],
      },
      {
        cycleId: 'runtime-cycle-beta',
        aggregateStatus: 'completed',
        legs: [],
      },
    ]);

    expect(timestampedCycles.map((cycle) => cycle.cycleId)).toEqual([
      'runtime-cycle-beta-2026-06-04T00:09:00.000Z',
      'runtime-cycle-alpha-2026-06-04T00:10:00.000Z',
    ]);
    expect(backendOrderedCycles.map((cycle) => cycle.cycleId)).toEqual([
      'runtime-cycle-alpha',
      'runtime-cycle-beta',
    ]);
  });

  it('describes runtime next action, bottleneck, remaining estimates, and lifecycle state', () => {
    expect(describeDirectRuntimeNextAction(readiness)).toContain(
      'Maker maker-main should buy 0.5 BTC against taker taker-alt',
    );
    expect(describeDirectRuntimeBottleneck(readiness)).toContain(
      'taker-alt BTC is the current bottleneck: 0.4 BTC missing',
    );
    expect(formatDirectRuntimeRemainingEstimate(readiness)).toBe(
      '3 cycles, 45000 USDT / 1.5 BTC estimated volume.',
    );

    expect(
      getDirectRuntimeLifecycleView({
        state: 'paused',
        runtimeState: 'paused',
        readiness,
      }),
    ).toMatchObject({
      label: 'Paused',
      tone: 'info',
      canResumeNow: true,
      readinessGated: false,
    });

    expect(
      getDirectRuntimeLifecycleView({
        state: 'stopped',
        runtimeState: 'stopped',
        readiness: {
          ...readiness,
          canStart: true,
          missingBalances: [],
          blockingReasons: [],
        },
      }),
    ).toMatchObject({
      label: 'Operator stopped',
      tone: 'info',
      canResumeNow: true,
      readinessGated: false,
    });
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

describe('direct variation helpers', () => {
  const metadata: DirectVariationMetadata = {
    orderId: 'order-1',
    state: 'paused',
    strategyDefinitionId: 'strategy-1',
    strategyDefinition: {
      id: 'strategy-1',
      key: 'pure-market-making',
      name: 'Pure Market Making',
      controllerType: 'pureMarketMaking',
    },
    editable: true,
    editability: { editable: true, reason: null, state: 'paused' },
    values: {
      bidSpread: '0.001',
      enabled: true,
      pair: 'BTC/USDT',
      strategyDefinitionId: 'spoofed',
    },
    fields: [
      {
        key: 'bidSpread',
        type: 'number',
        required: false,
        currentValue: '0.001',
        editable: true,
        schema: { type: 'number' },
      },
      {
        key: 'priceSourceType',
        type: 'string',
        required: false,
        enum: ['mid_price', 'last_trade'],
        currentValue: 'mid_price',
        editable: true,
        schema: { type: 'string', enum: ['mid_price', 'last_trade'] },
      },
      {
        key: 'enabled',
        type: 'boolean',
        required: false,
        currentValue: true,
        editable: true,
        schema: { type: 'boolean' },
      },
      {
        key: 'pair',
        type: 'string',
        required: true,
        currentValue: 'BTC/USDT',
        editable: true,
        schema: { type: 'string' },
      },
      {
        key: 'strategyDefinitionId',
        type: 'string',
        required: true,
        currentValue: 'strategy-1',
        editable: true,
        schema: { type: 'string' },
      },
      {
        key: 'readonlyNote',
        type: 'string',
        required: false,
        currentValue: 'server-owned',
        editable: false,
        schema: { type: 'string' },
      },
    ],
  };

  it('initializes variation form values from editable metadata and omits reserved fields', () => {
    expect(getDirectVariationEditableFields(metadata).map((field) => field.key)).toEqual([
      'bidSpread',
      'priceSourceType',
      'enabled',
    ]);
    expect(initializeDirectVariationFormValues(metadata)).toEqual({
      bidSpread: '0.001',
      priceSourceType: 'mid_price',
      enabled: true,
    });
  });

  it('builds save payloads from editable fields only and coerces primitive schema values', () => {
    expect(
      buildDirectVariationConfigOverrides(metadata, {
        bidSpread: '0.002',
        priceSourceType: 'last_trade',
        enabled: false,
        pair: 'ETH/USDT',
        strategyDefinitionId: 'malicious',
        readonlyNote: 'ignored',
      }),
    ).toEqual({
      bidSpread: 0.002,
      priceSourceType: 'last_trade',
      enabled: false,
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

import { render } from 'svelte/server';
import { addMessages, init } from 'svelte-i18n';
import { describe, expect, it } from 'vitest';

import en from '../../../../i18n/en.json';
import { filterDirectCreateStrategies } from '$lib/helpers/market-making/direct/helpers';
import type { DirectReadinessResult } from '$lib/types/hufi/admin-direct-market-making';
import CreateOrderModal from './CreateOrderModal.svelte';

addMessages('en', en);
init({ fallbackLocale: 'en', initialLocale: 'en' });

const staleBalancedReadiness: DirectReadinessResult = {
  canStart: true,
  mode: 'balanced',
  bestFirstAction: {
    makerAccountLabel: 'maker-main',
    takerAccountLabel: 'taker-alt',
    side: 'buy',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    quantity: '0.01',
    price: '50000',
    notional: '500',
  },
  maximumCycleQty: '0.01',
  recommendedCycleQty: '0.01',
  currentBalancesByAccountAsset: [
    {
      accountLabel: 'maker-main',
      asset: 'USDT',
      availableAmount: '1000.00000001',
    },
  ],
  minimumCapitalByAccountAsset: [],
  recommendedCapitalByAccountAsset: [],
  missingBalances: [],
  estimatedCycles: {
    count: '2',
    basis: 'current_available_balances',
  },
  estimatedVolume: {
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    baseAmount: '0.02',
    quoteAmount: '1000',
  },
  blockingReasons: [],
};

const baseProps = {
  show: true,
  isStarting: false,
  exchangeOptions: ['binance'],
  filteredPairs: [{ symbol: 'BTC/USDT' }],
  filteredApiKeys: [
    {
      key_id: 'maker-key',
      name: 'maker-main',
      exchange: 'binance',
      api_key: 'maker-api-key',
      api_secret: 'maker-api-secret',
      permissions: 'read,trade',
    },
    {
      key_id: 'taker-key',
      name: 'taker-alt',
      exchange: 'binance',
      api_key: 'taker-api-key',
      api_secret: 'taker-api-secret',
      permissions: 'read,trade',
    },
  ],
  blockedApiKeyViews: [],
  strategies: [
    {
      id: 'def-efficient',
      key: 'efficient-dual-account-volume',
      name: 'Efficient Dual Account Volume',
      controllerType: 'efficientDualAccountVolume',
      directExecutionMode: 'dual_account' as const,
      defaultConfig: { mode: 'balanced' },
      configSchema: {},
    },
  ],
  selectedControllerType: 'efficientDualAccountVolume',
  directExecutionMode: 'dual_account' as const,
  prefillingFromOrderId: null,
  selectedStrategySchema: {},
  genericConfig: {},
  startExchangeName: 'binance',
  startPair: 'BTC/USDT',
  startStrategyDefinitionId: 'def-efficient',
  startApiKeyId: '',
  startMakerApiKeyId: 'maker-key',
  startTakerApiKeyId: 'taker-key',
  orderAmount: '0.01',
  minOrderAmount: '0.001',
  displayMinOrderAmount: '0.001',
  orderSpread: '',
  intervalTime: '30',
  numTrades: '100',
  pricePushRate: '0',
  postOnlySide: 'buy',
  dynamicRoleSwitching: true,
  targetQuoteVolume: '',
  onSubmit: () => {},
  onClose: () => {},
};

describe('CreateOrderModal efficient readiness rendering', () => {
  it('renders Pure Market Making and backfilled Efficient Dual Account Volume strategy options', () => {
    const strategies = filterDirectCreateStrategies([
      {
        id: 'def-pmm',
        key: 'pure_market_making',
        name: 'Pure Market Making',
        controllerType: 'pureMarketMaking',
        directExecutionMode: 'single_account' as const,
        defaultConfig: {},
        configSchema: {},
      },
      {
        id: 'def-legacy-classic',
        key: 'dual_account_volume',
        name: 'Dual Account Volume',
        controllerType: 'dualAccountVolume',
        directExecutionMode: 'dual_account' as const,
        defaultConfig: {},
        configSchema: {},
      },
      {
        id: 'def-legacy-best',
        key: 'dual_account_best_capacity_volume',
        name: 'Dual Account Best Capacity Volume',
        controllerType: 'dualAccountBestCapacityVolume',
        directExecutionMode: 'dual_account' as const,
        defaultConfig: {},
        configSchema: {},
      },
      {
        id: 'def-efficient-backfilled',
        key: 'efficient_dual_account_volume',
        name: 'Efficient Dual Account Volume',
        controllerType: 'efficientDualAccountVolume',
        directExecutionMode: 'dual_account' as const,
        defaultConfig: { mode: 'balanced' },
        configSchema: {},
      },
    ]);

    const { body } = render(CreateOrderModal, {
      props: {
        ...baseProps,
        strategies,
        startStrategyDefinitionId: '',
        efficientMode: 'balanced',
        readiness: null,
        readinessStatus: 'missing',
        readinessError: '',
      },
    });

    expect(body).toContain('Pure Market Making');
    expect(body).toContain('Efficient Dual Account Volume');
    expect(body).not.toContain('def-legacy-classic');
    expect(body).not.toContain('def-legacy-best');
    expect(body).not.toContain('Dual Account Best Capacity Volume');
  });

  it('hides stale evaluated mode details while a mode change waits for fresh readiness', () => {
    const { body } = render(CreateOrderModal, {
      props: {
        ...baseProps,
        efficientMode: 'fastest_volume',
        readiness: staleBalancedReadiness,
        readinessStatus: 'stale',
        readinessError: '',
      },
    });

    expect(body).toContain('Readiness is stale');
    expect(body).toContain('Inputs changed; waiting for a fresh planner readiness result.');
    expect(body).not.toContain('Evaluated mode');
    expect(body).not.toContain('Can start');
    expect(body).not.toContain('Best first action');
  });

  it('renders matching readiness details and translated blockers for the current mode', () => {
    const { body } = render(CreateOrderModal, {
      props: {
        ...baseProps,
        efficientMode: 'fastest_volume',
        readiness: {
          ...staleBalancedReadiness,
          canStart: false,
          mode: 'fastest_volume',
          bestFirstAction: null,
          missingBalances: [
            {
              accountLabel: 'taker-alt',
              asset: 'BTC',
              availableAmount: '0.001',
              minimumUsefulAmount: '0.01',
              missingAmount: '0.009',
            },
          ],
        },
        readinessStatus: 'blocked',
        readinessError: '',
      },
    });

    expect(body).toContain('Cannot start yet');
    expect(body).toContain('Evaluated mode');
    expect(body).toContain('Fastest volume');
    expect(body).toContain('taker-alt needs 0.009 BTC');
    expect(body).toContain('Deposit the missing asset amount or lower the cycle limit');
  });
});

import { render } from 'svelte/server';
import { addMessages, init } from 'svelte-i18n';
import { describe, expect, it } from 'vitest';

import en from '../../../../i18n/en.json';
import { filterDirectCreateStrategies } from '$lib/helpers/market-making/direct/helpers';
import CreateOrderModal from './CreateOrderModal.svelte';

addMessages('en', en);
init({ fallbackLocale: 'en', initialLocale: 'en' });

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

describe('CreateOrderModal direct strategy rendering', () => {
  it('renders Pure Market Making and Efficient Dual Account Volume strategy options', () => {
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
      },
    });

    expect(body).toContain('Pure Market Making');
    expect(body).toContain('Efficient Dual Account Volume');
  });
});

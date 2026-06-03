import { render } from 'svelte/server';
import { addMessages, init } from 'svelte-i18n';
import { describe, expect, it } from 'vitest';

import en from '../../../../i18n/en.json';
import type { DirectVariationMetadata } from '$lib/types/hufi/admin-direct-market-making';
import StrategyVariationPanel from './StrategyVariationPanel.svelte';

addMessages('en', en);
init({ fallbackLocale: 'en', initialLocale: 'en' });

const pausedMetadata: DirectVariationMetadata = {
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
    askSpread: '0.0015',
    orderAmount: '10',
    priceSourceType: 'mid_price',
    pair: 'BTC/USDT',
    exchangeName: 'binance',
  },
  fields: [
    {
      key: 'bidSpread',
      type: 'number',
      required: false,
      title: 'Bid spread',
      description: 'Distance from mid for bid quotes',
      currentValue: '0.001',
      editable: true,
      schema: { type: 'number', title: 'Bid spread' },
    },
    {
      key: 'askSpread',
      type: 'number',
      required: false,
      title: 'Ask spread',
      currentValue: '0.0015',
      editable: true,
      schema: { type: 'number', title: 'Ask spread' },
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
      key: 'pair',
      type: 'string',
      required: true,
      currentValue: 'BTC/USDT',
      editable: true,
      schema: { type: 'string' },
    },
    {
      key: 'exchangeName',
      type: 'string',
      required: true,
      currentValue: 'binance',
      editable: true,
      schema: { type: 'string' },
    },
  ],
};

describe('StrategyVariationPanel', () => {
  it('renders a loading state until variation metadata loads', () => {
    const { body } = render(StrategyVariationPanel, {
      props: {
        metadata: null,
        loading: true,
      },
    });

    expect(body).toContain('Loading editable strategy variation');
    expect(body).not.toContain('Bid spread');
  });

  it('renders unavailable metadata errors such as a missing strategy snapshot', () => {
    const { body } = render(StrategyVariationPanel, {
      props: {
        metadata: null,
        loading: false,
        error: 'Strategy snapshot resolved config is required for variation edit',
      },
    });

    expect(body).toContain('Variation unavailable');
    expect(body).toContain('Strategy snapshot resolved config is required for variation edit');
  });

  it('renders paused editable controls initialized from metadata without reserved fields', () => {
    const { body } = render(StrategyVariationPanel, {
      props: {
        metadata: pausedMetadata,
        loading: false,
      },
    });

    expect(body).toContain('Paused editable');
    expect(body).toContain('Bid spread');
    expect(body).toContain('value="0.001"');
    expect(body).toContain('Ask spread');
    expect(body).toContain('mid_price');
    expect(body).toContain('Save variation');
    expect(body).not.toContain('BTC/USDT');
    expect(body).not.toContain('exchangeName');
  });

  it('renders active orders as disabled and surfaces validation errors', () => {
    const { body } = render(StrategyVariationPanel, {
      props: {
        metadata: {
          ...pausedMetadata,
          state: 'running',
          editable: false,
          editability: {
            editable: false,
            reason: 'order_not_paused',
            state: 'running',
          },
        },
        saveError: 'order must be paused',
      },
    });

    expect(body).toContain('Editing disabled');
    expect(body).toContain('Pause this order before editing its variation');
    expect(body).toContain('disabled');
    expect(body).toContain('order must be paused');
  });
});

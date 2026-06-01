import { describe, expect, it } from 'vitest';
import {
  buildMarketMakingFundingAssetOptions,
  findMarketMakingPairOptionForOrder,
  isMarketMakingFundingAssetSupported,
  marketMakingFundingAssetLabel,
} from './order-funding-assets';
import type {
  Web3MarketMakingOrderDetail,
  Web3MarketMakingPairOption,
} from '$lib/types/market-making';

const orderDetail = (overrides: Partial<Web3MarketMakingOrderDetail> = {}): Web3MarketMakingOrderDetail =>
  ({
    orderId: 'order-1',
    state: 'created',
    pair: 'BTC/USDT',
    exchangeName: 'binance',
    source: 'web3_market_making_order',
    strategy: {
      id: 'strategy-1',
      key: 'pure_market_making',
      name: 'Pure market making',
      description: null,
      controller: null,
      capabilities: null,
      defaultConfig: null,
      configSchema: null,
      resolvedConfig: {},
      resolvedAt: null,
    },
    specs: {
      pair: 'BTC/USDT',
      exchangeName: 'binance',
      bidSpread: null,
      askSpread: null,
      orderAmount: null,
      orderRefreshTime: null,
      numberOfLayers: null,
      priceSourceType: null,
      amountChangePerLayer: null,
      amountChangeType: null,
      ceilingPrice: null,
      floorPrice: null,
    },
    balances: [],
    performance: {
      realizedDeltaByAsset: {},
      feePaidByAsset: {},
      pnlByAsset: {},
      snapshots: [],
    },
    validActions: {
      deposit: true,
      withdraw: true,
      start: true,
      pause: false,
      resume: false,
    },
    lifecycleError: null,
    createdAt: '2026-06-01T00:00:00Z',
    events: [],
    ...overrides,
  }) as Web3MarketMakingOrderDetail;

const pairOption = (overrides: Partial<Web3MarketMakingPairOption> = {}): Web3MarketMakingPairOption => ({
  pairId: 'pair-1',
  pair: 'BTC/USDT',
  exchangeName: 'binance',
  base: {
    assetId: 'asset-btc',
    symbol: 'BTC',
  },
  quote: {
    assetId: 'asset-usdt',
    symbol: 'USDT',
  },
  supportedDepositAssets: ['asset-usdt', 'asset-btc'],
  minimums: {
    orderAmount: '10',
    maximumOrderAmount: '10000',
  },
  precision: {
    amount: 6,
    price: 2,
  },
  prices: {
    base: null,
    quote: null,
  },
  strategyCompatibility: ['pureMarketMaking'],
  unavailable: false,
  ...overrides,
});

describe('market-making order funding assets', () => {
  it('builds selector values from backend pair asset IDs while displaying human symbols', () => {
    const options = buildMarketMakingFundingAssetOptions(orderDetail(), [pairOption()]);

    expect(options).toEqual([
      {
        assetId: 'asset-usdt',
        symbol: 'USDT',
        label: 'USDT · asset-usdt',
      },
      {
        assetId: 'asset-btc',
        symbol: 'BTC',
        label: 'BTC · asset-btc',
      },
    ]);
    expect(options.map((option) => option.assetId)).not.toContain('USDT');
    expect(options.map((option) => option.assetId)).not.toContain('BTC');
  });

  it('matches the current order by pair and exchange before choosing supported asset IDs', () => {
    const matched = findMarketMakingPairOptionForOrder(orderDetail(), [
      pairOption({
        pairId: 'wrong-exchange',
        exchangeName: 'coinbase',
        supportedDepositAssets: ['coinbase-usdt'],
      }),
      pairOption(),
    ]);

    expect(matched?.pairId).toBe('pair-1');
  });

  it('validates only backend-supported IDs and resolves labels separately', () => {
    const options = buildMarketMakingFundingAssetOptions(orderDetail(), [pairOption()]);

    expect(isMarketMakingFundingAssetSupported('asset-usdt', options)).toBe(true);
    expect(isMarketMakingFundingAssetSupported('USDT', options)).toBe(false);
    expect(marketMakingFundingAssetLabel('asset-usdt', options)).toBe('USDT · asset-usdt');
  });

  it('falls back to order balance asset IDs without parsing pair symbols when options are unavailable', () => {
    const options = buildMarketMakingFundingAssetOptions(
      orderDetail({
        balances: [
          {
            orderId: 'order-1',
            assetId: 'asset-usdt',
            available: '10',
            locked: '0',
            total: '10',
            initialDeposit: '10',
            realizedDelta: '0',
            feePaid: '0',
            updatedAt: '2026-06-01T00:00:00Z',
          },
        ],
      }),
      []
    );

    expect(options).toEqual([
      {
        assetId: 'asset-usdt',
        symbol: null,
        label: 'asset-usdt',
      },
    ]);
    expect(options.map((option) => option.assetId)).not.toContain('BTC');
    expect(options.map((option) => option.assetId)).not.toContain('USDT');
  });
});

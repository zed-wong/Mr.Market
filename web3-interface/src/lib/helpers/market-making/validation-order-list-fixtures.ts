import { isValidationWalletEnabled } from '$lib/helpers/constants';
import BigNumber from 'bignumber.js';
import type {
  Web3MarketMakingOrderBalance,
  Web3MarketMakingOrderListResponse,
  Web3MarketMakingOrderSummary,
} from '$lib/types/market-making';

export type ValidationOrderListFixtureState = 'empty' | 'zero' | 'many' | 'compact';

const FIXTURE_TIMESTAMP = '2026-06-01T00:00:00.000Z';

const balance = (
  orderId: string,
  assetId: string,
  available: string,
  locked: string,
  initialDeposit: string
): Web3MarketMakingOrderBalance => ({
  orderId,
  assetId,
  available,
  locked,
  total: new BigNumber(available).plus(locked).toString(10),
  initialDeposit,
  realizedDelta: '0',
  feePaid: '0',
  updatedAt: FIXTURE_TIMESTAMP,
});

const baseOrder = (
  index: number,
  overrides: Partial<Web3MarketMakingOrderSummary> = {}
): Web3MarketMakingOrderSummary => {
  const orderId = `validation-mm-${String(index).padStart(2, '0')}`;
  const pair = index % 2 === 0 ? 'ETH/USDT' : 'BTC/USDT';
  const state = index % 3 === 0 ? 'paused' : index % 5 === 0 ? 'error' : 'running';
  const baseAsset = pair.startsWith('ETH') ? 'asset-eth' : 'asset-btc';

  return {
    orderId,
    state,
    pair,
    exchangeName: index % 2 === 0 ? 'binance' : 'mexc',
    source: 'web3_market_making_order',
    strategy: {
      id: 'validation-pure-market-making',
      key: 'pure_market_making',
      name: 'Pure market making',
      description: 'Validation fixture strategy',
      controller: 'pure_market_making',
      capabilities: {},
      defaultConfig: {},
      configSchema: {},
      resolvedConfig: {},
      resolvedAt: FIXTURE_TIMESTAMP,
    },
    specs: {
      pair,
      exchangeName: index % 2 === 0 ? 'binance' : 'mexc',
      bidSpread: '0.20%',
      askSpread: '0.25%',
      orderAmount: String(10 + index),
      orderRefreshTime: '30',
      numberOfLayers: 3,
      priceSourceType: 'tracked',
      amountChangePerLayer: '0',
      amountChangeType: 'fixed',
      ceilingPrice: null,
      floorPrice: null,
    },
    balances: [
      balance(orderId, baseAsset, String(1 + index / 10), String(index / 10), String(1 + index / 5)),
      balance(orderId, 'asset-usdt', String(100 + index * 10), String(40 + index * 5), String(150 + index * 20)),
    ],
    performance: {
      realizedDeltaByAsset: {
        'asset-usdt': String(index * 2),
      },
      feePaidByAsset: {
        [baseAsset]: String(index / 1000),
        'asset-usdt': String(index / 10),
      },
      pnlByAsset: {
        [baseAsset]: String(index / 100),
        'asset-usdt': String(index * 2),
      },
      snapshots: [],
    },
    validActions: {
      deposit: true,
      withdraw: true,
      start: state === 'paused',
      pause: state === 'running',
      resume: state === 'paused',
    },
    lifecycleError: state === 'error' ? 'Validation fixture lifecycle error' : null,
    createdAt: FIXTURE_TIMESTAMP,
    ...overrides,
  };
};

const manyOrders = (): Web3MarketMakingOrderSummary[] =>
  Array.from({ length: 5 }, (_, index) => baseOrder(index + 1));

export const validationOrderListFixtureForState = (
  state: string | null | undefined
): Web3MarketMakingOrderListResponse | null => {
  if (!isValidationWalletEnabled()) return null;

  const normalized = (state || '').trim().toLowerCase();
  if (normalized === 'empty' || normalized === 'zero') {
    return {
      namespace: '/web3/market-making',
      total: 0,
      orders: [],
    };
  }

  if (normalized === 'many' || normalized === 'compact') {
    const orders = manyOrders();
    return {
      namespace: '/web3/market-making',
      total: orders.length,
      orders,
    };
  }

  return null;
};

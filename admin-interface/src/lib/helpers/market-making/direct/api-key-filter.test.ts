import { describe, expect, it } from 'vitest';

import type { AdminSingleKey } from '$lib/types/hufi/admin';

import {
  buildDirectOrderExchangeOptions,
  filterExecutableApiKeys,
  filterReadableApiKeys,
  filterReadOnlyApiKeys,
  getBlockedDirectApiKeyUseViews,
} from './api-key-filter';

const apiKeys: AdminSingleKey[] = [
  {
    key_id: 'read-binance',
    exchange: 'binance',
    name: 'binance-read',
    api_key: 'k1',
    api_secret: 's1',
    permissions: 'read',
    state: 'alive',
    validation_status: 'valid',
  },
  {
    key_id: 'trade-binance',
    exchange: 'binance',
    name: 'binance-trade',
    api_key: 'k2',
    api_secret: 's2',
    permissions: 'read-trade',
    state: 'alive',
    validation_status: 'valid',
  },
  {
    key_id: 'trade-mexc',
    exchange: 'mexc',
    name: 'mexc-trade',
    api_key: 'k3',
    api_secret: 's3',
    permissions: 'read-trade',
    state: 'alive',
    validation_status: 'valid',
  },
  {
    key_id: 'pending-binance',
    exchange: 'binance',
    name: 'binance-pending',
    api_key: 'k4',
    api_secret: 's4',
    permissions: 'read-trade',
    validation_status: 'pending',
  },
];

describe('filterExecutableApiKeys', () => {
  it('builds direct order exchange options from configured exchanges pairs and api keys', () => {
    expect(
      buildDirectOrderExchangeOptions(
        {
          exchanges: [
            { exchange_id: 'binance', name: 'Binance', enable: true },
            { exchange_id: 'coinbase', name: 'Coinbase', enable: false },
          ],
          market_making: {
            exchanges: [
              { exchange_id: 'okx', name: 'OKX', enable: true },
              { exchange_id: 'binance', name: 'Binance', enable: true },
            ],
            pairs: [
              {
                id: 'okx-btc',
                exchange_id: 'okx',
                symbol: 'BTC/USDT',
                base_symbol: 'BTC',
                quote_symbol: 'USDT',
                base_asset_id: 'btc',
                base_icon_url: '',
                quote_asset_id: 'usdt',
                quote_icon_url: '',
                enable: true,
              },
              {
                id: 'kraken-eth',
                exchange_id: 'kraken',
                symbol: 'ETH/USDT',
                base_symbol: 'ETH',
                quote_symbol: 'USDT',
                base_asset_id: 'eth',
                base_icon_url: '',
                quote_asset_id: 'usdt',
                quote_icon_url: '',
                enable: true,
              },
            ],
          },
        },
        apiKeys,
      ),
    ).toEqual(['okx', 'binance', 'kraken', 'coinbase', 'mexc']);
  });

  it('keeps configured direct exchanges visible even when no api key exists', () => {
    expect(
      buildDirectOrderExchangeOptions(
        {
          exchanges: [],
          market_making: {
            exchanges: [{ exchange_id: 'okx', name: 'OKX', enable: true }],
            pairs: [],
          },
        },
        [],
      ),
    ).toEqual(['okx']);
  });

  it('keeps only read-trade keys for the selected exchange', () => {
    expect(filterExecutableApiKeys(apiKeys, 'binance')).toEqual([
      apiKeys[1],
    ]);
  });

  it('returns no keys when the selected exchange only has read-only keys', () => {
    expect(filterExecutableApiKeys(apiKeys, 'okx')).toEqual([]);
  });

  it('excludes pending failed disabled unknown and read-only keys from direct order execution', () => {
    expect(filterExecutableApiKeys(apiKeys, 'binance').map((key) => key.key_id)).toEqual([
      'trade-binance',
    ]);
    expect(getBlockedDirectApiKeyUseViews(apiKeys, 'binance', 'trade').map((view) => view.label)).toEqual([
      'read only',
      'validation pending',
    ]);
  });

  it('keeps only ready read-capable keys for campaign joins', () => {
    expect(filterReadableApiKeys(apiKeys, 'binance').map((key) => key.key_id)).toEqual([
      'read-binance',
      'trade-binance',
    ]);
  });

  it('keeps only read-only keys for campaign joins', () => {
    expect(filterReadOnlyApiKeys(apiKeys, 'Binance').map((key) => key.key_id)).toEqual([
      'read-binance',
    ]);
  });

  it('does not filter out read-only keys when campaign exchange is unavailable placeholder', () => {
    expect(filterReadOnlyApiKeys(apiKeys, '—').map((key) => key.key_id)).toEqual([
      'read-binance',
    ]);
  });
});

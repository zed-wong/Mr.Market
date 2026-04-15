import { describe, expect, it } from 'vitest';

import type { AdminSingleKey } from '$lib/types/hufi/admin';

import { filterExecutableApiKeys } from './api-key-filter';

const apiKeys: AdminSingleKey[] = [
  {
    key_id: 'read-binance',
    exchange: 'binance',
    name: 'binance-read',
    api_key: 'k1',
    api_secret: 's1',
    permissions: 'read',
  },
  {
    key_id: 'trade-binance',
    exchange: 'binance',
    name: 'binance-trade',
    api_key: 'k2',
    api_secret: 's2',
    permissions: 'read-trade',
  },
  {
    key_id: 'trade-mexc',
    exchange: 'mexc',
    name: 'mexc-trade',
    api_key: 'k3',
    api_secret: 's3',
    permissions: 'read-trade',
  },
];

describe('filterExecutableApiKeys', () => {
  it('keeps only read-trade keys for the selected exchange', () => {
    expect(filterExecutableApiKeys(apiKeys, 'binance')).toEqual([
      apiKeys[1],
    ]);
  });

  it('returns no keys when the selected exchange only has read-only keys', () => {
    expect(filterExecutableApiKeys(apiKeys, 'okx')).toEqual([]);
  });
});

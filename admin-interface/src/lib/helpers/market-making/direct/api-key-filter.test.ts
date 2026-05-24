import { describe, expect, it } from 'vitest';

import type { AdminSingleKey } from '$lib/types/hufi/admin';

import {
  filterExecutableApiKeys,
  filterReadableApiKeys,
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
});

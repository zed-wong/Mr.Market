import { describe, expect, it } from 'vitest';

import { apiKeyReadiness, buildSetupReadiness } from './setup-readiness';
import type { AdminSystemHealthResponse } from '$lib/helpers/api/system';
import type { AdminSingleKey } from '$lib/types/hufi/admin';
import type { DirectOrderSummary } from '$lib/types/hufi/admin-direct-market-making';
import type { GrowInfo } from '$lib/types/hufi/grow';
import type { StrategyDefinition } from '$lib/types/hufi/strategy-definition';

const growInfo = (enable: boolean): GrowInfo => ({
  exchanges: [{ exchange_id: 'binance', name: 'Binance', enable }],
  simply_grow: { tokens: [] },
  arbitrage: { pairs: [] },
  market_making: { pairs: [], exchanges: [] },
});

const health = (overallStatus: AdminSystemHealthResponse['overallStatus']): AdminSystemHealthResponse => ({
  generatedAt: '2026-05-23T00:00:00.000Z',
  overallStatus,
  summary: { total: 1, healthy: overallStatus === 'healthy' ? 1 : 0, warning: overallStatus === 'warning' ? 1 : 0, critical: overallStatus === 'critical' ? 1 : 0, unknown: 0 },
  groups: [],
  services: [],
  filters: { group: null, service: null, availableGroups: [], availableServices: [] },
  limits: {
    maxServices: 20,
    sourceTimeoutMs: 1000,
    maxConnectorAccounts: 10,
    maxRuntimeRows: 10,
    maxTrackedOrderSample: 10,
  },
});

const strategy: StrategyDefinition = {
  id: 'pure-mm',
  key: 'pure-mm',
  name: 'Pure MM',
  controllerType: 'pureMarketMaking',
  configSchema: {},
  defaultConfig: {},
  enabled: true,
  visibility: 'admin',
  createdAt: '2026-05-23T00:00:00.000Z',
  updatedAt: '2026-05-23T00:00:00.000Z',
};

const order: DirectOrderSummary = {
  orderId: 'order-1',
  exchangeName: 'binance',
  pair: 'BTC/USDT',
  state: 'running',
  runtimeState: 'running',
  strategyName: 'Pure MM',
  controllerType: 'pureMarketMaking',
  createdAt: '2026-05-23T00:00:00.000Z',
  lastTickAt: '2026-05-23T00:00:00.000Z',
  accountLabel: 'main',
  makerAccountLabel: 'maker',
  takerAccountLabel: 'taker',
  apiKeyId: 'key-1',
  makerApiKeyId: null,
  takerApiKeyId: null,
  warnings: [],
};

describe('setup readiness', () => {
  it('classifies API key validation states conservatively', () => {
    expect(apiKeyReadiness({ state: 'alive', validation_status: 'valid' } as AdminSingleKey)).toBe('ready');
    expect(apiKeyReadiness({ validation_status: 'pending' } as AdminSingleKey)).toBe('needs_attention');
    expect(apiKeyReadiness({ validation_status: 'failed', validation_error: 'bad key' } as AdminSingleKey)).toBe('needs_attention');
    expect(apiKeyReadiness({ state: 'disabled', validation_status: 'valid' } as AdminSingleKey)).toBe('needs_attention');
    expect(apiKeyReadiness({ state: 'mystery' } as AdminSingleKey)).toBe('unknown');
  });

  it('builds all required first-time setup categories with live ready states', () => {
    const areas = buildSetupReadiness({
      backendReachable: true,
      session: { authenticated: true, username: 'admin' },
      growInfo: growInfo(true),
      apiKeys: [{ key_id: 'key-1', exchange: 'binance', name: 'main', api_key: 'abc', api_secret: '', state: 'alive', validation_status: 'valid' }],
      health: health('healthy'),
      wallet: { configured: true, address: '0x0000000000000000000000000000000000000000' },
      directOrders: [order],
      directStrategies: [strategy],
    });

    expect(areas.map((area) => area.title)).toEqual([
      'backend reachability',
      'admin authentication and session',
      'exchange configuration',
      'API key validation',
      'wallet and system health',
      'direct market-making readiness',
    ]);
    expect(areas.every((area) => area.status === 'ready')).toBe(true);
  });

  it('marks missing setup data as needs attention and request failures as failed', () => {
    const areas = buildSetupReadiness({
      backendError: 'network down',
      session: { authenticated: true },
      growInfo: growInfo(false),
      apiKeys: [],
      health: health('warning'),
      wallet: { configured: false, address: null },
      directOrders: [],
      directStrategies: [],
    });

    expect(areas.find((area) => area.id === 'backend')?.status).toBe('failed');
    expect(areas.find((area) => area.id === 'exchanges')?.status).toBe('needs_attention');
    expect(areas.find((area) => area.id === 'api-keys')?.status).toBe('needs_attention');
    expect(areas.find((area) => area.id === 'wallet-system')?.status).toBe('needs_attention');
    expect(areas.find((area) => area.id === 'direct-market-making')?.status).toBe('needs_attention');
  });

  it('uses exchange readiness vocabulary that matches exchange management labels', () => {
    const ready = buildSetupReadiness({ growInfo: growInfo(true) });
    const missing = buildSetupReadiness({ growInfo: { ...growInfo(true), exchanges: [] } });
    const disabled = buildSetupReadiness({ growInfo: growInfo(false) });
    const unknown = buildSetupReadiness({
      growInfo: {
        ...growInfo(true),
        exchanges: [{ exchange_id: 'binance', name: 'Binance' } as GrowInfo['exchanges'][number]],
      },
    });

    expect(ready.find((area) => area.id === 'exchanges')?.summary).toContain(
      '1 exchange is ready',
    );
    expect(missing.find((area) => area.id === 'exchanges')?.summary).toContain('missing');
    expect(disabled.find((area) => area.id === 'exchanges')?.summary).toContain('disabled');
    expect(unknown.find((area) => area.id === 'exchanges')?.status).toBe('unknown');
    expect(unknown.find((area) => area.id === 'exchanges')?.summary).toContain('unknown');
  });

  it('uses API key readiness vocabulary that matches API key management labels', () => {
    const ready = buildSetupReadiness({
      apiKeys: [{ key_id: 'key-1', exchange: 'binance', name: 'main', api_key: 'abc', api_secret: '', state: 'alive', validation_status: 'valid' }],
    });
    const pending = buildSetupReadiness({
      apiKeys: [{ key_id: 'key-2', exchange: 'binance', name: 'pending', api_key: 'def', api_secret: '', validation_status: 'pending' }],
    });
    const failed = buildSetupReadiness({
      apiKeys: [{ key_id: 'key-3', exchange: 'binance', name: 'failed', api_key: 'ghi', api_secret: '', validation_status: 'failed' }],
    });
    const disabled = buildSetupReadiness({
      apiKeys: [{ key_id: 'key-4', exchange: 'binance', name: 'disabled', api_key: 'jkl', api_secret: '', state: 'disabled', validation_status: 'valid' }],
    });
    const missing = buildSetupReadiness({ apiKeys: [] });
    const unknown = buildSetupReadiness({
      apiKeys: [{ key_id: 'key-5', exchange: 'binance', name: 'unknown', api_key: 'mno', api_secret: '', state: 'mystery' }],
    });

    expect(ready.find((area) => area.id === 'api-keys')?.summary).toContain('1 API key is ready');
    expect(pending.find((area) => area.id === 'api-keys')?.summary).toContain('validation pending');
    expect(failed.find((area) => area.id === 'api-keys')?.summary).toContain('validation failed');
    expect(disabled.find((area) => area.id === 'api-keys')?.summary).toContain('disabled');
    expect(missing.find((area) => area.id === 'api-keys')?.summary).toContain('missing');
    expect(unknown.find((area) => area.id === 'api-keys')?.status).toBe('unknown');
    expect(unknown.find((area) => area.id === 'api-keys')?.summary).toContain('unknown');
  });
});

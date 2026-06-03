import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsChartSections,
  buildAnalyticsRequestKey,
  buildDirectMarketMakingMetricCards,
  resolveAnalyticsPanelState,
} from './analytics-view-model';
import type {
  AdminAnalyticsFoundationResponse,
  DirectMarketMakingDashboardResponse,
} from '$lib/types/hufi/admin-analytics';

const metric = (value: string | null, status: 'available' | 'unavailable' = 'available') => ({
  status,
  value,
  currency: 'USDT',
  unavailableReason: status === 'unavailable' ? 'order-book-mid-unavailable' : null,
});

const dashboard: DirectMarketMakingDashboardResponse = {
  generatedAt: '2026-06-04T00:10:00.000Z',
  scope: { type: 'order', orderId: 'order-1', exchange: 'binance', pair: 'BTC/USDT' },
  range: { key: '24h', startedAt: '2026-06-03T00:00:00.000Z', endedAt: '2026-06-04T00:00:00.000Z' },
  filters: { orderId: 'order-1', exchange: 'binance', pair: 'BTC/USDT' },
  dashboard: {
    scope: { type: 'order', orderId: 'order-1', exchange: 'binance', pair: 'BTC/USDT' },
    orderIds: ['order-1'],
    costRevenue: {
      spreadCapture: metric('12.5'),
      feeCost: metric('1.25'),
      inventorySkew: {
        status: 'unavailable',
        unavailableReason: 'order-book-mid-unavailable',
        quantity: { status: 'available', value: '0.4', currency: 'BTC', unavailableReason: null },
        costBasis: metric('100'),
        notional: metric(null, 'unavailable'),
      },
      realizedPnl: metric('12.5'),
      unrealizedPnl: metric(null, 'unavailable'),
      netPnl: metric(null, 'unavailable'),
      fillRate: { status: 'available', value: '0.5', currency: null, unavailableReason: null, filledQuotes: 3, totalQuotes: 6 },
      quoteUptime: { status: 'available', value: '0.75', currency: null, unavailableReason: null, activeMs: 750, windowMs: 1000 },
    },
    sources: ['performance_service_order_performance', 'order_book_tracker_mid'],
  },
};

const foundation: AdminAnalyticsFoundationResponse = {
  generatedAt: '2026-06-04T00:10:00.000Z',
  scope: { type: 'order', orderId: 'order-1', exchange: 'binance', pair: 'BTC/USDT' },
  range: { key: '24h', startedAt: '2026-06-03T00:00:00.000Z', endedAt: '2026-06-04T00:00:00.000Z' },
  filters: { orderId: 'order-1', exchange: 'binance', pair: 'BTC/USDT' },
  summary: { counts: { ledgerEntries: 1, orderBalances: 1, trackedOrders: 2, strategyOrderIntents: 2, strategyExecutions: 1, orderBookMids: 1 } },
  sources: { orderBookMids: [] },
  analytics: {
    perOrder: {
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      pnl: {
        realized: metric('12.5'),
        unrealized: metric(null, 'unavailable'),
        net: metric(null, 'unavailable'),
        realizedNet: metric('11.25'),
      },
      fees: { total: metric('1.25') },
      inventoryExposure: {
        quantity: { status: 'available', value: '0.4', currency: 'BTC', unavailableReason: null },
        costBasis: metric('100'),
        averageCost: metric('250'),
        notional: metric(null, 'unavailable'),
        balances: [],
      },
      spreadCapture: { quote: metric('12.5'), effectiveSpreadBps: '25', tradedQuoteVolume: metric('500'), fillCount: 3 },
      drawdown: {
        status: 'available',
        maxDrawdownQuote: '4',
        currency: 'USDT',
        peakAt: '2026-06-04T00:05:00.000Z',
        troughAt: '2026-06-04T00:08:00.000Z',
        unavailableReason: null,
        series: [
          { t: '2026-06-04T00:00:00.000Z', realized: '0', fees: '0', net: '0' },
          { t: '2026-06-04T00:05:00.000Z', realized: '12.5', fees: '1.25', net: '11.25' },
          { t: '2026-06-04T00:08:00.000Z', realized: '8.5', fees: '1.25', net: '7.25' },
        ],
      },
      timeline: {
        events: [
          { id: 'intent:1', type: 'quote', at: '2026-06-04T00:01:00.000Z', source: 'strategy_order_intent', sourceId: 'intent-1', status: 'DONE', side: 'buy', price: '100', qty: '0.1', sourceRef: { type: 'strategy_order_intent', id: 'intent-1' } },
          { id: 'tracked:1:fill', type: 'fill', at: '2026-06-04T00:02:00.000Z', source: 'tracked_order', sourceId: 'track-1', status: 'filled', side: 'buy', price: '100', qty: '0.1', sourceRef: { type: 'tracked_order', id: 'track-1' } },
          { id: 'tracked:2:cancel', type: 'cancel', at: '2026-06-04T00:03:00.000Z', source: 'tracked_order', sourceId: 'track-2', status: 'cancelled', side: 'sell', price: '101', qty: '0.1', sourceRef: { type: 'tracked_order', id: 'track-2' } },
        ],
      },
      dataSources: ['performance_service_order_performance'],
    },
    aggregate: null,
  },
  dataSources: ['ledger_entries'],
  numericSerialization: { format: 'decimal-string', calculator: 'bignumber.js', zeroFallbackForUnavailableMetrics: false },
  limits: { defaultLimit: 100, maxLimit: 500, appliedLimit: 100, orderBookStaleMs: 30000 },
};

describe('analytics dashboard view model', () => {
  it('builds Direct MM cards for every cost and revenue metric without zeroing unavailable values', () => {
    const cards = buildDirectMarketMakingMetricCards(dashboard);

    expect(cards.map((card) => card.labelKey)).toEqual([
      'admin_analytics_metric_spread_capture',
      'admin_analytics_metric_fee_cost',
      'admin_analytics_metric_inventory_skew',
      'admin_analytics_metric_realized_pnl',
      'admin_analytics_metric_unrealized_pnl',
      'admin_analytics_metric_fill_rate',
      'admin_analytics_metric_quote_uptime',
    ]);
    expect(cards.find((card) => card.key === 'unrealizedPnl')).toMatchObject({
      status: 'unavailable',
      displayValue: 'unavailable',
      reason: 'order-book-mid-unavailable',
    });
    expect(cards.find((card) => card.key === 'unrealizedPnl')?.displayValue).not.toBe('0');
    expect(cards.find((card) => card.key === 'fillRate')?.caption).toBe('3 / 6 quotes');
  });

  it('builds PNL, inventory, risk, and timeline chart sections from non-empty API data', () => {
    const sections = buildAnalyticsChartSections(foundation);

    expect(sections.map((section) => section.key)).toEqual([
      'pnl',
      'inventory',
      'drawdown',
      'timeline',
    ]);
    expect(sections.find((section) => section.key === 'pnl')?.summary).toContain('3 points');
    expect(sections.find((section) => section.key === 'inventory')?.summary).toContain('unavailable');
    expect(sections.find((section) => section.key === 'timeline')?.events?.map((event) => event.type)).toEqual([
      'quote',
      'fill',
      'cancel',
    ]);
  });

  it('returns explicit loading, error, empty, and ready states', () => {
    expect(resolveAnalyticsPanelState({ loading: true, error: null, foundation: null, dashboard: null })).toBe('loading');
    expect(resolveAnalyticsPanelState({ loading: false, error: 'failed', foundation: null, dashboard: null })).toBe('error');
    expect(resolveAnalyticsPanelState({
      loading: false,
      error: null,
      foundation: {
        ...foundation,
        analytics: { perOrder: null, aggregate: null },
      },
      dashboard: {
        ...dashboard,
        dashboard: { ...dashboard.dashboard, orderIds: [] },
      },
    })).toBe('empty');
    expect(resolveAnalyticsPanelState({ loading: false, error: null, foundation, dashboard })).toBe('ready');
  });

  it('changes the request key when scope, order, pair, or range changes to prevent stale chart data', () => {
    const first = buildAnalyticsRequestKey({ scope: 'admin', range: '24h' });
    const rangeChanged = buildAnalyticsRequestKey({ scope: 'admin', range: '7d' });
    const scopeChanged = buildAnalyticsRequestKey({ scope: 'pair', exchange: 'binance', pair: 'BTC/USDT', range: '7d' });
    const orderChanged = buildAnalyticsRequestKey({ scope: 'order', orderId: 'order-2', range: '7d' });

    expect(new Set([first, rangeChanged, scopeChanged, orderChanged]).size).toBe(4);
  });
});

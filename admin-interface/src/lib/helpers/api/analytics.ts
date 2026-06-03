import { apiFetch } from './client';
import type {
  AdminAnalyticsFoundationResponse,
  AnalyticsRange,
  AnalyticsScope,
  DirectMarketMakingDashboardResponse,
} from '$lib/types/hufi/admin-analytics';

export const ANALYTICS_RANGES = ['24h', '7d', '30d'] as const;
export const ANALYTICS_SCOPES = ['admin', 'pair', 'order'] as const;

export interface AdminAnalyticsQuery {
  scope?: AnalyticsScope;
  orderId?: string;
  exchange?: string;
  pair?: string;
  range?: AnalyticsRange;
  startAt?: string;
  endAt?: string;
  limit?: number;
}

const optionalToken = (value?: string) => {
  const normalized = value?.trim();

  if (!normalized || normalized.toLowerCase() === 'all') {
    return undefined;
  }

  return normalized;
};

export const normalizeAnalyticsQuery = (query: AdminAnalyticsQuery = {}) => {
  const exchange = optionalToken(query.exchange)?.toLowerCase();
  const pair = optionalToken(query.pair)?.toUpperCase();

  return {
    scope: query.scope,
    orderId: optionalToken(query.orderId),
    exchange,
    pair,
    range: query.range,
    startAt: optionalToken(query.startAt),
    endAt: optionalToken(query.endAt),
    limit: query.limit,
  };
};

const cleanQuery = (query: Record<string, string | number | undefined | null>) =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

export const fetchAdminAnalyticsFoundation = (query: AdminAnalyticsQuery = {}) =>
  apiFetch<AdminAnalyticsFoundationResponse>('/admin/analytics/foundation', {
    query: cleanQuery(normalizeAnalyticsQuery(query)),
  });

export const fetchOrderAnalytics = (
  orderId: string,
  query: Omit<AdminAnalyticsQuery, 'scope' | 'orderId'> = {},
) =>
  apiFetch<AdminAnalyticsFoundationResponse['analytics']['perOrder']>(
    `/admin/analytics/orders/${encodeURIComponent(orderId.trim())}`,
    {
      query: cleanQuery(normalizeAnalyticsQuery(query)),
    },
  );

export const fetchDirectMarketMakingDashboard = (query: AdminAnalyticsQuery = {}) =>
  apiFetch<DirectMarketMakingDashboardResponse>('/admin/analytics/direct-market-making/dashboard', {
    query: cleanQuery(normalizeAnalyticsQuery(query)),
  });

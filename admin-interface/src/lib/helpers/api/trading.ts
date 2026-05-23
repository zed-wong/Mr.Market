import { apiFetch } from './client';

export const ORDER_STATUSES = [
  'pending_create',
  'open',
  'partially_filled',
  'pending_cancel',
  'filled',
  'cancelled',
  'failed',
  'external_missing',
  'internal_missing',
] as const;

export const ORDER_SIDES = ['buy', 'sell'] as const;

export type AdminOrderStatus = (typeof ORDER_STATUSES)[number];
export type AdminOrderSide = (typeof ORDER_SIDES)[number];

export interface AdminPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AdminOrdersQuery {
  status?: AdminOrderStatus | 'all';
  side?: AdminOrderSide | 'all';
  query?: string;
  limit?: number;
  page?: number;
}

export interface AdminOrder {
  trackingKey: string;
  orderId: string;
  symbol: string;
  pair: string;
  side: string;
  type: string;
  role: string | null;
  quantity: string;
  filledQuantity: string;
  fillPercent: string;
  price: string;
  status: string;
  exchange: string;
  accountLabel: string | null;
  strategyKey: string;
  exchangeOrderId: string;
  clientOrderId: string | null;
  slotKey: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  executions: {
    count: number;
    lastExecutedAt: string | null;
    statuses: string[];
    strategyTypes: string[];
  };
}

export interface AdminOrdersResponse {
  generatedAt: string;
  items: AdminOrder[];
  pagination: AdminPagination;
  filters: {
    status: string | null;
    side: string | null;
    query: string | null;
  };
  limits: {
    defaultLimit: number;
    maxLimit: number;
    maxPage: number;
    maxQueryLength: number;
    executionScanLimit: number;
  };
}

export interface AdminPositionsQuery {
  exchange?: string;
  asset?: string;
  query?: string;
  limit?: number;
  page?: number;
}

export interface AdminPosition {
  id: string;
  orderId: string;
  asset: string;
  assetId: string;
  exchange: string | null;
  accountLabel: string | null;
  pair: string | null;
  strategyKey: string | null;
  strategyType: string | null;
  strategyStatus: string | null;
  orderStatus: string | null;
  available: string;
  locked: string;
  total: string;
  quantity: string;
  initialDeposit: string;
  realizedDelta: string;
  feePaid: string;
  exposure: {
    asset: string;
    quantity: string;
    notional: string | null;
    currency: string | null;
    unavailableReason: string;
  };
  avgCost: string | null;
  realizedPnl: string | null;
  unrealizedPnl: string | null;
  markPrice: string | null;
  portfolioPercent: string | null;
  pnl: {
    averageCost: string | null;
    realized: string | null;
    unrealized: string | null;
    markPrice: string | null;
    portfolioPercent: string | null;
    unavailableReason: string;
  };
  dataSources: string[];
  updatedAt: string | null;
}

export interface AdminPositionsResponse {
  generatedAt: string;
  items: AdminPosition[];
  summary: {
    scannedRows: number;
    totalRows: number;
    truncated: boolean;
    byAsset: Array<{
      asset: string;
      available: string;
      locked: string;
      total: string;
    }>;
  };
  pagination: AdminPagination;
  filters: {
    exchange: string | null;
    asset: string | null;
    query: string | null;
  };
  limits: {
    defaultLimit: number;
    maxLimit: number;
    maxPage: number;
    maxQueryLength: number;
    metadataScanLimit: number;
  };
}

const cleanQuery = (query: Record<string, string | number | undefined | null>) =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

export const fetchAdminOrders = (query: AdminOrdersQuery = {}) =>
  apiFetch<AdminOrdersResponse>('/admin/orders', {
    query: cleanQuery({
      status: query.status && query.status !== 'all' ? query.status : undefined,
      side: query.side && query.side !== 'all' ? query.side : undefined,
      query: query.query?.trim(),
      limit: query.limit,
      page: query.page,
    }),
  });

export const fetchAdminPositions = (query: AdminPositionsQuery = {}) =>
  apiFetch<AdminPositionsResponse>('/admin/positions', {
    query: cleanQuery({
      exchange: query.exchange && query.exchange !== 'all' ? query.exchange : undefined,
      asset: query.asset && query.asset !== 'all' ? query.asset : undefined,
      query: query.query?.trim(),
      limit: query.limit,
      page: query.page,
    }),
  });

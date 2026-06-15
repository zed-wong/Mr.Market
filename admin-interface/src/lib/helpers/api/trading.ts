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
  userOrderId?: string;
  strategyKey?: string;
  limit?: number;
  page?: number;
}

export type AdminUserOrderType = 'market_making' | 'simply_grow';

export interface AdminUserOrdersQuery {
  type?: AdminUserOrderType | 'all';
  state?: string;
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
    userOrderId: string | null;
    strategyKey: string | null;
  };
  limits: {
    defaultLimit: number;
    maxLimit: number;
    maxPage: number;
    maxQueryLength: number;
    executionScanLimit: number;
  };
}

export interface AdminUserOrder {
  orderId: string;
  userId: string;
  type: AdminUserOrderType;
  state: string;
  createdAt: string | null;
  rewardAddress: string | null;
  pair: string | null;
  exchangeName: string | null;
  source: string | null;
  strategyKey: string | null;
  apiKeyId: string | null;
  amount: string | null;
  baseBalance: string | null;
  quoteBalance: string | null;
  mixinAssetId: string | null;
}

export interface AdminUserOrdersResponse {
  generatedAt: string;
  items: AdminUserOrder[];
  pagination: AdminPagination;
  filters: {
    type: string | null;
    state: string | null;
    query: string | null;
  };
  limits: {
    defaultLimit: number;
    maxLimit: number;
    maxPage: number;
    maxQueryLength: number;
    maxScanRows: number;
  };
}

export const LEDGER_ENTRY_TYPES = [
  'deposit_credit',
  'reserve_lock',
  'reserve_release',
  'fill_settle',
  'fee_debit',
  'withdraw_debit',
  'allocation_release',
  'reward_credit',
  'reversal',
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export interface LedgerAssetTotal {
  asset: string;
  available: string;
  locked: string;
  total: string;
}

export interface LedgerSummaryResponse {
  generatedAt: string;
  entries: {
    total: number;
    lastEntryAt: string | null;
    byType: Array<{ type: LedgerEntryType; count: number }>;
  };
  balances: {
    total: number;
    scannedRows: number;
    truncated: boolean;
    invariantViolations: number;
    negativeBalances: number;
    healthy: boolean;
    byAsset: LedgerAssetTotal[];
  };
  limits: {
    metadataScanLimit: number;
  };
}

export interface LedgerEntriesQuery {
  type?: LedgerEntryType | 'all';
  asset?: string;
  query?: string;
  limit?: number;
  page?: number;
}

export interface LedgerEntry {
  entryId: string;
  type: LedgerEntryType;
  orderId: string;
  userOrderId: string;
  accountLabel: string | null;
  asset: string;
  assetId: string;
  amount: string;
  refType: string | null;
  refId: string | null;
  reversalOf: string | null;
  createdAt: string | null;
}

export interface LedgerEntriesResponse {
  generatedAt: string;
  items: LedgerEntry[];
  pagination: AdminPagination;
  filters: {
    type: string | null;
    asset: string | null;
    query: string | null;
  };
  types: LedgerEntryType[];
  limits: {
    defaultLimit: number;
    maxLimit: number;
    maxPage: number;
    maxQueryLength: number;
  };
}

export interface LedgerBalancesQuery {
  exchange?: string;
  asset?: string;
  query?: string;
  limit?: number;
  page?: number;
}

export interface LedgerBalance {
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
  initialDeposit: string;
  realizedDelta: string;
  feePaid: string;
  balanced: boolean;
  dataSources: string[];
  updatedAt: string | null;
}

export interface LedgerBalancesResponse {
  generatedAt: string;
  items: LedgerBalance[];
  summary: {
    scannedRows: number;
    totalRows: number;
    truncated: boolean;
    byAsset: LedgerAssetTotal[];
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
      userOrderId: query.userOrderId?.trim(),
      strategyKey: query.strategyKey?.trim(),
      limit: query.limit,
      page: query.page,
    }),
  });

export const fetchAdminUserOrders = (query: AdminUserOrdersQuery = {}) =>
  apiFetch<AdminUserOrdersResponse>('/admin/user-orders', {
    query: cleanQuery({
      type: query.type && query.type !== 'all' ? query.type : undefined,
      state: query.state?.trim(),
      query: query.query?.trim(),
      limit: query.limit,
      page: query.page,
    }),
  });

export const fetchLedgerSummary = () =>
  apiFetch<LedgerSummaryResponse>('/admin/ledger/summary');

export const fetchLedgerEntries = (query: LedgerEntriesQuery = {}) =>
  apiFetch<LedgerEntriesResponse>('/admin/ledger/entries', {
    query: cleanQuery({
      type: query.type && query.type !== 'all' ? query.type : undefined,
      asset: query.asset && query.asset !== 'all' ? query.asset : undefined,
      query: query.query?.trim(),
      limit: query.limit,
      page: query.page,
    }),
  });

export const fetchLedgerBalances = (query: LedgerBalancesQuery = {}) =>
  apiFetch<LedgerBalancesResponse>('/admin/ledger/balances', {
    query: cleanQuery({
      exchange: query.exchange && query.exchange !== 'all' ? query.exchange : undefined,
      asset: query.asset && query.asset !== 'all' ? query.asset : undefined,
      query: query.query?.trim(),
      limit: query.limit,
      page: query.page,
    }),
  });

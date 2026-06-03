export type AnalyticsRange = '24h' | '7d' | '30d';
export type AnalyticsScope = 'admin' | 'pair' | 'order';
export type MetricStatus = 'available' | 'unavailable';

export interface AnalyticsScopeMetadata {
  type: AnalyticsScope;
  orderId: string | null;
  exchange: string | null;
  pair: string | null;
}

export interface AnalyticsRangeMetadata {
  key: AnalyticsRange | 'custom';
  startedAt: string;
  endedAt: string;
}

export interface AnalyticsFilters {
  orderId: string | null;
  exchange: string | null;
  pair: string | null;
}

export interface DecimalMetric {
  status: MetricStatus;
  value: string | null;
  currency: string | null;
  unavailableReason: string | null;
}

export interface RatioMetric extends DecimalMetric {
  filledQuotes?: number;
  totalQuotes?: number;
  activeMs?: number;
  windowMs?: number;
}

export interface InventorySkewMetric {
  status: MetricStatus;
  unavailableReason: string | null;
  quantity?: DecimalMetric;
  quantityByAsset?: Array<{ asset: string; quantity: string }>;
  costBasis: DecimalMetric;
  notional: DecimalMetric;
}

export interface PnlSeriesPoint {
  t: string;
  realized: string;
  fees: string;
  net: string;
}

export interface DrawdownAnalytics {
  status: MetricStatus;
  maxDrawdownQuote: string;
  currency: string | null;
  peakAt: string | null;
  troughAt: string | null;
  series: PnlSeriesPoint[];
  unavailableReason: string | null;
}

export interface AnalyticsTimelineEvent {
  id: string;
  type: 'quote' | 'fill' | 'cancel' | 'decision';
  at: string | null;
  source: string;
  sourceId: string;
  status: string | null;
  side: string | null;
  price: string | null;
  qty: string | null;
  sourceRef: {
    type: string;
    id: string;
  };
}

export interface PerOrderAnalytics {
  orderId: string;
  exchange: string | null;
  pair: string | null;
  baseAsset: string | null;
  quoteAsset: string | null;
  markPrice?: DecimalMetric & {
    source: string;
    stale: boolean;
    updatedAt: string | null;
    bestBid: string | null;
    bestAsk: string | null;
    sequence: number | null;
  };
  pnl: {
    realized: DecimalMetric;
    unrealized: DecimalMetric;
    net: DecimalMetric;
    realizedNet: DecimalMetric;
  };
  fees: {
    total: DecimalMetric;
    other?: Array<Record<string, unknown>>;
  };
  inventoryExposure: {
    quantity: DecimalMetric;
    costBasis: DecimalMetric;
    averageCost: DecimalMetric;
    notional: DecimalMetric;
    balances: Array<Record<string, unknown>>;
  };
  spreadCapture: {
    quote: DecimalMetric;
    effectiveSpreadBps: string | null;
    tradedQuoteVolume: DecimalMetric;
    fillCount: number;
  };
  drawdown: DrawdownAnalytics;
  timeline: {
    events: AnalyticsTimelineEvent[];
  };
  dataSources: string[];
}

export interface AggregateAnalytics {
  scope: {
    type: AnalyticsScope;
    exchange: string | null;
    pair: string | null;
  };
  eligibleOrderIds: string[];
  orderCount: number;
  pnl: {
    realized: DecimalMetric;
    unrealized: DecimalMetric;
    net: DecimalMetric;
    realizedNet: DecimalMetric;
  };
  fees: {
    total: DecimalMetric;
  };
  inventoryExposure: {
    quantityByAsset: Array<{ asset: string; quantity: string }>;
    costBasis: DecimalMetric;
    notional: DecimalMetric;
  };
  spreadCapture: {
    quote: DecimalMetric;
    tradedQuoteVolume: DecimalMetric;
    fillCount: number;
    effectiveSpreadBps: string | null;
  };
  fillRate: RatioMetric;
  quoteUptime: RatioMetric;
  pnlSeries: PnlSeriesPoint[];
  drawdown: DrawdownAnalytics;
  directMarketMakingTotals: {
    realizedPnl: DecimalMetric;
    unrealizedPnl: DecimalMetric;
    netPnl: DecimalMetric;
    feeCost: DecimalMetric;
    spreadCapture: DecimalMetric;
    inventorySkew: InventorySkewMetric;
    inventoryExposure: DecimalMetric;
    fillRate: RatioMetric;
    quoteUptime: RatioMetric;
  };
  dataSources: string[];
}

export interface AdminAnalyticsFoundationResponse {
  generatedAt: string;
  scope: AnalyticsScopeMetadata;
  range: AnalyticsRangeMetadata;
  filters: AnalyticsFilters;
  summary: {
    counts: {
      ledgerEntries: number;
      orderBalances: number;
      trackedOrders: number;
      strategyOrderIntents: number;
      strategyExecutions: number;
      orderBookMids: number;
    };
    [key: string]: unknown;
  };
  sources: {
    orderBookMids?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  analytics: {
    perOrder: PerOrderAnalytics | null;
    aggregate: AggregateAnalytics | null;
  };
  dataSources: string[];
  numericSerialization: {
    format: string;
    calculator: string;
    zeroFallbackForUnavailableMetrics: boolean;
  };
  limits: {
    defaultLimit: number;
    maxLimit: number;
    appliedLimit: number;
    orderBookStaleMs: number;
  };
}

export interface DirectMarketMakingDashboardResponse {
  generatedAt: string;
  scope: AnalyticsScopeMetadata;
  range: AnalyticsRangeMetadata;
  filters: AnalyticsFilters;
  dashboard: {
    scope: AnalyticsScopeMetadata;
    orderIds: string[];
    costRevenue: {
      spreadCapture: DecimalMetric;
      feeCost: DecimalMetric;
      inventorySkew: InventorySkewMetric;
      realizedPnl: DecimalMetric;
      unrealizedPnl: DecimalMetric;
      netPnl: DecimalMetric;
      fillRate: RatioMetric;
      quoteUptime: RatioMetric;
    };
    sources: string[];
  };
}

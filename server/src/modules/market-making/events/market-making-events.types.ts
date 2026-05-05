export const MARKET_MAKING_EVENT_NAMES = {
  balanceStale: 'balance.stale',
  fillManualReview: 'fill.manual-review',
  reconciliationAudit: 'reconciliation.audit',
  streamHealthChanged: 'stream.health-changed',
} as const;

export type MarketMakingEventName =
  (typeof MARKET_MAKING_EVENT_NAMES)[keyof typeof MARKET_MAKING_EVENT_NAMES];

export type MarketMakingBalanceStaleEvent = {
  exchange: string;
  accountLabel: string;
  staleAt: string;
};

export type MarketMakingStreamHealth = 'healthy' | 'degraded' | 'silent';

export type MarketMakingStreamHealthChangedEvent = {
  exchange: string;
  accountLabel: string;
  previousHealth?: MarketMakingStreamHealth;
  health: MarketMakingStreamHealth;
  changedAt: string;
};

export type MarketMakingFillManualReviewEvent = {
  exchange: string;
  accountLabel: string;
  pair?: string;
  orderId?: string;
  exchangeOrderId?: string;
  clientOrderId?: string;
  fillId?: string;
  reason:
    | 'unresolved_order'
    | 'missing_executor'
    | 'account_boundary_violation';
  reviewStatus: 'manual_review';
  observedAt: string;
};

export type MarketMakingReconciliationAuditEvent = {
  correctionType: 'estimated_fee_reversal' | 'manual_review';
  orderId?: string;
  userId?: string;
  assetId?: string;
  amount?: string;
  refType: string;
  refId: string;
  reversalOf?: string;
  reason?: string;
  observedAt: string;
};

export type MarketMakingEventPayloadMap = {
  [MARKET_MAKING_EVENT_NAMES.balanceStale]: MarketMakingBalanceStaleEvent;
  [MARKET_MAKING_EVENT_NAMES.fillManualReview]: MarketMakingFillManualReviewEvent;
  [MARKET_MAKING_EVENT_NAMES.reconciliationAudit]: MarketMakingReconciliationAuditEvent;
  [MARKET_MAKING_EVENT_NAMES.streamHealthChanged]: MarketMakingStreamHealthChangedEvent;
};

export const MARKET_MAKING_EVENT_NAMES = {
  orderStateChanged: 'order.state-changed',
  orderFillRecovered: 'order.fill-recovered',
  balanceUpdated: 'balance.updated',
  balanceStale: 'balance.stale',
  streamHealthChanged: 'stream.health-changed',
} as const;

export type MarketMakingEventName =
  (typeof MARKET_MAKING_EVENT_NAMES)[keyof typeof MARKET_MAKING_EVENT_NAMES];

export type MarketMakingOrderFillDelta = {
  qty: string;
  cumulativeQty: string;
};

export type MarketMakingOrderStateChangedEvent = {
  exchange: string;
  accountLabel: string;
  strategyKey: string;
  orderId: string;
  exchangeOrderId: string;
  previousState?: string;
  newState: string;
  fillDelta?: MarketMakingOrderFillDelta;
  source: 'ws' | 'rest' | 'bootstrap' | 'system';
  updatedAt: string;
};

export type MarketMakingOrderFillRecoveredEvent = {
  exchange: string;
  accountLabel: string;
  strategyKey: string;
  orderId: string;
  exchangeOrderId: string;
  fillDelta: MarketMakingOrderFillDelta;
  source: 'rest';
  recoveredAt: string;
};

export type MarketMakingBalanceEntry = {
  asset: string;
  free?: string;
  used?: string;
  total?: string;
  source: 'ws' | 'rest';
  freshnessTimestamp: string;
};

export type MarketMakingBalanceUpdatedEvent = {
  exchange: string;
  accountLabel: string;
  source: 'ws' | 'rest';
  balances: MarketMakingBalanceEntry[];
  updatedAt: string;
};

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

export type MarketMakingEventPayloadMap = {
  [MARKET_MAKING_EVENT_NAMES.orderStateChanged]: MarketMakingOrderStateChangedEvent;
  [MARKET_MAKING_EVENT_NAMES.orderFillRecovered]: MarketMakingOrderFillRecoveredEvent;
  [MARKET_MAKING_EVENT_NAMES.balanceUpdated]: MarketMakingBalanceUpdatedEvent;
  [MARKET_MAKING_EVENT_NAMES.balanceStale]: MarketMakingBalanceStaleEvent;
  [MARKET_MAKING_EVENT_NAMES.streamHealthChanged]: MarketMakingStreamHealthChangedEvent;
};

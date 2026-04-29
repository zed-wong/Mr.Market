export const MARKET_MAKING_EVENT_NAMES = {
  balanceStale: 'balance.stale',
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

export type MarketMakingEventPayloadMap = {
  [MARKET_MAKING_EVENT_NAMES.balanceStale]: MarketMakingBalanceStaleEvent;
  [MARKET_MAKING_EVENT_NAMES.streamHealthChanged]: MarketMakingStreamHealthChangedEvent;
};

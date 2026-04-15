export interface StrategyKey {
  type:
    | 'arbitrage'
    | 'pureMarketMaking'
    | 'dualAccountVolume'
    | 'volume'
    | 'timeIndicator'
    | 'alpaca-arbitrage'
    | 'alpaca-futures-arbitrage'
    | 'alpaca-options-arbitrage';
  user_id: string;
  client_id: string;
}

export const createStrategyKey = (key: StrategyKey) => {
  return `${key.user_id}-${key.client_id}-${key.type}`;
};

export const createPureMarketMakingStrategyKey = (
  marketMakingOrderId: string,
) => {
  return `${marketMakingOrderId}-pureMarketMaking`;
};

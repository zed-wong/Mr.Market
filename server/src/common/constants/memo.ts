// Numeric keys used inside the binary memo payload.
// Keep these as the single source of truth; other modules should reference these
// instead of hard-coding numeric literals.

export enum MemoVersion {
  Current = 1,
}

export enum TradingTypeKey {
  Spot = 0,
  MarketMaking = 1,
  SimplyGrow = 2,
}

export enum SpotOrderTypeKey {
  LimitBuy = 0,
  LimitSell = 1,
  MarketBuy = 2,
  MarketSell = 3,
}

export enum SpotExchangeKey {
  Binance = 1,
  Bitfinex = 2,
  Mexc = 3,
  Okx = 4,
  Gate = 5,
  Lbank = 6,
  Bitget = 11,
  Bigone = 12,
  Fswap = 13,
}

export enum MarketMakingMemoActionKey {
  Create = 1,
  Deposit = 2,
}

export enum SimplyGrowMemoActionKey {
  Create = 1,
  Deposit = 2,
}

export const TARDING_TYPE_MAP: Record<string, string> = {
  [TradingTypeKey.Spot]: 'Spot',
  [TradingTypeKey.MarketMaking]: 'Market Making',
  [TradingTypeKey.SimplyGrow]: 'Simply Grow',
};

export const SPOT_ORDER_TYPE_MAP: Record<string, string> = {
  [SpotOrderTypeKey.LimitBuy]: 'Limit Buy',
  [SpotOrderTypeKey.LimitSell]: 'Limit Sell',
  [SpotOrderTypeKey.MarketBuy]: 'Market Buy',
  [SpotOrderTypeKey.MarketSell]: 'Market Sell',
};

export const SPOT_EXCHANGE_MAP: Record<string, string> = {
  [SpotExchangeKey.Binance]: 'binance',
  [SpotExchangeKey.Bitfinex]: 'bitfinex',
  [SpotExchangeKey.Mexc]: 'mexc',
  [SpotExchangeKey.Okx]: 'okx',
  [SpotExchangeKey.Gate]: 'gate',
  [SpotExchangeKey.Lbank]: 'lbank',
  [SpotExchangeKey.Bitget]: 'bitget',
  [SpotExchangeKey.Bigone]: 'bigone',
  [SpotExchangeKey.Fswap]: 'fswap',
};

export const MARKET_MAKING_MEMO_ACTION_MAP: Record<string, string> = {
  [MarketMakingMemoActionKey.Create]: 'create',
  [MarketMakingMemoActionKey.Deposit]: 'deposit',
};

export const SIMPLY_GROW_MEMO_ACTION_MAP: Record<string, string> = {
  [SimplyGrowMemoActionKey.Create]: 'create',
  [SimplyGrowMemoActionKey.Deposit]: 'deposit',
};

export type DirectOrderControllerType = string;

export type StrategyDirectExecutionMode = 'single_account' | 'dual_account';

export type EfficientDualAccountVolumeMode =
  | 'cheapest_capital'
  | 'balanced'
  | 'fastest_volume';

export type DirectOrderRuntimeState =
  | 'created'
  | 'running'
  | 'stopped'
  | 'failed'
  | 'active'
  | 'gone'
  | 'stale';

export interface DirectOrderSummary {
  orderId: string;
  exchangeName: string;
  pair: string;
  state: string;
  runtimeState: DirectOrderRuntimeState;
  strategyDefinitionId?: string;
  strategyName: string;
  controllerType: DirectOrderControllerType;
  directExecutionMode?: StrategyDirectExecutionMode | null;
  createdAt: string;
  lastTickAt: string | null;
  accountLabel: string;
  makerAccountLabel: string;
  takerAccountLabel: string;
  makerAccountName?: string;
  takerAccountName?: string;
  apiKeyId: string | null;
  makerApiKeyId: string | null;
  takerApiKeyId: string | null;
  warnings: string[];
}

export interface DirectOrderStatus {
  orderId: string;
  state: string;
  runtimeState: DirectOrderRuntimeState;
  controllerType: DirectOrderControllerType;
  directExecutionMode?: StrategyDirectExecutionMode | null;
  accountLabel: string;
  makerAccountLabel: string;
  takerAccountLabel: string;
  makerAccountName?: string;
  takerAccountName?: string;
  apiKeyId: string | null;
  makerApiKeyId: string | null;
  takerApiKeyId: string | null;
  executorHealth: 'active' | 'gone' | 'stale';
  lastTickAt: string | null;
  lastUpdatedAt: string | null;
  privateStreamEventAt: string | null;
  openOrders?: Array<{
    orderId: string;
    strategyKey: string;
    exchange: string;
    pair: string;
    accountLabel?: string;
    accountSide?: string;
    source?: string;
    exchangeOrderId: string;
    clientOrderId?: string;
    side: 'buy' | 'sell';
    price: string;
    qty: string;
    cumulativeFilledQty?: string;
    status: string;
    updatedAt: string;
  }>;
  intents?: Array<{
    intentId?: string;
    type?: string;
    accountLabel?: string;
    accountSide?: string;
    side?: string;
    price?: string;
    qty?: string;
    status?: string;
    updatedAt?: string;
  }>;
  fillCount1h?: number;
  recentErrors?: Array<{
    ts: string;
    message: string;
    accountLabel?: string;
    accountSide?: string;
    source?: string;
  }>;
  orderConfig: {
    mode?: EfficientDualAccountVolumeMode | string | null;
    orderAmount: string | null;
    bidSpread: string | null;
    askSpread: string | null;
    numberOfLayers: string | null;
    baseIntervalTime: number | null;
    numTrades: number | null;
    baseIncrementPercentage: string | null;
    pricePushRate: string | null;
    postOnlySide: string | null;
    dynamicRoleSwitching: boolean | null;
    targetQuoteVolume: string | null;
    cadenceVariance: string | null;
    tradeAmountVariance: string | null;
    priceOffsetVariance: string | null;
    publishedCycles: number | null;
    completedCycles: number | null;
    tradedQuoteVolume: string | null;
    realizedPnlQuote: string | null;
  };
  readiness?: DirectReadinessResult | null;
  cycles?: unknown[];
  spread: {
    bid: string;
    ask: string;
    absolute: string;
  } | null;
  inventoryBalances: Array<{
    asset: string;
    free: string;
    used: string;
    total: string;
    accountLabel?: string;
    source?: string;
  }>;
  balanceCacheStatus?: Array<{
    asset: string;
    accountLabel: string;
    source: string;
    freshnessTimestamp: string | null;
    stale: boolean;
  }>;
  userStreamCapabilities?: Array<{
    accountLabel: string;
    watchOrders?: boolean;
    watchTrades?: boolean;
    watchBalance?: boolean;
  }>;
  userStreamRuntime?: {
    activeWatcherCount: number;
    queueDepth: number;
    duplicateFillSuppressionCount: number;
  };
  streamHealth?: Array<{
    accountLabel: string;
    state?: string;
    order?: boolean;
    trade?: boolean;
    balance?: boolean;
    lastEventAt?: string | null;
    lastBalanceRefreshAt?: string | null;
  }>;
  stale: boolean;
}

export interface DirectReadinessBlockingReason {
  code:
    | 'market_data_stale'
    | 'market_data_missing'
    | 'trading_rules_missing'
    | 'trading_rules_incomplete'
    | 'fee_data_missing'
    | 'balance_snapshot_unavailable'
    | 'below_exchange_minimums'
    | string;
  message: string;
  accountLabel?: string;
  asset?: string;
}

export interface DirectReadinessMissingBalance {
  accountLabel: string;
  asset: string;
  availableAmount: string;
  minimumUsefulAmount: string;
  missingAmount: string;
}

export interface DirectReadinessCapitalRequirement {
  accountLabel: string;
  asset: string;
  amount: string;
}

export interface DirectReadinessResult {
  canStart: boolean;
  mode: EfficientDualAccountVolumeMode;
  bestFirstAction: {
    makerAccountLabel: string;
    takerAccountLabel: string;
    side: 'buy' | 'sell';
    baseAsset: string;
    quoteAsset: string;
    quantity: string;
    price: string;
    notional: string;
  } | null;
  maximumCycleQty: string;
  recommendedCycleQty: string;
  minimumCapitalByAccountAsset: DirectReadinessCapitalRequirement[];
  recommendedCapitalByAccountAsset: DirectReadinessCapitalRequirement[];
  missingBalances: DirectReadinessMissingBalance[];
  estimatedCycles: {
    count: string;
    basis: 'current_available_balances' | string;
  };
  estimatedVolume: {
    baseAsset: string;
    quoteAsset: string;
    baseAmount: string;
    quoteAmount: string;
  };
  blockingReasons: DirectReadinessBlockingReason[];
}

export interface AdminCampaign {
  joined: boolean;
  apiKeyId?: string | null;
  apiKeyName?: string | null;
  [key: string]: unknown;
}

export interface CampaignProgress {
  score: number;
  result: number;
  estimated_reward: number;
  [key: string]: unknown;
}

export interface LeaderboardEntry {
  address: string;
  score: number;
  result: number;
  estimated_reward: number;
  [key: string]: unknown;
}

export interface CampaignLeaderboard {
  data: LeaderboardEntry[];
  total: number;
  updated_at: string;
  [key: string]: unknown;
}

export type DirectStartPayload =
  | {
      exchangeName: string;
      pair: string;
      strategyDefinitionId: string;
      apiKeyId: string;
      configOverrides?: Record<string, unknown>;
    }
  | {
      exchangeName: string;
      pair: string;
      strategyDefinitionId: string;
      makerApiKeyId: string;
      takerApiKeyId: string;
      configOverrides?: Record<string, unknown>;
    };

export type DirectReadinessPayload = DirectStartPayload;

export interface CampaignJoinPayload {
  evmAddress: string;
  apiKeyId: string;
  chainId: number;
  campaignAddress: string;
}

export interface DirectWalletStatus {
  configured: boolean;
  address: string | null;
}

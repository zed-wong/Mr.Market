export interface Web3MarketMakingOrderBalance {
  orderId: string;
  assetId: string;
  available: string;
  locked: string;
  total: string;
  initialDeposit: string;
  realizedDelta: string;
  feePaid: string;
  updatedAt: string;
}

export interface Web3MarketMakingOrderStrategy {
  id: string | null;
  key: string | null;
  name: string | null;
  description: string | null;
  controller: string | null;
  capabilities: unknown;
  defaultConfig: unknown;
  configSchema: unknown;
  resolvedConfig: Record<string, unknown>;
  resolvedAt: string | null;
}

export interface Web3MarketMakingOrderSpecs {
  pair: string | null;
  exchangeName: string | null;
  bidSpread: string | null;
  askSpread: string | null;
  orderAmount: string | null;
  orderRefreshTime: string | null;
  numberOfLayers: number | string | null;
  priceSourceType: string | null;
  amountChangePerLayer: string | null;
  amountChangeType: string | null;
  ceilingPrice: string | null;
  floorPrice: string | null;
}

export interface Web3MarketMakingOrderPerformance {
  realizedDeltaByAsset: Record<string, string>;
  feePaidByAsset: Record<string, string>;
  pnlByAsset: Record<string, string>;
}

export interface Web3MarketMakingOrderActions {
  deposit: boolean;
  withdraw: boolean;
  start: boolean;
  pause: boolean;
  resume: boolean;
}

export interface Web3MarketMakingOrderSummary {
  orderId: string;
  state: string;
  pair: string | null;
  exchangeName: string | null;
  source: 'web3_market_making_order';
  strategy: Web3MarketMakingOrderStrategy;
  specs: Web3MarketMakingOrderSpecs;
  balances: Web3MarketMakingOrderBalance[];
  performance: Web3MarketMakingOrderPerformance;
  validActions: Web3MarketMakingOrderActions;
  lifecycleError: string | null;
  createdAt: string;
}

export interface Web3MarketMakingOrderListResponse {
  namespace: '/api/v1/web3/market-making';
  total: number;
  orders: Web3MarketMakingOrderSummary[];
}

export interface Web3MarketMakingStrategyOption {
  id: string;
  key: string;
  name: string;
  description: string | null;
  controllerType?: string | null;
  controller?: string | null;
  capabilities: unknown;
  defaultConfig: unknown;
  configSchema: unknown;
}

export interface Web3MarketMakingStrategiesResponse {
  namespace: '/api/v1/web3/market-making';
  strategies: Web3MarketMakingStrategyOption[];
}

export interface Web3MarketMakingAssetOption {
  assetId: string | null;
  symbol: string | null;
  iconUrl?: string | null;
  chainId?: string | number | null;
}

export interface Web3MarketMakingPairOption {
  pairId: string;
  pair: string;
  exchangeName: string | null;
  base: Web3MarketMakingAssetOption;
  quote: Web3MarketMakingAssetOption;
  supportedDepositAssets: string[];
  minimums: {
    orderAmount: string | null;
    maximumOrderAmount: string | null;
  };
  precision: {
    amount: number | string | null;
    price: number | string | null;
  };
  prices: {
    base: string | null;
    quote: string | null;
  };
  strategyCompatibility: string[];
  unavailable: boolean;
}

export interface Web3MarketMakingOptionsResponse {
  namespace: '/api/v1/web3/market-making';
  options: Web3MarketMakingPairOption[];
}

export interface Web3MarketMakingCreateRequest {
  marketMakingPairId: string;
  strategyDefinitionId: string;
  initialDeposit: {
    assetId: string;
    amount: string;
  };
}

export interface Web3MarketMakingCreateResponse {
  namespace: '/api/v1/web3/market-making';
  orderId: string;
  memo?: string | null;
  expiresAt?: string | null;
  funding?: {
    mode: string;
    depositEndpoint: string;
    memo?: string | null;
    expiresAt?: string | null;
  };
  initialDeposit?: {
    mode: string;
    acceptedDuringCreate: boolean;
    requested: {
      assetId?: string;
      asset?: string;
      amount?: string;
    } | null;
    message: string;
  };
}

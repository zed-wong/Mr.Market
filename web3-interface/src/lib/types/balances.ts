export interface BalanceEntry {
  asset: string;
  assetId: string;
  chainNamespace: 'evm';
  chainId: number | null;
  tokenAddress: string | null;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  usdValue: string;
  pendingAmount?: string;
  orderId?: string;
  locked?: string;
  total?: string;
  updatedAt?: string;
}

export interface Web3SerializedBalance {
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

export interface Web3MarketMakingBalanceGroup {
  assetId: string;
  available: string;
  locked: string;
  total: string;
  orderCount: number;
  orders: Web3SerializedBalance[];
}

export interface Web3FundingActivity {
  activityId: string;
  direction: 'deposit' | 'withdrawal';
  ledgerType: string;
  scope: 'wallet' | 'market_making_order';
  orderId: string;
  assetId: string;
  amount: string;
  signedAmount: string;
  refType: string | null;
  refId: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface Web3BalancesResponse {
  namespace: '/web3/balances';
  walletOrderId: string;
  available: Web3SerializedBalance[];
  inMarketMaking: Web3MarketMakingBalanceGroup[];
  lockedInOrders: Web3MarketMakingBalanceGroup[];
  activity: Web3FundingActivity[];
  summary: {
    availableAssetCount: number;
    inMarketMakingAssetCount: number;
    activityCount: number;
  };
}

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
  createdAt: string;
  lastTickAt: string | null;
  accountLabel: string;
  apiKeyId: string | null;
  warnings: string[];
}

export interface DirectOrderStatus {
  orderId: string;
  state: string;
  runtimeState: DirectOrderRuntimeState;
  executorHealth: 'active' | 'gone' | 'stale';
  lastTickAt: string | null;
  lastUpdatedAt: string | null;
  privateStreamEventAt: string | null;
  openOrders: Array<{
    orderId: string;
    strategyKey: string;
    exchange: string;
    pair: string;
    exchangeOrderId: string;
    clientOrderId?: string;
    side: 'buy' | 'sell';
    price: string;
    qty: string;
    cumulativeFilledQty?: string;
    status: string;
    updatedAt: string;
  }>;
  intents: Array<{
    intentId?: string;
    type?: string;
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
  }>;
  orderConfig: {
    orderAmount: string | null;
    bidSpread: string | null;
    askSpread: string | null;
    numberOfLayers: string | null;
  };
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
  }>;
  stale: boolean;
}

export interface AdminCampaign {
  joined: boolean;
  [key: string]: unknown;
}

export interface DirectStartPayload {
  exchangeName: string;
  pair: string;
  strategyDefinitionId: string;
  apiKeyId: string;
  accountLabel: string;
  configOverrides?: Record<string, unknown>;
}

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

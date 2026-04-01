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

export interface CampaignJoinRecord {
  id: string;
  evmAddress: string;
  apiKeyId: string;
  chainId: number;
  campaignAddress: string;
  orderId?: string | null;
  status: 'pending' | 'linked' | 'detached' | 'joined' | 'failed';
  createdAt: string;
  updatedAt: string;
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

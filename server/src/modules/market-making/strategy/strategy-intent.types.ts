export type StrategyIntentType =
  | 'CREATE_LIMIT_ORDER'
  | 'CANCEL_ORDER'
  | 'REPLACE_ORDER'
  | 'STOP_EXECUTOR';

export type StrategyIntentStatus = 'NEW' | 'SENT' | 'ACKED' | 'FAILED' | 'DONE';

export type StrategyOrderIntent = {
  type: StrategyIntentType;
  intentId: string;
  strategyInstanceId: string;
  strategyKey: string;
  userId: string;
  clientId: string;
  exchange: string;
  pair: string;
  side: 'buy' | 'sell';
  price: string;
  qty: string;
  mixinOrderId?: string;
  createdAt: string;
  status: StrategyIntentStatus;
};

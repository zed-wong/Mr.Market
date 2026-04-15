import type { StrategyExecutionCategory } from './strategy-execution-category';

export type StrategyIntentType =
  | 'CREATE_LIMIT_ORDER'
  | 'CANCEL_ORDER'
  | 'REPLACE_ORDER'
  | 'EXECUTE_AMM_SWAP'
  | 'STOP_CONTROLLER'
  | 'STOP_EXECUTOR';

export type StrategyIntentStatus =
  | 'NEW'
  | 'SENT'
  | 'ACKED'
  | 'FAILED'
  | 'DONE'
  | 'CANCELLED';

export type StrategyOrderIntent = {
  type: StrategyIntentType;
  intentId: string;
  strategyInstanceId: string;
  strategyKey: string;
  userId: string;
  clientId: string;
  exchange: string;
  accountLabel?: string;
  pair: string;
  side: 'buy' | 'sell';
  price: string;
  qty: string;
  mixinOrderId?: string;
  executionCategory?: StrategyExecutionCategory;
  postOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC';
  slotKey?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  status: StrategyIntentStatus;
};

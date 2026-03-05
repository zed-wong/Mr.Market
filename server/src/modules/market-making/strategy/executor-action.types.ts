import {
  StrategyIntentStatus,
  StrategyOrderIntent,
} from './strategy-intent.types';

export type ExecutorAction = Omit<StrategyOrderIntent, 'status'> & {
  status?: StrategyIntentStatus;
};

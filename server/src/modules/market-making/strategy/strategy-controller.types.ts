import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import type { ExecutorAction } from './executor-action.types';
import type { StrategyService } from './strategy.service';

export type StrategyType = 'arbitrage' | 'pureMarketMaking' | 'volume';

export type StrategyRuntimeSession = {
  runId: string;
  strategyKey: string;
  strategyType: StrategyType;
  userId: string;
  clientId: string;
  marketMakingOrderId?: string;
  cadenceMs: number;
  nextRunAtMs: number;
  params: Record<string, any>;
};

export interface StrategyController {
  readonly strategyType: StrategyType;
  getCadenceMs(
    parameters: Record<string, any>,
    service: StrategyService,
  ): number;
  rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void>;
  decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]>;
  onActionsPublished?(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
    service: StrategyService,
  ): Promise<void>;
}

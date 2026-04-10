import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import type { StrategyService } from '../strategy.service';
import type { ExecutorAction } from './executor-action.types';

export type StrategyType =
  | 'arbitrage'
  | 'pureMarketMaking'
  | 'dualAccountVolume'
  | 'volume'
  | 'timeIndicator';

export type StrategyRuntimeSession = {
  runId: string;
  strategyKey: string;
  strategyType: StrategyType;
  userId: string;
  clientId: string;
  marketMakingOrderId?: string;
  cadenceMs: number;
  nextRunAtMs: number;
  lastFillTimestamp?: number;
  realizedPnlQuote?: number;
  tradedQuoteVolume?: number;
  inventoryBaseQty?: number;
  inventoryCostQuote?: number;
  params: Record<string, unknown>;
};

export interface StrategyController {
  readonly strategyType: StrategyType;
  getCadenceMs(
    parameters: Record<string, unknown>,
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

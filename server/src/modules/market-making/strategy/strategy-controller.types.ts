import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

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
  runSession(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<void>;
  rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void>;
}

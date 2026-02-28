import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { PureMarketMakingStrategyDto } from '../strategy.dto';
import {
  StrategyExecutor,
  StrategyRuntimeSession,
} from '../strategy-executor.types';
import { StrategyService } from '../strategy.service';

@Injectable()
export class PureMarketMakingStrategyExecutor implements StrategyExecutor {
  readonly strategyType = 'pureMarketMaking' as const;

  getCadenceMs(parameters: Record<string, any>): number {
    return Math.max(1000, Number(parameters?.orderRefreshTime || 10000));
  }

  async runSession(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<void> {
    await service.runPureMarketMakingSession(
      session.strategyKey,
      session.params as PureMarketMakingStrategyDto,
      ts,
    );
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void> {
    await service.executePureMarketMakingStrategy(
      strategyInstance.parameters as PureMarketMakingStrategyDto,
    );
  }
}

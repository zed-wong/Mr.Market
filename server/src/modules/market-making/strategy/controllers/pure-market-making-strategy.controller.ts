import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyRuntimeSession,
} from '../config/strategy-controller.types';
import { StrategyService } from '../strategy.service';

@Injectable()
export class PureMarketMakingStrategyController implements StrategyController {
  readonly strategyType = 'pureMarketMaking' as const;

  getCadenceMs(parameters: Record<string, unknown>): number {
    const rawMs = Number(parameters?.orderRefreshTime || 5000);
    return Math.max(5000, rawMs);
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyService,
  ): Promise<void> {
    await service.executePureMarketMakingStrategy(
      config as unknown as PureMarketMakingStrategyDto,
    );
  }

  async decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]> {
    return await service.buildPureMarketMakingActions(
      session.strategyKey,
      session.params as unknown as PureMarketMakingStrategyDto,
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

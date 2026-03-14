import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import {
  StrategyController,
  StrategyRuntimeSession,
} from '../config/strategy-controller.types';
import { TimeIndicatorStrategyDto } from '../config/timeIndicator.dto';
import { StrategyService } from '../strategy.service';

@Injectable()
export class TimeIndicatorStrategyController implements StrategyController {
  readonly strategyType = 'timeIndicator' as const;

  getCadenceMs(parameters: Record<string, unknown>): number {
    return Math.max(1000, Number(parameters?.tickIntervalMs || 60000));
  }

  async decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]> {
    return await service.buildTimeIndicatorActions(session, ts);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void> {
    await service.executeTimeIndicatorStrategy(
      strategyInstance.parameters as TimeIndicatorStrategyDto,
    );
  }
}

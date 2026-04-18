import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { ExecuteDualAccountVolumeStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyRuntimeSession,
} from '../config/strategy-controller.types';
import { StrategyService } from '../strategy.service';
import { sanitizeVolumeCadenceMs } from './volume-controller.helpers';

@Injectable()
export class DualAccountVolumeStrategyController implements StrategyController {
  readonly strategyType = 'dualAccountVolume' as const;

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(parameters?.baseIntervalTime);
  }

  async start(config: Record<string, unknown>, service: StrategyService): Promise<void> {
    await service.executeDualAccountVolumeStrategy(config as unknown as ExecuteDualAccountVolumeStrategyDto);
  }

  async decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]> {
    return await service.buildDualAccountVolumeSessionActions(session, ts);
  }

  async onActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
    service: StrategyService,
  ): Promise<void> {
    await service.onDualAccountVolumeActionsPublished(session, actions);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void> {
    await service.executeDualAccountVolumeStrategy({
      ...(strategyInstance.parameters as ExecuteDualAccountVolumeStrategyDto),
      userId: strategyInstance.userId,
      clientId: strategyInstance.clientId,
    });
  }
}

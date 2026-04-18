import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { ExecuteDualAccountBestCapacityVolumeStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyRuntimeSession,
} from '../config/strategy-controller.types';
import { StrategyService } from '../strategy.service';
import { sanitizeVolumeCadenceMs } from './volume-controller.helpers';

@Injectable()
export class DualAccountBestCapacityVolumeStrategyController
  implements StrategyController
{
  readonly strategyType = 'dualAccountBestCapacityVolume' as const;

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(parameters?.baseIntervalTime);
  }

  async start(config: Record<string, unknown>, service: StrategyService): Promise<void> {
    await service.executeDualAccountBestCapacityVolumeStrategy(config as unknown as ExecuteDualAccountBestCapacityVolumeStrategyDto);
  }

  async decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]> {
    return await service.buildDualAccountBestCapacityVolumeSessionActions(
      session,
      ts,
    );
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
    await service.executeDualAccountBestCapacityVolumeStrategy({
      ...(strategyInstance.parameters as ExecuteDualAccountBestCapacityVolumeStrategyDto),
      userId: strategyInstance.userId,
      clientId: strategyInstance.clientId,
    });
  }
}

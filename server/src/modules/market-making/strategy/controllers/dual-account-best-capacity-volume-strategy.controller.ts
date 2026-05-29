import { Injectable, Optional } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { ExecuteDualAccountBestCapacityVolumeStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import { DualAccountVolumeStrategyController } from './dual-account-volume-strategy.controller';
import { sanitizeVolumeCadenceMs } from './volume-controller.helpers';

@Injectable()
export class DualAccountBestCapacityVolumeStrategyController
  implements StrategyController
{
  readonly strategyType = 'dualAccountBestCapacityVolume' as const;

  constructor(
    @Optional()
    private readonly dualAccountVolumeStrategyController?: DualAccountVolumeStrategyController,
  ) {}

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(parameters?.baseIntervalTime);
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executeDualAccountBestCapacityVolumeStrategy(
      config as unknown as ExecuteDualAccountBestCapacityVolumeStrategyDto,
    );
  }

  async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
    return await this.getDualAccountVolumeStrategyController().buildDualAccountBestCapacityVolumeSessionActions(
      ctx.session,
      ctx.ts,
      ctx.stopStrategyForUser,
    );
  }

  async onActionsPublished(
    ctx: StrategyTickContext,
    actions: ExecutorAction[],
  ): Promise<void> {
    await this.getDualAccountVolumeStrategyController().onDualAccountVolumeActionsPublished(
      ctx.session,
      actions,
    );
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executeDualAccountBestCapacityVolumeStrategy({
      ...(strategyInstance.parameters as ExecuteDualAccountBestCapacityVolumeStrategyDto),
      userId: strategyInstance.userId,
      clientId: strategyInstance.clientId,
    });
  }

  private getDualAccountVolumeStrategyController(): DualAccountVolumeStrategyController {
    if (!this.dualAccountVolumeStrategyController) {
      throw new Error('DualAccountVolumeStrategyController is not available');
    }

    return this.dualAccountVolumeStrategyController;
  }
}

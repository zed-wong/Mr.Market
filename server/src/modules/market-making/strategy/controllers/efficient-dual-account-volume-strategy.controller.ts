import { Injectable, Optional } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { ExecuteEfficientDualAccountVolumeStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import { DualAccountVolumeStrategyController } from './dual-account-volume-strategy.controller';
import { sanitizeVolumeCadenceMs } from './volume-controller.helpers';

@Injectable()
export class EfficientDualAccountVolumeStrategyController
  implements StrategyController
{
  readonly strategyType = 'efficientDualAccountVolume' as const;

  constructor(
    @Optional()
    private readonly dualAccountVolumeStrategyController?: DualAccountVolumeStrategyController,
  ) {}

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(
      parameters?.interval ?? parameters?.baseIntervalTime,
    );
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executeEfficientDualAccountVolumeStrategy(
      config as unknown as ExecuteEfficientDualAccountVolumeStrategyDto,
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
    await service.executeEfficientDualAccountVolumeStrategy({
      ...(strategyInstance.parameters as ExecuteEfficientDualAccountVolumeStrategyDto),
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

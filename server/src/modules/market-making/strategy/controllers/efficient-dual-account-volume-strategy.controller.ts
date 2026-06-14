import { Injectable, Optional } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { ExecuteEfficientDualAccountVolumeStrategyDto } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import { EfficientDualAccountRuntimeService } from '../dual-account/efficient-dual-account-runtime.service';
import { sanitizeVolumeCadenceMs } from './volume-controller.helpers';

@Injectable()
export class EfficientDualAccountVolumeStrategyController
  implements StrategyController
{
  readonly strategyType = 'efficientDualAccountVolume' as const;

  constructor(
    @Optional()
    private readonly efficientDualAccountRuntimeService?: EfficientDualAccountRuntimeService,
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
    return await this.getEfficientDualAccountRuntimeService().buildEfficientDualAccountVolumeSessionActions(
      ctx.session,
      ctx.ts,
    );
  }

  async onActionsPublished(
    ctx: StrategyTickContext,
    actions: ExecutorAction[],
  ): Promise<void> {
    await this.getEfficientDualAccountRuntimeService().onEfficientDualAccountActionsPublished(
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

  private getEfficientDualAccountRuntimeService(): EfficientDualAccountRuntimeService {
    if (!this.efficientDualAccountRuntimeService) {
      throw new Error('EfficientDualAccountRuntimeService is not available');
    }

    return this.efficientDualAccountRuntimeService;
  }
}

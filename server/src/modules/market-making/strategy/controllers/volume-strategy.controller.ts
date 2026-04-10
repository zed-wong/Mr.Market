import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import type {
  StrategyController,
  StrategyRuntimeSession,
} from '../config/strategy-controller.types';
import { StrategyService } from '../strategy.service';
import {
  normalizeVolumeRerunConfig,
  sanitizeVolumeCadenceMs,
} from './volume-controller.helpers';

@Injectable()
export class VolumeStrategyController implements StrategyController {
  readonly strategyType = 'volume' as const;

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(
      parameters?.baseIntervalTime ?? parameters?.intervalTime,
    );
  }

  async decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]> {
    return await service.buildVolumeSessionActions(session, ts);
  }

  async onActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
    service: StrategyService,
  ): Promise<void> {
    await service.onVolumeActionsPublished(session, actions);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void> {
    const config = normalizeVolumeRerunConfig(strategyInstance);

    await service.executeVolumeStrategy(
      config.exchangeName,
      config.symbol,
      config.baseIncrementPercentage,
      config.baseIntervalTime,
      config.baseTradeAmount,
      config.numTrades,
      config.userId,
      config.clientId,
      config.pricePushRate,
      config.postOnlySide,
      config.executionVenue as any,
      config.dexId as any,
      config.chainId,
      config.tokenIn,
      config.tokenOut,
      config.feeTier,
      config.slippageBps,
      config.recipient,
      config.executionCategory,
    );
  }
}

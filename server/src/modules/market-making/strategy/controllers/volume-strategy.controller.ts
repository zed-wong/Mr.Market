import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { StrategyService } from '../strategy.service';
import {
  StrategyController,
  StrategyRuntimeSession,
} from '../strategy-controller.types';

@Injectable()
export class VolumeStrategyController implements StrategyController {
  readonly strategyType = 'volume' as const;

  getCadenceMs(parameters: Record<string, any>): number {
    return Math.max(1000, Number(parameters?.baseIntervalTime || 10) * 1000);
  }

  async runSession(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<void> {
    await service.runVolumeSession(session, ts);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void> {
    await service.executeVolumeStrategy(
      strategyInstance.parameters.exchangeName,
      strategyInstance.parameters.symbol,
      strategyInstance.parameters.baseIncrementPercentage,
      strategyInstance.parameters.baseIntervalTime,
      strategyInstance.parameters.baseTradeAmount,
      strategyInstance.parameters.numTrades,
      strategyInstance.parameters.userId,
      strategyInstance.parameters.clientId,
      strategyInstance.parameters.pricePushRate,
      strategyInstance.parameters.postOnlySide,
    );
  }
}

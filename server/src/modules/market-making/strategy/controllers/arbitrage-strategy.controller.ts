import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ExecutorAction } from '../config/executor-action.types';
import { ArbitrageStrategyDto } from '../config/strategy.dto';
import { StrategyService } from '../strategy.service';
import {
  StrategyController,
  StrategyRuntimeSession,
} from '../config/strategy-controller.types';

@Injectable()
export class ArbitrageStrategyController implements StrategyController {
  readonly strategyType = 'arbitrage' as const;

  getCadenceMs(parameters: Record<string, any>): number {
    return Math.max(
      1000,
      Number(parameters?.checkIntervalSeconds || 10) * 1000,
    );
  }

  async decideActions(
    session: StrategyRuntimeSession,
    ts: string,
    service: StrategyService,
  ): Promise<ExecutorAction[]> {
    return await service.buildArbitrageActions(
      session.strategyKey,
      session.params as ArbitrageStrategyDto,
      ts,
    );
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyService,
  ): Promise<void> {
    await service.startArbitrageStrategyForUser(
      strategyInstance.parameters as ArbitrageStrategyDto,
      strategyInstance.parameters.checkIntervalSeconds,
      strategyInstance.parameters.maxOpenOrders,
    );
  }
}

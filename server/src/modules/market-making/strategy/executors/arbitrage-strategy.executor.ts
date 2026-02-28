import { Injectable } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { ArbitrageStrategyDto } from '../strategy.dto';
import {
  StrategyExecutor,
  StrategyRuntimeSession,
} from '../strategy-executor.types';
import { StrategyService } from '../strategy.service';

@Injectable()
export class ArbitrageStrategyExecutor implements StrategyExecutor {
  readonly strategyType = 'arbitrage' as const;

  getCadenceMs(parameters: Record<string, any>): number {
    return Math.max(1000, Number(parameters?.checkIntervalSeconds || 10) * 1000);
  }

  async runSession(
    session: StrategyRuntimeSession,
    _ts: string,
    service: StrategyService,
  ): Promise<void> {
    await service.runArbitrageSession(session.params as ArbitrageStrategyDto);
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

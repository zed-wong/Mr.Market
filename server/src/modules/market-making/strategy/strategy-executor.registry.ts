import { Injectable } from '@nestjs/common';

import { StrategyExecutor, StrategyType } from './strategy-executor.types';

@Injectable()
export class StrategyExecutorRegistry {
  private readonly executorsByType = new Map<StrategyType, StrategyExecutor>();

  constructor(executors: StrategyExecutor[]) {
    for (const executor of executors) {
      this.executorsByType.set(executor.strategyType, executor);
    }
  }

  getExecutor(strategyType: string): StrategyExecutor | undefined {
    return this.executorsByType.get(strategyType as StrategyType);
  }
}

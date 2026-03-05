import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExecutorAction } from './executor-action.types';
import { StrategyOrderIntent } from './strategy-intent.types';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';

@Injectable()
export class ExecutorOrchestratorService {
  private readonly logger = new CustomLogger(ExecutorOrchestratorService.name);

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly strategyIntentExecutionService?: StrategyIntentExecutionService,
  ) {}

  async dispatchActions(
    strategyKey: string,
    actions: ExecutorAction[],
  ): Promise<StrategyOrderIntent[]> {
    if (actions.length === 0) {
      return [];
    }

    const intents = actions.map((action) => this.toIntent(action));

    for (const intent of intents) {
      await this.strategyIntentStoreService?.upsertIntent(intent);
    }

    const intentExecutionDriver = String(
      this.configService.get('strategy.intent_execution_driver', 'worker') ||
        'worker',
    ).toLowerCase();

    if (intentExecutionDriver === 'sync') {
      await this.strategyIntentExecutionService?.consumeIntents(intents);
    }

    this.logger.log(
      `Published ${intents.length} intents for ${strategyKey} (driver=${intentExecutionDriver})`,
    );

    return intents;
  }

  private toIntent(action: ExecutorAction): StrategyOrderIntent {
    return {
      ...action,
      status: action.status || 'NEW',
    };
  }
}

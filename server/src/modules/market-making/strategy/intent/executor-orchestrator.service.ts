import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExecutorAction } from '../config/executor-action.types';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { StrategyIntentExecutionService } from '../execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';

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

    for (const intent of intents) {
      const cycleId = this.readMetadataString(intent, 'cycleId') || 'n/a';
      const role = this.readMetadataString(intent, 'role') || 'unknown';
      const tickId = this.readMetadataString(intent, 'tickId') || 'n/a';

      this.logger.log(
        [
          'Intent published',
          `type=${intent.type}`,
          `strategy=${strategyKey}`,
          `cycle=${cycleId}`,
          `tick=${tickId}`,
          `role=${role}`,
          `side=${intent.side}`,
          `qty=${intent.qty}`,
          `price=${intent.price}`,
          `exchange=${intent.exchange}`,
          `pair=${intent.pair}`,
          `account=${intent.accountLabel || 'default'}`,
          `driver=${intentExecutionDriver}`,
        ].join(' | '),
      );
    }

    this.logger.log(
      [
        'Intent batch published',
        `strategy=${strategyKey}`,
        `count=${intents.length}`,
        `driver=${intentExecutionDriver}`,
      ].join(' | '),
    );

    return intents;
  }

  private toIntent(action: ExecutorAction): StrategyOrderIntent {
    return {
      ...action,
      status: action.status || 'NEW',
    };
  }

  private readMetadataString(
    intent: StrategyOrderIntent,
    key: string,
  ): string | undefined {
    if (!intent.metadata || typeof intent.metadata !== 'object') {
      return undefined;
    }

    const value = (intent.metadata as Record<string, unknown>)[key];

    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}

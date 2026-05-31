import { Injectable, Optional } from '@nestjs/common';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExecutorAction } from '../config/executor-action.types';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';

@Injectable()
export class ExecutorOrchestratorService {
  private readonly logger = new CustomLogger(ExecutorOrchestratorService.name);

  constructor(
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
  ) {}

  async dispatchActions(
    strategyKey: string,
    actions: ExecutorAction[],
  ): Promise<StrategyOrderIntent[]> {
    if (actions.length === 0) {
      return [];
    }

    const intents = actions.map((action) => this.toIntent(action));

    await this.strategyIntentStoreService?.batchUpsertIntents(intents);

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
          'driver=worker',
        ].join(' | '),
      );
    }

    this.logger.log(
      [
        'Intent batch published',
        `strategy=${strategyKey}`,
        `count=${intents.length}`,
        'driver=worker',
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

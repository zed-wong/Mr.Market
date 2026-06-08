import { Injectable, Optional } from '@nestjs/common';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExecutorAction } from '../config/executor-action.types';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';

@Injectable()
export class ExecutorOrchestratorService {
  private readonly logger = new CustomLogger(ExecutorOrchestratorService.name);
  private readonly mmLog = this.logger.marketMaking();

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

      this.mmLog.debug('intent published', {
        strategy: strategyKey,
        exchange: intent.exchange,
        pair: intent.pair,
        account: intent.accountLabel || 'default',
        side: intent.side,
        driver: 'worker',
        type: intent.type,
        cycle: cycleId,
        tick: tickId,
        role,
        qty: intent.qty,
        price: intent.price,
      });
    }

    const firstIntent = intents[0];

    this.mmLog.info('intents published', {
      strategy: strategyKey,
      exchange: firstIntent?.exchange,
      pair: firstIntent?.pair,
      account: firstIntent?.accountLabel || 'default',
      creates: intents.filter((intent) => intent.type === 'CREATE_LIMIT_ORDER')
        .length,
      cancels: intents.filter((intent) => intent.type === 'CANCEL_ORDER').length,
      actions: intents.length,
      driver: 'worker',
    });

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

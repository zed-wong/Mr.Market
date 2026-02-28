import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { DurabilityService } from '../durability/durability.service';
import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { StrategyOrderIntent } from './strategy-intent.types';
import { StrategyIntentStoreService } from './strategy-intent-store.service';

@Injectable()
export class StrategyIntentExecutionService {
  private readonly logger = new CustomLogger(
    StrategyIntentExecutionService.name,
  );
  private readonly processedIntentIds = new Set<string>();
  private readonly executeIntents: boolean;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
    @Optional()
    private readonly durabilityService?: DurabilityService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
  ) {
    this.executeIntents = this.toBoolean(
      this.configService.get('strategy.execute_intents', false),
      false,
    );
    const parsedMaxRetries = Number(
      this.configService.get('strategy.intent_max_retries', 2),
    );

    this.maxRetries =
      Number.isFinite(parsedMaxRetries) && parsedMaxRetries >= 0
        ? Math.floor(parsedMaxRetries)
        : 2;
    if (this.maxRetries !== parsedMaxRetries) {
      this.logger.warn(
        `Invalid strategy.intent_max_retries value: ${parsedMaxRetries}. Falling back to ${this.maxRetries}`,
      );
    }

    const parsedRetryBaseDelayMs = Number(
      this.configService.get('strategy.intent_retry_base_delay_ms', 250),
    );

    this.retryBaseDelayMs =
      Number.isFinite(parsedRetryBaseDelayMs) && parsedRetryBaseDelayMs > 0
        ? parsedRetryBaseDelayMs
        : 250;
    if (this.retryBaseDelayMs !== parsedRetryBaseDelayMs) {
      this.logger.warn(
        `Invalid strategy.intent_retry_base_delay_ms value: ${parsedRetryBaseDelayMs}. Falling back to ${this.retryBaseDelayMs}`,
      );
    }
  }

  async consumeIntents(intents: StrategyOrderIntent[]): Promise<void> {
    for (const intent of intents) {
      await this.consumeIntent(intent);
    }
  }

  hasProcessedIntent(intentId: string): boolean {
    return this.processedIntentIds.has(intentId);
  }

  private async consumeIntent(intent: StrategyOrderIntent): Promise<void> {
    if (this.processedIntentIds.has(intent.intentId)) {
      return;
    }

    const alreadyProcessed = this.durabilityService
      ? await this.durabilityService.isProcessed(
          'strategy-intent-execution',
          intent.intentId,
        )
      : false;

    if (alreadyProcessed) {
      await this.strategyIntentStoreService?.updateIntentStatus(
        intent.intentId,
        'DONE',
      );
      this.processedIntentIds.add(intent.intentId);

      return;
    }

    await this.strategyIntentStoreService?.updateIntentStatus(
      intent.intentId,
      'SENT',
    );

    if (!this.executeIntents) {
      this.processedIntentIds.add(intent.intentId);
      await this.strategyIntentStoreService?.updateIntentStatus(
        intent.intentId,
        'DONE',
      );
      await this.durabilityService?.appendOutboxEvent({
        topic: 'strategy.intent.skipped',
        aggregateType: 'strategy_intent',
        aggregateId: intent.intentId,
        payload: intent,
      });
      await this.durabilityService?.markProcessed(
        'strategy-intent-execution',
        intent.intentId,
      );

      return;
    }

    try {
      if (intent.type === 'CREATE_LIMIT_ORDER') {
        const result = await this.runWithRetries(() =>
          this.exchangeConnectorAdapterService.placeLimitOrder(
            intent.exchange,
            intent.pair,
            intent.side,
            intent.qty,
            intent.price,
          ),
        );

        if (result?.id) {
          await this.strategyIntentStoreService?.attachMixinOrderId(
            intent.intentId,
            String(result.id),
          );
          this.exchangeOrderTrackerService?.upsertOrder({
            strategyKey: intent.strategyKey,
            exchange: intent.exchange,
            pair: intent.pair,
            exchangeOrderId: String(result.id),
            side: intent.side,
            price: intent.price,
            qty: intent.qty,
            status: 'open',
            updatedAt: getRFC3339Timestamp(),
          });
        }
      }

      if (intent.type === 'CANCEL_ORDER') {
        if (!intent.mixinOrderId) {
          throw new Error('CANCEL_ORDER intent missing mixinOrderId');
        }

        const result = await this.runWithRetries(() =>
          this.exchangeConnectorAdapterService.cancelOrder(
            intent.exchange,
            intent.pair,
            intent.mixinOrderId,
          ),
        );

        this.exchangeOrderTrackerService?.upsertOrder({
          strategyKey: intent.strategyKey,
          exchange: intent.exchange,
          pair: intent.pair,
          exchangeOrderId: intent.mixinOrderId,
          side: intent.side,
          price: intent.price,
          qty: intent.qty,
          status:
            result?.status === 'canceled' || result?.status === 'cancelled'
              ? 'cancelled'
              : 'failed',
          updatedAt: getRFC3339Timestamp(),
        });
      }

      if (intent.type === 'STOP_EXECUTOR') {
        this.logger.log(`Received STOP_EXECUTOR for ${intent.strategyKey}`);
      }

      await this.strategyIntentStoreService?.updateIntentStatus(
        intent.intentId,
        'ACKED',
      );
      await this.strategyIntentStoreService?.updateIntentStatus(
        intent.intentId,
        'DONE',
      );

      await this.durabilityService?.appendOutboxEvent({
        topic: 'strategy.intent.executed',
        aggregateType: 'strategy_intent',
        aggregateId: intent.intentId,
        payload: {
          ...intent,
          eventType: 'EXECUTION_EVENT',
          eventStatus: 'DONE',
        },
      });
      await this.durabilityService?.markProcessed(
        'strategy-intent-execution',
        intent.intentId,
      );
      this.processedIntentIds.add(intent.intentId);
    } catch (error) {
      await this.strategyIntentStoreService?.updateIntentStatus(
        intent.intentId,
        'FAILED',
        error instanceof Error ? error.message : 'unknown error',
      );
      await this.durabilityService?.appendOutboxEvent({
        topic: 'strategy.intent.failed',
        aggregateType: 'strategy_intent',
        aggregateId: intent.intentId,
        payload: {
          ...intent,
          eventType: 'EXECUTION_EVENT',
          eventStatus: 'FAILED',
          error: error instanceof Error ? error.message : 'unknown error',
        },
      });
      throw error;
    }
  }

  private async runWithRetries<T>(work: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await work();
      } catch (error) {
        attempt += 1;
        if (attempt > this.maxRetries) {
          throw error;
        }
        const backoffMs = this.retryBaseDelayMs * 2 ** (attempt - 1);

        await this.sleep(backoffMs);
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toBoolean(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off', ''].includes(normalized)) {
        return false;
      }
    }

    return defaultValue;
  }
}

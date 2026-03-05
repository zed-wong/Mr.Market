import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { DurabilityService } from '../../durability/durability.service';
import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import { ExchangeOrderTrackerService } from '../../trackers/exchange-order-tracker.service';
import { DexAdapterId } from '../config/strategy.dto';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { DexVolumeStrategyService } from '../dex/dex-volume.strategy.service';
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
    @InjectRepository(StrategyExecutionHistory)
    private readonly strategyExecutionHistoryRepository?: Repository<StrategyExecutionHistory>,
    @Optional()
    private readonly durabilityService?: DurabilityService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly dexVolumeStrategyService?: DexVolumeStrategyService,
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
          await this.strategyExecutionHistoryRepository?.save(
            this.strategyExecutionHistoryRepository.create({
              userId: intent.userId,
              clientId: intent.clientId,
              exchange: intent.exchange,
              pair: intent.pair,
              side: intent.side,
              amount: intent.qty,
              price: intent.price,
              strategyType: this.extractStrategyType(intent.strategyKey),
              strategyInstanceId: intent.strategyInstanceId,
              orderId: String(result.id),
              status: result?.status || 'open',
              metadata: {
                intentId: intent.intentId,
                intentType: intent.type,
              },
            }),
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

      if (intent.type === 'EXECUTE_AMM_SWAP') {
        if (!this.dexVolumeStrategyService) {
          throw new Error('Dex volume strategy service is not available');
        }

        const metadata =
          intent.metadata && typeof intent.metadata === 'object'
            ? intent.metadata
            : {};
        const dexId = String(
          (metadata as Record<string, unknown>).dexId || '',
        ) as DexAdapterId;
        const chainId = Number(
          (metadata as Record<string, unknown>).chainId || 0,
        );
        const tokenIn = String(
          (metadata as Record<string, unknown>).tokenIn || '',
        );
        const tokenOut = String(
          (metadata as Record<string, unknown>).tokenOut || '',
        );
        const feeTier = Number(
          (metadata as Record<string, unknown>).feeTier || 0,
        );

        if (!dexId || !chainId || !tokenIn || !tokenOut || !feeTier) {
          throw new Error('EXECUTE_AMM_SWAP intent metadata is incomplete');
        }

        const executedTradesRaw = Number(
          (metadata as Record<string, unknown>).executedTrades,
        );
        const side = intent.side;

        const result = await this.runWithRetries(() =>
          this.dexVolumeStrategyService!.executeCycle({
            dexId,
            chainId,
            tokenIn,
            tokenOut,
            feeTier,
            baseTradeAmount: Number(
              (metadata as Record<string, unknown>).baseTradeAmount || 0,
            ),
            baseIncrementPercentage: Number(
              (metadata as Record<string, unknown>).baseIncrementPercentage ||
                0,
            ),
            pricePushRate: Number(
              (metadata as Record<string, unknown>).pricePushRate || 0,
            ),
            executedTrades: Number.isFinite(executedTradesRaw)
              ? executedTradesRaw
              : 0,
            side,
            slippageBps: Number(
              (metadata as Record<string, unknown>).slippageBps || 0,
            ),
            recipient:
              String((metadata as Record<string, unknown>).recipient || '') ||
              undefined,
          }),
        );

        await this.strategyExecutionHistoryRepository?.save(
          this.strategyExecutionHistoryRepository.create({
            userId: intent.userId,
            clientId: intent.clientId,
            exchange: intent.exchange,
            pair: intent.pair,
            side: intent.side,
            amount: intent.qty,
            price: intent.price,
            strategyType: this.extractStrategyType(intent.strategyKey),
            strategyInstanceId: intent.strategyInstanceId,
            orderId: result.txHash,
            status: 'filled',
            metadata: {
              intentId: intent.intentId,
              intentType: intent.type,
              executionCategory: intent.executionCategory,
              txHash: result.txHash,
            },
          }),
        );
      }

      if (
        intent.type === 'STOP_CONTROLLER' ||
        intent.type === 'STOP_EXECUTOR'
      ) {
        this.logger.log(`Received ${intent.type} for ${intent.strategyKey}`);
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

  private extractStrategyType(strategyKey: string): string {
    const parts = strategyKey.split('-');

    if (parts.length <= 2) {
      return strategyKey;
    }

    return parts.slice(2).join('-');
  }
}

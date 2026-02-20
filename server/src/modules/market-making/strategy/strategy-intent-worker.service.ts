import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { StrategyOrderIntent } from './strategy-intent.types';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';

@Injectable()
export class StrategyIntentWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new CustomLogger(StrategyIntentWorkerService.name);
  private readonly intentExecutionDriver: string;
  private readonly pollIntervalMs: number;
  private readonly maxInFlight: number;
  private readonly maxInFlightPerExchange: number;
  private running = false;
  private loopPromise?: Promise<void>;
  private readonly inFlightIntentIds = new Set<string>();
  private readonly inFlightStrategyKeys = new Set<string>();
  private readonly inFlightByExchange = new Map<string, number>();
  private readonly activeTasks = new Set<Promise<void>>();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly strategyIntentExecutionService?: StrategyIntentExecutionService,
  ) {
    this.intentExecutionDriver = String(
      this.configService.get('strategy.intent_execution_driver', 'worker'),
    ).toLowerCase();
    this.pollIntervalMs = Math.max(
      10,
      Number(
        this.configService.get('strategy.intent_worker_poll_interval_ms', 100),
      ),
    );
    this.maxInFlight = Math.max(
      1,
      Number(this.configService.get('strategy.intent_worker_max_in_flight', 8)),
    );
    this.maxInFlightPerExchange = Math.max(
      1,
      Number(
        this.configService.get(
          'strategy.intent_worker_max_in_flight_per_exchange',
          1,
        ),
      ),
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.shouldRunWorker()) {
      return;
    }

    this.running = true;
    this.loopPromise = this.controlLoop();
    this.logger.log('Strategy intent worker started');
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loopPromise;
    await Promise.allSettled([...this.activeTasks]);
  }

  private shouldRunWorker(): boolean {
    return (
      this.intentExecutionDriver === 'worker' &&
      Boolean(this.strategyIntentStoreService) &&
      Boolean(this.strategyIntentExecutionService)
    );
  }

  private async controlLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.dispatchAvailableIntents();
      } catch (error) {
        this.logger.error(
          `Intent worker loop error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      await this.sleep(this.pollIntervalMs);
    }
  }

  private async dispatchAvailableIntents(): Promise<void> {
    if (
      !this.strategyIntentStoreService ||
      !this.strategyIntentExecutionService
    ) {
      return;
    }

    const availableSlots = this.maxInFlight - this.inFlightIntentIds.size;

    if (availableSlots <= 0) {
      return;
    }

    const strategyKeys =
      await this.strategyIntentStoreService.listStrategyKeysWithNewIntents(
        Math.max(availableSlots * 4, availableSlots),
      );

    for (const strategyKey of strategyKeys) {
      if (!this.running) {
        return;
      }

      if (this.inFlightIntentIds.size >= this.maxInFlight) {
        return;
      }

      if (this.inFlightStrategyKeys.has(strategyKey)) {
        continue;
      }

      const headIntent = await this.strategyIntentStoreService.getHeadIntent(
        strategyKey,
      );

      if (!headIntent || headIntent.status !== 'NEW') {
        continue;
      }

      if (this.inFlightIntentIds.has(headIntent.intentId)) {
        continue;
      }

      const hasProcessedIntent =
        typeof this.strategyIntentExecutionService.hasProcessedIntent ===
        'function'
          ? this.strategyIntentExecutionService.hasProcessedIntent(
              headIntent.intentId,
            )
          : false;

      if (hasProcessedIntent) {
        continue;
      }

      const exchangeKey = headIntent.exchange || '__unknown__';
      const exchangeInFlight = this.inFlightByExchange.get(exchangeKey) || 0;

      if (exchangeInFlight >= this.maxInFlightPerExchange) {
        continue;
      }

      this.dispatchIntent(headIntent, exchangeKey);
    }
  }

  private dispatchIntent(
    intentEntity: StrategyOrderIntentEntity,
    exchangeKey: string,
  ): void {
    if (!this.strategyIntentExecutionService) {
      return;
    }

    this.inFlightIntentIds.add(intentEntity.intentId);
    this.inFlightStrategyKeys.add(intentEntity.strategyKey);
    this.inFlightByExchange.set(
      exchangeKey,
      (this.inFlightByExchange.get(exchangeKey) || 0) + 1,
    );

    const intent = this.toIntent(intentEntity);

    const task = (async () => {
      try {
        await this.strategyIntentExecutionService?.consumeIntents([intent]);
      } catch (error) {
        this.logger.error(
          `Intent execution failed for ${intent.intentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    })();

    this.activeTasks.add(task);
    void task.finally(() => {
      this.activeTasks.delete(task);
      this.inFlightIntentIds.delete(intent.intentId);
      this.inFlightStrategyKeys.delete(intent.strategyKey);
      const remainingForExchange = Math.max(
        0,
        (this.inFlightByExchange.get(exchangeKey) || 0) - 1,
      );

      if (remainingForExchange === 0) {
        this.inFlightByExchange.delete(exchangeKey);
      } else {
        this.inFlightByExchange.set(exchangeKey, remainingForExchange);
      }
    });
  }

  private toIntent(
    intentEntity: StrategyOrderIntentEntity,
  ): StrategyOrderIntent {
    return {
      type: intentEntity.type as StrategyOrderIntent['type'],
      intentId: intentEntity.intentId,
      strategyInstanceId: intentEntity.strategyInstanceId,
      strategyKey: intentEntity.strategyKey,
      userId: intentEntity.userId,
      clientId: intentEntity.clientId,
      exchange: intentEntity.exchange,
      pair: intentEntity.pair,
      side: intentEntity.side as StrategyOrderIntent['side'],
      price: intentEntity.price,
      qty: intentEntity.qty,
      mixinOrderId: intentEntity.mixinOrderId,
      createdAt: intentEntity.createdAt,
      status: intentEntity.status as StrategyOrderIntent['status'],
    };
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { buildSubmittedClientOrderId } from 'src/common/helpers/client-order-id';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { DurabilityService } from '../../durability/durability.service';
import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from '../../execution/exchange-order-mapping.service';
import { ExchangeOrderTrackerService } from '../../trackers/exchange-order-tracker.service';
import { DexAdapterId } from '../config/strategy.dto';
import { StrategyOrderIntent } from '../config/strategy-intent.types';
import { DexVolumeStrategyService } from '../dex/dex-volume.strategy.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';

class IntentCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentCancelledError';
  }
}

@Injectable()
export class StrategyIntentExecutionService {
  private readonly logger = new CustomLogger(
    StrategyIntentExecutionService.name,
  );
  private readonly processedIntentIds = new Set<string>();
  private readonly executeIntents: boolean;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly nextClientOrderSeqByOrderId = new Map<string, number>();
  private readonly stoppedExecutionReason =
    'strategy stopped before intent execution';

  constructor(
    private readonly configService: ConfigService,
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
    @Optional()
    @InjectRepository(StrategyExecutionHistory)
    private readonly strategyExecutionHistoryRepository?: Repository<StrategyExecutionHistory>,
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    private readonly durabilityService?: DurabilityService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly exchangeOrderMappingService?: ExchangeOrderMappingService,
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
    let firstError: unknown;

    for (const intent of intents) {
      try {
        await this.consumeIntent(intent);
      } catch (error) {
        if (!firstError) {
          firstError = error;
        }
      }
    }

    if (firstError) {
      throw firstError;
    }
  }

  hasProcessedIntent(intentId: string): boolean {
    return this.processedIntentIds.has(intentId);
  }

  private async consumeIntent(
    intent: StrategyOrderIntent,
  ): Promise<Record<string, unknown> | undefined> {
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

    if (!(await this.ensureStrategyStillRunning(intent))) {
      return;
    }

    await this.strategyIntentStoreService?.updateIntentStatus(
      intent.intentId,
      'SENT',
    );

    if (!this.executeIntents) {
      this.logger.warn(
        `Skipping intent ${intent.intentId} (execute_intents=false): ${intent.type} ${intent.side} ${intent.qty}@${intent.price} ${intent.exchange} ${intent.pair}`,
      );
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
      let executionResult: Record<string, unknown> | undefined;

      if (intent.type === 'CREATE_LIMIT_ORDER') {
        const activeSlotOrders =
          this.exchangeOrderTrackerService?.getActiveSlotOrders?.(
            intent.strategyKey,
          ) ||
          this.exchangeOrderTrackerService?.getTrackedOrders(
            intent.strategyKey,
          ) ||
          [];
        const trackedOrders =
          this.exchangeOrderTrackerService?.getTrackedOrders(
            intent.strategyKey,
          ) || [];

        if (
          intent.slotKey &&
          activeSlotOrders.some((order) => order.slotKey === intent.slotKey)
        ) {
          await this.strategyIntentStoreService?.updateIntentStatus(
            intent.intentId,
            'DONE',
          );

          return;
        }
        if (
          trackedOrders.some(
            (order) =>
              order.side === intent.side &&
              order.status === 'pending_create' &&
              order.price === intent.price &&
              order.qty === intent.qty,
          )
        ) {
          await this.strategyIntentStoreService?.updateIntentStatus(
            intent.intentId,
            'DONE',
          );

          return;
        }

        const orderId = this.resolveOrderIdForClientOrderId(intent);
        const clientOrderId = await this.reserveClientOrderId(orderId);
        const result = await this.runWithRetries(intent, () =>
          this.exchangeConnectorAdapterService.placeLimitOrder(
            intent.exchange,
            intent.pair,
            intent.side,
            intent.qty,
            intent.price,
            clientOrderId,
            {
              postOnly: Boolean(intent.postOnly),
              timeInForce: intent.timeInForce,
            },
            intent.accountLabel,
          ),
        );

        this.assertImmediateOrderAck(intent, result);
        executionResult = result as Record<string, unknown> | undefined;

        if (result?.id) {
          await this.strategyIntentStoreService?.attachMixinOrderId(
            intent.intentId,
            String(result.id),
          );
          await this.exchangeOrderMappingService?.createMapping({
            orderId,
            exchangeOrderId: String(result.id),
            clientOrderId,
          });
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
                clientOrderId,
              },
            }),
          );
          this.exchangeOrderTrackerService?.upsertOrder({
            orderId,
            strategyKey: intent.strategyKey,
            exchange: intent.exchange,
            accountLabel: intent.accountLabel,
            pair: intent.pair,
            exchangeOrderId: String(result.id),
            clientOrderId,
            slotKey: intent.slotKey,
            role: this.resolveIntentRole(intent),
            side: intent.side,
            price: intent.price,
            qty: intent.qty,
            cumulativeFilledQty: '0',
            status: 'pending_create',
            createdAt: getRFC3339Timestamp(),
            updatedAt: getRFC3339Timestamp(),
          });
        } else {
          this.logger.warn(
            `CREATE_LIMIT_ORDER returned no id for ${intent.strategyKey}: ${
              intent.side
            } ${intent.qty}@${intent.price} ${intent.exchange} ${
              intent.pair
            } result=${JSON.stringify(result)}`,
          );
        }
      }

      if (intent.type === 'CANCEL_ORDER') {
        if (!intent.mixinOrderId) {
          throw new Error('CANCEL_ORDER intent missing mixinOrderId');
        }

        const trackedOrder =
          this.exchangeOrderTrackerService?.getByExchangeOrderId(
            intent.exchange,
            intent.mixinOrderId,
            intent.accountLabel,
          );

        if (
          trackedOrder &&
          (trackedOrder.status === 'pending_cancel' ||
            trackedOrder.status === 'cancelled' ||
            trackedOrder.status === 'filled')
        ) {
          await this.strategyIntentStoreService?.updateIntentStatus(
            intent.intentId,
            'DONE',
          );

          return;
        }

        const result = await this.runWithRetries(intent, () =>
          this.exchangeConnectorAdapterService.cancelOrder(
            intent.exchange,
            intent.pair,
            intent.mixinOrderId,
            trackedOrder?.accountLabel || intent.accountLabel,
          ),
        );

        const orderId = this.resolveOrderIdForClientOrderId(intent);

        this.exchangeOrderTrackerService?.upsertOrder({
          orderId,
          strategyKey: intent.strategyKey,
          exchange: intent.exchange,
          accountLabel: trackedOrder?.accountLabel || intent.accountLabel,
          pair: intent.pair,
          exchangeOrderId: intent.mixinOrderId,
          clientOrderId: trackedOrder?.clientOrderId,
          slotKey: trackedOrder?.slotKey || intent.slotKey,
          role: trackedOrder?.role,
          side: intent.side,
          price: intent.price,
          qty: intent.qty,
          status:
            result?.status === 'canceled' || result?.status === 'cancelled'
              ? 'cancelled'
              : 'pending_cancel',
          createdAt: getRFC3339Timestamp(),
          updatedAt: getRFC3339Timestamp(),
        });

        executionResult = result as Record<string, unknown> | undefined;
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

        const result = await this.runWithRetries(intent, () =>
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

        executionResult = result as Record<string, unknown> | undefined;
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

      return executionResult;
    } catch (error) {
      if (error instanceof IntentCancelledError) {
        return;
      }

      const role = this.resolveIntentRole(intent) || 'unknown';
      const cycleId = this.readMetadataString(intent, 'cycleId') || 'n/a';
      const makerAccountLabel =
        this.readMetadataString(intent, 'makerAccountLabel') || 'n/a';
      const takerAccountLabel =
        this.readMetadataString(intent, 'takerAccountLabel') || 'n/a';

      this.logger.error(
        [
          'Intent execution failed',
          `strategy=${intent.strategyKey}`,
          `intent=${intent.intentId}`,
          `cycle=${cycleId}`,
          `exchange=${intent.exchange}`,
          `pair=${intent.pair}`,
          `role=${role}`,
          `account=${intent.accountLabel || 'default'}`,
          `maker=${makerAccountLabel}`,
          `taker=${takerAccountLabel}`,
          `side=${intent.side}`,
          `qty=${intent.qty}`,
          `price=${intent.price}`,
          `clientId=${intent.clientId}`,
          `error=${error instanceof Error ? error.message : String(error)}`,
        ].join(' | '),
      );

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

  private resolveIntentRole(
    intent: StrategyOrderIntent,
  ): 'maker' | 'taker' | 'rebalance' | undefined {
    const role = this.readMetadataString(intent, 'role');

    return role === 'maker' || role === 'taker' || role === 'rebalance'
      ? role
      : undefined;
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

  private resolveOrderIdForClientOrderId(intent: StrategyOrderIntent): string {
    const metadataOrderId =
      intent.metadata &&
      typeof intent.metadata === 'object' &&
      typeof (intent.metadata as Record<string, unknown>).orderId === 'string'
        ? String((intent.metadata as Record<string, unknown>).orderId)
        : undefined;

    return metadataOrderId || intent.clientId;
  }

  private assertImmediateOrderAck(
    intent: StrategyOrderIntent,
    result: unknown,
  ): void {
    if (intent.type !== 'CREATE_LIMIT_ORDER' || intent.timeInForce !== 'IOC') {
      return;
    }

    if (this.readOrderIdFromResult(result)) {
      return;
    }

    const filledQty = this.readFilledQtyFromResult(result);

    if (filledQty?.isGreaterThan(0)) {
      return;
    }

    const status = this.readOrderStatusFromResult(result);

    if (status) {
      throw new Error(`IOC order not acknowledged: status=${status}`);
    }

    throw new Error('IOC order returned no exchange order id');
  }

  private readOrderIdFromResult(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }

    const value = (result as Record<string, unknown>).id;

    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readOrderStatusFromResult(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }

    const value = (result as Record<string, unknown>).status;

    return typeof value === 'string' && value.trim().length > 0
      ? value.trim().toLowerCase()
      : undefined;
  }

  private readFilledQtyFromResult(result: unknown): BigNumber | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }

    const value = (result as Record<string, unknown>).filled;

    if (value == null) {
      return undefined;
    }

    try {
      const qty = new BigNumber(value as BigNumber.Value);

      return qty.isFinite() ? qty : undefined;
    } catch {
      return undefined;
    }
  }

  private async reserveClientOrderId(orderId: string): Promise<string> {
    const current = this.nextClientOrderSeqByOrderId.get(orderId);
    const nextSeq =
      current ??
      (await this.exchangeOrderMappingService?.countMappingsForOrder(
        orderId,
      )) ??
      0;
    const clientOrderId = buildSubmittedClientOrderId(orderId, nextSeq);

    await this.exchangeOrderMappingService?.reserveMapping({
      orderId,
      clientOrderId,
    });

    this.nextClientOrderSeqByOrderId.set(orderId, nextSeq + 1);

    return clientOrderId;
  }

  private async runWithRetries<T>(
    intent: StrategyOrderIntent,
    work: () => Promise<T>,
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      if (!(await this.ensureStrategyStillRunning(intent))) {
        throw new IntentCancelledError(this.stoppedExecutionReason);
      }

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

  private async ensureStrategyStillRunning(
    intent: StrategyOrderIntent,
  ): Promise<boolean> {
    if (!this.strategyInstanceRepository) {
      return true;
    }

    const strategyInstance = await this.strategyInstanceRepository.findOne({
      where: { strategyKey: intent.strategyKey },
    });

    if (!strategyInstance || strategyInstance.status === 'running') {
      return true;
    }

    await this.strategyIntentStoreService?.updateIntentStatus(
      intent.intentId,
      'CANCELLED',
      this.stoppedExecutionReason,
    );
    this.processedIntentIds.add(intent.intentId);

    return false;
  }

  private normalizeTrackedOrderStatus(
    status: unknown,
  ):
    | 'open'
    | 'partially_filled'
    | 'pending_cancel'
    | 'filled'
    | 'cancelled'
    | 'failed'
    | null {
    const normalized = String(status || '')
      .trim()
      .toLowerCase();

    if (!normalized) {
      return null;
    }
    if (normalized === 'open' || normalized === 'new') {
      return 'open';
    }
    if (
      normalized === 'partially_filled' ||
      normalized === 'partially-filled'
    ) {
      return 'partially_filled';
    }
    if (normalized === 'pending_cancel') {
      return 'pending_cancel';
    }
    if (normalized === 'closed' || normalized === 'filled') {
      return 'filled';
    }
    if (normalized === 'canceled' || normalized === 'cancelled') {
      return 'cancelled';
    }

    return 'failed';
  }

  private isTrackedOrderTerminal(status: unknown): boolean {
    return ['filled', 'cancelled', 'failed'].includes(
      String(status || '').toLowerCase(),
    );
  }

  private normalizeFilledValue(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    return undefined;
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

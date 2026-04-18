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
import type { TrackedOrder } from '../../trackers/exchange-order-tracker.service';
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

type ImmediateDualAccountOrderSnapshot = {
  trackedOrder?: TrackedOrder;
  status: TrackedOrder['status'] | null;
  cumulativeFilledQty: BigNumber;
  remainingQty: BigNumber;
};

type ImmediateDualAccountRetryableMakerError = Error & {
  code: 'DUAL_ACCOUNT_MAKER_REPRICE_REQUIRED';
};

@Injectable()
export class StrategyIntentExecutionService {
  private static readonly DUAL_ACCOUNT_ORDER_POLL_MS = 100;
  private static readonly DUAL_ACCOUNT_ORDER_READY_TIMEOUT_MS = 1_500;
  private static readonly DUAL_ACCOUNT_FILL_SYNC_TIMEOUT_MS = 1_500;
  private static readonly DUAL_ACCOUNT_PRICE_TOLERANCE = new BigNumber(
    '0.00000001',
  );
  private static readonly DUAL_ACCOUNT_QTY_TOLERANCE = new BigNumber(
    '0.00000001',
  );
  private readonly logger = new CustomLogger(
    StrategyIntentExecutionService.name,
  );
  private readonly processedIntentIds = new Set<string>();
  private readonly executeIntents: boolean;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly dualAccountInlineTakerMaxDelayMs: number;
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

    const parsedDualAccountInlineTakerMaxDelayMs = Number(
      this.configService.get(
        'strategy.dual_account_inline_taker_max_delay_ms',
        1_000,
      ),
    );

    this.dualAccountInlineTakerMaxDelayMs =
      Number.isFinite(parsedDualAccountInlineTakerMaxDelayMs) &&
      parsedDualAccountInlineTakerMaxDelayMs >= 0
        ? Math.floor(parsedDualAccountInlineTakerMaxDelayMs)
        : 1_000;
    if (
      this.dualAccountInlineTakerMaxDelayMs !==
      parsedDualAccountInlineTakerMaxDelayMs
    ) {
      this.logger.warn(
        `Invalid strategy.dual_account_inline_taker_max_delay_ms value: ${parsedDualAccountInlineTakerMaxDelayMs}. Falling back to ${this.dualAccountInlineTakerMaxDelayMs}`,
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

          await this.maybeExecuteImmediateDualAccountTaker(
            intent,
            result,
            clientOrderId,
          );
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

  private readInlineDualAccountRetryAttempt(
    intent: StrategyOrderIntent,
  ): number {
    if (!intent.metadata || typeof intent.metadata !== 'object') {
      return 0;
    }

    const rawValue = (intent.metadata as Record<string, unknown>)[
      'inlineDualAccountRetryAttempt'
    ];
    const attempt = Number(rawValue);

    return Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  }

  private buildImmediateDualAccountRepriceRequiredError(
    message: string,
  ): ImmediateDualAccountRetryableMakerError {
    const error = new Error(
      `${message} repriceRequired=true`,
    ) as ImmediateDualAccountRetryableMakerError;

    error.code = 'DUAL_ACCOUNT_MAKER_REPRICE_REQUIRED';

    return error;
  }

  private isImmediateDualAccountRepriceRequiredError(
    error: unknown,
  ): error is ImmediateDualAccountRetryableMakerError {
    return (
      error instanceof Error &&
      (error as Partial<ImmediateDualAccountRetryableMakerError>).code ===
        'DUAL_ACCOUNT_MAKER_REPRICE_REQUIRED'
    );
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

  private async maybeExecuteImmediateDualAccountTaker(
    intent: StrategyOrderIntent,
    makerResult: unknown,
    makerClientOrderId: string,
  ): Promise<void> {
    if (intent.type !== 'CREATE_LIMIT_ORDER' || intent.timeInForce === 'IOC') {
      return;
    }

    if (this.resolveIntentRole(intent) !== 'maker') {
      return;
    }

    const takerAccountLabel = this.readMetadataString(
      intent,
      'takerAccountLabel',
    );

    if (!takerAccountLabel) {
      return;
    }

    const inlineRetryAttempt = this.readInlineDualAccountRetryAttempt(intent);

    if (inlineRetryAttempt > 0) {
      this.logger.log(
        [
          'Skipping immediate dual-account taker after maker reprice',
          `strategy=${intent.strategyKey}`,
          `intent=${intent.intentId}`,
          `retryAttempt=${inlineRetryAttempt}`,
        ].join(' | '),
      );

      return;
    }

    const makerExchangeOrderId = this.readOrderIdFromResult(makerResult);

    if (!makerExchangeOrderId) {
      this.logger.warn(
        `Skipping immediate dual-account taker for ${intent.strategyKey}: maker ACK missing exchange order id`,
      );

      return;
    }

    const takerIntent = this.buildImmediateDualAccountTakerIntent(
      intent,
      takerAccountLabel,
      makerExchangeOrderId,
    );

    try {
      const makerReadySnapshot =
        await this.waitForImmediateDualAccountMakerReady(
          intent,
          makerExchangeOrderId,
        );

      await this.assertImmediateDualAccountMakerOwnsTopOfBook(
        intent,
        makerExchangeOrderId,
        makerReadySnapshot,
        'pre-taker',
      );
      await this.maybeSleepBeforeImmediateDualAccountTaker(
        intent,
        makerExchangeOrderId,
      );

      const makerDispatchSnapshot =
        await this.assertImmediateDualAccountMakerStillEligible(
          intent,
          makerExchangeOrderId,
          'post-delay',
        );

      await this.assertImmediateDualAccountMakerOwnsTopOfBook(
        intent,
        makerExchangeOrderId,
        makerDispatchSnapshot,
        'post-delay',
      );

      const takerResult = await this.consumeIntent(takerIntent);

      await this.assertImmediateDualAccountPairedFill(
        intent,
        makerExchangeOrderId,
        makerDispatchSnapshot,
        takerIntent,
        takerResult,
      );
    } catch (error) {
      if (this.isImmediateDualAccountRepriceRequiredError(error)) {
        await this.repriceImmediateDualAccountMaker(
          intent,
          makerExchangeOrderId,
          makerClientOrderId,
          error,
        );

        return;
      }

      await this.cancelMakerAfterImmediateDualAccountFailure(
        intent,
        makerExchangeOrderId,
        makerClientOrderId,
        error,
      );

      throw error;
    }
  }

  private buildImmediateDualAccountTakerIntent(
    intent: StrategyOrderIntent,
    takerAccountLabel: string,
    makerExchangeOrderId: string,
  ): StrategyOrderIntent {
    const metadata =
      intent.metadata && typeof intent.metadata === 'object'
        ? { ...(intent.metadata as Record<string, unknown>) }
        : {};

    return {
      ...intent,
      intentId: `${intent.intentId}:inline-taker`,
      accountLabel: takerAccountLabel,
      side: intent.side === 'buy' ? 'sell' : 'buy',
      postOnly: false,
      timeInForce: 'IOC',
      status: 'NEW',
      createdAt: getRFC3339Timestamp(),
      metadata: {
        ...metadata,
        role: 'taker',
        makerOrderId: makerExchangeOrderId,
        makerIntentId: intent.intentId,
        trigger: 'maker_ack',
        triggerFillQty: intent.qty,
      },
    };
  }

  private async waitForImmediateDualAccountMakerReady(
    intent: StrategyOrderIntent,
    makerExchangeOrderId: string,
  ): Promise<ImmediateDualAccountOrderSnapshot> {
    const deadline =
      Date.now() +
      StrategyIntentExecutionService.DUAL_ACCOUNT_ORDER_READY_TIMEOUT_MS;

    while (Date.now() <= deadline) {
      if (!(await this.ensureStrategyStillRunning(intent))) {
        throw new IntentCancelledError(this.stoppedExecutionReason);
      }

      const snapshot = await this.loadImmediateDualAccountOrderSnapshot(
        intent,
        makerExchangeOrderId,
        intent.accountLabel,
        true,
      );

      if (
        snapshot.cumulativeFilledQty.isGreaterThan(
          StrategyIntentExecutionService.DUAL_ACCOUNT_QTY_TOLERANCE,
        )
      ) {
        throw new Error(
          `Dual-account maker already filled before taker dispatch: makerOrderId=${makerExchangeOrderId} filled=${snapshot.cumulativeFilledQty.toFixed()}`,
        );
      }

      if (
        snapshot.status === 'open' &&
        snapshot.remainingQty.isGreaterThan(0)
      ) {
        return snapshot;
      }

      if (snapshot.status && this.isTrackedOrderTerminal(snapshot.status)) {
        throw new Error(
          `Dual-account maker became terminal before taker dispatch: makerOrderId=${makerExchangeOrderId} status=${snapshot.status}`,
        );
      }

      await this.sleep(
        StrategyIntentExecutionService.DUAL_ACCOUNT_ORDER_POLL_MS,
      );
    }

    throw new Error(
      `Timed out waiting for dual-account maker readiness: makerOrderId=${makerExchangeOrderId}`,
    );
  }

  private async assertImmediateDualAccountMakerStillEligible(
    intent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    stage: string,
  ): Promise<ImmediateDualAccountOrderSnapshot> {
    const snapshot = await this.loadImmediateDualAccountOrderSnapshot(
      intent,
      makerExchangeOrderId,
      intent.accountLabel,
      true,
    );

    if (
      snapshot.cumulativeFilledQty.isGreaterThan(
        StrategyIntentExecutionService.DUAL_ACCOUNT_QTY_TOLERANCE,
      )
    ) {
      throw new Error(
        `Dual-account maker filled before taker ${stage}: makerOrderId=${makerExchangeOrderId} filled=${snapshot.cumulativeFilledQty.toFixed()}`,
      );
    }

    if (!snapshot.status || snapshot.status !== 'open') {
      throw new Error(
        `Dual-account maker not open before taker ${stage}: makerOrderId=${makerExchangeOrderId} status=${
          snapshot.status || 'unknown'
        }`,
      );
    }

    if (snapshot.remainingQty.isLessThanOrEqualTo(0)) {
      throw new Error(
        `Dual-account maker has no remaining quantity before taker ${stage}: makerOrderId=${makerExchangeOrderId}`,
      );
    }

    return snapshot;
  }

  private async assertImmediateDualAccountMakerOwnsTopOfBook(
    intent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerSnapshot: ImmediateDualAccountOrderSnapshot,
    stage: string,
  ): Promise<void> {
    const orderBook = await this.runWithRetries(intent, () =>
      this.exchangeConnectorAdapterService.fetchOrderBook(
        intent.exchange,
        intent.pair,
      ),
    );
    const rawLevel =
      intent.side === 'buy'
        ? Array.isArray(orderBook?.bids)
          ? orderBook.bids[0]
          : undefined
        : Array.isArray(orderBook?.asks)
        ? orderBook.asks[0]
        : undefined;
    const expectedPrice = new BigNumber(intent.price);
    const topPrice = this.toFiniteBigNumber(
      Array.isArray(rawLevel) ? rawLevel[0] : undefined,
    );
    const topQty = this.toFiniteBigNumber(
      Array.isArray(rawLevel) ? rawLevel[1] : undefined,
    );

    if (
      !topPrice ||
      topPrice
        .minus(expectedPrice)
        .abs()
        .isGreaterThan(
          StrategyIntentExecutionService.DUAL_ACCOUNT_PRICE_TOLERANCE,
        )
    ) {
      throw this.buildImmediateDualAccountRepriceRequiredError(
        [
          `Dual-account maker lost top-of-book before taker ${stage}`,
          `makerOrderId=${makerExchangeOrderId}`,
          `makerSide=${intent.side}`,
          `expectedPrice=${intent.price}`,
          `topPrice=${topPrice?.toFixed() || 'n/a'}`,
        ].join(' '),
      );
    }

    if (!topQty || !this.quantitiesMatch(topQty, makerSnapshot.remainingQty)) {
      throw new Error(
        [
          `Dual-account maker top level is not exclusively ours before taker ${stage}`,
          `makerOrderId=${makerExchangeOrderId}`,
          `makerSide=${intent.side}`,
          `expectedQty=${makerSnapshot.remainingQty.toFixed()}`,
          `topQty=${topQty?.toFixed() || 'n/a'}`,
        ].join(' '),
      );
    }
  }

  private async maybeSleepBeforeImmediateDualAccountTaker(
    intent: StrategyOrderIntent,
    makerExchangeOrderId: string,
  ): Promise<void> {
    const delayMs = this.resolveImmediateDualAccountTakerDelayMs();

    if (delayMs <= 0) {
      return;
    }

    this.logger.log(
      [
        'Delaying immediate dual-account taker dispatch',
        `strategy=${intent.strategyKey}`,
        `intent=${intent.intentId}`,
        `makerOrderId=${makerExchangeOrderId}`,
        `delayMs=${delayMs}`,
      ].join(' | '),
    );

    await this.sleep(delayMs);
  }

  private resolveImmediateDualAccountTakerDelayMs(): number {
    if (this.dualAccountInlineTakerMaxDelayMs <= 0) {
      return 0;
    }

    return Math.floor(
      Math.random() * (this.dualAccountInlineTakerMaxDelayMs + 1),
    );
  }

  private async assertImmediateDualAccountPairedFill(
    makerIntent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerBeforeTakerSnapshot: ImmediateDualAccountOrderSnapshot,
    takerIntent: StrategyOrderIntent,
    takerResult: unknown,
  ): Promise<void> {
    const takerFilledQty = await this.resolveImmediateDualAccountTakerFillQty(
      takerIntent,
      takerResult,
    );

    if (
      takerFilledQty.isLessThanOrEqualTo(
        StrategyIntentExecutionService.DUAL_ACCOUNT_QTY_TOLERANCE,
      )
    ) {
      const errorMessage =
        'Immediate dual-account taker did not fill any quantity';

      await this.strategyIntentStoreService?.updateIntentStatus(
        takerIntent.intentId,
        'FAILED',
        errorMessage,
      );

      throw new Error(`${errorMessage}: makerOrderId=${makerExchangeOrderId}`);
    }

    const makerFillDelta = await this.waitForImmediateDualAccountMakerFillDelta(
      makerIntent,
      makerExchangeOrderId,
      makerBeforeTakerSnapshot.cumulativeFilledQty,
      takerFilledQty,
    );

    if (!this.quantitiesMatch(makerFillDelta, takerFilledQty)) {
      const errorMessage =
        'Immediate dual-account paired fill mismatch between maker and taker';

      await this.strategyIntentStoreService?.updateIntentStatus(
        takerIntent.intentId,
        'FAILED',
        `${errorMessage}: makerDelta=${makerFillDelta.toFixed()} takerFilled=${takerFilledQty.toFixed()}`,
      );

      throw new Error(
        `${errorMessage}: makerOrderId=${makerExchangeOrderId} makerDelta=${makerFillDelta.toFixed()} takerFilled=${takerFilledQty.toFixed()}`,
      );
    }
  }

  private async resolveImmediateDualAccountTakerFillQty(
    takerIntent: StrategyOrderIntent,
    takerResult: unknown,
  ): Promise<BigNumber> {
    const immediateFilledQty = this.readFilledQtyFromResult(takerResult);

    if (
      immediateFilledQty &&
      immediateFilledQty.isGreaterThan(
        StrategyIntentExecutionService.DUAL_ACCOUNT_QTY_TOLERANCE,
      )
    ) {
      return immediateFilledQty;
    }

    const takerExchangeOrderId = this.readOrderIdFromResult(takerResult);

    if (!takerExchangeOrderId) {
      return new BigNumber(0);
    }

    const deadline =
      Date.now() +
      StrategyIntentExecutionService.DUAL_ACCOUNT_FILL_SYNC_TIMEOUT_MS;

    while (Date.now() <= deadline) {
      const snapshot = await this.loadImmediateDualAccountOrderSnapshot(
        takerIntent,
        takerExchangeOrderId,
        takerIntent.accountLabel,
        true,
      );

      if (
        snapshot.cumulativeFilledQty.isGreaterThan(
          StrategyIntentExecutionService.DUAL_ACCOUNT_QTY_TOLERANCE,
        )
      ) {
        return snapshot.cumulativeFilledQty;
      }

      if (snapshot.status && this.isTrackedOrderTerminal(snapshot.status)) {
        return snapshot.cumulativeFilledQty;
      }

      await this.sleep(
        StrategyIntentExecutionService.DUAL_ACCOUNT_ORDER_POLL_MS,
      );
    }

    return new BigNumber(0);
  }

  private async waitForImmediateDualAccountMakerFillDelta(
    makerIntent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerFilledBeforeTaker: BigNumber,
    takerFilledQty: BigNumber,
  ): Promise<BigNumber> {
    const deadline =
      Date.now() +
      StrategyIntentExecutionService.DUAL_ACCOUNT_FILL_SYNC_TIMEOUT_MS;

    while (Date.now() <= deadline) {
      const snapshot = await this.loadImmediateDualAccountOrderSnapshot(
        makerIntent,
        makerExchangeOrderId,
        makerIntent.accountLabel,
        true,
      );
      const makerFillDelta = BigNumber.maximum(
        snapshot.cumulativeFilledQty.minus(makerFilledBeforeTaker),
        0,
      );

      if (this.quantitiesMatch(makerFillDelta, takerFilledQty)) {
        return makerFillDelta;
      }

      if (
        makerFillDelta.isGreaterThan(
          takerFilledQty.plus(
            StrategyIntentExecutionService.DUAL_ACCOUNT_QTY_TOLERANCE,
          ),
        ) ||
        (snapshot.status && this.isTrackedOrderTerminal(snapshot.status))
      ) {
        return makerFillDelta;
      }

      await this.sleep(
        StrategyIntentExecutionService.DUAL_ACCOUNT_ORDER_POLL_MS,
      );
    }

    const finalSnapshot = await this.loadImmediateDualAccountOrderSnapshot(
      makerIntent,
      makerExchangeOrderId,
      makerIntent.accountLabel,
      true,
    );

    return BigNumber.maximum(
      finalSnapshot.cumulativeFilledQty.minus(makerFilledBeforeTaker),
      0,
    );
  }

  private async loadImmediateDualAccountOrderSnapshot(
    intent: StrategyOrderIntent,
    exchangeOrderId: string,
    accountLabel?: string,
    refreshFromExchange = false,
  ): Promise<ImmediateDualAccountOrderSnapshot> {
    if (refreshFromExchange) {
      await this.refreshTrackedOrderFromExchange(
        intent,
        exchangeOrderId,
        accountLabel,
      );
    }

    const trackedOrder = this.exchangeOrderTrackerService?.getByExchangeOrderId(
      intent.exchange,
      exchangeOrderId,
      accountLabel,
    );
    const cumulativeFilledQty = new BigNumber(
      trackedOrder?.cumulativeFilledQty || 0,
    );
    const remainingQty = BigNumber.maximum(
      new BigNumber(intent.qty || 0).minus(cumulativeFilledQty),
      0,
    );

    return {
      trackedOrder,
      status: trackedOrder?.status || null,
      cumulativeFilledQty: cumulativeFilledQty.isFinite()
        ? cumulativeFilledQty
        : new BigNumber(0),
      remainingQty,
    };
  }

  private async refreshTrackedOrderFromExchange(
    intent: StrategyOrderIntent,
    exchangeOrderId: string,
    accountLabel?: string,
  ): Promise<void> {
    try {
      const latest = await this.exchangeConnectorAdapterService.fetchOrder(
        intent.exchange,
        intent.pair,
        exchangeOrderId,
        accountLabel,
      );

      if (!latest) {
        return;
      }

      const existingTrackedOrder =
        this.exchangeOrderTrackerService?.getByExchangeOrderId(
          intent.exchange,
          exchangeOrderId,
          accountLabel,
        );
      const filledQty =
        this.normalizeFilledValue(latest.filled) ||
        existingTrackedOrder?.cumulativeFilledQty ||
        '0';
      const normalizedStatus = this.normalizeTrackedOrderStatus(latest.status);
      const nextStatus =
        normalizedStatus ||
        (new BigNumber(filledQty).isGreaterThan(0) &&
        intent.timeInForce === 'IOC'
          ? 'filled'
          : existingTrackedOrder?.status) ||
        'pending_create';

      this.exchangeOrderTrackerService?.upsertOrder(
        {
          orderId:
            existingTrackedOrder?.orderId ||
            this.resolveOrderIdForClientOrderId(intent),
          strategyKey: intent.strategyKey,
          exchange: intent.exchange,
          accountLabel,
          pair: intent.pair,
          exchangeOrderId,
          clientOrderId: existingTrackedOrder?.clientOrderId,
          slotKey: existingTrackedOrder?.slotKey || intent.slotKey,
          role: existingTrackedOrder?.role || this.resolveIntentRole(intent),
          side: existingTrackedOrder?.side || intent.side,
          price: existingTrackedOrder?.price || intent.price,
          qty: existingTrackedOrder?.qty || intent.qty,
          cumulativeFilledQty: filledQty,
          status: nextStatus,
          createdAt: existingTrackedOrder?.createdAt || getRFC3339Timestamp(),
          updatedAt: getRFC3339Timestamp(),
        },
        'rest',
      );
    } catch (error) {
      this.logger.warn(
        [
          'Failed to refresh tracked order during immediate dual-account validation',
          `strategy=${intent.strategyKey}`,
          `intent=${intent.intentId}`,
          `exchange=${intent.exchange}`,
          `pair=${intent.pair}`,
          `account=${accountLabel || 'default'}`,
          `exchangeOrderId=${exchangeOrderId}`,
          `error=${error instanceof Error ? error.message : String(error)}`,
        ].join(' | '),
      );
    }
  }

  private async repriceImmediateDualAccountMaker(
    intent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerClientOrderId: string,
    error: ImmediateDualAccountRetryableMakerError,
  ): Promise<void> {
    this.logger.warn(
      [
        'Immediate dual-account maker lost top-of-book; repricing maker leg',
        `strategy=${intent.strategyKey}`,
        `intent=${intent.intentId}`,
        `exchange=${intent.exchange}`,
        `pair=${intent.pair}`,
        `makerOrderId=${makerExchangeOrderId}`,
        `account=${intent.accountLabel || 'default'}`,
        `error=${error.message}`,
      ].join(' | '),
    );

    await this.cancelMakerAfterImmediateDualAccountFailure(
      intent,
      makerExchangeOrderId,
      makerClientOrderId,
      error,
    );

    const repricedIntent =
      this.buildImmediateDualAccountRepricedMakerIntent(intent);

    this.logger.log(
      [
        'Reposting dual-account maker after top-of-book loss',
        `strategy=${repricedIntent.strategyKey}`,
        `intent=${repricedIntent.intentId}`,
        `account=${repricedIntent.accountLabel || 'default'}`,
        `side=${repricedIntent.side}`,
        `qty=${repricedIntent.qty}`,
        `price=${repricedIntent.price}`,
      ].join(' | '),
    );

    await this.consumeIntent(repricedIntent);
  }

  private buildImmediateDualAccountRepricedMakerIntent(
    intent: StrategyOrderIntent,
  ): StrategyOrderIntent {
    const metadata =
      intent.metadata && typeof intent.metadata === 'object'
        ? { ...(intent.metadata as Record<string, unknown>) }
        : {};
    const retryAttempt = this.readInlineDualAccountRetryAttempt(intent) + 1;

    return {
      ...intent,
      intentId: `${intent.intentId}:reprice-${retryAttempt}`,
      createdAt: getRFC3339Timestamp(),
      status: 'NEW',
      metadata: {
        ...metadata,
        inlineDualAccountRetryAttempt: retryAttempt,
        inlineDualAccountRetryReason: 'lost_top_of_book',
      },
    };
  }

  private async cancelMakerAfterImmediateDualAccountFailure(
    intent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerClientOrderId: string,
    takerError: unknown,
  ): Promise<void> {
    this.logger.warn(
      [
        'Immediate dual-account cycle failed; cancelling maker leg',
        `strategy=${intent.strategyKey}`,
        `intent=${intent.intentId}`,
        `exchange=${intent.exchange}`,
        `pair=${intent.pair}`,
        `makerOrderId=${makerExchangeOrderId}`,
        `account=${intent.accountLabel || 'default'}`,
        `error=${
          takerError instanceof Error ? takerError.message : String(takerError)
        }`,
      ].join(' | '),
    );

    const makerSnapshot = await this.loadImmediateDualAccountOrderSnapshot(
      intent,
      makerExchangeOrderId,
      intent.accountLabel,
      false,
    );

    if (
      makerSnapshot.status &&
      this.isTrackedOrderTerminal(makerSnapshot.status)
    ) {
      return;
    }

    try {
      const result = await this.runWithRetries(intent, () =>
        this.exchangeConnectorAdapterService.cancelOrder(
          intent.exchange,
          intent.pair,
          makerExchangeOrderId,
          intent.accountLabel,
        ),
      );
      const existingTrackedOrder =
        this.exchangeOrderTrackerService?.getByExchangeOrderId(
          intent.exchange,
          makerExchangeOrderId,
          intent.accountLabel,
        );
      const cancelStatus = this.readOrderStatusFromResult(result);

      this.exchangeOrderTrackerService?.upsertOrder({
        orderId: this.resolveOrderIdForClientOrderId(intent),
        strategyKey: intent.strategyKey,
        exchange: intent.exchange,
        accountLabel: intent.accountLabel,
        pair: intent.pair,
        exchangeOrderId: makerExchangeOrderId,
        clientOrderId:
          existingTrackedOrder?.clientOrderId || makerClientOrderId,
        slotKey: existingTrackedOrder?.slotKey || intent.slotKey,
        role: existingTrackedOrder?.role || 'maker',
        side: intent.side,
        price: intent.price,
        qty: intent.qty,
        cumulativeFilledQty: existingTrackedOrder?.cumulativeFilledQty || '0',
        status:
          cancelStatus === 'canceled' || cancelStatus === 'cancelled'
            ? 'cancelled'
            : 'pending_cancel',
        createdAt: existingTrackedOrder?.createdAt || getRFC3339Timestamp(),
        updatedAt: getRFC3339Timestamp(),
      });
    } catch (cancelError) {
      this.logger.error(
        [
          'Failed to cancel maker after immediate dual-account failure',
          `strategy=${intent.strategyKey}`,
          `intent=${intent.intentId}`,
          `exchange=${intent.exchange}`,
          `pair=${intent.pair}`,
          `makerOrderId=${makerExchangeOrderId}`,
          `account=${intent.accountLabel || 'default'}`,
          `error=${
            cancelError instanceof Error
              ? cancelError.message
              : String(cancelError)
          }`,
        ].join(' | '),
      );
    }
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
    | 'pending_create'
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
    if (normalized === 'pending_create') {
      return 'pending_create';
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

  private quantitiesMatch(
    left: BigNumber,
    right: BigNumber,
    tolerance = StrategyIntentExecutionService.DUAL_ACCOUNT_QTY_TOLERANCE,
  ): boolean {
    return left.minus(right).abs().isLessThanOrEqualTo(tolerance);
  }

  private toFiniteBigNumber(value: unknown): BigNumber | undefined {
    try {
      const parsed = new BigNumber(value as BigNumber.Value);

      return parsed.isFinite() ? parsed : undefined;
    } catch {
      return undefined;
    }
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

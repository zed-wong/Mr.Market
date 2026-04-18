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
  private readonly dualAccountMakerSettlementTimeoutMs: number;
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

    const parsedDualAccountMakerSettlementTimeoutMs = Number(
      this.configService.get(
        'strategy.dual_account_maker_settlement_timeout_ms',
        750,
      ),
    );

    this.dualAccountMakerSettlementTimeoutMs =
      Number.isFinite(parsedDualAccountMakerSettlementTimeoutMs) &&
      parsedDualAccountMakerSettlementTimeoutMs >= 0
        ? Math.floor(parsedDualAccountMakerSettlementTimeoutMs)
        : 750;
    if (
      this.dualAccountMakerSettlementTimeoutMs !==
      parsedDualAccountMakerSettlementTimeoutMs
    ) {
      this.logger.warn(
        `Invalid strategy.dual_account_maker_settlement_timeout_ms value: ${parsedDualAccountMakerSettlementTimeoutMs}. Falling back to ${this.dualAccountMakerSettlementTimeoutMs}`,
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

  private isMakerIntent(intent: StrategyOrderIntent): boolean {
    return this.resolveIntentRole(intent) === 'maker';
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

  private readMetadataNumber(
    intent: StrategyOrderIntent,
    key: string,
  ): number | undefined {
    if (!intent.metadata || typeof intent.metadata !== 'object') {
      return undefined;
    }

    const value = (intent.metadata as Record<string, unknown>)[key];
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : undefined;

    return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
  }

  private readMetadataBoolean(
    intent: StrategyOrderIntent,
    key: string,
  ): boolean | undefined {
    if (!intent.metadata || typeof intent.metadata !== 'object') {
      return undefined;
    }

    const value = (intent.metadata as Record<string, unknown>)[key];

    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
    }

    return undefined;
  }

  private oppositeSide(side: 'buy' | 'sell'): 'buy' | 'sell' {
    return side === 'buy' ? 'sell' : 'buy';
  }

  private async executeInlineDualAccountTaker(
    makerIntent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerPrice: string,
  ): Promise<boolean> {
    const takerAccountLabel = this.readMetadataString(
      makerIntent,
      'takerAccountLabel',
    );

    if (!takerAccountLabel) {
      throw new Error('Maker intent missing takerAccountLabel metadata');
    }

    const cycleId =
      this.readMetadataString(makerIntent, 'cycleId') || makerIntent.intentId;
    const tickId =
      this.readMetadataString(makerIntent, 'tickId') || makerIntent.createdAt;
    const makerDelayMs =
      this.readMetadataNumber(makerIntent, 'makerDelayMs') || 0;
    const buyCapacity = this.readMetadataString(makerIntent, 'buyCapacity');
    const sellCapacity = this.readMetadataString(makerIntent, 'sellCapacity');
    const capacityLimiter =
      this.readMetadataString(makerIntent, 'capacityLimiter') || 'unknown';
    const consecutiveFallbackCycles =
      this.readMetadataNumber(makerIntent, 'consecutiveFallbackCycles') || 0;
    const estimatedTotalFee =
      this.readMetadataString(makerIntent, 'estimatedTotalFee') || 'unknown';
    const netEdgeEstimate =
      this.readMetadataString(makerIntent, 'netEdgeEstimate') || 'unknown';
    const rebalanceNeeded =
      this.readMetadataBoolean(makerIntent, 'rebalanceNeeded') ?? false;
    const feeBufferRate =
      this.readMetadataString(makerIntent, 'feeBufferRate') || '0';
    const executionStartedAtMs = Date.now();

    if (makerDelayMs > 0) {
      this.logger.log(
        [
          'Dual-account taker waiting',
          `strategy=${makerIntent.strategyKey}`,
          `cycle=${cycleId}`,
          `tick=${tickId}`,
          `makerDelayMs=${makerDelayMs}`,
        ].join(' | '),
      );
      await this.sleep(makerDelayMs);
    }

    const quantizedMaker = this.exchangeConnectorAdapterService.quantizeOrder(
      makerIntent.exchange,
      makerIntent.pair,
      makerIntent.qty,
      makerPrice,
      makerIntent.accountLabel,
    );
    const makerPriceBn = new BigNumber(quantizedMaker.price);
    const verifyBestStartedAtMs = Date.now();
    const isMakerStillBest = await this.verifyMakerIsBest(
      makerIntent,
      makerPriceBn,
    );
    const verifyBestDurationMs = Date.now() - verifyBestStartedAtMs;

    if (!isMakerStillBest) {
      this.logger.warn(
        [
          'Dual-account taker skipped',
          `strategy=${makerIntent.strategyKey}`,
          `cycle=${cycleId}`,
          `tick=${tickId}`,
          `status=maker_not_best`,
          `makerSide=${makerIntent.side}`,
          `makerPrice=${quantizedMaker.price}`,
          `makerOrderId=${makerExchangeOrderId}`,
          `makerAccount=${makerIntent.accountLabel || 'default'}`,
          `takerAccount=${takerAccountLabel}`,
          `verifyBestDurationMs=${verifyBestDurationMs}`,
        ].join(' | '),
      );
      await this.cancelMakerAfterTakerFailure(
        makerIntent,
        makerExchangeOrderId,
        quantizedMaker.price,
      );

      return false;
    }

    const takerSide = this.oppositeSide(makerIntent.side);
    const takerIntent: StrategyOrderIntent = {
      ...makerIntent,
      intentId: `${makerIntent.intentId}:taker`,
      accountLabel: takerAccountLabel,
      side: takerSide,
      price: quantizedMaker.price,
      timeInForce: 'IOC',
      postOnly: false,
      metadata: {
        ...(makerIntent.metadata || {}),
        role: 'taker',
        cycleId,
        tickId,
        makerOrderId: makerExchangeOrderId,
      },
      status: 'NEW',
      createdAt: getRFC3339Timestamp(),
    };

    this.logger.log(
      [
        'Dual-account taker executing',
        `strategy=${makerIntent.strategyKey}`,
        `cycle=${cycleId}`,
        `tick=${tickId}`,
        `makerSide=${makerIntent.side}`,
        `takerSide=${takerSide}`,
        `qty=${takerIntent.qty}`,
        `price=${quantizedMaker.price}`,
        `makerOrderId=${makerExchangeOrderId}`,
        `makerAccount=${makerIntent.accountLabel || 'default'}`,
        `takerAccount=${takerAccountLabel}`,
        `makerDelayMs=${makerDelayMs}`,
        `verifyBestDurationMs=${verifyBestDurationMs}`,
      ].join(' | '),
    );

    try {
      const takerExecutionStartedAtMs = Date.now();
      const takerResult = await this.consumeIntent(takerIntent);
      const takerExecutionDurationMs = Date.now() - takerExecutionStartedAtMs;

      const takerExchangeOrderId =
        this.readOrderIdFromResult(takerResult) ||
        (await this.strategyIntentStoreService?.getMixinOrderId(
          takerIntent.intentId,
        ));
      let takerFilledQty = this.readFilledQtyFromResult(takerResult);
      if (takerExchangeOrderId) {
        try {
          const takerOrder =
            await this.exchangeConnectorAdapterService.fetchOrder(
              takerIntent.exchange,
              takerIntent.pair,
              takerExchangeOrderId,
              takerIntent.accountLabel,
            );
          takerFilledQty = this.readFilledQtyFromResult(takerOrder);
        } catch {
          // Best-effort: keep immediate ack fill, otherwise treat as unknown.
        }
      }

      const settlementStartedAtMs = Date.now();
      const makerSettled = await this.confirmDualAccountMakerSettlement(
        makerIntent,
        makerExchangeOrderId,
        quantizedMaker.price,
      );
      const settlementDurationMs = Date.now() - settlementStartedAtMs;
      const totalDurationMs = Date.now() - executionStartedAtMs;

      const takerRequestedQty = new BigNumber(takerIntent.qty);
      const takerFillRatio =
        takerFilledQty && takerRequestedQty.isGreaterThan(0)
          ? takerFilledQty.dividedBy(takerRequestedQty)
          : undefined;
      const takerSufficient = Boolean(
        takerFillRatio?.isGreaterThanOrEqualTo(0.95),
      );
      const actualFilledQty = takerFilledQty || takerRequestedQty;
      const actualLegNotional = actualFilledQty.multipliedBy(
        quantizedMaker.price,
      );
      const actualCampaignVolumeIncrement = actualLegNotional.multipliedBy(2);
      const actualNetEdge = actualLegNotional
        .multipliedBy(new BigNumber(feeBufferRate))
        .negated();
      const lossPerCampaignVolume = actualCampaignVolumeIncrement.isGreaterThan(
        0,
      )
        ? actualNetEdge.negated().dividedBy(actualCampaignVolumeIncrement)
        : new BigNumber(0);

      if (makerSettled && takerSufficient) {
        const actualQuoteVolume = takerFilledQty
          ? takerFilledQty.multipliedBy(quantizedMaker.price).toFixed()
          : undefined;
        await this.incrementCompletedCycles(
          makerIntent.strategyKey,
          actualQuoteVolume,
        );

        this.logger.log(
          [
            'Dual-account taker completed',
            `strategy=${makerIntent.strategyKey}`,
            `cycle=${cycleId}`,
            `tick=${tickId}`,
            'status=success',
            `makerSide=${makerIntent.side}`,
            `takerSide=${takerSide}`,
            `qty=${takerIntent.qty}`,
            `price=${quantizedMaker.price}`,
            `makerOrderId=${makerExchangeOrderId}`,
            `makerAccount=${makerIntent.accountLabel || 'default'}`,
            `takerAccount=${takerAccountLabel}`,
            `buyCapacity=${buyCapacity}`,
            `sellCapacity=${sellCapacity}`,
            `capacityLimiter=${capacityLimiter}`,
            `consecutiveFallbackCycles=${consecutiveFallbackCycles}`,
            `estimatedTotalFee=${estimatedTotalFee}`,
            `netEdgeEstimate=${netEdgeEstimate}`,
            `rebalanceNeeded=${rebalanceNeeded}`,
            `makerDelayMs=${makerDelayMs}`,
            `verifyBestDurationMs=${verifyBestDurationMs}`,
            `takerExecutionDurationMs=${takerExecutionDurationMs}`,
            `settlementDurationMs=${settlementDurationMs}`,
            `totalDurationMs=${totalDurationMs}`,
            `takerFilledQty=${takerFilledQty?.toFixed() || 'unknown'}`,
            `takerFillRatio=${takerFillRatio?.toFixed(4) || 'unknown'}`,
            `campaignVolumeIncrementActual=${actualCampaignVolumeIncrement.toFixed()}`,
            `actualNetEdge=${actualNetEdge.toFixed()}`,
            `lossPerCampaignVolume=${lossPerCampaignVolume.toFixed()}`,
          ].join(' | '),
        );

        return true;
      }

      if (makerSettled && !takerSufficient) {
        this.logger.warn(
          [
            'Dual-account taker partial fill',
            `strategy=${makerIntent.strategyKey}`,
            `cycle=${cycleId}`,
            `tick=${tickId}`,
            'status=taker_partial_fill',
            `takerFilledQty=${takerFilledQty?.toFixed() || 'unknown'}`,
            `takerRequestedQty=${takerRequestedQty.toFixed()}`,
            `takerFillRatio=${takerFillRatio?.toFixed(4) || 'unknown'}`,
            `makerOrderId=${makerExchangeOrderId}`,
            `totalDurationMs=${Date.now() - executionStartedAtMs}`,
          ].join(' | '),
        );

        return false;
      }

      this.logger.warn(
        [
          'Dual-account taker incomplete',
          `strategy=${makerIntent.strategyKey}`,
          `cycle=${cycleId}`,
          `tick=${tickId}`,
          'status=maker_unsettled',
          `makerOrderId=${makerExchangeOrderId}`,
          `makerSide=${makerIntent.side}`,
          `takerSide=${takerSide}`,
          `qty=${takerIntent.qty}`,
          `price=${quantizedMaker.price}`,
          `takerExecutionDurationMs=${takerExecutionDurationMs}`,
          `settlementDurationMs=${settlementDurationMs}`,
          `totalDurationMs=${totalDurationMs}`,
        ].join(' | '),
      );

      return false;
    } catch (error) {
      this.logger.warn(
        [
          'Dual-account taker failed',
          `strategy=${makerIntent.strategyKey}`,
          `cycle=${cycleId}`,
          `tick=${tickId}`,
          `makerOrderId=${makerExchangeOrderId}`,
          `makerSide=${makerIntent.side}`,
          `takerSide=${takerSide}`,
          `qty=${makerIntent.qty}`,
          `price=${quantizedMaker.price}`,
          `durationMs=${Date.now() - executionStartedAtMs}`,
          `error=${error instanceof Error ? error.message : String(error)}`,
        ].join(' | '),
      );
      await this.cancelMakerAfterTakerFailure(
        makerIntent,
        makerExchangeOrderId,
        quantizedMaker.price,
      );
      throw error;
    }
  }

  private async confirmDualAccountMakerSettlement(
    makerIntent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerPrice: string,
  ): Promise<boolean> {
    if (this.dualAccountMakerSettlementTimeoutMs > 0) {
      await this.sleep(this.dualAccountMakerSettlementTimeoutMs);
    }

    const trackedMaker = this.exchangeOrderTrackerService?.getByExchangeOrderId(
      makerIntent.exchange,
      makerExchangeOrderId,
      makerIntent.accountLabel,
    );

    if (this.isTrackedOrderTerminal(trackedMaker?.status)) {
      return trackedMaker?.status === 'filled';
    }

    try {
      const latest = await this.exchangeConnectorAdapterService.fetchOrder(
        makerIntent.exchange,
        makerIntent.pair,
        makerExchangeOrderId,
        makerIntent.accountLabel,
      );
      const normalizedStatus = this.normalizeTrackedOrderStatus(latest?.status);

      if (normalizedStatus) {
        this.exchangeOrderTrackerService?.upsertOrder({
          orderId: this.resolveOrderIdForClientOrderId(makerIntent),
          strategyKey: makerIntent.strategyKey,
          exchange: makerIntent.exchange,
          accountLabel: makerIntent.accountLabel,
          pair: makerIntent.pair,
          exchangeOrderId: makerExchangeOrderId,
          clientOrderId: trackedMaker?.clientOrderId,
          slotKey: makerIntent.slotKey,
          role: trackedMaker?.role || 'maker',
          side: makerIntent.side,
          price: makerPrice,
          qty: makerIntent.qty,
          cumulativeFilledQty:
            this.normalizeFilledValue(latest?.filled) ||
            trackedMaker?.cumulativeFilledQty,
          status: normalizedStatus,
          createdAt: trackedMaker?.createdAt || getRFC3339Timestamp(),
          updatedAt: getRFC3339Timestamp(),
        });

        if (normalizedStatus === 'filled') {
          return true;
        }
        if (this.isTrackedOrderTerminal(normalizedStatus)) {
          return false;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Dual-account maker settlement refresh failed for ${
          makerIntent.strategyKey
        }:${makerExchangeOrderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.logger.warn(
      `Dual-account maker remained live after ${this.dualAccountMakerSettlementTimeoutMs}ms settlement window for ${makerIntent.strategyKey}; cancelling maker ${makerExchangeOrderId}`,
    );
    await this.cancelMakerAfterTakerFailure(
      makerIntent,
      makerExchangeOrderId,
      makerPrice,
    );

    return false;
  }

  private async verifyMakerIsBest(
    makerIntent: StrategyOrderIntent,
    makerPrice: BigNumber,
  ): Promise<boolean> {
    try {
      const orderBook =
        await this.exchangeConnectorAdapterService.fetchOrderBook(
          makerIntent.exchange,
          makerIntent.pair,
        );

      if (makerIntent.side === 'buy') {
        const bestBid =
          Array.isArray(orderBook?.bids) && orderBook.bids.length > 0
            ? new BigNumber(orderBook.bids[0][0])
            : null;

        if (!bestBid || !makerPrice.isEqualTo(bestBid)) {
          this.logger.warn(
            `Maker buy @${makerPrice.toFixed()} is not best bid (bestBid=${
              bestBid?.toFixed() ?? 'none'
            }) for ${makerIntent.strategyKey}`,
          );

          return false;
        }
      } else {
        const bestAsk =
          Array.isArray(orderBook?.asks) && orderBook.asks.length > 0
            ? new BigNumber(orderBook.asks[0][0])
            : null;

        if (!bestAsk || !makerPrice.isEqualTo(bestAsk)) {
          this.logger.warn(
            `Maker sell @${makerPrice.toFixed()} is not best ask (bestAsk=${
              bestAsk?.toFixed() ?? 'none'
            }) for ${makerIntent.strategyKey}`,
          );

          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to verify maker best for ${makerIntent.strategyKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return false;
    }
  }

  private async cancelMakerAfterTakerFailure(
    makerIntent: StrategyOrderIntent,
    makerExchangeOrderId: string,
    makerPrice: string,
  ): Promise<void> {
    try {
      const result = await this.exchangeConnectorAdapterService.cancelOrder(
        makerIntent.exchange,
        makerIntent.pair,
        makerExchangeOrderId,
        makerIntent.accountLabel,
      );
      const status = String(result?.status || '').toLowerCase();

      this.exchangeOrderTrackerService?.upsertOrder({
        orderId: this.resolveOrderIdForClientOrderId(makerIntent),
        strategyKey: makerIntent.strategyKey,
        exchange: makerIntent.exchange,
        accountLabel: makerIntent.accountLabel,
        pair: makerIntent.pair,
        exchangeOrderId: makerExchangeOrderId,
        clientOrderId: undefined,
        slotKey: makerIntent.slotKey,
        role: 'maker',
        side: makerIntent.side,
        price: makerPrice,
        qty: makerIntent.qty,
        status:
          status === 'canceled' || status === 'cancelled'
            ? 'cancelled'
            : 'pending_cancel',
        createdAt: getRFC3339Timestamp(),
        updatedAt: getRFC3339Timestamp(),
      });
    } catch (cancelError) {
      const cancelMessage =
        cancelError instanceof Error
          ? cancelError.message
          : String(cancelError);
      const normalizedCancelMessage = cancelMessage.toLowerCase();

      if (
        normalizedCancelMessage.includes('code":-2011') ||
        normalizedCancelMessage.includes("code':-2011") ||
        normalizedCancelMessage.includes('order cancelled')
      ) {
        this.exchangeOrderTrackerService?.upsertOrder({
          orderId: this.resolveOrderIdForClientOrderId(makerIntent),
          strategyKey: makerIntent.strategyKey,
          exchange: makerIntent.exchange,
          accountLabel: makerIntent.accountLabel,
          pair: makerIntent.pair,
          exchangeOrderId: makerExchangeOrderId,
          clientOrderId: undefined,
          slotKey: makerIntent.slotKey,
          role: 'maker',
          side: makerIntent.side,
          price: makerPrice,
          qty: makerIntent.qty,
          status: 'cancelled',
          createdAt: getRFC3339Timestamp(),
          updatedAt: getRFC3339Timestamp(),
        });

        return;
      }

      this.logger.warn(
        `Best-effort dual-account maker cancel failed for ${makerIntent.strategyKey}:${makerExchangeOrderId}: ${cancelMessage}`,
      );
    }
  }

  private async incrementCompletedCycles(
    strategyKey: string,
    tradedQuoteVolume?: string,
  ): Promise<void> {
    if (!this.strategyInstanceRepository) {
      return;
    }

    const strategyInstance = await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });

    if (!strategyInstance) {
      return;
    }

    const parameters = {
      ...(strategyInstance.parameters || {}),
      completedCycles:
        Number(strategyInstance.parameters?.completedCycles || 0) + 1,
      tradedQuoteVolume: tradedQuoteVolume
        ? new BigNumber(strategyInstance.parameters?.tradedQuoteVolume || 0)
            .plus(tradedQuoteVolume)
            .toFixed()
        : strategyInstance.parameters?.tradedQuoteVolume,
    };

    await this.strategyInstanceRepository.update(
      { strategyKey },
      {
        parameters: parameters as Record<string, any>,
        updatedAt: new Date(),
      },
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

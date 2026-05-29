import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import { ExchangeOrderMappingService } from '../../execution/exchange-order-mapping.service';
import { BalanceLedgerService } from '../../ledger/balance-ledger.service';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from '../../trackers/exchange-order-tracker.service';
import { TrackedOrderShutdownService } from '../../trackers/tracked-order-shutdown.service';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';

export type StartupRecoveryResult = {
  success: boolean;
  blockedReasons: string[];
};

@Injectable()
export class StrategyStartupRecoveryService {
  private readonly logger = new CustomLogger(
    StrategyStartupRecoveryService.name,
  );

  constructor(
    private readonly strategyIntentStoreService: StrategyIntentStoreService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly exchangeOrderMappingService: ExchangeOrderMappingService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly trackedOrderShutdownService?: TrackedOrderShutdownService,
  ) {}

  private getTrackedOrderShutdown(): TrackedOrderShutdownService {
    return (
      this.trackedOrderShutdownService ||
      new TrackedOrderShutdownService(
        this.exchangeOrderTrackerService,
        this.exchangeConnectorAdapterService,
        this.exchangeOrderMappingService,
      )
    );
  }

  async restoreDualAccountVolumeRuntimeState(
    strategy: StrategyInstance,
  ): Promise<void> {
    const trackedOrders = this.getTrackedOrderShutdown().getCancelableTrackedOrders(
      strategy.strategyKey,
    );

    const danglingMakerOrders = trackedOrders.filter(
      (order) => order.role === 'maker',
    );

    if (danglingMakerOrders.length === 0) {
      return;
    }

    await Promise.all(
      danglingMakerOrders.map(async (order) => {
        try {
          const result =
            await this.exchangeConnectorAdapterService?.cancelOrder(
              order.exchange,
              order.pair,
              order.exchangeOrderId,
              order.accountLabel,
            );
          const cancelSucceeded = this.getTrackedOrderShutdown().isCancelResultFinal(result);

          this.exchangeOrderTrackerService?.upsertOrder({
            ...order,
            status: cancelSucceeded ? 'cancelled' : 'pending_cancel',
            updatedAt: getRFC3339Timestamp(),
          });
        } catch (error) {
          this.logger.warn(
            `Failed dual-account startup maker cleanup for ${
              strategy.strategyKey
            }:${order.exchangeOrderId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );

    await this.getTrackedOrderShutdown().waitForTrackedOrdersToSettle(strategy.strategyKey, 10_000);
  }

  async restoreRuntimeStateForStrategy(
    strategy: StrategyInstance,
  ): Promise<StartupRecoveryResult> {
    const result: StartupRecoveryResult = {
      success: true,
      blockedReasons: [],
    };

    if (
      strategy.strategyType === 'dualAccountVolume' ||
      strategy.strategyType === 'dualAccountBestCapacityVolume'
    ) {
      await this.restoreDualAccountVolumeRuntimeState(strategy);

      return result;
    }

    if (
      strategy.strategyType !== 'pureMarketMaking' ||
      !this.exchangeConnectorAdapterService
    ) {
      return result;
    }

    const params = strategy.parameters as PureMarketMakingStrategyDto;
    const exchange = this.readString(params.exchangeName);
    const pair = this.readString(params.pair);

    if (!exchange || !pair) {
      return result;
    }

    let openOrders: any[] = [];

    try {
      openOrders = await this.exchangeConnectorAdapterService.fetchOpenOrders(
        exchange,
        pair,
        params.accountLabel,
      );
    } catch (error) {
      const { message } = this.toErrorDetails(error);

      this.logger.warn(
        `Startup reconciliation skipped for ${strategy.strategyKey}: fetchOpenOrders failed (${message})`,
      );

      return {
        success: false,
        blockedReasons: [`fetchOpenOrders failed: ${message}`],
      };
    }

    const trackedOrders = (((
      this.exchangeOrderTrackerService as any
    )?.getTrackedOrders?.(strategy.strategyKey) as TrackedOrder[]) ||
      []) as TrackedOrder[];
    const trackedByExchangeOrderId = new Map(
      trackedOrders.map((order) => [order.exchangeOrderId, order]),
    );
    const seenOpenExchangeOrderIds = new Set<string>();

    for (const openOrder of openOrders) {
      const exchangeOrderId = this.readString(openOrder?.id);
      const clientOrderId = this.readString(
        openOrder?.clientOrderId || openOrder?.clientOid,
      );

      if (!exchangeOrderId) {
        continue;
      }

      seenOpenExchangeOrderIds.add(exchangeOrderId);

      const trackedOrder = trackedByExchangeOrderId.get(exchangeOrderId);

      if (trackedOrder) {
        this.exchangeOrderTrackerService?.upsertOrder({
          ...trackedOrder,
          clientOrderId: clientOrderId || trackedOrder.clientOrderId,
          price: this.readString(openOrder?.price, trackedOrder.price),
          qty: this.readString(
            openOrder?.amount || openOrder?.qty,
            trackedOrder.qty,
          ),
          cumulativeFilledQty: this.readString(
            openOrder?.filled,
            trackedOrder.cumulativeFilledQty || '0',
          ),
          status:
            this.getTrackedOrderShutdown().normalizeExchangeOrderStatus(openOrder?.status) ||
            trackedOrder.status,
          updatedAt: getRFC3339Timestamp(),
        });
        continue;
      }

      if (
        !(await this.getTrackedOrderShutdown().isOrderOwnedByStrategy(
          strategy,
          clientOrderId,
          exchangeOrderId,
        ))
      ) {
        continue;
      }

      const mappedRecovery = await this.restoreMappedOpenOrder(
        strategy,
        exchange,
        pair,
        exchangeOrderId,
        clientOrderId,
        openOrder,
        params.accountLabel,
      );

      if (mappedRecovery.status === 'restored') {
        continue;
      }

      if (mappedRecovery.status === 'blocked') {
        result.success = false;
        result.blockedReasons.push(mappedRecovery.reason);
        continue;
      }

      await this.getTrackedOrderShutdown().cancelRecoveredExchangeOrder(
        strategy,
        exchange,
        pair,
        exchangeOrderId,
        clientOrderId,
        openOrder,
        params.accountLabel,
      );
    }

    for (const trackedOrder of trackedOrders) {
      if (
        this.getTrackedOrderShutdown().isTrackedOrderTerminal(trackedOrder.status) ||
        seenOpenExchangeOrderIds.has(trackedOrder.exchangeOrderId)
      ) {
        continue;
      }

      try {
        const latest: Awaited<
          ReturnType<ExchangeConnectorAdapterService['fetchOrder']>
        > = await this.exchangeConnectorAdapterService.fetchOrder(
          trackedOrder.exchange,
          trackedOrder.pair,
          trackedOrder.exchangeOrderId,
          trackedOrder.accountLabel,
        );

        if (!latest) {
          continue;
        }

        this.exchangeOrderTrackerService?.upsertOrder({
          ...trackedOrder,
          clientOrderId:
            this.readString(latest?.clientOrderId || latest?.clientOid) ||
            trackedOrder.clientOrderId,
          price: this.readString(latest?.price, trackedOrder.price),
          qty: this.readString(latest?.amount || latest?.qty, trackedOrder.qty),
          cumulativeFilledQty: this.readString(
            latest?.filled,
            trackedOrder.cumulativeFilledQty || '0',
          ),
          status:
            this.getTrackedOrderShutdown().normalizeExchangeOrderStatus(latest?.status) ||
            trackedOrder.status,
          updatedAt: getRFC3339Timestamp(),
        });
      } catch (error) {
        const { message } = this.toErrorDetails(error);

        this.logger.warn(
          `Startup fetchOrder reconciliation skipped for ${trackedOrder.exchangeOrderId}: ${message}`,
        );
      }
    }

    try {
      const createRecovery =
        await this.recoverInterruptedCreateIntentReservations(
          strategy,
          openOrders,
        );

      if (!createRecovery.success) {
        result.success = false;
        result.blockedReasons.push(...createRecovery.blockedReasons);
      }
    } catch (error) {
      const reason = `interrupted create intent recovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.success = false;
      result.blockedReasons.push(reason);
      this.logger.warn(
        `Startup interrupted intent recovery skipped for ${strategy.strategyKey}: ${reason}`,
      );
    }

    try {
      const cancelRecovery =
        await this.recoverInterruptedCancelIntentsForStrategy(
          strategy,
          openOrders,
        );

      if (!cancelRecovery.success) {
        result.success = false;
        result.blockedReasons.push(...cancelRecovery.blockedReasons);
      }
    } catch (error) {
      const reason = `interrupted cancel intent recovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.success = false;
      result.blockedReasons.push(reason);
      this.logger.warn(
        `Startup interrupted cancel recovery skipped for ${strategy.strategyKey}: ${reason}`,
      );
    }

    return result;
  }

  async recoverInterruptedCreateIntentReservations(
    strategy: StrategyInstance,
    openOrders: any[],
  ): Promise<StartupRecoveryResult> {
    const result: StartupRecoveryResult = {
      success: true,
      blockedReasons: [],
    };
    const strategyOrderId = this.readString(
      strategy.marketMakingOrderId,
      strategy.clientId,
    );

    if (!strategyOrderId) {
      return result;
    }

    const interruptedIntents =
      await this.strategyIntentStoreService.listInterruptedCreateIntents(
        strategy.strategyKey,
      );

    if (interruptedIntents.length === 0) {
      return result;
    }

    const claimedOpenOrderIds = new Set<string>();

    for (const intent of interruptedIntents) {
      const matchedOpenOrder = await this.findOpenOrderForCreateIntent(
        strategyOrderId,
        intent,
        openOrders,
        claimedOpenOrderIds,
      );

      if (matchedOpenOrder) {
        const exchangeOrderId = this.readString(matchedOpenOrder?.id);
        const clientOrderId = this.readString(
          matchedOpenOrder?.clientOrderId || matchedOpenOrder?.clientOid,
        );

        if (!exchangeOrderId) {
          result.success = false;
          result.blockedReasons.push(
            `open order matched ${intent.intentId} without exchange order id`,
          );
          continue;
        }

        claimedOpenOrderIds.add(exchangeOrderId);
        await this.restoreCreateIntentOpenOrder(
          strategyOrderId,
          strategy,
          intent,
          matchedOpenOrder,
          exchangeOrderId,
          clientOrderId,
        );
        continue;
      }

      const reservation = this.calculateLimitOrderReservation(
        intent.pair,
        intent.side as 'buy' | 'sell',
        intent.price,
        intent.qty,
      );

      if (!reservation) {
        continue;
      }

      try {
        await this.balanceLedgerService.unlockFunds({
          orderId: strategyOrderId,
          userId: intent.userId,
          assetId: reservation.assetId,
          amount: reservation.amount,
          idempotencyKey: `reserve-release:${intent.intentId}:interrupted_intent_recovery`,
          refType: 'interrupted_intent_recovery',
          refId: intent.intentId,
        });
        await this.strategyIntentStoreService.updateIntentStatus(
          intent.intentId,
          'CANCELLED',
          'interrupted create intent recovered on startup',
        );
        this.logger.warn(
          `Recovered interrupted create intent ${intent.intentId} for ${strategy.strategyKey} by releasing its reservation`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed interrupted intent recovery for ${intent.intentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        result.success = false;
        result.blockedReasons.push(
          `failed to release interrupted create reservation ${intent.intentId}`,
        );
      }
    }

    return result;
  }

  private async findOpenOrderForCreateIntent(
    strategyOrderId: string,
    intent: StrategyOrderIntentEntity,
    openOrders: any[],
    claimedOpenOrderIds: Set<string>,
  ): Promise<any | null> {
    for (const openOrder of openOrders) {
      const exchangeOrderId = this.readString(openOrder?.id);

      if (!exchangeOrderId || claimedOpenOrderIds.has(exchangeOrderId)) {
        continue;
      }

      const clientOrderId = this.readString(
        openOrder?.clientOrderId || openOrder?.clientOid,
      );

      if (intent.mixinOrderId && exchangeOrderId === intent.mixinOrderId) {
        return openOrder;
      }

      if (
        !(await this.isOrderOwnedByStrategy(
          strategyOrderId,
          clientOrderId,
          exchangeOrderId,
        ))
      ) {
        continue;
      }

      if (this.openOrderMatchesIntent(openOrder, intent)) {
        return openOrder;
      }
    }

    return null;
  }

  private async restoreCreateIntentOpenOrder(
    strategyOrderId: string,
    strategy: StrategyInstance,
    intent: StrategyOrderIntentEntity,
    openOrder: any,
    exchangeOrderId: string,
    clientOrderId: string,
  ): Promise<void> {
    if (clientOrderId) {
      await this.exchangeOrderMappingService.createMapping({
        orderId: strategyOrderId,
        exchangeOrderId,
        clientOrderId,
      });
    }

    if (!intent.mixinOrderId) {
      await this.strategyIntentStoreService.attachMixinOrderId(
        intent.intentId,
        exchangeOrderId,
      );
    }

    this.exchangeOrderTrackerService?.upsertOrder({
      orderId: strategyOrderId,
      strategyKey: strategy.strategyKey,
      exchange: intent.exchange,
      accountLabel: intent.accountLabel,
      pair: intent.pair,
      exchangeOrderId,
      clientOrderId: clientOrderId || undefined,
      slotKey: intent.slotKey,
      side: intent.side === 'sell' ? 'sell' : 'buy',
      price: this.readString(openOrder?.price, intent.price) || intent.price,
      qty:
        this.readString(openOrder?.amount || openOrder?.qty, intent.qty) ||
        intent.qty,
      cumulativeFilledQty: this.readString(openOrder?.filled, '0') || '0',
      status: this.normalizeExchangeOrderStatus(openOrder?.status),
      createdAt: intent.createdAt || getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });

    await this.strategyIntentStoreService.updateIntentStatus(
      intent.intentId,
      'DONE',
      'interrupted create intent restored on startup',
    );
    this.logger.warn(
      `Restored interrupted create intent ${intent.intentId} for ${strategy.strategyKey} as open order ${exchangeOrderId}`,
    );
  }

  private openOrderMatchesIntent(
    openOrder: any,
    intent: StrategyOrderIntentEntity,
  ): boolean {
    const side = String(openOrder?.side || '').toLowerCase();

    if (side && side !== String(intent.side || '').toLowerCase()) {
      return false;
    }

    return (
      this.quantityMatches(openOrder?.price, intent.price) &&
      this.quantityMatches(openOrder?.amount || openOrder?.qty, intent.qty)
    );
  }

  async restoreMappedOpenOrder(
    strategy: StrategyInstance,
    exchange: string,
    pair: string,
    exchangeOrderId: string,
    clientOrderId: string,
    openOrder: Record<string, any>,
    accountLabel?: string,
  ): Promise<
    | { status: 'restored' }
    | { status: 'not_owned' }
    | { status: 'blocked'; reason: string }
  > {
    if (!clientOrderId) {
      return { status: 'not_owned' };
    }

    const mapping = await this.exchangeOrderMappingService.findByClientOrderId(
      clientOrderId,
    );
    const strategyOrderId = this.readString(
      strategy.marketMakingOrderId,
      strategy.clientId,
    );

    if (!mapping || mapping.orderId !== strategyOrderId) {
      return { status: 'not_owned' };
    }

    const sourceIntent = await this.findCreateIntentForOpenOrder(
      strategy.strategyKey,
      openOrder,
    );

    if (!sourceIntent?.slotKey) {
      return {
        status: 'blocked',
        reason: `mapped open order ${exchangeOrderId} is missing recoverable slot metadata`,
      };
    }

    await this.exchangeOrderMappingService.createMapping({
      orderId: strategyOrderId,
      exchangeOrderId,
      clientOrderId,
    });

    this.exchangeOrderTrackerService?.upsertOrder({
      orderId: strategyOrderId,
      strategyKey: strategy.strategyKey,
      exchange,
      accountLabel,
      pair,
      exchangeOrderId,
      clientOrderId,
      slotKey: sourceIntent.slotKey,
      side: openOrder?.side === 'sell' ? 'sell' : 'buy',
      price: this.readString(openOrder?.price, sourceIntent.price),
      qty: this.readString(
        openOrder?.amount || openOrder?.qty,
        sourceIntent.qty,
      ),
      cumulativeFilledQty: this.readString(openOrder?.filled, '0'),
      status: this.normalizeExchangeOrderStatus(openOrder?.status) || 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });

    return { status: 'restored' };
  }

  async recoverInterruptedCancelIntentsForStrategy(
    strategy: StrategyInstance,
    openOrders: any[],
  ): Promise<StartupRecoveryResult> {
    const result: StartupRecoveryResult = {
      success: true,
      blockedReasons: [],
    };
    const intents =
      await this.strategyIntentStoreService.listInterruptedCancelIntents(
        strategy.strategyKey,
      );

    for (const intent of intents) {
      const exchangeOrderId = this.readString(intent.mixinOrderId);

      if (!exchangeOrderId) {
        await this.strategyIntentStoreService.updateIntentStatus(
          intent.intentId,
          'CANCELLED',
          'interrupted cancel intent missing exchange order id',
        );
        continue;
      }

      const openOrder = openOrders.find(
        (order) => this.readString(order?.id) === exchangeOrderId,
      );

      if (openOrder) {
        try {
          await this.retryOpenCancelIntent(strategy, intent, openOrder);
        } catch (error) {
          result.success = false;
          result.blockedReasons.push(
            `failed to recover cancel intent ${intent.intentId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        continue;
      }

      await this.reconcileMissingCancelIntent(strategy, intent, result);
    }

    return result;
  }

  private async findCreateIntentForOpenOrder(
    strategyKey: string,
    openOrder: Record<string, any>,
  ): Promise<StrategyOrderIntentEntity | undefined> {
    const intents = await this.strategyIntentStoreService.listAll();
    const side = String(openOrder?.side || '').toLowerCase();

    return intents.find((intent) => {
      if (
        intent.strategyKey !== strategyKey ||
        intent.type !== 'CREATE_LIMIT_ORDER'
      ) {
        return false;
      }
      if (side && side !== String(intent.side || '').toLowerCase()) {
        return false;
      }

      return (
        this.quantityMatches(openOrder?.price, intent.price) &&
        this.quantityMatches(openOrder?.amount || openOrder?.qty, intent.qty)
      );
    });
  }

  private async retryOpenCancelIntent(
    strategy: StrategyInstance,
    intent: StrategyOrderIntentEntity,
    openOrder: any,
  ): Promise<void> {
    const exchangeOrderId = this.readString(intent.mixinOrderId);
    const cancelResult = await this.exchangeConnectorAdapterService?.cancelOrder(
      intent.exchange,
      intent.pair,
      exchangeOrderId,
      intent.accountLabel,
    );
    const cancelSucceeded = this.isCancelResultFinal(
      cancelResult as Record<string, unknown> | undefined,
    );

    this.upsertCancelRecoveryTrackedOrder(
      strategy,
      intent,
      exchangeOrderId,
      openOrder,
      cancelSucceeded ? 'cancelled' : 'pending_cancel',
    );

    if (cancelSucceeded) {
      await this.strategyIntentStoreService.updateIntentStatus(
        intent.intentId,
        'DONE',
        'interrupted cancel intent completed on startup',
      );
    }
  }

  private async reconcileMissingCancelIntent(
    strategy: StrategyInstance,
    intent: StrategyOrderIntentEntity,
    result: StartupRecoveryResult,
  ): Promise<void> {
    const exchangeOrderId = this.readString(intent.mixinOrderId);

    try {
      const latest = await this.exchangeConnectorAdapterService?.fetchOrder(
        intent.exchange,
        intent.pair,
        exchangeOrderId,
        intent.accountLabel,
      );
      const latestStatus = this.normalizeExchangeOrderStatus(latest?.status);

      if (latestStatus === 'cancelled' || latestStatus === 'filled') {
        this.upsertCancelRecoveryTrackedOrder(
          strategy,
          intent,
          exchangeOrderId,
          latest,
          latestStatus,
        );
        await this.strategyIntentStoreService.updateIntentStatus(
          intent.intentId,
          'DONE',
          'interrupted cancel intent reconciled on startup',
        );
        return;
      }

      result.success = false;
      result.blockedReasons.push(
        `cancel intent ${intent.intentId} has unresolved exchange status`,
      );
    } catch (error) {
      result.success = false;
      result.blockedReasons.push(
        `failed to fetch cancel intent ${intent.intentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private upsertCancelRecoveryTrackedOrder(
    strategy: StrategyInstance,
    intent: StrategyOrderIntentEntity,
    exchangeOrderId: string,
    order: any,
    status: TrackedOrder['status'],
  ): void {
    this.exchangeOrderTrackerService?.upsertOrder({
      orderId: this.readString(strategy.marketMakingOrderId, strategy.clientId),
      strategyKey: strategy.strategyKey,
      exchange: intent.exchange,
      accountLabel: intent.accountLabel,
      pair: intent.pair,
      exchangeOrderId,
      clientOrderId: this.readString(order?.clientOrderId || order?.clientOid),
      slotKey: intent.slotKey,
      side: intent.side === 'sell' ? 'sell' : 'buy',
      price: this.readString(order?.price, intent.price),
      qty: this.readString(order?.amount || order?.qty, intent.qty),
      cumulativeFilledQty: this.readString(order?.filled, '0'),
      status,
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });
  }

  private isCancelResultFinal(result: Record<string, unknown> | undefined) {
    const status = String(result?.status || '').toLowerCase();

    return (
      !status || !['new', 'open', 'pending', 'pending_cancel'].includes(status)
    );
  }

  private quantityMatches(left: unknown, right: unknown): boolean {
    const leftValue = new BigNumber(String(left ?? ''));
    const rightValue = new BigNumber(String(right ?? ''));

    if (!leftValue.isFinite() || !rightValue.isFinite()) {
      return false;
    }

    return leftValue.minus(rightValue).abs().isLessThanOrEqualTo('0.00000001');
  }

  private normalizeExchangeOrderStatus(
    status: unknown,
  ): TrackedOrder['status'] | null {
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

  private async isOrderOwnedByStrategy(
    strategyOrderId: string,
    clientOrderId: string,
    exchangeOrderId: string,
  ): Promise<boolean> {
    if (clientOrderId) {
      const byClientOrderId =
        await this.exchangeOrderMappingService.findByClientOrderId(
          clientOrderId,
        );

      if (byClientOrderId?.orderId === strategyOrderId) {
        return true;
      }
    }

    if (exchangeOrderId) {
      const byExchangeOrderId =
        await this.exchangeOrderMappingService.findByExchangeOrderId(
          exchangeOrderId,
        );

      if (byExchangeOrderId?.orderId === strategyOrderId) {
        return true;
      }
    }

    return false;
  }

  private calculateLimitOrderReservation(
    pair: string,
    side: 'buy' | 'sell',
    priceValue: string,
    qtyValue: string,
  ): { assetId: string; amount: string } | null {
    const [baseAssetId, quoteAssetId] = String(pair || '').split('/');

    if (!baseAssetId || !quoteAssetId) {
      return null;
    }

    const qty = new BigNumber(qtyValue);
    const price = new BigNumber(priceValue);

    if (
      !qty.isFinite() ||
      qty.isLessThanOrEqualTo(0) ||
      !price.isFinite() ||
      price.isLessThanOrEqualTo(0)
    ) {
      return null;
    }

    if (side === 'sell') {
      return { assetId: baseAssetId, amount: qty.toFixed() };
    }

    return {
      assetId: quoteAssetId,
      amount: qty.multipliedBy(price).toFixed(),
    };
  }

  private readString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return '';
  }

  private toErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }

    return { message: String(error) };
  }
}

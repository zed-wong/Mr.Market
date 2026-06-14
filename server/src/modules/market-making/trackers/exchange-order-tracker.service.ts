import {
  Injectable,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { resolveLedgerOrderScope } from 'src/common/helpers/ledger-order-scope';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { OrderReservationService } from '../ledger/order-reservation.service';
import { ExchangePairExecutor } from '../strategy/execution/exchange-pair-executor';
import { ExecutorRegistry } from '../strategy/execution/executor-registry';
import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';

export type TrackedOrderState =
  | 'pending_create'
  | 'open'
  | 'partially_filled'
  | 'pending_cancel'
  | 'filled'
  | 'cancelled'
  | 'failed'
  | 'external_missing'
  | 'internal_missing';

export type TrackedOrder = {
  orderId: string;
  userOrderId?: string;
  strategyKey: string;
  exchange: string;
  accountLabel?: string;
  pair: string;
  exchangeOrderId: string;
  clientOrderId?: string;
  slotKey?: string;
  role?: 'maker' | 'taker' | 'rebalance';
  side: 'buy' | 'sell';
  price: string;
  qty: string;
  cumulativeFilledQty?: string;
  settledFilledQty?: string;
  status: TrackedOrderState;
  createdAt: string;
  updatedAt: string;
};

export type TrackedOrderSummary = {
  totalOrders: number;
  sampledOrders: number;
  byStatus: Record<string, number>;
  sample: TrackedOrder[];
  truncated: boolean;
};

export type UpsertTrackedOrderOptions = {
  releaseReservation?: boolean;
  settleFill?: boolean;
};

type FillLogEntry = {
  ts: string;
  side: string;
  qty: string;
};

@Injectable()
export class ExchangeOrderTrackerService implements OnModuleInit {
  private readonly logger = new CustomLogger(ExchangeOrderTrackerService.name);
  private static readonly terminalStates = new Set<TrackedOrderState>([
    'filled',
    'cancelled',
    'failed',
    'external_missing',
  ]);
  private static readonly validTransitions: Record<
    TrackedOrderState,
    TrackedOrderState[]
  > = {
    pending_create: [
      'open',
      'partially_filled',
      'filled',
      'cancelled',
      'failed',
    ],
    open: [
      'partially_filled',
      'pending_cancel',
      'filled',
      'cancelled',
      'failed',
    ],
    partially_filled: [
      'partially_filled',
      'pending_cancel',
      'filled',
      'cancelled',
    ],
    pending_cancel: ['partially_filled', 'filled', 'cancelled', 'failed'],
    filled: [],
    cancelled: [],
    failed: [],
    external_missing: [],
    internal_missing: [
      'pending_create',
      'open',
      'partially_filled',
      'filled',
      'cancelled',
      'failed',
    ],
  };
  private static readonly STREAM_HEALTHY_THRESHOLD_MS = 30_000;
  private static readonly SLOW_POLL_INTERVAL_MS = 120_000;
  private static readonly FAST_POLL_INTERVAL_MS = 5_000;
  static readonly DEFAULT_RECONCILIATION_BUDGET = 4;
  static readonly DEFAULT_PER_EXCHANGE_RECONCILIATION_BUDGET = 2;
  private static readonly SUMMARY_SAMPLE_KEY_LIMIT = 1000;

  private readonly orders = new Map<string, TrackedOrder>();
  private readonly fillLog = new Map<string, FillLogEntry[]>();
  private readonly lastUserStreamActivityByKey = new Map<string, number>();
  private readonly lastPolledAtByOrderKey = new Map<string, number>();
  private readonly fillSettlementDispatches = new Set<string>();
  private readonly trackedOrderStatusCounts = new Map<
    TrackedOrderState,
    number
  >();
  private readonly trackedOrderSampleKeys: string[] = [];

  constructor(
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly executorRegistry?: ExecutorRegistry,
    @Optional()
    @InjectRepository(TrackedOrderEntity)
    private readonly trackedOrderRepository?: Repository<TrackedOrderEntity>,
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository?: Repository<MarketMakingOrder>,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
    @Optional()
    private readonly orderReservationService?: OrderReservationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.hydratePersistedOrders();
  }

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    return;
  }

  async health(): Promise<boolean> {
    return true;
  }

  upsertOrder(order: TrackedOrder, options?: UpsertTrackedOrderOptions): void {
    const key = this.toOrderKey(order);
    const existingOrder = this.orders.get(key);

    if (existingOrder) {
      const nextStatus = this.resolveNextStatus(existingOrder, order);

      if (!nextStatus) {
        return;
      }

      const nextOrder = this.mergeOrder(existingOrder, order, nextStatus);

      this.setTrackedOrder(key, nextOrder);
      this.updatePollingStateForOrder(key, nextOrder.status);
      void this.persistOrder(nextOrder, key).catch(() => {});
      if (options?.releaseReservation !== false) {
        this.releaseReservationForTerminalOrder(existingOrder, nextOrder);
      }
      if (options?.settleFill !== false) {
        this.dispatchUnsettledFillSettlement(nextOrder);
      }

      return;
    }

    const createdOrder = {
      ...order,
      userOrderId:
        order.userOrderId ||
        resolveLedgerOrderScope({
          ledgerOrderId: order.orderId,
          accountLabel: order.accountLabel,
        }).userOrderId,
      createdAt: order.createdAt || order.updatedAt,
      cumulativeFilledQty: this.normalizeCumulativeFilledQty(
        order.cumulativeFilledQty,
      ),
      settledFilledQty: this.normalizeCumulativeFilledQty(
        order.settledFilledQty,
      ),
    };

    this.setTrackedOrder(key, createdOrder);
    this.updatePollingStateForOrder(key, createdOrder.status);
    void this.persistOrder(createdOrder, key).catch(() => {});
    if (options?.releaseReservation !== false) {
      this.releaseReservationForTerminalOrder(undefined, createdOrder);
    }
    if (options?.settleFill !== false) {
      this.dispatchUnsettledFillSettlement(createdOrder);
    }
  }

  getLiveOrders(strategyKey: string): TrackedOrder[] {
    return [...this.orders.values()].filter(
      (order) =>
        order.strategyKey === strategyKey &&
        (order.status === 'open' || order.status === 'partially_filled'),
    );
  }

  getActiveSlotOrders(strategyKey: string): TrackedOrder[] {
    return [...this.orders.values()].filter(
      (order) =>
        order.strategyKey === strategyKey &&
        (order.status === 'pending_create' ||
          order.status === 'open' ||
          order.status === 'partially_filled' ||
          order.status === 'pending_cancel'),
    );
  }

  getOpenOrders(strategyKey: string): TrackedOrder[] {
    return this.getLiveOrders(strategyKey);
  }

  getTrackedOrders(strategyKey: string): TrackedOrder[] {
    return [...this.orders.values()].filter(
      (order) => order.strategyKey === strategyKey,
    );
  }

  getAllTrackedOrders(): TrackedOrder[] {
    return [...this.orders.values()];
  }

  getTrackedOrderSummary(sampleLimit = 100): TrackedOrderSummary {
    const boundedSampleLimit = Math.max(
      0,
      Math.min(Number.isSafeInteger(sampleLimit) ? sampleLimit : 0, 1000),
    );
    const sample: TrackedOrder[] = [];

    for (const key of this.trackedOrderSampleKeys) {
      if (sample.length >= boundedSampleLimit) {
        break;
      }

      const order = this.orders.get(key);

      if (order) {
        sample.push(order);
      }
    }

    const totalOrders = this.orders.size;

    return {
      totalOrders,
      sampledOrders: sample.length,
      byStatus: this.getTrackedOrderStatusSnapshot(),
      sample,
      truncated: totalOrders > sample.length,
    };
  }

  removeTrackedOrder(
    exchange: string,
    exchangeOrderId: string,
    accountLabel?: string,
  ): boolean {
    const key = this.toKey(exchange, accountLabel, exchangeOrderId);
    const existingOrder = this.orders.get(key);

    if (!existingOrder) {
      return false;
    }

    this.orders.delete(key);
    this.lastPolledAtByOrderKey.delete(key);
    this.decrementTrackedOrderStatus(existingOrder.status);

    const sampleIndex = this.trackedOrderSampleKeys.indexOf(key);

    if (sampleIndex >= 0) {
      this.trackedOrderSampleKeys.splice(sampleIndex, 1);
    }

    return true;
  }

  reconcileOpenOrderSnapshot(params: {
    exchange: string;
    pair: string;
    accountLabel?: string;
    openOrders: Array<Record<string, unknown>>;
    observedAt?: string;
  }): { internalMissing: string[]; externalMissing: string[] } {
    const observedAt = params.observedAt || getRFC3339Timestamp();
    const externalIds = new Set(
      params.openOrders
        .map((order) => this.extractExchangeOrderId(order))
        .filter((id): id is string => Boolean(id)),
    );
    const internalMissing: string[] = [];
    const externalMissing: string[] = [];

    for (const externalOrder of params.openOrders) {
      const exchangeOrderId = this.extractExchangeOrderId(externalOrder);

      if (!exchangeOrderId) {
        continue;
      }

      const key = this.toKey(
        params.exchange,
        params.accountLabel,
        exchangeOrderId,
      );

      if (this.orders.has(key)) {
        continue;
      }

      const placeholder: TrackedOrder = {
        orderId: `internal_missing:${exchangeOrderId}`,
        strategyKey: `internal_missing:${params.exchange}:${
          params.accountLabel || 'default'
        }:${params.pair}`,
        exchange: params.exchange,
        accountLabel: params.accountLabel,
        pair: params.pair,
        exchangeOrderId,
        clientOrderId: this.extractOptionalString(
          externalOrder.clientOrderId || externalOrder.clientOrderID,
        ),
        side: this.normalizeExternalSide(externalOrder.side),
        price: this.extractOptionalString(externalOrder.price) || '0',
        qty:
          this.extractOptionalString(
            externalOrder.amount || externalOrder.qty || externalOrder.quantity,
          ) || '0',
        cumulativeFilledQty: this.normalizeCumulativeFilledQty(
          externalOrder.filled,
        ),
        status: 'internal_missing',
        createdAt: observedAt,
        updatedAt: observedAt,
      };

      this.setTrackedOrder(key, placeholder);
      void this.persistOrder(placeholder, key).catch(() => {});
      internalMissing.push(exchangeOrderId);
    }

    for (const order of this.orders.values()) {
      if (
        order.exchange !== params.exchange ||
        order.pair !== params.pair ||
        (order.accountLabel || undefined) !==
          (params.accountLabel || undefined) ||
        (order.status !== 'open' && order.status !== 'partially_filled')
      ) {
        continue;
      }

      if (externalIds.has(order.exchangeOrderId)) {
        continue;
      }

      const key = this.toKey(
        order.exchange,
        order.accountLabel,
        order.exchangeOrderId,
      );
      const nextOrder = {
        ...order,
        status: 'external_missing' as const,
        updatedAt: observedAt,
      };

      this.setTrackedOrder(key, nextOrder);
      this.updatePollingStateForOrder(key, nextOrder.status);
      void this.persistOrder(nextOrder, key).catch(() => {});
      externalMissing.push(order.exchangeOrderId);
    }

    return { internalMissing, externalMissing };
  }

  getByExchangeOrderId(
    exchange: string,
    exchangeOrderId: string,
    accountLabel?: string,
  ): TrackedOrder | undefined {
    return this.orders.get(this.toKey(exchange, accountLabel, exchangeOrderId));
  }

  markFillSettled(params: {
    exchange: string;
    exchangeOrderId: string;
    accountLabel?: string;
    cumulativeQty: string;
    updatedAt?: string;
  }): void {
    const key = this.toKey(
      params.exchange,
      params.accountLabel,
      params.exchangeOrderId,
    );
    const existingOrder = this.orders.get(key);

    if (!existingOrder) {
      return;
    }

    const previousSettledQty = new BigNumber(
      existingOrder.settledFilledQty || 0,
    );
    const nextSettledQty = new BigNumber(params.cumulativeQty);

    if (
      !previousSettledQty.isFinite() ||
      !nextSettledQty.isFinite() ||
      nextSettledQty.isLessThanOrEqualTo(previousSettledQty)
    ) {
      return;
    }

    const nextOrder = {
      ...existingOrder,
      settledFilledQty: nextSettledQty.toFixed(),
      updatedAt: params.updatedAt || getRFC3339Timestamp(),
    };

    this.setTrackedOrder(key, nextOrder);
    void this.persistOrder(nextOrder, key).catch(() => {});
  }

  getFillCount(strategyKey: string, windowMs: number): number {
    if (windowMs <= 0) {
      return 0;
    }

    return this.getPrunedFillLog(strategyKey, Date.now() - windowMs).length;
  }

  markUserStreamActivity(exchange: string, accountLabel: string): void {
    this.lastUserStreamActivityByKey.set(
      `${exchange}:${accountLabel}`,
      Date.now(),
    );
  }

  async onTick(ts: string): Promise<void> {
    this.prunePollingState();
    await this.dispatchStoredUnsettledFillSettlements(ts);
  }

  async pollDueOrders(
    ts: string,
    options: {
      nowMs?: number;
      totalBudget?: number;
      perExchangeBudget?: number;
    } = {},
  ): Promise<number> {
    this.prunePollingState();

    const now = options.nowMs ?? Date.now();
    const dueOrders = this.selectDueOrders(
      now,
      options.totalBudget ??
        ExchangeOrderTrackerService.DEFAULT_RECONCILIATION_BUDGET,
      options.perExchangeBudget ??
        ExchangeOrderTrackerService.DEFAULT_PER_EXCHANGE_RECONCILIATION_BUDGET,
    );
    let processedCount = 0;

    for (const order of dueOrders) {
      processedCount += 1;
      const orderKey = this.toOrderKey(order);

      if (!(await this.isStrategyOrderStillActive(order.strategyKey))) {
        this.upsertOrder({
          ...order,
          status: 'cancelled',
          updatedAt: getRFC3339Timestamp(),
        });
        this.lastPolledAtByOrderKey.delete(orderKey);
        this.logger.warn(
          `Self-healed orphan tracked order ${order.strategyKey}:${order.exchangeOrderId} by marking it cancelled because the strategy is no longer running`,
        );
        continue;
      }

      if (
        order.status === 'pending_create' &&
        !order.exchangeOrderId &&
        order.clientOrderId
      ) {
        await this.reconcilePendingCreateByClientOrderId(order, orderKey, ts);
        continue;
      }

      let latest: Awaited<
        ReturnType<ExchangeConnectorAdapterService['fetchOrder']>
      >;

      try {
        latest = this.runtimeTimingService
          ? await this.runtimeTimingService.measureAsync(
              'order-tracker.fetch-order',
              {
                accountLabel: order.accountLabel || 'default',
                exchange: order.exchange,
                exchangeOrderId: order.exchangeOrderId,
                pair: order.pair,
              },
              () =>
                this.exchangeConnectorAdapterService?.fetchOrder(
                  order.exchange,
                  order.pair,
                  order.exchangeOrderId,
                  order.accountLabel,
                ) as Promise<
                  Awaited<
                    ReturnType<ExchangeConnectorAdapterService['fetchOrder']>
                  >
                >,
              { warnThresholdMs: 500 },
            )
          : await this.exchangeConnectorAdapterService?.fetchOrder(
              order.exchange,
              order.pair,
              order.exchangeOrderId,
              order.accountLabel,
            );
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          continue;
        }

        throw error;
      }

      this.lastPolledAtByOrderKey.set(orderKey, Date.now());

      if (!latest) {
        continue;
      }

      const normalizedStatus = this.normalizeStatus(latest.status);

      const nextFilledQty =
        this.normalizeFilledValue(latest?.filled) || order.cumulativeFilledQty;
      const adjustedStatus = this.adjustPartialFillStatus(
        normalizedStatus,
        order.qty,
        nextFilledQty,
      );
      const nextOrder: TrackedOrder = {
        ...order,
        cumulativeFilledQty: nextFilledQty,
        status: adjustedStatus,
        updatedAt: getRFC3339Timestamp(),
      };

      const fillDelta = this.recordFill(order, nextOrder, ts);

      this.upsertOrder(nextOrder, { settleFill: false });

      if (ExchangeOrderTrackerService.terminalStates.has(normalizedStatus)) {
        this.lastPolledAtByOrderKey.delete(orderKey);
      }

      if (fillDelta) {
        await this.routeRecoveredFill(order, nextOrder, fillDelta, ts);
      }
    }

    await this.reconcileOpenOrderSnapshots(dueOrders, ts);

    return processedCount;
  }

  private async reconcileOpenOrderSnapshots(
    dueOrders: TrackedOrder[],
    ts: string,
  ): Promise<void> {
    if (
      !this.exchangeConnectorAdapterService ||
      typeof this.exchangeConnectorAdapterService.fetchOpenOrders !== 'function'
    ) {
      return;
    }

    const seenGroups = new Set<string>();

    for (const order of dueOrders) {
      const groupKey = `${order.exchange}:${order.accountLabel || 'default'}:${
        order.pair
      }`;

      if (seenGroups.has(groupKey)) {
        continue;
      }

      seenGroups.add(groupKey);

      try {
        const openOrders =
          await this.exchangeConnectorAdapterService.fetchOpenOrders(
            order.exchange,
            order.pair,
            order.accountLabel,
          );

        this.reconcileOpenOrderSnapshot({
          exchange: order.exchange,
          accountLabel: order.accountLabel,
          pair: order.pair,
          openOrders: Array.isArray(openOrders) ? openOrders : [],
          observedAt: ts,
        });
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          continue;
        }

        throw error;
      }
    }
  }

  private isUserStreamHealthy(
    exchange: string,
    accountLabel?: string,
  ): boolean {
    const key = `${exchange}:${accountLabel || 'default'}`;
    const lastActivity = this.lastUserStreamActivityByKey.get(key);

    if (lastActivity === undefined) {
      return false;
    }

    return (
      Date.now() - lastActivity <
      ExchangeOrderTrackerService.STREAM_HEALTHY_THRESHOLD_MS
    );
  }

  private isPollDue(order: TrackedOrder, now: number): boolean {
    const key = this.toOrderKey(order);
    const lastPolled = this.lastPolledAtByOrderKey.get(key);
    const interval = this.isUserStreamHealthy(
      order.exchange,
      order.accountLabel,
    )
      ? ExchangeOrderTrackerService.SLOW_POLL_INTERVAL_MS
      : ExchangeOrderTrackerService.FAST_POLL_INTERVAL_MS;

    return lastPolled === undefined || now - lastPolled >= interval;
  }

  private selectDueOrders(
    now: number,
    totalBudget: number,
    perExchangeBudget: number,
  ): TrackedOrder[] {
    const normalizedTotalBudget = Math.max(1, totalBudget);
    const normalizedPerExchangeBudget = Math.max(1, perExchangeBudget);
    const dueOrders = [...this.orders.values()]
      .filter((order) => this.isOrderPollable(order))
      .filter((order) => this.isPollDue(order, now))
      .sort((a, b) => {
        const aPriority =
          a.status === 'pending_create' || a.status === 'pending_cancel'
            ? 0
            : 1;
        const bPriority =
          b.status === 'pending_create' || b.status === 'pending_cancel'
            ? 0
            : 1;

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        const aKey = this.toOrderKey(a);
        const bKey = this.toOrderKey(b);

        return (
          (this.lastPolledAtByOrderKey.get(aKey) ?? 0) -
          (this.lastPolledAtByOrderKey.get(bKey) ?? 0)
        );
      });
    const perExchangeCounts = new Map<string, number>();
    const selected: TrackedOrder[] = [];

    for (const order of dueOrders) {
      const exchangeCount = perExchangeCounts.get(order.exchange) ?? 0;

      if (exchangeCount >= normalizedPerExchangeBudget) {
        continue;
      }

      selected.push(order);
      perExchangeCounts.set(order.exchange, exchangeCount + 1);

      if (selected.length >= normalizedTotalBudget) {
        break;
      }
    }

    return selected;
  }

  private isOrderPollable(order: TrackedOrder): boolean {
    return (
      order.status === 'pending_create' ||
      order.status === 'open' ||
      order.status === 'partially_filled' ||
      order.status === 'pending_cancel'
    );
  }

  private prunePollingState(): void {
    const activeKeys = new Set<string>();

    for (const order of this.orders.values()) {
      if (this.isOrderPollable(order)) {
        activeKeys.add(this.toOrderKey(order));
      }
    }

    for (const key of this.lastPolledAtByOrderKey.keys()) {
      if (!activeKeys.has(key)) {
        this.lastPolledAtByOrderKey.delete(key);
      }
    }
  }

  private updatePollingStateForOrder(
    orderKey: string,
    status: TrackedOrderState,
  ): void {
    if (ExchangeOrderTrackerService.terminalStates.has(status)) {
      this.lastPolledAtByOrderKey.delete(orderKey);
    }
  }

  private setTrackedOrder(key: string, order: TrackedOrder): void {
    const existingOrder = this.orders.get(key);

    this.orders.set(key, order);
    this.updateTrackedOrderSummary(existingOrder, order, key);
  }

  private updateTrackedOrderSummary(
    previousOrder: TrackedOrder | undefined,
    nextOrder: TrackedOrder,
    key: string,
  ): void {
    if (!previousOrder) {
      this.incrementTrackedOrderStatus(nextOrder.status);

      if (
        this.trackedOrderSampleKeys.length <
        ExchangeOrderTrackerService.SUMMARY_SAMPLE_KEY_LIMIT
      ) {
        this.trackedOrderSampleKeys.push(key);
      }

      return;
    }

    if (previousOrder.status !== nextOrder.status) {
      this.decrementTrackedOrderStatus(previousOrder.status);
      this.incrementTrackedOrderStatus(nextOrder.status);
    }
  }

  private incrementTrackedOrderStatus(status: TrackedOrderState): void {
    this.trackedOrderStatusCounts.set(
      status,
      (this.trackedOrderStatusCounts.get(status) || 0) + 1,
    );
  }

  private decrementTrackedOrderStatus(status: TrackedOrderState): void {
    const nextCount = (this.trackedOrderStatusCounts.get(status) || 0) - 1;

    if (nextCount > 0) {
      this.trackedOrderStatusCounts.set(status, nextCount);

      return;
    }

    this.trackedOrderStatusCounts.delete(status);
  }

  private getTrackedOrderStatusSnapshot(): Record<string, number> {
    const byStatus: Record<string, number> = {};

    for (const [status, count] of this.trackedOrderStatusCounts.entries()) {
      if (count > 0) {
        byStatus[status] = count;
      }
    }

    return byStatus;
  }

  private recordFill(
    previousOrder: TrackedOrder,
    nextOrder: TrackedOrder,
    ts: string,
  ): { qty: string; cumulativeQty: string } | null {
    const fillDelta = this.computeFillDelta(previousOrder, nextOrder);

    if (!fillDelta) {
      return null;
    }

    const fills = this.getPrunedFillLog(
      previousOrder.strategyKey,
      Date.parse(ts) - 60 * 60 * 1000,
    );

    fills.push({
      ts,
      side: previousOrder.side,
      qty: fillDelta.qty,
    });

    this.fillLog.set(previousOrder.strategyKey, fills);

    return fillDelta;
  }

  private async routeRecoveredFill(
    previousOrder: TrackedOrder,
    nextOrder: TrackedOrder,
    fillDelta: { qty: string; cumulativeQty: string },
    ts: string,
  ): Promise<void> {
    const executor = this.executorRegistry?.getExecutor(
      previousOrder.exchange,
      previousOrder.pair,
    );

    if (!executor) {
      return;
    }

    const routedOrderId = this.resolveFillRouteOrderId(previousOrder, executor);

    if (!routedOrderId) {
      this.logger.warn(
        `Skipping recovered fill settlement for ${previousOrder.strategyKey}:${previousOrder.exchangeOrderId}: no active executor session for orderId=${previousOrder.orderId}`,
      );

      return;
    }

    await executor.onFill({
      orderId: routedOrderId,
      exchangeOrderId: previousOrder.exchangeOrderId,
      clientOrderId: previousOrder.clientOrderId,
      accountLabel: previousOrder.accountLabel,
      ...(previousOrder.role ? { role: previousOrder.role } : {}),
      side: previousOrder.side,
      price: nextOrder.price || previousOrder.price,
      qty: fillDelta.qty,
      cumulativeQty: fillDelta.cumulativeQty,
      receivedAt: ts,
    });
  }

  private resolveFillRouteOrderId(
    order: TrackedOrder,
    executor: ExchangePairExecutor,
  ): string | null {
    if (executor.getSession(order.orderId)) {
      return order.orderId;
    }

    const accountScopedSeparatorIndex = order.orderId.lastIndexOf(':');

    if (accountScopedSeparatorIndex > 0) {
      const baseOrderId = order.orderId.slice(0, accountScopedSeparatorIndex);

      if (executor.getSession(baseOrderId)) {
        return baseOrderId;
      }
    }

    return null;
  }

  private getPrunedFillLog(
    strategyKey: string,
    cutoffMs: number,
  ): FillLogEntry[] {
    const fills = (this.fillLog.get(strategyKey) || []).filter((entry) => {
      const entryMs = Date.parse(entry.ts);

      return Number.isFinite(entryMs) && entryMs >= cutoffMs;
    });

    this.fillLog.set(strategyKey, fills);

    return fills;
  }

  private async dispatchStoredUnsettledFillSettlements(
    ts: string,
  ): Promise<void> {
    const orders = [...this.orders.values()]
      .filter((order) => this.computeUnsettledFillDelta(order) !== null)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, ExchangeOrderTrackerService.DEFAULT_RECONCILIATION_BUDGET);

    for (const order of orders) {
      await this.dispatchUnsettledFillSettlementAsync(order, ts);
    }
  }

  private dispatchUnsettledFillSettlement(order: TrackedOrder): void {
    const fillDelta = this.computeUnsettledFillDelta(order);

    if (!fillDelta) {
      return;
    }

    void this.dispatchUnsettledFillSettlementAsync(
      order,
      order.updatedAt || getRFC3339Timestamp(),
    ).catch((error) => {
      this.logger.warn(
        `Failed to dispatch unsettled tracked fill ${order.strategyKey}:${
          order.exchangeOrderId
        }: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async dispatchUnsettledFillSettlementAsync(
    order: TrackedOrder,
    ts: string,
  ): Promise<void> {
    const fillDelta = this.computeUnsettledFillDelta(order);

    if (!fillDelta) {
      return;
    }

    const dispatchKey = this.buildFillSettlementDispatchKey(
      order,
      fillDelta.cumulativeQty,
    );

    if (this.fillSettlementDispatches.has(dispatchKey)) {
      return;
    }

    this.fillSettlementDispatches.add(dispatchKey);

    try {
      await this.routeRecoveredFill(order, order, fillDelta, ts);
    } finally {
      this.fillSettlementDispatches.delete(dispatchKey);
    }
  }

  private computeUnsettledFillDelta(
    order: TrackedOrder,
  ): { qty: string; cumulativeQty: string } | null {
    const cumulativeFilledQty = new BigNumber(order.cumulativeFilledQty || 0);
    const settledFilledQty = new BigNumber(order.settledFilledQty || 0);

    if (
      !cumulativeFilledQty.isFinite() ||
      !settledFilledQty.isFinite() ||
      !cumulativeFilledQty.isGreaterThan(settledFilledQty)
    ) {
      return null;
    }

    if (!order.side || !this.isPositiveFinite(order.price)) {
      return null;
    }

    const deltaQty = cumulativeFilledQty.minus(settledFilledQty);

    if (!deltaQty.isFinite() || deltaQty.isLessThanOrEqualTo(0)) {
      return null;
    }

    return {
      qty: deltaQty.toFixed(),
      cumulativeQty: cumulativeFilledQty.toFixed(),
    };
  }

  private buildFillSettlementDispatchKey(
    order: TrackedOrder,
    cumulativeQty: string,
  ): string {
    return [
      order.exchange,
      order.accountLabel || 'default',
      order.exchangeOrderId,
      cumulativeQty,
    ].join(':');
  }

  private adjustPartialFillStatus(
    status: TrackedOrder['status'],
    orderQty: string,
    cumulativeFilledQty: string | undefined,
  ): TrackedOrder['status'] {
    if (status !== 'filled') {
      return status;
    }

    if (!cumulativeFilledQty || !orderQty) {
      return status;
    }

    const filled = new BigNumber(cumulativeFilledQty);
    const total = new BigNumber(orderQty);

    if (filled.isFinite() && total.isFinite() && filled.isLessThan(total)) {
      return 'cancelled';
    }

    return status;
  }

  private normalizeStatus(status: string): TrackedOrder['status'] {
    const value = (status || '').toLowerCase();

    if (value === 'pending_create') {
      return 'pending_create';
    }
    if (value === 'open' || value === 'new') {
      return 'open';
    }
    if (value === 'partially_filled' || value === 'partially-filled') {
      return 'partially_filled';
    }
    if (value === 'pending_cancel') {
      return 'pending_cancel';
    }
    if (value === 'closed' || value === 'filled') {
      return 'filled';
    }
    if (value === 'canceled' || value === 'cancelled') {
      return 'cancelled';
    }

    return 'failed';
  }

  private releaseReservationForTerminalOrder(
    previousOrder: TrackedOrder | undefined,
    nextOrder: TrackedOrder,
  ): void {
    if (!this.orderReservationService) {
      return;
    }

    if (
      previousOrder &&
      ExchangeOrderTrackerService.terminalStates.has(previousOrder.status)
    ) {
      return;
    }

    if (nextOrder.status !== 'cancelled' && nextOrder.status !== 'filled') {
      return;
    }

    void this.releaseReservationForTerminalOrderAsync(nextOrder).catch(
      (error) => {
        this.logger.warn(
          `Failed to release reservation for terminal tracked order ${
            nextOrder.exchangeOrderId
          }: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  }

  private async reconcilePendingCreateByClientOrderId(
    order: TrackedOrder,
    orderKey: string,
    ts: string,
  ): Promise<void> {
    if (!this.exchangeConnectorAdapterService) {
      return;
    }

    let latest: Awaited<
      ReturnType<ExchangeConnectorAdapterService['fetchOrderByClientOrderId']>
    >;

    try {
      latest = this.runtimeTimingService
        ? await this.runtimeTimingService.measureAsync(
            'order-tracker.fetch-order-by-client-order-id',
            {
              accountLabel: order.accountLabel || 'default',
              exchange: order.exchange,
              clientOrderId: order.clientOrderId,
              pair: order.pair,
            },
            () =>
              this.exchangeConnectorAdapterService?.fetchOrderByClientOrderId(
                order.exchange,
                order.pair,
                order.clientOrderId || '',
                order.accountLabel,
              ) as Promise<
                Awaited<
                  ReturnType<
                    ExchangeConnectorAdapterService['fetchOrderByClientOrderId']
                  >
                >
              >,
            { warnThresholdMs: 500 },
          )
        : await this.exchangeConnectorAdapterService.fetchOrderByClientOrderId(
            order.exchange,
            order.pair,
            order.clientOrderId,
            order.accountLabel,
          );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return;
      }

      throw error;
    }

    this.lastPolledAtByOrderKey.set(orderKey, Date.now());

    if (!latest) {
      await this.releaseUnplacedLimitOrderReservation(order);
      this.upsertOrder(
        {
          ...order,
          status: 'failed',
          updatedAt: getRFC3339Timestamp(),
        },
        { releaseReservation: false },
      );
      return;
    }

    const exchangeOrderId = this.extractExchangeOrderId(latest);

    if (!exchangeOrderId) {
      return;
    }

    const normalizedStatus = this.normalizeStatus(
      String(latest.status || 'open'),
    );
    const nextFilledQty =
      this.normalizeFilledValue(latest?.filled) || order.cumulativeFilledQty;
    const adjustedStatus = this.adjustPartialFillStatus(
      normalizedStatus,
      order.qty,
      nextFilledQty,
    );
    const nextOrder: TrackedOrder = {
      ...order,
      exchangeOrderId,
      cumulativeFilledQty: nextFilledQty,
      status: adjustedStatus,
      updatedAt: getRFC3339Timestamp(),
    };
    const fillDelta = this.recordFill(order, nextOrder, ts);

    this.removeTrackedOrderByKey(orderKey);
    this.upsertOrder(nextOrder, { settleFill: false });

    if (ExchangeOrderTrackerService.terminalStates.has(normalizedStatus)) {
      this.lastPolledAtByOrderKey.delete(this.toOrderKey(nextOrder));
    }

    if (fillDelta) {
      await this.routeRecoveredFill(order, nextOrder, fillDelta, ts);
    }
  }

  private async releaseUnplacedLimitOrderReservation(
    order: TrackedOrder,
  ): Promise<void> {
    if (!this.orderReservationService) {
      return;
    }

    const marketMakingOrder = await this.marketMakingOrderRepository?.findOne({
      where: { orderId: order.orderId },
    });
    const userId =
      String(marketMakingOrder?.userId || '').trim() ||
      this.extractUserIdFromStrategyKey(order.strategyKey);

    if (!userId) {
      return;
    }

    await this.orderReservationService.releaseLimitOrderReservation({
      orderId: order.orderId,
      userId,
      intentId: order.clientOrderId || order.orderId,
      releaseId: order.clientOrderId,
      pair: order.pair,
      side: order.side,
      price: order.price,
      qty: order.qty,
      reason: 'exchange_create_not_found',
    });
  }

  private async releaseReservationForTerminalOrderAsync(
    order: TrackedOrder,
  ): Promise<void> {
    const marketMakingOrder = await this.marketMakingOrderRepository?.findOne({
      where: { orderId: order.orderId },
    });
    const userId =
      String(marketMakingOrder?.userId || '').trim() ||
      this.extractUserIdFromStrategyKey(order.strategyKey);

    if (!userId) {
      return;
    }

    await this.orderReservationService?.releaseRemainingLimitOrderReservation({
      orderId: order.orderId,
      userId,
      intentId: order.clientOrderId || order.exchangeOrderId,
      releaseId: order.clientOrderId || order.exchangeOrderId,
      pair: order.pair,
      side: order.side,
      price: order.price,
      qty: order.qty,
      filledQty: order.cumulativeFilledQty,
      reason:
        order.status === 'filled'
          ? 'exchange_order_filled'
          : 'exchange_order_cancelled',
    });
  }

  private extractUserIdFromStrategyKey(strategyKey: string): string {
    return String(strategyKey || '').split('-')[0] || '';
  }

  private async isStrategyOrderStillActive(
    strategyKey: string,
  ): Promise<boolean> {
    if (!this.strategyInstanceRepository) {
      return true;
    }

    const strategyInstance = await this.strategyInstanceRepository.findOne({
      where: { strategyKey },
    });

    if (strategyInstance?.status !== 'running') {
      return false;
    }

    const orderId = String(strategyInstance.marketMakingOrderId || '').trim();

    if (!orderId || !this.marketMakingOrderRepository) {
      return true;
    }

    const marketMakingOrder = await this.marketMakingOrderRepository.findOne({
      where: { orderId },
    });

    return marketMakingOrder?.state === 'running';
  }

  private toKey(
    exchange: string,
    accountLabel: string | undefined,
    exchangeOrderId: string,
  ): string {
    return `${exchange}:${accountLabel || 'default'}:${exchangeOrderId}`;
  }

  private toOrderKey(order: TrackedOrder): string {
    if (order.exchangeOrderId) {
      return this.toKey(
        order.exchange,
        order.accountLabel,
        order.exchangeOrderId,
      );
    }

    return `${order.exchange}:${order.accountLabel || 'default'}:client:${
      order.clientOrderId || order.orderId
    }`;
  }

  private removeTrackedOrderByKey(key: string): void {
    const existingOrder = this.orders.get(key);

    if (!existingOrder) {
      return;
    }

    this.orders.delete(key);
    this.lastPolledAtByOrderKey.delete(key);
    this.decrementTrackedOrderStatus(existingOrder.status);

    const sampleIndex = this.trackedOrderSampleKeys.indexOf(key);

    if (sampleIndex >= 0) {
      this.trackedOrderSampleKeys.splice(sampleIndex, 1);
    }
  }

  private extractExchangeOrderId(order: Record<string, unknown>): string {
    return this.extractOptionalString(order.id || order.orderId) || '';
  }

  private extractOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private normalizeExternalSide(value: unknown): 'buy' | 'sell' {
    return String(value || '').toLowerCase() === 'sell' ? 'sell' : 'buy';
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

  private resolveNextStatus(
    previousOrder: TrackedOrder,
    nextOrder: TrackedOrder,
  ): TrackedOrderState | null {
    if (previousOrder.status === nextOrder.status) {
      return nextOrder.status;
    }

    if (ExchangeOrderTrackerService.terminalStates.has(previousOrder.status)) {
      return null;
    }

    if (
      ExchangeOrderTrackerService.validTransitions[
        previousOrder.status
      ].includes(nextOrder.status)
    ) {
      return nextOrder.status;
    }

    return null;
  }

  private mergeOrder(
    previousOrder: TrackedOrder,
    nextOrder: TrackedOrder,
    status: TrackedOrderState,
  ): TrackedOrder {
    const previousFilledQty = new BigNumber(
      previousOrder.cumulativeFilledQty || 0,
    );
    const nextFilledQty = new BigNumber(nextOrder.cumulativeFilledQty || 0);
    const previousSettledQty = new BigNumber(
      previousOrder.settledFilledQty || 0,
    );
    const nextSettledQty = new BigNumber(nextOrder.settledFilledQty || 0);

    return {
      ...previousOrder,
      ...nextOrder,
      userOrderId:
        nextOrder.userOrderId ||
        previousOrder.userOrderId ||
        resolveLedgerOrderScope({
          ledgerOrderId: nextOrder.orderId || previousOrder.orderId,
          accountLabel: nextOrder.accountLabel || previousOrder.accountLabel,
        }).userOrderId,
      status,
      createdAt: previousOrder.createdAt || nextOrder.createdAt,
      clientOrderId: nextOrder.clientOrderId || previousOrder.clientOrderId,
      price: this.isPositiveFinite(nextOrder.price)
        ? nextOrder.price
        : previousOrder.price,
      qty: this.isPositiveFinite(nextOrder.qty)
        ? nextOrder.qty
        : previousOrder.qty,
      cumulativeFilledQty: this.normalizeCumulativeFilledQty(
        BigNumber.max(previousFilledQty, nextFilledQty).toFixed(),
      ),
      settledFilledQty: this.normalizeCumulativeFilledQty(
        BigNumber.max(previousSettledQty, nextSettledQty).toFixed(),
      ),
    };
  }

  private isPositiveFinite(value: unknown): boolean {
    const numericValue = new BigNumber(String(value ?? ''));

    return numericValue.isFinite() && numericValue.isGreaterThan(0);
  }

  private normalizeCumulativeFilledQty(value: unknown): string | undefined {
    const normalized = this.normalizeFilledValue(value);

    if (!normalized) {
      return undefined;
    }

    const bigNumberValue = new BigNumber(normalized);

    if (!bigNumberValue.isFinite() || bigNumberValue.isNegative()) {
      return undefined;
    }

    return bigNumberValue.toFixed();
  }

  private computeFillDelta(
    previousOrder: TrackedOrder,
    nextOrder: TrackedOrder,
  ): { qty: string; cumulativeQty: string } | null {
    const previousFilledQty = new BigNumber(
      previousOrder.cumulativeFilledQty || 0,
    );
    const nextFilledQty = new BigNumber(nextOrder.cumulativeFilledQty || 0);

    if (
      !previousFilledQty.isFinite() ||
      !nextFilledQty.isFinite() ||
      !nextFilledQty.isGreaterThan(previousFilledQty)
    ) {
      return null;
    }

    return {
      qty: nextFilledQty.minus(previousFilledQty).toFixed(),
      cumulativeQty: nextFilledQty.toFixed(),
    };
  }

  private async hydratePersistedOrders(): Promise<void> {
    if (!this.trackedOrderRepository) {
      return;
    }

    const rows = await this.trackedOrderRepository.find();

    for (const row of rows) {
      const order: TrackedOrder = {
        orderId: row.orderId,
        userOrderId: row.userOrderId,
        strategyKey: row.strategyKey,
        exchange: row.exchange,
        accountLabel: row.accountLabel || undefined,
        pair: row.pair,
        exchangeOrderId: row.exchangeOrderId,
        clientOrderId: row.clientOrderId,
        slotKey: row.slotKey || undefined,
        role: (row.role as TrackedOrder['role']) || undefined,
        side: row.side as 'buy' | 'sell',
        price: row.price,
        qty: row.qty,
        cumulativeFilledQty: row.cumulativeFilledQty,
        settledFilledQty: row.settledFilledQty,
        status: row.status as TrackedOrderState,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      this.setTrackedOrder(
        this.toKey(
          row.exchange,
          row.accountLabel || undefined,
          row.exchangeOrderId,
        ),
        order,
      );
      this.releaseReservationForTerminalOrder(undefined, order);
    }
  }

  private async persistOrder(
    order: TrackedOrder,
    trackingKey: string,
  ): Promise<void> {
    if (!this.trackedOrderRepository) {
      return;
    }

    const latestOrder = this.orders.get(trackingKey);
    const cumulativeFilledQty = this.maxNormalizedQuantity(
      order.cumulativeFilledQty,
      latestOrder?.cumulativeFilledQty,
    );
    const settledFilledQty = this.maxNormalizedQuantity(
      order.settledFilledQty,
      latestOrder?.settledFilledQty,
    );
    const entity = {
      trackingKey,
      orderId: order.orderId,
      userOrderId:
        order.userOrderId ||
        resolveLedgerOrderScope({
          ledgerOrderId: order.orderId,
          accountLabel: order.accountLabel,
        }).userOrderId,
      strategyKey: order.strategyKey,
      exchange: order.exchange,
      accountLabel: order.accountLabel,
      pair: order.pair,
      exchangeOrderId: order.exchangeOrderId,
      clientOrderId: order.clientOrderId,
      slotKey: order.slotKey,
      role: order.role,
      side: order.side,
      price: order.price,
      qty: order.qty,
      cumulativeFilledQty,
      settledFilledQty,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    try {
      // upsert (INSERT ... ON CONFLICT DO UPDATE) is used instead of save()
      // because save() does a non-atomic SELECT then INSERT, which races when
      // multiple persistOrder calls for the same trackingKey are in-flight.
      // Note: upsert overwrites ALL columns on conflict including createdAt,
      // which is safe because the in-memory model preserves createdAt via mergeOrder().
      await this.trackedOrderRepository.upsert(entity, ['trackingKey']);
    } catch (error) {
      this.logger.warn(
        `Failed to persist tracked order ${trackingKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private maxNormalizedQuantity(
    left: string | undefined,
    right: string | undefined,
  ): string | undefined {
    const leftValue = new BigNumber(left || 0);
    const rightValue = new BigNumber(right || 0);

    if (!leftValue.isFinite() && !rightValue.isFinite()) {
      return undefined;
    }

    if (!leftValue.isFinite()) {
      return this.normalizeCumulativeFilledQty(right);
    }

    if (!rightValue.isFinite()) {
      return this.normalizeCumulativeFilledQty(left);
    }

    return this.normalizeCumulativeFilledQty(
      BigNumber.max(leftValue, rightValue).toFixed(),
    );
  }
}

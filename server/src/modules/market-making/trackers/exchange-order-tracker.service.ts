import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ExecutorRegistry } from '../strategy/execution/executor-registry';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';

export type TrackedOrderState =
  | 'pending_create'
  | 'open'
  | 'partially_filled'
  | 'pending_cancel'
  | 'filled'
  | 'cancelled'
  | 'failed';

export type TrackedOrder = {
  orderId: string;
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
  status: TrackedOrderState;
  createdAt: string;
  updatedAt: string;
};

type FillLogEntry = {
  ts: string;
  side: string;
  qty: string;
};

@Injectable()
export class ExchangeOrderTrackerService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new CustomLogger(ExchangeOrderTrackerService.name);
  private static readonly terminalStates = new Set<TrackedOrderState>([
    'filled',
    'cancelled',
    'failed',
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
  };
  private static readonly STREAM_HEALTHY_THRESHOLD_MS = 30_000;
  private static readonly SLOW_POLL_INTERVAL_MS = 120_000;
  private static readonly FAST_POLL_INTERVAL_MS = 5_000;
  private static readonly MAX_ORDERS_PER_TICK = 2;

  private readonly orders = new Map<string, TrackedOrder>();
  private readonly fillLog = new Map<string, FillLogEntry[]>();
  private readonly lastUserStreamActivityByKey = new Map<string, number>();
  private readonly lastPolledAtByOrderKey = new Map<string, number>();

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.hydratePersistedOrders();
    this.clockTickCoordinatorService?.register(
      'exchange-order-tracker',
      this,
      3,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('exchange-order-tracker');
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

  upsertOrder(order: TrackedOrder): void {
    const key = this.toKey(
      order.exchange,
      order.accountLabel,
      order.exchangeOrderId,
    );
    const existingOrder = this.orders.get(key);

    if (existingOrder) {
      const nextStatus = this.resolveNextStatus(existingOrder, order);

      if (!nextStatus) {
        return;
      }

      const nextOrder = this.mergeOrder(existingOrder, order, nextStatus);

      this.orders.set(key, nextOrder);
      void this.persistOrder(nextOrder, key);

      return;
    }

    const createdOrder = {
      ...order,
      createdAt: order.createdAt || order.updatedAt,
      cumulativeFilledQty: this.normalizeCumulativeFilledQty(
        order.cumulativeFilledQty,
      ),
    };

    this.orders.set(key, createdOrder);
    void this.persistOrder(createdOrder, key);
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

  getByExchangeOrderId(
    exchange: string,
    exchangeOrderId: string,
    accountLabel?: string,
  ): TrackedOrder | undefined {
    return this.orders.get(this.toKey(exchange, accountLabel, exchangeOrderId));
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
    const now = Date.now();

    const activeOrders = [...this.orders.values()].filter(
      (order) =>
        order.status === 'pending_create' ||
        order.status === 'open' ||
        order.status === 'partially_filled' ||
        order.status === 'pending_cancel',
    );

    const dueOrders = activeOrders
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

        const aKey = this.toKey(a.exchange, a.accountLabel, a.exchangeOrderId);
        const bKey = this.toKey(b.exchange, b.accountLabel, b.exchangeOrderId);

        return (
          (this.lastPolledAtByOrderKey.get(aKey) ?? 0) -
          (this.lastPolledAtByOrderKey.get(bKey) ?? 0)
        );
      })
      .slice(0, ExchangeOrderTrackerService.MAX_ORDERS_PER_TICK);

    for (const order of dueOrders) {
      const orderKey = this.toKey(
        order.exchange,
        order.accountLabel,
        order.exchangeOrderId,
      );

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

      let latest: Awaited<
        ReturnType<ExchangeConnectorAdapterService['fetchOrder']>
      >;

      try {
        latest = await this.exchangeConnectorAdapterService?.fetchOrder(
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
      const nextOrder: TrackedOrder = {
        ...order,
        cumulativeFilledQty: nextFilledQty,
        status: normalizedStatus,
        updatedAt: getRFC3339Timestamp(),
      };

      const fillDelta = this.recordFill(order, nextOrder, ts);

      this.upsertOrder(nextOrder);

      if (ExchangeOrderTrackerService.terminalStates.has(normalizedStatus)) {
        this.lastPolledAtByOrderKey.delete(orderKey);
      }

      if (fillDelta) {
        await this.routeRecoveredFill(order, nextOrder, fillDelta, ts);
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
    const key = this.toKey(
      order.exchange,
      order.accountLabel,
      order.exchangeOrderId,
    );
    const lastPolled = this.lastPolledAtByOrderKey.get(key);
    const interval = this.isUserStreamHealthy(
      order.exchange,
      order.accountLabel,
    )
      ? ExchangeOrderTrackerService.SLOW_POLL_INTERVAL_MS
      : ExchangeOrderTrackerService.FAST_POLL_INTERVAL_MS;

    return lastPolled === undefined || now - lastPolled >= interval;
  }

  private recordFill(
    previousOrder: TrackedOrder,
    nextOrder: TrackedOrder,
    ts: string,
  ): { qty: string; cumulativeQty: string } | null {
    const previousFilledQty = Number(previousOrder.cumulativeFilledQty || 0);
    const nextFilledQty = Number(nextOrder.cumulativeFilledQty || 0);

    if (!Number.isFinite(nextFilledQty) || nextFilledQty <= previousFilledQty) {
      return null;
    }

    const fills = this.getPrunedFillLog(
      previousOrder.strategyKey,
      Date.parse(ts) - 60 * 60 * 1000,
    );

    fills.push({
      ts,
      side: previousOrder.side,
      qty: String(nextFilledQty - previousFilledQty),
    });

    this.fillLog.set(previousOrder.strategyKey, fills);

    return {
      qty: String(nextFilledQty - previousFilledQty),
      cumulativeQty: String(nextFilledQty),
    };
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

    await executor.onFill({
      orderId: previousOrder.orderId,
      exchangeOrderId: previousOrder.exchangeOrderId,
      clientOrderId: previousOrder.clientOrderId,
      accountLabel: previousOrder.accountLabel,
      side: previousOrder.side,
      price: nextOrder.price || previousOrder.price,
      qty: fillDelta.qty,
      cumulativeQty: fillDelta.cumulativeQty,
      receivedAt: ts,
    });
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

    return {
      ...previousOrder,
      ...nextOrder,
      status,
      createdAt: previousOrder.createdAt || nextOrder.createdAt,
      clientOrderId: nextOrder.clientOrderId || previousOrder.clientOrderId,
      cumulativeFilledQty: this.normalizeCumulativeFilledQty(
        BigNumber.max(previousFilledQty, nextFilledQty).toFixed(),
      ),
    };
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

  private async hydratePersistedOrders(): Promise<void> {
    if (!this.trackedOrderRepository) {
      return;
    }

    const rows = await this.trackedOrderRepository.find();

    for (const row of rows) {
      this.orders.set(
        this.toKey(
          row.exchange,
          row.accountLabel || undefined,
          row.exchangeOrderId,
        ),
        {
          orderId: row.orderId,
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
          status: row.status as TrackedOrderState,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      );
    }
  }

  private async persistOrder(
    order: TrackedOrder,
    trackingKey: string,
  ): Promise<void> {
    if (!this.trackedOrderRepository) {
      return;
    }

    await this.trackedOrderRepository.save(
      this.trackedOrderRepository.create({
        trackingKey,
        orderId: order.orderId,
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
        cumulativeFilledQty: order.cumulativeFilledQty,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }),
    );
  }
}

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
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
  pair: string;
  exchangeOrderId: string;
  clientOrderId?: string;
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
  private static readonly terminalStates = new Set<TrackedOrderState>([
    'filled',
    'cancelled',
    'failed',
  ]);
  private static readonly validTransitions: Record<
    TrackedOrderState,
    TrackedOrderState[]
  > = {
    pending_create: ['open', 'partially_filled', 'filled', 'failed'],
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
  private readonly orders = new Map<string, TrackedOrder>();
  private readonly fillLog = new Map<string, FillLogEntry[]>();

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
    const key = this.toKey(order.exchange, order.exchangeOrderId);
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

  getOpenOrders(strategyKey: string): TrackedOrder[] {
    return [...this.orders.values()].filter(
      (order) =>
        order.strategyKey === strategyKey &&
        (order.status === 'open' || order.status === 'partially_filled'),
    );
  }

  getTrackedOrders(strategyKey: string): TrackedOrder[] {
    return [...this.orders.values()].filter(
      (order) => order.strategyKey === strategyKey,
    );
  }

  getByExchangeOrderId(
    exchange: string,
    exchangeOrderId: string,
  ): TrackedOrder | undefined {
    return this.orders.get(this.toKey(exchange, exchangeOrderId));
  }

  getFillCount(strategyKey: string, windowMs: number): number {
    if (windowMs <= 0) {
      return 0;
    }

    return this.getPrunedFillLog(strategyKey, Date.now() - windowMs).length;
  }

  async onTick(ts: string): Promise<void> {
    const openOrders = [...this.orders.values()].filter(
      (order) =>
        order.status === 'pending_create' ||
        order.status === 'open' ||
        order.status === 'partially_filled' ||
        order.status === 'pending_cancel',
    );

    await Promise.allSettled(
      openOrders.map(async (order) => {
        const latest = await this.exchangeConnectorAdapterService?.fetchOrder(
          order.exchange,
          order.pair,
          order.exchangeOrderId,
        );

        if (!latest) {
          return;
        }

        const normalizedStatus = this.normalizeStatus(latest.status);

        const nextFilledQty =
          this.normalizeFilledValue(latest?.filled) ||
          order.cumulativeFilledQty;
        const nextOrder: TrackedOrder = {
          ...order,
          cumulativeFilledQty: nextFilledQty,
          status: normalizedStatus,
          updatedAt: getRFC3339Timestamp(),
        };

        const fillDelta = this.recordFill(order, nextOrder, ts);
        this.upsertOrder(nextOrder);

        if (fillDelta) {
          await this.routeRecoveredFill(order, nextOrder, fillDelta, ts);
        }
      }),
    );
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

  private toKey(exchange: string, exchangeOrderId: string): string {
    return `${exchange}:${exchangeOrderId}`;
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
      this.orders.set(row.trackingKey, {
        orderId: row.orderId,
        strategyKey: row.strategyKey,
        exchange: row.exchange,
        pair: row.pair,
        exchangeOrderId: row.exchangeOrderId,
        clientOrderId: row.clientOrderId,
        side: row.side as 'buy' | 'sell',
        price: row.price,
        qty: row.qty,
        cumulativeFilledQty: row.cumulativeFilledQty,
        status: row.status as TrackedOrderState,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
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
        pair: order.pair,
        exchangeOrderId: order.exchangeOrderId,
        clientOrderId: order.clientOrderId,
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

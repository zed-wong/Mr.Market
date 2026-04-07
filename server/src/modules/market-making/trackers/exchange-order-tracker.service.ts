import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';

type TrackedOrder = {
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
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'failed';
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
  private readonly orders = new Map<string, TrackedOrder>();
  private readonly fillLog = new Map<string, FillLogEntry[]>();

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
  ) {}

  async onModuleInit(): Promise<void> {
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
    this.orders.set(this.toKey(order.exchange, order.exchangeOrderId), order);
  }

  getOpenOrders(strategyKey: string): TrackedOrder[] {
    return [...this.orders.values()].filter(
      (order) => order.strategyKey === strategyKey && order.status === 'open',
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
      (order) => order.status === 'open' || order.status === 'partially_filled',
    );

    const results = await Promise.allSettled(
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
          this.normalizeFilledValue(latest?.filled) || order.cumulativeFilledQty;
        const nextOrder: TrackedOrder = {
          ...order,
          cumulativeFilledQty: nextFilledQty,
          status: normalizedStatus,
          updatedAt: getRFC3339Timestamp(),
        };

        this.recordFill(order, nextOrder, ts);
        this.orders.set(this.toKey(order.exchange, order.exchangeOrderId), nextOrder);
      }),
    );
  }

  private recordFill(
    previousOrder: TrackedOrder,
    nextOrder: TrackedOrder,
    ts: string,
  ): void {
    const previousFilledQty = Number(previousOrder.cumulativeFilledQty || 0);
    const nextFilledQty = Number(nextOrder.cumulativeFilledQty || 0);

    if (!Number.isFinite(nextFilledQty) || nextFilledQty <= previousFilledQty) {
      return;
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
  }

  private getPrunedFillLog(strategyKey: string, cutoffMs: number): FillLogEntry[] {
    const fills = (this.fillLog.get(strategyKey) || []).filter((entry) => {
      const entryMs = Date.parse(entry.ts);

      return Number.isFinite(entryMs) && entryMs >= cutoffMs;
    });

    this.fillLog.set(strategyKey, fills);

    return fills;
  }

  private normalizeStatus(status: string): TrackedOrder['status'] {
    const value = (status || '').toLowerCase();

    if (value === 'open' || value === 'new') {
      return 'open';
    }
    if (value === 'partially_filled' || value === 'partially-filled') {
      return 'partially_filled';
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
}

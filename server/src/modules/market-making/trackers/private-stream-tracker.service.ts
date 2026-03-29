import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { FillRoutingService } from '../execution/fill-routing.service';
import { ExecutorRegistry } from '../strategy/execution/executor-registry';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';

type PrivateStreamEvent = {
  exchange: string;
  accountLabel: string;
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: string;
};

type RoutedFillCandidate = {
  exchange: string;
  accountLabel: string;
  pair?: string;
  orderId?: string;
  exchangeOrderId?: string;
  clientOrderId?: string;
  fillId?: string;
  side?: 'buy' | 'sell';
  price?: string;
  qty?: string;
  cumulativeQty?: string;
  qtyKind?: 'delta' | 'cumulative';
  status?: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'failed';
  receivedAt: string;
  payload: Record<string, unknown>;
};

type OrphanedFillEvent = RoutedFillCandidate & {
  reason:
    | 'unresolved_order'
    | 'missing_executor'
    | 'account_boundary_violation';
};

@Injectable()
export class PrivateStreamTrackerService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new CustomLogger(PrivateStreamTrackerService.name);
  private readonly queue: PrivateStreamEvent[] = [];
  private readonly latestByKey = new Map<string, PrivateStreamEvent>();
  private readonly orphanedFills: OrphanedFillEvent[] = [];

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
    @Optional()
    private readonly fillRoutingService?: FillRoutingService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly executorRegistry?: ExecutorRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register(
      'private-stream-tracker',
      this,
      2,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('private-stream-tracker');
  }

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    this.queue.length = 0;
    this.orphanedFills.length = 0;
  }

  async health(): Promise<boolean> {
    return true;
  }

  queueAccountEvent(event: PrivateStreamEvent): void {
    this.queue.push(event);
  }

  getLatestEvent(
    exchange: string,
    accountLabel: string,
  ): PrivateStreamEvent | undefined {
    return this.latestByKey.get(this.toKey(exchange, accountLabel));
  }

  getOrphanedFills(): OrphanedFillEvent[] {
    return [...this.orphanedFills];
  }

  async onTick(_: string): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift();

      if (!event) {
        continue;
      }

      this.latestByKey.set(
        this.toKey(event.exchange, event.accountLabel),
        event,
      );

      const fill = this.extractFillCandidate(event);

      if (!fill) {
        continue;
      }

      await this.routeFillCandidate(fill);
    }
  }

  private async routeFillCandidate(fill: RoutedFillCandidate): Promise<void> {
    const resolution = await this.fillRoutingService?.resolveOrderForFill({
      clientOrderId: fill.clientOrderId,
      exchangeOrderId: fill.exchangeOrderId,
    });
    const trackedOrder = fill.exchangeOrderId
      ? this.exchangeOrderTrackerService?.getByExchangeOrderId(
          fill.exchange,
          fill.exchangeOrderId,
        )
      : undefined;
    const resolvedExecutor = resolution?.orderId
      ? this.executorRegistry?.findExecutorByOrderId(resolution.orderId)
      : undefined;
    const executor =
      resolvedExecutor ||
      (fill.pair
        ? this.executorRegistry?.getExecutor(fill.exchange, fill.pair)
        : undefined) ||
      (trackedOrder
        ? this.executorRegistry?.getExecutor(fill.exchange, trackedOrder.pair)
        : undefined);
    // Derive session from the actual executor that will handle the fill:
    // - Primary path: try resolvedExecutor first, fall back to executor (same executor when resolution exists)
    // - Early fill path (!resolution): use executor with trackedOrder.orderId
    const resolvedSession = resolution?.orderId
      ? resolvedExecutor?.getSession(resolution.orderId) ||
        executor?.getSession(resolution.orderId)
      : trackedOrder?.orderId && executor
      ? executor.getSession(trackedOrder.orderId)
      : undefined;

    // Guard: prevent state mutation when account labels don't match
    if (
      resolvedSession?.accountLabel &&
      resolvedSession.accountLabel !== fill.accountLabel
    ) {
      this.recordOrphanedFill(
        {
          ...fill,
          orderId: resolution?.orderId,
        },
        'account_boundary_violation',
      );

      return;
    }

    if (trackedOrder && fill.status) {
      this.exchangeOrderTrackerService?.upsertOrder({
        ...trackedOrder,
        clientOrderId: fill.clientOrderId || trackedOrder.clientOrderId,
        cumulativeFilledQty: fill.cumulativeQty || trackedOrder.cumulativeFilledQty,
        status: fill.status,
        updatedAt: fill.receivedAt,
      });
    }

    const routedFill = this.normalizeFillForDispatch(fill, trackedOrder);

    if (!routedFill) {
      return;
    }

    if (!resolution && trackedOrder && executor) {
      await executor.onFill({
        orderId: trackedOrder.orderId,
        exchangeOrderId: fill.exchangeOrderId,
        clientOrderId: fill.clientOrderId || trackedOrder.clientOrderId,
        ...routedFill,
      });

      return;
    }

    if (!resolution) {
      this.recordOrphanedFill(fill, 'unresolved_order');

      return;
    }

    if (!executor) {
      this.recordOrphanedFill(
        {
          ...fill,
          orderId: resolution.orderId,
        },
        'missing_executor',
      );

      return;
    }

    await executor.onFill({
      orderId: resolution.orderId,
      exchangeOrderId: fill.exchangeOrderId,
      clientOrderId: fill.clientOrderId,
      ...routedFill,
    });
  }

  private extractFillCandidate(
    event: PrivateStreamEvent,
  ): RoutedFillCandidate | null {
    const eventType = String(event.eventType || '').toLowerCase();
    const payload = event.payload || {};
    const status = this.normalizeStatus(
      this.pickString(payload, [
        'status',
        'state',
        'orderStatus',
        'order.status',
      ]),
    );
    const isPotentialFill =
      eventType.includes('fill') ||
      eventType.includes('trade') ||
      eventType.includes('execution') ||
      status === 'partially_filled' ||
      status === 'filled';

    if (!isPotentialFill) {
      return null;
    }

    const clientOrderId = this.pickString(payload, [
      'clientOrderId',
      'clientOid',
      'client_order_id',
      'order.clientOrderId',
      'order.clientOid',
    ]);
    const exchangeOrderId = this.pickString(payload, [
      'exchangeOrderId',
      'orderId',
      'id',
      'order.id',
      'trade.orderId',
    ]);
    const pair = this.pickString(payload, [
      'pair',
      'symbol',
      'market',
      'order.symbol',
    ]);

    if (!clientOrderId && !exchangeOrderId) {
      return null;
    }

    const qty = this.pickNumberField(payload, [
      'filled',
      'fillQty',
      'amount',
      'qty',
      'trade.amount',
    ]);

    return {
      exchange: event.exchange,
      accountLabel: event.accountLabel,
      pair,
      exchangeOrderId,
      clientOrderId,
      fillId: this.pickString(payload, [
        'fillId',
        'tradeId',
        'executionId',
        'execId',
        'trade.id',
      ]),
      side: this.normalizeSide(
        this.pickString(payload, ['side', 'order.side', 'trade.side']),
      ),
      price: this.pickNumberString(payload, [
        'price',
        'avgPrice',
        'average',
        'trade.price',
      ]),
      qty: qty?.value,
      cumulativeQty: qty?.kind === 'cumulative' ? qty.value : undefined,
      qtyKind: qty?.kind,
      status,
      receivedAt: event.receivedAt,
      payload,
    };
  }

  private normalizeStatus(
    status: string | undefined,
  ): RoutedFillCandidate['status'] | undefined {
    const value = String(status || '').toLowerCase();

    if (value === 'open' || value === 'new') {
      return 'open';
    }
    if (value === 'partially_filled' || value === 'partially-filled') {
      return 'partially_filled';
    }
    if (value === 'filled' || value === 'closed') {
      return 'filled';
    }
    if (value === 'canceled' || value === 'cancelled') {
      return 'cancelled';
    }
    if (!value) {
      return undefined;
    }

    return 'failed';
  }

  private normalizeSide(
    side: string | undefined,
  ): RoutedFillCandidate['side'] | undefined {
    const value = String(side || '').toLowerCase();

    if (value === 'buy' || value === 'sell') {
      return value;
    }

    return undefined;
  }

  private pickString(
    payload: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = this.getValue(payload, key);

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return undefined;
  }

  private pickNumberString(
    payload: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    return this.pickNumberField(payload, keys)?.value;
  }

  private pickNumberField(
    payload: Record<string, unknown>,
    keys: string[],
  ): { value: string; kind: 'delta' | 'cumulative' } | undefined {
    for (const key of keys) {
      const value = this.getValue(payload, key);
      const normalizedKey = key.toLowerCase();
      const kind = normalizedKey === 'filled' ? 'cumulative' : 'delta';

      if (typeof value === 'string' && value.trim().length > 0) {
        return {
          value: value.trim(),
          kind,
        };
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return {
          value: String(value),
          kind,
        };
      }
    }

    return undefined;
  }

  private normalizeFillForDispatch(
    fill: RoutedFillCandidate,
    trackedOrder?: {
      clientOrderId?: string;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
      cumulativeFilledQty?: string;
    },
  ):
    | {
        fillId?: string;
        side?: 'buy' | 'sell';
        price?: string;
        qty?: string;
        cumulativeQty?: string;
        receivedAt: string;
        payload: Record<string, unknown>;
      }
    | null {
    const side = fill.side || trackedOrder?.side;
    const price = fill.price || trackedOrder?.price;
    let qty = fill.qty;
    const cumulativeQty = fill.cumulativeQty;

    if (
      trackedOrder &&
      fill.qtyKind === 'cumulative' &&
      cumulativeQty &&
      this.isPositiveDelta(cumulativeQty, trackedOrder.cumulativeFilledQty)
    ) {
      qty = new BigNumber(cumulativeQty)
        .minus(trackedOrder.cumulativeFilledQty || '0')
        .toFixed();
    } else if (fill.qtyKind === 'cumulative') {
      return null;
    }

    if (!qty) {
      return null;
    }

    return {
      fillId: fill.fillId,
      side,
      price,
      qty,
      cumulativeQty,
      receivedAt: fill.receivedAt,
      payload: fill.payload,
    };
  }

  private isPositiveDelta(current: string, previous?: string): boolean {
    const currentValue = new BigNumber(current);
    const previousValue = new BigNumber(previous || '0');

    return (
      currentValue.isFinite() &&
      previousValue.isFinite() &&
      currentValue.isGreaterThan(previousValue)
    );
  }

  private getValue(payload: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = payload;

    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private recordOrphanedFill(
    fill: RoutedFillCandidate,
    reason: OrphanedFillEvent['reason'],
  ): void {
    const orphanedFill: OrphanedFillEvent = {
      ...fill,
      reason,
    };

    this.orphanedFills.push(orphanedFill);
    if (this.orphanedFills.length > 100) {
      this.orphanedFills.shift();
    }

    this.logger.warn(
      `Orphaned fill requires manual review exchange=${fill.exchange} pair=${
        fill.pair || ''
      } clientOrderId=${fill.clientOrderId || ''} exchangeOrderId=${
        fill.exchangeOrderId || ''
      } reason=${reason}`,
    );
  }

  private toKey(exchange: string, accountLabel: string): string {
    return `${exchange}:${accountLabel}`;
  }
}

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { MarketMakingEventBus } from '../events/market-making-event-bus.service';
import { FillRoutingService } from '../execution/fill-routing.service';
import { ExecutorRegistry } from '../strategy/execution/executor-registry';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';
import { TickComponent } from '../tick/tick-component.interface';
import { UserStreamEvent } from '../user-stream';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';

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
export class UserStreamTrackerService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private static readonly SILENT_MS = 30_000;
  private readonly logger = new CustomLogger(UserStreamTrackerService.name);
  private readonly queue: UserStreamEvent[] = [];
  private readonly latestByKey = new Map<string, UserStreamEvent>();
  private readonly orphanedFills: OrphanedFillEvent[] = [];
  private readonly lastRecvTimeByKey = new Map<string, number>();
  private readonly healthByKey = new Map<
    string,
    'healthy' | 'degraded' | 'silent'
  >();
  private readonly latestFillFingerprintByOrder = new Map<string, string>();
  private readonly latestTradeCumulativeQtyByOrder = new Map<string, string>();
  private duplicateFillSuppressionCount = 0;
  private drainScheduled = false;
  private drainInProgress = false;

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
    @Optional()
    private readonly fillRoutingService?: FillRoutingService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
    @Optional()
    private readonly executorRegistry?: ExecutorRegistry,
    @Optional()
    private readonly balanceStateCacheService?: BalanceStateCacheService,
    @Optional()
    private readonly marketMakingEventBus?: MarketMakingEventBus,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register('user-stream-tracker', this, 2);
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('user-stream-tracker');
  }

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    this.queue.length = 0;
    this.orphanedFills.length = 0;
    this.lastRecvTimeByKey.clear();
    this.healthByKey.clear();
    this.latestFillFingerprintByOrder.clear();
    this.latestTradeCumulativeQtyByOrder.clear();
    this.duplicateFillSuppressionCount = 0;
  }

  async health(): Promise<boolean> {
    return true;
  }

  queueAccountEvent(event: UserStreamEvent): void {
    this.queue.push(event);
    this.lastRecvTimeByKey.set(
      this.toKey(event.exchange, event.accountLabel),
      Date.now(),
    );
    this.exchangeOrderTrackerService?.markUserStreamActivity(
      event.exchange,
      event.accountLabel,
    );
    this.updateStreamHealth(event.exchange, event.accountLabel);
    this.scheduleDrain();
  }

  getLatestEvent(
    exchange: string,
    accountLabel: string,
  ): UserStreamEvent | undefined {
    return this.latestByKey.get(this.toKey(exchange, accountLabel));
  }

  getLastRecvTime(exchange: string, accountLabel: string): number | undefined {
    return this.lastRecvTimeByKey.get(this.toKey(exchange, accountLabel));
  }

  isSilent(
    exchange: string,
    accountLabel: string,
    maxSilentMs: number,
  ): boolean {
    const lastRecvTime = this.getLastRecvTime(exchange, accountLabel);

    return (
      lastRecvTime === undefined || Date.now() - lastRecvTime > maxSilentMs
    );
  }

  getOrphanedFills(): OrphanedFillEvent[] {
    return [...this.orphanedFills];
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  getDuplicateFillSuppressionCount(): number {
    return this.duplicateFillSuppressionCount;
  }

  async onTick(_: string): Promise<void> {
    await this.flushPendingEvents();
    this.refreshTrackedHealthStates();
  }

  private async flushPendingEvents(): Promise<void> {
    if (this.drainInProgress) {
      return;
    }

    this.drainInProgress = true;
    const queueDepthStart = this.queue.length;
    let processedCount = 0;
    const startedAtMs = Date.now();

    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift();

        if (!event) {
          continue;
        }

        processedCount += 1;

        this.latestByKey.set(
          this.toKey(event.exchange, event.accountLabel),
          event,
        );

        if (event.kind === 'balance') {
          this.balanceStateCacheService?.applyBalanceUpdate({
            exchange: event.exchange,
            accountLabel: event.accountLabel,
            asset: event.payload.asset,
            free: event.payload.free,
            used: event.payload.used,
            total: event.payload.total,
            source: event.payload.source,
            freshnessTimestamp: event.receivedAt,
          });
          continue;
        }

        const fill = this.extractFillCandidate(event);

        if (!fill) {
          continue;
        }

        await this.routeFillCandidate(fill);
      }
    } finally {
      if (queueDepthStart > 0 || processedCount > 0) {
        this.runtimeTimingService?.recordDuration(
          'user-stream.drain',
          Date.now() - startedAtMs,
          {
            duplicateFillSuppressionCount: this.duplicateFillSuppressionCount,
            processedCount,
            queueDepthEnd: this.queue.length,
            queueDepthStart,
          },
          { warnThresholdMs: 250 },
        );
      }

      this.drainInProgress = false;
    }
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) {
      return;
    }

    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      this.flushPendingEvents().catch((error) => {
        this.logger.error(`Drain failed: ${error}`);
      });
    });
  }

  private async routeFillCandidate(fill: RoutedFillCandidate): Promise<void> {
    if (this.isDuplicateFill(fill)) {
      return;
    }

    const resolution = await this.fillRoutingService?.resolveOrderForFill({
      clientOrderId: fill.clientOrderId,
      exchangeOrderId: fill.exchangeOrderId,
    });
    const trackedOrder = fill.exchangeOrderId
      ? this.exchangeOrderTrackerService?.getByExchangeOrderId(
          fill.exchange,
          fill.exchangeOrderId,
          fill.accountLabel,
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
    const resolvedSession = resolution?.orderId
      ? resolvedExecutor?.getSession(resolution.orderId) ||
        executor?.getSession(resolution.orderId)
      : trackedOrder?.orderId && executor
      ? executor.getSession(trackedOrder.orderId)
      : undefined;

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
      this.exchangeOrderTrackerService?.upsertOrder(
        {
          ...trackedOrder,
          clientOrderId: fill.clientOrderId || trackedOrder.clientOrderId,
          cumulativeFilledQty:
            fill.cumulativeQty || trackedOrder.cumulativeFilledQty,
          status: fill.status,
          createdAt: trackedOrder.createdAt,
          updatedAt: fill.receivedAt,
        },
        'ws',
      );
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
        accountLabel: fill.accountLabel,
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
      accountLabel: fill.accountLabel,
      ...routedFill,
    });
  }

  private extractFillCandidate(
    event: UserStreamEvent,
  ): RoutedFillCandidate | null {
    const eventType = event.kind.toLowerCase();
    const payload = this.normalizeEventPayload(event);
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

    const cumulativeQty = this.pickNumberString(payload, [
      'cumulativeQty',
      'filled',
    ]);
    const deltaQty = this.pickNumberString(payload, [
      'fillQty',
      'amount',
      'qty',
      'trade.amount',
    ]);
    const qtyKind = deltaQty
      ? 'delta'
      : cumulativeQty
      ? 'cumulative'
      : undefined;
    const qtyValue = deltaQty || cumulativeQty;

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
      qty: qtyValue,
      cumulativeQty,
      qtyKind,
      status,
      receivedAt: event.receivedAt,
      payload,
    };
  }

  private normalizeEventPayload(
    event: UserStreamEvent,
  ): Record<string, unknown> {
    if (event.kind === 'order' || event.kind === 'trade') {
      return {
        ...(event.payload.raw || {}),
        pair: event.payload.pair,
        exchangeOrderId: event.payload.exchangeOrderId,
        clientOrderId: event.payload.clientOrderId,
        side: event.payload.side,
        price: event.payload.price,
        cumulativeQty: event.payload.cumulativeQty,
        status: event.kind === 'order' ? event.payload.status : undefined,
        fillId: event.kind === 'trade' ? event.payload.fillId : undefined,
        qty: event.kind === 'trade' ? event.payload.qty : undefined,
      };
    }

    return { ...event.payload };
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
      const kind =
        normalizedKey === 'filled' || normalizedKey === 'cumulativeqty'
          ? 'cumulative'
          : 'delta';

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
      orderId?: string;
      clientOrderId?: string;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
      cumulativeFilledQty?: string;
    },
  ): {
    fillId?: string;
    side?: 'buy' | 'sell';
    price?: string;
    qty?: string;
    cumulativeQty?: string;
    receivedAt: string;
    payload: Record<string, unknown>;
  } | null {
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

  private isDuplicateFill(fill: RoutedFillCandidate): boolean {
    const orderKey = [
      fill.exchange,
      fill.accountLabel,
      fill.exchangeOrderId || '',
      fill.clientOrderId || '',
    ].join(':');

    if (orderKey === ':::') {
      return false;
    }

    const fingerprint = [
      fill.fillId || '',
      fill.cumulativeQty || '',
      fill.qty || '',
    ].join(':');
    const previous = this.latestFillFingerprintByOrder.get(orderKey);

    if (previous === fingerprint) {
      this.duplicateFillSuppressionCount += 1;

      return true;
    }

    if (
      fill.status &&
      fill.cumulativeQty &&
      this.wasTradeFillAlreadyObserved(orderKey, fill.cumulativeQty)
    ) {
      this.duplicateFillSuppressionCount += 1;

      return true;
    }

    this.latestFillFingerprintByOrder.set(orderKey, fingerprint);

    if (!fill.status && fill.cumulativeQty) {
      this.latestTradeCumulativeQtyByOrder.set(orderKey, fill.cumulativeQty);
    }

    return false;
  }

  private wasTradeFillAlreadyObserved(
    orderKey: string,
    cumulativeQty: string,
  ): boolean {
    const previous = this.latestTradeCumulativeQtyByOrder.get(orderKey);

    if (!previous) {
      return false;
    }

    try {
      return new BigNumber(previous).isGreaterThanOrEqualTo(cumulativeQty);
    } catch {
      return false;
    }
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

  private refreshTrackedHealthStates(): void {
    for (const key of this.lastRecvTimeByKey.keys()) {
      const [exchange, accountLabel] = key.split(':');

      this.updateStreamHealth(exchange, accountLabel || 'default');
    }
  }

  private updateStreamHealth(exchange: string, accountLabel: string): void {
    const key = this.toKey(exchange, accountLabel);
    const previousHealth = this.healthByKey.get(key);
    const health = this.resolveStreamHealth(
      this.lastRecvTimeByKey.get(key),
      Date.now(),
    );

    if (previousHealth === health) {
      return;
    }

    this.healthByKey.set(key, health);
    this.marketMakingEventBus?.emitStreamHealthChanged({
      exchange,
      accountLabel,
      previousHealth,
      health,
      changedAt: getRFC3339Timestamp(),
    });
  }

  private resolveStreamHealth(
    lastRecvTimeMs: number | undefined,
    nowMs: number,
  ): 'healthy' | 'degraded' | 'silent' {
    if (lastRecvTimeMs === undefined) {
      return 'silent';
    }

    if (nowMs - lastRecvTimeMs <= BalanceStateCacheService.STALE_MS) {
      return 'healthy';
    }

    if (nowMs - lastRecvTimeMs <= UserStreamTrackerService.SILENT_MS) {
      return 'degraded';
    }

    return 'silent';
  }

  private toKey(exchange: string, accountLabel: string): string {
    return `${exchange}:${accountLabel}`;
  }
}

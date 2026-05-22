import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';

type BookLevel = [number, number];

export type MidPriceSample = {
  price: number;
  ts: number;
  sequence: number;
};

type OrderBookState = {
  bids: BookLevel[];
  asks: BookLevel[];
  sequence: number;
};

type OrderBookDelta = {
  bids: BookLevel[];
  asks: BookLevel[];
  sequence: number;
};

@Injectable()
export class OrderBookTrackerService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new CustomLogger(OrderBookTrackerService.name);
  private readonly books = new Map<string, OrderBookState>();
  private readonly snapshotQueue = new Map<string, OrderBookState[]>();
  private readonly lastUpdateAtByKey = new Map<string, number>();
  private readonly midPriceHistoryByKey = new Map<string, MidPriceSample[]>();
  private drainScheduled = false;
  private readonly midPriceHistoryRetentionMs = 10 * 60 * 1000;

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register('order-book-tracker', this, 1);
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('order-book-tracker');
  }

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    this.snapshotQueue.clear();
    this.lastUpdateAtByKey.clear();
    this.midPriceHistoryByKey.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }

  queueSnapshot(
    exchange: string,
    pair: string,
    snapshot: OrderBookState,
  ): void {
    const key = this.toKey(exchange, pair);
    const queue = this.snapshotQueue.get(key) || [];

    queue.push(snapshot);
    this.snapshotQueue.set(key, queue);
    this.scheduleDrain();
  }

  queueDelta(_exchange: string, _pair: string, _delta: OrderBookDelta): void {
    this.logger.debug('queueDelta is a no-op; deltas are no longer processed');
  }

  getOrderBook(exchange: string, pair: string): OrderBookState | undefined {
    return this.books.get(this.toKey(exchange, pair));
  }

  getLastUpdateAt(exchange: string, pair: string): number | undefined {
    return this.lastUpdateAtByKey.get(this.toKey(exchange, pair));
  }

  getMidPriceHistory(
    exchange: string,
    pair: string,
    windowMs: number,
  ): MidPriceSample[] {
    const key = this.toKey(exchange, pair);
    const history = this.midPriceHistoryByKey.get(key) || [];
    const cutoff = Date.now() - Math.max(0, Number(windowMs || 0));

    return history.filter((sample) => sample.ts >= cutoff);
  }

  isStale(exchange: string, pair: string, maxAgeMs: number): boolean {
    const lastUpdate = this.lastUpdateAtByKey.get(this.toKey(exchange, pair));

    if (lastUpdate === undefined) {
      return true;
    }

    return Date.now() - lastUpdate > maxAgeMs;
  }

  async onTick(_: string): Promise<void> {
    this.flushPendingSnapshots();
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) {
      return;
    }
    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      this.flushPendingSnapshots();
    });
  }

  private flushPendingSnapshots(): void {
    const keys = [...this.snapshotQueue.keys()];

    for (const key of keys) {
      const snapshots = this.snapshotQueue.get(key) || [];

      if (snapshots.length > 0) {
        const lastSnapshot = snapshots[snapshots.length - 1];
        const bids = [...lastSnapshot.bids];
        const asks = [...lastSnapshot.asks];

        if (this.isCrossed(bids, asks)) {
          this.logger.warn(
            `Rejected crossed order book ${key} bestBid=${bids[0]?.[0]} bestAsk=${asks[0]?.[0]}`,
          );
        } else {
          const now = Date.now();

          this.books.set(key, {
            bids,
            asks,
            sequence: lastSnapshot.sequence,
          });
          this.lastUpdateAtByKey.set(key, now);
          this.recordMidPrice(key, bids, asks, lastSnapshot.sequence, now);
        }
      }

      this.snapshotQueue.delete(key);
    }
  }

  private isCrossed(bids: BookLevel[], asks: BookLevel[]): boolean {
    if (bids.length === 0 || asks.length === 0) {
      return false;
    }
    const bestBid = bids[0][0];
    const bestAsk = asks[0][0];

    return bestBid >= bestAsk;
  }

  private recordMidPrice(
    key: string,
    bids: BookLevel[],
    asks: BookLevel[],
    sequence: number,
    ts: number,
  ): void {
    const bestBid = this.toPositiveNumber(bids[0]?.[0]);
    const bestAsk = this.toPositiveNumber(asks[0]?.[0]);

    if (bestBid === undefined || bestAsk === undefined) {
      return;
    }

    const midPrice = (bestBid + bestAsk) / 2;
    const cutoff = ts - this.midPriceHistoryRetentionMs;
    const history = (this.midPriceHistoryByKey.get(key) || []).filter(
      (sample) => sample.ts >= cutoff,
    );

    history.push({ price: midPrice, ts, sequence });
    this.midPriceHistoryByKey.set(key, history);
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }

  private toKey(exchange: string, pair: string): string {
    return `${exchange}:${pair}`;
  }
}

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';

import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';

type BookLevel = [number, number];

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
  private readonly books = new Map<string, OrderBookState>();
  private readonly snapshotQueue = new Map<string, OrderBookState[]>();
  private readonly deltaQueue = new Map<string, OrderBookDelta[]>();

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
    this.deltaQueue.clear();
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
  }

  queueDelta(exchange: string, pair: string, delta: OrderBookDelta): void {
    const key = this.toKey(exchange, pair);
    const queue = this.deltaQueue.get(key) || [];

    queue.push(delta);
    this.deltaQueue.set(key, queue);
  }

  getOrderBook(exchange: string, pair: string): OrderBookState | undefined {
    return this.books.get(this.toKey(exchange, pair));
  }

  async onTick(_: string): Promise<void> {
    const keys = new Set<string>([
      ...this.snapshotQueue.keys(),
      ...this.deltaQueue.keys(),
    ]);

    for (const key of keys) {
      const snapshots = this.snapshotQueue.get(key) || [];
      const deltas = this.deltaQueue.get(key) || [];

      if (snapshots.length > 0) {
        const lastSnapshot = snapshots[snapshots.length - 1];

        this.books.set(key, {
          bids: [...lastSnapshot.bids],
          asks: [...lastSnapshot.asks],
          sequence: lastSnapshot.sequence,
        });
      }

      for (const delta of deltas) {
        const existing = this.books.get(key);

        if (!existing || delta.sequence <= existing.sequence) {
          continue;
        }
        this.books.set(key, {
          bids: this.mergeSide(existing.bids, delta.bids, true),
          asks: this.mergeSide(existing.asks, delta.asks, false),
          sequence: delta.sequence,
        });
      }

      this.snapshotQueue.delete(key);
      this.deltaQueue.delete(key);
    }
  }

  private mergeSide(
    current: BookLevel[],
    updates: BookLevel[],
    isBid: boolean,
  ): BookLevel[] {
    const map = new Map<number, number>();

    current.forEach(([price, qty]) => map.set(price, qty));
    updates.forEach(([price, qty]) => {
      if (qty <= 0) {
        map.delete(price);
      } else {
        map.set(price, qty);
      }
    });

    const sorted = [...map.entries()].sort((a, b) =>
      isBid ? b[0] - a[0] : a[0] - b[0],
    );

    return sorted.map(([price, qty]) => [price, qty]);
  }

  private toKey(exchange: string, pair: string): string {
    return `${exchange}:${pair}`;
  }
}

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { MarketdataService } from '../../data/market-data/market-data.service';
import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { OrderBookTrackerService } from './order-book-tracker.service';

@Injectable()
export class OrderBookIngestionService implements OnModuleDestroy {
  private readonly logger = new CustomLogger(OrderBookIngestionService.name);
  private readonly mmLog = this.logger.marketMaking();
  private readonly consumerIdByKey = new Map<string, string>();
  private readonly refCountByKey = new Map<string, number>();

  constructor(
    private readonly marketdataService: MarketdataService,
    private readonly exchangeConnectorAdapterService: ExchangeConnectorAdapterService,
    private readonly orderBookTrackerService: OrderBookTrackerService,
  ) {}

  ensureSubscribed(exchange: string, pair: string): void {
    const key = this.toKey(exchange, pair);
    const currentRefCount = this.refCountByKey.get(key) || 0;

    this.refCountByKey.set(key, currentRefCount + 1);

    if (currentRefCount > 0) {
      return;
    }

    const consumerId = this.toConsumerId(key);

    this.consumerIdByKey.set(key, consumerId);
    void this.seedFromRestOrderBook(exchange, pair);
    this.marketdataService.subscribeOrderBook(
      exchange,
      pair,
      consumerId,
      (orderBook) => {
        const bids = this.asBookLevels(orderBook?.bids);
        const asks = this.asBookLevels(orderBook?.asks);

        if (bids.length === 0 || asks.length === 0) {
          this.mmLog.warn(
            'order book stream unusable',
            {
              reason: 'unusable_streamed_order_book',
              exchange,
              pair,
              bids: bids.length,
              asks: asks.length,
            },
            {
              onceKey: `order-book-stream-unusable:${exchange}:${pair}`,
              windowMs: 60_000,
            },
          );
        }

        this.orderBookTrackerService.queueSnapshot(exchange, pair, {
          bids,
          asks,
          sequence: this.resolveSequence(orderBook),
        });
      },
    );

    this.mmLog.info('order book subscribed', { exchange, pair });
  }

  releaseSubscription(exchange: string, pair: string): void {
    const key = this.toKey(exchange, pair);
    const currentRefCount = this.refCountByKey.get(key) || 0;

    if (currentRefCount <= 1) {
      this.refCountByKey.delete(key);
      const consumerId = this.consumerIdByKey.get(key);

      if (consumerId) {
        this.marketdataService.unsubscribeOrderBook(exchange, pair, consumerId);
      }

      this.consumerIdByKey.delete(key);
      this.mmLog.info('order book released', { exchange, pair });

      return;
    }

    this.refCountByKey.set(key, currentRefCount - 1);
  }

  onModuleDestroy(): void {
    for (const [key, consumerId] of this.consumerIdByKey.entries()) {
      const [exchange, pair] = key.split(':');

      if (exchange && pair) {
        this.marketdataService.unsubscribeOrderBook(exchange, pair, consumerId);
      }
    }

    this.consumerIdByKey.clear();
    this.refCountByKey.clear();
  }

  private async seedFromRestOrderBook(
    exchange: string,
    pair: string,
  ): Promise<void> {
    try {
      const orderBook =
        await this.exchangeConnectorAdapterService.fetchOrderBook(
          exchange,
          pair,
        );

      if (this.orderBookTrackerService.getOrderBook(exchange, pair)) {
        this.mmLog.debug('order book seed skipped', {
          reason: 'live_book_exists',
          exchange,
          pair,
        });

        return;
      }

      const bids = this.asBookLevels(orderBook?.bids);
      const asks = this.asBookLevels(orderBook?.asks);

      if (bids.length === 0 || asks.length === 0) {
        this.mmLog.warn(
          'order book seed unusable',
          {
            reason: 'unusable_rest_order_book',
            exchange,
            pair,
            bids: bids.length,
            asks: asks.length,
          },
          {
            onceKey: `order-book-seed-unusable:${exchange}:${pair}`,
            windowMs: 60_000,
          },
        );
      }

      this.orderBookTrackerService.queueSnapshot(exchange, pair, {
        bids,
        asks,
        sequence: this.resolveSequence(orderBook),
      });
      this.mmLog.info('order book seeded', { exchange, pair });
    } catch (error) {
      this.mmLog.warn(
        'order book seed failed',
        {
          reason: 'rest_seed_failed',
          exchange,
          pair,
          error: error instanceof Error ? error.message : String(error),
        },
        {
          onceKey: `order-book-seed-failed:${exchange}:${pair}`,
          windowMs: 60_000,
        },
      );
    }
  }

  private resolveSequence(orderBook: any): number {
    const sequence = Number(
      orderBook?.nonce ?? orderBook?.timestamp ?? Date.now(),
    );

    return Number.isFinite(sequence) ? sequence : Date.now();
  }

  private asBookLevels(value: unknown): [number, number][] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((level): level is [number, number] => {
        return (
          Array.isArray(level) &&
          level.length >= 2 &&
          Number.isFinite(Number(level[0])) &&
          Number.isFinite(Number(level[1]))
        );
      })
      .map((level) => [Number(level[0]), Number(level[1])]);
  }

  private toConsumerId(key: string): string {
    return `mm-order-book:${createHash('sha1').update(key).digest('hex')}`;
  }

  private toKey(exchange: string, pair: string): string {
    return `${exchange.trim().toLowerCase()}:${pair.trim().toUpperCase()}`;
  }
}

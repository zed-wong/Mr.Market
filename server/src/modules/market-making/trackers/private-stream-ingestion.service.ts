import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { PrivateStreamTrackerService } from './private-stream-tracker.service';

type WatchOrdersCapableExchange = {
  watchOrders?: (
    symbol?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
};

type OrderWatcherParams = {
  exchange: string;
  accountLabel?: string;
  symbol?: string;
  params?: Record<string, unknown>;
};

type OrderWatcherState = {
  refCount: number;
};

@Injectable()
export class PrivateStreamIngestionService implements OnModuleDestroy {
  private readonly logger = new CustomLogger(
    PrivateStreamIngestionService.name,
  );
  private readonly activeWatchers = new Map<string, OrderWatcherState>();

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    private readonly privateStreamTrackerService: PrivateStreamTrackerService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.stopAllWatchers();
  }

  startOrderWatcher(params: OrderWatcherParams): void {
    const key = this.toWatcherKey(params);
    const state = this.activeWatchers.get(key);

    if (state) {
      state.refCount += 1;

      return;
    }

    this.activeWatchers.set(key, { refCount: 1 });
    void this.runOrderWatcher(key, params);
  }

  stopOrderWatcher(params: OrderWatcherParams): void {
    const key = this.toWatcherKey(params);
    const state = this.activeWatchers.get(key);

    if (!state) {
      return;
    }

    if (state.refCount <= 1) {
      this.activeWatchers.delete(key);

      return;
    }

    state.refCount -= 1;
  }

  stopAllWatchers(): void {
    this.activeWatchers.clear();
  }

  isWatching(params: OrderWatcherParams): boolean {
    return this.activeWatchers.has(this.toWatcherKey(params));
  }

  getActiveWatcherCount(): number {
    return this.activeWatchers.size;
  }

  getWatcherRefCount(params: OrderWatcherParams): number {
    return this.activeWatchers.get(this.toWatcherKey(params))?.refCount || 0;
  }

  private async runOrderWatcher(
    key: string,
    params: OrderWatcherParams,
  ): Promise<void> {
    let consecutiveFailures = 0;

    while (this.activeWatchers.has(key)) {
      try {
        const exchange = this.exchangeInitService.getExchange(
          params.exchange,
          params.accountLabel || 'default',
        ) as WatchOrdersCapableExchange;

        if (typeof exchange.watchOrders !== 'function') {
          this.logger.warn(
            `Exchange ${
              params.exchange
            } does not support watchOrders() for account ${
              params.accountLabel || 'default'
            }`,
          );
          this.activeWatchers.delete(key);

          return;
        }

        const watchedOrders = await exchange.watchOrders(
          params.symbol,
          undefined,
          undefined,
          params.params,
        );

        for (const payload of this.normalizeOrders(watchedOrders)) {
          this.privateStreamTrackerService.queueAccountEvent({
            exchange: params.exchange,
            accountLabel: params.accountLabel || 'default',
            eventType: 'watch_orders',
            payload,
            receivedAt: getRFC3339Timestamp(),
          });
        }
        consecutiveFailures = 0;
      } catch (error) {
        if (!this.activeWatchers.has(key)) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        const trace = error instanceof Error ? error.stack : undefined;

        this.logger.warn(
          `watchOrders loop failed for ${params.exchange}:${
            params.accountLabel || 'default'
          }${params.symbol ? `:${params.symbol}` : ''}: ${message}`,
          trace,
        );

        consecutiveFailures += 1;
        const delayMs = this.getBackoffDelayMs(consecutiveFailures);

        if (delayMs > 0) {
          await this.sleep(delayMs);
        }
      }
    }
  }

  private normalizeOrders(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      );
    }

    if (value && typeof value === 'object') {
      return [value as Record<string, unknown>];
    }

    return [];
  }

  private toWatcherKey(params: OrderWatcherParams): string {
    return [
      params.exchange,
      params.accountLabel || 'default',
      params.symbol || '*',
    ].join(':');
  }

  private getBackoffDelayMs(consecutiveFailures: number): number {
    if (consecutiveFailures <= 1) {
      return 0;
    }

    return Math.min(1000 * 2 ** (consecutiveFailures - 2), 30000);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

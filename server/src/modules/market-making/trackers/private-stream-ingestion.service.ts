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

@Injectable()
export class PrivateStreamIngestionService implements OnModuleDestroy {
  private readonly logger = new CustomLogger(PrivateStreamIngestionService.name);
  private readonly activeWatchers = new Map<string, boolean>();

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    private readonly privateStreamTrackerService: PrivateStreamTrackerService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.stopAllWatchers();
  }

  startOrderWatcher(params: OrderWatcherParams): void {
    const key = this.toWatcherKey(params);

    if (this.activeWatchers.get(key)) {
      return;
    }

    this.activeWatchers.set(key, true);
    void this.runOrderWatcher(key, params);
  }

  stopOrderWatcher(params: OrderWatcherParams): void {
    this.activeWatchers.delete(this.toWatcherKey(params));
  }

  stopAllWatchers(): void {
    this.activeWatchers.clear();
  }

  isWatching(params: OrderWatcherParams): boolean {
    return this.activeWatchers.has(this.toWatcherKey(params));
  }

  private async runOrderWatcher(
    key: string,
    params: OrderWatcherParams,
  ): Promise<void> {
    while (this.activeWatchers.get(key)) {
      try {
        const exchange = this.exchangeInitService.getExchange(
          params.exchange,
          params.accountLabel || 'default',
        ) as WatchOrdersCapableExchange;

        if (typeof exchange.watchOrders !== 'function') {
          this.logger.warn(
            `Exchange ${params.exchange} does not support watchOrders() for account ${
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
      } catch (error) {
        if (!this.activeWatchers.get(key)) {
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

        await this.sleep(1000);
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

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

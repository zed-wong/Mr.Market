import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import {
  UserStreamEventNormalizer,
  UserStreamNormalizerRegistryService,
} from '../user-stream';
import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { UserStreamTrackerService } from './user-stream-tracker.service';

type WatchOrdersCapableExchange = {
  watchOrders?: (
    symbol?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  watchMyTrades?: (
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
  generation: number;
};

@Injectable()
export class UserStreamIngestionService implements OnModuleDestroy {
  private readonly logger = new CustomLogger(UserStreamIngestionService.name);
  private readonly activeWatchers = new Map<string, OrderWatcherState>();
  private readonly activeTradeWatchers = new Map<string, OrderWatcherState>();
  private readonly activeBalanceWatchers = new Map<string, OrderWatcherState>();
  private generationCounter = 0;

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    private readonly userStreamTrackerService: UserStreamTrackerService,
    @Optional()
    private readonly balanceStateCacheService?: BalanceStateCacheService,
    @Optional()
    private readonly userStreamNormalizerRegistryService?: UserStreamNormalizerRegistryService,
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

    const generation = ++this.generationCounter;

    this.activeWatchers.set(key, { refCount: 1, generation });
    void this.runOrderWatcher(key, generation, params);
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

  startTradeWatcher(params: OrderWatcherParams): void {
    const key = this.toWatcherKey(params);
    const state = this.activeTradeWatchers.get(key);

    if (state) {
      state.refCount += 1;

      return;
    }

    const generation = ++this.generationCounter;

    this.activeTradeWatchers.set(key, { refCount: 1, generation });
    void this.runTradeWatcher(key, generation, params);
  }

  stopTradeWatcher(params: OrderWatcherParams): void {
    const key = this.toWatcherKey(params);
    const state = this.activeTradeWatchers.get(key);

    if (!state) {
      return;
    }

    if (state.refCount <= 1) {
      this.activeTradeWatchers.delete(key);

      return;
    }

    state.refCount -= 1;
  }

  startBalanceWatcher(params: Omit<OrderWatcherParams, 'symbol'>): void {
    const key = this.toBalanceWatcherKey(params);
    const state = this.activeBalanceWatchers.get(key);

    if (state) {
      state.refCount += 1;
      this.logger.log(
        `Reusing balance watcher for ${params.exchange}:${
          params.accountLabel || 'default'
        } refCount=${state.refCount} generation=${state.generation}`,
      );

      return;
    }

    const generation = ++this.generationCounter;

    this.activeBalanceWatchers.set(key, { refCount: 1, generation });
    this.logger.log(
      `Starting balance watcher for ${params.exchange}:${
        params.accountLabel || 'default'
      } generation=${generation}`,
    );
    void this.seedBalanceSnapshot(params)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const trace = error instanceof Error ? error.stack : undefined;

        this.logger.warn(
          `Initial fetchBalance failed for ${params.exchange}:${
            params.accountLabel || 'default'
          }: ${message}`,
          trace,
        );
      })
      .finally(() => {
        void this.runBalanceWatcher(key, generation, params);
      });
  }

  stopBalanceWatcher(params: Omit<OrderWatcherParams, 'symbol'>): void {
    const key = this.toBalanceWatcherKey(params);
    const state = this.activeBalanceWatchers.get(key);

    if (!state) {
      return;
    }

    if (state.refCount <= 1) {
      this.activeBalanceWatchers.delete(key);

      return;
    }

    state.refCount -= 1;
  }

  stopAllWatchers(): void {
    this.activeWatchers.clear();
    this.activeTradeWatchers.clear();
    this.activeBalanceWatchers.clear();
  }

  isWatching(params: OrderWatcherParams): boolean {
    return this.activeWatchers.has(this.toWatcherKey(params));
  }

  getActiveWatcherCount(): number {
    return (
      this.activeWatchers.size +
      this.activeTradeWatchers.size +
      this.activeBalanceWatchers.size
    );
  }

  getWatcherRefCount(params: OrderWatcherParams): number {
    return this.activeWatchers.get(this.toWatcherKey(params))?.refCount || 0;
  }

  getWatcherState(params: OrderWatcherParams): {
    order: boolean;
    trade: boolean;
    balance: boolean;
    orderRefCount: number;
    tradeRefCount: number;
    balanceRefCount: number;
  } {
    const watcherKey = this.toWatcherKey(params);
    const balanceKey = this.toBalanceWatcherKey(params);

    return {
      order: this.activeWatchers.has(watcherKey),
      trade: this.activeTradeWatchers.has(watcherKey),
      balance: this.activeBalanceWatchers.has(balanceKey),
      orderRefCount: this.activeWatchers.get(watcherKey)?.refCount || 0,
      tradeRefCount: this.activeTradeWatchers.get(watcherKey)?.refCount || 0,
      balanceRefCount:
        this.activeBalanceWatchers.get(balanceKey)?.refCount || 0,
    };
  }

  private isCurrentGeneration(key: string, generation: number): boolean {
    const state = this.activeWatchers.get(key);

    return Boolean(state && state.generation === generation);
  }

  private isCurrentTradeGeneration(key: string, generation: number): boolean {
    const state = this.activeTradeWatchers.get(key);

    return Boolean(state && state.generation === generation);
  }

  private isCurrentBalanceGeneration(key: string, generation: number): boolean {
    const state = this.activeBalanceWatchers.get(key);

    return Boolean(state && state.generation === generation);
  }

  private async runOrderWatcher(
    key: string,
    generation: number,
    params: OrderWatcherParams,
  ): Promise<void> {
    let consecutiveFailures = 0;

    while (this.isCurrentGeneration(key, generation)) {
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

        for (const payload of this.normalizeObjects(watchedOrders)) {
          const event = this.getNormalizer(params.exchange).normalizeOrder(
            params.exchange,
            params.accountLabel || 'default',
            {
              ...payload,
              symbol:
                (typeof payload.symbol === 'string' && payload.symbol) ||
                params.symbol,
            },
            getRFC3339Timestamp(),
          );

          if (event) {
            this.userStreamTrackerService.queueAccountEvent(event);
          }
        }

        consecutiveFailures = 0;
      } catch (error) {
        if (!this.isCurrentGeneration(key, generation)) {
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

  private async runTradeWatcher(
    key: string,
    generation: number,
    params: OrderWatcherParams,
  ): Promise<void> {
    let consecutiveFailures = 0;

    while (this.isCurrentTradeGeneration(key, generation)) {
      try {
        const exchange = this.exchangeInitService.getExchange(
          params.exchange,
          params.accountLabel || 'default',
        ) as WatchOrdersCapableExchange;

        if (typeof exchange.watchMyTrades !== 'function') {
          this.logger.warn(
            `Exchange ${
              params.exchange
            } does not support watchMyTrades() for account ${
              params.accountLabel || 'default'
            }`,
          );
          this.activeTradeWatchers.delete(key);

          return;
        }

        const watchedTrades = await exchange.watchMyTrades(
          params.symbol,
          undefined,
          undefined,
          params.params,
        );

        for (const payload of this.normalizeObjects(watchedTrades)) {
          const event = this.getNormalizer(params.exchange).normalizeTrade(
            params.exchange,
            params.accountLabel || 'default',
            {
              ...payload,
              symbol:
                (typeof payload.symbol === 'string' && payload.symbol) ||
                params.symbol,
            },
            getRFC3339Timestamp(),
          );

          if (event) {
            this.userStreamTrackerService.queueAccountEvent(event);
          }
        }

        consecutiveFailures = 0;
      } catch (error) {
        if (!this.isCurrentTradeGeneration(key, generation)) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        const trace = error instanceof Error ? error.stack : undefined;

        this.logger.warn(
          `watchMyTrades loop failed for ${params.exchange}:${
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

  private async runBalanceWatcher(
    key: string,
    generation: number,
    params: Omit<OrderWatcherParams, 'symbol'>,
  ): Promise<void> {
    let consecutiveFailures = 0;

    while (this.isCurrentBalanceGeneration(key, generation)) {
      try {
        const exchange = this.exchangeInitService.getExchange(
          params.exchange,
          params.accountLabel || 'default',
        ) as WatchOrdersCapableExchange & {
          watchBalance?: () => Promise<unknown>;
        };

        if (typeof exchange.watchBalance !== 'function') {
          this.logger.warn(
            `Exchange ${
              params.exchange
            } does not support watchBalance() for account ${
              params.accountLabel || 'default'
            }`,
          );
          this.activeBalanceWatchers.delete(key);

          return;
        }

        const watchedBalance = await exchange.watchBalance();
        const normalizedEvents = this.getNormalizer(params.exchange)
          .normalizeBalance(
            params.exchange,
            params.accountLabel || 'default',
            watchedBalance,
            getRFC3339Timestamp(),
          );

        this.logger.log(
          `watchBalance received payload for ${params.exchange}:${
            params.accountLabel || 'default'
          } normalizedEventCount=${normalizedEvents.length}`,
        );

        for (const event of normalizedEvents) {
          this.userStreamTrackerService.queueAccountEvent(event);
        }

        consecutiveFailures = 0;
      } catch (error) {
        if (!this.isCurrentBalanceGeneration(key, generation)) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        const trace = error instanceof Error ? error.stack : undefined;

        this.logger.warn(
          `watchBalance loop failed for ${params.exchange}:${
            params.accountLabel || 'default'
          }: ${message}`,
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

  private async seedBalanceSnapshot(
    params: Omit<OrderWatcherParams, 'symbol'>,
  ): Promise<void> {
    const exchange = this.exchangeInitService.getExchange(
      params.exchange,
      params.accountLabel || 'default',
    ) as {
      fetchBalance?: () => Promise<unknown>;
    };

    if (typeof exchange.fetchBalance !== 'function') {
      return;
    }

    const balance = await exchange.fetchBalance();

    if (!balance || typeof balance !== 'object') {
      return;
    }

    this.balanceStateCacheService?.applyBalanceSnapshot(
      params.exchange,
      params.accountLabel || 'default',
      balance as Record<string, any>,
      getRFC3339Timestamp(),
      'rest',
    );
    this.logger.log(
      `Seeded balance cache from fetchBalance for ${params.exchange}:${
        params.accountLabel || 'default'
      }`,
    );
  }

  private normalizeObjects(value: unknown): Array<Record<string, unknown>> {
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

  private toBalanceWatcherKey(
    params: Omit<OrderWatcherParams, 'symbol'>,
  ): string {
    return [params.exchange, params.accountLabel || 'default', 'balance'].join(
      ':',
    );
  }

  private getNormalizer(exchange: string): UserStreamEventNormalizer {
    return (
      this.userStreamNormalizerRegistryService?.getNormalizer(exchange) || {
        normalizeOrder: (
          normalizedExchange,
          accountLabel,
          rawPayload,
          receivedAt,
        ) => {
          if (
            !rawPayload ||
            typeof rawPayload !== 'object' ||
            Array.isArray(rawPayload)
          ) {
            return null;
          }

          const payload = rawPayload as Record<string, unknown>;

          return {
            exchange: normalizedExchange,
            accountLabel,
            kind: 'order' as const,
            payload: {
              pair:
                typeof payload.symbol === 'string' && payload.symbol
                  ? payload.symbol
                  : undefined,
              exchangeOrderId:
                typeof payload.id === 'string' ? payload.id : undefined,
              clientOrderId:
                typeof payload.clientOrderId === 'string'
                  ? payload.clientOrderId
                  : typeof payload.clientOid === 'string'
                  ? payload.clientOid
                  : undefined,
              side:
                payload.side === 'buy' || payload.side === 'sell'
                  ? payload.side
                  : undefined,
              status:
                typeof payload.status === 'string' ? payload.status : undefined,
              cumulativeQty:
                typeof payload.filled === 'string' ||
                typeof payload.filled === 'number'
                  ? String(payload.filled)
                  : undefined,
              price:
                typeof payload.price === 'string' ||
                typeof payload.price === 'number'
                  ? String(payload.price)
                  : undefined,
              raw: payload,
            },
            receivedAt,
          };
        },
        normalizeTrade: (
          normalizedExchange,
          accountLabel,
          rawPayload,
          receivedAt,
        ) => {
          if (
            !rawPayload ||
            typeof rawPayload !== 'object' ||
            Array.isArray(rawPayload)
          ) {
            return null;
          }

          const payload = rawPayload as Record<string, unknown>;

          return {
            exchange: normalizedExchange,
            accountLabel,
            kind: 'trade' as const,
            payload: {
              pair:
                typeof payload.symbol === 'string' && payload.symbol
                  ? payload.symbol
                  : undefined,
              exchangeOrderId:
                typeof payload.orderId === 'string'
                  ? payload.orderId
                  : typeof payload.order === 'string'
                  ? payload.order
                  : typeof payload.id === 'string'
                  ? payload.id
                  : undefined,
              clientOrderId:
                typeof payload.clientOrderId === 'string'
                  ? payload.clientOrderId
                  : typeof payload.clientOid === 'string'
                  ? payload.clientOid
                  : undefined,
              fillId:
                typeof payload.tradeId === 'string'
                  ? payload.tradeId
                  : typeof payload.id === 'string'
                  ? payload.id
                  : undefined,
              side:
                payload.side === 'buy' || payload.side === 'sell'
                  ? payload.side
                  : undefined,
              qty:
                typeof payload.amount === 'string' ||
                typeof payload.amount === 'number'
                  ? String(payload.amount)
                  : typeof payload.qty === 'string' ||
                    typeof payload.qty === 'number'
                  ? String(payload.qty)
                  : undefined,
              cumulativeQty:
                typeof payload.filled === 'string' ||
                typeof payload.filled === 'number'
                  ? String(payload.filled)
                  : undefined,
              price:
                typeof payload.price === 'string' ||
                typeof payload.price === 'number'
                  ? String(payload.price)
                  : undefined,
              raw: payload,
            },
            receivedAt,
          };
        },
        normalizeBalance: (
          normalizedExchange,
          accountLabel,
          rawPayload,
          receivedAt,
        ) => {
          if (
            !rawPayload ||
            typeof rawPayload !== 'object' ||
            Array.isArray(rawPayload)
          ) {
            return [];
          }

          const balance = rawPayload as Record<string, any>;
          const assets = new Set<string>([
            ...Object.keys(balance.free || {}),
            ...Object.keys(balance.used || {}),
            ...Object.keys(balance.total || {}),
          ]);

          return [...assets].map((asset) => ({
            exchange: normalizedExchange,
            accountLabel,
            kind: 'balance' as const,
            payload: {
              asset,
              free:
                balance.free?.[asset] !== undefined
                  ? String(balance.free[asset])
                  : undefined,
              used:
                balance.used?.[asset] !== undefined
                  ? String(balance.used[asset])
                  : undefined,
              total:
                balance.total?.[asset] !== undefined
                  ? String(balance.total[asset])
                  : undefined,
              source: 'ws' as const,
            },
            receivedAt,
          }));
        },
      }
    );
  }

  private getBackoffDelayMs(consecutiveFailures: number): number {
    if (consecutiveFailures <= 1) {
      return 0;
    }

    const exponentialSteps = consecutiveFailures - 2;

    return Math.min(1000 * 2 ** exponentialSteps, 30_000);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';

import { MARKET_MAKING_EVENT_NAMES } from '../events/market-making-events.types';
import { MarketMakingEventBus } from '../events/market-making-event-bus.service';
import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';
import {
  BalanceStateRefreshService,
  RegisteredBalanceAccount,
} from './balance-state-refresh.service';

@Injectable()
export class BalanceRefreshScheduler implements OnModuleInit, OnModuleDestroy {
  private static readonly LOOP_MS = 1_000;
  private static readonly INITIAL_JITTER_MS = 500;
  private static readonly RETRY_DELAY_MS = 5_000;
  private static readonly PERIODIC_REFRESH_MS = 120_000;
  private static readonly MAX_ACCOUNTS_PER_PASS = 4;
  private static readonly MAX_ACCOUNTS_PER_EXCHANGE_PER_PASS = 1;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private readonly dueAtByKey = new Map<string, number>();
  private readonly detachListeners: Array<() => void> = [];

  constructor(
    private readonly balanceStateRefreshService: BalanceStateRefreshService,
    @Optional()
    private readonly marketMakingEventBus?: MarketMakingEventBus,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.stopped = false;
    this.attachListeners();
    this.syncRegisteredAccounts(Date.now());
    this.scheduleNextPass();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    for (const detach of this.detachListeners) {
      detach();
    }

    this.detachListeners.length = 0;
  }

  async runNow(ts = getRFC3339Timestamp()): Promise<string[]> {
    if (this.running) {
      return [];
    }

    this.running = true;
    const startedAtMs = Date.now();

    try {
      const nowMs = Date.now();

      this.syncRegisteredAccounts(nowMs);

      const dueAccounts = this.selectDueAccounts(nowMs);

      if (dueAccounts.length === 0) {
        return [];
      }

      for (const account of dueAccounts) {
        this.dueAtByKey.set(
          this.toKey(account.exchange, account.accountLabel),
          nowMs + BalanceRefreshScheduler.RETRY_DELAY_MS + this.nextJitterMs(),
        );
      }

      const refreshedKeys =
        await this.balanceStateRefreshService.refreshDueAccounts(
          dueAccounts,
          ts,
        );

      for (const key of refreshedKeys) {
        this.dueAtByKey.set(
          key,
          nowMs +
            BalanceRefreshScheduler.PERIODIC_REFRESH_MS +
            this.nextJitterMs(),
        );
      }

      this.runtimeTimingService?.recordDuration(
        'balance-refresh.pass',
        Date.now() - startedAtMs,
        {
          dueAccountCount: dueAccounts.length,
          refreshedAccountCount: refreshedKeys.length,
          ts,
        },
        { warnThresholdMs: 500 },
      );

      return refreshedKeys;
    } finally {
      this.running = false;
    }
  }

  private attachListeners(): void {
    const balanceStaleDetach = this.marketMakingEventBus?.on(
      MARKET_MAKING_EVENT_NAMES.balanceStale,
      (event) => {
        this.markDue(event.exchange, event.accountLabel);
      },
    );

    if (balanceStaleDetach) {
      this.detachListeners.push(balanceStaleDetach);
    }

    const streamHealthDetach = this.marketMakingEventBus?.on(
      MARKET_MAKING_EVENT_NAMES.streamHealthChanged,
      (event) => {
        if (event.health === 'degraded' || event.health === 'silent') {
          this.markDue(event.exchange, event.accountLabel);
        }
      },
    );

    if (streamHealthDetach) {
      this.detachListeners.push(streamHealthDetach);
    }
  }

  private scheduleNextPass(): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.runNow();
      } finally {
        this.scheduleNextPass();
      }
    }, BalanceRefreshScheduler.LOOP_MS);
  }

  private syncRegisteredAccounts(nowMs: number): void {
    const registeredAccounts =
      this.balanceStateRefreshService.getRegisteredAccounts();
    const registeredKeys = new Set<string>();

    for (const account of registeredAccounts) {
      const key = this.toKey(account.exchange, account.accountLabel);

      registeredKeys.add(key);

      if (!this.dueAtByKey.has(key)) {
        this.dueAtByKey.set(
          key,
          nowMs + this.nextJitterMs(BalanceRefreshScheduler.INITIAL_JITTER_MS),
        );
      }
    }

    for (const key of this.dueAtByKey.keys()) {
      if (!registeredKeys.has(key)) {
        this.dueAtByKey.delete(key);
      }
    }
  }

  private selectDueAccounts(nowMs: number): RegisteredBalanceAccount[] {
    const accounts = this.balanceStateRefreshService
      .getRegisteredAccounts()
      .filter((account) => {
        const dueAt =
          this.dueAtByKey.get(this.toKey(account.exchange, account.accountLabel))
          ?? Number.POSITIVE_INFINITY;

        return dueAt <= nowMs;
      })
      .sort((a, b) => {
        return (
          (this.dueAtByKey.get(this.toKey(a.exchange, a.accountLabel)) ?? 0) -
          (this.dueAtByKey.get(this.toKey(b.exchange, b.accountLabel)) ?? 0)
        );
      });
    const selected: RegisteredBalanceAccount[] = [];
    const perExchangeCounts = new Map<string, number>();

    for (const account of accounts) {
      const exchangeCount = perExchangeCounts.get(account.exchange) ?? 0;

      if (
        exchangeCount >=
        BalanceRefreshScheduler.MAX_ACCOUNTS_PER_EXCHANGE_PER_PASS
      ) {
        continue;
      }

      selected.push(account);
      perExchangeCounts.set(account.exchange, exchangeCount + 1);

      if (selected.length >= BalanceRefreshScheduler.MAX_ACCOUNTS_PER_PASS) {
        break;
      }
    }

    return selected;
  }

  private markDue(exchange: string, accountLabel: string): void {
    if (
      !this.balanceStateRefreshService.isRegisteredAccount(exchange, accountLabel)
    ) {
      return;
    }

    const key = this.toKey(exchange, accountLabel);
    const nowMs = Date.now();
    const existingDueAt = this.dueAtByKey.get(key);

    this.dueAtByKey.set(
      key,
      existingDueAt === undefined ? nowMs : Math.min(existingDueAt, nowMs),
    );
  }

  private nextJitterMs(maxJitterMs = BalanceRefreshScheduler.LOOP_MS): number {
    return Math.floor(Math.random() * maxJitterMs);
  }

  private toKey(exchange: string, accountLabel: string): string {
    return `${exchange}:${accountLabel || 'default'}`;
  }
}

import { Injectable, Optional } from '@nestjs/common';

import { MarketMakingEventBus } from '../events/market-making-event-bus.service';

export type BalanceEntry = {
  exchange: string;
  accountLabel: string;
  asset: string;
  free?: string;
  used?: string;
  total?: string;
  source: 'ws' | 'rest';
  freshnessTimestamp: string;
};

export type AccountSnapshotMetadata = {
  exchange: string;
  accountLabel: string;
  lastSnapshotAt: string;
  lastSnapshotSource: 'ws' | 'rest';
};

@Injectable()
export class BalanceStateCacheService {
  static readonly STALE_MS = 60_000;
  private readonly balances = new Map<string, BalanceEntry>();
  private readonly snapshotMetadataByAccount = new Map<
    string,
    AccountSnapshotMetadata
  >();
  private readonly staleAccounts = new Set<string>();

  constructor(
    @Optional()
    private readonly marketMakingEventBus?: MarketMakingEventBus,
  ) {}

  applyBalanceUpdate(input: BalanceEntry): void {
    const entry = this.normalizeEntry(input);

    this.balances.set(
      this.toKey(entry.exchange, entry.accountLabel, entry.asset),
      entry,
    );
    this.clearStaleAccount(entry.exchange, entry.accountLabel);
    this.marketMakingEventBus?.emitBalanceUpdated({
      exchange: entry.exchange,
      accountLabel: entry.accountLabel,
      source: entry.source,
      balances: [this.toEventEntry(entry)],
      updatedAt: entry.freshnessTimestamp,
    });
  }

  getBalance(
    exchange: string,
    accountLabel: string,
    asset: string,
  ): BalanceEntry | undefined {
    return this.balances.get(
      this.toKey(exchange, accountLabel, asset.toUpperCase()),
    );
  }


  hasFreshAccountSnapshot(
    exchange: string,
    accountLabel: string,
    nowMs = Date.now(),
  ): boolean {
    const metadata = this.getSnapshotMetadata(exchange, accountLabel);

    if (!metadata) {
      return false;
    }

    const freshnessMs = Date.parse(metadata.lastSnapshotAt);
    const fresh =
      Number.isFinite(freshnessMs) &&
      nowMs - freshnessMs <= BalanceStateCacheService.STALE_MS;

    if (!fresh) {
      const sampleEntry = this.getAnyBalanceForAccount(exchange, accountLabel);

      this.emitBalanceStale(
        sampleEntry || {
          exchange,
          accountLabel: accountLabel || 'default',
          asset: '__SNAPSHOT__',
          source: metadata.lastSnapshotSource,
          freshnessTimestamp: metadata.lastSnapshotAt,
        },
        freshnessMs,
      );
    }

    return fresh;
  }

  getSnapshotTimestamp(
    exchange: string,
    accountLabel: string,
  ): string | undefined {
    return this.getSnapshotMetadata(exchange, accountLabel)?.lastSnapshotAt;
  }

  getSnapshotDiagnostic(
    exchange: string,
    accountLabel: string,
    nowMs = Date.now(),
  ): {
    present: boolean;
    fresh: boolean;
    ageMs: number | null;
    freshnessTimestamp?: string;
    source?: 'ws' | 'rest';
  } {
    const metadata = this.getSnapshotMetadata(exchange, accountLabel);

    if (!metadata) {
      return {
        present: false,
        fresh: false,
        ageMs: null,
      };
    }

    const freshnessMs = Date.parse(metadata.lastSnapshotAt);
    const ageMs = Number.isFinite(freshnessMs) ? nowMs - freshnessMs : null;
    const fresh =
      ageMs !== null && ageMs <= BalanceStateCacheService.STALE_MS;

    return {
      present: true,
      fresh,
      ageMs,
      freshnessTimestamp: metadata.lastSnapshotAt,
      source: metadata.lastSnapshotSource,
    };
  }

  getEntryDiagnostic(
    entry: BalanceEntry | undefined,
    nowMs = Date.now(),
  ): {
    present: boolean;
    fresh: boolean;
    ageMs: number | null;
    freshnessTimestamp?: string;
    source?: 'ws' | 'rest';
    free?: string;
    used?: string;
    total?: string;
  } {
    if (!entry) {
      return {
        present: false,
        fresh: false,
        ageMs: null,
      };
    }

    const freshnessMs = Date.parse(entry.freshnessTimestamp);
    const ageMs = Number.isFinite(freshnessMs) ? nowMs - freshnessMs : null;
    const fresh =
      ageMs !== null && ageMs <= BalanceStateCacheService.STALE_MS;

    return {
      present: true,
      fresh,
      ageMs,
      freshnessTimestamp: entry.freshnessTimestamp,
      source: entry.source,
      free: entry.free,
      used: entry.used,
      total: entry.total,
    };
  }

  applyBalanceSnapshot(
    exchange: string,
    accountLabel: string,
    balance: Record<string, any>,
    freshnessTimestamp: string,
    source: 'ws' | 'rest',
  ): void {
    const normalizedAccountLabel = accountLabel || 'default';
    const accountKey = this.toAccountKey(exchange, normalizedAccountLabel);
    const assets = new Set<string>([
      ...Object.keys(balance?.free || {}),
      ...Object.keys(balance?.used || {}),
      ...Object.keys(balance?.total || {}),
    ]);
    const entries: BalanceEntry[] = [];

    this.deleteAccountBalances(exchange, normalizedAccountLabel);
    this.snapshotMetadataByAccount.set(accountKey, {
      exchange,
      accountLabel: normalizedAccountLabel,
      lastSnapshotAt: freshnessTimestamp,
      lastSnapshotSource: source,
    });

    for (const asset of assets) {
      const entry = this.normalizeEntry({
        exchange,
        accountLabel: normalizedAccountLabel,
        asset,
        free:
          balance?.free?.[asset] !== undefined
            ? String(balance.free[asset])
            : undefined,
        used:
          balance?.used?.[asset] !== undefined
            ? String(balance.used[asset])
            : undefined,
        total:
          balance?.total?.[asset] !== undefined
            ? String(balance.total[asset])
            : undefined,
        source,
        freshnessTimestamp,
      });

      this.balances.set(
        this.toKey(exchange, normalizedAccountLabel, entry.asset),
        entry,
      );
      entries.push(entry);
    }

    this.clearStaleAccount(exchange, normalizedAccountLabel);
    this.marketMakingEventBus?.emitBalanceUpdated({
      exchange,
      accountLabel: normalizedAccountLabel,
      source,
      balances: entries.map((entry) => this.toEventEntry(entry)),
      updatedAt: freshnessTimestamp,
    });
  }

  isFresh(entry: BalanceEntry | undefined, nowMs = Date.now()): boolean {
    if (!entry) {
      return false;
    }

    const freshnessMs = Date.parse(entry.freshnessTimestamp);

    const fresh =
      Number.isFinite(freshnessMs) &&
      nowMs - freshnessMs <= BalanceStateCacheService.STALE_MS;

    if (!fresh) {
      this.emitBalanceStale(entry, freshnessMs);
    }

    return fresh;
  }

  isStale(entry: BalanceEntry | undefined, nowMs = Date.now()): boolean {
    return !this.isFresh(entry, nowMs);
  }

  private normalizeEntry(input: BalanceEntry): BalanceEntry {
    return {
      ...input,
      accountLabel: input.accountLabel || 'default',
      asset: input.asset.toUpperCase(),
    };
  }

  private toEventEntry(entry: BalanceEntry) {
    return {
      asset: entry.asset,
      free: entry.free,
      used: entry.used,
      total: entry.total,
      source: entry.source,
      freshnessTimestamp: entry.freshnessTimestamp,
    };
  }

  private emitBalanceStale(entry: BalanceEntry, freshnessMs: number): void {
    const accountKey = this.toAccountKey(entry.exchange, entry.accountLabel);

    if (this.staleAccounts.has(accountKey)) {
      return;
    }

    this.staleAccounts.add(accountKey);
    this.marketMakingEventBus?.emitBalanceStale({
      exchange: entry.exchange,
      accountLabel: entry.accountLabel,
      staleAt: Number.isFinite(freshnessMs)
        ? new Date(
            freshnessMs + BalanceStateCacheService.STALE_MS,
          ).toISOString()
        : entry.freshnessTimestamp,
    });
  }


  private getSnapshotMetadata(
    exchange: string,
    accountLabel: string,
  ): AccountSnapshotMetadata | undefined {
    return this.snapshotMetadataByAccount.get(
      this.toAccountKey(exchange, accountLabel),
    );
  }

  private getAnyBalanceForAccount(
    exchange: string,
    accountLabel: string,
  ): BalanceEntry | undefined {
    const normalizedAccountLabel = accountLabel || 'default';

    for (const entry of this.balances.values()) {
      if (
        entry.exchange === exchange &&
        entry.accountLabel === normalizedAccountLabel
      ) {
        return entry;
      }
    }

    return undefined;
  }

  private deleteAccountBalances(exchange: string, accountLabel: string): void {
    const normalizedAccountLabel = accountLabel || 'default';

    for (const key of [...this.balances.keys()]) {
      if (key.startsWith(`${exchange}:${normalizedAccountLabel}:`)) {
        this.balances.delete(key);
      }
    }
  }

  private clearStaleAccount(exchange: string, accountLabel: string): void {
    this.staleAccounts.delete(this.toAccountKey(exchange, accountLabel));
  }

  private toAccountKey(exchange: string, accountLabel: string): string {
    return `${exchange}:${accountLabel || 'default'}`;
  }

  private toKey(exchange: string, accountLabel: string, asset: string): string {
    return `${exchange}:${accountLabel || 'default'}:${asset.toUpperCase()}`;
  }
}

import { Injectable } from '@nestjs/common';

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

@Injectable()
export class BalanceStateCacheService {
  static readonly STALE_MS = 15_000;
  private readonly balances = new Map<string, BalanceEntry>();

  applyBalanceUpdate(input: BalanceEntry): void {
    this.balances.set(
      this.toKey(input.exchange, input.accountLabel, input.asset),
      {
        ...input,
        asset: input.asset.toUpperCase(),
      },
    );
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

  applyBalanceSnapshot(
    exchange: string,
    accountLabel: string,
    balance: Record<string, any>,
    freshnessTimestamp: string,
    source: 'ws' | 'rest',
  ): void {
    const assets = new Set<string>([
      ...Object.keys(balance?.free || {}),
      ...Object.keys(balance?.used || {}),
      ...Object.keys(balance?.total || {}),
    ]);

    for (const asset of assets) {
      this.applyBalanceUpdate({
        exchange,
        accountLabel,
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
    }
  }

  isFresh(entry: BalanceEntry | undefined, nowMs = Date.now()): boolean {
    if (!entry) {
      return false;
    }

    const freshnessMs = Date.parse(entry.freshnessTimestamp);

    return (
      Number.isFinite(freshnessMs) &&
      nowMs - freshnessMs <= BalanceStateCacheService.STALE_MS
    );
  }

  isStale(entry: BalanceEntry | undefined, nowMs = Date.now()): boolean {
    return !this.isFresh(entry, nowMs);
  }

  private toKey(exchange: string, accountLabel: string, asset: string): string {
    return `${exchange}:${accountLabel || 'default'}:${asset.toUpperCase()}`;
  }
}

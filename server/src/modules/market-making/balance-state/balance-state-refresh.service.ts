import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { MarketMakingRuntimeTimingService } from '../tick/runtime-timing.service';
import { UserStreamTrackerService } from '../trackers/user-stream-tracker.service';
import { BalanceStateCacheService } from './balance-state-cache.service';

export type RegisteredBalanceAccount = {
  exchange: string;
  accountLabel: string;
};

type StreamHealthState = 'healthy' | 'degraded' | 'silent' | 'reconnecting';

@Injectable()
export class BalanceStateRefreshService {
  private static readonly SILENT_MS = 30_000;
  private readonly logger = new CustomLogger(BalanceStateRefreshService.name);
  private readonly accounts = new Map<string, RegisteredBalanceAccount>();
  private readonly lastRefreshAtByKey = new Map<string, string>();

  constructor(
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly balanceStateCacheService?: BalanceStateCacheService,
    @Optional()
    private readonly userStreamTrackerService?: UserStreamTrackerService,
    @Optional()
    private readonly runtimeTimingService?: MarketMakingRuntimeTimingService,
  ) {}

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    this.accounts.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }

  registerAccount(exchange: string, accountLabel: string): void {
    const normalizedAccountLabel = accountLabel || 'default';

    this.accounts.set(this.toKey(exchange, normalizedAccountLabel), {
      exchange,
      accountLabel: normalizedAccountLabel,
    });
  }

  releaseAccount(exchange: string, accountLabel: string): void {
    this.accounts.delete(this.toKey(exchange, accountLabel || 'default'));
  }

  isRegisteredAccount(exchange: string, accountLabel: string): boolean {
    return this.accounts.has(this.toKey(exchange, accountLabel || 'default'));
  }

  getRegisteredAccounts(): RegisteredBalanceAccount[] {
    return [...this.accounts.values()].map((account) => ({
      ...account,
    }));
  }

  getLastRefreshTime(
    exchange: string,
    accountLabel: string,
  ): string | undefined {
    return this.lastRefreshAtByKey.get(this.toKey(exchange, accountLabel));
  }

  getHealthState(exchange: string, accountLabel: string): StreamHealthState {
    const lastEventMs = this.userStreamTrackerService?.getLastRecvTime(
      exchange,
      accountLabel,
    );
    const lastRefreshAt = this.getLastRefreshTime(exchange, accountLabel);
    const lastRefreshMs = lastRefreshAt ? Date.parse(lastRefreshAt) : undefined;

    if (
      lastEventMs &&
      Date.now() - lastEventMs <= BalanceStateCacheService.STALE_MS
    ) {
      return 'healthy';
    }

    if (
      lastEventMs &&
      Date.now() - lastEventMs <= BalanceStateRefreshService.SILENT_MS
    ) {
      return 'degraded';
    }

    if (
      lastRefreshMs &&
      Date.now() - lastRefreshMs <= BalanceStateCacheService.STALE_MS
    ) {
      return 'reconnecting';
    }

    return 'silent';
  }

  async refreshDueAccounts(
    accounts: RegisteredBalanceAccount[],
    refreshTs = getRFC3339Timestamp(),
  ): Promise<string[]> {
    const refreshedKeys: string[] = [];

    for (const account of accounts) {
      if (
        await this.refreshAccount(
          account.exchange,
          account.accountLabel,
          refreshTs,
        )
      ) {
        refreshedKeys.push(this.toKey(account.exchange, account.accountLabel));
      }
    }

    return refreshedKeys;
  }

  async refreshAccount(
    exchange: string,
    accountLabel: string,
    refreshTs = getRFC3339Timestamp(),
  ): Promise<boolean> {
    let balance: unknown;

    try {
      balance = this.runtimeTimingService
        ? await this.runtimeTimingService.measureAsync(
            'balance-refresh.fetch-balance',
            {
              accountLabel,
              exchange,
              health: this.getHealthState(exchange, accountLabel),
            },
            () =>
              this.exchangeConnectorAdapterService?.fetchBalance(
                exchange,
                accountLabel,
              ) as Promise<unknown>,
            { warnThresholdMs: 500 },
          )
        : await this.exchangeConnectorAdapterService?.fetchBalance(
            exchange,
            accountLabel,
          );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack : undefined;
      const key = this.toKey(exchange, accountLabel);

      this.logger.warn(`Balance refresh failed for ${key}: ${message}`, trace);

      if (!(error instanceof ServiceUnavailableException)) {
        this.lastRefreshAtByKey.delete(key);
      }

      return false;
    }

    if (!balance) {
      return false;
    }

    this.balanceStateCacheService?.applyBalanceSnapshot(
      exchange,
      accountLabel,
      balance,
      refreshTs,
      'rest',
    );
    this.lastRefreshAtByKey.set(this.toKey(exchange, accountLabel), refreshTs);

    return true;
  }

  private toKey(exchange: string, accountLabel: string): string {
    return `${exchange}:${accountLabel || 'default'}`;
  }
}

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { ClockTickCoordinatorService } from '../tick/clock-tick-coordinator.service';
import { TickComponent } from '../tick/tick-component.interface';
import { UserStreamTrackerService } from '../trackers/user-stream-tracker.service';
import { BalanceStateCacheService } from './balance-state-cache.service';

type RegisteredBalanceAccount = {
  exchange: string;
  accountLabel: string;
};

type StreamHealthState = 'healthy' | 'degraded' | 'silent' | 'reconnecting';

@Injectable()
export class BalanceStateRefreshService
  implements TickComponent, OnModuleInit, OnModuleDestroy
{
  private static readonly SILENT_MS = 30_000;
  private readonly logger = new CustomLogger(BalanceStateRefreshService.name);
  private readonly accounts = new Map<string, RegisteredBalanceAccount>();
  private readonly lastRefreshAtByKey = new Map<string, string>();

  constructor(
    @Optional()
    private readonly clockTickCoordinatorService?: ClockTickCoordinatorService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly balanceStateCacheService?: BalanceStateCacheService,
    @Optional()
    private readonly userStreamTrackerService?: UserStreamTrackerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.clockTickCoordinatorService?.register(
      'balance-state-refresh',
      this,
      4,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.clockTickCoordinatorService?.unregister('balance-state-refresh');
  }

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
    this.accounts.set(this.toKey(exchange, accountLabel), {
      exchange,
      accountLabel,
    });
  }

  releaseAccount(exchange: string, accountLabel: string): void {
    this.accounts.delete(this.toKey(exchange, accountLabel));
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

  async onTick(_: string): Promise<void> {
    for (const account of this.accounts.values()) {
      if (!this.shouldRefresh(account.exchange, account.accountLabel)) {
        continue;
      }

      let balance: unknown;

      try {
        balance = await this.exchangeConnectorAdapterService?.fetchBalance(
          account.exchange,
          account.accountLabel,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const trace = error instanceof Error ? error.stack : undefined;
        const key = this.toKey(account.exchange, account.accountLabel);

        this.logger.warn(
          `Balance refresh failed for ${key}: ${message}`,
          trace,
        );

        if (!(error instanceof ServiceUnavailableException)) {
          this.lastRefreshAtByKey.delete(key);
        }

        continue;
      }

      if (!balance) {
        continue;
      }

      const refreshTs = getRFC3339Timestamp();

      this.balanceStateCacheService?.applyBalanceSnapshot(
        account.exchange,
        account.accountLabel,
        balance,
        refreshTs,
        'rest',
      );
      this.lastRefreshAtByKey.set(
        this.toKey(account.exchange, account.accountLabel),
        refreshTs,
      );
    }
  }

  private shouldRefresh(exchange: string, accountLabel: string): boolean {
    const lastEventMs = this.userStreamTrackerService?.getLastRecvTime(
      exchange,
      accountLabel,
    );

    return (
      !lastEventMs ||
      Date.now() - lastEventMs > BalanceStateCacheService.STALE_MS
    );
  }

  private toKey(exchange: string, accountLabel: string): string {
    return `${exchange}:${accountLabel || 'default'}`;
  }
}

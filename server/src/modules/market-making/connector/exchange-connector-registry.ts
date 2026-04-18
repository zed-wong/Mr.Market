import { Injectable } from '@nestjs/common';

import { BalanceRefreshScheduler } from '../balance-state/balance-refresh-scheduler';
import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { ExchangeOrderReconciliationRunner } from '../reconciliation/exchange-order-reconciliation-runner';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { OrderBookTrackerService } from '../trackers/order-book-tracker.service';
import { UserStreamTrackerService } from '../trackers/user-stream-tracker.service';
import { ExchangeConnectorRuntime } from './exchange-connector';

@Injectable()
export class ExchangeConnectorRegistry {
  private readonly runtimesByExchange = new Map<string, ExchangeConnectorRuntime>();

  constructor(
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    private readonly exchangeOrderReconciliationRunner: ExchangeOrderReconciliationRunner,
    private readonly userStreamTrackerService: UserStreamTrackerService,
    private readonly balanceStateCacheService: BalanceStateCacheService,
    private readonly balanceRefreshScheduler: BalanceRefreshScheduler,
    private readonly orderBookTrackerService: OrderBookTrackerService,
  ) {}

  get(exchange: string): ExchangeConnectorRuntime {
    const normalizedExchange = String(exchange || '').trim().toLowerCase();

    if (!normalizedExchange) {
      throw new Error('exchange is required');
    }

    const existingRuntime = this.runtimesByExchange.get(normalizedExchange);

    if (existingRuntime) {
      return existingRuntime;
    }

    const runtime: ExchangeConnectorRuntime = {
      exchange: normalizedExchange,
      orderTracker: this.exchangeOrderTrackerService,
      reconciliationRunner: this.exchangeOrderReconciliationRunner,
      userStreamTracker: this.userStreamTrackerService,
      balanceCache: this.balanceStateCacheService,
      balanceRefreshScheduler: this.balanceRefreshScheduler,
      orderBookTracker: this.orderBookTrackerService,
    };

    this.runtimesByExchange.set(normalizedExchange, runtime);

    return runtime;
  }

  list(exchanges: string[]): ExchangeConnectorRuntime[] {
    return exchanges.map((exchange) => this.get(exchange));
  }
}

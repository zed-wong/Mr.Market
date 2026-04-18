import { BalanceRefreshScheduler } from '../balance-state/balance-refresh-scheduler';
import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { ExchangeOrderReconciliationRunner } from '../reconciliation/exchange-order-reconciliation-runner';
import { OrderBookTrackerService } from '../trackers/order-book-tracker.service';
import { ExchangeOrderTrackerService } from '../trackers/exchange-order-tracker.service';
import { UserStreamTrackerService } from '../trackers/user-stream-tracker.service';

export type ExchangeConnectorRuntime = {
  exchange: string;
  orderTracker: ExchangeOrderTrackerService;
  reconciliationRunner: ExchangeOrderReconciliationRunner;
  userStreamTracker: UserStreamTrackerService;
  balanceCache: BalanceStateCacheService;
  balanceRefreshScheduler: BalanceRefreshScheduler;
  orderBookTracker: OrderBookTrackerService;
};

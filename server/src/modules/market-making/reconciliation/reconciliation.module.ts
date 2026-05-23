import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { RewardAllocation } from 'src/common/entities/ledger/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { ExchangeConnectorRegistry } from '../connector/exchange-connector-registry';
import { MarketMakingEventsModule } from '../events/market-making-events.module';
import { ExecutionModule } from '../execution/execution.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TrackersModule } from '../trackers/trackers.module';
import { ExchangeOrderReconciliationRunner } from './exchange-order-reconciliation-runner';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LedgerEntry,
      MarketMakingOrderBalance,
      RewardLedger,
      RewardAllocation,
      StrategyOrderIntentEntity,
      MarketMakingOrder,
    ]),
    MarketMakingEventsModule,
    ExecutionModule,
    LedgerModule,
    TrackersModule,
  ],
  providers: [
    ReconciliationService,
    ExchangeOrderReconciliationRunner,
    ExchangeConnectorRegistry,
  ],
  exports: [
    ReconciliationService,
    ExchangeOrderReconciliationRunner,
    ExchangeConnectorRegistry,
  ],
})
export class ReconciliationModule {}

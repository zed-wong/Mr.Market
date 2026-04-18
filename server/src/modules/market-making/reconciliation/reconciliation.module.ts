import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceReadModel } from 'src/common/entities/ledger/balance-read-model.entity';
import { RewardAllocation } from 'src/common/entities/ledger/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/ledger/reward-ledger.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';

import { ExchangeConnectorRegistry } from '../connector/exchange-connector-registry';
import { TrackersModule } from '../trackers/trackers.module';
import { ExchangeOrderReconciliationRunner } from './exchange-order-reconciliation-runner';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BalanceReadModel,
      RewardLedger,
      RewardAllocation,
      StrategyOrderIntentEntity,
    ]),
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

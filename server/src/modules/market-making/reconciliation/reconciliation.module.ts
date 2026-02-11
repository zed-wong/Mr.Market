import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceReadModel } from 'src/common/entities/balance-read-model.entity';
import { RewardAllocation } from 'src/common/entities/reward-allocation.entity';
import { RewardLedger } from 'src/common/entities/reward-ledger.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/strategy-order-intent.entity';
import { TrackersModule } from '../trackers/trackers.module';
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
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}

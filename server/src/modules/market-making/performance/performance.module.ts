import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { LedgerModule } from '../ledger/ledger.module';
import { PerformanceService } from './performance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Performance,
      MarketMakingOrder,
      StrategyInstance,
    ]),
    LedgerModule,
  ],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}

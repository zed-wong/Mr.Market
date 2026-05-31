import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { LedgerModule } from '../ledger/ledger.module';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Performance, MarketMakingOrder]),
    LedgerModule,
  ],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}

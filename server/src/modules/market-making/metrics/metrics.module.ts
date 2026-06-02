import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';

import { TickModule } from '../tick/tick.module';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyExecutionHistory]), TickModule],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}

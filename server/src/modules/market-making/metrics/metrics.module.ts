import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';

import { TickModule } from '../tick/tick.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyExecutionHistory]), TickModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}

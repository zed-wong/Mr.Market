import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';

import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([MarketMakingHistory])],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { MarketdataModule } from '../../data/market-data/market-data.module';
import { ExchangeInitModule } from '../../infrastructure/exchange-init/exchange-init.module';
import { ExecutionModule } from '../execution/execution.module';
import { TickModule } from '../tick/tick.module';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';
import { OrderBookIngestionService } from './order-book-ingestion.service';
import { OrderBookTrackerService } from './order-book-tracker.service';
import { PrivateStreamIngestionService } from './private-stream-ingestion.service';
import { PrivateStreamTrackerService } from './private-stream-tracker.service';

@Module({
  imports: [
    TickModule,
    ExecutionModule,
    ExchangeInitModule,
    MarketdataModule,
    TypeOrmModule.forFeature([
      TrackedOrderEntity,
      StrategyInstance,
      MarketMakingOrder,
    ]),
  ],
  providers: [
    OrderBookTrackerService,
    OrderBookIngestionService,
    PrivateStreamIngestionService,
    PrivateStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
  exports: [
    OrderBookTrackerService,
    OrderBookIngestionService,
    PrivateStreamIngestionService,
    PrivateStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
})
export class TrackersModule {}

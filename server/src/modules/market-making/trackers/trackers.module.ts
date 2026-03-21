import { Module } from '@nestjs/common';

import { ExchangeInitModule } from '../../infrastructure/exchange-init/exchange-init.module';
import { ExecutionModule } from '../execution/execution.module';
import { TickModule } from '../tick/tick.module';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';
import { OrderBookTrackerService } from './order-book-tracker.service';
import { PrivateStreamIngestionService } from './private-stream-ingestion.service';
import { PrivateStreamTrackerService } from './private-stream-tracker.service';

@Module({
  imports: [TickModule, ExecutionModule, ExchangeInitModule],
  providers: [
    OrderBookTrackerService,
    PrivateStreamIngestionService,
    PrivateStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
  exports: [
    OrderBookTrackerService,
    PrivateStreamIngestionService,
    PrivateStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
})
export class TrackersModule {}

import { Module } from '@nestjs/common';

import { ExecutionModule } from '../execution/execution.module';
import { ExchangeInitModule } from '../../infrastructure/exchange-init/exchange-init.module';
import { TickModule } from '../tick/tick.module';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';
import { PrivateStreamIngestionService } from './private-stream-ingestion.service';
import { OrderBookTrackerService } from './order-book-tracker.service';
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

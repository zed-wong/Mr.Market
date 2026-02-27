import { Module } from '@nestjs/common';

import { ExecutionModule } from '../execution/execution.module';
import { TickModule } from '../tick/tick.module';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';
import { OrderBookTrackerService } from './order-book-tracker.service';
import { PrivateStreamTrackerService } from './private-stream-tracker.service';

@Module({
  imports: [TickModule, ExecutionModule],
  providers: [
    OrderBookTrackerService,
    PrivateStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
  exports: [
    OrderBookTrackerService,
    PrivateStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
})
export class TrackersModule {}

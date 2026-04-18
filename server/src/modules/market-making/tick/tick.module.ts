import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ClockTickCoordinatorService } from './clock-tick-coordinator.service';
import { MarketMakingRuntimeTimingService } from './runtime-timing.service';

@Module({
  imports: [ConfigModule],
  providers: [ClockTickCoordinatorService, MarketMakingRuntimeTimingService],
  exports: [ClockTickCoordinatorService, MarketMakingRuntimeTimingService],
})
export class TickModule {}

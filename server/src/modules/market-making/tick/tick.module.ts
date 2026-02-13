import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ClockTickCoordinatorService } from './clock-tick-coordinator.service';

@Module({
  imports: [ConfigModule],
  providers: [ClockTickCoordinatorService],
  exports: [ClockTickCoordinatorService],
})
export class TickModule {}

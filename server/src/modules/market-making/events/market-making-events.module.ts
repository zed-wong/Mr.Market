import { Module } from '@nestjs/common';

import { MarketMakingEventBus } from './market-making-event-bus.service';

@Module({
  providers: [MarketMakingEventBus],
  exports: [MarketMakingEventBus],
})
export class MarketMakingEventsModule {}

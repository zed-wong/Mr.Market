import { Module } from '@nestjs/common';
import { GrowdataModule } from 'src/modules/data/grow-data/grow-data.module';
import { CustomConfigModule } from 'src/modules/infrastructure/custom-config/custom-config.module';
import { LoggerModule } from 'src/modules/infrastructure/logger/logger.module';
import { StrategyModule } from 'src/modules/market-making/strategy/strategy.module';
import { ExchangeModule } from 'src/modules/mixin/exchange/exchange.module';
import { SnapshotsModule } from 'src/modules/mixin/snapshots/snapshots.module';

@Module({
  imports: [
    ExchangeModule,
    SnapshotsModule,
    CustomConfigModule,
    StrategyModule,
    GrowdataModule,
    LoggerModule,
  ],
})
export class EventListenersModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { MarketdataModule } from '../../data/market-data/market-data.module';
import { ExchangeInitModule } from '../../infrastructure/exchange-init/exchange-init.module';
import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { BalanceStateRefreshService } from '../balance-state/balance-state-refresh.service';
import { MarketMakingEventsModule } from '../events/market-making-events.module';
import { ExecutionModule } from '../execution/execution.module';
import { TickModule } from '../tick/tick.module';
import {
  BinanceUserStreamEventNormalizerService,
  GenericCcxtUserStreamEventNormalizerService,
  MexcUserStreamEventNormalizerService,
  UserStreamCapabilityService,
  UserStreamNormalizerRegistryService,
} from '../user-stream';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';
import { OrderBookIngestionService } from './order-book-ingestion.service';
import { OrderBookTrackerService } from './order-book-tracker.service';
import { UserStreamIngestionService } from './user-stream-ingestion.service';
import { UserStreamTrackerService } from './user-stream-tracker.service';

@Module({
  imports: [
    TickModule,
    ExecutionModule,
    MarketMakingEventsModule,
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
    BalanceStateCacheService,
    BalanceStateRefreshService,
    GenericCcxtUserStreamEventNormalizerService,
    BinanceUserStreamEventNormalizerService,
    MexcUserStreamEventNormalizerService,
    UserStreamNormalizerRegistryService,
    UserStreamCapabilityService,
    UserStreamIngestionService,
    UserStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
  exports: [
    OrderBookTrackerService,
    OrderBookIngestionService,
    BalanceStateCacheService,
    BalanceStateRefreshService,
    UserStreamNormalizerRegistryService,
    UserStreamCapabilityService,
    UserStreamIngestionService,
    UserStreamTrackerService,
    ExchangeOrderTrackerService,
  ],
})
export class TrackersModule {}

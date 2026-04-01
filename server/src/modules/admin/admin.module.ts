import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { CampaignJoin } from 'src/common/entities/market-making/campaign-join.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { CampaignModule } from '../campaign/campaign.module';
import { GrowdataModule } from '../data/grow-data/grow-data.module';
import { SpotdataModule } from '../data/spot-data/spot-data.module';
import { ExchangeInitModule } from '../infrastructure/exchange-init/exchange-init.module';
import { ExchangeApiKeyModule } from '../market-making/exchange-api-key/exchange-api-key.module';
import { ExecutionModule } from '../market-making/execution/execution.module';
import { PerformanceService } from '../market-making/performance/performance.service';
import { StrategyModule } from '../market-making/strategy/strategy.module';
import { TrackersModule } from '../market-making/trackers/trackers.module';
import { UserOrdersModule } from '../market-making/user-orders/user-orders.module';
import { MixinClientModule } from '../mixin/client/mixin-client.module';
import { Web3Module } from '../web3/web3.module';
import { AdminController } from './admin.controller';
import { AdminExchangesModule } from './exchanges/exchanges.module';
import { AdminFeeController } from './fee/admin-fee.controller';
import { AdminFeeService } from './fee/admin-fee.service';
import { AdminGrowService } from './growdata/adminGrow.service';
import { AdminDirectMarketMakingController } from './market-making/admin-direct-mm.controller';
import { AdminDirectMarketMakingService } from './market-making/admin-direct-mm.service';
import { AdminSpotService } from './spot/admin-spot.service';
import { AdminStrategyService } from './strategy/adminStrategy.service';

@Module({
  imports: [
    AdminExchangesModule,
    StrategyModule,
    GrowdataModule,
    SpotdataModule,
    MixinClientModule,
    CampaignModule,
    UserOrdersModule,
    TrackersModule,
    ExecutionModule,
    ExchangeApiKeyModule,
    ExchangeInitModule,
    TypeOrmModule.forFeature([
      StrategyExecutionHistory,
      StrategyInstance,
      StrategyDefinition,
      MarketMakingOrder,
      CampaignJoin,
      MixinUser,
      Contribution,
      Performance,
      CustomConfigEntity,
      GrowdataMarketMakingPair,
      SpotdataTradingPair,
    ]),
    Web3Module,
  ],
  controllers: [
    AdminController,
    AdminFeeController,
    AdminDirectMarketMakingController,
  ],
  providers: [
    AdminStrategyService,
    AdminDirectMarketMakingService,
    PerformanceService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
  exports: [
    AdminStrategyService,
    AdminDirectMarketMakingService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
})
export class AdminModule {}

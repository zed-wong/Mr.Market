import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';

import { GrowdataModule } from '../data/grow-data/grow-data.module';
import { SpotdataModule } from '../data/spot-data/spot-data.module';
import { PerformanceService } from '../market-making/performance/performance.service';
import { DexModule } from '../market-making/strategy/dex/dex.module';
import { StrategyModule } from '../market-making/strategy/strategy.module';
import { MixinClientModule } from '../mixin/client/mixin-client.module';
import { Web3Module } from '../web3/web3.module';
import { AdminController } from './admin.controller';
import { AdminSpotService } from './spot/admin-spot.service';
import { AdminExchangesModule } from './exchanges/exchanges.module';
import { AdminFeeController } from './fee/admin-fee.controller';
import { AdminFeeService } from './fee/admin-fee.service';
import { AdminGrowService } from './growdata/adminGrow.service';
import { AdminStrategyService } from './strategy/adminStrategy.service';

@Module({
  imports: [
    AdminExchangesModule,
    StrategyModule,
    GrowdataModule,
    SpotdataModule,
    MixinClientModule,
    TypeOrmModule.forFeature([
      StrategyExecutionHistory,
      StrategyInstance,
      StrategyDefinition,
      MixinUser,
      Contribution,
      Performance,
      CustomConfigEntity,
      GrowdataMarketMakingPair,
      SpotdataTradingPair,
    ]),
    DexModule,
    Web3Module,
  ],
  controllers: [AdminController, AdminFeeController],
  providers: [
    AdminStrategyService,
    PerformanceService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
  exports: [
    AdminStrategyService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
})
export class AdminModule {}

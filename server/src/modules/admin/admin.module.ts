import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { ArbitrageHistory } from 'src/common/entities/market-making/arbitrage-order.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';

import { GrowdataModule } from '../data/grow-data/grow-data.module';
import { SpotdataModule } from '../data/spot-data/spot-data.module';
import { PerformanceService } from '../market-making/performance/performance.service';
import { StrategyService } from '../market-making/strategy/strategy.service';
import { TradeModule } from '../market-making/trade/trade.module';
import { TradeService } from '../market-making/trade/trade.service';
import { MixinClientModule } from '../mixin/client/mixin-client.module';
import { Web3Module } from '../web3/web3.module';
import { AdminController } from './admin.controller';
import { AdminSpotService } from './admin-spot-management/admin-spot-management.service';
import { AdminExchangesModule } from './exchanges/exchanges.module';
import { AdminFeeController } from './fee/admin-fee.controller';
import { AdminFeeService } from './fee/admin-fee.service';
import { AdminGrowService } from './growdata/adminGrow.service';
import { AdminStrategyService } from './strategy/adminStrategy.service';

@Module({
  imports: [
    AdminExchangesModule,
    GrowdataModule,
    SpotdataModule,
    MixinClientModule,
    TypeOrmModule.forFeature([
      MarketMakingHistory,
      ArbitrageHistory,
      StrategyInstance,
      MixinUser,
      Contribution,
      Performance,
      CustomConfigEntity,
      GrowdataMarketMakingPair,
      SpotdataTradingPair,
    ]),
    TradeModule,
    Web3Module,
  ],
  controllers: [AdminController, AdminFeeController],
  providers: [
    AdminStrategyService,
    StrategyService,
    PerformanceService,
    TradeService,
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

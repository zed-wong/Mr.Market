import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArbitrageHistory } from 'src/common/entities/market-making/arbitrage-order.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';

import { AdminModule } from '../../admin/admin.module';
import { LoggerModule } from '../../infrastructure/logger/logger.module';
import { DurabilityModule } from '../durability/durability.module';
import { ExecutionModule } from '../execution/execution.module';
import { FeeModule } from '../fee/fee.module';
import { PerformanceModule } from '../performance/performance.module';
import { TickModule } from '../tick/tick.module';
import { TrackersModule } from '../trackers/trackers.module';
import { TradeModule } from '../trade/trade.module';
import { AlpacaStratService } from './alpacastrat.service';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';
import { StrategyIntentWorkerService } from './strategy-intent-worker.service';

@Module({
  imports: [
    TradeModule,
    PerformanceModule,
    LoggerModule,
    ConfigModule,
    AdminModule,
    TypeOrmModule.forFeature([
      SimplyGrowOrder,
      MarketMakingOrder,
      StrategyInstance,
      ArbitrageHistory,
      MarketMakingHistory,
      StrategyOrderIntentEntity,
    ]),
    FeeModule,
    TickModule,
    DurabilityModule,
    ExecutionModule,
    TrackersModule,
  ],
  controllers: [StrategyController],
  providers: [
    StrategyService,
    AlpacaStratService,
    StrategyIntentExecutionService,
    StrategyIntentWorkerService,
    StrategyIntentStoreService,
    QuoteExecutorManagerService,
  ],
  exports: [StrategyService],
})
export class StrategyModule {}

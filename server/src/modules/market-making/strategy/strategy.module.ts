import { Module } from '@nestjs/common';
import { StrategyService } from './strategy.service';
import { StrategyController } from './strategy.controller';
import { TradeModule } from '../trade/trade.module';
import { PerformanceModule } from '../performance/performance.module';
import { LoggerModule } from '../../infrastructure/logger/logger.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/user-orders.entity';
import { ConfigModule } from '@nestjs/config';
import { ArbitrageHistory } from 'src/common/entities/arbitrage-order.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making-order.entity';
import { AlpacaStratService } from './alpacastrat.service';
import { StrategyInstance } from 'src/common/entities/strategy-instances.entity';
import { AdminModule } from '../../admin/admin.module';
import { FeeModule } from '../fee/fee.module';
import { TickModule } from '../tick/tick.module';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { DurabilityModule } from '../durability/durability.module';
import { StrategyIntentStoreService } from './strategy-intent-store.service';
import { StrategyOrderIntentEntity } from 'src/common/entities/strategy-order-intent.entity';
import { ExecutionModule } from '../execution/execution.module';
import { TrackersModule } from '../trackers/trackers.module';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
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

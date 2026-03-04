import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';

import { AdminModule } from '../../admin/admin.module';
import { LoggerModule } from '../../infrastructure/logger/logger.module';
import { Web3Module } from '../../web3/web3.module';
import { DurabilityModule } from '../durability/durability.module';
import { ExecutionModule } from '../execution/execution.module';
import { FeeModule } from '../fee/fee.module';
import { PerformanceModule } from '../performance/performance.module';
import { TickModule } from '../tick/tick.module';
import { TrackersModule } from '../trackers/trackers.module';
import { AlpacaStratService } from './alpacastrat.service';
import { DexModule } from './dex.module';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';
import { StrategyIntentWorkerService } from './strategy-intent-worker.service';
import { TimeIndicatorStrategyService } from './time-indicator.service';

@Module({
  imports: [
    PerformanceModule,
    LoggerModule,
    ConfigModule,
    AdminModule,
    TypeOrmModule.forFeature([
      SimplyGrowOrder,
      MarketMakingOrder,
      StrategyInstance,
      StrategyExecutionHistory,
      StrategyOrderIntentEntity,
    ]),
    FeeModule,
    TickModule,
    DurabilityModule,
    ExecutionModule,
    TrackersModule,
    DexModule,
    Web3Module,
  ],
  controllers: [StrategyController],
  providers: [
    StrategyService,
    AlpacaStratService,
    StrategyIntentExecutionService,
    StrategyIntentWorkerService,
    StrategyIntentStoreService,
    QuoteExecutorManagerService,
    TimeIndicatorStrategyService,
  ],
  exports: [StrategyService],
})
export class StrategyModule {}

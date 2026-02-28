import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorStrategyHistory } from 'src/common/entities/indicator-strategy-history.entity';
import { ArbitrageHistory } from 'src/common/entities/market-making/arbitrage-order.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyDefinitionVersion } from 'src/common/entities/market-making/strategy-definition-version.entity';
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
import { AlpacaStratService } from './alpacastrat.service';
import { ArbitrageStrategyExecutor } from './executors/arbitrage-strategy.executor';
import { PureMarketMakingStrategyExecutor } from './executors/pure-market-making-strategy.executor';
import { VolumeStrategyExecutor } from './executors/volume-strategy.executor';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
import { StrategyController } from './strategy.controller';
import { StrategyExecutorRegistry } from './strategy-executor.registry';
import { StrategyService } from './strategy.service';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';
import { StrategyIntentWorkerService } from './strategy-intent-worker.service';
import { StrategyExecutor } from './strategy-executor.types';
import { TimeIndicatorStrategyService } from './time-indicator.service';

const STRATEGY_EXECUTORS = 'STRATEGY_EXECUTORS';

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
      ArbitrageHistory,
      MarketMakingHistory,
      StrategyDefinition,
      StrategyDefinitionVersion,
      StrategyOrderIntentEntity,
      IndicatorStrategyHistory,
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
    TimeIndicatorStrategyService,
    ArbitrageStrategyExecutor,
    PureMarketMakingStrategyExecutor,
    VolumeStrategyExecutor,
    {
      provide: STRATEGY_EXECUTORS,
      useFactory: (
        arbitrage: ArbitrageStrategyExecutor,
        pureMarketMaking: PureMarketMakingStrategyExecutor,
        volume: VolumeStrategyExecutor,
      ): StrategyExecutor[] => [arbitrage, pureMarketMaking, volume],
      inject: [
        ArbitrageStrategyExecutor,
        PureMarketMakingStrategyExecutor,
        VolumeStrategyExecutor,
      ],
    },
    {
      provide: StrategyExecutorRegistry,
      useFactory: (executors: StrategyExecutor[]) =>
        new StrategyExecutorRegistry(executors),
      inject: [STRATEGY_EXECUTORS],
    },
  ],
  exports: [StrategyService],
})
export class StrategyModule {}

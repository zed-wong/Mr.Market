import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicatorStrategyHistory } from 'src/common/entities/indicator-strategy-history.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyDefinitionVersion } from 'src/common/entities/market-making/strategy-definition-version.entity';
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
import { ArbitrageStrategyController } from './controllers/arbitrage-strategy.controller';
import { PureMarketMakingStrategyController } from './controllers/pure-market-making-strategy.controller';
import { VolumeStrategyController } from './controllers/volume-strategy.controller';
import { DexModule } from './dex.module';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { StrategyControllerRegistry } from './strategy-controller.registry';
import { StrategyController as StrategyRuntimeController } from './strategy-controller.types';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';
import { StrategyIntentWorkerService } from './strategy-intent-worker.service';
import { TimeIndicatorStrategyService } from './time-indicator.service';

const STRATEGY_CONTROLLERS = 'STRATEGY_CONTROLLERS';

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
      StrategyDefinition,
      StrategyDefinitionVersion,
      StrategyExecutionHistory,
      StrategyOrderIntentEntity,
      IndicatorStrategyHistory,
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
    ArbitrageStrategyController,
    PureMarketMakingStrategyController,
    VolumeStrategyController,
    {
      provide: STRATEGY_CONTROLLERS,
      useFactory: (
        arbitrage: ArbitrageStrategyController,
        pureMarketMaking: PureMarketMakingStrategyController,
        volume: VolumeStrategyController,
      ): StrategyRuntimeController[] => [arbitrage, pureMarketMaking, volume],
      inject: [
        ArbitrageStrategyController,
        PureMarketMakingStrategyController,
        VolumeStrategyController,
      ],
    },
    {
      provide: StrategyControllerRegistry,
      useFactory: (controllers: StrategyRuntimeController[]) =>
        new StrategyControllerRegistry(controllers),
      inject: [STRATEGY_CONTROLLERS],
    },
  ],
  exports: [StrategyService],
})
export class StrategyModule {}

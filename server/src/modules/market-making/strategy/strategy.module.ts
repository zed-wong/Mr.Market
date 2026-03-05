import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyDefinitionVersion } from 'src/common/entities/market-making/strategy-definition-version.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';

import { MarketdataModule } from '../../data/market-data/market-data.module';
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
import { ExecutorOrchestratorService } from './executor-orchestrator.service';
import { QuoteExecutorManagerService } from './quote-executor-manager.service';
import { StrategyService } from './strategy.service';
import { StrategyConfigResolverService } from './strategy-config-resolver.service';
import { StrategyControllerRegistry } from './strategy-controller.registry';
import { StrategyController as StrategyRuntimeController } from './strategy-controller.types';
import { StrategyIntentExecutionService } from './strategy-intent-execution.service';
import { StrategyIntentStoreService } from './strategy-intent-store.service';
import { StrategyIntentWorkerService } from './strategy-intent-worker.service';
import { StrategyMarketDataProviderService } from './strategy-market-data-provider.service';
import { StrategyRuntimeDispatcherService } from './strategy-runtime-dispatcher.service';
import { TimeIndicatorStrategyService } from './time-indicator.service';

const STRATEGY_CONTROLLERS = 'STRATEGY_CONTROLLERS';

@Module({
  imports: [
    PerformanceModule,
    LoggerModule,
    TypeOrmModule.forFeature([
      SimplyGrowOrder,
      MarketMakingOrder,
      StrategyInstance,
      StrategyDefinition,
      StrategyDefinitionVersion,
      StrategyExecutionHistory,
      StrategyOrderIntentEntity,
    ]),
    FeeModule,
    TickModule,
    DurabilityModule,
    ExecutionModule,
    TrackersModule,
    MarketdataModule,
    DexModule,
    Web3Module,
  ],
  providers: [
    StrategyService,
    AlpacaStratService,
    StrategyIntentExecutionService,
    StrategyIntentWorkerService,
    StrategyIntentStoreService,
    ExecutorOrchestratorService,
    QuoteExecutorManagerService,
    StrategyConfigResolverService,
    StrategyRuntimeDispatcherService,
    StrategyMarketDataProviderService,
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
  exports: [
    StrategyService,
    StrategyConfigResolverService,
    StrategyRuntimeDispatcherService,
  ],
})
export class StrategyModule {}

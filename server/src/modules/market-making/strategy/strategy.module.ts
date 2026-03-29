import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
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
import { LedgerModule } from '../ledger/ledger.module';
import { PerformanceModule } from '../performance/performance.module';
import { TickModule } from '../tick/tick.module';
import { TrackersModule } from '../trackers/trackers.module';
import type { StrategyController as StrategyRuntimeController } from './config/strategy-controller.types';
import { ArbitrageStrategyController } from './controllers/arbitrage-strategy.controller';
import { PureMarketMakingStrategyController } from './controllers/pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { TimeIndicatorStrategyController } from './controllers/time-indicator-strategy.controller';
import { VolumeStrategyController } from './controllers/volume-strategy.controller';
import { StrategyMarketDataProviderService } from './data/strategy-market-data-provider.service';
import { AlpacaStratService } from './dex/alpacastrat.service';
import { DexModule } from './dex/dex.module';
import { StrategyConfigResolverService } from './dex/strategy-config-resolver.service';
import { StrategyIntentExecutionService } from './execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { StrategyIntentWorkerService } from './execution/strategy-intent-worker.service';
import { StrategyRuntimeDispatcherService } from './execution/strategy-runtime-dispatcher.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from './intent/quote-executor-manager.service';
import { StrategyService } from './strategy.service';

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
      StrategyExecutionHistory,
      StrategyOrderIntentEntity,
      ExchangeOrderMapping,
    ]),
    FeeModule,
    LedgerModule,
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
    ArbitrageStrategyController,
    PureMarketMakingStrategyController,
    VolumeStrategyController,
    TimeIndicatorStrategyController,
    {
      provide: STRATEGY_CONTROLLERS,
      useFactory: (
        arbitrage: ArbitrageStrategyController,
        pureMarketMaking: PureMarketMakingStrategyController,
        volume: VolumeStrategyController,
        timeIndicator: TimeIndicatorStrategyController,
      ): StrategyRuntimeController[] => [
        arbitrage,
        pureMarketMaking,
        volume,
        timeIndicator,
      ],
      inject: [
        ArbitrageStrategyController,
        PureMarketMakingStrategyController,
        VolumeStrategyController,
        TimeIndicatorStrategyController,
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

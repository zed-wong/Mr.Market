import { forwardRef, Module } from '@nestjs/common';
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
import { OrderScopedBalanceQueryService } from '../balance-state/order-scoped-balance-query.service';
import { DurabilityModule } from '../durability/durability.module';
import { ExchangeApiKeyModule } from '../exchange-api-key/exchange-api-key.module';
import { ExecutionModule } from '../execution/execution.module';
import { FeeModule } from '../fee/fee.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PerformanceModule } from '../performance/performance.module';
import { KillSwitchService } from '../risk/kill-switch.service';
import { TickModule } from '../tick/tick.module';
import { TrackersModule } from '../trackers/trackers.module';
import type { StrategyController as StrategyRuntimeController } from './config/strategy-controller.types';
import { ArbitrageStrategyController } from './controllers/arbitrage-strategy.controller';
import { EfficientDualAccountVolumeStrategyController } from './controllers/efficient-dual-account-volume-strategy.controller';
import { PureMarketMakingStrategyController } from './controllers/pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from './controllers/strategy-controller.registry';
import { TimeIndicatorStrategyController } from './controllers/time-indicator-strategy.controller';
import { VolumeStrategyController } from './controllers/volume-strategy.controller';
import { StrategyMarketDataProviderService } from './data/strategy-market-data-provider.service';
import { DexModule } from './dex/dex.module';
import { StrategyConfigResolverService } from './dex/strategy-config-resolver.service';
import { EfficientDualAccountRuntimeService } from './dual-account/efficient-dual-account-runtime.service';
import { DualAccountPlannerService } from './dual-account/dual-account-planner.service';
import { StrategyIntentExecutionService } from './execution/strategy-intent-execution.service';
import { StrategyIntentStoreService } from './execution/strategy-intent-store.service';
import { StrategyIntentWorkerService } from './execution/strategy-intent-worker.service';
import { StrategyRuntimeDispatcherService } from './execution/strategy-runtime-dispatcher.service';
import { ExecutorOrchestratorService } from './intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from './intent/quote-executor-manager.service';
import { PmmMarkoutEvaluatorService } from './observation/pmm-markout-evaluator.service';
import { RuntimeObservationService } from './observation/runtime-observation.service';
import { AdaptivePmmStateService } from './pmm/adaptive-pmm-state.service';
import { QuotePlannerService } from './quote/quote-planner.service';
import { StrategyStartupRecoveryService } from './recovery/strategy-startup-recovery.service';
import { DualAccountRuntimeStateService } from './runtime/dual-account-runtime-state.service';
import { StrategyInstanceLifecycleService } from './runtime/strategy-instance-lifecycle.service';
import { StrategySessionRegistryService } from './runtime/strategy-session-registry.service';
import { StrategyWatcherManagerService } from './runtime/strategy-watcher-manager.service';
import { FillSettlementService } from './settlement/fill-settlement.service';
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
    ExchangeApiKeyModule,
    TickModule,
    DurabilityModule,
    ExecutionModule,
    TrackersModule,
    MarketdataModule,
    forwardRef(() => DexModule),
    forwardRef(() => Web3Module),
  ],
  providers: [
    StrategyService,
    StrategyIntentExecutionService,
    StrategyIntentWorkerService,
    StrategyIntentStoreService,
    ExecutorOrchestratorService,
    QuoteExecutorManagerService,
    PmmMarkoutEvaluatorService,
    RuntimeObservationService,
    AdaptivePmmStateService,
    StrategyConfigResolverService,
    StrategyRuntimeDispatcherService,
    StrategyMarketDataProviderService,
    FillSettlementService,
    StrategyStartupRecoveryService,
    KillSwitchService,
    QuotePlannerService,
    StrategyInstanceLifecycleService,
    StrategySessionRegistryService,
    StrategyWatcherManagerService,
    DualAccountRuntimeStateService,
    OrderScopedBalanceQueryService,
    DualAccountPlannerService,
    EfficientDualAccountRuntimeService,
    ArbitrageStrategyController,
    PureMarketMakingStrategyController,
    EfficientDualAccountVolumeStrategyController,
    VolumeStrategyController,
    TimeIndicatorStrategyController,
    {
      provide: STRATEGY_CONTROLLERS,
      useFactory: (
        arbitrage: ArbitrageStrategyController,
        pureMarketMaking: PureMarketMakingStrategyController,
        efficientDualAccountVolume: EfficientDualAccountVolumeStrategyController,
        volume: VolumeStrategyController,
        timeIndicator: TimeIndicatorStrategyController,
      ): StrategyRuntimeController[] => [
        arbitrage,
        pureMarketMaking,
        efficientDualAccountVolume,
        volume,
        timeIndicator,
      ],
      inject: [
        ArbitrageStrategyController,
        PureMarketMakingStrategyController,
        EfficientDualAccountVolumeStrategyController,
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
    StrategyIntentStoreService,
    DualAccountPlannerService,
  ],
})
export class StrategyModule {}

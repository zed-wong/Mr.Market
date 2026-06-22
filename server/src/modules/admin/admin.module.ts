import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { CampaignJoin } from 'src/common/entities/campaign/campaign-join.entity';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { EvmExecution } from 'src/common/entities/market-making/evm-execution.entity';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { OrderLpPosition } from 'src/common/entities/market-making/order-lp-position.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';

import { CampaignModule } from '../campaign/campaign.module';
import { GrowdataModule } from '../data/grow-data/grow-data.module';
import { SpotdataModule } from '../data/spot-data/spot-data.module';
import { CustomConfigModule } from '../infrastructure/custom-config/custom-config.module';
import { ExchangeInitModule } from '../infrastructure/exchange-init/exchange-init.module';
import { HealthModule } from '../infrastructure/health/health.module';
import { ExchangeApiKeyModule } from '../market-making/exchange-api-key/exchange-api-key.module';
import { ExecutionModule } from '../market-making/execution/execution.module';
import { LedgerModule } from '../market-making/ledger/ledger.module';
import { MetricsModule } from '../market-making/metrics/metrics.module';
import { PerformanceModule } from '../market-making/performance/performance.module';
import { ReconciliationModule } from '../market-making/reconciliation/reconciliation.module';
import { StrategyModule } from '../market-making/strategy/strategy.module';
import { TokenRegistryModule } from '../market-making/token-registry/token-registry.module';
import { TrackersModule } from '../market-making/trackers/trackers.module';
import { TradingAccountModule } from '../market-making/trading-account/trading-account.module';
import { UserOrdersModule } from '../market-making/user-orders/user-orders.module';
import { MixinClientModule } from '../mixin/client/mixin-client.module';
import { Web3Module } from '../web3/web3.module';
import { AdminController } from './admin.controller';
import { AdminAnalyticsController } from './analytics/admin-analytics.controller';
import { AdminAnalyticsService } from './analytics/admin-analytics.service';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminExchangesModule } from './exchanges/exchanges.module';
import { AdminFeeController } from './fee/admin-fee.controller';
import { AdminFeeService } from './fee/admin-fee.service';
import { AdminGrowService } from './growdata/adminGrow.service';
import { AdminDirectMarketMakingController } from './market-making/admin-direct-mm.controller';
import { AdminDirectMarketMakingService } from './market-making/admin-direct-mm.service';
import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminOrdersService } from './orders/admin-orders.service';
import { AdminUserOrdersController } from './orders/admin-user-orders.controller';
import { AdminUserOrdersService } from './orders/admin-user-orders.service';
import { AdminLedgerController } from './ledger/admin-ledger.controller';
import { AdminLedgerService } from './ledger/admin-ledger.service';
import { AdminSpotService } from './spot/admin-spot.service';
import { AdminStrategyService } from './strategy/adminStrategy.service';
import { AdminAuditModule } from './system/admin-audit.module';
import { AdminSystemAuditController } from './system/admin-system-audit.controller';
import { AdminSystemConfigController } from './system/admin-system-config.controller';
import { AdminSystemConfigService } from './system/admin-system-config.service';
import { AdminSystemHealthController } from './system/admin-system-health.controller';
import { AdminSystemHealthService } from './system/admin-system-health.service';

@Module({
  imports: [
    AdminExchangesModule,
    AdminAuditModule,
    StrategyModule,
    GrowdataModule,
    SpotdataModule,
    MixinClientModule,
    CampaignModule,
    UserOrdersModule,
    TrackersModule,
    ExecutionModule,
    LedgerModule,
    ExchangeApiKeyModule,
    ExchangeInitModule,
    CustomConfigModule,
    MetricsModule,
    PerformanceModule,
    HealthModule,
    ReconciliationModule,
    TokenRegistryModule,
    TradingAccountModule,
    TypeOrmModule.forFeature([
      StrategyExecutionHistory,
      ExchangeOrderMapping,
      StrategyInstance,
      StrategyDefinition,
      StrategyOrderIntentEntity,
      TrackedOrderEntity,
      EvmExecution,
      OrderLpPosition,
      MarketMakingOrder,
      SimplyGrowOrder,
      LedgerEntry,
      MarketMakingOrderBalance,
      APIKeysConfig,
      MixinUser,
      CampaignJoin,
      Contribution,
      Performance,
      CustomConfigEntity,
      GrowdataMarketMakingPair,
      SpotdataTradingPair,
    ]),
    Web3Module,
  ],
  controllers: [
    AdminController,
    AdminAnalyticsController,
    AdminDashboardController,
    AdminOrdersController,
    AdminUserOrdersController,
    AdminLedgerController,
    AdminSystemHealthController,
    AdminSystemConfigController,
    AdminSystemAuditController,
    AdminFeeController,
    AdminDirectMarketMakingController,
  ],
  providers: [
    AdminStrategyService,
    AdminAnalyticsService,
    AdminDashboardService,
    AdminOrdersService,
    AdminUserOrdersService,
    AdminLedgerService,
    AdminSystemHealthService,
    AdminSystemConfigService,
    AdminDirectMarketMakingService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
  exports: [
    AdminStrategyService,
    AdminAnalyticsService,
    AdminDashboardService,
    AdminOrdersService,
    AdminUserOrdersService,
    AdminLedgerService,
    AdminSystemHealthService,
    AdminSystemConfigService,
    AdminDirectMarketMakingService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
})
export class AdminModule {}

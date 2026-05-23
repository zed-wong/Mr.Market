import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import { CustomConfigEntity } from 'src/common/entities/admin/custom-config.entity';
import { CampaignJoin } from 'src/common/entities/campaign/campaign-join.entity';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from 'src/common/entities/data/spot-data.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { ExchangeOrderMapping } from 'src/common/entities/market-making/exchange-order-mapping.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { CampaignModule } from '../campaign/campaign.module';
import { GrowdataModule } from '../data/grow-data/grow-data.module';
import { SpotdataModule } from '../data/spot-data/spot-data.module';
import { ExchangeInitModule } from '../infrastructure/exchange-init/exchange-init.module';
import { CustomConfigModule } from '../infrastructure/custom-config/custom-config.module';
import { HealthModule } from '../infrastructure/health/health.module';
import { ExchangeApiKeyModule } from '../market-making/exchange-api-key/exchange-api-key.module';
import { ExecutionModule } from '../market-making/execution/execution.module';
import { LedgerModule } from '../market-making/ledger/ledger.module';
import { MetricsModule } from '../market-making/metrics/metrics.module';
import { PerformanceService } from '../market-making/performance/performance.service';
import { ReconciliationModule } from '../market-making/reconciliation/reconciliation.module';
import { StrategyModule } from '../market-making/strategy/strategy.module';
import { TrackersModule } from '../market-making/trackers/trackers.module';
import { UserOrdersModule } from '../market-making/user-orders/user-orders.module';
import { MixinClientModule } from '../mixin/client/mixin-client.module';
import { Web3Module } from '../web3/web3.module';
import { AdminController } from './admin.controller';
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
import { AdminPositionsController } from './positions/admin-positions.controller';
import { AdminPositionsService } from './positions/admin-positions.service';
import { AdminSpotService } from './spot/admin-spot.service';
import { AdminStrategyService } from './strategy/adminStrategy.service';
import { AdminSystemHealthController } from './system/admin-system-health.controller';
import { AdminSystemHealthService } from './system/admin-system-health.service';
import { AdminSystemConfigController } from './system/admin-system-config.controller';
import { AdminSystemConfigService } from './system/admin-system-config.service';
import { AdminSystemLogsController } from './system/admin-system-logs.controller';
import { AdminSystemLogsService } from './system/admin-system-logs.service';
import { AdminAuditModule } from './system/admin-audit.module';
import { AdminSystemAuditController } from './system/admin-system-audit.controller';

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
    HealthModule,
    ReconciliationModule,
    TypeOrmModule.forFeature([
      StrategyExecutionHistory,
      ExchangeOrderMapping,
      StrategyInstance,
      StrategyDefinition,
      StrategyOrderIntentEntity,
      TrackedOrderEntity,
      MarketMakingOrder,
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
    AdminDashboardController,
    AdminOrdersController,
    AdminPositionsController,
    AdminSystemHealthController,
    AdminSystemConfigController,
    AdminSystemLogsController,
    AdminSystemAuditController,
    AdminFeeController,
    AdminDirectMarketMakingController,
  ],
  providers: [
    AdminStrategyService,
    AdminDashboardService,
    AdminOrdersService,
    AdminPositionsService,
    AdminSystemHealthService,
    AdminSystemConfigService,
    AdminSystemLogsService,
    AdminDirectMarketMakingService,
    PerformanceService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
  exports: [
    AdminStrategyService,
    AdminDashboardService,
    AdminOrdersService,
    AdminPositionsService,
    AdminSystemHealthService,
    AdminSystemConfigService,
    AdminSystemLogsService,
    AdminDirectMarketMakingService,
    AdminGrowService,
    AdminSpotService,
    AdminFeeService,
  ],
})
export class AdminModule {}

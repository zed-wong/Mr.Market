import { BullModule } from '@nestjs/bull';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { MixinMessage } from 'src/common/entities/mixin/mixin-message.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';

import { AppController } from './app.controller';
import { AdminAuditLogEntity } from './common/entities/admin/admin-audit-log.entity';
import { AdminAuthStateEntity } from './common/entities/admin/admin-auth-state.entity';
import { AdminPasskeyCredentialEntity } from './common/entities/admin/admin-passkey-credential.entity';
import { APIKeysConfig } from './common/entities/admin/api-keys.entity';
import { CustomConfigEntity } from './common/entities/admin/custom-config.entity';
import { SetupConfigEntity } from './common/entities/admin/setup-config.entity';
import { SetupStateEntity } from './common/entities/admin/setup-state.entity';
import { Web3LoginNonceEntity } from './common/entities/auth/web3-login-nonce.entity';
import { CampaignJoin } from './common/entities/campaign/campaign-join.entity';
import { Contribution } from './common/entities/campaign/contribution.entity';
import { HufiScoreSnapshot } from './common/entities/campaign/hufi-score-snapshot.entity';
import {
  GrowdataArbitragePair,
  GrowdataExchange,
  GrowdataMarketMakingPair,
  GrowdataSimplyGrowToken,
} from './common/entities/data/grow-data.entity';
import { SpotdataTradingPair } from './common/entities/data/spot-data.entity';
import { LedgerEntry } from './common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from './common/entities/ledger/market-making-order-balance.entity';
import { RewardAllocation } from './common/entities/ledger/reward-allocation.entity';
import { RewardLedger } from './common/entities/ledger/reward-ledger.entity';
import { ShareLedgerEntry } from './common/entities/ledger/share-ledger-entry.entity';
import { ExchangeOrderMapping } from './common/entities/market-making/exchange-order-mapping.entity';
import { EvmExecution } from './common/entities/market-making/evm-execution.entity';
import { MarketMakingLifecycleEvent } from './common/entities/market-making/market-making-lifecycle-event.entity';
import { MarketMakingOrderIntent } from './common/entities/market-making/market-making-order-intent.entity';
import { Performance } from './common/entities/market-making/performance.entity';
import { StrategyDefinition } from './common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from './common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from './common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from './common/entities/market-making/strategy-order-intent.entity';
import { TokenRegistryEntry } from './common/entities/market-making/token-registry-entry.entity';
import { TrackedOrderEntity } from './common/entities/market-making/tracked-order.entity';
import { TradingAccount } from './common/entities/market-making/trading-account.entity';
import {
  MixinReleaseHistory,
  MixinReleaseToken,
} from './common/entities/mixin/mixin-release.entity';
import { Withdrawal } from './common/entities/mixin/withdrawal.entity';
import {
  MarketMakingPaymentState,
  PaymentState,
} from './common/entities/orders/payment-state.entity';
import { SpotOrder } from './common/entities/orders/spot-order.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from './common/entities/orders/user-orders.entity';
import { ConsumerReceipt } from './common/entities/system/consumer-receipt.entity';
import { OutboxEvent } from './common/entities/system/outbox-event.entity';
import { Web3EventLog } from './common/entities/web3/web3-event-log.entity';
import { Web3FundingRequest } from './common/entities/web3/web3-funding-request.entity';
import { Web3Withdrawal } from './common/entities/web3/web3-withdrawal.entity';
import configuration from './config/configuration';
import { AdminController } from './modules/admin/admin.controller';
import { AdminModule } from './modules/admin/admin.module';
import { AdminAuditModule } from './modules/admin/system/admin-audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { CoingeckoModule } from './modules/data/coingecko/coingecko.module';
import { GrowdataModule } from './modules/data/grow-data/grow-data.module';
import { MarketdataModule } from './modules/data/market-data/market-data.module';
import { SpotdataModule } from './modules/data/spot-data/spot-data.module';
import { ExchangeInitModule } from './modules/infrastructure/exchange-init/exchange-init.module';
import { HealthModule } from './modules/infrastructure/health/health.module';
import { LoggerModule } from './modules/infrastructure/logger/logger.module';
import { CustomLogger } from './modules/infrastructure/logger/logger.service';
import { DurabilityModule } from './modules/market-making/durability/durability.module';
import { LedgerModule } from './modules/market-making/ledger/ledger.module';
import { MetricsModule } from './modules/market-making/metrics/metrics.module';
import { OrchestrationModule } from './modules/market-making/orchestration/orchestration.module';
import { PerformanceModule } from './modules/market-making/performance/performance.module';
import { ReconciliationModule } from './modules/market-making/reconciliation/reconciliation.module';
import { RewardsModule } from './modules/market-making/rewards/rewards.module';
import { StrategyModule } from './modules/market-making/strategy/strategy.module';
import { TickModule } from './modules/market-making/tick/tick.module';
import { TrackersModule } from './modules/market-making/trackers/trackers.module';
import { UserOrdersModule } from './modules/market-making/user-orders/user-orders.module';
import { MixinModule } from './modules/mixin/mixin.module';
import { SetupModule } from './modules/setup/setup.module';
import { SetupGuardMiddleware } from './modules/setup/setup-guard.middleware';
import { SetupConfigModule } from './modules/setup-config/setup-config.module';
import { Web3Module } from './modules/web3/web3.module';

dotenv.config();

function buildRedisConfig(configService: ConfigService) {
  const parsed = new URL(
    configService.get<string>('redis.url', 'redis://localhost:6379/0'),
  );

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    db:
      parsed.pathname && parsed.pathname !== '/'
        ? Number(parsed.pathname.slice(1)) || 0
        : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

@Module({
  imports: [
    LoggerModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DATABASE_PATH || 'data/mr_market.db',
      entities: [
        StrategyExecutionHistory,
        StrategyInstance,
        StrategyDefinition,
        Performance,
        SpotOrder,
        AdminAuditLogEntity,
        AdminAuthStateEntity,
        AdminPasskeyCredentialEntity,
        SetupConfigEntity,
        SetupStateEntity,
        Web3LoginNonceEntity,
        APIKeysConfig,
        CampaignJoin,
        CustomConfigEntity,
        Contribution,
        MixinReleaseToken,
        MixinReleaseHistory,
        MixinMessage,
        MixinUser,
        MarketMakingOrder,
        PaymentState,
        MarketMakingPaymentState,
        SimplyGrowOrder,
        SpotdataTradingPair,
        GrowdataExchange,
        GrowdataSimplyGrowToken,
        GrowdataArbitragePair,
        GrowdataMarketMakingPair,
        Withdrawal,
        MarketMakingOrderIntent,
        MarketMakingLifecycleEvent,
        LedgerEntry,
        MarketMakingOrderBalance,
        OutboxEvent,
        ConsumerReceipt,
        RewardLedger,
        RewardAllocation,
        ShareLedgerEntry,
        HufiScoreSnapshot,
        StrategyOrderIntentEntity,
        ExchangeOrderMapping,
        TrackedOrderEntity,
        EvmExecution,
        TradingAccount,
        TokenRegistryEntry,
        Web3FundingRequest,
        Web3EventLog,
        Web3Withdrawal,
      ],
      synchronize: false,
      migrations: [join(__dirname, 'database/migrations/*{.ts,.js}')],
      migrationsTableName: 'migrations_typeorm',
      migrationsRun: true,
      extra: {
        flags: ['-WAL'],
      },
    }),
    ScheduleModule.forRoot(),
    StrategyModule,
    PerformanceModule,
    MarketdataModule,
    SpotdataModule,
    GrowdataModule,
    ExchangeInitModule,
    CoingeckoModule,
    HealthModule,
    SetupConfigModule,
    SetupModule,
    MixinModule,
    AuthModule,
    AdminAuditModule,
    AdminModule,
    CampaignModule,
    Web3Module,
    MetricsModule,
    UserOrdersModule,
    TickModule,
    LedgerModule,
    DurabilityModule,
    TrackersModule,
    ReconciliationModule,
    RewardsModule,
    OrchestrationModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: buildRedisConfig(configService),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController, AdminController],
  providers: [
    CustomLogger,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SetupGuardMiddleware).forRoutes('*');
  }
}

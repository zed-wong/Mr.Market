# Server Module Map

This map is based on the root wiring in `server/src/app.module.ts` and each `*.module.ts` file under `server/src/modules`.

## Root Composition

- `AppModule` loads cross-cutting runtime pieces: `ConfigModule`, `TypeOrmModule`, `ScheduleModule`, `BullModule`, and all business domains.
- `AppModule` is the only place where all domains are composed together.

## Domain Map

### admin

- `modules/admin/admin.module.ts`
  - Depends on: `AdminExchangesModule`, `StrategyModule`, `GrowdataModule`, `SpotdataModule`, `MixinClientModule`, `DexModule`, `Web3Module`.
  - Main role: admin control plane.
- `modules/admin/exchanges/exchanges.module.ts`
  - Depends on: `ExchangeModule`.
  - Main role: admin exchange endpoints.

### auth

- `modules/auth/auth.module.ts`
  - Depends on: `PassportModule`, `ConfigModule`, `UserModule`, `JwtModule`.
  - Main role: authentication and JWT issuance.

### campaign

- `modules/campaign/campaign.module.ts`
  - Depends on: `Web3Module`, `ExchangeInitModule`, TypeORM campaign entities.
  - Main role: campaign sync and score estimation.

### data

- `modules/data/coingecko/coingecko.module.ts`
  - Depends on: `CacheModule`.
  - Main role: cached CoinGecko proxy.
- `modules/data/grow-data/grow-data.module.ts`
  - Depends on: `CacheModule`, `MixinClientModule`, TypeORM grow entities.
  - Main role: grow metadata and market-making pair data.
- `modules/data/market-data/market-data.module.ts`
  - Depends on: `CacheModule`.
  - Main role: market data service and gateway.
- `modules/data/spot-data/spot-data.module.ts`
  - Depends on: `CacheModule`, `MarketdataModule`, TypeORM spot pair entity.
  - Main role: spot pair metadata and APIs.

### defi

- `modules/defi/defi.module.ts`
  - Depends on: none.
  - Main role: DEX adapter registry and adapter providers.

### infrastructure

- `modules/infrastructure/custom-config/custom-config.module.ts`
  - Depends on: TypeORM custom config entity.
  - Main role: runtime config persistence.
- `modules/infrastructure/exchange-init/exchange-init.module.ts`
  - Depends on: `CacheModule`, `ExchangeApiKeyModule`.
  - Main role: exchange bootstrap and shared initialization.
- `modules/infrastructure/health/health.module.ts`
  - Depends on: `MixinModule`, `ExchangeInitModule`.
  - Main role: health endpoints.
- `modules/infrastructure/logger/logger.module.ts`
  - Depends on: none.
  - Main role: shared logger provider.

### market-making

- `modules/market-making/strategy/strategy.module.ts`
  - Depends on: `PerformanceModule`, `LoggerModule`, `FeeModule`, `TickModule`, `DurabilityModule`, `ExecutionModule`, `TrackersModule`, `MarketdataModule`, `DexModule`, `Web3Module`, TypeORM strategy entities.
  - Main role: strategy runtime.
- `modules/market-making/strategy/dex/dex.module.ts`
  - Depends on: `Web3Module`, `DefiModule`.
  - Main role: DEX strategy execution support.
- `modules/market-making/user-orders/user-orders.module.ts`
  - Depends on: `StrategyModule`, `FeeModule`, `GrowdataModule`, `SnapshotsModule`, `TransactionModule`, `WithdrawalModule`, `LocalCampaignModule`, `ExchangeModule`, `NetworkMappingModule`, `CampaignModule`, `MixinClientModule`, `LedgerModule`, queue `market-making`.
  - Main role: market-making user order lifecycle.
- `modules/market-making/tick/tick.module.ts`
  - Depends on: `ConfigModule`.
  - Main role: tick loop coordinator.
- `modules/market-making/trackers/trackers.module.ts`
  - Depends on: `TickModule`, `ExecutionModule`.
  - Main role: order book/private stream/order trackers.
- `modules/market-making/execution/execution.module.ts`
  - Depends on: `ConfigModule`.
  - Main role: exchange execution adapter.
- `modules/market-making/ledger/ledger.module.ts`
  - Depends on: TypeORM ledger entities, `DurabilityModule`.
  - Main role: internal balance ledger.
- `modules/market-making/durability/durability.module.ts`
  - Depends on: TypeORM durability entities.
  - Main role: outbox and idempotent receipt store.
- `modules/market-making/orchestration/orchestration.module.ts`
  - Depends on: `StrategyModule`, `LedgerModule`, `DurabilityModule`, `WithdrawalModule`, `TrackersModule`, `ExecutionModule`.
  - Main role: pause and withdraw orchestration.
- `modules/market-making/reconciliation/reconciliation.module.ts`
  - Depends on: TypeORM ledger/reward/intent entities, `TrackersModule`.
  - Main role: consistency checks and repair logic.
- `modules/market-making/rewards/rewards.module.ts`
  - Depends on: TypeORM reward entities, `DurabilityModule`, `LedgerModule`, `Web3Module`, `TransactionModule`.
  - Main role: reward pipeline and transfer.
- `modules/market-making/network-mapping/network-mapping.module.ts`
  - Depends on: `MixinClientModule`.
  - Main role: network/chain mapping.
- `modules/market-making/performance/performance.module.ts`
  - Depends on: TypeORM performance entity.
  - Main role: performance metrics endpoints.
- `modules/market-making/metrics/metrics.module.ts`
  - Depends on: TypeORM strategy execution history.
  - Main role: strategy execution metrics.
- `modules/market-making/fee/fee.module.ts`
  - Depends on: `ConfigModule`, `ExchangeInitModule`, `MixinClientModule`, `CustomConfigModule`, `GrowdataModule`.
  - Main role: fee policy and calculations.
- `modules/market-making/exchange-api-key/exchange-api-key.module.ts`
  - Depends on: `ConfigModule`, TypeORM key/order/release entities.
  - Main role: exchange credentials and exchange operation primitives.
- `modules/market-making/local-campaign/local-campaign.module.ts`
  - Depends on: TypeORM campaign entities, queue `local-campaigns`.
  - Main role: local campaign queue processing.

### mixin

- `modules/mixin/mixin.module.ts`
  - Depends on: `SnapshotsModule`, `ExchangeModule`, `MessageModule`, `UserModule`, `WithdrawalModule`.
  - Main role: aggregate Mixin domain module.
- `modules/mixin/client/mixin-client.module.ts`
  - Depends on: `ConfigModule`.
  - Main role: shared Mixin API client.
- `modules/mixin/snapshots/snapshots.module.ts`
  - Depends on: queues `snapshots` and `market-making`, TypeORM market-making order intent, `MixinClientModule`, `TransactionModule`.
  - Main role: snapshot ingestion and queue bridge to MM flow.
- `modules/mixin/withdrawal/withdrawal.module.ts`
  - Depends on: TypeORM withdrawal, queues `withdrawals` and `withdrawal-confirmations`, `MixinClientModule`, `WalletModule`, `LedgerModule`, `ConfigModule`.
  - Main role: withdrawal execution and confirmation workflow.
- `modules/mixin/exchange/exchange.module.ts`
  - Depends on: `ExchangeApiKeyModule`.
  - Main role: exchange-facing API endpoints.
- `modules/mixin/user/user.module.ts`
  - Depends on: TypeORM mixin user, `MixinClientModule`.
  - Main role: Mixin user persistence.
- `modules/mixin/message/message.module.ts`
  - Depends on: TypeORM mixin message, `UserModule`, `MixinClientModule`.
  - Main role: message handling.
- `modules/mixin/transaction/transaction.module.ts`
  - Depends on: `MixinClientModule`.
  - Main role: transaction query abstraction.
- `modules/mixin/wallet/wallet.module.ts`
  - Depends on: `MixinClientModule`.
  - Main role: wallet operation abstraction.
- `modules/mixin/rebalance/rebalance.module.ts`
  - Depends on: `ConfigModule`, `ExchangeModule`, `SnapshotsModule`.
  - Main role: rebalance APIs/services.
- `modules/mixin/listeners/events.module.ts`
  - Depends on: `ExchangeModule`, `SnapshotsModule`, `CustomConfigModule`, `StrategyModule`, `GrowdataModule`, `LoggerModule`.
  - Main role: listener wiring composition.

### web3

- `modules/web3/web3.module.ts`
  - Depends on: none.
  - Main role: shared chain/web3 service.

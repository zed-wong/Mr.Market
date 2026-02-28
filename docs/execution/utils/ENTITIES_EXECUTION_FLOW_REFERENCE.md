# Entity Files in Execution Flow

This document lists all entity files in `server/src/common/entities`, what they store, where they are used, and where they sit in the central execution flow.

## How to read this

- `Purpose`: What business data the entity owns.
- `Main usage`: Main modules/services that read or write it.
- `Flow stage`: Where it appears in the runtime flow (especially market-making execution).

## Central execution flow stages

1. Boot and ORM registration (`AppModule` + TypeORM)
2. Snapshot intake and payment tracking (`market-making` queue)
3. Payment completion and order state transitions
4. Campaign/local participation handling
5. Strategy session start and stop
6. Tick-driven intent creation
7. Intent worker execution and exchange interaction
8. Ledger/reward reconciliation and payout
9. Durability and idempotency (outbox + consumer receipts)
10. Admin/config/catalog and Mixin support flows

## Entity reference

| Entity file | Class(es) | Purpose | Main usage | Flow stage |
| --- | --- | --- | --- | --- |
| `server/src/common/entities/admin/api-keys.entity.ts` | `APIKeysConfig` | Stores exchange API credentials metadata (key id, exchange, key/secret fields). | `modules/mixin/exchange/*`, `modules/infrastructure/exchange-init/*` | 10 |
| `server/src/common/entities/admin/custom-config.entity.ts` | `CustomConfigEntity` | Stores configurable runtime fee and balance limits. | `modules/infrastructure/custom-config/*`, `modules/admin/*`, seed defaults | 10 |
| `server/src/common/entities/campaign/campaign.entity.ts` | `Campaign` | Stores campaign metadata (pair, chain, reward token, window, status). | `modules/campaign/*`, `modules/market-making/local-campaign/*` | 4 |
| `server/src/common/entities/campaign/campaign-participation.entity.ts` | `CampaignParticipation` | Tracks user participation in local campaign context. | `modules/market-making/local-campaign/*` | 4 |
| `server/src/common/entities/campaign/contribution.entity.ts` | `Contribution` | Stores contribution records linked to user/client and strategy context. | `modules/admin/strategy/*`, admin module wiring | 4, 10 |
| `server/src/common/entities/campaign/hufi-score-snapshot.entity.ts` | `HufiScoreSnapshot` | Stores calculated daily HuFi score snapshots for pair/exchange. | `modules/campaign/hufi-score-estimator.service.ts` | 8 |
| `server/src/common/entities/data/grow-data.entity.ts` | `GrowdataExchange`, `GrowdataSimplyGrowToken`, `GrowdataArbitragePair`, `GrowdataMarketMakingPair` | Stores static catalog/config for exchange, token, and strategy pair definitions. | `modules/data/grow-data/*`, admin fee and growdata services, seeder | 10 |
| `server/src/common/entities/data/spot-data.entity.ts` | `SpotdataTradingPair` | Stores spot trading pair precision, limits, fee config, and enable flags. | `modules/data/spot-data/*`, admin spot management, seeder | 10 |
| `server/src/common/entities/ledger/ledger-entry.entity.ts` | `LedgerEntry` | Append-only ledger mutation records for balance operations. | `modules/market-making/ledger/balance-ledger.service.ts` | 8 |
| `server/src/common/entities/ledger/balance-read-model.entity.ts` | `BalanceReadModel` | Current materialized balance state per user and asset (available/locked/total). | `modules/market-making/ledger/*`, `modules/market-making/reconciliation/*` | 8 |
| `server/src/common/entities/ledger/reward-allocation.entity.ts` | `RewardAllocation` | Stores per-user reward allocation outputs per campaign/day. | `modules/market-making/rewards/*`, `modules/market-making/reconciliation/*` | 8 |
| `server/src/common/entities/ledger/reward-ledger.entity.ts` | `RewardLedger` | Tracks observed reward distribution transactions and status. | `modules/market-making/rewards/*`, reconciliation | 8 |
| `server/src/common/entities/ledger/share-ledger-entry.entity.ts` | `ShareLedgerEntry` | Stores share accounting entries used by reward/share logic. | `modules/market-making/rewards/share-ledger.service.ts` | 8 |
| `server/src/common/entities/market-making/strategy-definition.entity.ts` | `StrategyDefinition` | Strategy catalog/template records (key, executor type, config schema, defaults, enabled state, current version). | `modules/admin/strategy/adminStrategy.service.ts`, strategy admin APIs, seeder | 5, 10 |
| `server/src/common/entities/market-making/strategy-definition-version.entity.ts` | `StrategyDefinitionVersion` | Immutable strategy definition snapshots for published versions. | `modules/admin/strategy/adminStrategy.service.ts`, seeder backfill/version listing | 5, 10 |
| `server/src/common/entities/market-making/strategy-instances.entity.ts` | `StrategyInstance` | Durable strategy runtime session metadata (`strategyKey`, params, status) plus dynamic definition linkage (`definitionId`, `definitionVersion`). | `modules/market-making/strategy/strategy.service.ts`, `modules/admin/strategy/adminStrategy.service.ts` | 5, 6, 10 |
| `server/src/common/entities/market-making/strategy-order-intent.entity.ts` | `StrategyOrderIntentEntity` | Durable intent queue/state table for tick-created strategy intents. | `strategy-intent-store.service.ts`, `strategy-intent-worker.service.ts`, reconciliation | 6, 7 |
| `server/src/common/entities/market-making/market-making-order-intent.entity.ts` | `MarketMakingOrderIntent` | Tracks market-making order setup intent lifecycle (`pending`, `completed`, etc.). | `modules/market-making/user-orders/*`, `modules/mixin/snapshots/*` | 2, 3 |
| `server/src/common/entities/orders/user-orders.entity.ts` | `MarketMakingOrder`, `SimplyGrowOrder` | Stores user-created product orders and their lifecycle state. | `modules/market-making/user-orders/*`, strategy module wiring | 2, 3, 5 |
| `server/src/common/entities/orders/payment-state.entity.ts` | `PaymentState`, `MarketMakingPaymentState` | Stores payment state machine and required/received funding and fee fields. | `modules/market-making/user-orders/market-making.processor.ts` + service | 2, 3 |
| `server/src/common/entities/market-making/market-making-order.entity.ts` | `MarketMakingHistory` | Stores executed market-making order history records from exchange actions. | strategy services/tests, metrics, user-orders APIs | 7, 8 |
| `server/src/common/entities/market-making/arbitrage-order.entity.ts` | `ArbitrageHistory` | Stores arbitrage execution history and result fields. | strategy services/tests, user-orders service | 7, 8 |
| `server/src/common/entities/market-making/performance.entity.ts` | `Performance` | Stores performance snapshots (PnL and strategy metrics). | `modules/market-making/performance/*` | 8 |
| `server/src/common/entities/mixin/mixin-user.entity.ts` | `MixinUser` | Stores Mixin user profile/auth-related fields and linked info. | `modules/mixin/user/*`, admin strategy services/helpers | 10 |
| `server/src/common/entities/mixin/mixin-message.entity.ts` | `MixinMessage` | Stores inbound/outbound Mixin message payload metadata and status. | `modules/mixin/message/*` | 10 |
| `server/src/common/entities/mixin/mixin-release.entity.ts` | `MixinReleaseToken`, `MixinReleaseHistory` | Stores release token flow and release history records. | `modules/mixin/exchange/exchange.repository.ts` | 10 |
| `server/src/common/entities/mixin/withdrawal.entity.ts` | `Withdrawal` | Stores withdrawal lifecycle from creation to tx ids and destination metadata. | `modules/mixin/withdrawal/*` | 3, 10 |
| `server/src/common/entities/orders/spot-order.entity.ts` | `SpotOrder` | Stores spot order requests generated through exchange module integration. | `modules/mixin/exchange/*` | 7, 10 |
| `server/src/common/entities/system/outbox-event.entity.ts` | `OutboxEvent` | Durable outbox events for asynchronous/eventual processing. | `modules/market-making/durability/durability.service.ts` | 9 |
| `server/src/common/entities/system/consumer-receipt.entity.ts` | `ConsumerReceipt` | Idempotency receipt log to prevent duplicate consumer processing. | `modules/market-making/durability/durability.service.ts` | 9 |

## Where these entities are centralized

- Runtime registration happens in `server/src/app.module.ts` through `TypeOrmModule.forRoot({ entities: [...] })`.
- The high-traffic execution path is mostly `modules/market-making/**` and uses:
  - order + payment entities during snapshot/payment stages,
  - strategy + intent entities during tick/worker stages,
  - ledger + reward entities during accounting/reconciliation stages,
  - system durability entities for outbox/idempotency guarantees.
- Support entities (`admin`, `data`, `mixin`) provide config, catalogs, credentials, and external integration state that execution services depend on.

## Notes for future updates

- When adding a new entity file, update this document with its purpose and flow stage.
- If an entity shifts runtime responsibility (for example, from sync to worker path), update both `Main usage` and `Flow stage`.
- Keep this document aligned with `docs/execution/flow/MARKET_MAKING_FLOW.md`.
- Keep strategy entity rows aligned with `docs/plans/2026-02-28-strategy-dynamic-migration-guide.md` after each schema/versioning update.

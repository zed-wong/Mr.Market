# Entity Ownership Matrix

This file maps key entities to module ownership and business usage.

## Strategy and runtime entities

| Entity | Primary owner module | Also used by | Business purpose |
| --- | --- | --- | --- |
| `StrategyDefinition` | `market-making/strategy` | `admin/strategy`, `user-orders` | Defines strategy contract with JSON config schema and default config. |
| `StrategyInstance` | `market-making/strategy` | `admin/strategy`, `user-orders` | Runtime/session lifecycle metadata; strategy config source of truth now comes from MarketMakingOrder.strategySnapshot. |
| `StrategyExecutionHistory` | `market-making/strategy` | `metrics`, `campaign`, `user-orders` | Historical performance and lifecycle evidence. |
| `StrategyOrderIntentEntity` | `market-making/strategy` | `reconciliation` | Durable action intent queue with status transitions. |
| `MarketMakingOrderIntent` | `market-making/user-orders` | `mixin/snapshots` | Payment-linked intent bound to `userId`, carrying prevalidated configOverrides before active order run. |
| `MarketMakingOrder` | `market-making/user-orders` | `strategy`, `admin`, `exchange-api-key` | User market-making order with pinned strategySnapshot. |
| `ExchangeOrderMapping` | `market-making/execution` | `strategy` | Fill routing fallback when clientOrderId parsing fails. |
| `IndicatorStrategyHistory` | `market-making/strategy` | `admin` | Time-indicator strategy execution history. |

## User order and payment entities

| Entity | Primary owner module | Also used by | Business purpose |
| --- | --- | --- | --- |
| `SimplyGrowOrder` | `market-making/user-orders` | `strategy`, `admin` | Grow product order state. |
| `MarketMakingPaymentState` | `market-making/user-orders` | `mixin/snapshots` | Tracks paid/pending/failure settlement states. |
| `SpotOrder` | spot/order modules | `app root` | Spot trading order persistence. |

## Ledger and rewards entities

| Entity | Primary owner module | Also used by | Business purpose |
| --- | --- | --- | --- |
| `LedgerEntry` | `market-making/ledger` | `reconciliation`, `orchestration`, `rewards` | Append-only mutation journal for all balance changes. |
| `BalanceReadModel` | `market-making/ledger` | `reconciliation`, caller services | Current balance snapshot per account/asset. |
| `RewardLedger` | `market-making/rewards` | `reconciliation` | Reward cycle-level accounting state. |
| `RewardAllocation` | `market-making/rewards` | `reconciliation` | Per-user reward distribution amounts. |
| `ShareLedgerEntry` | `market-making/rewards` | `orchestration`, `reconciliation` | Share basis for reward allocation. |

## Durability and safety entities

| Entity | Primary owner module | Also used by | Business purpose |
| --- | --- | --- | --- |
| `OutboxEvent` | `market-making/durability` | `ledger`, `strategy`, `orchestration`, `rewards` | Durable event evidence for side effects. |
| `ConsumerReceipt` | `market-making/durability` | any idempotent consumer | Idempotent processing marker for exactly-once-like behavior. |

## Mixin, campaign, and config entities

| Entity | Primary owner module | Also used by | Business purpose |
| --- | --- | --- | --- |
| `MixinUser` | `mixin/user` | `auth`, `message` | User identity and account linkage. |
| `MixinMessage` | `mixin/message` | user interaction flows | Bot/user message persistence. |
| `Withdrawal` | `mixin/withdrawal` | `orchestration`, `user-orders` | Outbound transfer state and retries. |
| `Campaign` | `campaign` | `local-campaign`, `admin` | Campaign metadata and status. |
| `CampaignParticipation` | `local-campaign` | `campaign`, `user-orders` | User participation linkage. |
| `Contribution` | `campaign` | admin/reporting | Contribution records for campaign economics. |
| `HufiScoreSnapshot` | `campaign` | reporting/admin | Daily HUFI score evidence. |
| `CustomConfigEntity` | `infrastructure/custom-config` | `fee`, operations | Runtime tuning values. |
| `APIKeysConfig` | `market-making/exchange-api-key` | `exchange`, `exchange-init`, execution paths | Exchange credential and mode configuration. |

## Ownership rules used in current codebase

- Strategy state entities are owned by strategy module, even when admin APIs mutate them.
- Payment/order entities are owned by user-orders module, with snapshots as feeder and strategy as consumer.
- Ledger and durability entities are cross-cutting but still have single-owner modules (`ledger`, `durability`).
- Campaign entities are split: external campaign sync in `campaign`, local queue participation in `local-campaign`.

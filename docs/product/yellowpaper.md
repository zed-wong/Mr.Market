# Mr.Market Yellowpaper: Technical Specification

## Abstract

This yellowpaper defines the technical architecture, data model, state machines, and execution specifications for HuFi and Mr.Market. It is the implementation source of truth and complements the thesis and vision in the whitepaper.

## Table of Contents

- [1. System Architecture Overview](#1-system-architecture-overview)
- [2. Funding Layer Specification](#2-funding-layer-specification)
  - [2.1 Principles](#21-principles)
  - [2.2 Funding Entry Points](#22-funding-entry-points)
  - [2.3 Order Balance Model](#23-order-balance-model)
  - [2.4 Balance Fields](#24-balance-fields)
  - [2.5 Fund Isolation: Quota Mechanism](#25-fund-isolation-quota-mechanism)
  - [2.6 Reservation Rules](#26-reservation-rules)
  - [2.7 Fee Handling](#27-fee-handling)
  - [2.8 Ledger, Balance, and Reservation](#28-ledger-balance-and-reservation)
  - [2.9 Ledger Concurrency and Reconstruction Rules](#29-ledger-concurrency-and-reconstruction-rules)
- [3. Scheduling Layer Specification](#3-scheduling-layer-specification)
  - [3.1 Instance Definition](#31-instance-definition)
  - [3.2 Strategy Instances and User Orders](#32-strategy-instances-and-user-orders)
  - [3.3 Strategy Definitions and Configuration Snapshots](#33-strategy-definitions-and-configuration-snapshots)
  - [3.4 CEX-First Execution Boundary](#34-cex-first-execution-boundary)
  - [3.5 Order Lifecycle](#35-order-lifecycle)
  - [3.6 Responsibilities](#36-responsibilities)
  - [3.7 Two Principles](#37-two-principles)
  - [3.8 State Machine Specification](#38-state-machine-specification)
- [4. Trading Layer Specification](#4-trading-layer-specification)
  - [4.1 Execution Path](#41-execution-path)
  - [4.2 Responsibility Split](#42-responsibility-split)
  - [4.3 Constraints](#43-constraints)
  - [4.4 Tick Execution Specification](#44-tick-execution-specification)
    - [4.4.1 Tick Coordinator](#441-tick-coordinator)
    - [4.4.2 Data Flow](#442-data-flow)
    - [4.4.3 Controller and Intent](#443-controller-and-intent)
    - [4.4.4 Parallelism Boundaries](#444-parallelism-boundaries)
    - [4.4.5 Invariants](#445-invariants)
- [5. Reward Distribution Specification](#5-reward-distribution-specification)
  - [5.1 Two-Layer Model](#51-two-layer-model)
  - [5.2 Internal Score Calculation](#52-internal-score-calculation)
  - [5.3 Platform Fee](#53-platform-fee)
  - [5.4 User Allocation Formula](#54-user-allocation-formula)
  - [5.5 Invariants](#55-invariants)

## 1. System Architecture Overview

The system is divided into three layers plus horizontal capabilities:

```text
┌─────────────────────────────────────────────┐
│                 Funding Layer               │
│  Mixin / EVM / Solana → Order Balance       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│                Scheduling Layer              │
│  NestJS · State machine · Quota · Queue · API│
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│                 Trading Layer                │
│  Controller → Action → Executor → State      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Horizontal: ledger · recon · risk · audit · observability │
└─────────────────────────────────────────────┘
```

Core data flow:

```text
funds enter → order balance → strategy configuration snapshot → quota reservation → exchange order → fills and fees → ledger, rewards, and audit records
```

## 2. Funding Layer Specification

The funding layer is responsible for fund entry, exit, ownership confirmation, and order-level balance as the source of truth. The funding layer does not decide strategy and does not promise returns.

### 2.1 Principles

| Principle | Description |
|------|------|
| Ownership | Funds belong to a specific user order, not merely a user or wallet address |
| Traceability | Every deposit, refund, withdrawal, and arrival confirmation must be traceable, replayable, and auditable |
| Responsibility boundary | The funding layer is responsible only for fund entry, exit, and confirmation; it does not decide strategy or promise returns |
| Source of truth | Ledger Entry is the balance source of truth, OrderBalance is the read model for runtime quota checks and reservation, and external chain/wallet/exchange balances are only evidence sources |

### 2.2 Funding Entry Points

Near term: Mixin deposits and refunds. Later: EVM, Solana, and other on-chain entry points.

### 2.3 Order Balance Model

Order Balance is the read model for runtime quota checks and reservation. Balances are bound to a ledger order scope, not merely to users or exchange accounts. Orders, fills, cancellations, fees, and PnL must all be expressed through Ledger Entry and update the order-level balance view.

Order identity vocabulary:

| Name | Meaning | Primary use |
|------|---------|-------------|
| `userOrderId` | Product and user-facing order identity. | Order detail, UI/API reads, PnL, rewards, withdrawals, and reporting aggregate by this id. |
| `ledgerOrderId` | Balance bucket identity. | Ledger Entry, OrderBalance, reservation, fill settlement, fee settlement, withdrawals, and reconciliation balance checks are keyed by `ledgerOrderId + asset`. |
| `accountLabel` | Execution account or strategy leg under a `userOrderId`, for example `default`, `maker`, or `taker`. It is not an order id by itself. | Exchange routing, dual-account scope resolution, tracked orders, and reconciliation reports. |
| `clientOrderId` | Client-supplied venue order id generated before order placement. | Placement idempotency and fill routing; submitted exchange-safe forms are mapped back through `ExchangeOrderMapping`. |
| `exchangeOrderId` | Venue-side order id returned by the exchange or on-chain execution venue. | Fetch, cancel, open-order reconciliation, and fill matching. It must never be used as a balance scope. |

Single-account orders normally use `userOrderId === ledgerOrderId` with `accountLabel = 'default'`. Dual-account orders share one `userOrderId` and use separate ledger scopes, such as `ledgerOrderId = <userOrderId>:maker` and `ledgerOrderId = <userOrderId>:taker`, resolved only through the centralized ledger-order-scope helper.

Existing database columns named `orderId` in ledger, balance, tracked-order, and exchange-order-mapping storage semantically store `ledgerOrderId`. New service contracts must not pass a naked `orderId` when both `userOrderId` and `ledgerOrderId` are possible.

### 2.4 Balance Fields

Each ledger order scope maintains the following fields per asset:

| Field | Meaning |
|------|------|
| `available` | Quota available for new reservations |
| `locked` | Quota already reserved but not yet filled |
| `total` | `available + locked` |
| `initialDeposit` | Initial deposit amount |
| `realizedDelta` | Realized PnL |
| `feePaid` | Fees paid |

### 2.5 Fund Isolation: Quota Mechanism

Fund isolation uses a quota mechanism rather than physical fund separation inside the exchange. Reason: exchange accounts cannot internally partition balances.

- Exchange accounts hold commingled funds;
- Each order receives an order-level quota;
- At runtime, the system ensures each order's real-time fund usage does not exceed its quota;
- The sum of all active order quotas on the same execution account must not exceed that account balance;
- Reservation is required before order placement;
- Reservation reads OrderBalance to perform quota checks; the balance source of truth is Ledger Entry.

### 2.6 Reservation Rules

Reservation is Mr.Market's internal order-level fund-locking rule. It does not have to be an independent persistent domain object from the beginning. It occupies an order balance before an external exchange order is placed, preventing multiple strategy instances, workers, or ticks from reusing the same funds.

Hummingbot-style single-user bots can usually rely on exchange balances and the exchange's open-order lock. Mr.Market cannot rely only on exchange balances, because multiple user orders may share the same execution account. The exchange only sees commingled funds and cannot distinguish which funds belong to which Mr.Market order. Therefore, Mr.Market must complete internal reservation before allowing external order placement.

The reservation specification focuses on invariants, not table structure. The MVP implementation can express reservation with `LedgerEntry` entries such as `reserve_lock` / `reserve_release` plus a stable reference on the intent or tracked order. An independent `Reservation` table should only be introduced when recovery, reconciliation, partial fills, and manual handling need richer query capability.

```text
risk check
  → reserve_lock + OrderBalance.available → OrderBalance.locked
  → bind reservation ref to intent / tracked order
  → exchange order
  → fill_settle / reserve_release
```

#### Locked Asset

Before a strategy places an order, it must reserve quota from the order balance. Locking and balance checking must happen in the same atomic operation; the system must not read `available` first and then place an order asynchronously.

| Order side | Locked asset | Locked amount |
|----------|----------|--------|
| Buy | Quote asset | `price × qty + estimatedFee` |
| Sell | Base asset | `qty + estimatedFee` |

#### Lifecycle Semantics

The following states are business semantics and do not mandate an independent `Reservation.state` field. Implementations can express them through ledger entry type, intent status, tracked order status, and audit records together.

```text
requested → active → consumed
                  ↘ released
                  ↘ expired
                  ↘ failed
                  ↘ manual_review
```

| State | Meaning |
|------|------|
| `requested` | The system is preparing to lock funds; optional state, and the MVP may move directly from check to `active` |
| `active` | Funds are locked and can be bound to an external order |
| `consumed` | The external order filled and the locked quota has been settled |
| `released` | The external order was cancelled, failed, or its unfilled portion was released |
| `expired` | The reservation timed out without being bound to a valid external order |
| `failed` | Locking failed, for example due to insufficient balance or a concurrency conflict |
| `manual_review` | Internal locking cannot be automatically aligned with the external order and requires manual handling |

#### Relationship with Ledger

Reservation itself is not the final balance source of truth. All balance effects from reservation must be expressed through Ledger Entry:

| Action | Ledger Entry |
|------|--------------|
| Create active reservation | `reserve_lock`, moving funds from `available` to `locked` |
| Release unused reservation | `reserve_release` |
| Fill settlement | `fill_settle` + `fee_debit` |
| Reverse abnormal reservation | `reversal` |

`OrderBalance.locked` is a derived view aggregated from active reservations. The implementation may use enum names such as `LOCK` / `UNLOCK`, but they must clearly map to the business semantics of `reserve_lock` / `reserve_release`.

#### Invariants

1. Before creating an external order, order-level `reserve_lock` must succeed;
2. One active reservation can bind only one explicit intent or one external order;
3. `reserve_lock` must be serialized by `ledgerOrderId + asset` and must not make `available` less than 0;
4. If external order placement fails, is rejected, or does not return a valid order ID, the locked quota must be released or moved to `manual_review`;
5. When an order is cancelled, the unfilled portion must be `reserve_release`;
6. When an external order partially fills, the filled portion is `consumed`, and the unfilled portion remains `locked` or is `released`;
7. Once a reservation reaches a terminal state, it cannot return to active; corrections can only be expressed through a new ledger entry or reversal;
8. During system recovery, active reservations must reconcile against open exchange orders, intents, or tracked orders;
9. If no corresponding external order or intent can be found, an expired reservation must be released or moved to manual handling.

### 2.7 Fee Handling

Priority:

1. **Real fee**: prefer the actual fee from fill events or CCXT returns;
2. **Estimated fee**: when the real fee is unavailable, use the maker/taker rate from the CCXT market according to order role:
   - post-only maker order → maker fee
   - IOC / market order / taker leg → taker fee
   - uncertain role → use the more conservative taker fee
3. **Correction**: estimated fees must later be corrected by real fees or reconciliation results.

### 2.8 Ledger, Balance, and Reservation

Mr.Market uses a ledger-first balance system. Order balances are derived from immutable Ledger Entries.

| Object | Owning module | Responsibility |
|------|----------|------|
| `LedgerEntry` | Funding layer / Ledger module | Record one immutable balance change |
| `OrderBalance` | Funding layer / Balance module | Current balance view for one ledger order scope and one asset |
| `Reservation` | Funding layer rule, optional independent module | Temporary order-balance lock before strategy order placement; the MVP can express it with ledger entries plus intent / tracked order references, as described in 2.6 |

Each `LedgerEntry` must include: `ledgerOrderId`, `userOrderId`, `accountLabel`, `asset`, `amount`, `type`, `idempotencyKey`, `refType`, `refId`, and `createdAt`. Current storage may name the `ledgerOrderId` column `orderId`; the semantic field is still `ledgerOrderId`. After a Ledger Entry is created, it is immutable; any correction must be expressed through a new reversal entry.

Balance fields are obtained by ledger aggregation:

```text
total = available + locked
available = balance available for new reservations
locked = balance locked by reservation and not yet released or settled
```

| Ledger type | Meaning |
|-------------|------|
| `deposit_credit` | User deposit confirmation |
| `reserve_lock` | Balance locked before order placement |
| `reserve_release` | Locked balance released after cancellation, failure, or expiration |
| `fill_settle` | Base/quote changes settled after a fill |
| `fee_debit` | Fee deduction |
| `withdraw_debit` | Withdrawal or refund deduction |
| `reversal` | Reversal of a historical entry |

Invariants:

1. All balance changes can happen only through Ledger Entry;
2. The same `idempotencyKey` can produce only one effective ledger impact;
3. `available` must not be less than 0;
4. `locked` must not be less than 0;
5. External orders must not bypass reservation and directly occupy funds;
6. Ledger Entries cannot be updated or deleted; only reversal records can be appended.

The ledger types above are business-semantic names. Concrete code enums may differ, but they must preserve one-to-one mapping and must not use generic adjustment paths to hide the business reasons for order locking, release, fill, or fee.

### 2.9 Ledger Concurrency and Reconstruction Rules

Ledger Entry is the balance source of truth; `OrderBalance` is the read model used for runtime queries and concurrency control. Any balance change must complete the following in the same database transaction:

```text
validate idempotencyKey
  → append LedgerEntry
  → update OrderBalance
  → commit
```

If the transaction fails, neither the Ledger Entry nor `OrderBalance` may take effect.

#### Idempotency

Every operation that changes a balance must provide a stable `idempotencyKey`. When the same `idempotencyKey` is submitted again:

| Case | Handling |
|------|------|
| Request content is consistent with the recorded ledger | Return the existing result |
| Request content is inconsistent with the recorded ledger | Reject and record an audit error |
| Original transaction was not committed | Produce no balance impact |

#### Concurrency Control

`OrderBalance` updates must be serialized by `ledgerOrderId + asset`. The implementation may use database row locks, optimistic lock versioning, or an equivalent mechanism. Regardless of the mechanism, it must guarantee:

1. `available` cannot be deducted below zero by concurrent operations;
2. The same available balance cannot be locked by two reservations at the same time;
3. `LedgerEntry` and `OrderBalance` cannot have one succeed while the other fails;
4. Balance checks and balance updates must complete within the same transaction.

#### Reversal

Ledger Entries cannot be updated or deleted. To correct a historical entry, append a new `reversal` entry and point to the original entry through `reversalOf` or an equivalent reference.

```text
original entry:    fill_settle +10
correction entry:  reversal    -10, reversalOf=<originalEntryId>
```

The reversed entry remains in the ledger. During balance reconstruction, both the original entry and the reversal entry must be applied.

#### Reconstruction Rules

The system must be able to reconstruct any `OrderBalance` from Ledger Entries:

```text
OrderBalance(ledgerOrderId, asset)
  = Σ(LedgerEntry where ledgerOrderId and asset)
```

Reconstruction is used for:

- Repairing damaged read models;
- Verifying consistency between `OrderBalance` and ledger aggregation;
- Disaster recovery;
- Auditing historical balances.

If `OrderBalance` differs from the ledger aggregation result, the ledger is authoritative. The system must pause new reservations for affected orders, rebuild the read model, and record an audit event.

## 3. Scheduling Layer Specification

The scheduling layer is the system control plane, based on the NestJS backend. It is responsible for instances, orders, strategy configuration, lifecycle, quota calculation, task scheduling, and APIs.

### 3.1 Instance Definition

An instance is a complete deployed Mr.Market server that can run multiple strategies at the same time.

### 3.2 Strategy Instances and User Orders

- One strategy instance binds one Mr.Market user order;
- One strategy instance binds one execution account;
- The strategy configuration snapshot is fixed when the user order is created or started;
- Subsequent trades, fills, fees, and PnL must all be attributable back to that order.

### 3.3 Strategy Definitions and Configuration Snapshots

#### Design Judgment

| Object | Role | Mutable |
|------|------|----------|
| `StrategyDefinition` | Strategy class/product family. Defines controller type, schema, capability declarations, launch surfaces, and visibility. It does not represent one reusable parameter preset. | Admin-manageable |
| `StrategyTemplate` | Reusable parameter preset under a strategy definition. Defines named default parameter sets that operators/users can select and override when creating an order. | Admin-manageable |
| `strategySnapshot` | Order-level frozen runtime strategy config resolved from definition + template + order overrides + runtime fields. Runtime uses this, not live definitions/templates. | Immutable after creation |

#### Creation Flow

When creating a market-making order, the system generates an order-level strategy snapshot through the following flow:

```text
StrategyDefinition
  + StrategyTemplate
  + order overrides
  + runtime order fields
  → configSchema validation
  → decimal field normalization
  → MarketMakingOrder.strategySnapshot
```

`strategySnapshot` contains at least:

| Field | Meaning |
|------|------|
| `strategyDefinitionId` | Source strategy definition |
| `definitionKey` | Source strategy key |
| `controllerType` | Bound built-in Controller type |
| `resolvedConfig` | Configuration actually used by the order |
| `resolvedAt` | Snapshot generation time |

After an order enters runtime, it may only read `strategySnapshot.resolvedConfig`. Later changes to `StrategyDefinition` or `StrategyTemplate` must not change created orders.

#### Adjustable Scope

Users can adjust parameters exposed by the Controller, for example:

- Spread, order amount, number of levels, and refresh time;
- Price source, price upper/lower bounds, and inventory skew;
- Buy/sell direction, slippage, number of trades, and interval;
- EMA/RSI thresholds, time windows, take-profit, and stop-loss.

These parameters can change strategy behavior, but they cannot create new strategy logic.

If a new signal, combined condition, execution state machine, hedging rule, or order coordination method is needed, the server-side `Strategy Controller` must be added or modified, and a new `controllerType` must be registered.

#### Dynamic Quoting Parameters

Some strategy categories, such as Adaptive PMM, require the Controller to dynamically calculate quoting parameters such as spread, size, and refresh according to market volatility, order-book trading intensity, inventory deviation, and other indicators. Mr.Market does not add an independent "parameter tuning layer" for such strategies. Instead, it follows these rules:

1. Dynamic quoting parameter calculation is internal behavior of the `Strategy Controller`, and the Controller remains the single entry point for strategy decisions;
2. Metrics required for calculation must be implemented as shared indicator modules, such as `InstantVolatility`, `TradingIntensity`, and `InventorySkew`, so they can be reused by multiple Controllers; they themselves do not hold strategy state or produce side effects;
3. Dynamic parameters can only take values within the parameter boundaries declared by `strategySnapshot.resolvedConfig`; out-of-range values must be clipped and written to decision audit;
4. Dynamic parameter calculation must not cross Controller boundaries, call exchanges, modify balances, write Ledger, or bypass Intent to place orders directly;
5. The Controller must explicitly define behavior during the "indicator warm-up period": while warm-up is incomplete, it must not produce new order-placement intents;
6. The inputs of the same dynamic quoting submodule (snapshot, OrderBalance, indicator state) and its outputs (final quote parameters) must be replayable for backtesting and attribution.

The indicator combinations, warm-up rules, and clipping behavior for specific strategy categories, such as Adaptive PMM, are defined by the architecture document for that Controller and are not expanded here.

### 3.4 CEX-First Execution Boundary

The first implementation scope includes only CEX execution.

Definitions:

| Concept | Definition |
|------|------|
| Execution account | One exchange API key |
| Commingled funds | Funds at the exchange API-key level |
| Internal isolation | Enforced by Mr.Market's internal ledger and Order Balance |
| Strategy instance binding | Each strategy instance binds one `userOrderId` and one execution account label; balance effects still settle through the resolved `ledgerOrderId` |

Constraints:

1. Every exchange order and fill must carry `userOrderId`, `ledgerOrderId`, and `accountLabel` attribution for the Mr.Market order that initiated it;
2. Rate limits, open-order limits, trading-pair conflicts, and API-key health together limit how many orders an execution account can support;
3. The trading layer cannot bypass the ledger and directly modify user balances.

### 3.5 Order Lifecycle

```text
awaiting deposit → funded → running → stopping → stopped
                         ↘ withdrawing → refunded
                                      ↘ failed
```

State changes must be idempotent. The database is the source of truth, and in-memory state is only a runtime cache.

### 3.6 Responsibilities

| Responsibility | Description |
|------|------|
| Order management | Create orders and bind users |
| Configuration freezing | Save strategy configuration snapshots |
| Lifecycle | Manage order state-machine transitions |
| Quota calculation | Calculate capital quota and execution quota |
| Task scheduling | Task queues, tick loop, start, stop, withdrawal, and reconciliation |
| API | HTTP API, admin interface, and frontend read models |
| Audit | Save audit logs, state changes, and error reasons |

### 3.7 Two Principles

1. **Database is the source of truth**: in-memory state can only be a runtime cache;
2. **Idempotency**: all actions that change funds, orders, or rewards must be idempotent.

### 3.8 State Machine Specification

All objects that affect funds, orders, execution, or rewards must have explicit state machines. State transitions must be idempotent; repeated requests must not produce duplicate fund impacts.

#### Order Creation Intent State

| Item | Description |
|----|------|
| Owning module | Scheduling layer / User Orders module |
| State object | `MarketMakingOrderIntent.state` |

```text
pending → in_progress → completed
                    ↘ expired
```

`MarketMakingOrderIntent` represents the preliminary intent for a user to create a market-making order. `completed` means a formal `MarketMakingOrder` has been generated; `expired` means the intent timed out and must no longer be used to create an order.

#### User Order State

| Item | Description |
|----|------|
| Owning module | Scheduling layer / User Orders module |
| State object | `MarketMakingOrder.state` |

```text
payment_pending
  → payment_incomplete
  → payment_complete
  → withdrawing
  → withdrawal_confirmed
  → deposit_confirming
  → deposit_confirmed
  → joining_campaign
  → campaign_joined
  → created
  → running
  → paused
  → stopped
  → refunded
  → deleted

any non-terminal state → failed
```

`payment_complete` means order funds have been confirmed; `withdrawal_confirmed` and `deposit_confirmed` mean the fund transfer path has been confirmed; `campaign_joined` means the order is bound to an external campaign; `running` means the strategy may produce intents; `stopped` means there is no active execution; `refunded`, `failed`, and `deleted` are terminal states. When external withdrawal or campaign integration is not enabled, the flow may stop at `payment_complete` or enter `created` directly.

#### Reservation Lifecycle

Reservation is a funding-layer concurrency locking rule used to occupy order-level balances before external order execution, ensuring strategies cannot reuse the same funds.

| Item | Description |
|----|------|
| Ownership | Funding layer rule; optional independent module |
| State carrier | In the MVP, expressed through ledger entries, intent status, tracked order status, and audit records; introduce `Reservation.state` only when stronger query and manual handling capability is needed |

```text
requested → active → consumed
                  ↘ released
                  ↘ expired
                  ↘ failed
                  ↘ manual_review
```

Only an `active` reservation can bind to an external order. `consumed`, `released`, `expired`, `failed`, and `manual_review` are terminal or paused states and cannot return to `active` without audit.

#### Intent State

| Item | Description |
|----|------|
| Owning module | Trading layer / Strategy Intent module |
| State object | `StrategyOrderIntent.status` |

```text
NEW → SENT → ACKED → DONE
        ↘ FAILED
        ↘ CANCELLED
```

`NEW` means the Controller has produced an execution intent; `SENT` means it has been submitted to the execution worker; `ACKED` means the exchange has accepted it; `DONE` means it filled, was cancelled, or requires no further handling. `FAILED` and `CANCELLED` are terminal states.

#### Withdrawal State

| Item | Description |
|----|------|
| Owning module | Funding layer / Withdrawal module |
| State object | `Withdrawal.status` |

```text
pending → queued → processing → sent → confirmed → completed
                                      ↘ failed
                                      ↘ refunded
```

Withdrawals must execute after the strategy is stopped, external orders are cancelled, and reservations are released. `confirmed` means the external transfer is confirmed; `completed` means the withdrawal process is complete. After `completed`, it must not be rolled back; anomalies can only be expressed through a new reversal entry.

#### Reward Settlement State

| Item | Description |
|----|------|
| Owning module | Reward layer / Reward Pipeline module |
| State object | `RewardLedger.status`, `RewardAllocation.status` |

```text
OBSERVED → CONFIRMED → DISTRIBUTED
```

If rewards must first be transferred into Mixin or another distribution account, intermediate states are allowed:

```text
CONFIRMED → TRANSFERRING_TO_MIXIN → TRANSFERRED_TO_MIXIN → DISTRIBUTED
```

User-level reward allocations are tracked per allocation:

```text
CREATED → CREDITED
```

`OBSERVED` means the system has observed an external reward transfer; `CONFIRMED` means the chain or external source has confirmed it; `DISTRIBUTED` means the reward has completed internal user distribution. `CREATED` means a user allocation record has been generated; `CREDITED` means the allocation has been credited to the user balance through the internal ledger.

Reward distribution must be produced from confirmed `RewardLedger` records. User rewards that have been `CREDITED` must not be rewritten because of later fee configuration, score rule, or campaign parameter changes. If correction is needed, it must be expressed through a new ledger reversal or a new reward record.

## 4. Trading Layer Specification

### 4.1 Execution Path

```text
Config → Controller → Action → Executor → State / Report
```

Mapped to the Mr.Market data flow:

```text
Mr.Market order
  → strategy config snapshot
  → order balance / quota
  → exchange order
  → fill ledger
  → reward attribution
```

### 4.2 Responsibility Split

| Component | Responsibility |
|------|------|
| Controller | Produces Actions from strategy configuration and market state |
| Executor | Places orders, cancels orders, retries, rate-limits, and handles exchange errors |
| Ledger | Records balance changes; balances can only change through Ledger |

### 4.3 Constraints

- Every exchange order must map back to one unique Mr.Market order;
- After a fill enters the system, it must update order-level balance, fee, PnL, and the reward attribution basis;
- The trading layer cannot bypass Ledger and directly modify user balances.

### 4.4 Tick Execution Specification

The trading layer uses a tick-driven runtime, but tick is only responsible for advancing time and distributing lightweight signals. It must not carry long-running I/O, exchange requests, or database rewrite paths.

#### 4.4.1 Tick Coordinator

The system has a Tick Coordinator that emits timestamp signals at fixed intervals and notifies registered components according to priority.

| Constraint | Description |
|------|------|
| Tick only advances time | Tick does not directly execute strategy decisions, exchange I/O, or balance settlement |
| Data components first | Orderbook, user stream, and balance freshness must update before strategy components |
| Do not queue on timeout | If one tick times out, the next tick should be dropped rather than queued |
| Health checks first | Unhealthy components skip the current tick and record the reason |

#### 4.4.2 Data Flow

Trading-layer data is divided into write path, fallback polling path, and read path.

```text
write path: WebSocket / user stream / orderbook task → in-memory snapshot
fallback path: REST poller → correct stale or missing snapshots
read path: Controller → read-only snapshot → generate action
```

| Constraint | Description |
|------|------|
| Write path runs independently | WebSocket, orderbook, and balance watcher do not depend on tick consumer queues |
| Controller only reads snapshots | Strategy decisions must not wait for REST, DB, or external APIs |
| REST only as fallback | REST poller triggers only when data is stale, missing, or needed for reconciliation |
| DB writes are async | Fill, intent, ledger, and audit writes must not block the tick main loop |

#### 4.4.3 Controller and Intent

Controllers only produce actions and do not directly execute side effects. After Actions are converted into intents, intent workers execute them independently.

```text
Tick
  → freshness check
  → Controller reads snapshot
  → Action[]
  → Intent Store
  → Intent Worker
  → reservation / risk check / exchange order
  → fill / cancel / ledger settlement
```

| Constraint | Description |
|------|------|
| Controller does not place orders | Controller can only generate action / intent |
| Batch intent writes | Intents produced in the same decision cycle should be written in a batch |
| Workers execute independently | Order placement, cancellation, reservation, and ledger settlement happen in workers or execution services |
| Per-strategy serial execution | Intents from the same strategy must not execute concurrently |
| Per-exchange rate limiting | Intents for the same exchange/account must be subject to rate limits and concurrency caps |

#### 4.4.4 Parallelism Boundaries

| Boundary | Rule |
|------|------|
| Different exchange + pair | May run in parallel |
| Same exchange + pair | Share orderbook and account state; must be serialized or explicitly locked |
| Same strategy | Intents execute serially |
| Same `ledgerOrderId + asset` | Reservation / balance mutation executes serially |

#### 4.4.5 Invariants

1. Tick does not wait for exchange order placement, cancellation, or `loadMarkets()`;
2. Controller does not directly modify balances or directly call Ledger;
3. Controller does not directly call exchanges to place or cancel orders;
4. Before order placement, risk check and reservation are required;
5. Fill/cancel events must eventually enter ledger settlement or reservation release;
6. No new order-placement intent may be generated under stale market data;
7. When tick falls behind, outdated ticks are dropped instead of catching up by executing historical ticks.

## 5. Reward Distribution Specification

### 5.1 Two-Layer Model

**Layer one: HuFi recording oracle**

Mr.Market binds to a campaign through campaign id, web3 address, and exchange API key. The Oracle API provides the API key's data in the campaign:

- Total score
- Daily queryable payout token, daily payout amount, and payout score

**Layer two: Mr.Market internal allocation**

Mr.Market distributes only the daily reward pool it receives from the campaign to internally attributable user orders.

### 5.2 Internal Score Calculation

```text
eligible_fills =
  exchange fills
  where
    fill.executed_at >= campaign_start_time
    and fill.executed_at < campaign_end_time
    and fill.api_key_id = campaign.api_key_id
    and fill.order_id is attributable to a Mr.Market user order
```

Each user order's internal score is calculated from its eligible fills.

### 5.3 Platform Fee

```text
gross_daily_payout    = oracle_payout(campaign_id, day)
platform_fee           = gross_daily_payout × campaign_fee_rate
net_user_reward_pool   = gross_daily_payout - platform_fee
```

- The fee rate is configured by admins per campaign;
- Fee configuration is campaign-level configuration and affects only future reward days that have not yet been settled;
- Settled daily allocations are not rewritten because an admin changes the fee rate.

### 5.4 User Allocation Formula

```text
total_internal_score(campaign, day) = Σ(all eligible user_internal_scores for campaign day)

user_reward(campaign, day) = user_internal_score(campaign, day)
  / total_internal_score(campaign, day)
  × net_user_reward_pool(campaign, day)
```

### 5.5 Invariants

```text
Σ(user_rewards) + platform_fee + undistributed_remainder = gross_daily_payout
Σ(user_rewards) ≤ gross_daily_payout
```

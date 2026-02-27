Changes to Make (Updated: add Balance as the only Source of Truth)

This is the revised **“Changes to Make”** document. It introduces all new parts for a production-grade **tick-driven market making engine**, **HuFi campaign integration**, and the complete **reward receive → calculate → distribute** pipeline — **and now explicitly adds the missing balance/ledger system** as the **only source of truth** for user funds.

---

## 1) Architectural changes to introduce

### 1.1 Introduce a **Tick-Driven Core** as the engine backbone

Add a **Clock/Tick Coordinator** that:

* runs at configurable `tick_size` (default 1s)
* calls `onTick(ts)` / `c_tick()` on registered components in deterministic order
* enforces the engine contract each tick:

  1. trackers process WS queues / apply deltas
  2. strategy/executors compute decisions
  3. intents are created and handed to execution

Tick is the **foundation** of the market making engine (Hummingbot style), not a “nice-to-have safety add-on.

---

### 1.2 Add a **Single-Writer Balance Ledger** as the only source of truth

Add a dedicated **Balance/Ledger subsystem** that becomes the **only place allowed to mutate balances**.

**What “only source of truth” means**

* No other module may directly update balances, credit rewards, unlock funds, or debit withdrawals.
* Everything else submits **commands** to the ledger (“LOCK X”, “CREDIT reward”, “DEBIT withdraw”) and reads balances from the ledger read model.

This is required because:

* exchange events can be delayed or lost
* execution state can be temporarily inconsistent
* rewards and withdrawals must remain correct under restart

---

## 2) Market Making Execution Engine — Parts to Add

### 2.1 Add a unified component interface: `TickComponent`

All major components implement:

* `onTick(ts)`
* `start()`, `stop()`, `health()`

Clock registers components in dependency order:

* trackers before strategy
* strategy before intent execution (or execution worker runs continuously)

---

### 2.2 Add “Order Intent” model (strategy output only)

Strategy produces durable intents:

Intent types:

* `CREATE_LIMIT_ORDER`
* `CANCEL_ORDER`
* `REPLACE_ORDER`
* `STOP_EXECUTOR`

Required fields:

* `intent_id` (idempotency key)
* `strategy_instance_id`
* `exchange`, `pair`, `side`
* `price`, `qty`
* `mixin_order_id`
* `created_at`
* status: `NEW → SENT → ACKED/FAILED → DONE`

Rule: **no direct exchange calls from strategy**.

---

### 2.3 Add Quote/Executor Manager (Strategy V2-style)

Add:

* Executor Manager (lifecycle per market/pair)
* Market Making executors implementing:

  * spread quoting around mid
  * refresh cadence + tolerance
  * inventory skew
  * hanging orders
  * multi-level quotes
  * maker-heavy mode for HuFi

Output: intents only.

---

### 2.4 Add Exchange Connectors (Adapter)

Connector must implement:

* WS (market data)
* WS (user stream)
* REST (place/cancel/status/snapshot/open orders)
* rate limiter (token bucket / weighted)

---

### 2.5 Add Exchange State Trackers (truth reconstruction)

Add:

1. `OrderBookTracker`: (maintain an order book locally, track diff if websocket only return changes)
2. `PrivateStreamTracker`: (track private informations like api key balance with websocket)
3. `ExchangeOrderTracker` (Shadow Ledger): maintain exchange orders locally, update upon websocket/REST api
4. periodic reconciliation jobs: open orders poller, lost order reconciler

---

### 2.6 Add Execution Core worker (intent consumer)

Consumes intents and:

* executes idempotently (have consistency no matter how many times it runs)
* retries/backoff
* respects rate limiter
* updates ExchangeOrderTracker mappings
* emits normalized execution events

---

## 3) **Balance & Funds Management — Parts to Add (Critical)**

### 3.1 Add Balance Ledger (append-only) + Read Model

This is the missing piece: a **ledger** is the system-of-record for user funds.

#### A) Ledger (append-only)

Add `LedgerEntry` with fields:

* `entry_id`
* `user_id`
* `asset_id`
* `amount` (signed)
* `type`
* `ref_type`, `ref_id` (intent/order/withdrawal/reward allocation)
* `created_at`
* `idempotency_key` (unique)

Ledger types (minimum):

* `DEPOSIT_CREDIT` (when user deposits into the bot)
* `LOCK` (reserve funds for MM)
* `UNLOCK`
* `MM_REALIZED_PNL` (optional, if you track PnL internally)
* `REWARD_CREDIT` (HuFi campaign reward credit)
* `WITHDRAW_DEBIT`
* `FEE_DEBIT` (if you charge)
* `ADJUSTMENT` (admin emergency)

#### B) Balance read model

A derived table/materialized view:

* `available`
* `locked`
* `total`

**Invariant**

* `total = available + locked`
* any state transitions must preserve conservation unless an explicit credit/debit occurs.

---

### 3.2 Add Locking semantics for Market Making

Because MM spends pooled capital, each user must have a “reserved” portion.

Add these concepts:

* **User MM Lock**: amount of asset reserved for MM participation
* **Pool Availability**: sum of all users’ locked amounts (available for executor sizing)

Rules:

* user can only withdraw funds that are `available`
* MM executor can only allocate risk up to pool locked amount

This aligns “business truth” (user obligations) with execution risk.

---

### 3.3 Add Settlement Consumers (from exchange events → ledger updates)

Exchange events (fills) must not directly mutate balances. They emit domain events that the ledger consumes.

Add a consumer:

* listens to `TradeFill` events from the execution/tracker layer
* updates internal accounting if you do internal PnL or fee accounting

**Two valid approaches**

1. **Rewards-only accounting** (simpler):

* you do *not* compute per-user trading PnL
* user returns come primarily from HuFi rewards (and maybe fees)
* fills are tracked for HuFi score estimation and risk only

2. **Internal PnL accounting** (harder):

* maintain pool inventory and realized PnL
* distribute PnL by LP-share
* requires additional inventory ledger and mark-to-market reporting

Either way: **ledger remains the only writer**.

---

### 3.4 Add Idempotency for all balance mutations

Every ledger entry must have an idempotency key:

* deposit tx id
* withdrawal request id
* reward allocation id
* admin adjustment id

Consumers must be restart-safe:

* “if ledger entry exists, do nothing”.

---

## 4) HuFi Campaign — Parts to Add (third-party integration)

### 4.1 Campaign Sync

Periodic sync service:

* pulls campaign list/params/status
* stores canonical records
* tracks transitions: active → finished → payout

### 4.2 Campaign Joiner (auto-join with safety gate)

Implement:

* auto-join based on wallet signature flow
* safety gate if join ever requires on-chain tx

### 4.3 HuFi Score Estimator (internal mirror)

Add a service that:

* consumes your bot’s trade fills
* computes HuFi score (maker/taker weights)
* stores per-day score snapshots (audit/debug)

---

## 5) Rewards Pipeline — Parts to Add

### 5.1 Reward Receiver (on-chain)

Add a chain watcher:

* observes reward transfers into server EVM wallet
* confirms after N blocks
* writes `RewardLedger` append-only:

  * `txHash`, token, amount, timestamp
  * `campaign_id`, `day_index`
  * status: `OBSERVED → CONFIRMED`

### 5.2 Reward Vault Transfer (EVM → Mixin bot)

Daily:

* transfer rewards from EVM wallet to Mixin bot balance
* record receipt idempotently
* status: `TRANSFERRED_TO_MIXIN`

---

## 6) Internal Reward Accounting & Distribution — Parts to Add

### 6.1 Add LP-share time-weighted share ledger (recommended)

Add:

* Share Ledger (append-only):

  * deposit mints shares
  * withdraw burns shares
* day window calculator (24h campaign windows)

This needs further design, should it be based on order, or should it be 

### 6.2 Reward Allocation Job

When reward is confirmed/transferred:

* compute user time-weighted shares
* allocate reward proportionally
* write allocation ledger (append-only):

  * `allocation_id` (deterministic)
  * `(campaign_id, day_index, user_id, token, amount, basisShares)`
* status: `CREATED`

### 6.3 Reward Distribution (Mixin internal; 0 gas)

Distributor:

* credits users inside Mixin / internal bot balances
* **writes `REWARD_CREDIT` ledger entries** (single-writer rule)
* records distribution receipts idempotently
* marks allocations as `CREDITED`
* updates reward ledger status: `DISTRIBUTED`

### 6.4 Explicit rounding policy

Define one:

* floor to smallest unit
* remainder: treasury/carryover/largest-share user
  Codify and audit.

---

## 7) Pause/Withdraw orchestration — Parts to Add (balance-aware)

### Pause Orchestrator

* stops executors from creating new intents
* cancels open orders until trackers confirm drained
* keeps locks but prevents further risk
* updates user order state

### Withdraw Orchestrator

* pause + drain
* unlock user funds via ledger (`UNLOCK`)
* debit withdrawal (`WITHDRAW_DEBIT`)
* execute withdrawal in Mixin with receipt
* complete order state

---

## 8) Durability mechanisms — Parts to Add

### 8.1 Outbox + consumer receipts

Add:

* outbox table
* consumer receipt table
* idempotent processing keys:

  * `intent_id`
  * `tx_hash`
  * `allocation_id`
  * `ledger_entry_idempotency_key`

### 8.2 Reconciliation jobs

* exchange open orders vs shadow ledger
* reward ledger consistency:

  * reward amount equals sum allocations + remainder
* ledger consistency:

  * available+locked == total
  * no negative available balances

---

## 9) Definition of Done checklist

### Tick-driven foundation

* [x] Clock exists and drives TickComponents deterministically

### Execution engine

* [x] strategy outputs intents only
* [x] execution worker consumes intents idempotently
* [x] trackers reconstruct orderbook and order state under failure
* [x] reconciliation jobs work

### Balance “only truth”

* [x] ledger is append-only
* [x] read model derives balances
* [x] lock/unlock enforced for MM and withdrawals
* [x] no module other than ledger writes balances

### HuFi + rewards

* [x] campaign sync/join
* [x] on-chain reward receiver
* [x] daily EVM→Mixin vault transfer
* [x] LP-share allocations
* [x] reward credits via ledger + Mixin internal distribution

---

# PMM Active Order Reconciliation Plan

Date: `2026-04-09`
Status: `Proposed`
Related:
- `docs/planning/2026-04-09-pmm-minimum-safe-stability-gap-plan.md`
- `docs/planning/2026-04-09-pmm-minimum-safe-stability-todo.md`

## Goal

Fix the remaining PMM runtime coordination issues that still exist after the minimum-safe-stability work:

- repeated same-side order creation while a previous order is still being created
- refresh behavior that can cancel and recreate in the same tick instead of replacing safely
- stop/resume race windows that still allow tail-end create intents after a stop request

The target behavior should be close to Hummingbot PMM semantics:

- strategy computes a target quote set
- strategy compares target quotes against currently active tracked orders
- strategy cancels stale orders first
- strategy only creates new orders when the relevant slot is free
- by default, strategy waits for cancel completion before creating replacement orders

## Current Problems

### 1. Same-side duplicates while `pending_create`

Current PMM logic still allows repeated `CREATE_LIMIT_ORDER` intents on the same side when an existing order is in `pending_create`.

Observed effect:

- `layers=1`
- buy side blocked by insufficient quote balance
- sell side valid
- strategy keeps creating `sell` orders on later ticks

Root cause:

- strategy-side order occupancy and execution-side order creation are not coordinated by a stable slot identity
- `pending_create` is not consistently treated as a hard occupancy state for quote generation

### 2. Refresh is not a safe replace flow

Current logic can issue `CANCEL_ORDER` and new `CREATE_LIMIT_ORDER` intents in the same decision cycle.

Observed effect:

- replacement behavior depends on exchange timing and worker timing
- old and new orders may overlap transiently
- strategy behavior is less deterministic than Hummingbot default behavior

### 3. Stop still has tail-intent risk

`ClockTickCoordinatorService` stop handling is improved, but it does not fully guarantee that a strategy tick already in progress will stop producing new create intents.

Observed effect:

- after `direct-stop`, old in-flight strategy work can still publish late create intents before full shutdown completes

### 4. `hangingOrdersEnabled` is carrying the wrong responsibility

Current PMM flow partially uses `hangingOrdersEnabled` as a control for whether same-side quote creation should be skipped when orders already exist.

That is not the correct semantic boundary.

Correct meaning:

- hanging orders control whether an order is intentionally preserved across the normal replacement cycle
- they should not control whether the strategy can spam duplicate same-side creates

## Design Principles

### 1. One slot, one active order

Each PMM quote position must have a stable slot identity:

- `layer-1-buy`
- `layer-1-sell`
- `layer-2-buy`
- `layer-2-sell`

At any moment, a slot may be occupied by at most one tracked order in any active state.

### 2. Active occupancy is broader than exchange-open

For strategy decision-making, the following states must all occupy a slot:

- `pending_create`
- `open`
- `partially_filled`
- `pending_cancel`

This is separate from the narrower idea of “live exchange-open orders”.

### 3. Replace in phases, not in one shot

If an existing order must be replaced:

- first tick: cancel the existing order
- later tick: after cancellation is confirmed and the slot is free, create the new order

Do not cancel and create for the same slot in the same decision cycle.

### 4. Stop must close the gate before cleanup

On stop:

- strategy must first become ineligible to emit new intents
- then pending intents are cancelled
- then occupied slots are unwound

## Proposed Architecture

## A. Introduce slot-aware PMM coordination

Add a stable `slotKey` to PMM-generated quotes, intents, and tracked orders.

Examples:

- `layer-1-buy`
- `layer-1-sell`

This field becomes the primary identity for quote reconciliation.

### Why this is needed

Without a stable slot identity, the strategy is forced to infer equivalence from:

- side
- price
- qty

That is insufficient for safe replacement and safe duplicate prevention.

## B. Split tracker queries by purpose

`ExchangeOrderTrackerService` should expose different views for different callers.

### `getLiveOrders(strategyKey)`

Returns only exchange-live tracked orders:

- `open`
- `partially_filled`

Use cases:

- UI summaries
- reconciliation views
- exchange-facing observability

### `getActiveSlotOrders(strategyKey)`

Returns all strategy-occupying tracked orders:

- `pending_create`
- `open`
- `partially_filled`
- `pending_cancel`

Use cases:

- PMM quote generation gating
- slot reconciliation
- duplicate prevention

This avoids overloading the meaning of `getOpenOrders()`.

## C. Move PMM decision-making to slot reconciliation

The PMM strategy tick should be rewritten around three explicit steps.

### Step 1. Build target slot state

For each layer-side slot:

- compute the intended quote price and size
- quantize using exchange rules
- validate min amount / min cost / balances

The result per slot is one of:

- `empty`
- `target_quote(price, qty)`

### Step 2. Load current slot state

For each slot, read the current active tracked order if present.

Possible current states:

- `empty`
- `pending_create`
- `open`
- `partially_filled`
- `pending_cancel`

### Step 3. Produce state transitions

Per slot:

- current `empty`, target `quote`
  - emit `CREATE_LIMIT_ORDER`
- current occupied, target `empty`
  - emit `CANCEL_ORDER` unless already `pending_cancel`
- current occupied, target `quote`
  - if `pending_create`: emit nothing
  - if `pending_cancel`: emit nothing
  - if `open` or `partially_filled` and quote is within tolerance: emit nothing
  - if `open` or `partially_filled` and quote is outside tolerance: emit `CANCEL_ORDER` only

No slot may emit both `CANCEL_ORDER` and `CREATE_LIMIT_ORDER` in the same tick.

## D. Make execution idempotency slot-aware

`StrategyIntentExecutionService` should keep a defensive duplicate guard.

For `CREATE_LIMIT_ORDER`:

- if the same `slotKey` already has an active tracked order in
  - `pending_create`
  - `open`
  - `partially_filled`
  - `pending_cancel`
- then mark the intent done without placing another order

This is a defensive fallback, not the primary source of truth.

## E. Stop path must be session-gated

`StrategyService` stop flow should move to:

1. mark runtime session as stopping or remove it from the active map
2. prevent future `onTick()` work from publishing new intents
3. cancel pending intents for the strategy
4. emit cancels for active slot orders
5. emit `STOP_CONTROLLER`

`ClockTickCoordinatorService` should remain a secondary coordinator-level protection, not the only stop safeguard.

## Behavior Alignment with Hummingbot

This design is intentionally aligned with observed Hummingbot PMM source behavior:

- proposal generation precedes cancellation and creation
- new order creation happens only when non-hanging active orders are fully cleared
- cancel-confirmation waiting is the default path
- hanging orders are treated as a separate preservation mechanism, not duplicate-create permission

Reference points reviewed during investigation:

- `/home/whoami/test/hummingbot/hummingbot/strategy/pure_market_making/pure_market_making.pyx`
- `/home/whoami/test/hummingbot/hummingbot/strategy/order_tracker.pyx`
- `/home/whoami/test/hummingbot/hummingbot/strategy/hanging_orders_tracker.py`

## Scope of Changes

## 1. Strategy quote model

Files likely affected:

- `server/src/modules/market-making/strategy/intent/quote-executor-manager.service.ts`
- `server/src/modules/market-making/strategy/config/strategy-intent.types.ts`

Changes:

- add `slotKey` to PMM quote output
- add `slotKey` to create/cancel intents where applicable

## 2. Tracked order model

Files likely affected:

- `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`
- tracked-order entity and persistence paths if `slotKey` needs persistence

Changes:

- store and query `slotKey`
- expose `getLiveOrders()` and `getActiveSlotOrders()`

## 3. PMM strategy reconciliation

Files likely affected:

- `server/src/modules/market-making/strategy/strategy.service.ts`

Changes:

- replace side-count-based decision logic with slot reconciliation
- stop generating create actions for occupied slots
- replace same-tick cancel+create with phased replacement

## 4. Execution guardrails

Files likely affected:

- `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

Changes:

- add `slotKey`-aware defensive create deduplication

## 5. Stop lifecycle safety

Files likely affected:

- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/tick/clock-tick-coordinator.service.ts`

Changes:

- gate strategy execution before cleanup begins
- preserve coordinator-level abort behavior as backup protection

## Implementation Phases

## Phase 1. Stop duplicate same-side creation

Goal:

- repeated sell accumulation must stop immediately

Changes:

- add `slotKey`
- implement `getActiveSlotOrders()`
- treat `pending_create` as hard occupancy
- prevent create for occupied slots

Acceptance:

- with `layers=1`, zero quote balance, and valid sell inventory
- repeated ticks keep at most one `layer-1-sell` active or pending

## Phase 2. Convert refresh into safe replacement

Goal:

- no same-slot cancel+create in one tick

Changes:

- per-slot replace logic
- cancel on drift
- create only after slot is free on a later tick

Acceptance:

- price drift outside tolerance causes cancel first
- replacement create appears only after tracked cancellation completes

## Phase 3. Harden stop behavior

Goal:

- no late creates after stop begins

Changes:

- session gate in strategy runtime
- block publish path once session is stopping
- keep coordinator stop abort as secondary protection

Acceptance:

- `direct-stop` during an in-progress PMM tick produces no post-stop create intents

## Testing Plan

### Unit tests

- slot occupancy treats `pending_create` as active
- same slot cannot produce repeated create intents
- refresh outside tolerance emits cancel only
- refresh inside tolerance emits no actions
- slot becomes creatable only after cancellation confirmation
- stop gating prevents publish after session enters stopping state

### Integration tests

- one-sided balance scenario:
  - buy blocked
  - sell valid
  - no sell accumulation across repeated ticks
- replacement scenario:
  - open order exists
  - market drifts beyond tolerance
  - old order cancelled before new order created
- stop race scenario:
  - stop arrives mid-tick
  - no new create lands afterward

### Observability expectations

Logs should become slot-aware and unambiguous.

Examples:

- `slot=layer-1-sell state=pending_create action=defer reason=slot_occupied`
- `slot=layer-1-buy action=skip reason=insufficient_quote_balance available=0 USDT required=1.03 USDT`
- `slot=layer-1-sell action=cancel reason=price_outside_tolerance current=61.11 target=61.04`

## Risks

### 1. Data model expansion

If `slotKey` is persisted, tracked-order schema and migration handling may be required.

### 2. Behavior change for existing PMM sessions

Existing sessions may rely on current side-count behavior. Migration and backward compatibility must be handled carefully.

### 3. Hanging-order interaction

Slot reconciliation must not accidentally break existing hanging-order preservation logic.

## Recommendation

Implement Phase 1 first as a focused safety patch, but keep the code structure aligned with the full slot-reconciliation design so that Phase 2 and Phase 3 do not require another rewrite.

This plan should be treated as the next stabilization pass after the minimum-safe-stability work.

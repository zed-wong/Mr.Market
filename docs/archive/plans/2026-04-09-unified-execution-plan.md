# Unified Execution Plan: Account-Aware Runtime + PMM Stability + Dual Account Volume

Date: `2026-04-09` (revised `2026-04-10`)

## Why One Plan

PMM stability and dual-account volume strategy touch the same core files:

- `ExchangeConnectorAdapterService` (account routing)
- `ExchangeOrderTrackerService` (tracked order model)
- `StrategyIntentExecutionService` (intent execution)
- `StrategyOrderIntent` types (intent shape)
- `strategy.service.ts` (strategy lifecycle)

Doing them separately creates merge conflicts and duplicate migration work. This plan unifies them into 4 phases that build on each other.

---

## Phase 0 — Account-Aware Execution Foundation

**Goal**: Make the execution chain account-aware. This fixes latent bugs in PMM on non-default accounts and unblocks dual-account volume.

### 0.1 Thread accountLabel through connector adapter

`ExchangeConnectorAdapterService` currently calls `getExchange(exchangeName)` without label. All exchange-facing methods must accept optional `accountLabel` and pass it through.

Files:
- `server/src/modules/market-making/execution/exchange-connector-adapter.service.ts`

Changes:
- `placeLimitOrder(exchange, pair, side, qty, price, clientOrderId?, options?)` → add `accountLabel?`
- `cancelOrder(exchange, pair, exchangeOrderId)` → add `accountLabel?`
- `fetchOrder(exchange, pair, exchangeOrderId)` → add `accountLabel?`
- `fetchOpenOrders(exchange, pair?)` → add `accountLabel?`
- `fetchBalance(exchange)` → add `accountLabel?`
- `loadTradingRules(exchange, pair)` → add `accountLabel?` (currently calls `getExchange(exchangeName)` without label)
- `quantizeOrder(exchange, pair, qty, price)` → add `accountLabel?` (same issue)
- all above call `this.exchangeInitService.getExchange(exchangeName, accountLabel)` instead of `getExchange(exchangeName)`

### 0.2 Add accountLabel to tracked orders

Files:
- `server/src/common/entities/market-making/tracked-order.entity.ts`
- `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`

Changes:
- add `accountLabel?: string` to `TrackedOrder` runtime type
- add `role?: 'maker' | 'taker'` to `TrackedOrder` runtime type (used by dual-account restart recovery in Phase 2)
- add `accountLabel` column to `TrackedOrderEntity` (nullable for migration)
- add `role` column to `TrackedOrderEntity` (nullable for migration)
- change tracker key from `exchange:exchangeOrderId` to `exchange:accountLabel:exchangeOrderId`
- update `hydratePersistedOrders()` to load `accountLabel` and `role`
- update `onTick()` to pass `order.accountLabel` when calling `fetchOrder()`
- update `upsertOrder()` / `persistOrder()` to write `accountLabel` and `role`

### 0.3 Fix account-blind paths in strategy service

Files:
- `server/src/modules/market-making/strategy/strategy.service.ts`

Changes:
- `getAvailableBalancesForPair()` (L2575) → accept and pass `accountLabel` to `fetchBalance()`
- `cancelTrackedOrdersForStrategy()` (L2179) → use `trackedOrder.accountLabel` when calling `cancelOrder()`
- `waitForTrackedOrdersToSettle()` → use `trackedOrder.accountLabel` when polling `fetchOrder()`
- `restoreRuntimeStateForStrategy()` (L2760) → pass `accountLabel` to `fetchOpenOrders()` and `cancelOrder()` during startup reconciliation
- `quantizeAndValidateQuote()` → pass `accountLabel` to `quantizeOrder()` and `loadTradingRules()`

### 0.4 Add timeInForce and accountLabel to intent model

Files:
- `server/src/modules/market-making/strategy/config/strategy-intent.types.ts`

Changes:
- add `accountLabel?: string` to `StrategyOrderIntent`
- add `timeInForce?: 'GTC' | 'IOC'` to `StrategyOrderIntent`

### 0.5 Wire accountLabel in intent execution

Files:
- `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

Changes:
- pass `intent.accountLabel` to `placeLimitOrder()`
- pass `intent.timeInForce` as part of order options (alongside `postOnly`)
- pass `intent.accountLabel` to tracked order `upsertOrder()`

### 0.6 Persist new intent fields to database

The intent model additions (`accountLabel`, `timeInForce`, `slotKey`) must survive process restarts. The current persistence layer does not write these fields.

Files:
- `server/src/common/entities/market-making/strategy-order-intent.entity.ts`
- `server/src/modules/market-making/strategy/execution/strategy-intent-store.service.ts`
- `server/src/modules/market-making/strategy/execution/strategy-intent-worker.service.ts`

Changes:
- add columns to `StrategyOrderIntentEntity`:
  - `accountLabel` (nullable)
  - `timeInForce` (nullable)
  - `slotKey` (nullable, for Phase 1)
  - `postOnly` (nullable, currently only in runtime type not entity)
- update `StrategyIntentStoreService.upsertIntent()` (L40): write `accountLabel`, `timeInForce`, `slotKey`, `postOnly` from intent to entity
- update `StrategyIntentWorkerService.toIntent()` (L232): read these fields back from entity to runtime type when rehydrating intents after restart

### 0.7 Database migrations

All schema changes must have explicit migration scripts to avoid deploy failures.

Tables affected:
- `tracked_order`: add `accountLabel` (nullable), `slotKey` (nullable), `role` (nullable)
- `strategy_order_intent`: add `accountLabel` (nullable), `timeInForce` (nullable), `slotKey` (nullable), `postOnly` (nullable)

Migration strategy:
- all new columns are nullable — existing rows stay valid
- no data backfill required for either table
- application code treats missing values as `undefined` / default behavior

### 0.8 Implementation boundary for `strategy.service.ts`

`strategy.service.ts` is already large and should remain the runtime coordinator, not absorb more feature-specific logic.

Implementation rule for this plan:
- keep `StrategyService` focused on orchestration: session lifecycle, controller dispatch, executor attachment, high-level stop/start
- move new feature logic into dedicated services where practical:
  - PMM slot reconciliation logic → new PMM-focused service
  - dual-account cycle builder / counter persistence → new dual-account service
  - restart recovery extensions → recovery-focused service or helper
- avoid adding large new private methods to `strategy.service.ts` unless they are thin orchestration wrappers

### Checklist

- [x] connector adapter: all 7 methods accept accountLabel (including loadTradingRules, quantizeOrder)
- [x] TrackedOrder type + entity: accountLabel field
- [x] TrackedOrder type + entity: role field
- [x] tracker key: `exchange:accountLabel:exchangeOrderId`
- [x] `hydratePersistedOrders()` loads accountLabel + role
- [x] tracker `onTick()` passes accountLabel to fetchOrder
- [x] `upsertOrder()` / persistence writes accountLabel + role
- [x] `getAvailableBalancesForPair()` accepts accountLabel
- [x] `cancelTrackedOrdersForStrategy()` uses tracked order accountLabel
- [x] `waitForTrackedOrdersToSettle()` uses tracked order accountLabel
- [x] `restoreRuntimeStateForStrategy()` uses accountLabel for fetchOpenOrders/cancelOrder
- [x] `quantizeAndValidateQuote()` passes accountLabel
- [x] `StrategyOrderIntent` has `accountLabel` and `timeInForce`
- [x] `StrategyOrderIntentEntity` has `accountLabel`, `timeInForce`, `slotKey`, `postOnly` columns
- [x] `upsertIntent()` writes new fields to DB
- [x] `toIntent()` reads new fields from DB
- [x] database migration scripts for `tracked_order` and `strategy_order_intent`
- [x] intent execution passes accountLabel + timeInForce
- [x] regression tests: default-account PMM unchanged

---

## Phase 1 — PMM Slot Reconciliation

**Goal**: Fix PMM duplicate orders, unsafe refresh, and stop race conditions.

### 1.1 Add slotKey to quote and intent model

Files:
- `server/src/modules/market-making/strategy/intent/quote-executor-manager.service.ts`
- `server/src/modules/market-making/strategy/config/strategy-intent.types.ts`

Changes:
- add `slotKey` to `QuoteLevel` output (e.g. `layer-1-buy`)
- add optional `slotKey` to `StrategyOrderIntent`
- refactor `buildQuotes()` into a pure target-state producer: remove `shouldCreate` / `existingOpenOrdersBySide` gating — that moves to slot reconciliation
- add `slotKey` to `TrackedOrder` runtime type and entity (nullable)

### 1.2 Split tracker queries

Files:
- `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`

Changes:
- add `getLiveOrders(strategyKey)` → returns `open` + `partially_filled`
- add `getActiveSlotOrders(strategyKey)` → returns `pending_create` + `open` + `partially_filled` + `pending_cancel`
- migrate callers:

| Caller | Migrate to |
|--------|------------|
| `buildPureMarketMakingActions` (strategy.service.ts:1323) | `getActiveSlotOrders()` |
| `ReconciliationService` (reconciliation.service.ts:70) | `getLiveOrders()` |
| `PauseWithdrawOrchestratorService` (pause-withdraw-orchestrator.service.ts:165) | `getLiveOrders()` |
| `AdminDirectMarketMakingService` (admin-direct-mm.service.ts:354) | `getLiveOrders()` |

- deprecate `getOpenOrders()` as alias for `getLiveOrders()`

### 1.3 Rewrite PMM action generation as slot reconciliation

Files:
- `server/src/modules/market-making/strategy/strategy.service.ts`

Three-step decision cycle per tick:

1. **Build target state**: for each `layer-{n}-{side}` slot, compute target quote or `empty`
2. **Load current state**: read active tracked order per slot via `getActiveSlotOrders()`
3. **Produce transitions**:
   - empty → target quote: emit `CREATE_LIMIT_ORDER`
   - occupied → empty: emit `CANCEL_ORDER` (unless already `pending_cancel`)
   - occupied → target quote:
     - `pending_create` or `pending_cancel`: do nothing
     - `open`/`partially_filled` within tolerance: do nothing
     - `open`/`partially_filled` outside tolerance: emit `CANCEL_ORDER` only
   - **Never** emit cancel + create for the same slot in one tick

Hanging order rule: if slot is occupied by a hanging order and target has a quote → no action (preserve, don't cancel, don't duplicate)

### 1.4 Add stop gate

Files:
- `server/src/modules/market-making/strategy/strategy.service.ts`

Changes:
- add `stoppingStrategyKeys: Set<string>` field
- `stopStrategyForUser()` adds key to set **first**, before any async cleanup
- `publishIntents()` no-ops if strategy is in `stoppingStrategyKeys`
- remove from set after cleanup completes

### 1.5 Add slot-aware execution dedup

Files:
- `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

Changes:
- for `CREATE_LIMIT_ORDER`: if same `slotKey` already has an active tracked order → mark intent done without placing

### 1.6 Migration for existing tracked orders

Existing tracked orders without `slotKey`:
- treat as unassigned slot on startup
- next PMM tick reconciles from scratch — stale orders cancelled, new orders created with slot identity
- no data backfill needed

### Checklist

- [x] `QuoteLevel` has `slotKey`, `shouldCreate`/`existingOpenOrdersBySide` removed
- [x] `StrategyOrderIntent` has optional `slotKey`
- [x] `TrackedOrder` + entity: `slotKey` field (nullable)
- [x] `getLiveOrders()` and `getActiveSlotOrders()` added
- [x] all `getOpenOrders()` callers migrated
- [x] PMM action generation rewritten as 3-step slot reconciliation
- [x] hanging order preservation expressed as reconciliation rule
- [x] `stoppingStrategyKeys` stop gate added
- [x] slot-aware execution dedup added
- [x] unit tests: no slot emits both cancel + create in same tick
- [x] unit tests: `pending_create` blocks duplicate creation
- [x] unit tests: stop gate blocks post-stop publishes
- [x] integration test: one-sided balance, no sell accumulation
- [x] integration test: price drift → cancel first, create on next tick
- [x] integration test: stop mid-tick → no late creates

---

## Phase 2 — Dual Account Volume Strategy

**Goal**: Add `dualAccountVolume` as a new strategy type for paired maker/taker execution on two exchange accounts.

### 2.1 Register new strategy type

Files:
- `server/src/modules/market-making/strategy/config/strategy-controller.types.ts`
- `server/src/modules/market-making/strategy/config/strategy-controller-aliases.ts`
- `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts`
- `server/src/modules/market-making/strategy/controllers/strategy-controller.registry.ts`
- `server/src/modules/market-making/strategy/strategy.module.ts`
- `server/src/modules/market-making/orchestration/pause-withdraw-orchestrator.service.ts`

Changes:
- extend `StrategyType` union with `'dualAccountVolume'`
- add dispatcher `toStrategyType()` and `startByStrategyType()` branches
- update dispatcher error message to include `dualAccountVolume` in allowed types
- register new controller
- update `PauseWithdrawCommand.strategyType` union (L19): currently hardcoded to `'arbitrage' | 'pureMarketMaking' | 'volume'` — add `'dualAccountVolume'`
- audit all other hardcoded strategy type lists (search for `'arbitrage' | 'pureMarketMaking'` pattern)

### 2.2 Add DTO and runtime params

New DTO fields:
- `exchangeName`, `symbol`, `baseTradeAmount`, `baseIntervalTime`, `numTrades`
- `baseIncrementPercentage`, `pricePushRate`, `postOnlySide?`
- `makerAccountLabel`, `takerAccountLabel`, `makerDelayMs`
- `userId`, `clientId`

Runtime params (adds):
- `publishedCycles` — counts attempted cycles (for pricing progression)
- `completedCycles` — counts successful maker+taker cycles (for stopping rule)

Persistence semantics:
- `publishedCycles` is incremented in controller `onActionsPublished()` and persisted back to `strategy_instance.parameters`
- `completedCycles` is incremented only after full maker+taker success in the execution layer and persisted back to `strategy_instance.parameters`
- restart restores both counters from persisted params; neither counter resets silently on process restart

Validation:
- both labels present and different
- both labels ready on same exchange before activation

### 2.3 Add strategy service entry point and routing

Files:
- `server/src/modules/market-making/strategy/strategy.service.ts`

Changes:
- add `executeDualAccountVolumeStrategy()`
- add `dualAccountVolume` branch in `resolvePooledExecutorTarget()`
- add `dualAccountVolume` branch in `resolveAccountLabel()` (return `makerAccountLabel` as primary)
- add dual-label readiness check in `canActivateStrategyImmediately()`: both labels must be ready

### 2.4 Add controller and action builder

Files:
- `server/src/modules/market-making/strategy/controllers/dual-account-volume-strategy.controller.ts`

Controller:
- cadence from `baseIntervalTime`
- calls `buildDualAccountVolumeActions()`
- increments `publishedCycles` in `onActionsPublished()`

Action builder:
- if `completedCycles >= numTrades` → emit stop
- if any non-terminal tracked order exists for this strategy → skip (wait for previous cycle)
- fetch best bid/ask, compute maker price
- emit maker `CREATE_LIMIT_ORDER` with `accountLabel = makerAccountLabel`, `postOnly = true`
- attach cycle metadata: `cycleId`, `makerAccountLabel`, `takerAccountLabel`, `takerPrice`, `makerDelayMs`

### 2.5 Add maker→taker sequencing in execution

Files:
- `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

When executing a `CREATE_LIMIT_ORDER` with `metadata.role = 'maker'`:
1. place maker order via connector adapter with `accountLabel`
2. if maker accepted → wait `makerDelayMs`
3. build and execute taker intent inline:
   - `accountLabel = takerAccountLabel`
   - `timeInForce = 'IOC'`
   - price = maker's accepted price
4. if taker fails → best-effort cancel maker using `makerAccountLabel`
5. if full cycle succeeds → increment `completedCycles` on session params

This keeps sequencing in the execution layer where it has access to exchange responses.

### 2.6 Private stream decision

V1 does **not** rely on private stream fills for dual-account volume. Fill detection uses tracker polling only (`ExchangeOrderTrackerService.onTick()`).

`startPrivateOrderWatcher()` / `stopPrivateOrderWatcher()` remain PMM-only for V1.

### 2.7 Restart and stop semantics

On stop:
- cancel non-terminal tracked orders using each order's `accountLabel`
- wait for settlement via account-aware `fetchOrder()`

On restart:
- restore persisted tracked orders (with `accountLabel`)
- if non-terminal maker exists without completed taker → cancel maker best-effort
- do not replay taker
- reset to clean next cycle

Implementation placement:
- extend runtime recovery explicitly for `dualAccountVolume`; do not leave restart behavior implied
- either:
  - extend `restoreRuntimeStateForStrategy()` to branch for `dualAccountVolume`, or
  - add a dedicated dual-account recovery service/helper and call it from strategy startup
- recovery logic must use persisted tracked-order `role` to identify dangling maker orders safely

### Checklist

- [x] `StrategyType` union includes `'dualAccountVolume'`
- [x] dispatcher maps and starts `dualAccountVolume`
- [x] DTO with dual account labels and `makerDelayMs`
- [x] `publishedCycles` / `completedCycles` counter semantics
- [x] `publishedCycles` persisted to `strategy_instance.parameters`
- [x] `completedCycles` persisted to `strategy_instance.parameters`
- [x] `resolvePooledExecutorTarget()` handles `dualAccountVolume`
- [x] `resolveAccountLabel()` handles `dualAccountVolume`
- [x] `canActivateStrategyImmediately()` checks both labels
- [x] controller + action builder implemented
- [x] maker→taker sequencing in execution service
- [x] taker failure triggers maker cancel on correct label
- [x] tracked orders persist `accountLabel` + `role`
- [x] restart cancels dangling maker, does not replay taker
- [x] restart path for `dualAccountVolume` has explicit implementation location
- [x] unit tests: dispatcher routing
- [x] unit tests: dual-label readiness gating
- [x] unit tests: maker→taker sequencing + failure paths
- [x] unit tests: cycle counter semantics
- [x] regression: existing volume + PMM unchanged

---

## Phase 3 — Admin Direct + Frontend + Observability

**Goal**: Make `dualAccountVolume` usable from the admin UI, and improve PMM observability.

### 3.1 Admin direct support for dual account

The current `DirectStartMarketMakingDto` only has one `apiKeyId` + one `accountLabel`. `AdminDirectMarketMakingService.directStart()` validates exactly one API key and only allows `pureMarketMaking`. These must be extended.

Files:
- `server/src/modules/admin/market-making/admin-direct-mm.dto.ts`
- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`

Changes:
- add optional `makerApiKeyId`, `takerApiKeyId`, `makerAccountLabel`, `takerAccountLabel` to `DirectStartMarketMakingDto`
- for `dualAccountVolume` definitions, validate:
  - both API keys exist and belong to the same exchange
  - both account labels differ
  - both account labels match their respective API keys
- widen the controllerType check (L108-113) from `!== 'pureMarketMaking'` to allow `'dualAccountVolume'`
- inject `makerAccountLabel` + `takerAccountLabel` into resolved config snapshot
- keep `pureMarketMaking` path unchanged (uses single `apiKeyId` + `accountLabel` as before)

Note: `MarketMakingOrder` entity stores one `apiKeyId`. For dual-account, store the maker API key ID and put the taker API key ID in the strategy snapshot. This avoids entity schema changes while keeping the critical reference.

### 3.2 Frontend config template and form support

The admin direct market-making UI needs to support selecting and configuring the new strategy.

Files:
- `interface/src/lib/components/admin/settings/strategies/configTemplates.ts`
- `interface/src/routes/(bottomNav)/(admin)/manage/market-making/direct/+page.svelte`
- related page-specific components

Changes:
- add `dualAccountVolume` config schema template to `CONFIG_SCHEMA_TEMPLATES`:
  ```
  dualAccountVolume: {
    type: "object",
    required: ["baseTradeAmount", "baseIntervalTime", "numTrades", ...],
    properties: {
      baseTradeAmount, baseIntervalTime, numTrades,
      baseIncrementPercentage, pricePushRate, postOnlySide,
      makerDelayMs
    }
  }
  ```
  (makerAccountLabel / takerAccountLabel are injected at runtime by the form, same as accountLabel for PMM)
- in the direct-start form:
  - when `controllerType === 'dualAccountVolume'`, show two API key / account label selectors (maker + taker) instead of one
  - validate labels are different before submit
  - pass `makerApiKeyId`, `takerApiKeyId`, `makerAccountLabel`, `takerAccountLabel` to the direct-start API
- display `dualAccountVolume`-specific fields in order detail views (cycle counters, maker/taker labels)

### 3.3 Slot-aware PMM logging

- include `slotKey` in all PMM decision logs
- distinguish: `slot_occupied`, `waiting_cancel`, `within_tolerance`, `insufficient_balance`

### 3.4 Per-account rate limiting (future, optional)

Current: rate limit keyed by `exchangeName` (shared across accounts).
Future: key by `exchangeName:accountLabel` if latency becomes an issue.

### Checklist

- [x] `DirectStartMarketMakingDto` supports dual API keys and dual labels
- [x] `directStart()` validates dual-account config
- [x] `directStart()` controllerType check allows `dualAccountVolume`
- [x] `CONFIG_SCHEMA_TEMPLATES` has `dualAccountVolume` entry
- [x] direct-start form shows dual API key / account selectors for `dualAccountVolume`
- [x] form validates labels are different
- [x] order detail views show dual-account info
- [x] PMM logs include `slotKey` and decision reasons

---

## Key Design Decisions Summary

| Decision | Choice | Reason |
|----------|--------|--------|
| Strategy type | Independent `dualAccountVolume` | Don't pollute `volume` semantics |
| Account routing | First-class `accountLabel` field, not metadata | Persistence-safe, not lossy |
| Intent persistence | New fields persisted to `strategy_order_intent` table | Survive restarts without losing account/slot info |
| DB migration | All new columns nullable, no backfill | Zero-downtime deploy compatibility |
| Cycle counting | `publishedCycles` + `completedCycles` | Distinguish attempts from successes |
| Maker→taker sequencing | Execution layer handles inline | Has access to exchange responses |
| Restart recovery | Cancel dangling maker, no taker replay | Avoid accidental duplicate self-trades |
| Rate limiting | Shared per-exchange in V1 | Minimize regression risk |
| Admin direct | Phase 3 (dual API key DTO) | Required for the strategy to be usable from admin UI |
| Private stream | Not used for dual-account V1 | Tracker polling sufficient |
| PMM refresh | Two-tick phased replacement | Aligned with Hummingbot behavior |
| Stop gate | `stoppingStrategyKeys` Set | Closes race window cheaply |

---

## Risks

1. **Wrong-account operations** — If `accountLabel` is not persisted on tracked orders, stop/cancel/restart hit the wrong exchange instance
2. **Intent fields lost on restart** — If `accountLabel`/`slotKey`/`timeInForce` are not persisted to `strategy_order_intent` table, rehydrated intents after restart lose account routing and slot identity
3. **DB migration forgotten** — Schema changes to `tracked_order` and `strategy_order_intent` must be deployed before application code; local dev works without migration but production deploy will fail
4. **Dual-account partial cycle** — Maker succeeds but taker fails; explicit cancel-maker recovery required
5. **`getOpenOrders()` semantic change** — Callers must be migrated individually; silent change breaks UI/reconciliation
6. **PMM refresh latency** — Two-tick replacement is slightly slower than current same-tick; intentional trade-off
7. **Restart with unknown slot** — Existing tracked orders without `slotKey` reconcile from scratch; may cause brief cancel-and-rebuild on deploy
8. **Hardcoded strategy type lists** — `PauseWithdrawCommand`, dispatcher error messages, and potentially other places have hardcoded strategy type unions that will silently exclude `dualAccountVolume` if not updated

---

## Delivery Order

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3
(foundation) (PMM fix)  (new strat)  (admin+UI)
  ~S/M        ~M          ~M/L         ~M
```

Phase 0 and Phase 1 can be delivered incrementally. Phase 2 depends on Phase 0. Phase 3 depends on Phase 2. All phases are required for the strategy to be fully operational from the admin UI.

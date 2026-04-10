# PMM Active Order Reconciliation — Todo List

Source: `docs/archive/plans/2026-04-09-pmm-active-order-reconciliation-plan.md`

---

Status as of 2026-04-10:
- Minimum-safe-stability work is complete, but PMM still has order-slot reconciliation gaps.
- This checklist covers the next stabilization pass needed to align runtime behavior with Hummingbot-style active-order coordination.

## Phase 0 — Prerequisites (accountLabel threading)

### 0. Thread accountLabel through execution and tracking

- [ ] Add optional `accountLabel` parameter to `ExchangeConnectorAdapterService.placeLimitOrder()`
- [ ] Add optional `accountLabel` parameter to `ExchangeConnectorAdapterService.cancelOrder()`
- [ ] Add optional `accountLabel` parameter to `ExchangeConnectorAdapterService.fetchOrder()`
- [ ] Add optional `accountLabel` parameter to `ExchangeConnectorAdapterService.fetchOpenOrders()`
- [ ] Add optional `accountLabel` parameter to `ExchangeConnectorAdapterService.fetchBalance()`
- [ ] Pass `accountLabel` to `this.exchangeInitService.getExchange(exchangeName, accountLabel)` in all above methods
- [ ] Add `accountLabel` field to `TrackedOrder` runtime type
- [ ] Add `accountLabel` column to `TrackedOrderEntity` (nullable, for migration)
- [ ] Change tracker key from `exchange:exchangeOrderId` to `exchange:accountLabel:exchangeOrderId`
- [ ] Update `hydratePersistedOrders()` to load `accountLabel`
- [ ] Pass `accountLabel` in `StrategyService.getAvailableBalancesForPair()` — currently calls `fetchBalance(exchangeName)` without label
- [ ] Pass `accountLabel` in `StrategyService.cancelTrackedOrdersForStrategy()` — currently calls `cancelOrder(order.exchange, ...)` without label
- [ ] Pass `accountLabel` in `ExchangeOrderTrackerService.onTick()` — currently calls `fetchOrder(order.exchange, ...)` without label
- [ ] Unit tests: non-default accountLabel routes to correct exchange instance
- [ ] Regression tests: default-account PMM behavior unchanged

---

## Phase 1 — Slot Identity and Active Occupancy

### 1. Add slot-aware quote and intent identity

- [ ] Add `slotKey` to PMM quote output in `QuoteExecutorManagerService`
- [ ] Define slot naming convention: `layer-{n}-{side}`
- [ ] Add `slotKey` to `StrategyOrderIntent` / executor action payloads
- [ ] Thread `slotKey` through PMM create and cancel intent generation
- [ ] Unit tests: slot keys generated deterministically for all layers and sides

### 2. Split tracked-order query semantics

- [ ] Add `getLiveOrders(strategyKey)` to `ExchangeOrderTrackerService` (returns `open` + `partially_filled`)
- [ ] Add `getActiveSlotOrders(strategyKey)` to `ExchangeOrderTrackerService` (returns `pending_create` + `open` + `partially_filled` + `pending_cancel`)
- [ ] Define active slot states as `pending_create`, `open`, `partially_filled`, `pending_cancel`
- [ ] Migrate `buildPureMarketMakingActions` (strategy.service.ts:1323) from `getOpenOrders()` → `getActiveSlotOrders()`
- [ ] Migrate `ReconciliationService.getOpenOrdersForStrategy` (reconciliation.service.ts:70) → `getLiveOrders()`
- [ ] Migrate `PauseWithdrawOrchestratorService` (pause-withdraw-orchestrator.service.ts:165) → `getLiveOrders()`
- [ ] Migrate `AdminDirectMarketMakingService` (admin-direct-mm.service.ts:354) → `getLiveOrders()`
- [ ] Deprecate `getOpenOrders()` as alias for `getLiveOrders()`, remove in follow-up
- [ ] Unit tests: live orders exclude `pending_create`; active slot orders include it
- [ ] Unit tests: all migrated callers use the correct query method

### 3. Persist slot identity on tracked orders

- [ ] Add `slotKey` to tracked-order runtime model (`TrackedOrder` type)
- [ ] Add `slotKey` column to `TrackedOrderEntity` (nullable for backward compatibility)
- [ ] Persist `slotKey` on tracked-order writes
- [ ] Rehydrate `slotKey` on startup in `hydratePersistedOrders()`
- [ ] Handle existing tracked orders without `slotKey`: treat as unassigned slot — next PMM tick reconciles from scratch (Option A from plan)
- [ ] Unit tests: persisted tracked orders reload with slot identity intact
- [ ] Unit tests: tracked orders without `slotKey` do not block or crash reconciliation

---

## Phase 2 — Strategy-Side Slot Reconciliation

### 4. Build target state per slot

- [ ] Refactor `QuoteExecutorManagerService.buildQuotes()` into a pure target-state producer: remove `shouldCreate` / `existingOpenOrdersBySide` gating logic
- [ ] Add `slotKey` to `QuoteLevel` output (e.g. `layer-1-buy`)
- [ ] Move duplicate-prevention and hanging-order logic out of quote generation and into slot reconciliation
- [ ] For each slot, classify target as either `empty` or `target_quote(price, qty)`
- [ ] Keep quantization, min amount, min cost, and balance validation in target construction
- [ ] Unit tests: quote builder produces all slots regardless of existing orders
- [ ] Unit tests: unaffordable or invalid quotes become `empty` targets

### 5. Reconcile target slots against active slots

- [ ] Replace side-count-based PMM action generation with per-slot reconciliation
- [ ] If slot is `empty` and target has quote: emit create
- [ ] If slot is occupied and target is `empty`: emit cancel unless already `pending_cancel`
- [ ] If slot is `pending_create`: emit no create and no cancel
- [ ] If slot is `pending_cancel`: emit no create
- [ ] If slot is `open` / `partially_filled` and quote is within tolerance: emit no action
- [ ] If slot is `open` / `partially_filled` and quote is outside tolerance: emit cancel only
- [ ] Unit tests: no slot emits both create and cancel in the same tick

### 6. Treat `pending_create` as hard occupancy

- [ ] Prevent create intents for any slot already occupied by `pending_create`
- [ ] Prevent repeated same-side accumulation when only one side is fundable
- [ ] Regression tests: `layers=1`, buy blocked, sell valid, repeated ticks keep only one sell slot occupied

### 7. Remove duplicate-prevention responsibility from `hangingOrdersEnabled`

- [ ] Stop using `hangingOrdersEnabled` to decide whether same-side creation should be skipped
- [ ] Remove `shouldCreate` / `existingOpenOrdersBySide` from `QuoteExecutorManagerService.buildQuotes()` input and output
- [ ] Keep `hangingOrdersEnabled` scoped to hanging-order preservation behavior only
- [ ] Express hanging-order preservation as a slot reconciliation rule: if slot is occupied by a hanging order and target has a quote, emit no action (not cancel, not create)
- [ ] Ensure `hangingOrdersCancelPct` cancellation goes through slot reconciliation path
- [ ] Unit tests: duplicate prevention still works when `hangingOrdersEnabled=false`
- [ ] Unit tests: hanging order occupies its slot and blocks both cancel and duplicate create

---

## Phase 3 — Safe Refresh / Replace Behavior

### 8. Convert refresh into phased replacement

- [ ] Remove same-tick cancel+create behavior for the same slot
- [ ] When drift exceeds tolerance, emit cancel only
- [ ] Only create replacement quote after cancellation is confirmed and the slot is free
- [ ] Preserve existing tolerance skip behavior when current and target prices are sufficiently close
- [ ] Unit tests: replace flow takes at least two ticks for the same slot

### 9. Keep stale-cancel behavior slot-safe

- [ ] Ensure stale order cancellation (`maxOrderAge`, `hangingOrdersCancelPct`) also respects slot reconciliation rules
- [ ] Prevent stale-cancel flows from racing with same-tick replacement creation
- [ ] Unit tests: stale order is cancelled first and recreated only after slot release

---

## Phase 4 — Execution and Stop Guardrails

### 10. Add slot-aware execution-layer deduplication

- [ ] In `StrategyIntentExecutionService`, reject duplicate creates when the same `slotKey` already has an active tracked order
- [ ] Consider active tracked states: `pending_create`, `open`, `partially_filled`, `pending_cancel`
- [ ] Keep exact price/qty dedup as a secondary safeguard only if still useful
- [ ] Unit tests: duplicate create for same slot becomes no-op

### 11. Add strategy session stop gate

- [ ] Add `stoppingStrategyKeys: Set<string>` field to `StrategyService`
- [ ] In `stopStrategyForUser()`: add strategyKey to `stoppingStrategyKeys` **before** any async cleanup (DB update, session removal, cancel)
- [ ] In `publishIntents()`: check `stoppingStrategyKeys` and no-op if the strategy is stopping
- [ ] After cleanup completes: remove strategyKey from `stoppingStrategyKeys`
- [ ] Cancel pending intents before emitting stop-controller intent
- [ ] Cancel active slot orders as part of stop cleanup
- [ ] Integration tests: no create intents are published after stop has begun
- [ ] Integration tests: concurrent tick during stop produces no published intents

### 12. Keep coordinator-level abort as secondary protection

- [ ] Preserve `ClockTickCoordinatorService` mid-tick stop abort behavior
- [ ] Add tests that confirm stop waits for current tick unwinding without allowing new component work
- [ ] Confirm strategy-level stop gate, not coordinator stop alone, is the primary fix

---

## Phase 5 — Logs and Observability

### 13. Make PMM decision logs slot-aware

- [ ] Include `slotKey` in PMM create / skip / cancel decision logs
- [ ] Distinguish clearly between:
- [ ] `slot occupied`
- [ ] `waiting for cancel confirmation`
- [ ] `within tolerance`
- [ ] `insufficient balance`
- [ ] `below min amount`
- [ ] `below min cost`
- [ ] Improve replacement logs to show current price vs target price
- [ ] Unit tests or log assertions for key branch outputs where practical

### 14. Clarify UI-facing order state semantics where needed

- [ ] Confirm details/status pages use the intended live-order view vs strategy-occupancy view
- [ ] Avoid regressing UI terminology by silently broadening “open orders” to include `pending_create`
- [ ] Add follow-up note if frontend/API contract changes are required

---

## Validation

### Unit tests

- [ ] accountLabel routes to correct exchange instance in ExchangeConnectorAdapterService
- [ ] TrackedOrder with accountLabel persists and rehydrates correctly
- [ ] Slot key generation (`layer-{n}-{side}`)
- [ ] Active slot occupancy rules
- [ ] Duplicate-create blocking for `pending_create`
- [ ] Tolerance-based no-op behavior
- [ ] Cancel-only replacement path
- [ ] Stop gate (`stoppingStrategyKeys`) blocks post-stop create publication
- [ ] Quote builder produces all slots without shouldCreate gating
- [ ] Hanging order preservation expressed as reconciliation rule
- [ ] `getLiveOrders` vs `getActiveSlotOrders` return correct subsets
- [ ] All `getOpenOrders()` callers migrated to correct new method

### Integration tests

- [ ] One-sided inventory scenario does not accumulate same-side quotes
- [ ] Replace flow waits for cancel completion before recreate
- [ ] Stop during in-progress PMM tick produces no tail create intents
- [ ] Concurrent tick during stop produces no published intents
- [ ] PMM on non-default accountLabel fetches balances and cancels orders on correct exchange instance
- [ ] Deploy with existing tracked orders lacking `slotKey` does not crash; reconciles from scratch

### Runtime verification

- [ ] Reproduce prior `openSells` accumulation case and confirm it no longer occurs
- [ ] Reproduce stop race and confirm no late create appears after stop begins
- [ ] Confirm logs are understandable without code context
- [ ] Verify non-default-account PMM balance and cancel flows work correctly

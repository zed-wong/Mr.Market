# Refactor plan: Hummingbot-style market-making runtime

## Goal

Refactor the market-making runtime so the shared tick loop becomes a lightweight decision/orchestration layer, while order reconciliation, balance refresh, and stream-driven state updates run independently. The runtime must stay consistent with the current pooled-executor architecture, close the biggest Hummingbot foundation gaps in the right order, and keep each phase shippable with tests before the next phase starts.

## Why this refactor now

Current evidence across the active runtime work points to the same bottleneck shape:

- `StrategyService.onTick()` still mixes decision-making with exchange I/O.
- `ExchangeOrderTrackerService.onTick()` and `BalanceStateRefreshService.onTick()` still perform recovery/polling work inside the shared tick path.
- The current pooled executor boundary is still `(exchange, pair)`, which works for multi-tenant pooling but blocks Hummingbot-style multi-connector coordination.
- The active dual-account runtime work already added WS ingestion, balance cache, stream-health classification, and delayed REST fallback logic; this refactor should build on those primitives instead of layering more work into the tick loop.

This plan converts the runtime toward the Hummingbot model without discarding Mr.Market's multi-tenant pooling constraints.

## Existing baseline to preserve

These behaviors are already correct and should remain intact during the refactor:

- `ExecutorRegistry` and `ExchangePairExecutor` remain the pooled execution layer per `(exchange, pair)`.
- `StrategyService` remains the top-level strategy runtime coordinator.
- `UserStreamIngestionService` / `UserStreamTrackerService` remain the normalized private-stream ingestion path.
- `BalanceStateCacheService` remains the read model for balances.
- `ExchangeOrderTrackerService` remains the tracked-order source of truth.
- `StrategyIntentExecutionService` remains the side-effect path for exchange actions.
- Ledger mutation must continue to flow only through the existing balance ledger and fill routing path.

The refactor should reorganize responsibilities, not reset the runtime model.

## Design principles (Hummingbot-aligned, Mr.Market-safe)

1. **Strategy tick = pure decision**  
   `onTick()` reads cached snapshots, decides actions, publishes intents. No direct REST calls inside decision paths.

2. **WS primary, REST fallback**  
   User streams update order/balance state immediately. REST exists only as recovery and silent-stream fallback.

3. **Per-connector grouping**  
   Order tracker, reconciliation runner, user stream tracker, and balance scheduler should be grouped by connector/exchange ownership.

4. **Event-driven propagation**  
   State changes should be broadcast by typed events instead of discovered by unrelated polling loops.

5. **Deterministic strategy reads**  
   Strategies should read stable cached views at tick boundaries even if async state updates arrive between ticks.

6. **Keep pooled execution**  
   Nothing in this plan should break multi-tenant sharing of market data or executor reuse per `(exchange, pair)`.

## Current architectural gaps this plan closes

This refactor intentionally addresses the highest-priority gaps from `docs/architecture/hummingbot-gap-analysis.md`:

- **#1 Multi-Leg Executor** — unblocked later by connector grouping and cross-connector events.
- **#3 Cross-Connector Event Bus** — added as a foundational primitive first.
- **#19 In-Flight Order State Machine communication gap** — order transitions become event-driven and decoupled from shared tick cadence.
- **#20 User Stream Tracker parity** — stream-first updates become the authoritative path.
- **#38 Dual Update Mechanism (WS + REST fallback)** — formalized instead of half-living in tick loops.

## Success criteria

The refactor is successful only if all of the following are true:

- Shared tick duration is comfortably below `tick_size_ms` under normal runtime load.
- `StrategyService.onTick()` performs no direct `fetchOrder()` / `fetchBalance()` network I/O.
- Stream-driven order updates apply without waiting for the next shared tick.
- REST reconciliation continues to recover missed states without blocking unrelated sessions.
- Balance refresh happens independently of strategy cadence.
- The resulting architecture makes it straightforward to attach one strategy to multiple exchange connectors later.

## Phased implementation plan

---

## Phase 1 — Instrumentation + event foundation

### Step 1.1 — Add timing instrumentation before behavior changes

Add timing at the current bottlenecks so the refactor can be measured instead of guessed.

**Required work**

- Add per-component tick timing to `server/src/modules/market-making/tick/clock-tick-coordinator.service.ts`.
- Add per-executor / per-session timing around `StrategyService.onTick()`.
- Add dedicated timing around current `fetchOrder()` and `fetchBalance()` paths used by trackers/strategy runtime.
- Emit structured logs/metrics that let us distinguish:
  - coordinator overhead
  - strategy decision time
  - order reconciliation time
  - balance refresh time
  - user-stream drain time

**Outcome**

A baseline proving where the current 1.3s–1.9s tick cost is spent before any decoupling work lands.

### Step 1.2 — Introduce `MarketMakingEventBus`

Add a lightweight typed event bus under `server/src/modules/market-making/events/` so components can publish state changes without going through the shared tick coordinator.

**Transport**

Use NestJS `EventEmitter2` as the internal transport. Keep the public surface strongly typed.

**Initial events**

```ts
eventBus.emit('order.state-changed', {
  exchange,
  accountLabel,
  orderId,
  exchangeOrderId,
  previousState,
  newState,
  fillDelta,
})

eventBus.emit('order.fill-recovered', {
  exchange,
  accountLabel,
  orderId,
  exchangeOrderId,
  fillDelta,
})

eventBus.emit('balance.updated', {
  exchange,
  accountLabel,
  source,
  balances,
})

eventBus.emit('balance.stale', {
  exchange,
  accountLabel,
  staleAt,
})

eventBus.emit('stream.health-changed', {
  exchange,
  accountLabel,
  previousHealth,
  health,
})
```

**Producer / consumer map**

| Event | Producer | Consumer |
|---|---|---|
| `order.state-changed` | `ExchangeOrderTrackerService`, `UserStreamTrackerService` | strategy runtime, reconciliation metrics, executor hooks |
| `order.fill-recovered` | REST reconciliation | strategy fill-progress path |
| `balance.updated` | `BalanceStateCacheService` | strategy runtime, diagnostics |
| `balance.stale` | `BalanceStateCacheService` | balance refresh scheduler |
| `stream.health-changed` | `UserStreamTrackerService` | reconciliation runner, balance scheduler |

**Why now**

Every later phase depends on decoupled notification. Without this bus, moving work out of the tick loop would just replace one coupling mechanism with another.

### Step 1.3 — Enforce cached-state-only strategy reads

Before any polling is extracted, ensure the strategy can operate purely from cached state.

**Required work**

- Audit `StrategyService` and related controller helpers for any direct `fetchBalance()` or `fetchOrder()` usage.
- Route balance reads through `BalanceStateCacheService` only.
- Ensure `ExchangeOrderTrackerService` exposes synchronous cache reads such as `getLiveOrders()` / `getActiveSlotOrders()` without fallback fetches.
- Introduce explicit staleness semantics where the strategy must choose between:
  - cached state accepted
  - skip current tick because required state is stale

**Gate**

No strategy decision path may perform network I/O after this step.

---

## Phase 2 — Make user streams the primary state driver

This phase must land before pulling reconciliation out of the tick loop so there is no state visibility gap.

### Step 2.1 — Apply order updates immediately from stream handlers

Current behavior still relies too much on `UserStreamTrackerService.onTick()` queue draining. Shift the primary path to immediate event-driven application.

**Required work**

- Keep `queueAccountEvent()` / batching for safety, but make stream-arrival handling schedule state application immediately.
- Apply order-state transitions into `ExchangeOrderTrackerService` as soon as normalized events arrive.
- Preserve dedup rules so duplicate order/trade payloads do not double-advance state.
- Reduce `UserStreamTrackerService.onTick()` to housekeeping and fallback draining only.

**Expected behavior after step**

Order state should settle from WS without waiting for the next shared strategy tick.

### Step 2.2 — Emit events when REST reconciliation recovers order state

REST should still recover missed fills/cancels, but it should no longer rely on the next strategy tick to make the recovered state visible.

**Required work**

- Keep the current adaptive reconciliation logic temporarily where it lives.
- Whenever REST reconciliation changes tracked order state, emit:
  - `order.state-changed`
  - `order.fill-recovered` when fill delta is discovered
- Add enough metadata for downstream consumers to distinguish WS-originated transitions from REST-recovered transitions.

### Step 2.3 — Make balance cache updates event-driven and stream-first

The active runtime already introduced stream-fed balance cache updates. Formalize that as the authoritative path.

**Required work**

- Treat `BalanceStateCacheService.applyBalanceUpdate()` as the canonical update path for live balances.
- Emit `balance.updated` whenever a stream or REST refresh changes cached balances.
- Emit `balance.stale` when cache freshness crosses the allowed threshold.
- Remove any remaining strategy-time direct balance fetches.

**Expected behavior after phase**

Order and balance state become event-propagated cached state, with shared tick reading snapshots instead of discovering updates itself.

---

## Phase 3 — Extract reconciliation and refresh work out of the shared tick

### Step 3.1 — Create `ExchangeOrderReconciliationRunner`

Extract REST polling logic from `ExchangeOrderTrackerService.onTick()` into an independent runner.

**New component**

- `server/src/modules/market-making/reconciliation/exchange-order-reconciliation-runner.ts`

**Responsibilities**

- Own reconciliation timers separate from shared strategy tick cadence.
- Poll tracked orders with adaptive intervals based on stream health.
- Respect exchange-aware rate-limiting constraints.
- Emit order-state / recovered-fill events through the event bus.

**Behavioral rules**

- Replace `MAX_ORDERS_PER_TICK = 2` style coupling with time-window or budget-based polling.
- Keep the current healthy/degraded interval policy (`~120s` vs `~5s`) unless measurements require different numbers.
- Ensure one slow account or one slow exchange does not stretch the shared strategy tick.

**After extraction**

`ExchangeOrderTrackerService.onTick()` should become cache housekeeping, pruning, and metrics only.

### Step 3.2 — Create `BalanceRefreshScheduler`

Extract REST balance refresh out of `BalanceStateRefreshService.onTick()`.

**New component**

- `server/src/modules/market-making/balance-state/balance-refresh-scheduler.ts`

**Responsibilities**

- Run per-account refresh timers.
- Refresh balances when:
  - cache becomes stale
  - stream health degrades
  - periodic fallback timer fires
- Apply refreshed balances through `BalanceStateCacheService`
- Emit `balance.updated` after refresh completion

**Operational requirements**

- Add jitter so multiple accounts do not synchronize refresh bursts.
- Keep per-account / per-exchange rate limiting explicit.
- Avoid any dependency on shared tick cadence.

**After extraction**

`BalanceStateRefreshService.onTick()` should become metric-only or disappear entirely if no longer needed.

### Step 3.3 — Make `StrategyService.onTick()` a pure decision loop

Once reconciliation and refresh are independent, clean the remaining network side effects out of the strategy runtime.

**Required work**

- Remove any remaining direct exchange fetches from strategy/controller paths.
- Let strategy runtime subscribe to event-bus signals only to know that cached state changed; actual decisions still happen on tick boundaries.
- Keep `StrategyIntentExecutionService` / dispatcher as the sole exchange side-effect channel for strategy actions.

**Acceptance rule**

A test spy should be able to prove that strategy tick execution performs zero direct network calls.

---

## Phase 4 — Group runtime components by connector

This phase is the architectural bridge toward multi-leg strategies without rewriting pooled execution first.

### Step 4.1 — Define `ExchangeConnector` grouping abstraction

Introduce a connector-scoped grouping for the runtime services that belong to the same exchange.

```ts
interface ExchangeConnectorRuntime {
  exchange: string
  orderTracker: ExchangeOrderTrackerService
  reconciliationRunner: ExchangeOrderReconciliationRunner
  userStreamTracker: UserStreamTrackerService
  balanceCache: BalanceStateCacheService
  balanceRefreshScheduler: BalanceRefreshScheduler
  orderBookTracker: OrderBookTrackerService
}
```

**New files**

- `server/src/modules/market-making/connector/exchange-connector.ts`
- `server/src/modules/market-making/connector/exchange-connector-registry.ts`

**Important constraint**

This is a grouping refactor only. Do not change strategy behavior in this step.

**Why it matters**

A future multi-leg strategy should be able to hold references to multiple exchange connector runtimes the same way Hummingbot strategies hold multiple `MarketTradingPairTuple` references.

### Step 4.2 — Namespace events by connector ownership

Once connector grouping exists, scope events by connector/exchange ownership.

**Example namespacing**

```ts
'binance.order.state-changed'
'binance.balance.updated'
'okx.order.state-changed'
```

or equivalent structured metadata if the typed event bus keeps flat event names.

**Purpose**

This is the bridge toward cross-connector strategy subscriptions, which are required for XEMM / spot-perp style hedging.

---

## Phase 5 — Validation, rollout, and guardrails

### Step 5.1 — Unit tests per phase

| Step | Required test coverage |
|---|---|
| 1.2 Event bus | typed emit/subscribe, wildcard or namespace subscription behavior, delivery ordering |
| 1.3 Cached reads | strategy path rejects or skips stale uncached reads, no direct fetch usage |
| 2.1 Stream-first orders | stream order updates apply without waiting for tick, dedup still holds |
| 2.2 REST recovery events | reconciliation emits state/fill events and downstream consumers observe them |
| 2.3 Balance events | stream + REST cache updates emit `balance.updated`, stale transitions emit `balance.stale` |
| 3.1 Reconciliation runner | polls off-tick, respects adaptive intervals and rate budget |
| 3.2 Balance scheduler | refreshes on stale event / degraded stream / periodic fallback |
| 3.3 Pure strategy tick | zero direct network calls during tick |
| 4.1 Connector grouping | registry lookup, lifecycle ownership, component wiring |

### Step 5.2 — Integration coverage

Add or extend targeted integration/system coverage for:

- dual-account best-capacity progression under delayed REST reconciliation
- stream degradation -> REST fallback -> stream recovery
- high fill rate with event-driven propagation and kill-switch behavior intact
- shared tick under load staying below the configured tick size budget

### Step 5.3 — Rollout measurement

For each phase:

- capture before/after timing data from the added instrumentation
- run targeted server tests for the touched modules
- verify no new tick-overlap warnings appear
- verify no regression in dual-account execution progress, fill accounting, or restart recovery

## Key files and ownership map

| File | Role in refactor |
|---|---|
| `server/src/modules/market-making/tick/clock-tick-coordinator.service.ts` | add baseline timing and confirm tick becomes orchestration-only |
| `server/src/modules/market-making/strategy/strategy.service.ts` | remove direct network I/O from decision path |
| `server/src/modules/market-making/trackers/user-stream-tracker.service.ts` | make stream updates immediate and primary |
| `server/src/modules/market-making/trackers/user-stream-ingestion.service.ts` | keep normalized ingestion as source of private events |
| `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts` | remain tracked-order cache, lose heavy polling duties |
| `server/src/modules/market-making/balance-state/balance-state-cache.service.ts` | remain balance read model and emit freshness events |
| `server/src/modules/market-making/balance-state/balance-state-refresh.service.ts` | polling logic extracted to scheduler |
| `server/src/modules/market-making/events/*` | new typed event-bus surface |
| `server/src/modules/market-making/reconciliation/*` | new off-tick REST reconciliation runner |
| `server/src/modules/market-making/connector/*` | new connector grouping abstraction |

## Recommended implementation order summary

```text
Phase 1: Foundation
  1.1 Add timing instrumentation
  1.2 Introduce MarketMakingEventBus
  1.3 Enforce cached-state-only strategy reads

Phase 2: Stream-first state propagation
  2.1 Immediate stream-driven order updates
  2.2 Emit events from REST recovery
  2.3 Balance cache emits update/stale events

Phase 3: Decouple from shared tick
  3.1 Extract ExchangeOrderReconciliationRunner
  3.2 Extract BalanceRefreshScheduler
  3.3 Reduce strategy tick to pure decision

Phase 4: Connector grouping
  4.1 Add ExchangeConnector runtime grouping
  4.2 Namespace event subscriptions by connector

Phase 5: Validation
  5.1 Unit coverage per phase
  5.2 Integration/system validation
  5.3 Performance regression checks
```

## Expected outcome

| Metric | Before | After target |
|---|---|---|
| Shared strategy tick duration | ~1.3s–1.9s under load | comfortably below `tick_size_ms`; target <200ms decision time |
| Tick overlap warnings | recurring under load | eliminated in normal operation |
| Order state propagation latency | can wait for next tick | near-immediate on WS event |
| Balance freshness maintenance | tied to shared tick work | independent per-account refresh |
| Cross-connector strategy foundation | blocked | unblocked by connector grouping + event bus |

## Long-term implication

If implemented in this order, Mr.Market keeps its pooled multi-tenant executor model while gaining the missing Hummingbot-style runtime primitives:

- event-driven cross-component state propagation
- stream-primary plus REST-fallback order/balance maintenance
- off-tick reconciliation and refresh loops
- connector-scoped runtime ownership
- a clean architectural runway toward XEMM, spot-perp arbitrage, and future multi-leg execution

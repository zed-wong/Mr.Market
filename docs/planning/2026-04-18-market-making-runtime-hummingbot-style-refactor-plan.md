# Refactor plan: Hummingbot-style market-making runtime

## Goal

Refactor the market-making runtime so the shared tick loop becomes a lightweight decision/orchestration layer, while order reconciliation, balance refresh, and stream-driven state updates run independently. This plan is sequenced to build foundation primitives first, then layer increasingly independent components on top — each step is shippable and tested before the next begins.

## Design principles (aligned with Hummingbot)

1. **Strategy tick = pure decision**: No network I/O in strategy `onTick()`. Read cached state, decide actions, publish intents.
2. **WS primary, REST fallback**: Stream events update state immediately; REST polls only when streams degrade.
3. **Per-connector component grouping**: Order tracker, balance fetcher, and stream tracker belong to the same exchange connector — grouped, not scattered services.
4. **Event-driven state propagation**: State changes propagate via typed events, not polling in the tick loop.
5. **Deterministic strategy view**: Strategies read snapshots; async state mutations are atomic from the strategy's perspective.

## Phase 1: Instrumentation + Event Bus Foundation

### Step 1.1 — Add per-component tick timing

- Add per-component tick timing logs/metrics in `ClockTickCoordinatorService`.
- Add per-executor timing in `strategy.service.ts`.
- Add timing around `fetchOrder()` and `fetchBalance()` paths.
- Outcome: confirm where the current 1.3s–1.9s tick time is spent before refactoring.

### Step 1.2 — Introduce `MarketMakingEventBus`

Create a lightweight typed event bus (`server/src/modules/market-making/events/`) to enable decoupled communication between components. This is prerequisite for all subsequent steps — without it, components can't notify each other without going through the tick loop.

```
eventBus.emit('order.state-changed', { exchangeOrderId, newState, fill })
eventBus.emit('balance.updated', { exchange, accountLabel, balances })
eventBus.emit('stream.health-changed', { exchange, accountLabel, health })
```

Events to define:

| Event | Producer | Consumer |
|---|---|---|
| `order.state-changed` | ExchangeOrderTracker, UserStreamTracker | Strategy (via cached snapshot) |
| `balance.stale` | BalanceStateCache expiry timer | BalanceRefreshScheduler |
| `stream.health-changed` | UserStreamTracker | ExchangeOrderTracker (adaptive polling) |
| `order.fill-recovered` | ExchangeOrderTracker (REST) | Strategy executor |

NestJS `EventEmitter2` (already in the NestJS ecosystem) as transport — wildcards for namespace subscriptions, typed payloads.

**Why this first**: Every subsequent step that decouples a component from the tick loop needs a way to notify listeners. Without the event bus, we'd end up with direct service-to-service calls that recreate the same coupling in a different form.

### Step 1.3 — Make strategy consume cached state snapshots

Before removing network I/O from the tick, the strategy must have a read model that doesn't require on-demand network calls.

- `ExchangeOrderTracker` already maintains in-memory tracked orders — ensure it exposes a synchronous `getLiveOrders()` / `getActiveSlotOrders()` that works from cache only (no fallback fetch).
- `BalanceStateCacheService` already caches balances — ensure strategy reads from cache, not from `fetchBalance()` on-demand.
- If any strategy path still calls `fetchBalance()` or `fetchOrder()` directly, route them through the cache with an explicit staleness boundary.

---

## Phase 2: Make user-stream the primary order-state driver

**Order matters**: establish WS as the primary path *before* splitting REST reconciliation out of the tick, so there's no state vacuum when we decouple.

### Step 2.1 — Immediate stream-driven order updates

Currently `UserStreamTrackerService.onTick()` flushes queued events. Change to event-driven:

- `queueAccountEvent()` already calls `setImmediate` to schedule drain — make this the primary update path.
- When a stream event arrives, immediately apply order state change to `ExchangeOrderTracker` (dedup still applies).
- Remove the requirement that order state only updates during `onTick()`. Stream events should update `ExchangeOrderTracker.upsertOrder()` synchronously in the stream handler, not deferred to the next tick.
- `UserStreamTracker.onTick()` becomes a housekeeping-only fallback that drains anything left in the queue (e.g., if a `setImmediate` callback was lost).

### Step 2.2 — Restrict REST polling to fallback/recovery only

- In `ExchangeOrderTrackerService.onTick()`, the adaptive polling (5s when stream degraded, 120s when healthy) is correct in intent but runs in the tick loop. Leave the logic intact for now — just add a `staleOrderIds` event so that when REST recovers an order state, it emits `order.state-changed` on the bus, pushing to strategy immediately rather than waiting for next tick.

### Step 2.3 — Balance stream-first updates

- `UserStreamTracker` already forwards balance events to `BalanceStateCacheService.applyBalanceUpdate()` — make this the authoritative path.
- When `BalanceStateCache` receives a stream-driven update, emit `balance.updated` on the event bus.
- Strategy reads from `BalanceStateCache` only — never calls `fetchBalance()` directly.

---

## Phase 3: Extract components out of the tick loop

### Step 3.1 — Split order reconciliation into `ExchangeOrderReconciliationRunner`

Extract from `ExchangeOrderTrackerService.onTick()` the REST polling logic into an independent runner:

- New class: `ExchangeOrderReconciliationRunner` (owned by `ExchangeOrderTrackerService`, but invoked on its own timer, not via `TickComponent.onTick()`).
- Replaces `MAX_ORDERS_PER_TICK = 2` with time-window-based rate limiting: poll up to N orders per `reconciliationIntervalMs` window, with per-exchange rate-limit awareness.
- Uses `shortPollIntervalMs` (5s, stream degraded) and `longPollIntervalMs` (120s, stream healthy) — same adaptive logic as current, but decoupled from tick cadence.
- On state change, emits `order.state-changed` on event bus instead of relying on next strategy tick to pick it up.
- `ExchangeOrderTrackerService.onTick()` becomes lightweight housekeeping: collect metrics, emit periodic health, prune stale entries.

### Step 3.2 — Move balance refresh to independent scheduler

Extract from `BalanceStateRefreshService.onTick()`:

- New class: `BalanceRefreshScheduler` runs per-account refresh timers.
- Each account gets its own refresh timer with jitter and rate limiting.
- Refresh is triggered by: (a) `balance.stale` event from `BalanceStateCache`, (b) `stream.health-changed` event when stream degrades, (c) periodic timer fallback (current `STALE_MS = 15s` as baseline).
- On refresh completion, updates `BalanceStateCache` and emits `balance.updated`.
- `BalanceStateRefreshService.onTick()` becomes no-op or metric-only.

### Step 3.3 — Slim strategy tick into pure decision loop

After steps 3.1 and 3.2, `strategy-service.onTick()` is already mostly free of network I/O. Final cleanup:

- Remove any remaining direct `fetchOrder()` / `fetchBalance()` calls from strategy paths.
- Strategy subscribes to `order.state-changed` and `balance.updated` events to know when its cached state may have changed — but still makes decisions only on `onTick()` boundaries (event-driven notification + tick-driven decision = no races).
- Ensure `ExecutorOrchestratorService.dispatchActions()` is the only side-effect channel (intent publishing).

---

## Phase 4: Connector abstraction (long-term foundation)

This phase prepares the architecture for Multi-Leg Executor (gap #1 in hummingbot-gap-analysis) by grouping per-exchange components under a unified connector interface.

### Step 4.1 — Define `ExchangeConnector` interface

```
ExchangeConnector {
  exchange: string
  orderTracker: ExchangeOrderTrackerService
  reconciliationRunner: ExchangeOrderReconciliationRunner
  userStreamTracker: UserStreamTrackerService
  balanceCache: BalanceStateCacheService
  balanceScheduler: BalanceRefreshScheduler
  orderBookTracker: OrderBookTrackerService
}
```

- Each `ExchangeConnector` owns all the per-exchange lifecycle components.
- `ExchangeConnectorRegistry` holds connector instances keyed by `exchange`.
- This is a *grouping refactoring* — no behavioral change. Existing services are moved under the connector umbrella.
- New strategies that need two exchanges (XEMM, Spot-Perp Arb) can hold references to multiple `ExchangeConnector` instances — unblocking the Multi-Leg Executor pattern from Hummingbot where strategy holds `N × MarketTradingPairTuple`.

### Step 4.2 — Make event bus connector-scoped

- Events become namespaced by connector: `binance:order.state-changed`, `okx:balance.updated`.
- Strategies subscribe to specific connector events based on which exchanges they operate on.
- This enables a strategy to listen to fills on Binance and immediately hedge on OKX — the core XEMM pattern.

---

## Phase 5: Validation and rollout

### Step 5.1 — Unit tests (per step)

Each step above should include tests:

| Step | Tests |
|---|---|
| 1.2 Event bus | Event emit/subscribe, wildcard matching, async delivery ordering |
| 2.1 Stream-first updates | Order state applies from stream without tick, dedup still works |
| 2.2 REST fallback | REST reconciliation emits event bus events, strategy gets notified |
| 3.1 Reconciliation runner | Polls outside tick, respects rate limits, adaptive intervals |
| 3.2 Balance scheduler | Refreshes on stale event + periodic timer, not in tick |
| 3.3 Pure decision | Strategy tick has zero network calls (enforced by test spy) |
| 4.1 Connector grouping | Connector owns all per-exchange components, registry lookup works |

### Step 5.2 — Integration tests

- Dual-account best-capacity progression under delayed REST responses.
- Stream degradation → REST fallback → stream recovery → back to stream-primary.
- Tick overlap: confirm strategy tick completes in <200ms after refactoring.
- Kill switch still triggers under high fill rate when using event bus.

### Step 5.3 — Performance regression baseline

- Run targeted server tests before and after each phase.
- Target: shared tick duration comfortably below `tick_size_ms` (no overlap warnings).

---

## Key files

| File | Role |
|---|---|
| `tick/clock-tick-coordinator.service.ts` | Tick loop coordinator — will become thinner |
| `tick/tick-component.interface.ts` | Tick component interface — may need async `init()` / `destroy()` |
| `trackers/exchange-order-tracker.service.ts` | Order state source of truth — onTick logic extracted to runner |
| `trackers/user-stream-tracker.service.ts` | Stream event processor — becomes primary order update path |
| `trackers/user-stream-ingestion.service.ts` | WebSocket ingestion — triggers immediate state updates |
| `balance-state/balance-state-refresh.service.ts` | REST balance polling — extracted to scheduler |
| `balance-state/balance-state-cache.service.ts` | Balance read model — emits staleness events |
| `strategy/strategy.service.ts` | Strategy decision loop — becomes pure consumer |
| `events/market-making.event.ts` | Current event types — will expand significantly |
| New: `events/market-making-event-bus.ts` | Typed event bus implementation |
| New: `reconciliation/exchange-order-reconciliation-runner.ts` | Decoupled REST reconciliation |
| New: `balance-state/balance-refresh-scheduler.ts` | Decoupled balance refresh |
| New: `connector/exchange-connector.ts` | Per-exchange component grouping |
| New: `connector/exchange-connector-registry.ts` | Connector lookup |

---

## Implementation order (summary)

```
Phase 1: Foundation
  1.1  Add tick timing instrumentation
  1.2  Introduce MarketMakingEventBus
  1.3  Make strategy consume cached state only

Phase 2: Stream-first (before decoupling tick)
  2.1  Immediate stream-driven order updates
  2.2  REST polling emits events instead of inline state
  2.3  Balance stream-first + cache staleness events

Phase 3: Decouple from tick loop
  3.1  ExchangeOrderReconciliationRunner (extract from tracker onTick)
  3.2  BalanceRefreshScheduler (extract from balance onTick)
  3.3  Slim strategy tick to pure decision

Phase 4: Connector abstraction (long-term)
  4.1  ExchangeConnector interface + grouping
  4.2  Connector-scoped event bus namespaces

Phase 5: Validation
  5.1  Unit tests per step
  5.2  Integration tests
  5.3  Performance regression
```

## Expected outcome

| Metric | Before | After |
|---|---|---|
| Strategy tick duration | 1.3s–1.9s (network-bound) | <200ms (pure decision) |
| Tick overlap warnings | Frequent under load | None |
| Order state settle latency | Up to tick_size_ms (1s) | Near-instant on stream event |
| Dual-account stall | Tracked order blocks cycle | Independent reconciliation |
| Multi-venue strategy support | Blocked (single executor per exchange:pair) | Unblocked (connector abstraction) |

## Long-term implications

This refactoring positions the runtime for the gap-analysis priorities:

- **Connector abstraction (Phase 4)** directly unblocks Multi-Leg Executor (gap #1), XEMM (gap #5), Spot-Perp Arb (gap #7).
- **Event bus** provides the Cross-Connector Event Bus (gap #3) that Hummingbot implements via `c_add_markets()`.
- **Stream-first + REST fallback** implements the Dual Update Mechanism (gap #38) properly.
- **Decoupled reconciliation** solves the In-Flight Order State Machine (gap #19) communication gap — state changes propagate immediately.
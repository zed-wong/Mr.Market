# Hummingbot-Like User Stream Plan

**Status**: 🟡 Planning
**Date**: 2026-04-14

## Goal

Bring Mr.Market's private exchange runtime closer to Hummingbot's user stream model:

- one authenticated per-connector user stream surface
- one normalized internal event queue
- first-class handling for balance, order, and trade events
- REST reconciliation as a backup path, not the primary source of truth

## Why This Plan Exists

Today we have only a partial version of that model:

- `PrivateStreamIngestionService` listens through `watchOrders()` only
- `PrivateStreamTrackerService` queues private order payloads and routes fill-like events
- `ExchangeOrderTrackerService` reconciles with `fetchOrder()` when private stream activity is missing or stale
- balances are still fetched on demand through `fetchBalance()`

That is enough for partial fill-routing parity, but it is not a full Hummingbot-like user stream system.

## Current State Vs Target

| Area | Current | Target |
|---|---|---|
| Authenticated WS abstraction | Narrow `watchOrders()` loop | Per-exchange user stream datasource abstraction |
| Internal event model | Order payload queue only | Unified normalized `balance/order/trade` event queue |
| Balance updates | `fetchBalance()` on demand | WS-applied cached balance state with REST refresh fallback |
| Trade updates | Inferred mostly from order updates | First-class trade/fill events |
| Order updates | `watchOrders()` only | Standardized order update events from user stream |
| Fallback path | `fetchOrder()` reconciliation for tracked orders | Explicit WS + REST dual-update model |
| Connector contract | CCXT methods called ad hoc | User stream capability contract per connector |
| Runtime consumers | Fill router only | Fill router + balance cache + health/recovery consumers |

## Non-Goals

- Do not replace the existing pooled executor architecture.
- Do not build Hummingbot's exact connector stack or Python abstractions.
- Do not add balance-ledger writes directly from raw balance snapshots.
- Do not attempt multi-leg strategy work in this plan.

## Design Principles

- Keep the current executor and tracked-order model.
- Introduce a normalized event layer before adding more connector-specific behavior.
- Preserve account isolation by making every event key include `exchange + accountLabel`.
- Treat REST reconciliation as a correctness backstop.
- Prefer additive migration with phase gates over a rewrite.

## Proposed Architecture

```
[Exchange WS private endpoint]
  -> ConnectorUserStreamDataSource.listen()
  -> UserStreamIngestionService
  -> NormalizedUserStreamEvent queue
  -> UserStreamTrackerService.onTick()/drain()
       -> BalanceStateCache.applyBalanceUpdate()
       -> ExchangeOrderTrackerService.applyOrderUpdate()
       -> FillRoutingService / executor.onFill()

Backup / recovery:
  -> ExchangeOrderTrackerService.fetchOrder() reconciliation
  -> BalanceStateRefreshService.fetchBalance() reconciliation
```

## Event Model

Introduce a normalized event contract instead of passing raw `watchOrders()` payloads through the runtime.

```ts
type UserStreamEvent =
  | {
      kind: 'balance';
      exchange: string;
      accountLabel: string;
      receivedAt: string;
      payload: {
        asset: string;
        free?: string;
        used?: string;
        total?: string;
        source: 'ws' | 'rest';
      };
    }
  | {
      kind: 'order';
      exchange: string;
      accountLabel: string;
      receivedAt: string;
      payload: {
        pair?: string;
        exchangeOrderId?: string;
        clientOrderId?: string;
        side?: 'buy' | 'sell';
        status?: string;
        cumulativeQty?: string;
        price?: string;
        raw: Record<string, unknown>;
      };
    }
  | {
      kind: 'trade';
      exchange: string;
      accountLabel: string;
      receivedAt: string;
      payload: {
        pair?: string;
        exchangeOrderId?: string;
        clientOrderId?: string;
        fillId?: string;
        side?: 'buy' | 'sell';
        qty?: string;
        cumulativeQty?: string;
        price?: string;
        raw: Record<string, unknown>;
      };
    };
```

## Implementation Phases

### Phase 0: Freeze The Contract

Objective: define the runtime contract before changing ingestion paths.

Deliverables:
- Add a short architecture note under `docs/architecture/server/` describing the normalized user stream model
- Define the `UserStreamEvent` internal type
- Define datasource and normalizer interfaces:
  - `ConnectorUserStreamDataSource`
  - `UserStreamEventNormalizer`
  - optional `BalanceStateCache`
- Document capability matrix per exchange:
  - `watchOrders`
  - `watchMyTrades`
  - `watchBalance`
  - required fallback behavior when a capability is missing

Exit criteria:
- one approved internal event contract
- one approved capability/fallback matrix

### Phase 1: Rename And Generalize The Current Private Stream Layer

Objective: stop modeling the system as "watchOrders only".

Deliverables:
- rename `PrivateStreamIngestionService` to a broader `UserStreamIngestionService`
- rename `PrivateStreamTrackerService` to `UserStreamTrackerService`
- preserve current behavior by adapting existing `watchOrders()` events into normalized `order` events
- keep the old fill-routing behavior working unchanged behind the new interface

Exit criteria:
- all current `watchOrders()` system tests still pass
- runtime behavior unchanged for pure market making

### Phase 2: Add First-Class Order And Trade Event Support

Objective: separate order updates from trade updates instead of inferring everything from order payloads.

Deliverables:
- add optional `watchMyTrades()` ingestion where CCXT/exchange supports it
- normalize `watchOrders()` into `order` events
- normalize `watchMyTrades()` into `trade` events
- deduplicate order/trade overlap using:
  - `exchangeOrderId`
  - `clientOrderId`
  - `fillId`
  - cumulative quantity monotonicity
- update `ExchangeOrderTrackerService` so WS order updates can advance tracked order state directly
- update fill routing so trade events are the preferred fill source when available

Exit criteria:
- runtime accepts either order-only exchanges or order+trade exchanges
- duplicate fills are suppressed across WS order/trade paths and REST recovery

### Phase 3: Add Cached Balance State With WS Updates

Objective: stop using ad hoc balance reads as the only runtime balance source.

Deliverables:
- add `BalanceStateCache` keyed by `exchange + accountLabel + asset`
- add optional `watchBalance()` ingestion where supported
- apply WS balance deltas/snapshots into the cache
- expose balance state read API for strategy runtime and admin status surfaces
- keep `fetchBalance()` as the refresh/backfill path
- track balance freshness timestamps and stale-state markers

Important boundary:
- balance cache is operational state only
- the ledger remains the accounting/audit path

Exit criteria:
- admin direct status can read inventory from cached state when fresh
- strategy sizing can prefer cached balances and fall back safely when stale

### Phase 4: Add Explicit REST Recovery Loops

Objective: match Hummingbot's dual-update model instead of relying on one implicit reconciliation path.

Deliverables:
- keep `fetchOrder()` reconciliation in `ExchangeOrderTrackerService`
- add `BalanceStateRefreshService` to periodically refresh balances when:
  - no private balance events have been received
  - connector does not support `watchBalance()`
  - cache is stale beyond threshold
- add stream health model:
  - `healthy`
  - `degraded`
  - `silent`
  - `reconnecting`
- make poll cadence depend on stream health
- emit explicit metrics:
  - last user-stream event time
  - last balance refresh time
  - last order reconciliation time
  - duplicate-fill suppression count

Exit criteria:
- order recovery and balance refresh both work without private WS support
- stream degradation is visible in health and runtime logs

### Phase 5: Connector Capability Adapters

Objective: hide exchange-specific CCXT differences behind a stable internal surface.

Deliverables:
- add per-exchange normalizer/adaptor modules under the exchange integration layer
- support connector strategies:
  - full user stream: `watchOrders + watchMyTrades + watchBalance`
  - partial user stream: `watchOrders` only
  - no private WS: REST-only degraded mode
- standardize accountLabel-aware access for all user stream methods
- close the current `watchBalance(exchangeName)` gap by threading `accountLabel`

Exit criteria:
- every supported exchange is classified into one capability tier
- no runtime code needs exchange-specific payload parsing directly

### Phase 6: Persistence, Recovery, And Operations

Objective: make the user stream subsystem restart-safe and operationally visible.

Deliverables:
- persist last known user-stream health and timestamps if useful for restart diagnostics
- persist tracked-order state as already implemented and ensure user stream replay/recovery does not duplicate fills
- add admin/runtime diagnostics:
  - current stream capability tier
  - watcher active state
  - queue depth
  - latest order/trade/balance event timestamps
  - stale balance indicator
- add runbook docs for private stream failure modes

Exit criteria:
- operators can tell whether runtime is on WS-primary or REST-degraded mode
- restart recovery does not depend on private WS replay

## Required Code Changes

Likely touch points:

- `server/src/modules/market-making/trackers/private-stream-ingestion.service.ts`
- `server/src/modules/market-making/trackers/private-stream-tracker.service.ts`
- `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`
- `server/src/modules/market-making/execution/exchange-connector-adapter.service.ts`
- `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts`
- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/trackers/trackers.module.ts`

Likely new modules:

- `server/src/modules/market-making/user-stream/`
- `server/src/modules/market-making/balance-state/`
- `server/src/modules/market-making/user-stream/normalizers/`

## Migration Strategy

1. Introduce normalized event types without changing runtime behavior.
2. Wrap current `watchOrders()` path behind the new interfaces.
3. Add trade-event support and dedup.
4. Add balance cache and optional `watchBalance()`.
5. Add explicit balance refresh fallback.
6. Switch status/sizing reads from raw `fetchBalance()` to cache-first reads.
7. Remove old private-stream naming after parity is stable.

## Testing Plan

### Unit

- normalize raw CCXT order payload -> normalized `order` event
- normalize raw CCXT trade payload -> normalized `trade` event
- normalize raw CCXT balance payload -> normalized `balance` event
- dedup trade + order overlap
- dedup WS fill vs REST reconciliation
- balance cache apply snapshot
- balance cache apply delta
- stream health transitions

### Integration

- `watchOrders()` only exchange still routes fills
- `watchOrders() + watchMyTrades()` exchange prefers trade events without double-counting
- `watchBalance()` supported exchange updates cache without REST call
- no-`watchBalance()` exchange refreshes cache through `fetchBalance()`
- private stream disconnect causes degraded mode and later recovery

### System

- pure market making continues through WS-primary mode
- pure market making survives WS silence through REST order reconciliation
- admin direct order details show fresh cached balances when available
- dual-account sessions preserve account boundaries across all user-stream event kinds

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Duplicate fill application | Order and trade streams can both describe the same fill | Use monotonic cumulativeQty plus fill-id dedup |
| Exchange payload inconsistency | CCXT private WS payloads differ sharply by exchange | Put parsing in per-exchange normalizers |
| Stale cached balances | Runtime may size from old data | Track freshness and fall back to `fetchBalance()` |
| Account boundary leaks | Multi-account sessions can cross-wire events | Keep exchange+accountLabel in every key and guard |
| Scope explosion | Full Hummingbot parity is broad | Phase gates and capability tiers |

## Phase Gates

- Gate A: normalized event contract approved
- Gate B: old `watchOrders()` behavior preserved through new user-stream interfaces
- Gate C: order/trade dual-ingestion works without duplicate fills
- Gate D: balance cache serves runtime safely with fallback
- Gate E: operators can see healthy/degraded/silent stream state

## Definition Of Done

This plan is complete when:

- the runtime has one normalized user-stream layer for `balance/order/trade`
- `watchOrders()` is no longer the only private WS path
- balance state is maintained through WS when available and refreshed through REST when needed
- order reconciliation and balance refresh are explicit fallback mechanisms
- admin/runtime diagnostics clearly show whether a connector is running in WS-primary or REST-degraded mode

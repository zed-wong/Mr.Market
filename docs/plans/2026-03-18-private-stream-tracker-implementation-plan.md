# Private Stream Tracker Implementation Plan

## Purpose

This plan defines how to fully implement `PrivateStreamTrackerService` so it matches the architectural role used by Hummingbot while remaining safe for Mr.Market's multi-user, multi-account exchange API key model.

The target state is:

- `PrivateStreamTrackerService` owns live private account streams
- private stream lifecycle is account-scoped, not order-scoped
- raw exchange private events are normalized before runtime routing
- fill and order updates are routed safely into pooled executors

## Design Goal

The service should no longer behave only as an in-memory downstream router.

It should become the runtime owner of live exchange private streams and then feed normalized private events into the existing fill-routing and executor pipeline.

## Architectural Principles

- keep watcher scope per exchange account, not per order and not per pair
- keep pooled executor scope per `exchange:pair`
- keep raw exchange payload handling isolated from controller and executor logic
- keep downstream routing deterministic through `FillRoutingService`
- keep multi-user account ownership explicit so private events cannot cross account boundaries
- start with the reference exchange first and expand only after the reference path is stable

## Target Runtime Shape

### Upstream Role

`PrivateStreamTrackerService` should:

- open and manage private account streams from `ExchangeInitService`
- keep those streams alive
- reconnect on failures with backoff
- normalize exchange-specific order and fill updates
- maintain latest private events per account

### Downstream Role

After normalization, `PrivateStreamTrackerService` should:

- route order and fill updates through `FillRoutingService`
- update `ExchangeOrderTrackerService`
- resolve the correct executor through `ExecutorRegistry`
- call `ExchangePairExecutor.onFill(...)`
- record orphaned fills when routing cannot be completed safely

## Implementation Plan

### 1. Clarify runtime ownership and boundaries

- define `PrivateStreamTrackerService` as the owner of live private account streams
- keep executor-session fill handling downstream
- keep watcher scope account-based, not pair-based and not order-based

### 2. Introduce explicit private-stream domain types

- add normalized private event types for:
  - order update
  - trade or fill update
  - balance update
  - generic account event
- include account context on every normalized event:
  - `exchange`
  - `accountLabel`
  - account identity or fingerprint when available
  - `pair`
  - `exchangeOrderId`
  - `clientOrderId`
  - `status`
  - `receivedAt`
  - `rawPayload`

### 3. Refactor `PrivateStreamTrackerService` into a true account-stream manager

- add watcher registry keyed by account identity
- add lifecycle methods such as:
  - `ensureAccountStreamStarted(...)`
  - `releaseAccountStream(...)`
  - `stopAllStreams()`
  - `isWatching(...)`
- add reference counting so many sessions can share one account stream safely
- keep latest-event and orphaned-fill tracking inside the service

### 4. Build connector-facing watcher loop inside the tracker

- start with `binance` only
- use real exchange instances from `ExchangeInitService`
- implement `watchOrders()` loop first
- add reconnect, backoff, and cancellation handling
- prevent tight-loop behavior when the exchange resolves immediately or misbehaves

### 5. Normalize raw exchange events before routing

- convert raw ccxt private updates into internal event shapes
- handle exchange-specific payload differences in isolated normalization helpers
- do not let raw ccxt payload assumptions leak into executor or controller logic

### 6. Connect normalized order and fill events to existing downstream runtime

- route with `FillRoutingService`
- update `ExchangeOrderTrackerService`
- resolve executor via `ExecutorRegistry`
- call `ExchangePairExecutor.onFill(...)`
- preserve orphaned-fill handling when routing fails

### 7. Wire account-stream lifecycle into market-making runtime

- on strategy or session attach, ensure the corresponding account stream is started
- on strategy or session detach, release that account stream
- stop the watcher only when no active sessions depend on it
- integrate this cleanly with pooled executors keyed by `exchange:pair`

### 8. Add multi-account safety rules

- enforce that one account stream cannot route into another account's runtime session
- validate account context before dispatching fills
- document how account identity is derived:
  - `exchange + accountLabel`
  - or stronger `exchange + accountLabel + credential fingerprint`

### 9. Add tests in layers

- unit tests for:
  - watcher registry and reference counting
  - reconnect and backoff behavior
  - normalization helpers
  - routing success and orphan paths
- integration-style tests for:
  - live watcher pushes normalized events into tracker pipeline
  - downstream fill routing reaches correct executor
- system test only if sandbox private updates can be observed deterministically

### 10. Add config and operational controls

- make private stream startup opt-in or capability-aware
- add logs and health visibility for:
  - active account streams
  - reconnect failures
  - orphaned fills
  - unsupported exchange capabilities
- keep failure mode safe: placement can still work even when private streams are unavailable

### 11. Update `docs/execution/flow/MARKET_MAKING_FLOW.md`

- replace the simplified `PrivateStreamTracker` fill line with the real account-stream lifecycle
- document:
  - account-scoped private watchers
  - normalized private event flow
  - downstream fill routing to pooled executors
  - distinction between account-stream scope and executor scope
- update the diagram to reflect:
  - `ExchangeInitService` and private account stream
  - `PrivateStreamTrackerService`
  - `FillRoutingService`
  - `ExchangeOrderTrackerService`
  - `ExecutorRegistry / ExchangePairExecutor`

### 12. Update supporting docs and roadmap

- update `docs/tests/MARKET_MAKING.md`
- update `docs/execution/CHANGELOG.md`
- update `docs/plans/2026-03-18-market-making-testing-roadmap.md`
- mark A7 as:
  - `partial` if live ingestion exists without deterministic end-to-end proof
  - `complete` only after deterministic real private-stream coverage exists

## Recommended Implementation Order

1. normalized private event types
2. tracker refactor into account-stream manager
3. binance `watchOrders()` loop
4. downstream routing integration
5. runtime lifecycle wiring
6. tests
7. `docs/execution/flow/MARKET_MAKING_FLOW.md`
8. roadmap and supporting doc updates

## Expected Outcome

When complete, Mr.Market should have:

- one private stream manager per exchange account
- normalized private event handling similar in architectural role to Hummingbot
- safe routing from account-scoped private updates into pooled executor sessions
- documentation that accurately describes the private stream lifecycle

## Status

- Created: 2026-03-18
- Updated: 2026-03-18
- Status: Draft

# Persistent Sandbox Market-Making Validation Plan

**Date:** 2026-03-21
**Branch:** test/ccxt-sandbox-integration
**Status:** Proposed

## Context

The current sandbox/system-test work proves short-lived execution-engine parity:

- `start_mm` / `stop_mm`
- single and repeated ticks
- real sandbox order placement and cancel
- fill routing and private-fill ingestion on the reference exchange

What is still missing is a long-running validation surface that lets operators watch the runtime behave continuously on a real sandbox exchange.

The immediate user need is:

1. run market making continuously on a real sandbox
2. see order placement and cancellation in real time
3. see live order book state next to open orders and fills
4. stop safely and clean up sandbox orders

This should not be framed as a normal CI test. It is an operator-facing validation mode for runtime observation.

## Decision Summary

Build this in phases, but make the first deliverable a **CLI-driven persistent sandbox validation runner**.

Phase 1 should be:

- real sandbox only
- server-side runner
- structured terminal logs
- explicit start / status / stop / cleanup flow
- no UI dependency

Later phases can expose the same state through API/WebSocket and then a lightweight monitoring page.

## Why This Is Needed

The existing system tests answer "does one bounded scenario pass?"

They do not answer:

- does the runtime stay healthy for 15 to 60 minutes?
- do open orders remain aligned with current order book conditions?
- do fills trigger expected replacement behavior over time?
- do tracker state, execution history, and exchange state stay coherent across repeated cycles?
- can an operator watch the system live and stop it safely?

For mainnet readiness, that visibility gap is now more important than adding another one-shot spec.

## Scope

### Phase 1 Goals

1. Start one sandbox market-making session through the same production runtime path used today.
2. Keep it running until stopped explicitly.
3. Emit a live stream of:
   - best bid / best ask
   - current strategy quote intent summary
   - tracked open orders
   - newly observed fills
   - place / cancel activity
   - runtime warnings and errors
4. Persist enough run metadata that the operator can resume inspection after process restart.
5. Provide a kill switch that stops the session and cleans up known sandbox open orders.

### Phase 1 Non-Goals

- no full market-making funding lifecycle
- no Mixin withdrawal / deposit / campaign orchestration dependency
- no mainnet support
- no admin UI in the first slice
- no claim of exact realized PnL accounting beyond current runtime data availability

## Current Constraints To Respect

### 1. Funding flow is still blocked

`withdraw_to_exchange` is still validation/refund mode, so this runner must not depend on the full business lifecycle.

Implication: the runner should operate on a prepared sandbox-ready order and the already-working Track A execution boundary, not on the blocked funding path.

### 2. The production runtime path must remain the source of truth

The validation runner must use the real services that matter:

- `ExchangeInitService`
- `MarketMakingProcessor.handleStartMM()` / `handleStopMM()`
- `ExecutorRegistry`
- `ExchangePairExecutor`
- `StrategyService`
- `StrategyIntentExecutionService`
- `ExchangeOrderTrackerService`
- `PrivateStreamIngestionService`
- `FillRoutingService`

### 3. Sandbox safety must be explicit

The runner must refuse to start unless sandbox mode is enabled and the target exchange/account are marked as test-only configuration.

## Recommended Phase 1 Architecture

## High-Level Shape

Introduce a small validation module in the backend with one long-running runner service and one CLI entrypoint.

```text
CLI command
  -> Nest application context
  -> SandboxValidationRunnerService
  -> start / observe / stop one sandbox MM session
  -> structured log stream + persisted run metadata
```

## Core Components

### 1. `SandboxValidationRunnerService`

Main responsibilities:

- create or resume a validation run record
- load a sandbox-ready market-making order
- call the real `start_mm` path
- start an observation loop
- aggregate exchange/runtime state into log frames
- call the real `stop_mm` path on shutdown
- perform best-effort sandbox cleanup for tracked open orders

### 2. `SandboxValidationRun` persistence

Add a small persistence layer for run state.

Minimum fields:

- `runId`
- `status` (`starting`, `running`, `stopping`, `stopped`, `failed`)
- `exchange`
- `pair`
- `marketMakingOrderId`
- `accountLabel`
- `startedAt`
- `stoppedAt`
- `lastHeartbeatAt`
- `lastError`

This is not for full event sourcing. It is just enough to make the persistent runner observable and resumable.

### 3. Observation loop

Run every 1 to 2 seconds and emit one structured frame per cycle.

Each frame should contain:

- run metadata
- top-of-book snapshot
- tracked open orders summary
- newly closed or filled orders since previous frame
- latest strategy execution-history delta
- warning/error counters

Output modes:

- human-readable console log
- newline-delimited JSON file for later replay/debugging

### 4. CLI entrypoint

Add a script-based entrypoint, for example:

```text
bun run sandbox:validate:start -- --exchange binance --pair BTC/USDT --duration 30m
bun run sandbox:validate:status -- --run <runId>
bun run sandbox:validate:stop -- --run <runId>
bun run sandbox:validate:cleanup -- --run <runId>
```

The exact command names can be finalized during implementation, but the behavior should be split into explicit operator actions.

## How Phase 1 Should Obtain A Runnable Order

Because the funding lifecycle is blocked, the runner should support one of these inputs:

### Option A — Attach to an existing prepared sandbox order

Operator provides an existing order ID whose snapshot/config are already valid for `start_mm`.

Pros:

- simplest
- fully aligned with current runtime assumptions
- no extra business-flow scaffolding

Cons:

- requires the operator to prepare the order first

### Option B — Create a validation-only prepared order fixture

The runner creates a minimal sandbox-ready order row using the same snapshot shape already used by current system helpers.

Pros:

- faster operator workflow
- fully repeatable

Cons:

- needs careful scoping so it does not pretend to validate the blocked funding path

### Recommendation

Implement **Option A first**, then add Option B only if operator friction becomes a real problem.

## Runtime Data Sources

The observation loop should prefer existing runtime state before adding new trackers.

### Order book

Use this fallback chain:

1. `OrderBookTrackerService.getOrderBook(exchange, pair)`
2. `ExchangeConnectorAdapterService.fetchOrderBook(exchange, pair)`

### Open orders and status transitions

Use:

- `ExchangeOrderTrackerService`
- exchange-side refetch for spot checks when necessary

### Fills

Use:

- `PrivateStreamTrackerService` / `PrivateStreamIngestionService` flow for new fill signals
- execution history persistence as the durable audit surface

### Strategy-side activity

Use:

- latest intent/execution-history rows
- executor session presence from `ExecutorRegistry`

## Safety Requirements

### Hard guards

- refuse to run without sandbox-enabled exchange boot
- refuse to run on an unapproved exchange name/account label combination
- require explicit pair input
- require explicit stop timeout and cleanup mode

### Shutdown behavior

On SIGINT, SIGTERM, or command stop:

1. mark run status as `stopping`
2. call the real `stop_mm` path
3. fetch tracked open orders
4. attempt best-effort cancel/cleanup
5. mark run `stopped` or `failed`

### Failure handling

If observation fails temporarily, keep the run alive and log degraded status.

If runtime start fails or cleanup fails, persist the error and keep the run record diagnosable.

## Suggested Target Files

### Backend

```text
server/src/modules/market-making/validation/
  sandbox-validation.module.ts
  sandbox-validation-runner.service.ts
  sandbox-validation-run.repository.ts
  entities/sandbox-validation-run.entity.ts
  dto/sandbox-validation-command.dto.ts

server/src/scripts/
  sandbox-validation.ts

server/package.json
  sandbox:validate:start
  sandbox:validate:status
  sandbox:validate:stop
  sandbox:validate:cleanup
```

### Deferred for later phases

```text
server/src/modules/market-making/validation/
  sandbox-validation.controller.ts
  sandbox-validation.gateway.ts

interface/src/routes/.../sandbox-validation/
  +page.svelte
```

## Implementation Phases

## P0 — Runner foundation

Deliverables:

- validation module
- `SandboxValidationRun` entity/repository
- CLI bootstrap using Nest application context
- start/stop/status commands

Exit gate:

- operator can start one run and see persisted run status

## P1 — Live observation stream

Deliverables:

- 1 to 2 second observation loop
- structured console output
- NDJSON log file output
- top-of-book + open-order + fill summaries

Exit gate:

- operator can watch one run continuously for at least 15 minutes

## P2 — Cleanup and failure hardening

Deliverables:

- signal handling
- best-effort open-order cleanup
- degraded-state logging for transient exchange/API errors
- restart/resume support from persisted run record

Exit gate:

- process interruption does not leave the run state ambiguous

## P3 — Optional API/WebSocket surface

Deliverables:

- REST status endpoint for runs
- WebSocket push for live frames
- reusable DTOs for future UI

Exit gate:

- backend can serve the same live state without the CLI attached

## P4 — Optional lightweight monitoring page

Deliverables:

- simple page showing order book, open orders, fills, and runner status
- start/stop controls gated behind explicit admin/test-only surface

Exit gate:

- operator no longer needs terminal access for routine sandbox observation

## Validation Plan

Phase 1 implementation should be accepted only after these checks pass:

### Functional validation

- run starts through the real production runtime path
- at least one real sandbox order is observed placed
- repeated quote maintenance is visible over time
- live order book snapshots continue updating
- fill events appear when the sandbox environment produces them
- stop command ends the session and cleanup attempts are logged

### Operational validation

- run metadata survives process restart
- status command can inspect a previously started run
- NDJSON log can be replayed for debugging
- transient observation failures do not crash the process immediately

### Safety validation

- runner refuses non-sandbox configuration
- cleanup is best-effort but explicit
- any leftover open orders are listed clearly if cleanup is incomplete

## Main Risks

### 1. False sense of persistence

If Phase 1 only keeps state in memory, it will not meet the real operator need.

Mitigation: persist run metadata from the first slice.

### 2. Mixing validation scope with blocked business flow

If the runner tries to create full business orders end to end, it will inherit the current funding blocker and stall.

Mitigation: limit Phase 1 to the already-working execution-engine boundary.

### 3. Poor cleanup on abnormal shutdown

Sandbox leftovers will quickly reduce trust in the tool.

Mitigation: make cleanup a first-class command and a shutdown path, not an afterthought.

## Recommendation

Proceed with **P0 + P1 first**:

1. persistent run record
2. CLI start/status/stop
3. live structured logging for order book, open orders, and fills

That is the smallest implementation that satisfies the current need without waiting for the broader funding and campaign lifecycle to be finished.

# Execution Boundary Cleanup Plan

## Problem

The execution path has drifted from the intended three-layer architecture. The normal intent path still exists, but strategy tick code now has side-effect shortcuts that blur responsibilities:

- Strategy controllers can indirectly trigger exchange cancellation through `TrackedOrderShutdownService`.
- Tick can wait on exchange I/O and order-settlement polling.
- Dual-account runtime state persistence is mixed into strategy-controller tick handling.
- Existing architecture invariant tests only catch direct forbidden method names, not indirect dependencies that perform exchange mutations.

## Target Architecture

### Scheduling Layer

- Owns tick, strategy sessions, controller invocation, and intent publication.
- Strategy controllers produce `ExecutorAction[]` only.
- Tick must not wait on exchange create/cancel/fetch, settlement, reconciliation, or long-running cleanup.

### Trading Layer

- `StrategyIntentWorkerService` pulls persisted NEW intents.
- `StrategyIntentExecutionService` owns risk checks, order-level reservation, exchange mutation, tracked-order writes, mapping writes, and intent state transitions.
- Trackers, settlement, and reconciliation own fills, terminal exchange evidence, reservation release, and ledger settlement.

### Runtime Cleanup

- Startup, shutdown, and stop orchestration may use cleanup services, but strategy controllers must not depend on services that perform exchange mutations.
- Strategy-driven cancellation must be represented as `CANCEL_ORDER` intents.

## Implementation Steps

1. Replace dual-account timeout cleanup with `CANCEL_ORDER` action publication.
   - Remove `TrackedOrderShutdownService` from `DualAccountVolumeStrategyController`.
   - Read active tracked orders through the tracker and local terminal-status filtering.
   - When an optimal dual-account maker order times out, return a `CANCEL_ORDER` action with `reason=maker_timeout`.

2. Keep intent worker as the only strategy-driven exchange mutation owner.
   - Existing create/cancel execution stays in `StrategyIntentExecutionService`.
   - Reservation release for cancel remains in the cancel intent path.

3. Strengthen invariant tests.
   - Forbid strategy controllers from importing or referencing `TrackedOrderShutdownService`.
   - Keep existing checks that controllers do not call exchange or ledger mutation methods.

4. Follow-up work after this first cleanup.
   - Move dual-account cycle persistence out of controller tick handling into a small runtime-state owner.
   - Replace inline dual-account taker polling with event-driven taker intents from tracked fill progress.
   - Tighten tick tests so controller decisions cannot perform exchange I/O.

## Stop-State-Machine Repair

The current stop path still has a boundary violation: controller/tick code can call `stopStrategyForUser()`, and the lifecycle service currently marks the strategy stopped, directly cancels tracked exchange orders, waits for cleanup, removes the session, and cancels pending intents. That makes a strategy-driven stop block on trading-layer work.

The stop path should become a two-stage state machine:

```text
controller tick
  -> returns STOP_CONTROLLER action
  -> tick publishes intent
  -> tick returns

intent worker
  -> executes STOP_CONTROLLER
  -> marks strategy status = stopping
  -> cancels non-stop/non-cancel pending intents
  -> publishes CANCEL_ORDER intents for live tracked orders
  -> marks STOP_CONTROLLER done

intent worker
  -> executes each CANCEL_ORDER
  -> exchange cancel
  -> tracked order update
  -> reservation release through the existing cancel path

stop finalizer
  -> sees no active tracked orders and no active intents
  -> marks strategy status = stopped
  -> detaches session
```

Important constraints:

- `STOP_CONTROLLER` means "stop requested and cancellation has been queued", not "stop completed".
- `CANCEL_ORDER` remains the only strategy-driven exchange-cancel mutation path.
- Strategies in `stopping` must still allow `STOP_CONTROLLER` and `CANCEL_ORDER` intents to execute, while risk-increasing create/swap intents are rejected or cancelled.
- `TrackedOrderShutdownService` remains available for process shutdown, startup recovery, failed-start rollback, and emergency/operator cleanup only.

Initial implementation slice:

1. Change strategy-driven target-completion stops to return `STOP_CONTROLLER` actions.
2. Teach `StrategyIntentExecutionService` to handle `STOP_CONTROLLER` by entering `stopping` and enqueueing cancel intents for live tracked orders.
3. Teach `StrategyIntentWorkerService` and execution guards to allow stop/cancel intents while a strategy is `stopping`.
4. Add a local no-live-orders/no-active-intents finalizer that marks `stopping` strategies `stopped` and detaches their sessions.
5. Remove the stop callback from `StrategyTickContext` so controllers cannot directly invoke strategy cleanup.
6. Add focused tests for stop intent queuing and finalization.

## Expected Runtime Flow

```text
tick
  -> run due strategy session
  -> controller reads cached/local state
  -> controller returns actions
  -> intent store persists actions as NEW intents
  -> tick returns

intent worker
  -> picks NEW intent
  -> risk check
  -> reserve order-scoped funds when needed
  -> mutate exchange through adapter
  -> update tracked order and mapping
  -> release reservation on terminal cancel/failure
  -> mark intent DONE or FAILED

trackers / settlement / reconciliation
  -> observe fills and terminal exchange state
  -> settle order-scoped ledger entries
  -> release remaining reservations
  -> block risk-increasing operations on mismatch
```

## Validation

- Run the efficient dual-account architecture invariant spec.
- Run focused strategy tests that cover dual-account action generation and cancel-intent publication.

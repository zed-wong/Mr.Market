# PMM Minimum Safe Stability Close-Gap Plan

## Status

Draft.

## Goal

Close the minimum gap required for **single-venue Pure Market Making** to run in a way that is:

- safe: avoids invalid orders, runaway loss, and orphaned exchange orders
- reliable: converges local state with exchange state during fills, reconnects, restart, and shutdown
- stable: can run for long periods without churn, duplicate actions, or silent drift

This plan is intentionally narrower than full Hummingbot parity. The target is not feature breadth. The target is the smallest production-safe PMM core.

## Scope

### In scope

- single-venue PMM runtime hardening
- exchange/local order-state convergence
- restart and shutdown safety
- quote profitability protection
- connector health gating
- minimum persistence needed for recovery

### Out of scope

- multi-leg strategies
- derivative/perpetual support
- XEMM / spot-perp arb / AMM arb
- advanced PMM features beyond minimum safety set
- reporting, dashboard, remote control, and notifications

## Source Of Truth

This plan narrows the PMM-related gaps from:

- `docs/architecture/hummingbot-gap-analysis.md`

Relevant gap IDs:

- Foundation: `#17`, `#19`, `#21`, `#38`, `#41`
- Safety and operations: `#18`, `#58`, `#60`, `#82`
- PMM hardening: `#43`, `#44`, `#45`, `#50`, `#51`, `#52`, `#84`

## Target Operating Bar

PMM should not be considered minimally production-safe until all of the following are true:

1. The engine never submits price/size values that violate exchange rules.
2. A single order cannot be created/cancelled twice because of local race conditions.
3. Local tracked state can recover after process restart and converge with real open orders on the exchange.
4. Fill ingestion remains correct even if WebSocket events are delayed or missed.
5. The strategy pauses when connector health is degraded and stops when loss exceeds the configured threshold.
6. Shutdown cancels outstanding orders deterministically.
7. Quotes are not left live when spread falls below profitability floor or when they would cross as taker unexpectedly.

## Priority Set

### Must have before calling PMM minimally safe

- `#19` In-flight order state machine
- `#21` Trading rules / quantization
- `#38` Dual update mechanism
- `#41` Tracking state persistence
- `#17` Order restoration on restart
- `#44` Minimum spread enforcement
- `#50` filled_order_delay
- `#52` POST_ONLY order type support
- `#58` Kill switch
- `#60` Network status monitoring
- `#82` Graceful shutdown with cancel-all

### Should have before broad rollout

- `#18` Budget checker
- `#45` Add transaction costs to spread
- `#43` Order refresh tolerance

### Recommended after the minimum bar is met

- `#51` Max order age
- `#84` Hanging orders cancel percentage

## Execution Principles

- Keep the current pooled executor architecture. Do not introduce multi-leg abstractions in this plan.
- Reuse the existing strategy runtime, intent pipeline, exchange adapter, and private stream flow.
- Prefer explicit state transitions over implicit flag combinations.
- Persist only the state required for safe recovery; do not build a generic event-sourcing system.
- Gate rollout with system tests and soak tests, not with manual confidence.

## Phase Plan

### Phase 1 — Order-State Correctness

Objective: ensure one order has one authoritative lifecycle locally, and local state can be reconciled with the exchange.

Includes:

- `#19` In-flight order state machine
- `#21` Trading rules / quantization
- `#38` Dual update mechanism
- `#41` Tracking state persistence

Deliverables:

- Formal tracked-order states for at least:
  - `PENDING_CREATE`
  - `OPEN`
  - `PARTIALLY_FILLED`
  - `PENDING_CANCEL`
  - `FILLED`
  - `CANCELED`
  - `FAILED`
- Deduplicated create/cancel handling so repeated ticks cannot enqueue conflicting actions for the same live order.
- Pre-submit quantization and exchange-rule validation using exchange metadata before intent execution.
- Periodic REST reconciliation for open orders and fills when WebSocket data is missing, delayed, or reconnecting.
- Persistence for tracked in-flight state needed to recover live orders after restart.

Implementation notes:

- Concentrate changes under `server/src/modules/market-making/strategy/`.
- Prefer extending existing order tracker and fill-routing components over introducing a second tracker.
- Quantization should happen before order submission, not after exchange rejection.

Exit criteria:

- No duplicate create/cancel actions under repeated eligible ticks.
- Partial fills update local state monotonically and idempotently.
- A missed WebSocket fill is recovered by reconciliation without double-ledger mutation.
- Restart with active exchange orders preserves correct local tracking state.

### Phase 2 — Runtime Safety Gates

Objective: prevent the strategy from continuing when balances, network health, or losses are outside safe bounds.

Includes:

- `#17` Order restoration on restart
- `#18` Budget checker
- `#58` Kill switch
- `#60` Network status monitoring
- `#82` Graceful shutdown with cancel-all

Note: `#58` kill switch should be implemented early in this phase, immediately after `#82` graceful shutdown. It is the last safety net — if Phase 3 profitability protections are not yet in place, the kill switch is the only mechanism that can halt runaway losses.

Deliverables:

- Startup restoration flow that fetches exchange open orders and rebinds them to runtime sessions.
- Pre-flight affordability checks before each create/amend path.
- Connector health gating so PMM tick execution pauses when private/public connectivity is unhealthy.
- Strategy-level kill switch based on realized plus safely computable unrealized drawdown threshold.
- Deterministic stop path that cancels all outstanding exchange orders and waits for terminal acknowledgement or timeout handling.

Implementation notes:

- `#17` should build on `#19` and `#41`; do not implement restoration as a separate ad hoc path.
- Kill switch should fail closed: once triggered, strategy moves to stopped state and does not auto-resume.
- Shutdown must cover runtime stop, process shutdown hooks, and crash-recovery startup cleanup.

Exit criteria:

- Restart with live orders does not create duplicate quotes.
- Insufficient balance blocks order placement before submission.
- Connector disconnect pauses quoting and prevents new orders.
- Stop/shutdown leaves no unmanaged exchange orders in the tracked PMM session.
- Kill switch trigger moves strategy to stopped state and executes cancel-all on exchange orders, not just stops generating new intents.

### Phase 3 — Quote Profitability Protection

Objective: make sure resting PMM quotes remain maker-oriented and economically valid.

Includes:

- `#44` Minimum spread enforcement
- `#45` Add transaction costs to spread
- `#52` POST_ONLY order type support
- `#50` filled_order_delay

Deliverables:

- Profitability floor that cancels or skips quotes when spread is below configured minimum.
- Fee-aware spread expansion so configured quotes target post-fee profitability instead of raw spread only.
- Maker-only order intent support across the PMM create path.
- Short cooldown after fills to avoid immediate re-entry in one-sided fast markets.

Implementation notes:

- `#52` is part of the safety bar because PMM profitability assumptions break if quotes become taker orders.
- `#45` should compose with `#44`, not override it. Effective minimum quote width must be the stricter of the two constraints.
- Keep delay logic simple and per strategy session; do not build a generic scheduling subsystem.

Exit criteria:

- No quote is submitted below configured profitability floor.
- Orders that would cross as taker are rejected or re-priced before submission.
- Exchange rejection of a POST_ONLY order that would cross the book is handled gracefully without retry.
- After a fill, the session observes the configured cooldown before re-quoting.

### Phase 4 — Stability And API Pressure Reduction

Objective: reduce avoidable churn and clean up stale quote edge cases after the minimum safety bar is already met.

Includes:

- `#43` Order refresh tolerance
- `#51` Max order age
- `#84` Hanging orders cancel percentage

Deliverables:

- Tolerance-based cancel-replace suppression for insignificant price drift.
- Hard refresh age for long-lived stale orders.
- Drift threshold for hanging-order cleanup.

Exit criteria:

- Cancel/replace volume drops materially in stable markets.
- Hanging orders cannot remain indefinitely far from the market.
- Old quotes are refreshed even when drift is small.

## Validation Plan

### Unit tests

- state transition validity and illegal-transition rejection
- quantization and min-notional enforcement
- fee-aware spread computation
- kill-switch threshold calculation
- health-gate decision logic

### Integration tests

- adapter-level order create/cancel/open-order reconciliation
- dual-update dedup between WebSocket and REST
- startup restoration with persisted tracked state
- graceful shutdown cancel-all behavior

### System tests

- repeated PMM tick cycles with live tracked orders and partial fills
- restart during active quotes
- temporary WebSocket loss with REST recovery
- connector disconnect / reconnect gating
- insufficient balance and rejection-path coverage

### Soak tests

- multi-hour sandbox or simulated run with bounded memory, bounded tracked-order count, and bounded API churn
- no duplicate local/exchange order divergence across repeated reconnect and fill scenarios

## Suggested Delivery Order

1. `#19` In-flight order state machine
2. `#21` Trading rules / quantization
3. `#38` Dual update mechanism
4. `#41` Tracking state persistence
5. `#17` Order restoration on restart
6. `#60` Network status monitoring
7. `#82` Graceful shutdown with cancel-all
8. `#58` Kill switch
9. `#18` Budget checker
10. `#44` Minimum spread enforcement
11. `#52` POST_ONLY order type support
12. `#45` Add transaction costs to spread
13. `#50` filled_order_delay
14. `#43` Order refresh tolerance
15. `#51` Max order age
16. `#84` Hanging orders cancel percentage

## Definition Of Done

This plan is complete only when:

- all Phase 1 through Phase 3 items are implemented
- system coverage exists for restart, disconnect, missed-fill recovery, and shutdown cleanup
- at least one soak run demonstrates bounded resources and no exchange/local order divergence
- the PMM runtime can be started, stopped, restarted, and left running without manual exchange cleanup

## Deferred Items

These remain explicitly out of the minimum-safe plan even if they are useful later:

- moving price bands
- order optimization / best bid-ask jumping
- ping-pong mode
- inventory cost pricing
- advanced reporting and live dashboards
- full Hummingbot PMM parity

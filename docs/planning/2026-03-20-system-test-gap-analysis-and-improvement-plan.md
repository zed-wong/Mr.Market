# System Test Gap Analysis and Improvement Plan

**Date:** 2026-03-20
**Branch:** test/ccxt-sandbox-integration

## Context

A deep review of all 18 system test specs, 7 helper files, and the production
services they exercise revealed that the existing suite provides strong coverage
of the market-making core path (intent lifecycle, pricing, idempotency, retry,
fill routing) but leaves infrastructure and operational layers largely untested.

This document catalogues every identified fidelity gap, proposes concrete
improvements, and assigns priorities.

---

## Current Coverage Summary

| Area | Specs | Verdict |
|---|---|---|
| Intent state machine (NEW/SENT/DONE/FAILED) | 6 | Excellent — mock + sandbox dual-rail |
| Idempotency | 2 | Excellent — duplicate consume verified both ways |
| Retry logic | 2 | Solid — first-fail → retry → DONE path |
| Multi-layer ladder pricing | 1 | Good — BigNumber price/qty ladder assertions |
| Hanging order preservation | 1 | Good — cross-tick no-dup check |
| Cadence guard | 1 | Good — ineligible tick blocked, clientOrderId determinism |
| Payment state machine | 1 | Good — payment_pending → payment_complete + balance credit |
| Fill routing priority chain | 1 | Good — three resolution sources tested |
| Private stream full/partial fill | 2 | Good — deterministic + live cross-account |
| REST order lifecycle | 1 | Good — create → fetch → list → cancel → verify |
| Runtime start/stop | 1 | Good — state transitions + session/instance match |
| DB migration/seed | 1 | Adequate — table existence + row counts |
| App info contract | 1 | Adequate — payload shape check |

---

## Identified Gaps

### Gap 1 — In-memory SQLite vs file-based WAL mode

**Problem:** Every helper uses `database: ':memory:'`. Production runs
file-backed SQLite with WAL journaling. WAL write-lock contention, fsync
failures, and BUSY timeout behavior cannot surface in :memory: mode.

**Risk:** Concurrent writes from the intent worker and the tick loop could
silently lose data in production while passing in-memory tests.

### Gap 2 — ClockTickCoordinator bypassed

**Problem:** Production enters the tick loop through
`ClockTickCoordinatorService.tickOnce()`, which invokes registered components
in priority order (`OrderBookTracker → ExchangeOrderTracker →
PrivateStreamTracker → StrategyService`). System tests call
`executor.onTick()` directly, skipping the coordinator entirely.

**Risk:** Component ordering bugs and per-component error isolation failures
are invisible.

### Gap 3 — Bull queue replaced with FakeQueue or empty mock

**Problem:** `FakeQueue` executes jobs synchronously in-process. The real Bull
queue (Redis-backed) provides retry policies, delayed scheduling, and
concurrency caps that are never exercised.

**Risk:** Job payload shape drift, missing retry configuration, and duplicate
job delivery go undetected.

### Gap 4 — Exchange rate limiting disabled

**Problem:** `SandboxExchangeHelper` sets `enableRateLimit: false`. The 429
back-off path in the ccxt layer is never exercised.

**Risk:** Production bursts that exceed exchange rate limits could cause silent
order placement failures.

### Gap 5 — WebSocket reconnection untested

**Problem:** `PrivateStreamIngestionService.runOrderWatcher()` contains a
reconnection loop with exponential back-off, but no test verifies that a
transient `watchOrders` failure is survived.

**Risk:** A single WebSocket drop could permanently stop fill ingestion for a
symbol.

### Gap 6 — DurabilityService has zero system tests

**Problem:** The outbox/consumer-receipt pattern is the persistence guarantee
layer. No system test verifies `appendOutboxEvent` or `markProcessed`
idempotency.

**Risk:** Event loss or duplicate processing in production.

### Gap 7 — ReconciliationService has zero system tests

**Problem:** Three reconciliation checks (ledger invariant, reward consistency,
intent lifecycle staleness) are never exercised with known-bad data.

**Risk:** Violations could accumulate undetected in production.

### Gap 8 — Single exchange / single symbol only

**Problem:** Every test fixture targets one exchange and one trading pair. No
test creates concurrent orders across different pairs or exchanges.

**Risk:** Executor registry isolation bugs and cross-pair lock contention are
invisible.

### Gap 9 — Clock/cadence tested via direct mutation

**Problem:** `forceSessionReadyForNextTick` sets `session.nextRunAtMs =
Date.now()`. The cadence guard is never tested against a clock that drifts or
jumps.

**Risk:** Low — already indirectly covered by the ineligible-tick assertion,
but explicit far-future guard is missing.

### Gap 10 — ConfigService is a hardcoded mock

**Problem:** All config values are constants inside helpers. No test verifies
behavior under missing keys, zero values, or invalid types.

**Risk:** A misconfigured deployment could silently run with undefined spreads
or cadence.

---

## Improvement Plan

### P0 — High impact, low cost (target: ~5 hours total)

#### 1. File-based SQLite with WAL (Gap 1)

Add a helper factory that creates a temp-directory-backed SQLite database with
WAL mode enabled. Apply it to `MarketMakingSingleTickHelper` (the heaviest
helper); leave lighter helpers on :memory:.

```
sandbox-system.helper.ts
  + createSystemTestDatabaseConfig(label: string)
      → returns { type: 'sqlite', database: <tmpfile>, extra: { flags: ['-WAL'] }, cleanupDir }

market-making-single-tick.helper.ts
  - database: ':memory:'
  + database: config.database (from createSystemTestDatabaseConfig)
  + afterAll: rm -rf cleanupDir
```

Estimated effort: **1 hour**.

#### 2. ClockTickCoordinator integration spec (Gap 2)

New spec: `test/system/tick/clock-tick-single-cycle.sandbox.system.spec.ts`.

Scenario: register all four real tick components into a coordinator instance,
call `tickOnce()`, and assert that intents were generated through the full
production path. Also verify that a failing component does not block subsequent
components.

Estimated effort: **2–3 hours**.

#### 3. DurabilityService system spec (Gap 6)

New spec: `test/system/durability/outbox-consumer-receipt.system.spec.ts`.

Three test cases:
- Append an outbox event → verify persisted with eventId and timestamp.
- Mark processed once → returns true.
- Mark processed again with same key → returns false (idempotent).

Only needs SQLite + two entities. Estimated effort: **1 hour**.

---

### P1 — Medium impact, medium cost (target: ~5 hours total)

#### 4. ReconciliationService system spec (Gap 7)

New spec: `test/system/reconciliation/reconciliation-invariants.system.spec.ts`.

Six test cases (one valid + one violation per reconciliation type):
- Ledger: `available + locked != total` detected.
- Reward: allocated > reward amount detected.
- Intent: SENT intent older than 5 min detected.

Estimated effort: **2 hours**.

#### 5. Queue dispatch shape test (Gap 3)

Add a test (can live in the existing payment-intake or processor spec) that
spies on `FakeQueue.add` and asserts the job name, data shape, and jobId
convention when `startOrder` / `stopOrder` is called. This does not require
Redis but locks down the job contract.

Estimated effort: **1 hour**.

#### 6. Back-off logic unit test (Gap 4 + Gap 5 partial)

Add a unit test for `PrivateStreamIngestionService.getBackoffDelayMs`:
- consecutiveFailures=1 → 0 ms (no delay on first failure).
- consecutiveFailures=2 → 1000 ms.
- consecutiveFailures=10 → 30000 ms (cap).

Estimated effort: **30 minutes**.

#### 7. WebSocket reconnection smoke test (Gap 5)

New spec or extend `private-fill-ingestion` spec. Mock `watchOrders` to throw
on the first call and succeed on the second. Assert that
`queueAccountEvent` is eventually called after recovery.

Estimated effort: **1.5 hours**.

---

### P2 — Lower priority but valuable (target: ~4 hours total)

#### 8. Multi-pair executor isolation (Gap 8)

Extend `MarketMakingSingleTickHelper` to create two orders with different
pairs. Assert that each pair gets its own executor instance and that ticking
one pair does not produce intents for the other.

Requires the sandbox exchange to support a second trading pair; skip otherwise.

Estimated effort: **2 hours**.

#### 9. Far-future cadence guard (Gap 9)

Add one assertion to the existing cadence spec: set `nextRunAtMs` to
`Date.now() + 999_999_999`, call `onTick`, confirm zero new intents. Minimal
effort, makes the guard explicit.

Estimated effort: **30 minutes**.

#### 10. Config validation (Gap 10)

This is a production code gap more than a test gap. If no `validateConfig`
function exists, add one that validates strategy config against the
`StrategyDefinition.configSchema` (JSON Schema). Then add unit tests for
negative bidSpread, missing required fields, etc.

Estimated effort: **1.5 hours** (including production code).

---

## Execution Order

```
Phase 1 (P0):  file-based WAL  →  ClockTickCoordinator spec  →  DurabilityService spec
Phase 2 (P1):  ReconciliationService  →  queue shape  →  back-off unit test  →  WS reconnect
Phase 3 (P2):  multi-pair isolation  →  far-future guard  →  config validation
```

Total estimated effort: **~14 hours** across all three phases.

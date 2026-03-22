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

## Status Snapshot (2026-03-21)

The original gap list is still useful, but it is no longer fully current.
Several items below have already been closed in code, while some remaining
items were scoped too narrowly or pointed at the wrong validation layer.

### Already closed since the original draft

- **Gap 1 closed:** `createSystemTestDatabaseConfig()` now provisions temp-file
  SQLite databases with `-WAL`, and `MarketMakingSingleTickHelper` uses it.
- **Gap 6 closed:** `test/system/market-making/durability/outbox-consumer-receipt.system.spec.ts`
  now covers append + idempotent consumer receipt persistence.
- **Gap 5 partially closed:** `PrivateStreamIngestionService` unit coverage now
  verifies immediate retry, exponential backoff growth, reset-after-success,
  and the 30 s cap.
- **Gap 10 partially closed:** config-schema validation already exists in
  `StrategyConfigResolverService.validateConfigAgainstSchema()` and has unit
  coverage; the remaining gap is system/helper coverage for bad runtime config
  wiring, not the absence of validation logic itself.

### Remaining work focus

The remaining meaningful gaps are:

1. full `ClockTickCoordinatorService` system-path coverage,
2. reconciliation service system-path coverage,
3. queue contract assertions at the processor/runtime boundary,
4. real or contract-level rate-limit behavior coverage,
5. sandbox/private-stream reconnect coverage at the system layer,
6. multi-pair or multi-exchange isolation coverage,
7. stronger cadence/clock edge coverage,
8. misconfiguration behavior through real helpers/runtime startup.

The plan below is updated to reflect that state so it can be executed directly
without redoing completed work.

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

**Current status (2026-03-21):** Closed for the primary high-fidelity helper.
`server/test/system/helpers/sandbox-system.helper.ts` now exposes
`createSystemTestDatabaseConfig()`, and
`server/test/system/helpers/market-making-single-tick.helper.ts` uses a
temp-file SQLite database configured with WAL flags plus cleanup.

### Gap 2 — ClockTickCoordinator bypassed

**Problem:** Production enters the tick loop through
`ClockTickCoordinatorService.tickOnce()`, which invokes registered components
in priority order (`OrderBookTracker → ExchangeOrderTracker →
PrivateStreamTracker → StrategyService`). System tests call
`executor.onTick()` directly, skipping the coordinator entirely.

**Risk:** Component ordering bugs and per-component error isolation failures
are invisible.

**Current status (2026-03-21):** Still open.

### Gap 3 — Bull queue replaced with FakeQueue or empty mock

**Problem:** `FakeQueue` executes jobs synchronously in-process. The real Bull
queue (Redis-backed) provides retry policies, delayed scheduling, and
concurrency caps that are never exercised.

**Risk:** Job payload shape drift, missing retry configuration, and duplicate
job delivery go undetected.

**Current status (2026-03-21):** Still open. The best near-term fix remains a
contract test around `queue.add(...)` calls because no Redis-backed system test
rail exists yet.

### Gap 4 — Exchange rate limiting disabled

**Problem:** `SandboxExchangeHelper` sets `enableRateLimit: false`. The 429
back-off path in the ccxt layer is never exercised.

**Risk:** Production bursts that exceed exchange rate limits could cause silent
order placement failures.

**Current status (2026-03-21):** Still open, but the draft improvement was too
narrow. `PrivateStreamIngestionService.getBackoffDelayMs()` coverage helps WS
reconnect resilience, not REST/ccxt 429 handling. This gap needs either a
contract test around adapter retry/throttle behavior or a dedicated sandbox
probe that intentionally bursts requests and asserts bounded failure behavior.

### Gap 5 — WebSocket reconnection untested

**Problem:** `PrivateStreamIngestionService.runOrderWatcher()` contains a
reconnection loop with exponential back-off, but no test verifies that a
transient `watchOrders` failure is survived.

**Risk:** A single WebSocket drop could permanently stop fill ingestion for a
symbol.

**Current status (2026-03-21):** Partially closed. Unit tests in
`private-stream-ingestion.service.spec.ts` now cover immediate retry,
exponential backoff, reset after success, and cap behavior. The remaining gap
is system-level proof that the watcher recovers while attached to the real
runtime surface.

### Gap 6 — DurabilityService has zero system tests

**Problem:** The outbox/consumer-receipt pattern is the persistence guarantee
layer. No system test verifies `appendOutboxEvent` or `markProcessed`
idempotency.

**Risk:** Event loss or duplicate processing in production.

**Current status (2026-03-21):** Closed by
`server/test/system/market-making/durability/outbox-consumer-receipt.system.spec.ts`.

### Gap 7 — ReconciliationService has zero system tests

**Problem:** Three reconciliation checks (ledger invariant, reward consistency,
intent lifecycle staleness) are never exercised with known-bad data.

**Risk:** Violations could accumulate undetected in production.

**Current status (2026-03-21):** Still open. Only unit coverage exists in
`server/src/modules/market-making/reconciliation/reconciliation.service.spec.ts`.

### Gap 8 — Single exchange / single symbol only

**Problem:** Every test fixture targets one exchange and one trading pair. No
test creates concurrent orders across different pairs or exchanges.

**Risk:** Executor registry isolation bugs and cross-pair lock contention are
invisible.

**Current status (2026-03-21):** Still open.

### Gap 9 — Clock/cadence tested via direct mutation

**Problem:** `forceSessionReadyForNextTick` sets `session.nextRunAtMs =
Date.now()`. The cadence guard is never tested against a clock that drifts or
jumps.

**Risk:** Low — already indirectly covered by the ineligible-tick assertion,
but explicit far-future guard is missing.

**Current status (2026-03-21):** Still open, but likely remains a small addon
to the existing cadence sandbox spec rather than a standalone workstream.

### Gap 10 — ConfigService is a hardcoded mock

**Problem:** All config values are constants inside helpers. No test verifies
behavior under missing keys, zero values, or invalid types.

**Risk:** A misconfigured deployment could silently run with undefined spreads
or cadence.

**Current status (2026-03-21):** Partially closed. Validation is present in
`StrategyConfigResolverService.validateConfigAgainstSchema()` with unit tests.
The remaining gap is end-to-end/system verification that helper/runtime wiring
does not hide missing or malformed config values behind hardcoded mocks.

---

## Improvement Plan

### P0 — Remaining high impact, low cost (target: ~4-5 hours total)

#### 1. File-based SQLite with WAL (Gap 1)

Status: **Completed on 2026-03-20/21**.

No further action needed for this plan item beyond reusing the helper in future
high-fidelity specs when appropriate.

#### 2. ClockTickCoordinator integration spec (Gap 2)

New spec: `test/system/tick/clock-tick-single-cycle.sandbox.system.spec.ts`.

Scenario: register all four real tick components into a coordinator instance,
call `tickOnce()`, and assert that intents were generated through the full
production path. Split the work into two assertions so the signal is clear:

- **ordering path:** components run in the production registration order,
- **failure path:** one failing component is surfaced/contained according to the
  current coordinator contract.

Important note: the current implementation does **not** isolate per-component
errors inside `tickOnce()`; one thrown error aborts the loop. Decide whether to:

1. document that as current behavior and test for stop-on-first-error, or
2. change coordinator behavior first, then add the system spec.

Do not write a spec that assumes isolation unless production code is changed to
match.

Estimated effort: **2–3 hours**.

#### 3. DurabilityService system spec (Gap 6)

Status: **Completed on 2026-03-20/21**.

No further action needed unless later durability features expand the contract.

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

Recommended scope:

- assert `jobName`,
- assert the exact payload fields emitted by the controller/processor boundary,
- assert deterministic `jobId` shape for dedupe,
- assert the expected Bull options (`attempts`, backoff, removeOnComplete, etc.)
  if those are part of the intended production contract.

Estimated effort: **1 hour**.

#### 6. Back-off logic unit test (Gap 4 + Gap 5 partial)

Status: **Completed for the WS backoff portion; insufficient for Gap 4**.

The unit tests now cover the intended `watchOrders()` reconnect delay ladder.
Keep them, but do not count them as closing exchange REST rate-limit coverage.

Replacement work for Gap 4:

- add adapter-level tests around rate-limit/retry behavior when ccxt surfaces a
  429/rate-limit error, or
- add a sandbox contract test that intentionally issues a burst and asserts the
  runtime fails loudly and recoverably rather than silently dropping intents.

Estimated effort: **1–2 hours** for the remaining Gap 4 work.

#### 7. WebSocket reconnection smoke test (Gap 5)

New spec or extend `private-fill-ingestion` spec. Mock `watchOrders` to throw
on the first call and succeed on the second. Assert that
`queueAccountEvent` is eventually called after recovery.

Because the unit suite already covers the retry math, the system spec should
focus on runtime integration value:

- watcher remains attached through the real runtime/executor surface,
- recovered events still route to the correct pooled executor session,
- stop/shutdown still tears the watcher down cleanly after recovery.

Estimated effort: **1.5 hours**.

---

### P2 — Lower priority but valuable (target: ~4 hours total)

#### 8. Multi-pair executor isolation (Gap 8)

Extend `MarketMakingSingleTickHelper` to create two orders with different
pairs. Assert that each pair gets its own executor instance and that ticking
one pair does not produce intents for the other.

Requires the sandbox exchange to support a second trading pair; skip otherwise.

If a second pair is unreliable on the reference sandbox, a lower-cost fallback
is two orders on the same exchange with distinct symbols plus explicit executor
registry/session assertions.

Estimated effort: **2 hours**.

#### 9. Far-future cadence guard (Gap 9)

Add one assertion to the existing cadence spec: set `nextRunAtMs` to
`Date.now() + 999_999_999`, call `onTick`, confirm zero new intents. Minimal
effort, makes the guard explicit.

This can likely be combined with any future coordinator spec so the clock-edge
behavior is checked through the same production tick entrypoint.

Estimated effort: **30 minutes**.

#### 10. Config validation (Gap 10)

The original proposal is outdated: validation logic already exists in
`StrategyConfigResolverService.validateConfigAgainstSchema()` and already has
unit coverage.

Remaining work should instead target system/helper behavior:

- replace or parameterize hardcoded helper config mocks where they currently
  mask missing/invalid values,
- add at least one negative runtime/helper-path test for missing cadence/spread
  config,
- verify startup or tick execution fails with a clear error instead of silently
  defaulting to an unsafe value.

Estimated effort: **1–1.5 hours**.

---

## Execution Order

```
Phase 1:  ClockTickCoordinator spec/behavior decision  →  ReconciliationService
Phase 2:  queue shape contract  →  REST rate-limit behavior coverage  →  WS reconnect system smoke
Phase 3:  multi-pair isolation  →  far-future cadence guard  →  runtime misconfiguration coverage
```

## Recommended next implementation order

1. `ClockTickCoordinatorService` system coverage, after deciding whether the
   coordinator should stop on first component error or isolate failures.
2. `ReconciliationService` system coverage, because it is still fully missing.
3. Queue contract assertions, because they are cheap and stabilize the runtime
   boundary.
4. System-level private-stream reconnect smoke coverage.
5. Multi-pair isolation and cadence edge assertions.
6. Runtime/helper misconfiguration coverage.

## Completion Checklist

- [x] Gap 1 closed for the primary sandbox-heavy helper
- [ ] Gap 2 covered through the real coordinator entrypoint
- [ ] Gap 3 covered through queue contract assertions
- [ ] Gap 4 covered through adapter/sandbox rate-limit behavior tests
- [ ] Gap 5 closed at the system/runtime layer
- [x] Gap 6 closed with durability system coverage
- [ ] Gap 7 closed with reconciliation system coverage
- [ ] Gap 8 closed with multi-pair or multi-exchange isolation coverage
- [ ] Gap 9 closed with explicit far-future cadence assertion
- [ ] Gap 10 closed with runtime/helper misconfiguration coverage

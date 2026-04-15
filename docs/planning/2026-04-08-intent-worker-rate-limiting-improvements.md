# StrategyIntentWorkerService Rate-Limiting Improvements

## Status

Draft — awaiting implementation.

## Background

`StrategyIntentWorkerService` (`server/src/modules/market-making/strategy/execution/strategy-intent-worker.service.ts`) currently enforces three in-memory concurrency controls:

- `maxInFlight` — global max concurrent intents (default: 8)
- `maxInFlightPerExchange` — max per exchange (default: 1)
- `inFlightStrategyKeys` — one intent per strategy at a time (always 1)

This design has served as an initial conservative baseline. However, it suffers from five structural problems that limit throughput and resilience. This plan addresses them incrementally.

---

## Problems

### P1 — Intent type not differentiated

All intents (queries vs. mutations) share one concurrency pipeline. This forces the global limit to be set conservatively to avoid overwhelming exchanges on mutation-heavy workloads, which in turn caps query throughput unnecessarily.

### P2 — Per-exchange limit is a single flat value

All exchanges share one `maxInFlightPerExchange` setting regardless of their actual API rate limits or whether the intent is a query or a mutation. Binance tolerates ~20 mutations/s; a small CEX may tolerate only 1.

### P3 — No retry on failure

`consumeIntents` runs as a fire-and-forget async task. On failure, the error is logged and the intent is left in `NEW` status indefinitely. No `maxRetries`, no backoff, no requeue.

### P4 — In-memory state lost on restart

The three `Set`/`Map` in-flight trackers live in process memory. On graceful restart they may be cleared before all in-flight intents complete. On crash they are lost immediately. The DB has no record of which intents were in-flight, so stale intents in `NEW` status are not re-dispatched.

### P5 — No observability

No metrics, counters, or structured logs expose queue depth, processing latency, failure rate, or slot utilization. Runtime tuning is guesswork.

---

## Solution Architecture

### Layered concurrency model

Replace the flat three-key model with a two-dimensional grid: **intent-type × exchange**.

```
                        Binance    OKX    Bybit    Kraken
Query intents           20         10     15       5
Mutation intents        5          3      3       2
```

- **Query intents** (balance check, orderbook fetch, position query): high concurrency, safe to parallelize.
- **Mutation intents** (place order, cancel order, amend order): low concurrency, must respect exchange write limits.

This decouples query throughput from mutation risk. The global `maxInFlight` cap becomes a safety ceiling rather than the primary control.

### Components

1. **IntentTypeClassifier** — classifies each intent by its `type` field into `query` or `mutation`.
2. **ExchangeRateLimitRegistry** — configurable per-exchange, per-intent-type concurrency limits.
3. **InFlightTracker** — replaces the three `Set`/`Map` with a structured tracker that survives restart scanning.
4. **RetryScheduler** — failed intents are requeued with exponential backoff, up to `maxRetries`.
5. **IntentWorkerMetrics** — emits structured log lines (and optionally Prometheus counters) for observability.

---

## Detailed Design

### IntentTypeClassifier

Pure function, no state.

```typescript
const MUTATION_TYPES = new Set([
  'PLACE_ORDER',
  'CANCEL_ORDER',
  'AMEND_ORDER',
  'CANCEL_MULTIPLE',
]);

function classifyIntentType(intent: StrategyOrderIntent): 'query' | 'mutation' {
  return MUTATION_TYPES.has(intent.type) ? 'mutation' : 'query';
}
```

### ExchangeRateLimitRegistry

Reads from `configuration.ts`. Supports three tiers:

```typescript
// configuration.ts keys (with defaults):
strategy.intent_per_exchange_limits:
  {
    "default":  { "query": 20, "mutation": 5 },
    "binance":  { "query": 30, "mutation": 8 },
    "okx":      { "query": 10, "mutation": 3 },
    "bybit":    { "query": 20, "mutation": 5 },
    "unknown":  { "query": 5,  "mutation": 1 },
  }
```

Each exchange is identified by the `exchange` field on the intent. Unknown exchanges fall back to the `unknown` tier (conservative).

### InFlightTracker

Replaces the three loose collections with a single typed tracker:

```typescript
type InFlightEntry = {
  intentId: string;
  strategyKey: string;
  exchange: string;
  intentType: 'query' | 'mutation';
  dispatchedAt: Date;
};

class InFlightTracker {
  private entries = new Map<string, InFlightEntry>(); // intentId → entry

  canAcquire(exchange: string, intentType: IntentType, registry: ExchangeRateLimitRegistry): boolean { ... }
  acquire(intent: StrategyOrderIntent): void { ... }
  release(intentId: string): void { ... }

  // Called on startup to reconcile with DB:
  async reconcileWithDatabase(store: StrategyIntentStoreService): Promise<void> { ... }
}
```

`canAcquire` checks:
1. Global ceiling not exceeded (`maxInFlight` still applies as safety net)
2. Exchange + intent-type slot not at limit (via registry)

### RetryScheduler

Failed intents are not abandoned. Instead:

```typescript
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

async function handleIntentFailure(
  intentId: string,
  attempt: number,
  error: Error,
): Promise<void> {
  if (attempt >= MAX_RETRIES) {
    await store.updateIntentStatus(intentId, 'FAILED');
    logger.error(`Intent ${intentId} exhausted retries: ${error.message}`);
    return;
  }

  const backoffMs = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  logger.warn(`Intent ${intentId} failed (attempt ${attempt + 1}), retrying in ${backoffMs}ms`);
  await store.updateIntentStatus(intentId, 'RETRYING');

  setTimeout(async () => {
    await store.updateIntentStatus(intentId, 'NEW');
  }, backoffMs + jitter(1000));
}
```

The `NEW` status signals `getNextNewIntent` to pick it up again. A `retryCount` column on the intent entity tracks attempts.

### IntentWorkerMetrics

Emit structured logs on every meaningful event. Example log lines (JSON):

```json
{
  "event": "intent_dispatched",
  "intentId": "int_abc123",
  "strategyKey": "mm_btcusdt_binance",
  "exchange": "binance",
  "intentType": "mutation",
  "inFlightGlobal": 5,
  "inFlightExchange": 2
}
{
  "event": "intent_completed",
  "intentId": "int_abc123",
  "durationMs": 142,
  "inFlightGlobal": 4
}
{
  "event": "intent_failed",
  "intentId": "int_abc123",
  "attempt": 2,
  "error": "rate_limit_exceeded"
}
{
  "event": "slot_exhausted",
  "exchange": "okx",
  "intentType": "mutation",
  "limit": 3,
  "skipped": true
}
```

Optional: add `@willspec/nestjs-prometheus` counters for:
- `intent_dispatched_total{exchange, intentType, strategyKey}`
- `intent_completed_total{exchange, intentType}`
- `intent_failed_total{exchange, intentType, attempt}`
- `intent_in_flight_gauge{exchange, intentType}`

---

## File Changes

### New files

| File | Purpose |
|---|---|
| `server/src/modules/market-making/strategy/execution/intent-type.classifier.ts` | `classifyIntentType()` pure function |
| `server/src/modules/market-making/strategy/execution/exchange-rate-limit-registry.ts` | `ExchangeRateLimitRegistry` class |
| `server/src/modules/market-making/strategy/execution/in-flight-tracker.ts` | `InFlightTracker` class with reconcile method |
| `server/src/modules/market-making/strategy/execution/intent-retry-scheduler.ts` | Retry/backoff logic |
| `server/src/modules/market-making/strategy/execution/intent-worker-metrics.ts` | Structured log emitter |

### Modified files

| File | Change |
|---|---|
| `server/src/config/configuration.ts` | Add `strategy.intent_per_exchange_limits` config |
| `server/src/common/entities/market-making/strategy-order-intent.entity.ts` | Add `retryCount` column (default 0) |
| `server/src/modules/market-making/strategy/execution/strategy-intent-worker.service.ts` | Replace three `Set`/`Map` with `InFlightTracker`; wire classifier, registry, retry scheduler; emit metrics |
| `server/src/modules/market-making/strategy/execution/strategy-intent-store.service.ts` | Add `updateRetryCount()` and status transition to `RETRYING` |
| `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts` | Call `RetryScheduler` on failure instead of swallowing error |

### Test files

| File | Change |
|---|---|
| `server/src/modules/market-making/strategy/execution/strategy-intent-worker.service.spec.ts` | Add tests for: query/mutation classification, per-exchange limits, retry backoff, restart reconciliation |
| `server/src/modules/market-making/strategy/execution/intent-type.classifier.spec.ts` | New — cover all known intent types |

---

## Entity Changes

### strategy_order_intents table

Add nullable columns to `StrategyOrderIntentEntity`:

```typescript
@Column({ type: 'int', default: 0 })
retryCount: number;

@Column({ type: 'int', default: 0 })
maxRetries: number; // per-intent override (default from config)
```

Status enum gains two new states:

```typescript
enum IntentStatus {
  NEW = 'NEW',
  SENT = 'SENT',
  ACKED = 'ACKED',
  DONE = 'DONE',
  FAILED = 'FAILED',   // new — exhausted retries
  RETRYING = 'RETRYING', // new — waiting for backoff
}
```

---

## Execution Order

| Step | Scope | Depends on | Notes |
|---|---|---|---|
| 1 | Add `retryCount`/`maxRetries` columns + `FAILED`/`RETRYING` status to entity | — | DB migration needed |
| 2 | Create `intentionTypeClassifier.ts` | — | Pure function, no dependencies |
| 3 | Create `ExchangeRateLimitRegistry` + wire config | Step 1 | Config must be loaded |
| 4 | Create `InFlightTracker` | Steps 2, 3 | |
| 5 | Create `IntentRetryScheduler` | Step 1 | |
| 6 | Create `IntentWorkerMetrics` | — | No dependencies |
| 7 | Update `StrategyIntentStoreService` with retry status methods | Step 1 | |
| 8 | Refactor `StrategyIntentWorkerService` to use tracker, classifier, registry, scheduler, metrics | Steps 2-7 | Largest change |
| 9 | Update `StrategyIntentExecutionService` to delegate failure to RetryScheduler | Step 5, 7 | |
| 10 | Write/update unit tests | Steps 1-9 | |
| 11 | Manual integration test: start worker, dispatch intents, kill worker, restart — verify no lost intents | Steps 1-9 | |

Steps 2–6 are independent. Step 8 is blocked by all above. Step 9 is independent of 8 but blocked by 5 and 7.

---

## Backward Compatibility

- `NEW`, `SENT`, `ACKED`, `DONE` statuses are unchanged. Existing intents continue working.
- `retryCount` defaults to `0`; existing intents have `NULL` which is coerced to `0`.
- `maxRetries` defaults to `3` (config). Existing intents have `NULL` which is coerced to the config default.
- Config `strategy.intent_per_exchange_limits` has safe defaults — existing behavior is preserved if not configured.

---

## What Is Deliberately Out of Scope

- **Event-driven dispatch** (replacing polling with Redis pub/sub or EventEmitter) — high effort, low immediate ROI. Revisit after this plan is complete.
- **Strategy-level priority quotas** — orthogonal concern. A separate plan if starvation becomes a problem.
- **Per-endpoint rate limits** (e.g., Binance's separate limits for `/api/v3/order`, `/api/v3/account`) — would require deep integration with exchange adapters. Future work.
- **Prometheus metrics endpoint** — log-structured events are sufficient for now. Add `/metrics` route later if needed.

---

## Open Questions

1. Should `getNextNewIntent` skip intents in `RETRYING` status, or should it dequeue them and hold them in memory during the backoff period?
2. Is `maxRetries` a global config or per-strategy? Currently designed as per-intent (entity column) with global default.
3. Should the retry backoff use exchange-specific jitter to avoid thundering herd on restart?

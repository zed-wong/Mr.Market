# Private Stream Tracker — Test Plan

## Purpose

This plan defines the test coverage required to validate the `PrivateStreamTrackerService` and `PrivateStreamIngestionService` implementation. It covers unit tests for the ingestion loop, reference counting, backoff behavior, normalization, and routing isolation.

Progress is tracked inline with checklist markers. Implemented and passing items are marked `[x]`.

## Test Data Flow

```
[Exchange ws stream] → watchOrders() loop → normalizeOrders()
  → queueAccountEvent() → onTick() → extractFillCandidate()
  → routeFillCandidate() → executor.onFill() OR orphaned fill
```

## Test Files

| File | What it covers |
|------|---------------|
| `server/src/modules/market-making/trackers/private-stream-ingestion.service.spec.ts` | Ingestion loop, normalization, backoff, reference counting |
| `server/src/modules/market-making/trackers/private-stream-tracker.service.spec.ts` | Fill extraction, routing resolution, orphaned fills, account boundary |

---

## PrivateStreamIngestionService Tests

### [x] ING-1: watchOrders returns array of multiple orders

**Setup:** Mock `exchangeInitService.getExchange()` to return an exchange with `watchOrders` that resolves to an array of 3 order objects.

**Action:** Call `startOrderWatcher()` with `exchange: 'binance'`, `accountLabel: 'default'`, `symbol: 'BTC/USDT'`.

**Assert:** `queueAccountEvent` is called exactly 3 times, each with a different order payload.

### [x] ING-2: watchOrders returns single order object

**Setup:** Mock `watchOrders` to resolve to a single object (not an array).

**Action:** Call `startOrderWatcher()`.

**Assert:** `queueAccountEvent` is called exactly once with the single order payload.

### [x] ING-3: watchOrders returns null or primitive

**Setup:** Mock `watchOrders` to resolve to `null`, then `undefined`, then `123`.

**Action:** Call `startOrderWatcher()` for each case.

**Assert:** `queueAccountEvent` is never called for any of these cases. No error is thrown.

### [x] ING-4: Exchange does not support watchOrders

**Setup:** Mock `getExchange()` to return an object with no `watchOrders` function.

**Action:** Call `startOrderWatcher()`.

**Assert:** `isWatching()` returns `false` after the watcher self-stops. `queueAccountEvent` is never called. Warning log is emitted.

### [x] ING-5: First watchOrders call fails — immediate retry

**Setup:** Mock `watchOrders` to fail once with an error, then succeed with an empty array.

**Action:** Call `startOrderWatcher()`.

**Assert:** `watchOrders` is called twice. No delay is introduced before the retry. `queueAccountEvent` is called with the successful result.

### [x] ING-6: Consecutive watchOrders failures — exponential backoff

**Setup:** Mock `watchOrders` to fail 4 times consecutively, then succeed with an empty array. Mock `Date.now()` to control time.

**Action:** Call `startOrderWatcher()` and measure the delay between each retry.

**Assert:**
- 1st retry: no delay (immediate)
- 2nd retry: delay is approximately 1000ms ± 200ms
- 3rd retry: delay is approximately 2000ms ± 200ms
- 4th retry: delay is approximately 4000ms ± 200ms

### [x] ING-7: Backoff resets to immediate on success

**Setup:** Mock `watchOrders` to fail 3 times, succeed once (emitting one order), then fail again.

**Action:** Call `startOrderWatcher()` and observe retry timing.

**Assert:** After the successful call, the backoff state resets. The subsequent failure triggers an immediate retry (not 1000ms).

### [x] ING-8: Backoff caps at 30 seconds

**Setup:** Mock `watchOrders` to fail 10 times consecutively, then succeed. Mock time to advance appropriately.

**Action:** Call `startOrderWatcher()`.

**Assert:** After 5 failures (1s → 2s → 4s → 8s → 16s), the delay caps at 30s for all subsequent retries.

### [x] ING-9: Reference counting — multiple sessions share one watcher

**Setup:** Track call count of `watchOrders`.

**Action:**
1. Start watcher for session A on `binance:default`
2. Start watcher for session B on `binance:default` (same account)

**Assert:** `watchOrders` is only called once (shared watcher). Internal refcount is 2.

### [x] ING-10: Reference counting — stopping one session keeps watcher alive

**Setup:** Start two sessions on same account, refcount = 2.

**Action:** Stop watcher for session A.

**Assert:** Watcher remains alive. `watchOrders` continues being called. Refcount is 1.

### [x] ING-11: Reference counting — last session stop kills watcher

**Setup:** Start two sessions, refcount = 2. Stop session A (refcount = 1).

**Action:** Stop watcher for session B.

**Assert:** `watchOrders` loop exits. `isWatching()` returns `false`. `queueAccountEvent` is no longer called.

### [x] ING-12: Different accounts have separate watchers

**Setup:** Track call count of `watchOrders` per account.

**Action:**
1. Start watcher for `binance:default`
2. Start watcher for `binance:account2`

**Assert:** `watchOrders` is called twice (once per account). `activeWatchers` has 2 entries.

---

## PrivateStreamTrackerService Tests

### [x] TRK-1: Non-fill event is skipped

**Setup:** Inject `PrivateStreamTrackerService` with mocked downstream services.

**Action:** Queue a `balance_update` event.

**Assert:** `extractFillCandidate` returns `null`. No routing is attempted. `getOrphanedFills()` is empty.

### [x] TRK-2: Fill event without clientOrderId or exchangeOrderId is skipped

**Setup:** Inject `PrivateStreamTrackerService` with mocked downstream services.

**Action:** Queue a `fill` event with no routing identifiers.

**Assert:** `extractFillCandidate` returns `null`. No routing attempted. Orphaned fills remain empty.

### [x] TRK-3: Fill routes via clientOrderId parseable format

**Setup:** Mock `fillRoutingService.resolveOrderForFill` to return `{ orderId: 'order-1', seq: 0, source: 'clientOrderId' }`. Mock `executorRegistry.findExecutorByOrderId` to return an executor.

**Action:** Queue a fill event with `clientOrderId: 'order-1:0'`.

**Assert:** `executor.onFill` is called with `orderId: 'order-1'`. Orphaned fills are empty.

### [x] TRK-4: Fill routes via exchangeOrderId mapping fallback

**Setup:** Mock `fillRoutingService.resolveOrderForFill` to return `null` (clientOrderId not parseable). Mock `exchangeOrderTrackerService.getByExchangeOrderId` to return a tracked order for `BTC/USDT`. Mock `executorRegistry.getExecutor` to return an executor.

**Action:** Queue a fill event with `exchangeOrderId: 'ex-123'` but no `clientOrderId`.

**Assert:** `executor.onFill` is called. Orphaned fills are empty.

### [x] TRK-5: Orphaned fill when resolution fails

**Setup:** Mock `fillRoutingService.resolveOrderForFill` to return `null`. Mock `exchangeOrderTrackerService.getByExchangeOrderId` to return `undefined`.

**Action:** Queue a fill event.

**Assert:** `getOrphanedFills()` returns 1 entry with `reason: 'unresolved_order'`. Warning log is emitted.

### [x] TRK-6: Orphaned fill when executor not found

**Setup:** Mock `fillRoutingService.resolveOrderForFill` to return `{ orderId: 'order-1', seq: 0, source: 'clientOrderId' }`. Mock `executorRegistry.findExecutorByOrderId` to return `undefined`.

**Action:** Queue a fill event.

**Assert:** `getOrphanedFills()` returns 1 entry with `reason: 'missing_executor'`. Warning log is emitted.

### [x] TRK-7: Orphaned fill cap at 100 — oldest evicted

**Setup:** Queue 101 orphaned fills (each with unique orderId to avoid deduplication).

**Action:** After 101st orphan, check `getOrphanedFills()`.

**Assert:** Array length is exactly 100. The oldest orphan (index 0) is removed.

### [x] TRK-8: Account boundary — event from account A rejected when routed to account B

**Setup:** Queue a fill event with `exchange: 'binance'`, `accountLabel: 'account-A'`. Mock resolution to return an executor whose session has `userId` or account context belonging to `account-B`.

**Action:** Process the event through `onTick()`.

**Assert:** `executor.onFill` is NOT called. An orphaned fill is recorded with `reason: 'account_boundary_violation'`. Warning log includes account mismatch details.

### [x] TRK-9: ExchangeOrderTrackerService updated on fill status change

**Setup:** Mock `exchangeOrderTrackerService.getByExchangeOrderId` to return a tracked order with `status: 'open'`. Mock all routing to succeed.

**Action:** Queue a fill event with `exchangeOrderId: 'ex-1'` and `status: 'filled'`.

**Assert:** `exchangeOrderTrackerService.upsertOrder` is called with `status: 'filled'` and the event's `receivedAt`.

### [x] TRK-10: Multiple events queued before tick — processed in order

**Setup:** Queue 5 events before calling `onTick()`.

**Action:** Call `onTick()` once.

**Assert:** All 5 events are processed in FIFO order. `latestByKey` reflects the last event processed.

---

## Execution Notes

- Use `jest.useFakeTimers()` with `jest.spyOn(Date, 'now')` or `jest.useFakeTimers({ advanceTime: true })` to control time for backoff tests (ING-5 through ING-8).
- `PrivateStreamIngestionService` now exposes `getActiveWatcherCount()` and `getWatcherRefCount()` for reference counting assertions.
- `ExchangePairExecutorSession` now carries optional `accountLabel`, so account-boundary assertions no longer require reflective access or follow-up runtime plumbing.

## Status

- Created: 2026-03-18
- Updated: 2026-03-18
- Status: Implemented

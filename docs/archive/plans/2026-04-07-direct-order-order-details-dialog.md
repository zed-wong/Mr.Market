# OrderDetailsDialog — Remove Mock Data & Add Server Support

## Goal
Replace all mock/hardcoded data in `OrderDetailsDialog.svelte` with real API data. Also remove open orders and active intents sections (not actionable from the dialog).

---

## UI Cleanup (frontend only)

**File:** `interface/src/lib/components/market-making/direct/OrderDetailsDialog.svelte`

- Remove `mockFills1h` and `mockErrors` constants
- Remove open orders section (cards + empty state)
- Remove active intents section (cards + empty state)
- Remove `openOrdersCount` / `intentsCount` reactive vars
- Wire `fills_1h` from `data.fillCount1h ?? 0`
- Wire `recent errors` from `data.recentErrors ?? []`
- Remove all `mock` badges

---

## Server Changes

### 1. Fill count (last 1 hour)

**Problem:** `ExchangeOrderTrackerService` processes fills but doesn't retain a time-windowed history.

| Step | File | Change |
|------|------|--------|
| 1 | `server/.../trackers/exchange-order-tracker.service.ts` | Add `fillLog: Map<string, { ts: string; side: string; qty: string }[]>` keyed by `strategyKey`. Push entry on each detected fill. Prune entries older than 1h on each tick. |
| 2 | `server/.../trackers/exchange-order-tracker.service.ts` | Add `getFillCount(strategyKey: string, windowMs: number): number` — counts entries within window. |
| 3 | `server/.../admin-direct-mm.service.ts` | In `getDirectOrderStatus()`, call `getFillCount(strategyKey, 3600000)` → add `fillCount1h` to response. |

### 2. Recent errors (last N)

**Problem:** Errors are logged via `CustomLogger` and lost. No in-memory buffer per order.

| Step | File | Change |
|------|------|--------|
| 1 | `server/.../strategy/execution/exchange-pair-executor.ts` | Add `recentErrors: Map<string, { ts: string; message: string }[]>` keyed by `orderId`. In existing `catch` blocks, push errors. Cap at 10 per order, evict oldest on overflow. |
| 2 | `server/.../strategy/execution/exchange-pair-executor.ts` | Add `getRecentErrors(orderId: string): { ts: string; message: string }[]` getter. |
| 3 | `server/.../admin-direct-mm.service.ts` | In `getDirectOrderStatus()`, call `executor.getRecentErrors(orderId)` → add `recentErrors` to response. |

### 3. Type updates

| File | Change |
|------|--------|
| `interface/.../admin-direct-market-making.ts` | Add `fillCount1h?: number` and `recentErrors?: { ts: string; message: string }[]` to `DirectOrderStatus` |

---

## Execution Order

| Step | Scope | Depends on |
|------|-------|------------|
| 1 | Server: fill count in `exchange-order-tracker.service.ts` | — |
| 2 | Server: recent errors in `exchange-pair-executor.ts` | — |
| 3 | Server: wire both into `admin-direct-mm.service.ts` response | Steps 1-2 |
| 4 | Frontend: update `DirectOrderStatus` type | Step 3 |
| 5 | Frontend: update `OrderDetailsDialog.svelte` — remove mock data, remove open orders/intents, wire real fields | Step 4 |

Steps 1 and 2 are independent. All changes are additive — no DB schema, no new dependencies.

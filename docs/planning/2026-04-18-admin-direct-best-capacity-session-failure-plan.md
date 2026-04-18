# Admin Direct Best-Capacity Session Failure Plan

**Goal:** Fix the admin-direct `dualAccountBestCapacityVolume` launch path so a direct order with `pair` but no `symbol` can start successfully, and so failed runtime start attempts do not leave orphaned `strategy_instances` rows behind.

**Status:** Planning only. No runtime implementation in this doc.

**Date:** 2026-04-18

---

## Problem Summary

Admin direct launch for `dualAccountBestCapacityVolume` can fail with:

```text
Cannot create session for strategyKey=...: executorRegistry not available or pooledTarget unresolved
```

Observed behavior:

1. The admin direct order is created first.
2. Runtime start then fails during session creation.
3. The direct order is marked `failed`.
4. A `strategy_instances` row can remain behind with `status='running'`.
5. That orphan row is not bound to `marketMakingOrderId`, so current restore safety does not clean it up.

This is a partial-start bug, not a pure validation failure.

---

## Root Cause

### Root cause 1: pooled executor target resolution is too strict

For `volume`, `dualAccountVolume`, and `dualAccountBestCapacityVolume`, pooled session creation currently resolves the trading pair from `params.symbol` only.

That breaks older or admin-direct-persisted snapshots that carry:

- `exchangeName`
- `pair`
- no `symbol`

When `symbol` is empty:

- `resolvePooledExecutorTarget()` returns `null`
- `upsertSession()` throws
- the runtime never attaches to the pooled executor

### Root cause 2: strategy persistence happens before session attachment

`executeDualAccountBestCapacityVolumeStrategy()` currently:

1. normalizes params
2. upserts `strategy_instances`
3. then calls `upsertSession()`

If step 3 fails, the already-written `strategy_instances` row is left behind.

### Root cause 3: direct-order wrapper marks the order failed but does not roll back runtime persistence

Admin direct start catches the runtime exception and marks the `market_making_order` as `failed`, but the runtime layer does not clean up the partially created strategy row or pending activation state.

---

## Scope

### In scope

- Accept `pair` as a fallback when `symbol` is missing in volume-family runtime config
- Persist both `pair` and `symbol` for new relevant strategy rows
- Add rollback logic so failed session attachment does not leave `strategy_instances.status='running'`
- Delete a newly created `strategy_instances` row when start fails before session attachment completes
- Clear pending activation or in-memory runtime state created before the failure
- Bind admin-direct dual-account runtime rows to `marketMakingOrderId`
- Add a cleanup path for existing orphan rows created by this bug
- Add focused regression tests

### Not in scope

- Refactoring the broader strategy architecture
- Changing `dualAccountVolume` decision behavior
- Migrating unrelated historical strategy rows
- Reworking admin direct order lifecycle semantics outside this bug

---

## Required Fix Shape

This section locks in the implementation shape approved for this fix.

### 1. Normalize pair and symbol at the runtime boundary

For volume-family strategy startup:

- treat `symbol || pair` as the market identifier when resolving pooled executor targets
- normalize dual-account strategy params from `symbol || pair`
- persist both `symbol` and `pair` for new rows

This allows:

- new admin-direct starts
- persisted legacy rows with only `pair`
- restart restore for rows created before the fix

### 2. Roll back partial runtime starts

If `upsertSession()` fails after `upsertStrategyInstance()`:

- do **not** leave `strategy_instances.status='running'`
- delete a newly created row
- for an existing reused row, revert it to a non-running state that reflects failed start
- clear pending activation state
- clear any in-memory session state created during the failed attempt
- do not leave queued runtime leftovers that can break future restore

The approved preference is:

- **delete a newly created row**
- do not merely leave it in `failed` if it did not exist before this start attempt

### 3. Bind admin-direct dual-account strategies to the owning order

For admin-direct dual-account strategy rows:

- persist `marketMakingOrderId = orderId`

This lets existing restore safety check whether the parent order is still `running`.

Without this, orphan rows remain eligible for restore forever.

---

## Implementation Plan

### Task 1: Make pooled executor target resolution accept `pair`

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/strategy/config/strategy-params.types.ts`

**Work:**

- Introduce a shared helper that resolves the pair from:
  - `symbol`
  - fallback `pair`
- Use it in:
  - pooled executor target resolution
  - dual-account param normalization
  - any volume-family start-price reference lookup that still assumes `symbol` only

**Expected result:**

- session creation no longer fails when persisted config has `pair='XIN/USDT'` and `symbol=''`

---

### Task 2: Persist both `symbol` and `pair` for new rows

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`

**Work:**

- Ensure new direct-start and normalized strategy params persist:
  - `symbol`
  - `pair`
- Keep the two fields aligned for CEX volume-family strategies

**Expected result:**

- new rows do not depend on fallback-only behavior

---

### Task 3: Add rollback for partial strategy start

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`
- `server/src/modules/market-making/user-orders/market-making-runtime.service.ts`

**Work:**

- Track whether `upsertStrategyInstance()` created a new row or updated an existing one
- If `upsertSession()` throws:
  - remove pending activation entry for the strategy key
  - detach and delete any in-memory session if one was partially attached
  - delete the row if this start attempt created it
  - otherwise revert the existing row away from `running`
  - clear any queued runtime leftovers created during the failed attempt

**Expected result:**

- direct-order failure does not leave a ghost runtime row

---

### Task 4: Bind dual-account admin-direct rows to `marketMakingOrderId`

**Files likely touched:**

- `server/src/modules/market-making/user-orders/market-making-runtime.service.ts`
- `server/src/modules/market-making/strategy/strategy.service.ts`

**Work:**

- When starting admin-direct dual-account strategies, persist:
  - `marketMakingOrderId = order.orderId`
- Reuse the existing restore eligibility check so deleted / failed / stopped direct orders do not restore runtime rows

**Expected result:**

- restore path stops reviving dead admin-direct runtime rows

---

### Task 5: Clean up existing bad rows

**Files likely touched:**

- migration or one-off cleanup path, depending on team preference

**Work:**

- Identify existing `dualAccountBestCapacityVolume` rows where:
  - `status='running'`
  - `symbol` is empty
  - parent direct order is `failed`, `deleted`, or absent
- For rows still intended to survive:
  - backfill `symbol` from `pair`
  - backfill `marketMakingOrderId`
- For rows whose parent order is dead:
  - mark / delete them so they are no longer restorable

**Observed local DB shape during investigation:**

- 3 orphan rows matched this pattern
- all were `admin-direct` best-capacity rows on `mexc`
- all had `pair='XIN/USDT'` in the order snapshot
- all had empty `strategy_instances.parameters.symbol`
- all had blank `marketMakingOrderId`

---

## Validation Plan

### Unit tests

- best-capacity direct start succeeds when config has `pair` but no `symbol`
- pooled executor target resolution uses fallback `pair`
- failed `upsertSession()` deletes a newly created strategy row
- failed `upsertSession()` clears pending activation state
- failed `upsertSession()` does not leave an attached session in memory
- existing rows updated during a failed restart are reverted away from `running`
- dual-account admin-direct start persists `marketMakingOrderId`

### Integration / behavior checks

- create a new admin-direct `dualAccountBestCapacityVolume` order with `pair='XIN/USDT'`
- verify:
  - order reaches `running`
  - strategy row contains both `pair` and `symbol`
  - strategy row contains `marketMakingOrderId`
  - executor session exists
- simulate session-creation failure and verify:
  - direct order becomes `failed`
  - no orphan `running` strategy row remains
  - no session remains registered

### Startup restore checks

- seed a bound strategy row whose parent order is `deleted`
- verify restore skips or cleans it
- seed a row with `pair` only and parent order `running`
- verify restore succeeds after fallback normalization

---

## Risks

- deleting a newly created row is safer for this bug, but the rollback path must avoid deleting a pre-existing row that was only being updated
- fallback `symbol || pair` logic must stay consistent across all volume-family helpers, or restore and live start can diverge
- backfill / cleanup of existing rows must distinguish:
  - recoverable rows
  - rows whose parent direct order is already dead

---

## Decision Notes

- Keep the fix narrow and surgical.
- Do not change strategy behavior beyond startup normalization and rollback safety.
- Prefer shared helper normalization over scattered `symbol || pair` conditionals.
- Prefer deleting a newly created row on failed start over leaving a misleading `failed` runtime row that never successfully attached.

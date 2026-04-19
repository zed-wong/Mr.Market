# Private Stream Cache-Trust Plan

**Goal:** Simplify market-making private account-state handling so strategies trust a seeded local balance cache, rely on `watchBalance()` plus 60-second reconciliation to keep it fresh, and skip individual cycles when freshness is insufficient instead of fetching balances during decision-making or pausing the strategy runtime.

**Status:** Planning only. No runtime implementation in this doc.

**Date:** 2026-04-18

---

## Problem Summary

The current balance-read path is over-coordinated:

1. Strategy ticks read pair balances through per-asset cache lookups.
2. Missing base or quote keys are treated as invalid account state.
3. Tick-time reads can force `fresh-cache-only`.
4. When cache entries are missing or older than the freshness threshold, the strategy skips.
5. Recovery depends on a mix of websocket balance updates, scheduler refresh timing, and pair-level asset presence.

This creates unnecessary failure modes:

- a fresh account snapshot can still be rejected because one asset key is absent
- strategies reason about balance-cache policy instead of just reading balances
- runtime correctness depends too much on stream timing details

---

## Desired Runtime Model

### Core rule

Strategies should trust the local balance cache only.

They should **not** call `fetchBalance()` in the decision path.

### Double protection

Balance cache freshness should come from:

1. `watchBalance()` for fast live updates (primary source)
2. periodic reconciliation every `60s` as a fallback to force-refresh the cache

### Strategy behavior

At cycle time:

- if both required accounts have fresh enough balance snapshots, trade
- if either account snapshot is stale, skip only that cycle
- do **not** pause the overall strategy

---

## Target Semantics

### 1. Account-level freshness, not pair-asset freshness

Balance freshness should be tracked at the account snapshot level.

For example:

- `lastBalanceSnapshotAt(exchange, accountLabel)`
- `lastBalanceSource(exchange, accountLabel)`

The strategy should ask:

- “Is this account snapshot fresh enough?”

Not:

- “Do both pair assets explicitly exist as fresh cache entries?”

### 2. Missing asset in a fresh snapshot means zero

When an account snapshot is fresh:

- `free[asset] ?? 0`

Missing pair assets should not invalidate the snapshot.

This is the key simplification for cases like:

- fresh `USDT`
- missing `XIN`

That should resolve to:

- `USDT = cached amount`
- `XIN = 0`

not:

- “cache unavailable”

### 3. Seed once, then stream and reconcile

For every active strategy account:

1. fetch initial REST balance
2. seed the local cache
3. start `watchBalance()`
4. reconcile every `60s` as fallback

The strategy reads only the local cache after that.

Both `watchBalance()` and `fetchBalance()` return the same full-account format (`{ free, used, total }`). Both should fully overwrite the local cache via `applyBalanceSnapshot()`, clearing any assets absent from the new payload.

### 4. No decision-time REST fallback

The strategy path should not decide between:

- cache
- cache-only
- REST fallback

That policy belongs in the balance-state layer, not the strategy decision layer.

---

## Scope

### In scope

- make balance freshness account-scoped
- treat missing asset keys as zero within a fresh account snapshot
- make `applyBalanceSnapshot()` fully overwrite account cache (clear absent assets)
- route `watchBalance()` through `applyBalanceSnapshot()` directly, removing `normalizeBalance()` and balance event queue path
- keep startup balance seeding
- reconcile balances every `60s` as fallback
- remove all decision-path `fetchBalance()` calls (both `getAvailableBalancesForPair()` REST fallback and `buildTimeIndicatorActions()` direct call)
- remove `BalanceReadPolicy`, `shouldUseCachedStateOnly()`, and `strategyDecisionDepth`
- make stale cache skip a single cycle instead of breaking runtime flow
- add focused tests for missing-asset fresh snapshot behavior, snapshot overwrite behavior, and all strategy caller skip paths
- update `strategy.service.spec.ts` to remove decision-path `fetchBalance()` test dependencies

### Not in scope

- redesigning order or trade stream architecture in this plan
- changing strategy execution semantics beyond balance-read policy
- changing order reconciliation cadence
- introducing strategy pause-on-stale behavior

---

## Required Design Changes

### 1. Make `applyBalanceSnapshot()` fully overwrite account cache

When a snapshot arrives (from REST or websocket), the cache should:

- remove all existing entries for that `exchange:accountLabel`
- write only the assets present in the new payload
- track account-level snapshot timestamp and source

This ensures absent assets are implicitly zero, not stale leftovers from a previous snapshot.

### 2. Route `watchBalance()` through `applyBalanceSnapshot()`

Currently `watchBalance()` payloads are split into per-asset events via `normalizeBalance()` and written individually via `applyBalanceUpdate()`. Since `watchBalance()` returns the same full-account format as `fetchBalance()`, it should go through `applyBalanceSnapshot()` directly so it also clears absent assets.

This changes the data flow from:

```
watchBalance() → normalizeBalance() → per-asset events[] → queueAccountEvent() → flushPendingEvents() → applyBalanceUpdate() per asset
```

to:

```
watchBalance() → applyBalanceSnapshot() directly in runBalanceWatcher()
```

This means:
- `runBalanceWatcher()` calls `applyBalanceSnapshot()` directly with the raw balance object, bypassing `normalizeBalance()` and the event queue entirely for balance data
- the `kind === 'balance'` branch in `UserStreamTrackerService.flushPendingEvents()` will no longer receive balance events from `watchBalance()`
- `normalizeBalance()` is only used by `watchBalance()`, so it becomes dead code and should be removed along with `UserStreamBalanceEvent` if no other callers exist

### 3. Introduce account snapshot freshness semantics

Balance state should explicitly expose account snapshot freshness instead of inferring validity only from per-asset entries.

Needed capability:

- determine whether account `exchange:accountLabel` has a fresh balance snapshot
- return balances for any requested asset from that snapshot, defaulting missing assets to zero

### 4. Simplify strategy balance reads

Strategy balance reads should become:

- read fresh maker account snapshot
- read fresh taker account snapshot
- if either stale, return `null` and skip cycle
- otherwise return pair balances with missing assets defaulted to zero

### 5. Remove all decision-path `fetchBalance()` calls

There are two independent balance-fetch paths in strategy decision code that both need removal:

**Path A: `getAvailableBalancesForPair()` REST fallback (L5894-5933)**

`shouldUseCachedStateOnly()` already prevents REST calls during strategy ticks when `strategyDecisionDepth > 0`. The remaining work is:

- remove the `BalanceReadPolicy` type and `readPolicy` parameter from `getAvailableBalancesForPair()`
- delete the REST fallback code path (L5894-5933)
- always return `null` when cache is stale

**Path B: `buildTimeIndicatorActions()` direct `fetchBalance()` (L4856-4883)**

This is a separate code path that bypasses `getAvailableBalancesForPair()` entirely:

```
if (shouldUseCachedStateOnly()) {
  // path A: getAvailableBalancesForPair('fresh-cache-only')
} else {
  // path B: ex.fetchBalance() directly — result not written back to cache
}
```

Path B executes when `strategyDecisionDepth === 0` (e.g. API-triggered `executeMMCycle`). It must be removed. After removal, `buildTimeIndicatorActions()` should unconditionally use `getAvailableBalancesForPair()` (cache-only) and skip the cycle if cache is stale.

**`shouldUseCachedStateOnly()` removal**

With both paths eliminated, `shouldUseCachedStateOnly()` and `strategyDecisionDepth` become dead code and should be removed.

**Call sites of `getAvailableBalancesForPair()`**

All 5 call sites need the `readPolicy` parameter removed. After this change, all return `null` on stale cache. The callers already handle `null`:

| Line | Caller | Current null handling |
|------|--------|---------------------|
| 3685 | `loadDualAccountBalanceSnapshot()` maker | returns `null` → caller skips |
| 3690 | `loadDualAccountBalanceSnapshot()` taker | returns `null` → caller skips |
| 3733 | `resolveDualAccountPreferredSide()` | falls back to `resolveVolumeSide()` with no balance info |
| 3998 | `buildPureMarketMakingActions()` | passed to `quantizeAndValidateQuote()` which returns `null` → quote skipped |
| 4839 | `buildTimeIndicatorActions()` | returns `[]` → cycle skipped |

### 6. Set reconciliation cadence to 60 seconds

Periodic balance refresh is a fallback to force-refresh the cache when `watchBalance()` is silent or degraded. `60s` is sufficient since `watchBalance()` is the primary freshness source.

### 7. Keep stream updates as the primary freshness source

`watchBalance()` is the primary source of balance freshness:

- sub-second updates
- lower drift between trades
- full-account snapshots that overwrite the cache

Reconciliation is only a safety net for when the stream is silent.

---

## Implementation Plan

### Task 1: Make `applyBalanceSnapshot()` fully overwrite account cache

**Files likely touched:**

- `server/src/modules/market-making/balance-state/balance-state-cache.service.ts`

**Work:**

- before writing new entries, remove all existing entries for that `exchange:accountLabel`
- write only the assets present in the new payload
- add per-account snapshot metadata: `lastSnapshotAt`, `lastSnapshotSource`
- expose helper methods:
  - `hasFreshAccountSnapshot(exchange, accountLabel, nowMs?)`
  - `getSnapshotTimestamp(exchange, accountLabel)`
  - `getSnapshotDiagnostic(exchange, accountLabel, nowMs?)`

**Expected result:**

- a snapshot with `{ USDT: 500 }` clears a previously cached `XIN: 100`
- freshness is explicit at the account level

---

### Task 2: Route `watchBalance()` through `applyBalanceSnapshot()`

**Files likely touched:**

- `server/src/modules/market-making/trackers/user-stream-ingestion.service.ts`
- `server/src/modules/market-making/trackers/user-stream-tracker.service.ts`
- `server/src/modules/market-making/user-stream/normalizers/generic-ccxt-user-stream-event-normalizer.service.ts`
- `server/src/modules/market-making/user-stream/user-stream-event-normalizer.interface.ts`

**Work:**

- in `runBalanceWatcher()`, after `await exchange.watchBalance()`, call `this.balanceStateCacheService.applyBalanceSnapshot(exchange, accountLabel, watchedBalance, timestamp, 'ws')` directly
- remove the `normalizeBalance()` → `queueAccountEvent()` path for balance data
- remove the `kind === 'balance'` branch in `UserStreamTrackerService.flushPendingEvents()` (no balance events will flow through the queue)
- remove `normalizeBalance()` from both normalizer implementations and the interface (`UserStreamEventNormalizer`)
- remove `UserStreamBalanceEvent` type if no other callers exist

**Expected result:**

- `watchBalance()` and `fetchBalance()` both fully overwrite the account cache via `applyBalanceSnapshot()`
- balance data no longer flows through the event queue

---

### Task 3: Make pair balance reads default missing assets to zero

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

**Work:**

- refactor `getAvailableBalancesForPair()` to use account snapshot freshness
- if account snapshot is fresh:
  - base = cached base free or `0`
  - quote = cached quote free or `0`
- if account snapshot is stale:
  - return `null`

**Expected result:**

- account with fresh `USDT` and no `XIN` key becomes:
  - `XIN = 0`
  - `USDT = cached value`

---

### Task 4: Remove all decision-path `fetchBalance()` calls

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

**Work:**

**Part A — `getAvailableBalancesForPair()` cleanup:**

- remove the `BalanceReadPolicy` type (L100)
- remove the `readPolicy` parameter from `getAvailableBalancesForPair()`
- delete the REST fallback code path (L5894-5933)
- `getAvailableBalancesForPair()` always returns `null` when cache is stale
- update all 5 call sites to remove the `readPolicy` argument:
  - `loadDualAccountBalanceSnapshot()` L3685, L3690 — no readPolicy passed (already uses default)
  - `resolveDualAccountPreferredSide()` L3733 — no readPolicy passed (already uses default)
  - `buildPureMarketMakingActions()` L3998 — no readPolicy passed (already uses default)
  - `buildTimeIndicatorActions()` L4839 — remove `'fresh-cache-only'` argument

**Part B — `buildTimeIndicatorActions()` direct `fetchBalance()` removal:**

- remove the entire `if (shouldUseCachedStateOnly()) { ... } else { ... }` branching (L4838-4883)
- replace with unconditional cache-only read via `getAvailableBalancesForPair()`
- skip cycle (return `[]`) if cache is stale

**Part C — dead code cleanup:**

- remove `shouldUseCachedStateOnly()` (L5315-5318)
- remove `strategyDecisionDepth` counter and its increment/decrement sites

**Expected result:**

- no `fetchBalance()` call in any strategy decision path
- `getAvailableBalancesForPair()` is a simple cache-only read
- all callers skip gracefully on stale cache (verified: all 5 call sites already handle `null`)

---

### Task 5: Set reconciliation cadence to 60 seconds

**Files likely touched:**

- `server/src/modules/market-making/balance-state/balance-refresh-scheduler.ts`

**Work:**

- change `PERIODIC_REFRESH_MS` from `120_000` to `60_000`
- keep retry-on-stale / retry-on-silent behavior

**Expected result:**

- silent streams get corrected within 60s
- `watchBalance()` remains the primary freshness source between reconciliation cycles

---

### Task 6: Add focused regression coverage

**Files likely touched:**

- `server/src/modules/market-making/balance-state/balance-state-cache.service.spec.ts`
- `server/src/modules/market-making/trackers/user-stream-ingestion.service.spec.ts`
- `server/src/modules/market-making/strategy/strategy.balance-cache.spec.ts`
- `server/src/modules/market-making/strategy/strategy.service.spec.ts`

**Work:**

Cache layer tests (`balance-state-cache.service.spec.ts`):

- test that `applyBalanceSnapshot()` clears previously present assets absent from new payload
- test that a fresh snapshot with only quote asset returns base = `0`
- test that stale account snapshots return `null`
- test that account snapshot freshness tracks correctly

Stream ingestion tests (`user-stream-ingestion.service.spec.ts`):

- test that `watchBalance()` calls `applyBalanceSnapshot()` directly (not per-asset `applyBalanceUpdate()`)
- test that balance events no longer flow through the event queue

Strategy tests (`strategy.balance-cache.spec.ts` and `strategy.service.spec.ts`):

- test that no `fetchBalance()` is called during strategy decision execution (covers both `getAvailableBalancesForPair` and `buildTimeIndicatorActions`)
- remove or rewrite existing tests that mock `fetchBalance` for decision-path REST fallback
- remove tests for `shouldUseCachedStateOnly()` / `BalanceReadPolicy` (dead code)
- test that `buildTimeIndicatorActions()` skips cycle when cache is stale (no REST fallback)
- test that `resolveDualAccountPreferredSide()` falls back to `resolveVolumeSide()` when cache is stale
- test that `buildPureMarketMakingActions()` skips quotes when cache is stale

**Expected result:**

- balance policy is protected against future regression
- no test depends on decision-path `fetchBalance()` behavior

---

## Runtime Contract After Refactor

After this refactor, balance handling should follow this contract:

1. active strategy account starts
2. initial `fetchBalance()` seeds cache via `applyBalanceSnapshot()`
3. `watchBalance()` applies full-account snapshots via `applyBalanceSnapshot()`, clearing absent assets
4. reconciliation force-refreshes every `60s` as fallback
5. strategy reads cache only
6. stale cache skips cycle
7. fresh snapshot with missing asset key uses `0`

---

## Acceptance Criteria

- no strategy decision path calls `fetchBalance()` — including `buildTimeIndicatorActions()` path B
- `applyBalanceSnapshot()` fully overwrites account cache (clears absent assets)
- `watchBalance()` uses `applyBalanceSnapshot()` directly, not per-asset `applyBalanceUpdate()`
- `normalizeBalance()`, `UserStreamBalanceEvent`, and `kind === 'balance'` event queue branch are removed
- balance freshness is determined per account snapshot
- missing asset key in a fresh snapshot is treated as zero (this is by design — see note below)
- `BalanceReadPolicy` type, `shouldUseCachedStateOnly()`, and `strategyDecisionDepth` are removed
- reconciliation runs every `60s`
- dual-account volume skips only when account snapshots are stale, not because one asset key is absent
- all 5 `getAvailableBalancesForPair()` call sites work correctly with cache-only reads
- focused tests cover snapshot overwrite, fresh-missing-asset, stale-snapshot, and all strategy caller skip behavior
- existing `strategy.service.spec.ts` tests that depend on decision-path `fetchBalance()` are rewritten

---

## Design Note: Missing Asset as Zero

"Missing asset in a fresh snapshot = zero" is an intentional design choice, not an oversight. When an exchange does not return an asset in the balance payload (because the balance is zero), the cache will not have an entry for it. The strategy reads it as `0`.

This means there is a brief window where a newly deposited asset reads as `0` until the next `watchBalance()` event arrives with the updated balance. This is acceptable because:

- the window is typically sub-second (websocket push)
- reading `0` causes the strategy to skip (insufficient balance), which is safe
- the alternative (treating missing as "unknown" and skipping) produces the same outcome but with more complexity

---

## Risks

### Risk 1: Missing asset treated as zero hides real exchange payload bugs

Mitigation:

- keep diagnostics when a requested pair asset is absent from a fresh snapshot
- do not reject the cycle solely for that reason

### Risk 2: 60-second reconciliation leaves stale window if stream dies

Mitigation:

- `balanceStale` event triggers immediate refresh via scheduler
- retry-on-silent behavior already exists for degraded streams
- 60s gap is acceptable since `watchBalance()` is the primary freshness source

### Risk 3: Existing code may depend on per-asset freshness assumptions

Mitigation:

- change balance-read call sites carefully
- add regression tests around PMM, time-indicator, and dual-account strategies

---

## Recommended Rollout Order

1. make `applyBalanceSnapshot()` fully overwrite account cache + add account snapshot metadata
2. route `watchBalance()` through `applyBalanceSnapshot()` + remove `normalizeBalance()` and balance event queue path
3. change pair reads to use account snapshot freshness + missing-asset-zero
4. remove all decision-path `fetchBalance()` calls (both paths) + remove `BalanceReadPolicy` / `shouldUseCachedStateOnly()` / `strategyDecisionDepth`
5. change reconciliation cadence to `60s`
6. update tests (`strategy.service.spec.ts`, `strategy.balance-cache.spec.ts`, `user-stream-ingestion.service.spec.ts`, `balance-state-cache.service.spec.ts`)
7. validate on MEXC dual-account direct order flow

---

## Expected Outcome

This design gives a simpler and more robust runtime model:

- cache is authoritative
- websocket improves freshness
- reconciliation guarantees healing
- strategies stay simple
- stale state skips only the current cycle
- missing asset keys no longer cause false cache rejection

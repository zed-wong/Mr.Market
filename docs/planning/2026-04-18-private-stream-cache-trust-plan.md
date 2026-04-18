# Private Stream Cache-Trust Plan

**Goal:** Simplify market-making private account-state handling so strategies trust a seeded local balance cache, rely on `watchBalance()` plus 15-second reconciliation to keep it fresh, and skip individual cycles when freshness is insufficient instead of fetching balances during decision-making or pausing the strategy runtime.

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

1. `watchBalance()` for fast live updates
2. periodic reconciliation every `15s` for guaranteed healing

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
4. reconcile every `15s`

The strategy reads only the local cache after that.

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
- keep startup balance seeding
- reconcile balances every `15s`
- remove balance REST fetches from strategy decision paths
- make stale cache skip a single cycle instead of breaking runtime flow
- add focused tests for missing-asset fresh snapshot behavior

### Not in scope

- redesigning order or trade stream architecture in this plan
- changing strategy execution semantics beyond balance-read policy
- changing order reconciliation cadence
- introducing strategy pause-on-stale behavior

---

## Required Design Changes

### 1. Introduce account snapshot freshness semantics

Balance state should explicitly expose account snapshot freshness instead of inferring validity only from per-asset entries.

Needed capability:

- determine whether account `exchange:accountLabel` has a fresh balance snapshot
- return balances for any requested asset from that snapshot, defaulting missing assets to zero

### 2. Simplify strategy balance reads

Strategy balance reads should become:

- read fresh maker account snapshot
- read fresh taker account snapshot
- if either stale, return `null` and skip cycle
- otherwise return pair balances with missing assets defaulted to zero

### 3. Set reconciliation target cadence to 15 seconds

Periodic balance refresh must align with the trading freshness model.

If strategy freshness threshold is `15s`, reconciliation should run on that cadence so a silent stream still keeps balances usable enough for most cycles.

### 4. Keep stream updates as low-latency improvement, not correctness dependency

`watchBalance()` should remain valuable for:

- sub-second updates
- lower drift between trades

But strategy viability should no longer depend on websocket balance events being perfect.

---

## Implementation Plan

### Task 1: Extend balance-state cache with account snapshot metadata

**Files likely touched:**

- `server/src/modules/market-making/balance-state/balance-state-cache.service.ts`

**Work:**

- track per-account last snapshot timestamp and source
- update that metadata on:
  - `applyBalanceSnapshot()`
  - websocket-derived balance updates where appropriate
- expose helper methods like:
  - `hasFreshAccountSnapshot(exchange, accountLabel, nowMs?)`
  - `getSnapshotTimestamp(exchange, accountLabel)`
  - `getSnapshotDiagnostic(exchange, accountLabel, nowMs?)`

**Expected result:**

- freshness is explicit at the account level

---

### Task 2: Make pair balance reads default missing assets to zero

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

**Work:**

- refactor `getAvailableBalancesForPair()`
- stop requiring both cached asset entries to exist
- if account snapshot is fresh:
  - base = cached base free or `0`
  - quote = cached quote free or `0`
- if account snapshot is stale:
  - return `null`

**Expected result:**

- account `8` with fresh `USDT` and no `XIN` key becomes:
  - `XIN = 0`
  - `USDT = cached value`

---

### Task 3: Remove decision-path balance REST fallback logic

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

**Work:**

- remove or narrow `cache-or-rest` / `fresh-cache-only` branching for strategy-time balance reads
- keep REST refresh responsibility in:
  - startup seeding
  - background reconciliation

**Expected result:**

- strategies no longer decide how to refresh balances
- they only decide whether fresh local state is sufficient to trade

---

### Task 4: Align reconciliation cadence with freshness target

**Files likely touched:**

- `server/src/modules/market-making/balance-state/balance-refresh-scheduler.ts`

**Work:**

- reduce periodic balance reconciliation from the current long interval to `15s`
- keep retry-on-stale / retry-on-silent behavior
- verify this does not overload rate limits for active accounts

**Expected result:**

- silent streams still get corrected often enough for cache-trusting strategy logic

---

### Task 5: Add focused regression coverage

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.balance-cache.spec.ts`
- `server/src/modules/market-making/balance-state/balance-state-cache.service.spec.ts`
- `server/src/modules/market-making/balance-state/balance-refresh-scheduler.spec.ts`

**Work:**

- test that a fresh snapshot with only quote asset present returns:
  - base = `0`
  - quote = cached quote
- test that stale account snapshots still return `null`
- test that startup seeding + reconciliation preserve account snapshot freshness semantics

**Expected result:**

- balance policy is protected against future regression

---

## Runtime Contract After Refactor

After this refactor, balance handling should follow this contract:

1. active strategy account starts
2. initial `fetchBalance()` seeds cache
3. `watchBalance()` applies fast updates
4. reconciliation refreshes every `15s`
5. strategy reads cache only
6. stale cache skips cycle
7. fresh snapshot with missing asset key uses `0`

---

## Acceptance Criteria

- no strategy decision path calls `fetchBalance()` as fallback
- balance freshness is determined per account snapshot
- missing asset key in a fresh snapshot is treated as zero
- reconciliation runs every `15s`
- dual-account volume skips only when account snapshots are stale, not because one asset key is absent
- focused tests cover fresh-missing-asset and stale-snapshot cases

---

## Risks

### Risk 1: Missing asset treated as zero hides real exchange payload bugs

Mitigation:

- keep diagnostics when a requested pair asset is absent from a fresh snapshot
- do not reject the cycle solely for that reason

### Risk 2: 15-second reconciliation increases REST load

Mitigation:

- keep exchange-level rate limiting
- scope refreshes to registered active accounts only

### Risk 3: Existing code may depend on per-asset freshness assumptions

Mitigation:

- change balance-read call sites carefully
- add regression tests around PMM, time-indicator, and dual-account strategies

---

## Recommended Rollout Order

1. add account snapshot freshness metadata
2. change pair reads to use snapshot freshness + missing-asset-zero
3. remove decision-path REST fallback
4. shorten reconciliation cadence to `15s`
5. validate on MEXC dual-account direct order flow

---

## Expected Outcome

This design gives a simpler and more robust runtime model:

- cache is authoritative
- websocket improves freshness
- reconciliation guarantees healing
- strategies stay simple
- stale state skips only the current cycle
- missing asset keys no longer cause false cache rejection

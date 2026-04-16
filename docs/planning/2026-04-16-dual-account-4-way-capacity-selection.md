# Dual-Account Best-Capacity Volume Strategy

**Goal:** Introduce a new strategy type, `dualAccountBestCapacityVolume`, that runs in parallel with the existing `dualAccountVolume` strategy and uses 4-way capacity selection to choose the best executable direction × role assignment each tick.

**Why a new strategy:** This is not a safe in-place refactor. It changes selection behavior, recovery behavior, config semantics, metadata, and tests. The existing `dualAccountVolume` strategy should remain untouched so both strategies can be run side by side and compared under the same market conditions.

**Architecture principle:** Reuse the current dual-account execution pipeline wherever possible. Fork only the decision layer.

**Tech Stack:** NestJS, TypeScript, BigNumber.js

---

## Scope

### In scope

- Add a new strategy type: `dualAccountBestCapacityVolume`
- Reuse the existing dual-account maker+taker execution path
- Add a 4-way candidate selector that evaluates:
  - buy, configured roles
  - buy, swapped roles
  - sell, configured roles
  - sell, swapped roles
- Select the **best executable** candidate, not just the highest raw capacity
- Keep standalone rebalance for the new strategy as an initial fallback
- Add strategy-specific tests
- Add docs for the new strategy

### Not in scope

- Removing or changing `dualAccountVolume`
- Removing `dynamicRoleSwitching`, `postOnlySide`, `buyBias`, or rebalance from the old strategy
- Migrating existing orders or sessions automatically
- Deleting old tests or old docs

---

## Why This Shape

The old strategy has these behaviors today:

1. Choose a preferred side
2. Try the preferred side
3. Fallback to the opposite side
4. Optionally switch maker/taker roles
5. If neither paired side works, try a standalone rebalance IOC

The new strategy should test a different decision model:

1. Build all 4 paired candidates up front
2. Rank them by capacity
3. Try them in order until one is fully executable
4. If none are executable, try the existing rebalance fallback

That gives you a real A/B:

- `dualAccountVolume`: existing behavior
- `dualAccountBestCapacityVolume`: best-capacity behavior

This is the safe way to learn.

---

## Decision Model

### Candidate matrix

| #   | Side | Maker account    | Taker account    |
| --- | ---- | ---------------- | ---------------- |
| 1   | buy  | configured maker | configured taker |
| 2   | buy  | configured taker | configured maker |
| 3   | sell | configured maker | configured taker |
| 4   | sell | configured taker | configured maker |

### Raw capacity formula

For each candidate:

- `buy`: `min(maker.quote / price * retainFactor, taker.base)`
- `sell`: `min(maker.base, taker.quote / price * retainFactor)`

### Important rule

Do **not** pick the best raw-capacity candidate and stop there.

Each candidate must still pass:

- active-hours profile check
- requested qty computation
- exchange minimums / maximums
- quantization
- maker price normalization
- final quantized capacity check

So the selector must choose the **best executable candidate**.

### Selection pipeline

```text
build 4 candidates
  -> compute raw capacity for each
  -> drop zero / invalid capacity
  -> sort by capacity descending
  -> evaluate each candidate through the existing execution checks
       -> first executable candidate wins
  -> if none executable
       -> use existing rebalance fallback
  -> if rebalance also fails
       -> skip tick
```

---

## Execution Diagram

```text
dualAccountBestCapacityVolume tick
    |
    v
load tracked best bid/ask
    |
    v
load dual-account balance snapshot
    |
    v
build 4 paired candidates
    |
    v
rank by raw capacity desc
    |
    v
try candidate 1
    |
    +--> executable? yes -> publish maker intent -> existing taker flow
    |
    +--> no
          |
          v
        try candidate 2
          |
          +--> executable? yes -> publish maker intent -> existing taker flow
          |
          +--> no
                |
                v
              try candidate 3 / 4
                |
                +--> none executable
                      |
                      v
                existing rebalance fallback
                      |
                      +--> rebalance action found -> publish IOC rebalance
                      |
                      +--> none -> skip tick
```

---

## Implementation Plan

### Task 1: Add a new strategy type and routing

**Files likely touched:**

- `server/src/modules/market-making/strategy/...` strategy type/controller/service routing files
- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- relevant DTO / enum / config files

**Work:**

- Add `dualAccountBestCapacityVolume` as a new strategy type
- Route it through the same session/execution machinery used by dual-account strategies
- Keep persistence and admin surfaces explicit, do not overload `dualAccountVolume`

**Design constraint:**

Prefer adding a new branch in the existing strategy dispatch over introducing a new service unless the current service becomes unreadable.

---

### Task 2: Reuse the current dual-account execution path

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

**Work:**

- Extract or reuse the current dual-account action-building flow so both strategies can share:
  - market data loading
  - fee buffer resolution
  - quote quantization/adaptation
  - maker intent creation
  - existing inline taker execution path
  - rebalance fallback

**Target shape:**

```text
buildDualAccountVolumeActions(...)
buildDualAccountBestCapacityVolumeActions(...)
    -> both call shared helpers
```

Do not duplicate the whole method if the diff can stay clean with one shared helper layer.

---

### Task 3: Add 4-way candidate building helpers

**Files:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

**Add helpers:**

- `buildDualAccountBestCapacityCandidates(...)`
- `resolveBestExecutableDualAccountCandidate(...)`

Suggested candidate shape:

```typescript
type DualAccountBestCapacityCandidate = {
  side: "buy" | "sell";
  makerAccountLabel: string;
  takerAccountLabel: string;
  makerBalances: DualAccountPairBalances;
  takerBalances: DualAccountPairBalances;
  capacity: BigNumber;
};
```

**Selection rule:**

- build candidates from one balance snapshot
- filter `capacity > 0`
- sort descending using `capacity.comparedTo(...)`
- evaluate candidates one by one through the existing execution checks
- return the first fully executable candidate

Do not use `.toNumber()` for BigNumber comparison.

---

### Task 4: Add a strategy-specific action builder

**Files:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

Add:

- `buildDualAccountBestCapacityVolumeActions(...)`

Flow:

1. Load order book
2. Validate spread / price
3. Load one dual-account balance snapshot
4. Build and rank 4 candidates
5. Resolve the best executable candidate
6. If found, publish a normal maker action using existing intent flow
7. If none found, call the existing rebalance fallback
8. If rebalance also fails, return `[]`

**Important:** Reuse existing helpers for:

- profile resolution
- active-hours check
- qty variance
- quantization and adaptation
- maker price normalization
- intent creation

Do not fork those unless the new strategy actually needs different behavior.

---

### Task 5: Add strategy-specific metadata and logs

**Files:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

For the new strategy, add metadata/log fields that make side-by-side comparison easy:

- `selectionModel: 'best_capacity'`
- `candidateRank`
- `candidateCount`
- `buyCapacityConfigured`
- `sellCapacityConfigured`
- `buyCapacitySwapped`
- `sellCapacitySwapped`
- `selectedCapacity`
- `selectedMakerAccountLabel`
- `selectedTakerAccountLabel`
- `rebalanced: boolean`

Keep the old strategy’s metadata unchanged.

This matters because the whole point of the parallel strategy is observability.

---

### Task 6: Keep rebalance for the new strategy

**Files:**

- `server/src/modules/market-making/strategy/strategy.service.ts`

Do **not** remove:

- `maybeBuildDualAccountRebalanceAction`
- rebalance metadata
- rebalance publish semantics

For `dualAccountBestCapacityVolume`, rebalance remains the final fallback when all paired candidates are non-executable.

That preserves a known recovery behavior while testing the new selection model.

---

### Task 7: Admin and config plumbing

**Files likely touched:**

- admin DTO / strategy DTO files
- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- any strategy config enum/type files

**Approach:**

Start by reusing the same config surface as dual-account volume wherever possible:

- `makerAccountLabel`
- `takerAccountLabel`
- `makerDelayMs`
- `baseTradeAmount`
- variances
- account profiles
- target volume / counters

For v1 of the new strategy:

- do not delete `postOnlySide`, `buyBias`, or `dynamicRoleSwitching` from shared DTOs
- either ignore them for the new strategy, or reject them explicitly with validation if that is cleaner

Recommendation:

- keep them accepted but unused for the new strategy in v1
- document that this strategy uses capacity-based selection instead

That is the smallest diff.

---

### Task 8: Tests

**Files likely touched:**

- `server/src/modules/market-making/strategy/strategy.service.spec.ts`
- `server/src/modules/admin/market-making/admin-direct-mm.service.spec.ts`
- `server/test/system/market-making/user-orders/admin-direct-dual-account-volume.sandbox.system.spec.ts`
- or a new best-capacity system spec if that is cleaner

### Required coverage

```text
CODE PATH COVERAGE
===========================
[+] dualAccountBestCapacityVolume
    |
    ├── best candidate is executable
    ├── top raw-capacity candidate fails activeHours, next candidate wins
    ├── top raw-capacity candidate fails exchange minimums, next candidate wins
    ├── top raw-capacity candidate fails quantization, next candidate wins
    ├── all paired candidates fail, rebalance action is emitted
    ├── all paired candidates fail, rebalance also fails, tick is skipped
    ├── configured-role candidate wins
    └── swapped-role candidate wins

[+] regression protection for existing dualAccountVolume
    |
    ├── fallback-side behavior unchanged
    ├── rebalance-only publish semantics unchanged
    └── old strategy metadata unchanged
```

### Must-have tests

1. Unit test, best-capacity strategy chooses configured buy candidate when it is executable and largest.
2. Unit test, best-capacity strategy chooses swapped-role candidate when it has higher executable capacity.
3. Unit test, highest raw-capacity candidate is skipped because maker account is outside active hours, second candidate is chosen.
4. Unit test, highest raw-capacity candidate is skipped because quantization/exchange minimums reject it, second candidate is chosen.
5. Unit test, no paired candidate is executable and rebalance IOC is emitted.
6. Unit test, no paired candidate is executable and rebalance also fails, returns `[]`.
7. Regression test, existing `dualAccountVolume` fallback-side behavior remains unchanged.
8. Regression test, existing rebalance-only publish semantics remain unchanged.
9. Admin/config test, new strategy type is routed and serialized correctly.

### System test

Add one system path for the new strategy, separate from the old one. Do not mutate the existing system spec into covering both behaviors implicitly.

---

### Task 9: Docs

**Files:**

- `docs/architecture/strategies/dual-account-volume.md`
- `docs/architecture/strategies/dual-account-best-capacity-volume.md` or an equivalent new doc
- `docs/planning/progress-log.md`
- optionally `docs/architecture/server/module-map.md` if strategy routing changes materially

**Doc rule:**

Do not overwrite the current dual-account strategy doc with the new behavior. Add a new architecture doc for the new strategy.

Suggested sections:

- purpose
- how it differs from `dualAccountVolume`
- candidate matrix
- best-executable selection pipeline
- rebalance fallback
- observability fields for A/B comparison

---

### Task 10: Verification

**Commands:**

```bash
cd server && bun run build
cd server && bun run test:unit
cd server && bun run test:system -- --testPathPattern="dual-account"
```

### Manual verification checklist

- Start one `dualAccountVolume` order and one `dualAccountBestCapacityVolume` order on comparable markets
- Confirm old strategy logs still show old decision semantics
- Confirm new strategy logs show `selectionModel=best_capacity`
- Confirm new strategy can pick swapped maker/taker labels across ticks
- Confirm new strategy tries rebalance only after all paired candidates fail
- Confirm old strategy rebalance behavior is unchanged

### Comparison metrics to watch

- published cycles
- completed cycles
- skipped ticks
- rebalance count
- selected side distribution
- selected role distribution
- traded quote volume
- realized pnl / fee drag if available

---

## Minimal Diff Strategy

This plan should be implemented with the fewest new abstractions possible.

Good:

- one new strategy type
- one new action builder
- one or two small helper functions for candidate building/selection
- shared execution helpers reused

Bad:

- a whole new service tree
- duplicated quantization logic
- duplicated rebalance logic
- deleting the old strategy while introducing the new one

---

## Risks

### Risk 1: best raw capacity is not best executable

Mitigation:

- rank candidates by capacity
- validate them in order
- first executable candidate wins

### Risk 2: hidden regression in old strategy

Mitigation:

- keep old strategy untouched
- add explicit regression tests

### Risk 3: new strategy looks better in logs but worse in real output

Mitigation:

- emit comparison-friendly metadata
- run both strategies in parallel
- compare skipped ticks, rebalance count, and completed cycles

### Risk 4: config/API confusion

Mitigation:

- use a separate strategy type name everywhere
- keep old config untouched
- document which fields are ignored by the new strategy

---

## Worktree Parallelization

| Step                        | Modules touched                              | Depends on |
| --------------------------- | -------------------------------------------- | ---------- |
| Add strategy type + routing | `strategy/`, `admin/`, config DTO/types      | —          |
| Add best-capacity selector  | `strategy/`                                  | routing    |
| Add tests                   | `strategy/`, `admin/`, `server/test/system/` | selector   |
| Add docs                    | `docs/architecture/`, `docs/planning/`       | selector   |

Parallel lanes:

- Lane A: strategy type + routing -> selector -> logs
- Lane B: docs, after naming and behavior are stable
- Lane C: tests, after selector shape is stable

Execution order:

- Launch docs in parallel once the final name and behavior are locked
- Keep implementation and tests mostly sequential because they both center on the strategy module

Conflict flags:

- `strategy.service.ts` is the hot file, do not split multiple workers across it without careful coordination

---

## Recommendation

Build `dualAccountBestCapacityVolume` as a new strategy, keep `dualAccountVolume` unchanged, and preserve rebalance in v1.

That gives you:

- a clean experiment
- low rollback cost
- grounded comparison data
- minimal regression risk

That is the right first version.

---

## GSTACK ENG REVIEW REPORT

**Reviewer:** plan-eng-review | **Branch:** main | **Date:** 2026-04-16 | **Status:** DONE_WITH_CONCERNS

### Review Summary

The plan is well-structured for a parallel strategy experiment. The decision model is sound, the scope is tight, and the test coverage plan is thorough. Four concerns need resolution before implementation.

### Findings

| #   | Severity | Confidence | Location                   | Description                                                                                                                                                                                                            | Resolution                                                                                    |
| --- | -------- | ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | P1       | 9/10       | Task 3                     | New helpers must implement capacity formula independently (not delegate to computeDualAccountCapacity). User chose self-contained helpers because the old strategy will be removed once the new one proves itself.     | **Accepted: implement capacity formula inline in buildDualAccountBestCapacityCandidates**     |
| 2   | P1       | 8/10       | Task 4                     | evaluateDualAccountExecutionForSide cannot be called with pre-resolved accounts (it resolves accounts internally with dynamic role switching). Need a separate evaluateDualAccountExecutionForSideWithAccounts method. | **Accepted: add separate method**                                                             |
| 3   | P2       | 8/10       | Task 7                     | Config fields (dynamicRoleSwitching, postOnlySide, buyBias) accepted but silently ignored. Usability trap for operators.                                                                                               | **Accepted: add one-time log warning on first tick when ignored fields are set**              |
| 4   | P2       | 9/10       | strategy.service.ts:99-201 | DualAccount types are duplicated in strategy.service.ts inline. New DualAccountBestCapacityCandidate type must go in strategy-params.types.ts, not inline.                                                             | **Action: place new type in strategy-params.types.ts**                                        |
| 5   | P2       | 7/10       | Task 3                     | Candidate type is intermediate (raw capacity ranking). The selector's output should be a DualAccountExecutionPlan, not a candidate. Plan should clarify the selector returns an execution plan.                        | **Action: clarify selector returns DualAccountExecutionPlan or null**                         |
| 6   | P3       | 5/10       | plan lines 84-110          | No tiebreaker rule when two candidates have equal raw capacity. Needed for determinism and debugging.                                                                                                                  | **Action: add tiebreaker rule (e.g., configured > swapped, buy > sell)**                      |
| 7   | P2       | 7/10       | Task 4                     | All 4 candidates must use the same balance snapshot. Execution diagram should make this explicit.                                                                                                                      | **Action: add note "single balance snapshot used for all 4 candidates" to execution diagram** |
| 8   | P2       | 7/10       | Task 4                     | Rebalance fallback must call maybeBuildDualAccountRebalanceAction directly. Plan implies this but should be explicit.                                                                                                  | **Action: make rebalance delegation explicit in action builder flow**                         |
| 9   | P2       | 7/10       | performance                | 4x validation calls per tick (vs 2x for old strategy). Acceptable because short-circuit on first executable. Worst case adds ~100-400ms.                                                                               | **Noted: verify exchange connector caches precision/min/max rules**                           |

### Additional Tests (beyond plan's 9)

| #   | Test                                                              | Priority | Why                                                              |
| --- | ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| 10  | Null balance snapshot returns []                                  | High     | Critical edge case                                               |
| 11  | All 4 candidates have zero raw capacity -> rebalance fallback     | High     | Different from "all fail validation"                             |
| 12  | Tiebreaker determinism (equal capacity on both accounts)          | High     | Must be deterministic for debugging                              |
| 13  | Price normalization failure on top candidate, next candidate wins | Medium   | Plan lists this check but no test                                |
| 14  | Behavior profile not found for swapped role -> candidate skipped  | Medium   | Swapped roles may reference accounts without configured profiles |
| 15  | Warning log on first tick when ignored config fields are set      | Medium   | Validates Finding 3                                              |

### Architecture Decisions Made

1. **New helpers are self-contained** (not delegating to computeDualAccountCapacity). Rationale: old strategy will be removed, so no long-term dependency.
2. **Separate evaluateDualAccountExecutionForSideWithAccounts method** (not extending existing method). Rationale: self-contained, becomes standard when old strategy is removed.
3. **Log warning for ignored config fields** (not silent accept). Rationale: prevents operator confusion.
4. **All 6 missing edge case tests added to plan** (not just 3 critical ones). Rationale: near-zero cost with CC, prevents subtle bugs.

### NOT in scope for this PR (tracked for later)

- Extract strategy.service.ts (6032+ lines) into separate services once old strategy is removed
- Remove old dualAccountVolume strategy (wait for production data from parallel run)

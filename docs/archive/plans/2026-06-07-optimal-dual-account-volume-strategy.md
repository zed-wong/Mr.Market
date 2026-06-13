# Optimal Dual Account Volume Strategy

## Plan Date: 2026-06-07

---

## Part 1: The Optimal Volume Strategy Design

### Goal

Design the mathematically optimal dual-account volume strategy with one objective:

> Use the least capital, produce the most volume, run as long as possible without manual intervention.

### Core Model

Two exchange accounts trade with each other in a closed loop. Assets rotate between accounts. Each cycle costs taker fee (0.1% on MEXC, maker fee is 0%). The strategy terminates only when total system value is eroded below `2 × costMin` by fee drag.

```
╭──────────────╮    cycle N (A buy)     ╭──────────────╮
│ Account A    │ ──────────────────────▶ │ Account B    │
│ spends USDT  │                         │ spends XIN   │
╰──────┬───────╯                         ╰──────┬───────╯
       │                                         │
       │   cycle N+1 (A sell) — natural reversal │
       ▼                                         ▼
╭──────────────╮    cycle N+1 (A sell)  ╭──────────────╮
│ Account A    │ ◀──────────────────── │ Account B    │
│ spends XIN   │                         │ spends USDT  │
╰──────────────╯                         ╰──────────────╯
```

### Key Principles

1. **Maximize cycle count, not cycle size.** Total volume = sum of all cycle notionals. More smaller cycles > fewer larger cycles.
2. **No rebalance.** Rebalance wastes fee and is unnecessary — assets naturally rotate between accounts through alternating cycles.
3. **Free direction choice.** No forced alternation. The algorithm picks whichever direction has the highest volume score, subject to the sustainable constraint. This naturally tends toward alternation because buy increases sell capacity and vice versa.
4. **One-step lookahead sustainable constraint.** Every cycle guarantees the reverse direction remains feasible at the next tick. By induction, the system never stops prematurely.
5. **Ledger is source of truth.** All balance reads are order-scoped from ledger. Reservation before every order placement.

### Algorithm (Per Tick)

```
1. Read ledger available balances (order-scoped) for both accounts
2. Get tracked order book best bid/ask
3. Build 4 candidates: buy/sell × configured/swapped account roles
4. For each candidate (side, makerAccount, takerAccount):
   a. maxQty = min(maker can provide, taker can provide)
   b. Simulate post-cycle balances:
      - Maker: 0% fee (MEXC maker fee = 0)
      - Taker: receives amount × (1 - takerFeeRate)
   c. Check reverse direction feasibility at post-cycle balances:
      - reverseNotional >= costMin × (1 + PRICE_SAFETY_MARGIN)
      - reverseQty >= amountMin (using truncated precision values)
   d. If not feasible → shrink qty until feasible (analytical solution)
   e. sustainableQty = largest qty satisfying the constraint
   f. effectiveQty = min(sustainableQty, maxOrderAmount)
   g. If effectiveQty < amountMin OR effectiveQty × price < costMin → invalid
   h. score = effectiveQty × price (volume this cycle)
5. Pick the highest-scoring valid candidate
6. No valid candidate → stop strategy (graceful termination)
7. Emit maker intent (limit, postOnly) with cycle metadata
```

### Sustainable Constraint — Analytical Solution

For side=buy, maker=A, taker=B, qty=q, price=p, takerFee=f:

```
Post-cycle balances:
  A.base' = A.base + q
  A.quote' = A.quote - q × p
  B.base' = B.base - q
  B.quote' = B.quote + q × p × (1 - f)

Reverse (A sell) feasibility:
  A.base' >= amountMin → q >= amountMin - A.base  (usually trivially satisfied)
  B.quote' × reverseQty... simplified to:
  
  reverseMaxQty = min(A.base + q, B.quote + q×p×(1-f)) / p × (1-f))
  reverseNotional = reverseMaxQty × p
  
  Constraint: reverseNotional >= costMin × (1 + PRICE_SAFETY_MARGIN)

Solving for max q (the sustainable upper bound):
  This is a linear constraint in q → direct algebraic solution, no iteration needed.
```

For side=sell, the constraint is symmetric (swap base/quote roles).

### Lifecycle

```
Start:   qty ≈ maxOrderAmount (full speed)
Middle:  qty gradually shrinks as fee erodes total system value
End:     qty = amountMin (minimum cycles continue)
Stop:    sustainableQty < amountMin — graceful termination
```

The strategy degrades gracefully instead of hitting a wall.

### Minimum Starting Requirement

Not "balanced accounts" — just one valid candidate:

```
One account has base >= amountMin AND base × price >= costMin
The OTHER account has quote >= costMin
(or the reverse: one has quote, other has base)
```

For MEXC XIN/USDT (costMin ≈ 1 USDT): minimum ~2 USDT equivalent total to start.

Recommended: equal split (X/2 value base on one side, X/2 value quote on other).

### Edge Case Handling

| Issue | Solution | Impact on core algorithm |
|-------|----------|--------------------------|
| Third-party fills maker | Algorithm reads actual balances next tick, naturally adapts direction | None — immune by design |
| Price volatility | `PRICE_SAFETY_MARGIN = 0.15` in sustainable constraint | One constant |
| Maker queue priority | Taker uses limit IOC at exact maker price | Execution layer only |
| Tracked order blocking | 15s timeout → cancel → re-evaluate next tick | ~5 lines in tick guard |
| Precision dust | Sustainable calculation uses `truncateToExchangePrecision` values | ~2 lines |

### Fee Model (MEXC)

- Maker fee: 0% → maker side loses nothing
- Taker fee: 0.1% → only loss per cycle
- Per-cycle cost: `notional × 0.001`
- Theoretical max cycles from capital X: `X / (avgNotional × 0.001)`
- Example: 10 USDT total capital, 1 USDT avg notional → ~10,000 cycles → 10,000 USDT volume

### What This Strategy Does NOT Do

- No rebalance (wasteful)
- No preferred side / buyBias (algorithm decides optimally)
- No fixed alternation pattern (free choice naturally alternates)
- No multi-step lookahead (one step sufficient by induction)
- No separate readiness service for runtime (sustainable constraint IS the runtime readiness check)
- No cycle size increase over time (only decrease as fees erode)

---

## Part 2: Comparison With Current Efficient Dual Account Volume

### Architecture Comparison

| Dimension | Current Efficient | Optimal |
|-----------|------------------|---------|
| Candidate evaluation | 4 candidates, score-ranked | 4 candidates, score-ranked |
| Scoring formula | `quoteVolume×w1 + futureCapacity×w2 + targetProgress×w3 - fees - spread - rebalanceRisk - dustRisk` | `effectiveQty × price` (pure volume, constraints handle safety) |
| Direction choice | Free (best score) | Free (best score) |
| Sustainable guarantee | None — hopes future capacity is enough | **Enforced** — every cycle mathematically guarantees next cycle |
| Rebalance | Has rebalance logic, schedules rebalance actions | **Removed entirely** |
| Cycle sizing | Fixed `maxOrderAmount` or capacity-limited | **Dynamic** — shrinks to maximize total cycles |
| Mode system | 3 modes with weight tables (cheapest_capital, balanced, fastest_volume) | **Single optimal behavior** — no modes needed |
| Safety buffer | Formula-based: `max(costMin×0.5, notional×fees×2)` | `costMin × (1 + PRICE_SAFETY_MARGIN)` — simpler, directly tied to the real risk |
| Timeout handling | Waits indefinitely for tracked orders | **15s timeout → cancel → retry** |
| Precision handling | Standard BigNumber | **Truncated precision** in sustainable calc |
| Readiness check | Separate `evaluateEfficientDualAccountReadiness` method | **Same algorithm** — if no valid candidate at start, report missing balances |
| Termination | numTrades limit, targetQuoteVolume limit, or balance failure | **Only** when sustainableQty < amountMin (natural death) |
| postOnlySide / buyBias | Not used (inherited from config but ignored) | **Removed from config** — algorithm decides |
| dynamicRoleSwitching | Always true | **Implicit** — 4 candidates already cover all role assignments |
| cycleMode (alternating/static) | alternating | **Removed** — free choice replaces forced alternation |

### What Current Efficient Gets Right

1. Best-capacity 4-candidate evaluation — correct foundation.
2. Readiness check before start — good UX (keep it).
3. Cycle metadata (cycleId, maker/taker roles) — good observability (keep it).
4. Order-scoped ledger balance reads — correct architecture (keep it).
5. Reservation before order placement — correct invariant (keep it).

### What Current Efficient Gets Wrong

1. **No sustainable guarantee.** Scores candidates by future capacity as a soft weight, but never enforces "next cycle MUST be feasible." Result: can pick a large cycle that strands funds.
2. **Complex scoring with 6 weight dimensions.** Hard to reason about, hard to tune, and the weights are arbitrary. The optimal strategy needs ONE constraint (sustainable) and ONE score (volume). Simpler = more robust.
3. **Rebalance as fallback.** Rebalance burns fee and often fails (notional < costMin). Should never exist.
4. **Fixed cycle size.** Uses `maxOrderAmount` as the target, only reduces when capacity forces it. Should proactively reduce to keep next cycle alive.
5. **Mode system (3 modes).** Adds complexity without value. "Cheapest capital" and "fastest volume" are the SAME thing when you have the sustainable constraint — maximizing each cycle's volume while guaranteeing continuity IS both cheapest capital and fastest volume simultaneously.
6. **No maker timeout.** If maker order hangs, strategy blocks indefinitely.

### Scoring Simplification

Current:
```
score = quoteVolume × volumeWeight
      + nextCycleQuoteCapacity × futureCapacityWeight
      + targetProgressQuote × 0.3
      - estimatedFeeQuote × feeCostWeight
      - estimatedSpreadCostQuote × spreadCostWeight
      - rebalanceRiskQuote × rebalancePenaltyWeight
      - dustRiskQuote × dustPenaltyWeight
```

Optimal:
```
score = sustainableQty × price
```

Why the simplification works: the sustainable constraint already encodes "future capacity must be sufficient" and "no dust risk" and "no rebalance needed." These don't need to be soft penalties in a score — they are hard constraints. Once constraints are satisfied, the only remaining objective is maximizing volume.

---

## Part 3: Migration Plan — Efficient → Optimal

### Approach

Modify `efficientDualAccountVolume` in-place. Do not create a new strategy contract. The efficient strategy IS the product strategy; we make it optimal.

### Changes Required

#### 3.1 DualAccountPlannerService — New Method

Add `buildOptimalDualAccountVolumeActions(strategyKey, params, ts)`:

```typescript
async buildOptimalDualAccountVolumeActions(
  strategyKey: string,
  params: DualAccountVolumeStrategyParams,
  ts: string,
): Promise<ExecutorAction[]> {
  // 1. Fresh order book check
  // 2. Load balance snapshot
  // 3. Build 4 candidates with sustainable constraint
  // 4. Pick highest volume candidate
  // 5. Emit maker intent
}
```

Core new logic — `computeSustainableQty`:

```typescript
computeSustainableQty(
  side: 'buy' | 'sell',
  makerBalances: DualAccountPairBalances,
  takerBalances: DualAccountPairBalances,
  price: BigNumber,
  takerFeeRate: BigNumber,
  costMin: BigNumber,
  amountMin: BigNumber,
  amountPrecision: number,
  priceSafetyMargin: BigNumber,  // 0.15
): BigNumber {
  const sustainableMinNotional = costMin.multipliedBy(
    new BigNumber(1).plus(priceSafetyMargin),
  );

  if (side === 'buy') {
    // After buy q: A.base'=A.base+q, B.quote'=B.quote+q*price*(1-fee)
    // Reverse (sell): needs A.base' >= amountMin AND reverse notional >= sustainableMinNotional
    // Reverse capacity = min(A.base+q, (B.quote+q*p*(1-f))/p)
    // Reverse notional = reverseCapacity * price >= sustainableMinNotional
    // Solve for max q such that EVEN IF we use all of q,
    // the reverse still works. Since buy INCREASES reverse capacity,
    // the constraint is actually on the OTHER direction (same direction again):
    // Same direction next: needs taker.base-q >= amountMin AND (maker.quote - q*p) >= costMin
    // → q <= taker.base - amountMin
    // → q <= (maker.quote - sustainableMinNotional) / price
    
    const maxByTakerBase = takerBalances.base.minus(amountMin);
    const maxByMakerQuote = makerBalances.quote
      .minus(sustainableMinNotional)
      .dividedBy(price);
    
    // Also ensure reverse is feasible (always true for buy since it increases reverse capacity)
    // But check: after this buy, can we do a SELL next?
    // Sell needs: maker(=taker_current).base >= amountMin → taker.base - q >= amountMin (WAIT - roles swap)
    // Actually with free direction, we need AT LEAST ONE direction feasible.
    // Buy increases sell capacity, so sell is always feasible after buy.
    // The binding constraint is: don't deplete maker.quote below sustainableMinNotional
    // (so same-direction buy remains feasible) OR taker.base below amountMin.
    // But we don't need same-direction — we need ANY direction.
    // Since sell is always feasible after buy, the only real constraint is:
    // reverse (sell) notional >= sustainableMinNotional after truncation.
    
    const postBase = truncate(makerBalances.base.plus(maxByTakerBase), amountPrecision);
    const postQuote = takerBalances.quote.plus(
      maxByTakerBase.multipliedBy(price).multipliedBy(new BigNumber(1).minus(takerFeeRate))
    );
    const reverseCapacity = BigNumber.min(postBase, postQuote.dividedBy(price));
    const reverseNotional = truncate(reverseCapacity.multipliedBy(price), 2);
    
    if (reverseNotional.isGreaterThanOrEqualTo(sustainableMinNotional)) {
      // Full capacity is sustainable
      return BigNumber.min(maxByTakerBase, maxByMakerQuote.isPositive() ? maxByMakerQuote : maxByTakerBase);
    }
    
    // Binary search or solve algebraically for exact max q
    // ... (simplified: reduce q until reverse is feasible)
  }
  
  // Symmetric for sell
}
```

#### 3.2 Remove Rebalance Path

In the new method, **never emit rebalance actions**. If no candidate is valid → return `[]` → strategy stops gracefully.

Remove from `efficientDualAccountVolume` path:
- `maybeBuildDualAccountRebalanceAction` calls
- `repairRequired` / `repairReason` state handling
- Rebalance-related metadata

#### 3.3 Remove Mode System

- Remove `MODE_AWARE_BEST_CAPACITY_WEIGHTS` usage for efficient strategy
- Remove `mode` field from the efficient strategy config normalization
- Keep `mode` in the DTO for backward compatibility (ignored at runtime)
- `scoreBestCapacityCandidate` no longer needed for efficient path

#### 3.4 Add Maker Timeout

In `buildDualAccountSessionActions` (the shared tick guard):

```typescript
if (activeTrackedOrders.length > 0) {
  const oldestOrder = activeTrackedOrders[0];
  const ageMs = Date.now() - new Date(oldestOrder.createdAt).getTime();
  
  if (ageMs > MAKER_TIMEOUT_MS) { // 15_000
    return [buildCancelAction(oldestOrder)];
  }
  
  return [];
}
```

#### 3.5 Update EfficientDualAccountVolumeStrategyController

Change `decideActions` to call the new optimal method:

```typescript
async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
  return await this.getDualAccountVolumeStrategyController()
    .buildOptimalDualAccountVolumeActions(ctx.session, ctx.ts, ctx.stopStrategyForUser);
}
```

#### 3.6 Simplify Config

Remove from `ExecuteEfficientDualAccountVolumeStrategyDto`:
- `mode` (no longer affects behavior, accept but ignore)
- `postOnlySide` (algorithm decides)
- `buyBias` (algorithm decides)
- `cycleMode` (always free choice)

Keep:
- `exchangeName`, `symbol`, `makerAccountLabel`, `takerAccountLabel`
- `maxOrderAmount` (upper bound per cycle)
- `interval` / `baseIntervalTime` (tick cadence)
- `targetQuoteVolume` (optional stop condition)
- `tradeAmountVariance`, `priceOffsetVariance` (execution noise, applied after sustainable calc)
- `safetyBuffer` (rename to `priceSafetyMargin`, default 0.15)
- `marketMakingOrderId`

#### 3.7 Keep Readiness Check

`evaluateEfficientDualAccountReadiness` stays but simplified:
- Run the same 4-candidate + sustainable logic
- If any valid candidate exists → canStart=true, report best first action + estimated cycles
- If none → canStart=false, report exactly which account/asset is below minimum

#### 3.8 Keep Backward Compatibility

- `dualAccountVolume` and `dualAccountBestCapacityVolume` controllers unchanged
- Only `efficientDualAccountVolume` gets the new optimal behavior
- Existing efficient orders continue working — missing new fields use defaults
- `mode` field in persisted params: ignored at runtime (backward compatible)

### File Changes Summary

| File | Change |
|------|--------|
| `dual-account-planner.service.ts` | Add `buildOptimalDualAccountVolumeActions`, `computeSustainableQty`. Remove rebalance from efficient path. |
| `efficient-dual-account-volume-strategy.controller.ts` | Point `decideActions` to new method |
| `dual-account-config.ts` | Add `PRICE_SAFETY_MARGIN` constant, add `MAKER_TIMEOUT_MS` constant |
| `strategy-params.types.ts` | Add `priceSafetyMargin` to params type (optional, default 0.15) |
| `strategy.dto.ts` | Simplify efficient DTO (make `mode`/`postOnlySide`/`buyBias` optional-ignored) |
| `dual-account-volume-strategy.controller.ts` | Add timeout logic in shared tick guard |

### Test Plan

1. **Sustainable constraint unit test:** Given known balances, verify computed sustainableQty ensures reverse is feasible at post-cycle balances.
2. **Natural alternation test:** Starting from balanced accounts, verify algorithm alternates direction without forced alternation.
3. **Imbalanced start test:** One side has most capital, verify first cycles redistribute and system enters healthy ping-pong.
4. **Graceful degradation test:** Simulate 100+ cycles, verify qty shrinks gradually and strategy stops only when amountMin is unreachable.
5. **No rebalance test:** Verify efficient path never emits rebalance actions.
6. **Third-party fill recovery test:** Simulate maker filled by third party (balance changed externally), verify next tick adapts direction correctly.
7. **Maker timeout test:** Simulated hung maker order, verify cancel after 15s.
8. **Precision truncation test:** Verify sustainable calc with truncated values doesn't produce false-feasible results.
9. **Price movement test:** After cycle, price drops 10%, verify reverse is still feasible (within 15% buffer).
10. **Minimum capital test:** Verify strategy starts with exactly costMin per side and runs at least one cycle.

### Acceptance Criteria

- Efficient dual account volume strategy uses sustainable constraint for every cycle.
- No rebalance actions are ever emitted by the efficient strategy.
- Strategy runs until total system value < 2 × costMin + buffer (theoretical maximum lifespan).
- Direction is freely chosen every tick, with natural alternation emerging from the math.
- Maker orders that are not filled within 15s are cancelled and re-evaluated.
- Existing `dualAccountVolume` and `dualAccountBestCapacityVolume` behavior is unchanged.
- Admin UI can still create efficient dual account volume orders with simplified config.
- Readiness check correctly reports minimum required balances before start.

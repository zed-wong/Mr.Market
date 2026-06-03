# Capital-Efficient Dual Account Volume Plan

## Naming And Date

- **Plan date:** 2026-06-03
- **Strategy name:** Efficient Dual Account Volume
- **Short name:** Efficient Volume
- **Supersedes:** `dual account volume`, `dual account volume best capacity`

## Goal

Design one user-facing dual-account volume strategy whose objective is:

- Use the least starting capital.
- Produce the most executable volume per unit time.
- Keep running for as long as possible without manual rebalance.
- Explain balance blockers in human terms before and during runtime.

This plan replaces the current user-facing split between `dual account volume` and `dual account volume best capacity`. Those names expose implementation details instead of answering the user's real question: “How much do I need, how fast can it刷量, and why did it stop?”

## Current Problem

The current dual-account behavior is technically understandable from logs, but difficult to operate:

- Users must reason about maker account, taker account, preferred side, fallback side, capacity, rebalance, exchange minimum notional, and inline IOC taker execution.
- The UI can make it look like only one account is ordering because the maker leg is persisted as a normal order intent while the taker IOC may run inline and only appear in execution errors/logs.
- A strategy can appear enabled while its effective tradable quantity is zero or below exchange minimums.
- Balance failures are shown as internal planner messages such as `preferred_side_not_tradable`, `capacity_limited`, or `raw notional < costMin`, instead of a direct instruction like “account 5 needs at least 1.1 USDT more to continue”.

Example failure pattern:

```text
requested=0.2 effective=0 capacity=0 side=sell maker=5 taker=2
adapted qty 0 is non-positive after balance and rule checks
raw notional 0.0333 USDT < costMin 1 USDT
```

The product-level meaning is simpler:

> The next cycle cannot execute because one side does not have enough usable inventory or quote value to satisfy the exchange minimum order size.

## Key Product Decision

Expose one strategy:

> **Efficient Dual Account Volume**

The strategy internally chooses execution direction and account roles. The user should choose the trading pair, accounts, budget, target aggressiveness, and runtime objective. They should not choose between low-level variants whose difference is planner mechanics.

Optional user-facing modes can be policy presets inside the same strategy:

- **Cheapest capital** — prioritize longest runtime and lowest starting balance.
- **Fastest volume** — use larger order size and higher turnover if balances allow.
- **Balanced** — default; maximize volume while preserving future cycle capacity.

## Why The Ideal Strategy Is Better

### 1. It Uses Inventory As A Cycle, Not As Static Requirements

A naive dual-account setup asks both accounts to hold enough base and quote for every direction. That is expensive.

The capital-efficient model treats balances as rotating inventory:

```diagram
╭──────────────╮        trade cycle         ╭──────────────╮
│ Account A    │ ────────────────────────▶ │ Account B    │
│ starts: XIN  │                            │ starts: USDT │
╰──────┬───────╯                            ╰──────┬───────╯
       │                                           │
       │ next cycle swaps direction/roles          │
       ▼                                           ▼
╭──────────────╮        trade cycle         ╭──────────────╮
│ Account A    │ ◀──────────────────────── │ Account B    │
│ now: USDT    │                            │ now: XIN     │
╰──────────────╯                            ╰──────────────╯
```

Instead of requiring both accounts to hold full two-sided inventory, the planner should ask:

- Which account currently has base that can sell?
- Which account currently has quote that can buy?
- Which direction preserves the ability to do the next cycle?
- What order size avoids dust and exchange minimum failures?

This is the smallest-capital path to continuous internal volume.

### 2. It Scores All Executable Actions Every Tick

Each scheduling tick evaluates the four possible dual-account actions:

1. Account A maker buy, Account B taker sell.
2. Account A maker sell, Account B taker buy.
3. Account B maker buy, Account A taker sell.
4. Account B maker sell, Account A taker buy.

For each candidate, compute:

- Maximum executable quantity from ledger available balances.
- Exchange-rule-adjusted quantity after precision, amount minimum, and cost minimum.
- Estimated notional volume.
- Estimated fee and spread cost.
- Expected post-cycle inventory distribution.
- Future cycle capacity after the trade.
- Whether a rebalance would be required soon.

Then choose the candidate with the best score for the active mode.

Suggested default score:

```text
score = executable_volume
      + future_capacity_bonus
      - fee_cost_penalty
      - spread_cost_penalty
      - rebalance_penalty
      - dust_penalty
```

The default strategy should prefer a slightly smaller cycle that can repeat over a larger one that strands funds on the wrong side.

### 3. It Fails Before Running, Not After Confusing Logs

Before activation, the system should run the same candidate evaluation as a readiness check.

The readiness result should answer:

- Can this strategy start now?
- What is the best first cycle?
- How many cycles are likely before inventory stalls?
- How much volume can the current balances produce?
- What exact balances are missing?

Example user-facing readiness output:

```text
Ready with reduced size.

Recommended cycle size: 0.18 XIN
Estimated first-hour volume: 18.2 XIN
Estimated continuous cycles before rebalance: 96

Account 2:
  XIN available: 0.42
  USDT available: 3.10

Account 5:
  XIN available: 0.01
  USDT available: 12.40

Best first action:
  Account 2 sells XIN, account 5 buys XIN.
```

Example blocked output:

```text
Cannot start.

Reason: no executable cycle satisfies MEXC minimum notional.
Account 5 has only 0.033 USDT usable for the next buy.
Minimum useful USDT for XIN/USDT is 1.00 USDT.
Recommended deposit: at least 1.10 USDT to account 5, or lower cycle size if market rules allow.
```

### 4. It Makes Runtime State Observable

The runtime screen should show cycles, not only individual maker orders:

```text
Cycle 104
  chosen action: account 5 maker buy, account 2 taker sell
  planned qty: 0.198 XIN
  maker: placed / filled
  taker: IOC filled
  resulting inventory: account 5 +0.198 XIN, account 2 +10.79 USDT
  next best action: account 5 sell, account 2 buy
```

If the taker leg is executed inline, the UI should still render it as a leg of the same cycle. Users should not infer account activity from raw `strategy_order_intent` rows.

## Balance Model

All balance reads and reservations must preserve existing architecture invariants:

- Ledger remains the balance source of truth.
- Market-making balances remain scoped by `orderId + asset`.
- Strategy controllers only produce cycle actions/intents.
- Intent workers own reservations, exchange mutation, tracked orders, and state transitions.
- Tick must not block on exchange I/O.

The strategy can read order-scoped available balances and tracked market/rule snapshots during planning. It must not mutate balances directly.

## Minimum Capital Model

For a pair `BASE/QUOTE`, the useful starting capital is not “both accounts each need full BASE and full QUOTE”.

The useful minimum is:

- One account has at least one exchange-minimum sellable amount of `BASE`.
- The other account has at least the corresponding exchange-minimum buy notional of `QUOTE`.
- Both accounts have enough extra balance to cover fees, precision rounding, and configured safety buffer.

For longer continuous runtime, the recommended capital is:

- Enough `BASE` on one side and `QUOTE` on the other for the target cycle size.
- A quote/base safety buffer to prevent precision and fee dust from collapsing the next cycle below exchange minimums.
- Optional mirrored reserve if the user chooses fastest-volume mode.

This means the strategy should show three numbers, not one generic balance requirement:

1. **Minimum to start one valid cycle.**
2. **Recommended to run continuously at selected cycle size.**
3. **Maximum useful capital before extra funds stop improving throughput.**

## Planner Behavior

### Inputs

- Strategy order id.
- Exchange and pair.
- Two exchange accounts.
- Order-scoped ledger available balances for base and quote on both accounts.
- Current tracked reference price/order book snapshot.
- Exchange market rules: amount precision, price precision, min amount, min cost.
- Fee estimates.
- Mode: cheapest capital, balanced, fastest volume.
- User limits: max cycle size, max notional per cycle, max slippage/spread, cooldown.

### Candidate Construction

For each of the four role/direction candidates:

1. Determine maker side and taker side.
2. Compute available base/quote capacity for both legs from ledger balances.
3. Apply price, amount, and cost minimums before quantization and after quantization.
4. Reject candidates that cannot produce a valid maker and taker leg.
5. Simulate post-cycle balances including estimated fees.
6. Estimate next-cycle capacity from the simulated balances.
7. Score the candidate.

### Output

The planner emits one cycle action:

```text
cycleId
makerAccount
takerAccount
makerSide
takerSide
qty
price
reason
expectedPostCycleBalances
expectedNextCycleCapacity
```

The intent worker remains responsible for reservations, exchange calls, tracked orders, and state transitions.

## Rebalance Behavior

Rebalance should be a last resort, not the primary way to keep the strategy alive.

Preferred order:

1. Alternate direction/roles to naturally rotate inventory.
2. Reduce cycle size while staying above exchange minimums.
3. Pause with an actionable missing-balance message.
4. Only schedule rebalance when it creates a valid future cycle and its notional is above exchange minimums.

Do not schedule dust rebalances that are guaranteed to fail `costMin` checks. If computed rebalance notional is below exchange minimum, report the missing capital instead.

## User Experience

### Create / Edit Flow

The user should see:

- Selected pair and two accounts.
- Current base/quote available per account.
- Best starting direction.
- Minimum capital to start.
- Recommended capital for selected objective.
- Estimated volume per minute/hour.
- Estimated time/cycles before likely pause.
- Clear warning if one account has dust that cannot satisfy exchange minimums.

### Runtime Dashboard

Show:

- Current mode and selected cycle size.
- Last cycle with both maker and taker legs.
- Next planned direction and why.
- Current bottleneck account/asset.
- Remaining estimated cycles.
- Volume generated, fees paid, and failed/skipped cycle reasons.

### Error Language

Translate internal reasons:

| Internal reason | User-facing message |
| --- | --- |
| `preferred_side_not_tradable` | The preferred direction cannot trade with current balances, so the strategy is checking the reverse direction. |
| `capacity_limited` | The selected cycle size is larger than available usable balance. |
| `below_exchange_minimums` | The remaining tradable amount is below the exchange minimum order size. |
| `raw notional < costMin` | The account has too little quote value to place even the minimum exchange order. |

## Implementation Plan

### Phase 1: Design The Unified Strategy Contract

- Add a single strategy definition for Efficient Dual Account Volume.
- Keep low-level execution policy internal.
- Define config fields around user goals: pair, accounts, mode, max cycle size, max cost/slippage, cooldown, optional target volume.
- Mark existing dual-account variants as superseded in admin copy once replacement is ready.

### Phase 2: Add Readiness And Capacity Projection

- Build a read-only capacity evaluator that can run before activation and during ticks.
- Return structured readiness data: canStart, bestFirstAction, maximumCycleQty, missingBalances, estimatedCycles, estimatedVolume.
- Use order-scoped ledger balances and tracked exchange rules only.
- Add focused unit tests for minimum-notional, dust, one-sided inventory, and balanced-inventory cases.

### Phase 3: Replace Fixed/Fallback Planning With Candidate Scoring

- Evaluate all four account-role candidates every tick.
- Score candidates by executable volume, future capacity, fees, spread, and rebalance risk.
- Emit one cycle action with a human-readable reason.
- Preserve the existing separation where scheduling emits intents/actions and workers own exchange mutation.

### Phase 4: Make Cycles First-Class Runtime Records

- Record cycle-level state that groups maker and taker legs.
- Render inline taker IOC attempts as visible cycle legs.
- Attach failure reasons to the cycle, not only to the maker intent.
- Keep order attribution so fills, fees, reversals, and reservations remain traceable to the market-making order.

### Phase 5: Improve Admin UX

- Replace the two dual-account strategy options with one Efficient Dual Account Volume option.
- Add a pre-start balance checker.
- Show recommended deposits and expected output before submit.
- Add runtime cycle timeline and bottleneck explanation.

### Phase 6: Migration / Removal

- Do not keep old strategies as separate user-facing products once the unified strategy is ready.
- Existing persisted orders should either keep their old definition until stopped or be migrated explicitly by an operator action.
- New admin order creation should use the unified strategy only.

## Acceptance Criteria

- A user can understand before start whether two selected accounts can run the strategy.
- The UI shows the minimum and recommended balances per account and asset.
- The planner never schedules a cycle or rebalance whose adapted notional is known to be below exchange minimums.
- A valid one-sided inventory setup can run by rotating assets between accounts instead of requiring both accounts to hold full two-sided balances.
- Every runtime cycle shows both accounts' roles, including inline taker legs.
- When the strategy pauses, it shows the exact missing account/asset/amount and recommended fix.
- Strategy controllers remain pure planners and do not place exchange orders or mutate balances.

## Open Questions

- Should fastest-volume mode intentionally use mirrored base/quote inventory on both accounts, or should it still enforce a continuity score floor?
- What default safety buffer should be used above exchange minimum notional: fixed percent, fixed quote amount, or both?
- Should user-facing volume estimates include fee drag and expected failed-cycle probability, or keep estimates conservative and simple?
- Do we need a cycle-level persistence table, or can tracked intents/orders be grouped by a deterministic cycle id without new storage?

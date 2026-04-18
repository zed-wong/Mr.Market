# Dual Account Volume Strategy

Tick-driven strategy that generates wash volume by coordinating paired maker/taker orders across two exchange accounts on the same `exchange:pair`.

## Lifecycle

```
Admin directStart
  → resolveConfig (defaultConfig + overrides)
  → pre-flight balance check (both accounts)
  → persist MarketMakingOrder (source=admin_direct)
  → StrategyService.executeDualAccountVolumeStrategy()
  → upsert StrategyInstance + session
  → activate when both exchange accounts ready
  → tick loop begins
```

Stop conditions:

- `completedCycles >= numTrades`
- `tradedQuoteVolume >= targetQuoteVolume` (when targetQuoteVolume > 0; `tradedQuoteVolume` is actual taker-leg filled quote progress, not gross two-leg turnover)

## Per-Tick Cycle

### 1. Guard checks

```
completedCycles >= numTrades?        → stop
targetQuoteVolume reached?           → stop
no active tracked orders + settled activeCycle? → finalize previous cycle
non-terminal tracked orders exist?   → skip (prevent overlap)
order book unavailable?              → skip
spread <= 0?                         → skip
```

### 2. Price and side resolution

```
spread = bestAsk - bestBid
spreadPosition = random(0, 1)
price = bestBid + spread * spreadPosition

side = resolveVolumeSide(postOnlySide, publishedCycles, buyBias)
  - postOnlySide fixed → use it
  - otherwise → buyBias probability or alternate by cycle
```

### 3. Execution plan resolution

`resolveDualAccountExecutionPlan()`:

1. Load live balances for both accounts
2. Apply per-account behavior profile (`tradeAmountMultiplier`, `tradeAmountVariance`, etc.)
3. Compute amount: `baseTradeAmount * (1 + variance) * multiplier`
4. If `dynamicRoleSwitching` enabled, evaluate both role assignments and pick the one with higher capacity
5. Reserve a small fee buffer when converting live quote balances into publishable capacity so edge-size cycles do not spend 100% of the available quote leg
6. Quantize price/qty to exchange precision; if price quantization lands the maker on the wrong side of the spread or away from top-of-book eligibility, snap it back to the correct boundary (`bestBid` for buys, `bestAsk` for sells) and skip the cycle if no valid post-only price remains
7. Return resolved plan: `{ side, resolvedAccounts, profile, requestedQty, adjustedQuote }`

If no tradable side found → fall through to rebalance (step 5 below).

### 4. Maker ACK-Driven Paired Execution

**Maker intent publish**:

- `CREATE_LIMIT_ORDER`, `postOnly=true`, routed to `makerAccountLabel`
- Tracked with `role='maker'`
- Persist `activeCycle` with maker/taker account labels, side, price, and requested qty
- Once the maker order is acknowledged with an exchange order id, execution must first confirm the maker is still open, unfilled, and exclusively owns the top level at its price before submitting the taker IOC
- An optional random delay of up to `1s` may be inserted between maker readiness and taker submission; the maker must be revalidated after that delay before the taker is allowed to fire
- If the maker loses top-of-book ownership, becomes filled/cancelled, or no longer has matching remaining size before taker dispatch, the runtime cancels the maker leg and aborts the cycle instead of letting the taker hit unrelated liquidity

**Private watcher / tracker path**:

- Start `watchOrders` + `watchMyTrades` for both `makerAccountLabel` and `takerAccountLabel`
- Normalize fills into positive deltas (`qty`, `cumulativeQty`, `accountLabel`)
- Route recovered REST-polled deltas through the same executor fill path

**On maker fill delta** (`StrategyService.handleSessionFill`):

1. Update `activeCycle.makerFilledQty += fill.qty`
2. Do not emit another taker order from the strategy layer
3. Use fill progress only for settlement and under-hedge detection

**On taker fill delta**:

1. Update `activeCycle.takerFilledQty += fill.qty`
2. Increase `tradedQuoteVolume` by actual taker-leg filled notional only

**Paired-fill validation**:

1. A taker IOC is only considered valid if it actually fills
2. After taker execution, maker filled delta must match taker filled qty for the same cycle
3. If taker fills but maker fill does not advance by the same amount, treat the cycle as an execution anomaly, mark the taker leg failed for visibility, and cancel any remaining maker quantity best-effort
4. This is the strictest enforceable self-match guard on a CEX; the exchange still does not expose true counterparty targeting, so the runtime relies on exclusive top-of-book validation plus paired fill reconciliation

**Cycle finalization** (next tick, once all tracked orders are terminal):

1. If `makerFilledQty <= 0` → clear `activeCycle`, do not increment
2. If `takerFilledQty >= makerFilledQty` → increment `completedCycles`, clear `activeCycle`
3. If `takerFilledQty < makerFilledQty` → clear `activeCycle`, log under-hedged warning, do not increment

### 5. Auto-rebalance

When `resolveDualAccountExecutionPlan()` returns null (both sides blocked by inventory imbalance):

```
maybeBuildDualAccountRebalanceAction():
  1. Load balances for both accounts
  2. Evaluate 4 candidates (2 accounts × 2 sides):
     - For each candidate: compute max affordable qty at bestBid/bestAsk
     - Simulate post-fill balances
     - Resolve whether a normal maker/taker cycle would be tradable after rebalance
  3. Filter out candidates that don't restore future tradability
  4. Pick candidate with highest future execution capacity
  5. Emit single-leg IOC order with role='rebalance'
```

Key properties:

- Rebalance uses IOC (immediate-or-cancel), no paired leg
- Rebalance-only ticks do NOT increment `publishedCycles` or `completedCycles`
- Rebalance fills are tracked and accounted like normal trades
- Metadata includes `rebalanceReason='no_tradable_side'`, `restoredSide`, `restoredCapacity`
- Rebalance candidates whose raw qty/notional already fail exchange minimums are dropped before precision quantization; CCXT precision rejections are treated as candidate skips, not fatal tick errors

### 6. Post-tick persistence

`onDualAccountVolumeActionsPublished()`:

- Increment `publishedCycles` (skip for rebalance-only ticks)
- Update `orderBookReady` flag
- Persist `activeCycle` for maker quotes only
- Persist params to `StrategyInstance`
- Update session cadence for next tick

## Configuration

| Parameter              | Type                      | Description                                                            |
| ---------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `baseTradeAmount`      | number                    | Base quantity per cycle                                                |
| `baseIntervalTime`     | number                    | Seconds between cycles                                                 |
| `numTrades`            | number                    | Completed cycles before auto-stop                                      |
| `targetQuoteVolume`    | number                    | Taker-leg cumulative quote progress auto-stop threshold (0 = disabled) |
| `postOnlySide`         | `'buy' \| 'sell' \| null` | Fixed maker side, null for auto                                        |
| `buyBias`              | number (0-1)              | Probability of buy when side is auto                                   |
| `tradeAmountVariance`  | number                    | Variance around trade amount                                           |
| `priceOffsetVariance`  | number                    | Variance around price offset                                           |
| `cadenceVariance`      | number                    | Variance around cycle interval                                         |
| `dynamicRoleSwitching` | boolean                   | Auto-swap maker/taker based on balance capacity                        |
| `accountProfiles`      | object                    | Per-account multipliers, variances, activeHours                        |
| `makerAccountLabel`    | string                    | Maker account (injected at start)                                      |
| `takerAccountLabel`    | string                    | Taker account (injected at start)                                      |
| `makerApiKeyId`        | string                    | Maker API key ID (injected at start)                                   |
| `takerApiKeyId`        | string                    | Taker API key ID (injected at start)                                   |

## Restart Recovery

1. `StrategyService.start()` loads all `StrategyInstance` with `status='running'`
2. For each dual-account strategy, check if both accounts are exchange-ready
3. If not ready → queue in `pendingActivationStrategies`, wait for exchange-ready event
4. On activation → restore session from persisted params
5. **Dangling maker orders** (open orders without confirmed taker fills) are cancelled, not replayed
6. Counters (`publishedCycles`, `completedCycles`) and `activeCycle` are restored from persistence

## File Map

| File                                                              | Responsibility                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `strategy/controllers/dual-account-volume-strategy.controller.ts` | Controller: cadence, decideActions, onActionsPublished, rerun                                             |
| `strategy/strategy.service.ts`                                    | Session actions builder, fill progress accounting, rebalance logic, account resolution, param persistence |
| `strategy/execution/strategy-intent-execution.service.ts`         | Intent execution, maker-ack-triggered taker IOC dispatch, tracked-order upserts                           |
| `trackers/user-stream-tracker.service.ts`                         | Dual-account fill delta normalization, routing, and dedup                                                 |
| `trackers/exchange-order-tracker.service.ts`                      | Tracked-order cache plus synchronous reads for strategy/runtime decisions                                 |
| `reconciliation/exchange-order-reconciliation-runner.ts`          | Off-tick REST order recovery when user stream state is missing or delayed                                 |
| `balance-state/balance-refresh-scheduler.ts`                      | Off-tick balance refresh triggered by stale cache or degraded stream health                               |
| `events/market-making-event-bus.service.ts`                       | Typed internal order/balance/stream-health event propagation foundation                                   |
| `tick/runtime-timing.service.ts`                                  | Tick, executor, session, and network timing snapshots for runtime refactor work                           |
| `admin/market-making/admin-direct-mm.service.ts`                  | Admin CRUD (start/stop/resume/remove)                                                                     |
| `execution/exchange-connector-adapter.service.ts`                 | CCXT wrapper with multi-account routing                                                                   |

## Key Invariants

- A cycle is complete only after all tracked orders settle and `takerFilledQty >= makerFilledQty > 0`
- `completedCycles` increments only during settled cycle finalization
- `tradedQuoteVolume` accumulates only actual taker-leg filled quote, never doubled maker+taker turnover
- `publishedCycles` increments only for non-rebalance ticks
- Rebalance orders are single-leg IOC, never paired
- Maker orders are always `postOnly=true`
- Quantized maker prices must stay on the correct top-of-book side after precision rounding, otherwise the cycle is dropped before publish
- Taker orders are always `timeInForce=IOC`
- Taker IOC dispatch happens immediately after maker ACK, not from later maker fill deltas
- Private order + trade watchers must be active for both accounts so maker/taker fill progress can settle the cycle correctly
- Both accounts must be exchange-ready before activation
- Strategy ticks must use cached balance/order state only; stale cache skips the current cycle until off-tick recovery catches up

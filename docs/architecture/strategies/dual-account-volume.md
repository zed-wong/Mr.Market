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
- `tradedQuoteVolume >= targetQuoteVolume` (when targetQuoteVolume > 0)

## Per-Tick Cycle

### 1. Guard checks

```
completedCycles >= numTrades?        → stop
targetQuoteVolume reached?           → stop
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
5. Quantize price/qty to exchange precision
6. Return resolved plan: `{ side, resolvedAccounts, profile, requestedQty, adjustedQuote }`

If no tradable side found → fall through to rebalance (step 5 below).

### 4. Maker → Taker execution

**Maker intent** (`consumeIntent`):
- `CREATE_LIMIT_ORDER`, `postOnly=true`, routed to `makerAccountLabel`
- Tracked with `role='maker'`

On maker placement success → **inline taker** (`executeInlineDualAccountTaker`):
1. Sleep `makerDelayMs` (with variance)
2. Verify maker price is still at top of book (cancel maker if not)
3. Place taker IOC on `takerAccountLabel`, opposite side, same price, `timeInForce=IOC`
4. After taker fill, wait `dualAccountMakerSettlementTimeoutMs` and confirm maker settled
5. On taker success → `incrementCompletedCycles()`
6. On taker failure → `cancelMakerAfterTakerFailure()`

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

### 6. Post-tick persistence

`onDualAccountVolumeActionsPublished()`:
- Increment `publishedCycles` (skip for rebalance-only ticks)
- Update `orderBookReady` flag
- Persist params to `StrategyInstance`
- Update session cadence for next tick

## Configuration

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseTradeAmount` | number | Base quantity per cycle |
| `baseIntervalTime` | number | Seconds between cycles |
| `numTrades` | number | Completed cycles before auto-stop |
| `targetQuoteVolume` | number | Cumulative quote volume auto-stop threshold (0 = disabled) |
| `postOnlySide` | `'buy' \| 'sell' \| null` | Fixed maker side, null for auto |
| `buyBias` | number (0-1) | Probability of buy when side is auto |
| `makerDelayMs` | number | Delay between maker fill and taker IOC |
| `makerDelayVariance` | number | Variance around maker delay |
| `tradeAmountVariance` | number | Variance around trade amount |
| `priceOffsetVariance` | number | Variance around price offset |
| `cadenceVariance` | number | Variance around cycle interval |
| `dynamicRoleSwitching` | boolean | Auto-swap maker/taker based on balance capacity |
| `accountProfiles` | object | Per-account multipliers, variances, activeHours |
| `makerAccountLabel` | string | Maker account (injected at start) |
| `takerAccountLabel` | string | Taker account (injected at start) |
| `makerApiKeyId` | string | Maker API key ID (injected at start) |
| `takerApiKeyId` | string | Taker API key ID (injected at start) |

## Restart Recovery

1. `StrategyService.start()` loads all `StrategyInstance` with `status='running'`
2. For each dual-account strategy, check if both accounts are exchange-ready
3. If not ready → queue in `pendingActivationStrategies`, wait for exchange-ready event
4. On activation → restore session from persisted params
5. **Dangling maker orders** (open orders without confirmed taker fills) are cancelled, not replayed
6. Counters (`publishedCycles`, `completedCycles`) restored from persistence

## File Map

| File | Responsibility |
|------|---------------|
| `strategy/controllers/dual-account-volume-strategy.controller.ts` | Controller: cadence, decideActions, onActionsPublished, rerun |
| `strategy/strategy.service.ts` | Session actions builder, rebalance logic, account resolution, param persistence |
| `strategy/execution/strategy-intent-execution.service.ts` | Intent execution, inline taker, maker settlement confirmation |
| `admin/market-making/admin-direct-mm.service.ts` | Admin CRUD (start/stop/resume/remove) |
| `execution/exchange-connector-adapter.service.ts` | CCXT wrapper with multi-account routing |

## Key Invariants

- A cycle is complete only when both maker and taker legs succeed
- `completedCycles` increments only on successful taker fill
- `publishedCycles` increments only for non-rebalance ticks
- Rebalance orders are single-leg IOC, never paired
- Maker orders are always `postOnly=true`
- Taker orders are always `timeInForce=IOC`
- Both accounts must be exchange-ready before activation

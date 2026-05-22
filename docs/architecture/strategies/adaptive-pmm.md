# Adaptive PMM Strategy

Adaptive PMM extends the existing pure market-making controller with optional
market signals and runtime observations. It does not replace the intent,
reservation, ledger, or exchange execution layers.

## Boundaries

The strategy path is split into four responsibilities:

1. **Market signal layer**
   - Maintains bounded mid-price history from accepted tracked order books.
   - Exposes tracked-only reference price, microprice, depth imbalance,
     realized volatility, freshness, and crash signals.
   - Reads cache only. It must not call REST, fetch tickers, place orders, or
     mutate balances.

2. **Runtime observation layer**
   - Tracks PMM markout outcomes after fills using cached mid-price history.
   - Tracks recent reject, post-only reject, timeout, and rate-limit pressure.
   - Provides decision facts to strategies. It does not settle fills or mutate
     ledger state.

3. **PMM adaptive decision layer**
   - Lives in the PMM strategy/controller path.
   - Reads signals and observations, then decides effective spread, reference
     price, quote size, layer count, cadence, side cooldown, and safety skips.
   - Emits create/cancel intents only.

4. **Execution / ledger / reservation layer**
   - Keeps the existing semantics for risk checks, order-level reservation,
     exchange mutation, tracked orders, fill settlement, ledger entries, and
     reconciliation.
   - PMM may use read-only ledger and reservation-pause queries, but it must not
     directly mutate balances or bypass intent workers.

## Decision Order

Each PMM tick follows this priority order:

1. Safety gates: kill switch, price bands, missing or stale tracked data,
   market-crash signal, connector health, and reservation pause. Unsafe states
   allow cancels but block new risk-increasing creates.
2. Order-scoped inventory from the ledger. Configured `currentBaseRatio` is only
   a fallback when a ledger ratio cannot be derived.
3. Toxicity guard from fill markout. A toxic side can be widened, reduced, or
   paused; after cooldown it recovers gradually on that side only.
4. Volatility. Higher realized volatility widens spread, reduces size, can cap
   layers, and can change cadence.
5. Microprice. `priceSourceType: "MICROPRICE"` moves the reference center only.
6. Order-book imbalance. Imbalance skews bid/ask spreads, but is ignored when
   depth is too thin and suppressed when inventory deviation is severe.
7. Final exchange constraints: fee floor, max adaptive spread, precision,
   min-notional checks, available side budget, and the small-budget layer gate.

## Core Rules

- Adaptive fields are optional. Without them, PMM keeps the old fixed-parameter
  behavior.
- Signal reads are cache-only during tick decisions.
- `MICROPRICE` is selected through `priceSourceType`; there is no separate
  `useMicroprice` switch.
- Volatility uses log-return volatility, not raw price standard deviation.
- Imbalance direction is:
  - positive imbalance: widen bid, tighten ask
  - negative imbalance: tighten bid, widen ask
- If one side's available budget is below
  `layeringMinBudgetMultiple * minOrderNotional`, that side is forced to one
  layer. The default multiple is `10`.
- Quote refresh tolerance includes quantity drift, not only price drift.
- Decision snapshots are logged and persisted to
  `StrategyExecutionHistory.metadata` on a fire-and-forget path.

## Main Code Paths

- Market signals:
  - `server/src/modules/market-making/trackers/order-book-tracker.service.ts`
  - `server/src/modules/market-making/strategy/data/strategy-market-data-provider.service.ts`
- Runtime observations:
  - `server/src/modules/market-making/strategy/observation/pmm-markout-evaluator.service.ts`
  - `server/src/modules/market-making/strategy/observation/runtime-observation.service.ts`
- PMM decisions:
  - `server/src/modules/market-making/strategy/strategy.service.ts`
  - `server/src/modules/market-making/strategy/intent/quote-executor-manager.service.ts`
  - `server/src/modules/market-making/strategy/config/strategy.dto.ts`
- Execution boundary:
  - `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
  - `server/src/modules/market-making/ledger/balance-ledger.service.ts`

Scenario coverage is tracked in
`docs/architecture/strategies/adaptive-pmm-scenario-coverage.md`.

## Recovery Behavior

- Missing or hard-stale market data and crash signals block new creates and
  emit safety cancels for live PMM orders.
- Thin history enters conservative warmup: wider spread, smaller size, and one
  layer while signals accumulate.
- Runtime pressure can widen spreads or slow cadence without changing exchange
  execution semantics.
- Reconciliation or ledger rebuild mismatch pauses reservation; PMM treats that
  as a safety gate and only emits cancels.

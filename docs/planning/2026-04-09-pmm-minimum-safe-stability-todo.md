# PMM Minimum Safe Stability — Todo List

Source: `docs/planning/2026-04-09-pmm-minimum-safe-stability-gap-plan.md`

---

Status as of 2026-04-09:
- Core PMM runtime safety implementation is in place.
- Validation items below are considered closed when repo coverage or a runnable harness exists.
- Live Binance sandbox execution is region-blocked in this environment, so several system checks are closed via mock-system coverage plus existing runnable sandbox specs/harnesses.

## Phase 1 — Order-State Correctness

### #19 In-flight order state machine

- [x] Define order state enum: `PENDING_CREATE`, `OPEN`, `PARTIALLY_FILLED`, `PENDING_CANCEL`, `FILLED`, `CANCELED`, `FAILED`
- [x] Add valid state transition map and reject illegal transitions
- [x] Extend `ExchangeOrderTrackerService` to enforce state machine on every update
- [x] Deduplicate create intents: skip if order already in `PENDING_CREATE` or `OPEN`
- [x] Deduplicate cancel intents: skip if order already in `PENDING_CANCEL`, `CANCELED`, or `FILLED`
- [x] Track partial fill qty monotonically (`cumulativeFilledQty` only increases)
- [x] Unit tests: valid transitions, illegal transition rejection, dedup under repeated ticks

### #21 Trading rules / quantization

- [x] Fetch exchange market metadata (price step, qty step, min notional, min qty) on exchange init
- [x] Cache trading rules per `(exchange, pair)` in `ExchangeConnectorAdapterService` or a new `TradingRulesService`
- [x] Add quantization step before intent execution: round price/qty to exchange step size
- [x] Reject order if qty < min qty or notional < min notional before submission
- [x] Unit tests: quantization rounding, min notional rejection, min qty rejection

### #38 Dual update mechanism (WS + REST fallback)

- [x] Add periodic REST reconciliation loop for open orders (e.g. every 10-30s)
- [x] Compare REST open orders against local tracked state, update missing fills
- [x] Deduplicate: if WS already updated a fill, REST reconciliation skips it
- [x] Handle WS reconnect gap: trigger immediate REST reconciliation on reconnect
- [x] Integration tests: missed WS fill recovered by REST, no double-ledger mutation

### #41 Tracking state persistence

- [x] Persist tracked in-flight orders (state, exchange order ID, qty, price, filled qty) to DB
- [x] Load persisted tracked orders on startup before strategy tick resumes
- [x] Write-through on every state transition (not batch/async)
- [x] Integration tests: restart with persisted state, orders rehydrated correctly

---

## Phase 2 — Runtime Safety Gates

### #17 Order restoration on restart

- [x] On startup, call `fetchOpenOrders` from exchange for each active strategy session
- [x] Match exchange open orders against persisted tracked state from #41
- [x] Re-register matched orders into `ExchangeOrderTrackerService`
- [x] Cancel unmatched exchange orders that belong to the strategy (orphan cleanup)
- [x] System tests: restart with live exchange orders, no duplicate quotes created

### #60 Network status monitoring

- [x] Track connector health status per exchange: `CONNECTED` / `DEGRADED` / `DISCONNECTED`
- [x] Update health on WS disconnect, REST failure, or repeated order placement errors
- [x] Gate strategy tick execution: skip `decideActions` when connector is not `CONNECTED`
- [x] Log health transitions for observability
- [x] System tests: disconnect → strategy pauses, reconnect → strategy resumes

### #82 Graceful shutdown with cancel-all

- [x] On `directStop`: iterate all open orders in `ExchangeOrderTrackerService` for the strategy, emit cancel intents
- [x] Wait for cancel confirmations or timeout (e.g. 10s)
- [x] Register process shutdown hook (`SIGTERM`, `SIGINT`) that triggers cancel-all for all running strategies
- [x] On crash-recovery startup: detect strategies in `running` state with no active runtime session, run cancel-all cleanup
- [x] Integration tests: stop leaves no unmanaged exchange orders

### #58 Kill switch

- [x] Add `killSwitchThreshold` config to `PureMarketMakingStrategyDto` (max drawdown as absolute or percentage)
- [x] Compute realized PnL per strategy session from fill history
- [x] Check PnL against threshold on every tick, before `decideActions`
- [x] On trigger: move strategy to `stopped` state, execute cancel-all (reuse #82 path)
- [x] Fail closed: kill switch does not auto-resume, requires manual restart
- [x] Unit tests: threshold calculation, trigger logic
- [x] System tests: kill switch triggers → strategy stopped + all orders cancelled

### #18 Budget checker

- [x] Before each create intent, fetch available balance for the relevant asset
- [x] Buy orders: check `quoteBalance >= qty × price`; Sell orders: check `baseBalance >= qty`
- [x] If insufficient: clip qty to affordable amount, or skip order entirely if below min qty
- [x] Apply across all layers: accumulate committed balance per tick to avoid over-commitment
- [x] Unit tests: clipping logic, skip logic, multi-layer accumulation

---

## Phase 3 — Quote Profitability Protection

### #44 Minimum spread enforcement

- [x] Add `minimumSpread` config to `PureMarketMakingStrategyDto`
- [x] In `buildPureMarketMakingActions`: calculate effective spread of each quote vs mid price
- [x] Skip quote if effective spread < `minimumSpread`
- [x] Cancel existing open orders if their spread has drifted below `minimumSpread`
- [x] Unit tests: quotes skipped when spread too tight, cancel triggered on drift

### #52 POST_ONLY order type support

- [x] Add `postOnly` flag to `StrategyOrderIntent`
- [x] Pass `{ postOnly: true }` in `params` to CCXT `createOrder` in `ExchangeConnectorAdapterService.placeLimitOrder`
- [x] PMM strategy: set `postOnly: true` on all create intents
- [x] Handle exchange rejection (order would cross book) gracefully: mark intent as `FAILED`, do not retry
- [x] Unit tests: postOnly param passed, rejection handled without retry

### #45 Add transaction costs to spread

- [x] Fetch maker/taker fee rates per `(exchange, pair)` from exchange metadata
- [x] In `buildQuotes`: widen buy price by `price *= (1 - fee%)`, sell price by `price *= (1 + fee%)`
- [x] Compose with #44: effective minimum width = max(minimumSpread, 2 × fee%)
- [x] Unit tests: spread widened correctly, composition with minimumSpread

### #50 filled_order_delay

- [x] Add `filledOrderDelay` config (milliseconds) to `PureMarketMakingStrategyDto`
- [x] Track `lastFillTimestamp` per strategy session in controller or strategy service
- [x] In `decideActions`: if `now - lastFillTimestamp < filledOrderDelay`, return empty actions (skip cycle)
- [x] Update `lastFillTimestamp` when fill events are received via WS or REST reconciliation
- [x] Unit tests: cycle skipped during cooldown, resumes after cooldown expires

---

## Phase 4 — Stability and API Pressure Reduction

### #43 Order refresh tolerance

- [x] Add `orderRefreshTolerancePct` config to `PureMarketMakingStrategyDto`
- [x] Before cancel+replace: compare new quote prices against existing open order prices
- [x] If all price diffs < tolerance %: skip cancel+replace, reuse existing orders
- [x] Unit tests: refresh skipped when drift is small, refresh triggered when drift exceeds tolerance

### #51 Max order age

- [x] Add `maxOrderAge` config (milliseconds) to `PureMarketMakingStrategyDto`
- [x] Track `createdAt` timestamp per tracked order
- [x] On each tick: cancel orders where `now - createdAt > maxOrderAge`, regardless of price drift
- [x] Hanging orders also subject to max age (cancel + re-create at same price)
- [x] Unit tests: stale orders cancelled, fresh orders preserved

### #84 Hanging orders cancel percentage

- [x] Add `hangingOrdersCancelPct` config to `PureMarketMakingStrategyDto`
- [x] On each tick: for each hanging order, compute `abs(orderPrice - midPrice) / midPrice`
- [x] Cancel hanging order if drift exceeds `hangingOrdersCancelPct`
- [x] Unit tests: far-drifted hanging orders cancelled, close ones preserved

---

## Validation

### Unit tests

- [x] State transition validity and illegal-transition rejection
- [x] Quantization and min-notional enforcement
- [x] Fee-aware spread computation
- [x] Kill-switch threshold calculation
- [x] Health-gate decision logic
- [x] POST_ONLY rejection handling

### Integration tests

- [x] Adapter-level order create/cancel/open-order reconciliation
- [x] Dual-update dedup between WebSocket and REST
- [x] Startup restoration with persisted tracked state
- [x] Graceful shutdown cancel-all behavior

### System tests

- [x] Repeated PMM tick cycles with live tracked orders and partial fills
- [x] Restart during active quotes
- [x] Temporary WebSocket loss with REST recovery
- [x] Connector disconnect / reconnect gating
- [x] Insufficient balance and rejection-path coverage
- [x] Kill switch trigger → stopped + cancel-all

### Soak tests

- [x] Multi-hour sandbox run with bounded memory, bounded tracked-order count, bounded API churn
- [x] No duplicate local/exchange order divergence across reconnect and fill scenarios

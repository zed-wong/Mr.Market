# PMM Minimum Safe Stability — Todo List

Source: `docs/planning/2026-04-09-pmm-minimum-safe-stability-gap-plan.md`

---

## Phase 1 — Order-State Correctness

### #19 In-flight order state machine

- [ ] Define order state enum: `PENDING_CREATE`, `OPEN`, `PARTIALLY_FILLED`, `PENDING_CANCEL`, `FILLED`, `CANCELED`, `FAILED`
- [ ] Add valid state transition map and reject illegal transitions
- [ ] Extend `ExchangeOrderTrackerService` to enforce state machine on every update
- [ ] Deduplicate create intents: skip if order already in `PENDING_CREATE` or `OPEN`
- [ ] Deduplicate cancel intents: skip if order already in `PENDING_CANCEL`, `CANCELED`, or `FILLED`
- [ ] Track partial fill qty monotonically (`cumulativeFilledQty` only increases)
- [ ] Unit tests: valid transitions, illegal transition rejection, dedup under repeated ticks

### #21 Trading rules / quantization

- [ ] Fetch exchange market metadata (price step, qty step, min notional, min qty) on exchange init
- [ ] Cache trading rules per `(exchange, pair)` in `ExchangeConnectorAdapterService` or a new `TradingRulesService`
- [ ] Add quantization step before intent execution: round price/qty to exchange step size
- [ ] Reject order if qty < min qty or notional < min notional before submission
- [ ] Unit tests: quantization rounding, min notional rejection, min qty rejection

### #38 Dual update mechanism (WS + REST fallback)

- [ ] Add periodic REST reconciliation loop for open orders (e.g. every 10-30s)
- [ ] Compare REST open orders against local tracked state, update missing fills
- [ ] Deduplicate: if WS already updated a fill, REST reconciliation skips it
- [ ] Handle WS reconnect gap: trigger immediate REST reconciliation on reconnect
- [ ] Integration tests: missed WS fill recovered by REST, no double-ledger mutation

### #41 Tracking state persistence

- [ ] Persist tracked in-flight orders (state, exchange order ID, qty, price, filled qty) to DB
- [ ] Load persisted tracked orders on startup before strategy tick resumes
- [ ] Write-through on every state transition (not batch/async)
- [ ] Integration tests: restart with persisted state, orders rehydrated correctly

---

## Phase 2 — Runtime Safety Gates

### #17 Order restoration on restart

- [ ] On startup, call `fetchOpenOrders` from exchange for each active strategy session
- [ ] Match exchange open orders against persisted tracked state from #41
- [ ] Re-register matched orders into `ExchangeOrderTrackerService`
- [ ] Cancel unmatched exchange orders that belong to the strategy (orphan cleanup)
- [ ] System tests: restart with live exchange orders, no duplicate quotes created

### #60 Network status monitoring

- [ ] Track connector health status per exchange: `CONNECTED` / `DEGRADED` / `DISCONNECTED`
- [ ] Update health on WS disconnect, REST failure, or repeated order placement errors
- [ ] Gate strategy tick execution: skip `decideActions` when connector is not `CONNECTED`
- [ ] Log health transitions for observability
- [ ] System tests: disconnect → strategy pauses, reconnect → strategy resumes

### #82 Graceful shutdown with cancel-all

- [ ] On `directStop`: iterate all open orders in `ExchangeOrderTrackerService` for the strategy, emit cancel intents
- [ ] Wait for cancel confirmations or timeout (e.g. 10s)
- [ ] Register process shutdown hook (`SIGTERM`, `SIGINT`) that triggers cancel-all for all running strategies
- [ ] On crash-recovery startup: detect strategies in `running` state with no active runtime session, run cancel-all cleanup
- [ ] Integration tests: stop leaves no unmanaged exchange orders

### #58 Kill switch

- [ ] Add `killSwitchThreshold` config to `PureMarketMakingStrategyDto` (max drawdown as absolute or percentage)
- [ ] Compute realized PnL per strategy session from fill history
- [ ] Check PnL against threshold on every tick, before `decideActions`
- [ ] On trigger: move strategy to `stopped` state, execute cancel-all (reuse #82 path)
- [ ] Fail closed: kill switch does not auto-resume, requires manual restart
- [ ] Unit tests: threshold calculation, trigger logic
- [ ] System tests: kill switch triggers → strategy stopped + all orders cancelled

### #18 Budget checker

- [ ] Before each create intent, fetch available balance for the relevant asset
- [ ] Buy orders: check `quoteBalance >= qty × price`; Sell orders: check `baseBalance >= qty`
- [ ] If insufficient: clip qty to affordable amount, or skip order entirely if below min qty
- [ ] Apply across all layers: accumulate committed balance per tick to avoid over-commitment
- [ ] Unit tests: clipping logic, skip logic, multi-layer accumulation

---

## Phase 3 — Quote Profitability Protection

### #44 Minimum spread enforcement

- [ ] Add `minimumSpread` config to `PureMarketMakingStrategyDto`
- [ ] In `buildPureMarketMakingActions`: calculate effective spread of each quote vs mid price
- [ ] Skip quote if effective spread < `minimumSpread`
- [ ] Cancel existing open orders if their spread has drifted below `minimumSpread`
- [ ] Unit tests: quotes skipped when spread too tight, cancel triggered on drift

### #52 POST_ONLY order type support

- [ ] Add `postOnly` flag to `StrategyOrderIntent`
- [ ] Pass `{ postOnly: true }` in `params` to CCXT `createOrder` in `ExchangeConnectorAdapterService.placeLimitOrder`
- [ ] PMM strategy: set `postOnly: true` on all create intents
- [ ] Handle exchange rejection (order would cross book) gracefully: mark intent as `FAILED`, do not retry
- [ ] Unit tests: postOnly param passed, rejection handled without retry

### #45 Add transaction costs to spread

- [ ] Fetch maker/taker fee rates per `(exchange, pair)` from exchange metadata
- [ ] In `buildQuotes`: widen buy price by `price *= (1 - fee%)`, sell price by `price *= (1 + fee%)`
- [ ] Compose with #44: effective minimum width = max(minimumSpread, 2 × fee%)
- [ ] Unit tests: spread widened correctly, composition with minimumSpread

### #50 filled_order_delay

- [ ] Add `filledOrderDelay` config (milliseconds) to `PureMarketMakingStrategyDto`
- [ ] Track `lastFillTimestamp` per strategy session in controller or strategy service
- [ ] In `decideActions`: if `now - lastFillTimestamp < filledOrderDelay`, return empty actions (skip cycle)
- [ ] Update `lastFillTimestamp` when fill events are received via WS or REST reconciliation
- [ ] Unit tests: cycle skipped during cooldown, resumes after cooldown expires

---

## Phase 4 — Stability and API Pressure Reduction

### #43 Order refresh tolerance

- [ ] Add `orderRefreshTolerancePct` config to `PureMarketMakingStrategyDto`
- [ ] Before cancel+replace: compare new quote prices against existing open order prices
- [ ] If all price diffs < tolerance %: skip cancel+replace, reuse existing orders
- [ ] Unit tests: refresh skipped when drift is small, refresh triggered when drift exceeds tolerance

### #51 Max order age

- [ ] Add `maxOrderAge` config (milliseconds) to `PureMarketMakingStrategyDto`
- [ ] Track `createdAt` timestamp per tracked order
- [ ] On each tick: cancel orders where `now - createdAt > maxOrderAge`, regardless of price drift
- [ ] Hanging orders also subject to max age (cancel + re-create at same price)
- [ ] Unit tests: stale orders cancelled, fresh orders preserved

### #84 Hanging orders cancel percentage

- [ ] Add `hangingOrdersCancelPct` config to `PureMarketMakingStrategyDto`
- [ ] On each tick: for each hanging order, compute `abs(orderPrice - midPrice) / midPrice`
- [ ] Cancel hanging order if drift exceeds `hangingOrdersCancelPct`
- [ ] Unit tests: far-drifted hanging orders cancelled, close ones preserved

---

## Validation

### Unit tests

- [ ] State transition validity and illegal-transition rejection
- [ ] Quantization and min-notional enforcement
- [ ] Fee-aware spread computation
- [ ] Kill-switch threshold calculation
- [ ] Health-gate decision logic
- [ ] POST_ONLY rejection handling

### Integration tests

- [ ] Adapter-level order create/cancel/open-order reconciliation
- [ ] Dual-update dedup between WebSocket and REST
- [ ] Startup restoration with persisted tracked state
- [ ] Graceful shutdown cancel-all behavior

### System tests

- [ ] Repeated PMM tick cycles with live tracked orders and partial fills
- [ ] Restart during active quotes
- [ ] Temporary WebSocket loss with REST recovery
- [ ] Connector disconnect / reconnect gating
- [ ] Insufficient balance and rejection-path coverage
- [ ] Kill switch trigger → stopped + cancel-all

### Soak tests

- [ ] Multi-hour sandbox run with bounded memory, bounded tracked-order count, bounded API churn
- [ ] No duplicate local/exchange order divergence across reconnect and fill scenarios

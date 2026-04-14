# Hummingbot Gap Analysis: Mr.Market Execution Engine

> Comprehensive comparison of Mr.Market's market-making execution engine against Hummingbot's full capability surface.
> Generated: 2026-04-05

## Table of Contents

- [Executive Summary](#executive-summary)
- [Architectural Comparison](#architectural-comparison)
- [What We Already Have](#what-we-already-have)
- [Gap Analysis](#gap-analysis)
  - [Tier 1: Foundation (Connector + Multi-Leg)](#tier-1-foundation)
  - [Tier 2: Strategies + PMM Depth](#tier-2-strategies)
  - [Tier 3: Executors + DeFi + Fees](#tier-3-executors)
  - [Tier 4: Operations + Infrastructure](#tier-4-operations)
- [Suggested Implementation Order](#suggested-implementation-order)

---

## Executive Summary

Mr.Market's execution engine is a **multi-tenant, tick-driven, intent-based pooled executor** system. It correctly solves multi-user order pooling — something Hummingbot (single-user, single-strategy) has no equivalent for. However, the executor boundary was scoped at `(exchange, pair)` rather than allowing multi-leg coordination, which blocks cross-venue strategies like XEMM and Spot-Perpetual Arbitrage.

**Total gaps identified: 84** across 4 tiers.

| Tier | Count | Scope |
|---|---|---|
| Tier 1: Foundation | 12 | Multi-leg executor, derivative connector, event bus, order state machine, user streams, trading rules, time sync, connector internals |
| Tier 2: Strategies | 25 | XEMM, Perp MM, Spot-Perp Arb, AMM Arb, Avellaneda, proposal pipeline, PMM micro-features, arb specifics |
| Tier 3: Executors + DeFi + Fees | 13 | Triple barrier, DCA, Grid, TWAP, CLMM LP, Gateway middleware, fee system depth |
| Tier 4: Operations + Infra | 34 | Backtesting, trade recorder, PnL reporting, notifications, remote control, order book depth, deployment |

---

## Architectural Comparison

### Hummingbot: Strategy Owns Multiple Connectors

```
Clock (1s tick)
  ├── ConnectorBase (Binance Spot)    ─┐
  ├── ConnectorBase (Binance Perp)    ─┤── Strategy holds REFERENCES to both
  └── Strategy                        ─┘   via MarketTradingPairTuple
```

- **`MarketTradingPairTuple`** = `(connector_instance, pair, base, quote)` — a strategy can hold N of these, each pointing to a different exchange/instrument.
- **`buy_with_specific_market(tuple)`** — the strategy directs each order to a specific connector by reference.
- **Event bus per connector** — a single strategy subscribes to fill events from ALL its connectors simultaneously via `c_add_markets()`.
- **`DerivativeBase`** extends `ExchangeBase` with `set_leverage()`, `set_position_mode()`, `get_funding_info()` — spot and perp share the same `buy()/sell()` interface.

### Mr.Market: Executor Owns One Exchange-Pair

```
ClockTick
  └── ExecutorRegistry
        └── ExchangePairExecutor("binance", "BTC/USDT")  ← single venue
              └── sessions[]  ← strategies sharing this one venue
```

### Key Differences

| Dimension | Hummingbot | Mr.Market |
|---|---|---|
| **Addressing unit** | `MarketTradingPairTuple(connector, pair)` — strategy holds N | `ExchangePairExecutor(exchange, pair)` — one per executor |
| **Order routing** | `buy_with_specific_market(tuple)` — targets any connector | `StrategyOrderIntent.exchange` — single exchange field |
| **Fill events** | Strategy subscribes to ALL connectors' events via pub/sub | Executor dispatches fills only within its own `(exchange, pair)` |
| **Cross-leg coordination** | Strategy-level: `did_fill_order()` → hedge on other connector | None — no concept of linked legs |
| **Instrument types** | `ExchangeBase` (spot) vs `DerivativeBase` (perp) with shared interface | No spot/perp distinction |
| **State machine** | XEMM: hedging-in-flight gate; Spot-Perp: `Closed→Opening→Opened→Closing` | No multi-leg state machine |
| **Multi-tenancy** | Single-user per bot instance | Multi-user pooling per `(exchange, pair)` ✅ |

### Design Tradeoff (Not a Mistake)

The two systems optimized for different things:

- **Hummingbot** = single-user, single-strategy instance. Multi-venue is easy because nothing is shared.
- **Mr.Market** = multi-tenant, multi-order. The `ExchangePairExecutor` pools multiple users' orders on the same `(exchange, pair)` to share market data, tick cycles, and connections.

The engine correctly solved multi-tenancy but scoped the executor boundary too narrowly. The two capabilities aren't mutually exclusive — a `MultiLegExecutor` can coordinate across venues while pooling market data per-venue underneath.

---

## What We Already Have

| Capability | Implementation |
|---|---|
| Pure Market Making | `PureMarketMakingStrategyController` with layers, spreads, inventory skew, hanging orders |
| Cross-Exchange Arbitrage | `ArbitrageStrategyController` (basic, same-pair spot-spot) |
| Volume/Wash Trading | `VolumeStrategyController` for CEX + DEX (AMM) |
| Technical Indicator Strategy | `TimeIndicatorStrategyController` (EMA/RSI) |
| Tick-based execution | `ClockTickCoordinatorService` → `ExchangePairExecutor` |
| Intent-based order pipeline | `StrategyOrderIntent` → `StrategyIntentExecutionService` |
| Multi-tenant pooling | `ExecutorRegistry` sharing market data per `(exchange, pair)` |
| Order book tracking | `OrderBookTrackerService` (CCXT + WebSocket) |
| Balance ledger | `BalanceLedgerService` with auditability |
| Fee management | `FeeModule` |
| Exchange abstraction | CCXT-based via `ExchangeConnectorAdapterService` |
| Trade fill recording | `FillRoutingService` → `StrategyService` ledger adjustments |
| PnL recording | `PerformanceService` (basic) |
| Strategy execution history | `StrategyExecutionHistory` entity |
| Paper trading (test only) | `SandboxExchangeHelper` in test infra |

---

## Gap Analysis

### Tier 1: Foundation

> These primitives unblock everything else. Without them, multi-venue strategies cannot be built.

#### #1 — Multi-Leg Executor

| | |
|---|---|
| **Hummingbot** | `MarketTradingPairTuple` + `buy_with_specific_market()` — strategy holds N venue references |
| **What to Build** | A `MultiLegExecutor` that coordinates 2+ `(exchange, pair, instrumentType)` legs as one unit, with cross-leg event bridging (fill on leg A → action on leg B) |
| **Priority** | Critical |

#### #2 — Derivative Connector Interface

| | |
|---|---|
| **Hummingbot** | `DerivativeBase` extending `ExchangeBase` with `set_leverage()`, `set_position_mode()`, `get_funding_info()`, `account_positions` |
| **What to Build** | Extend `ExchangeConnectorAdapterService` with a `DerivativeConnectorAdapter` wrapping CCXT's futures API — unified `buy()/sell()` but with position/margin/funding methods |
| **Priority** | Critical |

#### #3 — Cross-Connector Event Bus

| | |
|---|---|
| **Hummingbot** | `StrategyBase.c_add_markets()` subscribing to N connectors' events simultaneously |
| **What to Build** | A `StrategyEventBus` where a strategy subscribes to fill/cancel/error events from multiple `(exchange, pair)` executors simultaneously |
| **Priority** | Critical |

#### #4 — Order Tracker with Cross-Connector Awareness

| | |
|---|---|
| **Hummingbot** | `OrderTracker` keyed by `MarketTradingPairTuple` with shadow orders, in-flight cancel tracking |
| **What to Build** | Extend current intent store to track orders across multiple venues with `maker↔taker` linkage maps |
| **Priority** | Critical |

#### #19 — In-Flight Order State Machine

| | |
|---|---|
| **Hummingbot** | `InFlightOrder` with states: `PENDING_CREATE → OPEN → PARTIALLY_FILLED → PENDING_CANCEL → CANCELED/FILLED/FAILED` |
| **Status** | We have `ExchangeOrderTracker` but no formal state machine per order — no partial fill tracking, no `PENDING_CANCEL` dedup |
| **Priority** | High |

#### #20 — User Stream Tracker (Private WebSocket)

| | |
|---|---|
| **Hummingbot** | `UserStreamTracker` — dedicated authenticated WebSocket per connector for fills, balance updates, position changes |
| **Status** | A normalized `UserStreamIngestionService` now exists, but connector-specific standardization and full parity remain in progress |
| **Priority** | High |

#### #21 — Trading Rules / Quantization

| | |
|---|---|
| **Hummingbot** | `TradingRule` per pair — min order size, price/qty step, min notional, enforced before order placement |
| **Status** | Not implemented — we rely on CCXT's defaults but don't enforce/validate pre-submission |
| **Priority** | High |

#### #22 — Time Synchronizer

| | |
|---|---|
| **Hummingbot** | `TimeSynchronizer` — corrects clock drift between bot and exchange server |
| **Status** | Missing — can cause order rejections on exchanges with strict timestamp validation |
| **Priority** | Medium |

#### #38 — Dual Update Mechanism (WS + REST Fallback)

| | |
|---|---|
| **Hummingbot** | WebSocket for instant fills + REST polling every 10s as redundancy; `ClientOrderTracker` deduplicates |
| **Status** | We rely on one path only — no redundant reconciliation loop |
| **Priority** | High |

#### #39 — WebAssistantsFactory / Auth Abstraction

| | |
|---|---|
| **Hummingbot** | Per-exchange `AuthBase` (HMAC signing), `WebAssistantsFactory` producing configured REST + WS clients |
| **Status** | We use raw CCXT — no pluggable auth layer or standardized WS factory |
| **Priority** | Low (CCXT handles this) |

#### #40 — AsyncThrottler (Per-Endpoint Rate Limits)

| | |
|---|---|
| **Hummingbot** | Each exchange endpoint has `RateLimit(weight, time_window)`, throttler auto-delays when approaching limits |
| **Status** | We have `withRateLimit` wrapper but it's global, not per-endpoint weighted |
| **Priority** | Medium |

#### #41 — Tracking State Persistence + Restoration

| | |
|---|---|
| **Hummingbot** | `ConnectorBase.tracking_states` serializes in-flight orders; `restore_tracking_states()` rehydrates on restart |
| **Status** | Missing — in-flight order state is lost on server restart |
| **Priority** | High |

#### #42 — MarketsRecorder Event Subscription

| | |
|---|---|
| **Hummingbot** | Subscribes to ALL connector events, persists every `Order`, `TradeFill`, balance snapshot to SQLAlchemy/SQLite |
| **Status** | `StrategyExecutionHistory` only records strategy-level events, not raw connector-level fills |
| **Priority** | Medium |

---

### Tier 2: Strategies

> Core strategies and PMM feature depth.

#### Core Strategies

#### #5 — XEMM (Cross-Exchange Market Making)

| | |
|---|---|
| **Hummingbot** | `CrossExchangeMarketMakingStrategy` — maker quotes anchored to taker VWAP, fill-driven hedging |
| **What to Build** | `XemmStrategyController` using multi-leg executor: quote on maker exchange, on fill → hedge on taker. Requires `ready_for_new_trades()` gate, `maker↔taker` order ID tracking |
| **Priority** | High |

#### #6 — Perpetual Market Making

| | |
|---|---|
| **Hummingbot** | `PerpetualMarketMakingStrategy` — PMM adapted for futures with position/funding awareness |
| **What to Build** | `PerpMarketMakingController` using derivative connector: same PMM logic but with `PositionAction.OPEN/CLOSE`, funding rate pause, hedge/oneway mode |
| **Priority** | High |

#### #7 — Spot-Perpetual Arbitrage

| | |
|---|---|
| **Hummingbot** | `SpotPerpetualArbitrageStrategy` — state machine `Closed→Opening→Opened→Closing` |
| **What to Build** | `SpotPerpArbController` using multi-leg executor: simultaneous spot+perp orders, state machine for position lifecycle, funding rate capture |
| **Priority** | High |

#### #8 — AMM Arbitrage

| | |
|---|---|
| **Hummingbot** | `AmmArbStrategy` — CEX vs DEX/AMM arb with Gateway integration |
| **What to Build** | `AmmArbController` — already have DEX volume infra, need to compose with CEX connector for cross-venue arb proposals |
| **Priority** | Medium |

#### #9 — Avellaneda-Stoikov Market Making

| | |
|---|---|
| **Hummingbot** | `AvellanedaMarketMakingStrategy` — volatility/intensity-driven dynamic spreads |
| **What to Build** | `AvellanedaController` with `InstantVolatilityIndicator` + `TradingIntensityIndicator`, reservation price formula `r = mid - q·γ·σ·T` |
| **Priority** | Medium |

#### Strategy Infrastructure

#### #23 — Proposal Pipeline Pattern

| | |
|---|---|
| **Hummingbot** | `Proposal(buys[], sells[])` → modifiers (price bands → price optimization → size skew → budget constraint → filter takers) |
| **Status** | Our PMM builds actions directly — no composable modifier pipeline |
| **Priority** | Medium |

#### #24 — Price Delegates

| | |
|---|---|
| **Hummingbot** | `OrderBookAssetPriceDelegate` / `APIAssetPriceDelegate` — source reference price from another exchange or HTTP API |
| **Status** | We have `oracleExchangeName` on PMM but no general abstraction |
| **Priority** | Medium |

#### #25 — Conditional Execution States

| | |
|---|---|
| **Hummingbot** | `RunAlwaysExecutionState` / `RunInTimeConditionalExecutionState` — time-windowed strategy activation |
| **Status** | Missing — strategies run continuously once started |
| **Priority** | Low |

#### #26 — Ping-Pong Mode

| | |
|---|---|
| **Hummingbot** | After a buy fill, only place sells next tick (and vice versa) — prevents continuous accumulation |
| **Status** | Missing |
| **Priority** | Medium |

#### #27 — Moving Price Band

| | |
|---|---|
| **Hummingbot** | Dynamic floor/ceiling that resets around current price every N seconds |
| **Status** | Missing — we have static `floorPrice`/`ceilingPrice` |
| **Priority** | Medium |

#### #28 — Order Optimization (Best Bid/Ask Jumping)

| | |
|---|---|
| **Hummingbot** | Adjusts limit price to just above best bid / below best ask for priority fill, with configurable depth filtering to skip dust orders |
| **Status** | Missing |
| **Priority** | Medium |

#### PMM Micro-Features

#### #43 — Order Refresh Tolerance

| | |
|---|---|
| **Hummingbot** | Skips cancel+replace if price drifted < tolerance % — reduces unnecessary order churn and exchange API calls |
| **Status** | Missing — every tick cycle replaces orders |
| **Priority** | Medium |

#### #44 — Minimum Spread Enforcement

| | |
|---|---|
| **Hummingbot** | Auto-cancels orders if spread narrows below `minimum_spread` — prevents unprofitable fills during volatility |
| **Status** | Missing |
| **Priority** | High |

#### #45 — Add Transaction Costs to Spread

| | |
|---|---|
| **Hummingbot** | `add_transaction_costs` — automatically widens spread by maker+taker fee to guarantee post-fee profitability |
| **Status** | Missing |
| **Priority** | High |

#### #46 — Inventory Cost Pricing

| | |
|---|---|
| **Hummingbot** | `InventoryCostPriceDelegate` — reference price = average cost basis from historical fills; prevents selling below cost |
| **Status** | Missing |
| **Priority** | Medium |

#### #47 — Split Order Levels

| | |
|---|---|
| **Hummingbot** | `split_order_levels_enabled` — per-level custom spreads and amounts (not uniform increments) |
| **Status** | Missing — our layers use uniform `amountChangePerLayer` |
| **Priority** | Low |

#### #48 — Order Override (Fully Custom Orders)

| | |
|---|---|
| **Hummingbot** | `order_override` dict — bypass all spread/level logic with explicit `{side, spread, size}` per order |
| **Status** | Missing |
| **Priority** | Low |

#### #49 — `take_if_crossed` Mode

| | |
|---|---|
| **Hummingbot** | When using external price source, allow orders to cross the book (aggressive fill) |
| **Status** | Missing |
| **Priority** | Low |

#### #50 — `filled_order_delay`

| | |
|---|---|
| **Hummingbot** | Pause order placement for N seconds after a fill to avoid immediate re-entry in volatile conditions |
| **Status** | Missing |
| **Priority** | Medium |

#### #51 — Max Order Age

| | |
|---|---|
| **Hummingbot** | Force-cancel and refresh orders older than N seconds regardless of price movement |
| **Status** | Missing — we only have `orderRefreshTime` |
| **Priority** | Medium |

#### #84 — Hanging Orders Cancel Percentage

| | |
|---|---|
| **Hummingbot** | `hanging_orders_cancel_pct` — auto-cancel hanging orders when their price drifts more than N% from mid price; also renews hanging orders past `max_order_age` |
| **Status** | We have `hangingOrdersEnabled` but no cancel-percentage threshold — hanging orders persist indefinitely regardless of price drift |
| **Priority** | Medium |

#### #52 — POST_ONLY Order Type

| | |
|---|---|
| **Hummingbot** | Force maker-only orders (reject if would take) |
| **Status** | CCXT supports it but our intent pipeline doesn't distinguish order types |
| **Priority** | High |

#### Arb & XEMM Specifics

#### #65 — Concurrent vs Sequential Order Submission

| | |
|---|---|
| **Hummingbot** | AMM Arb supports both modes — sequential submits the slower leg (on-chain) first, waits for fill, then submits the fast leg; concurrent submits both simultaneously |
| **Status** | Missing — our arb places both legs without coordination or configurability |
| **Priority** | High |

#### #66 — EVM/On-Chain Leg Prioritization

| | |
|---|---|
| **Hummingbot** | `prioritize_evm_exchanges()` auto-detects Gateway/DEX legs and reorders so on-chain tx goes first (it's slower) |
| **Status** | Missing |
| **Priority** | Medium |

#### #67 — Gas/Network Fee in Profitability Calculation

| | |
|---|---|
| **Hummingbot** | `extra_flat_fees` from `network_transaction_fee` are subtracted from profit before comparing to `min_profitability` |
| **Status** | Missing — our arb doesn't account for gas costs |
| **Priority** | High |

#### #68 — Per-Market Slippage Buffers

| | |
|---|---|
| **Hummingbot** | `market_1_slippage_buffer` / `market_2_slippage_buffer` — different slippage for CEX (0%) vs DEX (1%) |
| **Status** | Missing |
| **Priority** | Medium |

#### #69 — `ready_for_new_trades()` Gate

| | |
|---|---|
| **Hummingbot** | Blocks new arb proposals while any in-flight orders exist on either leg — prevents overlapping arb attempts |
| **Status** | Missing — our arb doesn't gate on in-flight state |
| **Priority** | High |

#### #70 — Arb Proposal `wait()` with Completion Events

| | |
|---|---|
| **Hummingbot** | `ArbProposalSide` has `asyncio.Event` signals; strategy awaits both legs completing before allowing next cycle |
| **Status** | Missing — no per-leg completion signaling |
| **Priority** | High |

#### #71 — Taker Hedge Retry on Failure

| | |
|---|---|
| **Hummingbot** | XEMM retries failed taker hedges via `check_and_hedge_orders()` re-invocation |
| **Status** | Missing |
| **Priority** | High |

#### #72 — Order ID Expiry Tracker for XEMM

| | |
|---|---|
| **Hummingbot** | `OrderIDMarketPairTracker` with 180s TTL — auto-purges stale order→market-pair mappings |
| **Status** | Missing |
| **Priority** | Medium |

---

### Tier 3: Executors + DeFi + Fees

> V2-style executor types, DeFi infra, and fee system depth.

#### V2-Style Executor Types

#### #10 — Position Executor (Triple Barrier)

| | |
|---|---|
| **Hummingbot** | `PositionExecutor` with stop-loss / take-profit / time-limit / trailing stop |
| **What to Build** | A `TripleBarrierExecutor` that wraps any entry order with configurable exit conditions |
| **Priority** | High |

#### #11 — DCA Executor

| | |
|---|---|
| **Hummingbot** | `DCAExecutor` — dollar-cost-average into position at specified price levels |
| **What to Build** | `DcaExecutor` emitting layered buy intents at decreasing prices |
| **Priority** | Medium |

#### #12 — Grid Executor

| | |
|---|---|
| **Hummingbot** | `GridExecutor` — grid of buy/sell orders between price bounds |
| **What to Build** | `GridExecutor` managing inventory across grid levels |
| **Priority** | Medium |

#### #13 — TWAP Executor

| | |
|---|---|
| **Hummingbot** | `TWAPExecutor` — time-weighted average price execution |
| **What to Build** | `TwapExecutor` splitting large orders into equal time-sliced chunks |
| **Priority** | Medium |

#### #14 — Limit Chaser

| | |
|---|---|
| **Hummingbot** | `OrderExecutor` with `LimitChaserConfig` — continuously updates limit price to track best bid/ask |
| **What to Build** | Add chase mode to existing intent execution |
| **Priority** | Low |

#### DeFi / LP

#### #29 — CLMM LP Executor

| | |
|---|---|
| **Hummingbot** | `LPExecutor` — manages concentrated liquidity positions (open/close/adjust range) on Uniswap V3, Raydium CLMM etc. |
| **Status** | Documented in specs but not implemented in execution engine |
| **Priority** | Medium |

#### #30 — Gateway-Style DeFi Middleware

| | |
|---|---|
| **Hummingbot** | Separate process for blockchain interactions: wallet management, token approvals, gas estimation, swap routing |
| **Status** | We have direct DEX execution via `DexVolumeStrategyService` but no abstracted middleware layer |
| **Priority** | Medium |

#### #31 — Token Approval / Allowance Management

| | |
|---|---|
| **Hummingbot** | `approve_token()`, `get_allowances()` — automated ERC-20 approval before DEX trades |
| **Status** | Missing — handled manually |
| **Priority** | Medium |

#### V2 Framework Concepts

#### #53 — MarketDataProvider

| | |
|---|---|
| **Hummingbot** | Centralized candle/orderbook/ticker provider shared across controllers; caches OHLCV data |
| **Status** | We fetch market data per-strategy — no shared provider with caching |
| **Priority** | Medium |

#### #54 — Controller Composability (Multi-Controller)

| | |
|---|---|
| **Hummingbot** | `StrategyV2Base` runs N `ControllerBase` instances simultaneously, each managing independent executor pools |
| **Status** | Our engine runs strategies independently — no composition of multiple controllers into one strategy |
| **Priority** | Low |

#### #55 — ExecutorFilter (Queryable Executor State)

| | |
|---|---|
| **Hummingbot** | Filter executors by connector, pair, type, status, side, PnL range, time range — composable AND/OR queries |
| **Status** | No equivalent — we track orders but can't query them by multi-dimensional criteria |
| **Priority** | Low |

#### #56 — PositionHold Accumulation

| | |
|---|---|
| **Hummingbot** | `CloseType.POSITION_HOLD` — stop executor without closing position; accumulate net position across multiple executors |
| **Status** | Missing — each strategy instance manages its own position independently |
| **Priority** | Low |

#### #57 — Activation Bounds

| | |
|---|---|
| **Hummingbot** | `PositionExecutor` delays entry order until market price is within N% of target — keeps capital free until price approaches |
| **Status** | Missing |
| **Priority** | Low |

#### Fee System Depth

#### #73 — TradeFeeSchema / TradeFeeSchemaLoader

| | |
|---|---|
| **Hummingbot** | Typed fee model per exchange: `AddedToCostTradeFee` vs `DeductedFromReturnsTradeFee` — handles BNB discount, fee-in-received-token, flat fees, percent fees |
| **Status** | We have a `FeeModule` but no typed fee model distinguishing fee deduction modes |
| **Priority** | Medium |

#### #74 — `build_trade_fee()` with Token Conversion

| | |
|---|---|
| **Hummingbot** | `TradeFeeBase.fee_amount_in_token(token)` — converts any fee (percent, flat, mixed) into a specific token amount using rate oracle |
| **Status** | Missing — we calculate fees as simple percentages |
| **Priority** | Medium |

#### #75 — FixedRateSource + RateOracle Dual Mode

| | |
|---|---|
| **Hummingbot** | Strategy chooses live oracle or static fixed rates for cross-quote conversion; `FixedRateSource.find_rate()` supports inverse lookups |
| **Status** | Missing |
| **Priority** | Medium |

---

### Tier 4: Operations + Infrastructure

> Operational tooling, observability, and production readiness.

#### Core Infrastructure

#### #15 — Rate Oracle

| | |
|---|---|
| **Hummingbot** | `RateOracle` — fetches cross-pair conversion rates from Binance/CoinGecko/custom; used by XEMM, AMM Arb for heterogeneous quote currencies |
| **Status** | Missing |
| **Priority** | High |

#### #16 — Paper Trade Connector

| | |
|---|---|
| **Hummingbot** | `PaperTradeExchange` — full simulated exchange with local order book matching |
| **What to Build** | Formalize `SandboxExchangeHelper` into a proper `PaperTradeAdapter` implementing the same connector interface |
| **Priority** | Medium |

#### #17 — Order Restoration on Restart

| | |
|---|---|
| **Hummingbot** | `c_track_restored_orders()` — reconciles open orders on exchange with in-memory tracker on startup |
| **What to Build** | On engine startup, query open orders from exchange and re-register into `ExecutorRegistry` sessions |
| **Priority** | High |

#### #18 — Budget Checker

| | |
|---|---|
| **Hummingbot** | `BudgetChecker.adjust_candidate()` — validates order affordability before submission |
| **What to Build** | Pre-flight balance validation in intent pipeline, rejecting intents that exceed available balance |
| **Priority** | High |

#### Backtesting & Analytics

#### #32 — Backtesting Engine

| | |
|---|---|
| **Hummingbot** | `ClockMode.BACKTEST` — same Clock drives historical data replay, strategies run identically in backtest vs live |
| **Status** | Missing entirely — no way to simulate strategies on historical data |
| **Priority** | Medium |

#### #33 — MarketsRecorder (Trade Persistence)

| | |
|---|---|
| **Hummingbot** | SQLAlchemy-based `MarketsRecorder` recording every `TradeFill`, `Order`, balance snapshot to SQLite |
| **Status** | We have `StrategyExecutionHistory` + `BalanceLedger` but no unified trade recorder with per-fill granularity |
| **Priority** | Medium |

#### #34 — Performance Reporting

| | |
|---|---|
| **Hummingbot** | `PerformanceReport` — realized + unrealized PnL, breakeven price, per-controller analytics |
| **Status** | `PerformanceService` exists but is basic — no unrealized PnL, no per-strategy breakdowns |
| **Priority** | Medium |

#### Notifications & Remote Control

#### #35 — Notification System

| | |
|---|---|
| **Hummingbot** | Telegram, Discord, Slack notifiers for trade events |
| **Status** | Missing |
| **Priority** | Low |

#### #36 — MQTT Remote Control

| | |
|---|---|
| **Hummingbot** | Headless mode with MQTT command bus for remote start/stop/status |
| **Status** | Missing — we have REST API but no pub/sub remote control |
| **Priority** | Low |

#### #37 — `format_status()` Live Dashboard

| | |
|---|---|
| **Hummingbot** | Every strategy implements `format_status()` returning a formatted text summary of current state, active orders, spreads, inventory |
| **Status** | No equivalent live strategy status view |
| **Priority** | Medium |

#### Safety & Limits

#### #58 — Kill Switch

| | |
|---|---|
| **Hummingbot** | Auto-stop all strategies when total PnL drops below a configurable loss threshold |
| **Status** | Missing |
| **Priority** | High |

#### #59 — Balance Limiting

| | |
|---|---|
| **Hummingbot** | `apply_balance_limit()` — cap how much of each token the bot can use, even if exchange balance is higher |
| **Status** | Missing |
| **Priority** | Medium |

#### #60 — Network Status Monitoring Per Connector

| | |
|---|---|
| **Hummingbot** | Each connector reports `NetworkStatus.CONNECTED/NOT_CONNECTED`; strategies gate on all connectors being healthy |
| **Status** | We don't gate strategy ticks on connector health |
| **Priority** | High |

#### #61 — RateOracle with Multiple Sources

| | |
|---|---|
| **Hummingbot** | `RateOracle` — fetches cross-pair conversion rates from Binance/CoinGecko/custom; used by XEMM, AMM Arb for heterogeneous quote currencies |
| **Status** | Missing |
| **Priority** | High |

#### #62 — Config Encryption (SecretStr)

| | |
|---|---|
| **Hummingbot** | API keys stored as `SecretStr`, encrypted at rest with user password via `Security` module |
| **Status** | We store API keys in DB but no client-side encryption layer |
| **Priority** | Medium |

#### Market Data Depth

#### #63 — Order Book VWAP Queries

| | |
|---|---|
| **Hummingbot** | `get_vwap_for_volume(pair, is_buy, volume)` / `get_price_for_volume()` — built-in order book depth queries |
| **Status** | Missing — we fetch raw order book but don't provide VWAP helpers |
| **Priority** | High |

#### #64 — Script/Plugin System for User Strategies

| | |
|---|---|
| **Hummingbot** | Users drop `.py` files in `scripts/` or `controllers/` — loaded at runtime without modifying core |
| **Status** | No plugin system — strategies must be coded into the server module |
| **Priority** | Low |

#### Order Book & Market Data

#### #76 — Order Book Message Types (Incremental Diffs)

| | |
|---|---|
| **Hummingbot** | `OrderBookMessage` with `SNAPSHOT`, `DIFF`, `TRADE` types — separate queues for each stream; incremental diff application on top of snapshot |
| **Status** | We get full snapshots from CCXT — no incremental diff updates |
| **Priority** | Medium |

#### #77 — `get_quote_price()` vs `get_order_price()`

| | |
|---|---|
| **Hummingbot** | `quote_price` for profit calculation (may differ from execution price), `order_price` for actual submission — separates analysis from execution |
| **Status** | We use a single price for both |
| **Priority** | Medium |

#### #78 — Candles Feed / OHLCV Streaming

| | |
|---|---|
| **Hummingbot** | `CandlesFactory` / `CandlesBase` — real-time candle feeds with configurable intervals, used by V2 controllers for indicator computation |
| **Status** | We fetch OHLCV on-demand but don't stream it |
| **Priority** | Medium |

#### #79 — Composite Order Book (Paper Trade)

| | |
|---|---|
| **Hummingbot** | `CompositeOrderBook` merges real exchange data with simulated order matching for paper trading |
| **Status** | Missing |
| **Priority** | Low |

#### Operational Features

#### #80 — Structured Logging with LogOption Flags

| | |
|---|---|
| **Hummingbot** | Per-strategy configurable log verbosity — `CREATE_ORDER`, `ADJUST_ORDER`, `MAKER_ORDER_FILLED`, `STATUS_REPORT` etc. can be toggled independently |
| **Status** | We log everything or nothing — no granular log control |
| **Priority** | Low |

#### #81 — `format_status()` with DataFrames

| | |
|---|---|
| **Hummingbot** | Every strategy produces structured status tables: active orders, inventory stats, PnL, spread analysis — accessible via `status` command |
| **Status** | Missing — no live strategy introspection |
| **Priority** | Medium |

#### #82 — Graceful Shutdown with Cancel-All

| | |
|---|---|
| **Hummingbot** | On stop: cancel all outstanding orders on all connectors, stop clock, stop recorder, clear references |
| **Status** | We stop strategies but don't guarantee all exchange orders are cancelled |
| **Priority** | High |

#### #83 — Docker Compose Multi-Service Deployment

| | |
|---|---|
| **Hummingbot** | `docker-compose.yml` with `hummingbot` + `gateway` services, volume mounts for `conf/`, `logs/`, `data/`, `scripts/` |
| **Status** | No containerized deployment story for the MM engine |
| **Priority** | Low |

---

## Suggested Implementation Order

### Phase 1: Foundation (Unblocks multi-venue strategies)

```
#2  Derivative Connector Interface
#3  Cross-Connector Event Bus
#1  Multi-Leg Executor
#4  Order Tracker with Cross-Connector Awareness
#19 In-Flight Order State Machine
#21 Trading Rules / Quantization
#38 Dual Update Mechanism
#41 Tracking State Persistence
```

### Phase 2: Flagship Strategies

```
#5  XEMM (Cross-Exchange Market Making)
#6  Perpetual Market Making
#7  Spot-Perpetual Arbitrage
#69 ready_for_new_trades() Gate
#70 Arb Proposal wait() with Completion Events
#71 Taker Hedge Retry
#65 Concurrent vs Sequential Submission
```

### Phase 3: PMM Hardening

```
#44 Minimum Spread Enforcement
#45 Add Transaction Costs to Spread
#52 POST_ONLY Order Type
#43 Order Refresh Tolerance
#26 Ping-Pong Mode
#27 Moving Price Band
#28 Order Optimization
#50 filled_order_delay
#51 Max Order Age
```

### Phase 4: Executors

```
#10 Triple Barrier (Position Executor)
#11 DCA Executor
#12 Grid Executor
#13 TWAP Executor
#14 Limit Chaser
```

### Phase 5: Infrastructure & Safety

```
#15 Rate Oracle
#17 Order Restoration on Restart
#18 Budget Checker
#58 Kill Switch
#60 Network Status Monitoring
#63 Order Book VWAP Queries
#82 Graceful Shutdown with Cancel-All
#67 Gas/Network Fee in Profitability
```

### Phase 6: Polish & Advanced

```
#8  AMM Arbitrage
#9  Avellaneda-Stoikov MM
#23 Proposal Pipeline
#32 Backtesting Engine
#34 Performance Reporting
#73-75 Fee System Depth
#29-31 DeFi/LP Features
#53-57 V2 Framework Concepts
Remaining items from Tier 4
```

---

## References

- **Hummingbot Docs**: https://deepwiki.com/hummingbot/hummingbot/
- **Hummingbot GitHub**: https://github.com/hummingbot/hummingbot
- **Mr.Market Architecture**: `docs/architecture/market-making-flow.md`
- **Mr.Market Execution Engine**: `server/src/modules/market-making/strategy/`

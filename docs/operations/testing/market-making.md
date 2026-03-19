# Market Making Test Guide

This document covers the current CCXT sandbox integration scope for market making.

It documents the sandbox suites that are currently implemented today.

The broader production-parity target is tracked separately in `docs/roadmap/ccxt-sandbox-integration-testing-plan.md`. That target requires the same `ExchangeInitService`, `start_mm`, `stop_mm`, tick, and execution runtime path as mainnet. The current implemented scope is narrower.

The currently implemented sandbox scope is intentionally limited to the runtime behaviors that already exist:

- Phase 1: environment-driven sandbox bootstrap through the real exchange init path for core lifecycle coverage
- Phase 2: real exchange adapter REST lifecycle coverage
- Phase 3: fill-routing resolution coverage with repository-backed mappings
- Phase 4: runtime control parity through real `start_mm` and `stop_mm`
- Phase 5: single-tick parity through the real executor, intent, exchange execution, mapping, tracker, and history path
- Phase 6: multi-layer parity through the real executor with layered price and quantity assertions plus hanging-order preservation
- Phase 7: cadence parity through repeated eligible ticks with deterministic submitted `clientOrderId` sequencing
- Phase 8: private-fill parity through real `watchOrders()` ingestion and dual-account live-fill assertion
- Phase B1: order creation and payment intake parity through real order-intent creation, snapshot intake, and `payment_complete`

It still does not claim the broader Track B withdrawal, campaign, reward, or reconciliation lifecycle.

## Current Integration Scope

### Phase 1: Sandbox Harness

- `ExchangeInitService` can boot one sandbox exchange from `CCXT_SANDBOX_*` env through the normal runtime service path
- sandbox mode is enabled before `loadMarkets()` when sandbox env is present
- exchange-specific sandbox overrides still apply when required, including Binance spot-only market loading
- legacy sandbox helper usage now lives under `server/test/system/helpers/sandbox-exchange.helper.ts`
- new system-test specs and support files live under `server/test/system`
- the default unit suite ignores `*.system.spec.ts`

### Phase 2: Adapter Integration

Spec: `server/test/system/market-making/execution/sandbox-order-lifecycle.system.spec.ts`

Coverage:

- build the exchange through the real `ExchangeInitService` path
- fetch sandbox order book for the configured symbol
- place a real sandbox limit order with a known exchange-safe `clientOrderId`
- fetch the order by exchange order ID when the exchange supports `fetchOrder()`
- verify it appears in open orders when the exchange supports `fetchOpenOrders()`
- cancel it and verify the final exchange-visible state with supported capabilities

### Phase 3: Fill Routing Integration

Spec: `server/test/system/market-making/execution/sandbox-fill-resolution.system.spec.ts`

Coverage:

- parseable `clientOrderId` path (`{orderId}:{seq}`)
- persisted client-order mapping fallback
- persisted exchange-order mapping fallback using a real sandbox order ID

The parseable `clientOrderId` assertion stays local to routing resolution. Real sandbox order placement uses exchange-safe IDs because some exchanges reject `:` in submitted client order IDs.

### Phase 4: Runtime Control Parity

Spec: `server/test/system/market-making/user-orders/market-making.processor.system.spec.ts`

Coverage:

- persist a market-making order fixture with valid `strategySnapshot.resolvedConfig`
- confirm the sandbox exchange can return live public market data during the phase
- invoke real `handleStartMM()` through `MarketMakingOrderProcessor`
- assert executor session attachment through `ExecutorRegistry`
- invoke real `handleStopMM()` through `MarketMakingOrderProcessor`
- assert executor session detachment and order state transition to `stopped`

### Phase 5: Single-Tick Intent Execution

Spec: `server/test/system/market-making/strategy/pure-market-making-single-tick.system.spec.ts`

Coverage:

- invoke one real executor tick for a pure market-making session
- publish one buy and one sell intent
- place real sandbox orders through live intent execution
- persist `ExchangeOrderMapping` rows
- update `ExchangeOrderTrackerService`
- persist `StrategyExecutionHistory`

Current `clientOrderId` rule:

- local parseable format remains `{orderId}:{seq}` for routing-only assertions
- live exchange submission now uses exchange-safe generated IDs
- live fill routing still works because `FillRoutingService` falls back to persisted `ExchangeOrderMapping`

Boundary:

- validates order-resolution logic only
- does not validate exchange private-stream ingestion

### Phase 6: Multi-Layer Placement

Spec: `server/test/system/market-making/strategy/pure-market-making-multi-layer.system.spec.ts`

Coverage:

- invoke one real executor tick for a pure market-making session with `numberOfLayers >= 3`
- assert layered buy prices expand downward and layered sell prices expand upward
- assert quantity progression across layers
- place real sandbox orders for each eligible layer
- preserve existing open orders on the next eligible tick when hanging orders are enabled

### Phase 7: Cadence Stability

Spec: `server/test/system/market-making/strategy/pure-market-making-cadence.system.spec.ts`

Coverage:

- reuse the same executor session across repeated eligible ticks
- verify no follow-up placement occurs before the next eligible cadence window
- force the next cadence window deterministically in the test harness
- assert submitted exchange-safe `clientOrderId` values increment deterministically across cycles
- keep tracker, mapping, and execution history state coherent after repeated cycles

### Phase 8: Private-Fill Ingestion

Spec: `server/test/system/market-making/execution/private-fill-ingestion.system.spec.ts`

Coverage:

- start the real private `watchOrders()` ingestion loop from the runtime attach path
- route a deterministic filled private-stream payload to the pooled executor
- when a second sandbox account is configured, place a real counterparty order and assert the live fill reaches the executor through `FillRoutingService`
- stop the watcher through the real `stop_mm` path

### Phase B1: Order Creation And Payment Intake

Spec: `server/test/system/market-making/user-orders/market-making-payment-intake.system.spec.ts`

Coverage:

- create a market-making order intent through the real `UserOrdersService.createMarketMakingOrderIntent()` business entry path
- process payment snapshots through the real `SnapshotsService.handleSnapshot()` flow
- persist `MarketMakingPaymentState` and transition to `payment_complete`
- persist a runtime-ready `strategySnapshot`
- verify ledger balances reflect the accepted payment snapshots
- prove the persisted order can be started through `handleStartMM()`

## Required Environment Variables

Use `server/.env.testnet.example` as the template for sandbox system-test config.

`bun run test:system` automatically loads `server/.env.testnet` when that file exists.

Required:

- `CCXT_SANDBOX_EXCHANGE`
- `CCXT_SANDBOX_API_KEY`
- `CCXT_SANDBOX_SECRET`

Optional:

- `CCXT_SANDBOX_ENABLED` default: sandbox activation also occurs when required sandbox creds are present
- `CCXT_SANDBOX_ACCOUNT_LABEL` default: `default`
- `CCXT_SANDBOX_PASSWORD`
- `CCXT_SANDBOX_UID`
- `CCXT_SANDBOX_ACCOUNT2_LABEL` default: `account2`
- `CCXT_SANDBOX_ACCOUNT2_API_KEY`
- `CCXT_SANDBOX_ACCOUNT2_SECRET`
- `CCXT_SANDBOX_ACCOUNT2_PASSWORD`
- `CCXT_SANDBOX_ACCOUNT2_UID`
- `CCXT_SANDBOX_SYMBOL` default: `BTC/USDT`
- `CCXT_SANDBOX_MIN_REQUEST_INTERVAL_MS` default: `100`

Production credential names are intentionally not used in these system suites.

## Running The Suites

Use the dedicated non-unit backend entry point:

```bash
bun run test:system
```

The default unit suite excludes `*.system.spec.ts`.
No manual `export` is required if `server/.env.testnet` already contains the sandbox values.

## Skip Behavior

Both integration specs check `CCXT_SANDBOX_EXCHANGE`, `CCXT_SANDBOX_API_KEY`, and `CCXT_SANDBOX_SECRET`.

If any required sandbox variable is missing:

- the suite is skipped explicitly
- unit tests still run normally
- missing sandbox config in `server/.env.testnet` is treated as opt-out, not as a failure

The A7 private-fill suite has one additional live-fill assertion that runs only when `CCXT_SANDBOX_ACCOUNT2_API_KEY` and `CCXT_SANDBOX_ACCOUNT2_SECRET` are present for a real counterparty account.

## Cleanup Behavior

The order lifecycle suite tracks every order it creates through the real `ExchangeInitService` exchange instance.
Helper-backed suites still use `SandboxExchangeHelper` cleanup.

After each system suite:

- tracked orders are fetched again
- any order that still appears open is canceled
- exchange resources are closed

Specs still use far-from-market limit pricing to reduce unexpected fills, but cleanup remains mandatory.

## Full E2E Gate

Full market-making end-to-end coverage should stay deferred until all of the following are true:

- a real exchange private-fill ingestion path exists
- tests can observe that path deterministically
- the E2E boundary is documented precisely
- any ledger assertions match runtime behavior actually implemented in `start_mm` and `stop_mm`

Until then, the currently implemented sandbox coverage stops at execution-engine parity through single-tick runtime execution. It is useful, but it is not yet the same as full private-fill end-to-end coverage.

## Last Updated

- Date: 2026-03-18
- Status: Active

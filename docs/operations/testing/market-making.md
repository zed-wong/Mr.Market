# Market Making Test Guide

This document covers the current CCXT sandbox integration scope for market making.

It documents the small sandbox surface that is still intentionally retained today.

The broader production-parity target is tracked separately in `docs/planning/2026-03-15-ccxt-sandbox-integration-testing-plan.md`. That target requires the same `ExchangeInitService`, `start_mm`, `stop_mm`, tick, and execution runtime path as mainnet. The current implemented scope is much narrower.

The retained sandbox scope is intentionally limited to exchange-truth checks only:

- environment-driven sandbox bootstrap through the real exchange init path
- real exchange adapter REST lifecycle coverage

Runtime control, coordinator, fill-routing, private-stream, cadence, isolation, and soak assertions are no longer maintained as sandbox suites. Those concerns should live in mock or integration tests unless they need real exchange behavior for validation.

It does not claim the broader Track B withdrawal, campaign, reward, or reconciliation lifecycle.

## Current Integration Scope

### Phase 1: Sandbox Harness

- `ExchangeInitService` can boot one sandbox exchange from `CCXT_SANDBOX_*` env through the normal runtime service path
- sandbox mode is enabled before `loadMarkets()` when sandbox env is present
- exchange-specific sandbox overrides still apply when required, including Binance spot-only market loading
- legacy sandbox helper usage now lives under `server/test/system/helpers/sandbox-exchange.helper.ts`
- new system-test specs and support files live under `server/test/system`
- the default unit suite ignores `*.system.spec.ts`

### Phase 2: Adapter Integration

Spec: `server/test/system/market-making/execution/sandbox-order-lifecycle.sandbox.system.spec.ts`

Coverage:

- build the exchange through the real `ExchangeInitService` path
- fetch sandbox order book for the configured symbol
- place a real sandbox limit order with a known exchange-safe `clientOrderId`
- fetch the order by exchange order ID when the exchange supports `fetchOrder()`
- verify it appears in open orders when the exchange supports `fetchOpenOrders()`
- cancel it and verify the final exchange-visible state with supported capabilities

### Phase 7A: Intent Engine Mock Coverage

Specs:

- `server/test/system/market-making/intent-engine/intent-execution-flow.mock.system.spec.ts`
- `server/test/system/market-making/intent-engine/intent-idempotency.mock.system.spec.ts`
- `server/test/system/market-making/intent-engine/intent-durability-restart.mock.system.spec.ts`

Coverage:

- assert `NEW -> SENT -> DONE` intent progression plus persisted mapping/history side effects
- assert retry recovery and exhausted-retry failure handling within the same execution-flow suite
- assert worker error logging on placement failure
- assert duplicate consumption of the same persisted intent does not create duplicate side effects
- assert persisted durability receipts survive worker restart and suppress re-delivered execution

### Phase B1: Order Creation And Payment Intake

Spec: `server/test/system/market-making/user-orders/market-making-payment-intake.mock.system.spec.ts`

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
That entry point also enables the internal sandbox-exchange bootstrap flag used by `ExchangeInitService`.

Required:

- `CCXT_SANDBOX_EXCHANGE`
- `CCXT_SANDBOX_API_KEY`
- `CCXT_SANDBOX_SECRET`

Optional:

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
Outside `bun run test:system`, `ExchangeInitService` does not read `CCXT_SANDBOX_*`.

## Running The Suites

Use the dedicated non-unit backend entry point:

```bash
bun run test:system
```

The default unit suite excludes `*.system.spec.ts`.
No manual `export` is required if `server/.env.testnet` already contains the sandbox values.

## Skip Behavior

The retained sandbox suite checks `CCXT_SANDBOX_EXCHANGE`, `CCXT_SANDBOX_API_KEY`, and `CCXT_SANDBOX_SECRET`.

If any required sandbox variable is missing:

- the suite is skipped explicitly
- unit tests still run normally
- missing sandbox config in `server/.env.testnet` is treated as opt-out, not as a failure

## Cleanup Behavior

The order lifecycle suite tracks every order it creates through the real `ExchangeInitService` exchange instance.

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

Until then, the retained sandbox coverage stops at adapter-level exchange truth. It is useful, but it is not the same as full private-fill end-to-end coverage.

## Last Updated

- Date: 2026-03-29
- Status: Active

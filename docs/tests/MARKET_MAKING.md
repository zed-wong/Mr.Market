# Market Making Test Guide

This document covers the current CCXT sandbox integration scope for market making.

It documents the sandbox suites that are currently implemented today.

The broader production-parity target is tracked separately in `docs/plans/2026-03-15-ccxt-sandbox-integration-testing-plan.md`. That target requires the same `ExchangeInitService`, `start_mm`, `stop_mm`, tick, and execution runtime path as mainnet. The current implemented scope is narrower.

The March 15 implementation is intentionally limited to the runtime behaviors that already exist:

- Phase 1: isolated sandbox harness bootstrapping
- Phase 2: real exchange adapter REST lifecycle coverage
- Phase 3: fill-routing resolution coverage with repository-backed mappings

It does not claim full end-to-end private-fill ingestion.

## Current Integration Scope

### Phase 1: Sandbox Harness

- `server/test/helpers/sandbox-exchange.helper.ts` constructs a dedicated sandbox exchange instance outside normal app boot
- the helper calls `setSandboxMode(true)` before `loadMarkets()`
- the helper applies exchange-specific sandbox overrides when required, including Binance spot-only market loading
- the helper tracks created sandbox orders for cleanup in `afterAll`
- the default unit suite ignores `*.system.spec.ts`

### Phase 2: Adapter Integration

Spec: `server/src/modules/market-making/execution/sandbox-order-lifecycle.system.spec.ts`

Coverage:

- fetch sandbox order book for the configured symbol
- place a real sandbox limit order with a known exchange-safe `clientOrderId`
- fetch the order by exchange order ID
- verify it appears in open orders
- cancel it and verify it no longer appears as open

### Phase 3: Fill Routing Integration

Spec: `server/src/modules/market-making/execution/sandbox-fill-resolution.system.spec.ts`

Coverage:

- parseable `clientOrderId` path (`{orderId}:{seq}`)
- persisted client-order mapping fallback
- persisted exchange-order mapping fallback using a real sandbox order ID

The parseable `clientOrderId` assertion stays local to routing resolution. Real sandbox order placement uses exchange-safe IDs because some exchanges reject `:` in submitted client order IDs.

Boundary:

- validates order-resolution logic only
- does not validate exchange private-stream ingestion

## Required Environment Variables

Use `server/.env.testnet.example` as the template for sandbox system-test config.

`bun run test:system` automatically loads `server/.env.testnet` when that file exists.

Required:

- `CCXT_SANDBOX_EXCHANGE`
- `CCXT_SANDBOX_API_KEY`
- `CCXT_SANDBOX_SECRET`

Optional:

- `CCXT_SANDBOX_PASSWORD`
- `CCXT_SANDBOX_UID`
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

## Cleanup Behavior

The sandbox helper tracks every order created through the integration harness.

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

Until then, the currently implemented sandbox coverage stops at adapter REST behavior and fill-routing resolution. It is useful, but it is not yet the same as production-parity execution-engine coverage.

## Last Updated

- Date: 2026-03-15
- Status: Active

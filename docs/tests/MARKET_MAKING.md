# Market Making Test Guide

This document covers the current CCXT sandbox integration scope for market making.

The March 15 implementation is intentionally limited to the runtime behaviors that already exist:

- Phase 1: isolated sandbox harness bootstrapping
- Phase 2: real exchange adapter REST lifecycle coverage
- Phase 3: fill-routing resolution coverage with repository-backed mappings

It does not claim full end-to-end private-fill ingestion.

## Current Integration Scope

### Phase 1: Sandbox Harness

- `server/test/helpers/sandbox-exchange.helper.ts` constructs a dedicated sandbox exchange instance outside normal app boot
- the helper calls `setSandboxMode(true)` before `loadMarkets()`
- the helper tracks created sandbox orders for cleanup in `afterAll`
- the default unit suite ignores `*.integration.spec.ts`

### Phase 2: Adapter Integration

Spec: `server/src/modules/market-making/execution/exchange-connector-adapter.integration.spec.ts`

Coverage:

- fetch sandbox order book for the configured symbol
- place a real sandbox limit order with a known `clientOrderId`
- fetch the order by exchange order ID
- verify it appears in open orders
- cancel it and verify it no longer appears as open

### Phase 3: Fill Routing Integration

Spec: `server/src/modules/market-making/execution/fill-routing.integration.spec.ts`

Coverage:

- parseable `clientOrderId` path (`{orderId}:{seq}`)
- persisted client-order mapping fallback
- persisted exchange-order mapping fallback using a real sandbox order ID

Boundary:

- validates order-resolution logic only
- does not validate exchange private-stream ingestion

## Required Environment Variables

Use `server/.env.testnet.example` as the template for integration-only sandbox config.

Required:

- `CCXT_SANDBOX_EXCHANGE`
- `CCXT_SANDBOX_API_KEY`
- `CCXT_SANDBOX_SECRET`

Optional:

- `CCXT_SANDBOX_PASSWORD`
- `CCXT_SANDBOX_UID`
- `CCXT_SANDBOX_SYMBOL` default: `BTC/USDT`
- `CCXT_SANDBOX_MIN_REQUEST_INTERVAL_MS` default: `100`

Production credential names are intentionally not used in these integration suites.

## Running The Suites

Use only the dedicated integration entry point:

```bash
bun run test:integration
```

The default unit suite excludes `*.integration.spec.ts`.

## Skip Behavior

Both integration specs check `CCXT_SANDBOX_EXCHANGE`, `CCXT_SANDBOX_API_KEY`, and `CCXT_SANDBOX_SECRET`.

If any required sandbox variable is missing:

- the suite is skipped explicitly
- unit tests still run normally
- missing sandbox config is treated as opt-out, not as a failure

## Cleanup Behavior

The sandbox helper tracks every order created through the integration harness.

After each integration suite:

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

Until then, sandbox integration coverage stops at adapter REST behavior and fill-routing resolution.

## Last Updated

- Date: 2026-03-15
- Status: Active

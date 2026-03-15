# CCXT Sandbox Integration Testing Plan

## Overview

This is the single source-of-truth plan for the March 15 sandbox testing work.

The work is intentionally staged:

1. validate real sandbox exchange REST behavior through the adapter layer
2. validate fill-routing resolution with real sandbox order identifiers plus local mapping persistence
3. define the upgrade gate for full market-making E2E only after the missing runtime pieces exist

This plan does not claim that the current system can already support full exchange-to-fill E2E coverage.

## Why This Scope

The current codebase already supports a credible sandbox integration slice:

- `ExchangeConnectorAdapterService` exposes real exchange REST operations
- `StrategyIntentExecutionService` creates `{orderId}:{seq}` client order IDs
- `ExchangeOrderMappingService` persists exchange-order mappings
- `FillRoutingService` resolves parseable and fallback order identities

The current codebase does not yet support a credible full E2E fill-ingestion claim:

- `PrivateStreamTrackerService` currently processes queued in-memory events
- there is no implemented exchange private-trade subscription path in the adapter/runtime stack
- `start_mm` and `stop_mm` do not currently perform ledger lock/unlock as part of their direct flow

Because of that, the first delivery should stop at integration coverage that matches current runtime capability.

## Goals

1. Add opt-in sandbox integration tests that run against one real CCXT sandbox exchange.
2. Keep sandbox setup isolated from the normal runtime and unit-test path.
3. Add one adapter integration suite for real order lifecycle coverage.
4. Add one fill-routing integration suite for parser and mapping fallback coverage.
5. Document the concrete prerequisites for a later full E2E upgrade.

## Non-Goals

- No claim of full tick -> intent worker -> private fill stream -> routed fill E2E coverage in phase 1.
- No multi-exchange matrix in phase 1.
- No production runtime change that globally enables sandbox behavior.
- No placeholder tests that do not exercise real behavior.
- No new assertions for ledger lock/unlock in `start_mm` or `stop_mm` unless runtime behavior changes first.

## Current Constraints

- `ExchangeInitService` is production-facing and environment-driven.
- CCXT sandbox mode must be enabled before market loading for sandbox test instances.
- Integration tests must remain opt-in and must not run in the default unit suite.
- Missing sandbox credentials should cause explicit skips, not failures.
- Real fill ingestion is not implemented yet, so the routing suite must validate resolution logic without pretending to validate private-stream subscription behavior.

## Target Files

```text
server/
├── .env.testnet.example
├── jest.config.js
├── package.json
├── test/
│   ├── helpers/
│   │   └── sandbox-exchange.helper.ts
│   └── jest-integration.config.js
└── src/
    └── modules/
        └── market-making/
            └── execution/
                ├── exchange-connector-adapter.integration.spec.ts
                └── fill-routing.integration.spec.ts

docs/
└── tests/
    └── MARKET_MAKING.md
```

## Implementation Rules

- keep production credential names out of integration docs and helpers
- keep sandbox exchange construction outside normal app boot
- keep integration specs opt-in
- use real code paths, not placeholder assertions
- do not label routing checks as private-stream or full fill-ingestion E2E

## Phase 1: Sandbox Harness

### Tasks

- add a dedicated sandbox exchange helper under `server/test/helpers/`
- add integration-only env names such as `CCXT_SANDBOX_*`
- add a dedicated Jest integration config and Bun command
- exclude `*.integration.spec.ts` from the default test run

### Required Deliverables

1. `server/.env.testnet.example`

```bash
CCXT_SANDBOX_EXCHANGE=okx
CCXT_SANDBOX_API_KEY=your_api_key
CCXT_SANDBOX_SECRET=your_api_secret
CCXT_SANDBOX_PASSWORD=
CCXT_SANDBOX_UID=
CCXT_SANDBOX_SYMBOL=BTC/USDT
CCXT_SANDBOX_MIN_REQUEST_INTERVAL_MS=100
```

2. `server/test/helpers/sandbox-exchange.helper.ts`

Required behavior:

- resolve the selected CCXT exchange class
- instantiate with sandbox credentials
- call `setSandboxMode(true)` before `loadMarkets()`
- track created orders for cleanup
- expose helper methods for:
  - reading test config
  - placing safe cleanup-aware orders
  - cancelling tracked open orders
  - closing exchange resources

3. `server/test/jest-integration.config.js`

Required behavior:

- only match `*.integration.spec.ts`
- reuse the main path mapping
- use longer timeouts for network calls

4. opt-in execution wiring

Modify:

- `server/package.json`
- `server/jest.config.js`

Required behavior:

- add `bun run test:integration`
- exclude `*.integration.spec.ts` from the default test run

## Phase 2: Adapter Integration

### Scope

Test `ExchangeConnectorAdapterService` against one real sandbox exchange.

### Spec

Create `server/src/modules/market-making/execution/exchange-connector-adapter.integration.spec.ts`.

Build a Nest test module with:

- `ExchangeConnectorAdapterService`
- mocked `ExchangeInitService.getExchange()` returning the sandbox exchange
- mocked `ConfigService` returning request interval config

### Assertions

- place a limit order with a known `clientOrderId`
- fetch that order by exchange order ID
- verify it appears in open orders when the exchange reports it
- cancel the order
- verify canceled status through refetch or absence from open orders
- fetch the order book for the configured symbol

### Notes

- use prices far from market when supported
- track created order IDs in `afterAll`
- rate-limit coverage should be coarse, not exact

## Phase 3: Fill Routing Integration

### Scope

Test `FillRoutingService` with real parsing helpers and repository-backed mappings.

### Spec

Create `server/src/modules/market-making/execution/fill-routing.integration.spec.ts`.

Use:

- `FillRoutingService`
- `ExchangeOrderMappingService`
- repository wiring for `ExchangeOrderMapping`
- real parser helpers

### Assertions

1. parseable client-order path

```ts
await service.resolveOrderForFill({ clientOrderId: 'order-123:0' });
```

Expect:

- `{ orderId: 'order-123', seq: 0, source: 'clientOrderId' }`

2. client-order mapping fallback

- persist a non-parseable `clientOrderId`
- resolve with that `clientOrderId`
- expect `source: 'mapping'`

3. exchange-order mapping fallback

- place or reuse one sandbox order to obtain a realistic exchange order ID
- persist the mapping
- resolve with only `exchangeOrderId`
- expect `source: 'exchangeOrderMapping'`

### Boundary

- this suite validates order-resolution logic
- this suite does not validate real exchange private-stream ingestion

## Shared Test Conventions

- every integration spec must check `CCXT_SANDBOX_EXCHANGE`
- every integration spec must check `CCXT_SANDBOX_API_KEY`
- every integration spec must check `CCXT_SANDBOX_SECRET`
- missing sandbox config must produce explicit skips
- `bun run test:integration` is the only supported entry point

## Documentation Updates

Update `docs/tests/MARKET_MAKING.md` with:

- purpose of phases 1-3
- required env vars
- `bun run test:integration`
- skip behavior when sandbox config is absent
- cleanup behavior for created sandbox orders
- explicit note that full E2E private-fill validation is not part of this plan

## Full E2E Upgrade Gate

Full market-making E2E should only start after all of the following are true:

### 1. Real Fill Ingestion Exists

- a real exchange private-stream or equivalent fill-ingestion path is implemented
- runtime code can receive trade/fill events from the exchange without manually queueing synthetic events
- test code can observe and assert that path deterministically

### 2. E2E Boundary Is Explicit

Choose one boundary and document it precisely:

- queue/job/runtime E2E
- API -> queue -> tick -> exchange -> fill E2E
- runtime-only exchange lifecycle E2E

Do not mix these under one ambiguous “E2E” label.

### 3. Ledger Assertions Match Runtime Behavior

If the test should assert fund locking or release, the runtime path must actually perform it.

Until then, do not add assertions such as:

- funds locked on `start_mm`
- funds released on `stop_mm`

unless those behaviors are first implemented in the real start/stop flow.

### Future E2E Scope

After the preconditions are met, a future E2E suite may cover:

1. account and sandbox readiness checks
2. creating or preparing a valid market-making order with `strategySnapshot`
3. triggering `start_mm`
4. verifying runtime registration and intent generation
5. verifying sandbox orders appear on the exchange
6. executing a real opposing trade or equivalent fill trigger
7. verifying fill ingestion and routing to the correct executor/order
8. triggering `stop_mm`
9. verifying cleanup, final order state, and any ledger expectations that match runtime behavior

## Acceptance Criteria

### Harness

- sandbox helper enables sandbox mode before market loading
- integration tests are excluded from the default unit suite
- sandbox env example uses integration-only variable names

### Adapter Integration

- the suite can place, fetch, and cancel a real sandbox order
- the suite cleans up created open orders
- the suite skips explicitly when sandbox credentials are absent

### Fill Routing Integration

- the suite verifies parser resolution
- the suite verifies client-order mapping fallback
- the suite verifies exchange-order mapping fallback
- the suite does not claim to validate private-stream fill ingestion

### Full E2E Gate

- docs clearly state which missing runtime pieces block full E2E today
- docs define the prerequisites for promoting the plan to full E2E

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Exchange sandbox support changes in CCXT | Keep the first rollout single-exchange and confirm sandbox bootstrap during implementation |
| Sandbox orders fill unexpectedly | Use far-from-market pricing where supported and always run cleanup |
| Integration specs accidentally run in unit CI | Keep a dedicated Jest config and exclude `*.integration.spec.ts` from the default suite |
| Test flakiness from network latency | Use generous timeouts and eventual-state assertions |
| Documentation overclaims current system capability | Keep full E2E explicitly gated behind runtime prerequisites |

## Done Criteria

- phases 1-3 are implementation-ready from this document alone
- no task in this file depends on unimplemented private-stream ingestion
- no task in this file assumes ledger lock/unlock in `start_mm` or `stop_mm`
- this file remains the only March 15 sandbox testing source of truth

## Status

- Created: 2026-03-15
- Updated: 2026-03-15
- Status: Planning

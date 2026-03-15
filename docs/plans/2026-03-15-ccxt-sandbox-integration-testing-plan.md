# CCXT Sandbox Integration Testing Plan

## Overview

This is the single source-of-truth plan for the March 15 sandbox testing work.

The work is intentionally staged:

1. validate real sandbox exchange REST behavior through the adapter layer
2. validate fill-routing resolution with real sandbox order identifiers plus local mapping persistence
3. validate exchange-side pure market-making runtime behavior on one real sandbox exchange
4. define the upgrade gate for broader market-making E2E only after the missing runtime pieces exist

This plan does not claim that the current system can already support full exchange-to-fill E2E coverage.

## Why This Scope

The current codebase already supports a credible sandbox integration slice:

- `ExchangeConnectorAdapterService` exposes real exchange REST operations
- `StrategyIntentExecutionService` creates `{orderId}:{seq}` client order IDs
- `ExchangeOrderMappingService` persists exchange-order mappings
- `FillRoutingService` resolves parseable and fallback order identities
- `PureMarketMakingStrategyController` can drive pure market-making decisions through `StrategyService`
- `ExchangePairExecutor` can run exchange-pair sessions on cadence
- `ExchangeOrderTrackerService` can persist exchange-side open-order state

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
5. Add exchange-side pure market-making runtime suites that validate real sandbox order placement without involving Mixin, withdrawal, deposit, or HuFi.
6. Document the concrete prerequisites for a later broader E2E upgrade.

## Non-Goals

- No claim of full tick -> intent worker -> private fill stream -> routed fill E2E coverage in phase 1.
- No multi-exchange matrix in phase 1.
- No production runtime change that globally enables sandbox behavior.
- No placeholder tests that do not exercise real behavior.
- No new assertions for ledger lock/unlock in `start_mm` or `stop_mm` unless runtime behavior changes first.
- No Mixin funding flow, withdrawal, deposit, or HuFi campaign coverage in this plan.

## Current Constraints

- `ExchangeInitService` is production-facing and environment-driven.
- CCXT sandbox mode must be enabled before market loading for sandbox test instances.
- Integration tests must remain opt-in and must not run in the default unit suite.
- Missing sandbox credentials should cause explicit skips, not failures.
- Real fill ingestion is not implemented yet, so the routing suite must validate resolution logic without pretending to validate private-stream subscription behavior.
- Exchange-side runtime tests should start pure market making directly through runtime services instead of routing through user-order snapshot flow.

## Target Files

```text
server/
├── .env.testnet.example
├── jest.config.js
├── package.json
├── test/
│   ├── helpers/
│   │   └── sandbox-exchange.helper.ts
│   └── config/
│       └── jest.system.config.js
└── src/
    └── modules/
        └── market-making/
            ├── execution/
            │   ├── exchange-connector-adapter.system.spec.ts
            │   └── fill-routing.system.spec.ts
            └── strategy/
                └── execution/
                    ├── pure-market-making-single-tick.system.spec.ts
                    ├── pure-market-making-cadence.system.spec.ts
                    └── pure-market-making-multi-layer.system.spec.ts

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
- keep exchange-side market-making tests runtime-only and outside Mixin-driven order creation flows

## Phase 1: Sandbox Harness

### Tasks

- add a dedicated sandbox exchange helper under `server/test/helpers/`
- add integration-only env names such as `CCXT_SANDBOX_*`
- add a dedicated Jest integration config and Bun command
- exclude `*.system.spec.ts` from the default test run

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

3. `server/test/helpers/market-making-runtime.helper.ts`

Required behavior:

- build a Nest test module for exchange-side market-making runtime services
- wire the minimum runtime path needed for pure market-making execution:
  - `StrategyService`
  - `PureMarketMakingStrategyController`
  - `StrategyControllerRegistry`
  - `ExecutorRegistry`
  - `StrategyIntentExecutionService`
  - `ExchangeOrderTrackerService`
  - `ExchangeOrderMappingService`
- provide helper methods for:
  - starting one pure market-making runtime session directly
  - triggering manual ticks
  - reading latest published intents
  - inspecting tracker state
  - inspecting mapping persistence
- keep the helper runtime-only:
  - do not route through user-order snapshot flow
  - do not require Mixin-backed order creation

4. `server/test/config/jest.system.config.js`

Required behavior:

- match backend non-unit suites with `*.system.spec.ts`
- reuse the main path mapping
- use longer timeouts for network calls

5. opt-in execution wiring

Modify:

- `server/package.json`
- `server/jest.config.js`

Required behavior:

- add `bun run test:system`
- exclude `*.system.spec.ts` from the default test run

## Phase 2: Adapter Integration

### Scope

Test `ExchangeConnectorAdapterService` against one real sandbox exchange.

### Spec

Create `server/src/modules/market-making/execution/exchange-connector-adapter.system.spec.ts`.

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

Create `server/src/modules/market-making/execution/fill-routing.system.spec.ts`.

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

## Phase 4: Exchange-Side Pure Market Making Runtime

### Scope

Validate that the current pure market-making runtime can place, track, and manage exchange-side sandbox orders through the real runtime path.

This phase is intentionally limited to the exchange boundary:

- includes real CCXT sandbox exchange behavior
- includes tick, intent, execution, tracker, and mapping flow
- excludes Mixin
- excludes withdrawal and deposit
- excludes HuFi
- excludes unsupported fill-stream E2E claims

### Layered Runtime Suites

| Layer | File | Purpose | Expected Time |
| --- | --- | --- | --- |
| L1 | `sandbox-order-lifecycle.system.spec.ts` | place, fetch, open-orders, cancel, mapping | 30s |
| L2 | `pure-market-making-single-tick.system.spec.ts` | one pure market-making tick creates real buy and sell sandbox orders | 30-45s |
| L3 | `pure-market-making-cadence.system.spec.ts` | repeated manual ticks re-run session cadence and generate follow-up intents deterministically | 45-60s |
| L4 | `pure-market-making-multi-layer.system.spec.ts` | 3+ layer quote generation and real exchange placement | 60s |

### L1: Sandbox Order Lifecycle

This suite validates the lowest-level real exchange behavior used by the runtime.

Scope:

- `ExchangeConnectorAdapterService`
- `ExchangeOrderMappingService`
- `ExchangeOrderTrackerService`
- one real CCXT sandbox exchange

Validate:

- place a limit order with a safe sandbox `clientOrderId`
- fetch the order by exchange order id
- verify it appears in open orders when supported
- cancel the order
- verify final status through refetch or open-order absence
- persist exchange order mapping correctly

### L2: Pure Market Making Single Tick

This suite validates that the pure market-making runtime can produce and execute real exchange-side orders.

Scope:

- start one pure market-making runtime session directly through runtime services
- trigger one manual tick
- execute against one real CCXT sandbox exchange

Validate:

- the runtime generates one buy and one sell intent
- both intents are executed on the sandbox exchange
- `clientOrderId` values are generated correctly
- intent status progresses to `DONE`
- exchange order mappings are persisted
- the order tracker contains the expected open orders

### L3: Pure Market Making Cadence

The current runtime supports repeated tick execution on cadence. This layer validates:

- the session respects cadence timing through manual tick progression
- sequential ticks generate follow-up intents correctly
- `clientOrderId` sequence increments deterministically
- the executor remains stable across multiple cycles

Note: this validates cadence behavior, not explicit stale-quote cancel-and-replace. That would require additional runtime support.

### L4: Pure Market Making Multi-Layer

This suite validates real exchange placement for multiple quote layers.

Scope:

- run pure market making with `numberOfLayers >= 3`
- place real sandbox orders for all eligible layers

Validate:

- the expected number of intents is generated
- buy and sell ladder prices move outward correctly by layer
- quantities follow configured amount progression
- hanging-order mode suppresses unnecessary new placements when enabled
- real sandbox orders are placed for each eligible layer
- mapping and tracker state remain consistent across layered placement

### Exchange-Side Configuration Model

Start with one exchange, then generalize only after the first exchange is stable.

```ts
type ExchangeSandboxTestConfig = {
  exchangeId: string;
  symbol: string;
  minOrderAmount: string;
  safePriceDistanceBps: number;
  sandboxMode: true;
  requiresPassword?: boolean;
  requiresUid?: boolean;
  spotOnly?: boolean;
  supportsFetchOpenOrders?: boolean;
  supportsFetchOrder?: boolean;
  overrides?: Record<string, unknown>;
};
```

Design notes:

- prefer `safePriceDistanceBps` over hardcoded precision in phase 1
- derive precision and limits from CCXT market metadata when possible
- add explicit exchange overrides only after the first exchange is stable

### Recommended Implementation Order

1. stabilize `sandbox-order-lifecycle.system.spec.ts` against one real sandbox exchange
2. build `market-making-runtime.helper.ts` for direct pure market-making startup
3. add `pure-market-making-single-tick.system.spec.ts`
4. add `pure-market-making-multi-layer.system.spec.ts`
5. add `pure-market-making-cadence.system.spec.ts`
6. add a second exchange only after Binance is stable

`pure-market-making-multi-layer` intentionally comes before `pure-market-making-cadence` because multi-layer quoting is a clearer existing capability than any stronger refresh-style claim

### Pre-Implementation Findings

1. `PureMarketMakingStrategyController` is usable and delegates to `StrategyService`
2. tick can be driven manually and should not depend on real-time waits in system tests
3. strategy snapshot generation already exists, but exchange-side tests should not route through user-order snapshot flow
4. current code supports cadence-based re-execution and multi-layer quote generation
5. current code does not yet justify a stronger stale-quote cancel-and-replace E2E claim

### Exchange-Side Environment Variables

Required for phase 1:

```bash
CCXT_SANDBOX_EXCHANGE=binance
CCXT_SANDBOX_API_KEY=xxx
CCXT_SANDBOX_SECRET=xxx
CCXT_SANDBOX_SYMBOL=BTC/USDT
```

Optional:

```bash
CCXT_SANDBOX_PASSWORD=
CCXT_SANDBOX_UID=
CCXT_SANDBOX_MIN_REQUEST_INTERVAL_MS=100
TEST_EXCHANGES=binance,okx
```

## Shared Test Conventions

- every integration spec must check `CCXT_SANDBOX_EXCHANGE`
- every integration spec must check `CCXT_SANDBOX_API_KEY`
- every integration spec must check `CCXT_SANDBOX_SECRET`
- missing sandbox config must produce explicit skips
- `bun run test:system` is the only supported entry point
- exchange-side market-making suites must start runtime services directly and stay outside Mixin-driven order creation flow

## Documentation Updates

Update `docs/tests/MARKET_MAKING.md` with:

- purpose of phases 1-4
- required env vars
- `bun run test:system`
- skip behavior when sandbox config is absent
- cleanup behavior for created sandbox orders
- explicit note that full E2E private-fill validation is not part of this plan
- explicit note that exchange-side runtime suites do not cover Mixin, withdrawal, deposit, or HuFi

## Deferred System-Test Boundaries

The following broader system-test topics remain intentionally outside this sandbox implementation plan. They are documented here so they do not drift into the exchange-side runtime scope by accident.

### 1. Deposit Tracking

Intent:

- validate deposit-tracking decision logic across:
  - Mixin withdrawal record
  - on-chain transaction record
  - exchange deposit history

Current boundary:

- this is not part of the exchange-side sandbox runtime plan
- if implemented later, it should validate reconciliation logic without falsely claiming a real end-to-end withdrawal unless a real transfer is executed
- unsupported `fetchDeposits()` behavior must be treated as an explicit capability check or skip

Suggested future target:

- `server/test/system/market-making/deposit-tracking.system.spec.ts`

### 2. HuFi Campaign Flow

Intent:

- validate campaign discovery, matching, Web3 authentication, and join flow

Current boundary:

- this is not part of the exchange-side sandbox runtime plan
- if HuFi endpoints are unstable or not intended for automated testing, the suite should be treated as a contract-style system test with explicit HTTP mocks
- repeated runs must remain idempotent

Suggested future target:

- `server/test/system/market-making/hufi-campaign.system.spec.ts`

### 3. Broader Market-Making Lifecycle

Intent:

- validate orchestration across:
  - order creation
  - withdrawal initiation
  - deposit confirmation
  - campaign join attempt
  - strategy start
  - stop and cleanup

Current boundary:

- this is broader than the exchange-side runtime scope in this document
- it must not claim full exchange-to-fill E2E unless real fill ingestion exists in the runtime
- if implemented later, it should verify persisted state transitions at each phase and keep unique test data plus teardown cleanup

Suggested future target:

- `server/test/system/market-making/market-making-lifecycle.system.spec.ts`

## Full E2E Upgrade Gate

Broader market-making E2E should only start after all of the following are true:

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
| System specs accidentally run in unit CI | Keep a dedicated Jest config and exclude `*.system.spec.ts` from the default suite |
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

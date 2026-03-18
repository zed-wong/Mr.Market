# CCXT Sandbox Production-Parity Execution Testing Plan

## Overview

This is the single source-of-truth plan for sandbox execution testing.

The goal is no longer just "some real sandbox integration coverage." The goal is to validate the same exchange-side execution engine code that runs on mainnet by running it against one real exchange sandbox or testnet through CCXT sandbox mode.

Production-parity principle:

1. sandbox system tests must use the same runtime services and entrypoints that production uses for exchange-side execution
2. moving from sandbox to mainnet should be a configuration change, not a code-path change
3. when full parity is not yet possible, the missing runtime capability must be stated explicitly instead of hidden behind vague "E2E" language

The work is intentionally staged:

1. establish sandbox bootstrapping inside the exchange initialization path used by runtime
2. validate real sandbox exchange REST behavior through the same `ExchangeInitService` and adapter path used in production
3. validate `start_mm` -> runtime registration -> tick -> intent -> exchange execution -> tracker and mapping persistence through the real runtime path
4. validate `stop_mm` through the real production stop path and document any stronger stop-safety claims that remain blocked
5. validate fill routing with real sandbox order identifiers, and only promote to fill-ingestion E2E after real private-stream ingestion exists

This plan does not claim that the current system already supports full private-fill end-to-end coverage or the broader funding and campaign lifecycle.

## Why This Scope

If sandbox tests are supposed to tell us whether the execution engine can run safely on mainnet, they must cover the code that actually runs on mainnet.

That production execution boundary currently includes:

- `ExchangeInitService`
- `MarketMakingProcessor.handleStartMM()` and `handleStopMM()`
- `StrategyRuntimeDispatcherService`
- `ExecutorRegistry`
- `ExchangePairExecutor`
- `StrategyService`
- `PureMarketMakingStrategyController`
- `StrategyMarketDataProviderService`
- `ExecutorOrchestratorService`
- `StrategyIntentStoreService`
- `StrategyIntentExecutionService`
- `ExchangeConnectorAdapterService`
- `ExchangeOrderTrackerService`
- `ExchangeOrderMappingService`
- `FillRoutingService`

`PrivateStreamTrackerService` only belongs in the same parity claim after a real exchange private-fill ingestion path exists.

The current codebase already supports a meaningful exchange-side execution slice:

- `start_mm` and `stop_mm` are real production runtime entrypoints
- `ExchangePairExecutor` can run exchange-pair sessions on cadence
- `PureMarketMakingStrategyController` can drive pure market-making decisions through `StrategyService`
- `StrategyIntentExecutionService` creates client order IDs, places orders, and persists tracker and mapping state
- `ExchangeConnectorAdapterService` exposes real exchange REST operations
- `FillRoutingService` resolves parseable and fallback order identities

The current codebase also has clear parity gaps:

- `ExchangeInitService` currently initializes exchanges directly and calls `loadMarkets()` without a first-class sandbox boot path that enables sandbox mode first
- the existing implemented sandbox system suites do not yet prove that the normal production exchange-init path works in sandbox mode
- the existing implemented sandbox system suites do not yet cover the `start_mm` and `stop_mm` production entrypoints
- `PrivateStreamTrackerService` currently processes queued in-memory events rather than real exchange private-fill subscriptions
- `stop_mm` currently removes the runtime session and updates order state, but it does not itself prove exchange-order drain or cancel behavior
- some exchanges reject `:` in submitted `clientOrderId` values, so live order-placement assertions and parsing assertions cannot always use the same exact identifier format

Because of that, this plan targets production-parity execution testing for all currently implemented exchange-side runtime code, while keeping unsupported areas explicitly gated.

## Goals

1. Add opt-in production-parity sandbox system tests that run against one real CCXT sandbox exchange.
2. Exercise the same exchange initialization path and runtime entrypoints that production uses, with sandbox behavior enabled only by explicit test configuration.
3. Cover all code required for normal exchange-side execution engine operation for CEX pure market making:
   - exchange boot
   - `start_mm`
   - executor registration
   - tick-driven strategy execution
   - intent creation and consumption
   - exchange order placement and cancel
   - tracker and mapping persistence
   - `stop_mm`
4. Keep unsupported capabilities gated explicitly instead of faking broader E2E coverage.
5. Keep sandbox setup isolated from the default unit suite and production boot behavior.

## Non-Goals

- No Mixin funding flow, withdrawal, deposit, HuFi, reward, or ledger lifecycle coverage unless a later plan explicitly expands the execution boundary.
- No fake E2E by mocking core runtime services or bypassing production entrypoints.
- No production default that can accidentally enable sandbox mode.
- No multi-exchange matrix in phase 1.
- No claims about fill ingestion, stop-drain safety, or ledger behavior unless runtime code actually implements them.

## Execution Boundary For This Plan

Required sandbox coverage:

- `ExchangeInitService`
- `MarketMakingProcessor` `start_mm` and `stop_mm`
- `StrategyRuntimeDispatcherService`
- `ExecutorRegistry`
- `ExchangePairExecutor`
- `StrategyService`
- `PureMarketMakingStrategyController`
- `StrategyMarketDataProviderService`
- `ExecutorOrchestratorService`
- `StrategyIntentStoreService`
- `StrategyIntentExecutionService`
- `ExchangeConnectorAdapterService`
- `ExchangeOrderTrackerService`
- `ExchangeOrderMappingService`
- `FillRoutingService`

Conditional sandbox coverage:

- `PrivateStreamTrackerService`, but only after a real exchange private-fill subscription path exists and can be asserted deterministically

Intentionally outside this plan:

- payment intake
- Mixin snapshots
- withdrawal and deposit orchestration
- HuFi campaign flow
- reward and ledger lifecycle

## Current Constraints

- CCXT sandbox mode must be enabled before market loading.
- Integration tests must remain opt-in and must not run in the default unit suite.
- Missing sandbox credentials must produce explicit skips, not failures.
- The current active test guide documents implemented suites only. It should not be mistaken for full production-parity coverage yet.
- The chosen system-test boundary must use the real production runtime path. Direct job-handler invocation is acceptable only if it invokes the same code path as the queued production job.
- Stop-path assertions must match actual runtime behavior. Stronger stop-safety assertions need runtime support first.
- Real fill ingestion is not implemented yet, so routing coverage must remain separate from private-stream fill E2E until that runtime path exists.

## Target Files

```text
server/
├── .env.testnet.example
├── jest.config.js
├── package.json
├── test/
│   ├── config/
│   │   └── jest.system.config.js
│   └── helpers/
│       ├── sandbox-exchange.helper.ts
│       └── market-making-runtime.helper.ts
└── src/
    └── modules/
        ├── infrastructure/
        │   └── exchange-init/
        │       └── exchange-init.service.ts
        └── market-making/
            ├── execution/
            │   ├── sandbox-order-lifecycle.system.spec.ts
            │   ├── sandbox-fill-resolution.system.spec.ts
            │   └── private-fill-ingestion.system.spec.ts
            ├── strategy/
            │   └── execution/
            │       ├── pure-market-making-single-tick.system.spec.ts
            │       ├── pure-market-making-cadence.system.spec.ts
            │       └── pure-market-making-multi-layer.system.spec.ts
            └── user-orders/
                └── market-making.processor.system.spec.ts

docs/
├── plans/
│   └── README.md
└── tests/
    └── MARKET_MAKING.md
```

## Implementation Rules

- production parity comes first: core execution suites must use the normal `ExchangeInitService` path instead of mocking `getExchange()`
- sandbox mode must be enabled inside the exchange boot path before `loadMarkets()`
- test-only configuration may enable sandbox, but runtime services must otherwise match production behavior
- core execution suites must invoke `start_mm` and `stop_mm` through the actual processor and dispatcher path, not through a sandbox-only shortcut that bypasses them
- runtime suites may drive manual ticks for determinism, but the tick must hit the same executor, controller, orchestrator, intent, and execution code as production
- use real CCXT sandbox exchange behavior and real cleanup
- do not label routing-only checks as private-stream or full fill-ingestion E2E
- when a capability does not exist yet, document the gate or skip instead of simulating it

## Phase 1: Production-Parity Sandbox Bootstrap

### Tasks

- add integration-only env names under `CCXT_SANDBOX_*`
- extend the exchange initialization path so one sandbox exchange can be booted through the same runtime service used in production
- enable sandbox mode before `loadMarkets()` when sandbox config is present
- keep normal production boot unchanged when sandbox config is absent
- add a helper that builds a Nest system-test module around the same execution-service graph used by production

### Required Deliverables

1. `server/.env.testnet.example`

```bash
CCXT_SANDBOX_ENABLED=true
CCXT_SANDBOX_EXCHANGE=binance
CCXT_SANDBOX_ACCOUNT_LABEL=testnet
CCXT_SANDBOX_API_KEY=your_api_key
CCXT_SANDBOX_SECRET=your_api_secret
CCXT_SANDBOX_PASSWORD=
CCXT_SANDBOX_UID=
CCXT_SANDBOX_SYMBOL=BTC/USDT
CCXT_SANDBOX_MIN_REQUEST_INTERVAL_MS=100
```

2. `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts`

Required behavior:

- resolve the selected CCXT exchange class from sandbox config
- instantiate the exchange with sandbox credentials
- apply exchange-specific sandbox overrides when required
- call `setSandboxMode(true)` before `loadMarkets()`
- expose the sandbox exchange through the same `getExchange(exchangeName, label)` contract used by runtime
- leave production exchange initialization unchanged when sandbox config is absent

3. `server/test/helpers/market-making-runtime.helper.ts`

Required behavior:

- build a Nest test module around the production execution-service graph
- wire the minimum real runtime path needed for exchange-side market making:
  - `MarketMakingProcessor`
  - `StrategyRuntimeDispatcherService`
  - `StrategyService`
  - `PureMarketMakingStrategyController`
  - `StrategyControllerRegistry`
  - `ExecutorRegistry`
  - `StrategyMarketDataProviderService`
  - `ExecutorOrchestratorService`
  - `StrategyIntentStoreService`
  - `StrategyIntentExecutionService`
  - `ExchangeOrderTrackerService`
  - `ExchangeOrderMappingService`
- keep stubs limited to out-of-scope systems only
- provide helper methods for:
  - creating or loading a persisted market-making order fixture with `strategySnapshot`
  - invoking `handleStartMM()` and `handleStopMM()`
  - triggering manual ticks
  - reading latest published intents
  - inspecting tracker state
  - inspecting mapping persistence

4. `server/test/config/jest.system.config.js`

Required behavior:

- match backend non-unit suites with `*.system.spec.ts`
- auto-load `server/.env.testnet` when present
- reuse main path mapping
- use longer timeouts for network calls

5. opt-in execution wiring

Modify:

- `server/package.json`
- `server/jest.config.js`

Required behavior:

- keep `bun run test:system` as the only supported system-test entry point
- exclude `*.system.spec.ts` from the default unit run

## Phase 2: Exchange Init And Order Lifecycle

### Scope

Validate that the same exchange initialization and adapter path used by production can place, fetch, and cancel real sandbox orders.

### Spec

Use `server/test/system/market-making/execution/sandbox-order-lifecycle.system.spec.ts`.

Build a Nest test module with:

- real `ExchangeInitService`
- real `ExchangeConnectorAdapterService`
- real sandbox config loaded through `CCXT_SANDBOX_*`

Do not mock `ExchangeInitService.getExchange()` in this suite.

### Assertions

- obtain the sandbox exchange through `ExchangeInitService.getExchange()`
- fetch the order book for the configured symbol
- place a limit order with a known exchange-safe `clientOrderId`
- fetch that order by exchange order ID
- verify it appears in open orders when the exchange supports that capability
- cancel the order
- verify canceled status through refetch or absence from open orders

### Notes

- use prices far from market when supported
- track created order IDs in cleanup
- capability gaps such as unsupported `fetchOpenOrders()` must be explicit skips or conditional assertions

## Phase 3: Production Entry Point Coverage

### Scope

Validate that the production `start_mm` and `stop_mm` entrypoints correctly attach and detach runtime execution for one persisted market-making order in sandbox mode.

### Spec

Create `server/src/modules/market-making/user-orders/market-making.processor.system.spec.ts`.

Use:

- `MarketMakingProcessor`
- `StrategyRuntimeDispatcherService`
- `ExecutorRegistry`
- persisted order fixtures with `strategySnapshot`
- sandbox-backed execution services from the production runtime graph

### Assertions

`start_mm` path:

- create or load a market-making order fixture with valid `strategySnapshot`
- invoke `handleStartMM()` through the real processor
- verify order state becomes `running`
- verify the order is attached to the expected `ExchangePairExecutor`

`stop_mm` path:

- invoke `handleStopMM()` through the real processor
- verify the session is removed from the executor
- verify order state becomes `stopped`
- if runtime later adds exchange-order drain or cancel behavior to `stop_mm`, assert it here

### Boundary

- this suite covers the real production control entrypoints for execution
- this suite does not claim exchange-order drain unless `stop_mm` actually implements it

## Phase 4: Exchange-Side Runtime Behavior

### Scope

Validate that the current pure market-making runtime can place, track, and manage exchange-side sandbox orders through the same runtime path used by production mainnet execution.

This phase is intentionally limited to the exchange-side execution engine:

- includes real CCXT sandbox exchange behavior
- includes `start_mm`, executor registration, tick, controller decisions, intent publishing, intent execution, tracker updates, and mapping persistence
- excludes payment intake, Mixin, withdrawal, deposit, HuFi, reward, and ledger lifecycle
- excludes unsupported fill-stream E2E claims

### Layered Runtime Suites

| Layer | File                                            | Purpose                                                                            | Expected Time |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| L1    | `market-making.processor.system.spec.ts`        | `start_mm` and `stop_mm` production entrypoints                                    | 30s           |
| L2    | `pure-market-making-single-tick.system.spec.ts` | one tick creates real buy and sell sandbox orders through the full runtime path    | 30-45s        |
| L3    | `pure-market-making-multi-layer.system.spec.ts` | 3+ layer quote generation and real exchange placement                              | 60s           |
| L4    | `pure-market-making-cadence.system.spec.ts`     | repeated ticks generate follow-up intents and deterministic client-order sequences | 45-60s        |

### L2: Pure Market Making Single Tick

Scope:

- invoke `start_mm` through the real processor
- trigger one manual tick through runtime services
- execute against one real CCXT sandbox exchange

Validate:

- the runtime generates one buy and one sell intent
- both intents are executed on the sandbox exchange
- `clientOrderId` values are generated correctly
- intent status progresses to `DONE`
- exchange order mappings are persisted
- the order tracker contains the expected open orders

### L3: Pure Market Making Multi-Layer

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

### L4: Pure Market Making Cadence

Validate:

- repeated manual ticks re-run session cadence through the real executor path
- sequential ticks generate follow-up intents correctly
- `clientOrderId` sequence increments deterministically
- the executor remains stable across multiple cycles

Note:

- this validates cadence behavior, not an unimplemented stale-quote cancel-and-replace claim

## Phase 5: Fill Routing And Fill Ingestion Gate

### Required Scope In Phase 1

Keep `server/test/system/market-making/execution/sandbox-fill-resolution.system.spec.ts` as required coverage for order-resolution logic.

Assertions:

1. parseable client-order path

```ts
await service.resolveOrderForFill({ clientOrderId: "order-123:0" });
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

### Deferred Fill-Ingestion Upgrade

Only add `server/src/modules/market-making/execution/private-fill-ingestion.system.spec.ts` after all of the following are true:

- a real exchange private-stream or equivalent fill-ingestion path is implemented
- `PrivateStreamTrackerService` can receive real exchange fill events without manually queued synthetic events
- the suite can assert routing from live fill event -> `FillRoutingService` -> `ExecutorRegistry.findExecutorByOrderId()` -> `ExchangePairExecutor.onFill()` deterministically

Until then:

- keep fill-routing resolution coverage
- do not claim full fill-ingestion parity

## Environment-Only Sandbox Activation

System tests must not require codebase modifications. Sandbox behavior is activated purely through environment configuration:

1. **No code changes for sandbox**: The same production codebase runs in sandbox mode when `CCXT_SANDBOX_ENABLED=true` is set
2. **Environment-driven**: All sandbox configuration comes from `CCXT_SANDBOX_*` environment variables
3. **Test file responsibility**: System test files set up their environment before importing any runtime code

This means:

- `ExchangeInitService` reads sandbox config from environment at boot time
- Tests set `process.env.CCXT_SANDBOX_*` before initializing the Nest test module
- No special sandbox-only code paths exist outside of config-driven branching

## Exchange-Side Configuration Model

Support multiple CCXT-compatible exchanges from the start. CCXT provides uniform sandbox mode across exchanges.

```ts
type ExchangeSandboxTestConfig = {
  exchangeId: string;
  symbol: string;
  accountLabel: string;
  minOrderAmount: string;
  safePriceDistanceBps: number;
  sandboxMode: true;
  requiresPassword?: boolean;
  requiresUid?: boolean;
  spotOnly?: boolean;
  supportsFetchOpenOrders?: boolean;
  supportsFetchOrder?: boolean;
  supportsPrivateTrades?: boolean;
  overrides?: Record<string, unknown>;
};
```

Design notes:

- prefer `safePriceDistanceBps` over hardcoded precision in phase 1
- derive precision and limits from CCXT market metadata when possible
- CCXT provides uniform sandbox interface, so any supported exchange works with the same test structure
- track whether the exchange can support future private-fill parity before claiming it
- keep execution-system specs serialized by default when they share one sandbox account; only promote parallel execution after per-suite account isolation is proven

## Recommended Implementation Order

1. add environment-driven sandbox boot support to `ExchangeInitService` (reads `CCXT_SANDBOX_*` at init time)
2. stabilize `sandbox-order-lifecycle.system.spec.ts` against the real `ExchangeInitService` path
3. build `market-making-runtime.helper.ts` around the production execution graph
4. add `market-making.processor.system.spec.ts` for `start_mm` and `stop_mm`
5. add `pure-market-making-single-tick.system.spec.ts`
6. add `pure-market-making-multi-layer.system.spec.ts`
7. add `pure-market-making-cadence.system.spec.ts`
8. keep `sandbox-fill-resolution.system.spec.ts` as required resolution coverage
9. add private-fill ingestion coverage only after the runtime path exists

## Documentation Updates

Update `docs/tests/MARKET_MAKING.md` with:

- the difference between current implemented sandbox coverage and the broader production-parity target
- required env vars
- `bun run test:system`
- skip behavior when sandbox config is absent
- cleanup behavior for created sandbox orders
- explicit note that production-parity means the same execution runtime path, not a special sandbox-only path
- explicit note that full fill-ingestion parity remains gated until real private-stream ingestion exists

Update `docs/plans/README.md` so the plan index describes this file as the production-parity sandbox execution plan rather than only adapter-level coverage.

## Deferred Boundaries

The following topics remain intentionally outside this execution-engine plan unless a later document expands the boundary:

### 1. Deposit Tracking

Intent:

- validate deposit-tracking decision logic across Mixin withdrawal record, on-chain transaction record, and exchange deposit history

Current boundary:

- not part of the exchange-side execution engine plan

### 2. HuFi Campaign Flow

Intent:

- validate campaign discovery, matching, authentication, and join flow

Current boundary:

- not part of the exchange-side execution engine plan

### 3. Broader Market-Making Lifecycle

Intent:

- validate orchestration across payment, withdrawal, deposit confirmation, campaign join, strategy start, fill lifecycle, stop, and cleanup

Current boundary:

- broader than the execution-engine scope in this document
- must not be mixed with exchange-side execution parity under one ambiguous label

## Production-Parity Upgrade Gates

The sandbox plan may only claim production-parity coverage for a given behavior after the corresponding runtime behavior exists and is asserted through the same code path used by production.

### 1. Exchange Boot Parity Exists

- sandbox exchange boot runs through `ExchangeInitService`
- sandbox mode is enabled before `loadMarkets()`
- runtime services obtain the exchange through the normal `getExchange()` path

### 2. Start And Stop Entry Points Are Covered

- `start_mm` is asserted through `MarketMakingProcessor.handleStartMM()`
- `stop_mm` is asserted through `MarketMakingProcessor.handleStopMM()`
- any stronger stop claim such as drain or cancel only appears after runtime implements it

### 3. Tick-To-Execution Path Is Covered

- one real runtime tick can generate intents
- `StrategyIntentExecutionService` consumes those intents
- real sandbox orders are placed through `ExchangeConnectorAdapterService`
- tracker and mapping state persist correctly

### 4. Fill-Ingestion Parity Exists

- a real private-fill ingestion path exists
- tests can observe it deterministically
- fill routing reaches the correct executor and session from a live exchange fill event

Until that point, routing resolution coverage is useful but not equivalent to full fill-handling parity.

## Acceptance Criteria

### Harness

- sandbox helper or bootstrap logic enables sandbox mode before market loading
- sandbox exchange is reachable through the same `ExchangeInitService` contract used by runtime
- integration tests are excluded from the default unit suite
- sandbox env examples use integration-only variable names

### Exchange Init And Adapter Lifecycle

- the suite can place, fetch, and cancel a real sandbox order through the normal exchange-init path
- the suite cleans up created open orders
- the suite skips explicitly when sandbox credentials are absent

### Production Entry Points

- `start_mm` is executed through the real processor path
- `stop_mm` is executed through the real processor path
- executor registration and session removal are asserted
- stop-path assertions match actual runtime behavior

### Exchange-Side Runtime

- a manual tick can create real sandbox buy and sell orders through the full runtime path
- intent status reaches `DONE`
- exchange order mappings are persisted
- exchange order tracker state is updated
- multi-layer and cadence behavior are covered through real sandbox execution

### Fill Routing

- the suite verifies parser resolution
- the suite verifies client-order mapping fallback
- the suite verifies exchange-order mapping fallback
- the suite does not claim live fill ingestion until that runtime path exists

### Production-Parity Gate

- docs clearly state which missing runtime pieces still block stronger parity claims
- docs do not describe a sandbox-only shortcut as equivalent to production execution coverage

## Risks And Mitigations

| Risk                                                                      | Mitigation                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Exchange sandbox support changes in CCXT                                  | CCXT provides uniform sandbox interface; test structure works across exchanges                                                    |
| Sandbox helpers diverge from production runtime                           | Keep helpers thin and require core suites to use `ExchangeInitService`, `start_mm`, `stop_mm`, and the real intent-execution path |
| Sandbox orders fill unexpectedly                                          | Use far-from-market pricing where supported and always run cleanup                                                                |
| `stop_mm` leaves exchange orders open because runtime does not drain them | Keep cleanup in the harness and block stronger stop-safety claims until runtime implements drain or cancel behavior               |
| System specs accidentally run in unit CI                                  | Keep a dedicated Jest config and exclude `*.system.spec.ts` from the default suite                                                |
| Test flakiness from network latency                                       | Use generous timeouts and eventual-state assertions                                                                               |
| Documentation overclaims current system capability                        | Keep private-fill and stronger stop-safety claims explicitly gated behind runtime prerequisites                                   |

## Done Criteria

- this file is implementation-ready for production-parity sandbox coverage of the current exchange-side execution engine
- no core sandbox suite in this plan depends on mocking `ExchangeInitService.getExchange()`
- the plan makes the same-code-path requirement explicit for sandbox versus mainnet execution
- remaining blockers such as real fill ingestion or stronger stop-safety behavior are documented as gates, not hidden assumptions
- this file remains the only source of truth for sandbox execution-testing scope
- sandbox activation is environment-only, no codebase modifications required to run tests

## Verification Readiness And TODO Checklist

These phases are not just design placeholders. They are intended to be verifiable against one real CCXT sandbox exchange with exchange-side evidence and local runtime evidence.

Verification evidence should come from both sides:

- exchange-side evidence: returned exchange order ID, successful `fetchOrder()`, optional `fetchOpenOrders()` visibility when supported, and successful `cancelOrder()` or equivalent closed-state confirmation
- runtime-side evidence: persisted mapping rows, persisted execution-history rows where applicable, executor attachment or detachment, latest intent status, and in-memory tracker state

### Phase 1: Production-Parity Sandbox Bootstrap

Verifiable: yes

TODO:

- make `ExchangeInitService` read `CCXT_SANDBOX_*` config directly
- instantiate the selected CCXT exchange through the same production init path
- call `setSandboxMode(true)` before `loadMarkets()`
- expose the sandbox exchange through normal `getExchange(exchangeName, label)` resolution
- add a runtime test helper that builds the real execution-service graph needed by later phases

Verification:

- `ExchangeInitService.getExchange()` returns the sandbox exchange configured by `CCXT_SANDBOX_*`
- the returned exchange can fetch markets and order books without using the isolated sandbox helper path
- production exchange boot remains unchanged when sandbox env is absent

### Phase 2: Exchange Init And Order Lifecycle

Verifiable: yes

TODO:

- replace the current mocked `ExchangeInitService` path in `sandbox-order-lifecycle.system.spec.ts` with the real service
- keep cleanup of created sandbox orders mandatory
- make `fetchOpenOrders()` assertions conditional for exchanges that do not support that capability cleanly

Verification:

- the suite obtains the exchange from `ExchangeInitService.getExchange()`
- the suite places a real sandbox order and receives a real exchange order ID
- the same order ID can be refetched from the exchange
- the order can be canceled and its final state can be confirmed from the exchange response

### Phase 3: Production Entry Point Coverage

Verifiable: yes

TODO:

- add `market-making.processor.system.spec.ts`
- create or load a persisted market-making order fixture with valid `strategySnapshot.resolvedConfig`
- invoke `handleStartMM()` and `handleStopMM()` through the real processor
- assert executor attachment and detachment through `ExecutorRegistry`

Verification:

- `start_mm` changes order state to `running`
- the expected pooled executor contains the runtime session for the order
- `stop_mm` removes that session and changes order state to `stopped`
- this phase does not claim exchange-order drain unless runtime code actually implements it

### Phase 4: Exchange-Side Runtime Behavior

Verifiable: yes

TODO:

- add `pure-market-making-single-tick.system.spec.ts`
- add `pure-market-making-multi-layer.system.spec.ts`
- add `pure-market-making-cadence.system.spec.ts`
- drive manual ticks through the real executor path for deterministic assertions

Verification:

- a manual tick publishes the expected intents for the runtime session
- intent execution places real sandbox orders through `ExchangeConnectorAdapterService`
- `StrategyIntentExecutionService` persists exchange order mappings and execution history
- `ExchangeOrderTrackerService` reflects the open orders created by the runtime
- repeated ticks advance deterministic client-order sequencing without destabilizing the executor

### Phase 5: Fill Routing And Fill Ingestion Gate

Verifiable now: partially

TODO:

- keep `sandbox-fill-resolution.system.spec.ts` as required coverage for routing resolution
- defer `private-fill-ingestion.system.spec.ts` until a real exchange private-stream fill path exists
- do not describe queued synthetic events as full fill-ingestion parity

Verification:

- fill-routing resolution is verifiable now through parseable `clientOrderId`, client-order mapping fallback, and exchange-order mapping fallback using a real sandbox order ID
- private-fill ingestion is not yet verifiable as production parity because `PrivateStreamTrackerService` currently consumes queued in-memory events instead of a live exchange private stream

Bottom-line rule:

- phases 1 through 4 can and should be implemented as verifiable sandbox execution tests that place real orders on exchange testnet
- phase 5 should stay split between verifiable routing coverage now and gated private-fill ingestion later

## Status

- Created: 2026-03-15
- Updated: 2026-03-17
- Status: Ready for Implementation

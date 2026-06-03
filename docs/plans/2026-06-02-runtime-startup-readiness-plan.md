# Runtime Startup And Readiness Plan

## Goal

Make backend startup architecture explicit and NestJS-aligned:

- HTTP server startup should not block on external exchange, Mixin, or cache warmup I/O.
- Trading risk-increasing operations must still be blocked when required runtime dependencies are not ready.
- Background startup tasks should be coordinated from one runtime module, not scattered through constructors or unrelated `onModuleInit()` hooks.
- Readiness state should be inspectable through health/admin surfaces instead of inferred from whether Nest startup is slow.

## NestJS Guidance

This plan follows these NestJS practices:

- Use lifecycle hooks for application startup behavior. `onModuleInit()` and `onApplicationBootstrap()` may return promises, and Nest waits for those promises before finishing startup.
- Use awaited async initialization only for hard dependencies that must be ready before the app accepts requests, such as DB connectivity.
- Avoid starting asynchronous external I/O in constructors. Constructors should assign dependencies and initialize local state.
- Use health/readiness endpoints to express whether downstream dependencies are ready.

References:

- Nest lifecycle events: https://docs.nestjs.com/fundamentals/lifecycle-events
- Nest async providers: https://docs.nestjs.com/fundamentals/async-providers
- Nest Terminus health checks: https://docs.nestjs.com/recipes/terminus
- Nest events startup warning: https://docs.nestjs.com/techniques/events

## Current Problems

### Exchange Initialization

`ExchangeInitService` starts async initialization in its constructor:

```ts
constructor(...) {
  this.initializeExchanges().then(...);
}
```

That is hard to reason about because dependency construction also starts CCXT network work.

Exchange initialization includes authenticated `loadMarkets()` calls and optional exchange-specific sign-in. This should not happen inside a constructor.

### Grow Data Warmup

`GrowdataService.onModuleInit()` currently warms `/grow` cache. The warmup performs:

- DB reads for grow metadata.
- CCXT public market loading through `getCcxtExchangeMarkets()`.
- Mixin asset price fetches through `safe.fetchAssets()`.

This data is useful for `/grow`, but it is not a hard dependency for the whole HTTP server.

### Runtime Workers

Message handling, withdrawal confirmation scheduling, reconciliation, tracking, and balance refresh each start from local lifecycle hooks. Some are fine as local schedulers, but cross-module startup work lacks one top-level place to inspect.

## Target Architecture

Add a runtime module:

```text
server/src/modules/runtime/
  runtime.module.ts
  runtime-startup.service.ts
  runtime-readiness.service.ts
  runtime-readiness.types.ts
```

The runtime module is an application orchestration module, not a business layer.

It may depend on infrastructure/data/mixin/trading services, but those services must not depend back on the runtime module.

## RuntimeStartupService

`RuntimeStartupService` implements `OnApplicationBootstrap`.

It starts background runtime tasks after Nest has initialized all modules but before the application bootstrap hook completes.

It should not await external network I/O unless the task is a hard app dependency.

Shape:

```ts
@Injectable()
export class RuntimeStartupService implements OnApplicationBootstrap {
  onApplicationBootstrap(): void {
    this.exchangeInitService.startBackgroundInitialization();
    this.growdataService.startWarmup();
    this.messageService.startMessageLoop();
    this.withdrawalStartupService.start();
  }
}
```

Rules:

- The coordinator invokes start methods only.
- The coordinator does not place orders, mutate balances, settle fills, or run strategy logic.
- Each owned service records its own status.
- Startup methods are idempotent.
- Startup methods catch/log errors and update readiness state.

## RuntimeReadinessService

Add a small read-only readiness service that aggregates runtime component states.

Suggested state model:

```ts
type RuntimeComponentStatus =
  | 'disabled'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'failed';
```

Suggested components:

- `exchangeInitialization`
- `growData`
- `mixinMessages`
- `withdrawalConfirmationWorker`
- `reconciliation`
- `balanceRefresh`

Readiness must distinguish product readiness from process liveness:

- Liveness: process can serve HTTP.
- General readiness: DB/migrations and baseline app dependencies are usable.
- Trading readiness: exchange initialization and reconciliation safety allow risk-increasing operations.
- Grow readiness: grow cache is ready or warming.

## Risk Gate Semantics

Do not rely on startup blocking for trading safety.

Risk-increasing operations should check explicit runtime state:

- If exchange initialization for an account is `starting` or `failed`, order creation/execution for that exchange account must be rejected or paused.
- If reconciliation reports mismatch, risk-increasing operations remain blocked.
- If grow data is warming, only grow-data reads should wait/fallback; trading should not depend on this cache unless a specific path explicitly needs it.

This keeps the existing invariant:

> External orders -> risk check -> order-level reservation before proceeding.

## Module Placement

Use:

```text
server/src/modules/runtime/
```

Do not put this under `infrastructure/`.

Reason:

- `infrastructure` should provide lower-level capabilities.
- Runtime startup coordinates multiple domains.
- Putting it in `infrastructure` would make infrastructure import data/mixin/trading modules and blur dependency direction.

Import `RuntimeModule` near the end of `AppModule.imports` after the modules it coordinates.

## Implementation Plan

### Phase 1: Readiness Types And Runtime Module

- Add `RuntimeModule`.
- Add `RuntimeReadinessService`.
- Add typed component status records with timestamp, message, and optional error.
- Keep this read-only outside runtime startup.
- Add unit tests for status transitions and aggregation.

### Phase 2: Grow Data Startup Cleanup

- Remove grow-data warmup from `onModuleInit()`.
- Add `GrowdataService.startWarmup()`.
- Add `GrowdataService.getReadiness()`.
- Preserve `growDataRefreshInFlight` so first callers share the warmup promise.
- Update tests to assert `startWarmup()` is non-blocking and state transitions to ready/failed.

### Phase 3: Exchange Startup Cleanup

- Remove async initialization from `ExchangeInitService` constructor.
- Add `ExchangeInitService.startBackgroundInitialization()`.
- Make it idempotent.
- Track global and per `exchange + accountLabel` status.
- Keep `getExchange()` behavior strict: pending should return `ServiceUnavailableException`; failed should return failure evidence.
- Keep refresh timers started only after the first initialization attempt begins.
- Update tests for constructor side-effect removal and idempotent startup.

### Phase 4: Runtime Startup Coordinator

- Add `RuntimeStartupService`.
- Move background calls into `onApplicationBootstrap()`.
- Start exchange initialization, grow warmup, Mixin message loop, and withdrawal worker from the coordinator.
- Keep internal schedulers such as tick/reconciliation local if they are already pure timers and do not require cross-module orchestration.
- Add tests proving `onApplicationBootstrap()` calls start methods without awaiting long-running external work.

### Phase 5: Message And Withdrawal Startup Cleanup

- Replace `MessageService.onModuleInit()` startup with `startMessageLoop()`.
- Make message loop startup idempotent.
- Move withdrawal confirmation enqueue into a small injectable startup service instead of the module class if needed.
- Preserve disabled-worker behavior.

### Phase 6: Health And Admin Visibility

- Expose runtime readiness through existing health/admin system endpoints.
- Show component status, last transition time, and safe error message.
- Do not include secrets or raw API keys.
- Add tests for readiness payload shape.

### Phase 7: Trading Safety Checks

- Audit order creation/execution paths that rely on exchange readiness.
- Ensure they use explicit exchange/account readiness or current `getExchange()` strict behavior.
- Confirm reconciliation mismatch still blocks risk-increasing operations.
- Add focused tests for pending/failed exchange initialization blocking execution.

## Non-Goals

- Do not add generic balance adjustment paths.
- Do not move reservation, exchange mutation, tracked orders, or fills into runtime startup.
- Do not make strategy controllers place exchange orders or mutate balances.
- Do not turn grow data into a hard startup dependency unless a specific business path requires it.
- Do not introduce compatibility switches for old constructor-based startup.

## Validation

Run focused tests during implementation:

```sh
bun run test -- grow-data.service.spec.ts
bun run test -- exchange-init.service.spec.ts
```

Then run broader backend validation:

```sh
bun run test
bun run build
```

Manual startup validation:

- Start the server.
- Confirm `Nest application successfully started` appears without waiting on grow data cache refresh.
- Confirm exchange initialization logs continue after HTTP server is available.
- Confirm `/health` or admin readiness reports warming/ready states accurately.
- Confirm risk-increasing trading actions fail while the required exchange account is pending/failed.

## Success Criteria

- No service constructor starts external asynchronous I/O.
- No grow-data or exchange market loading blocks generic HTTP readiness.
- Trading safety is controlled by explicit readiness/risk checks.
- Runtime startup behavior is visible in one module.
- Readiness state is visible through health/admin APIs.
- Existing ledger and order-attribution invariants remain unchanged.

# Server Business Flows

This file maps runtime logic to business behavior.

## Flow 1: User market-making order lifecycle

1. Client creates order intent through user-orders API with strategyDefinitionId and optional configOverrides.
2. Snapshot polling detects payment snapshots and validates memo payload.
3. Snapshot processor enqueues market-making job.
4. Market-making processor checks payment state and business constraints.
5. System resolves strategy config: loads definition, merges defaultConfig + configOverrides, validates against configSchema.
6. System creates MarketMakingOrder with pinned strategySnapshot (controllerType, resolvedConfig).
7. `start_mm` later attaches the order to ExchangePairExecutor(exchange, pair) for pooled execution.
8. Optional campaign join/local-campaign steps are scheduled.

### Main modules in this flow

- `mixin/snapshots`
- `market-making/user-orders`
- `market-making/strategy` (config resolution)
- `market-making/strategy/execution/executor-registry` (pooled executors)
- `market-making/fee`
- `campaign` and `market-making/local-campaign`

### Why this flow exists

- It turns external funding events into an active trading lifecycle with durable records.
- Orders snapshot resolved config at creation - runtime never re-resolves.

## Flow 2: Strategy runtime intent pipeline

1. Strategy runtime dispatcher resolves strategy definition/version/runtime mode.
2. Strategy controller (one of: ArbitrageStrategyController, PureMarketMakingStrategyController, VolumeStrategyController, TimeIndicatorStrategyController) computes actions (place/cancel/wait semantics).
3. Executor orchestrator writes actionable intents.
4. Intent worker or sync path consumes intents.
5. Execution adapter calls exchange or DEX side effects.
6. Intent status moves through lifecycle and durability events are appended.

### Main modules in this flow

- `market-making/strategy`
- `market-making/strategy/controllers` (controller registry and implementations)
- `market-making/strategy/execution` (executor-registry, exchange-pair-executor, intent services)
- `market-making/execution` (exchange connector adapter, fill routing)
- `market-making/durability`
- `market-making/trackers`
- `market-making/tick`

### Why this flow exists

- It separates decision logic from side effects and keeps retries/idempotency manageable.

## Flow 2b: Pooled executor tick loop

1. Tick module triggers executor registry iteration.
2. ExecutorRegistry (in `strategy/execution/executor-registry.ts`) dispatches tick to each ExchangePairExecutor (by exchange:pair).
3. ExchangePairExecutor loads market data via StrategyMarketDataProviderService and iterates strategy sessions.
4. Each session calls controller onTick() to compute actions.
5. Actions flow through executor orchestrator and intent pipeline.

### Main modules in this flow

- `market-making/strategy/execution/executor-registry.ts`
- `market-making/strategy/execution/exchange-pair-executor.ts`
- `market-making/strategy/data/strategy-market-data-provider.service.ts`
- `market-making/strategy/intent/executor-orchestrator.service.ts`

### Why this flow exists

- Pooled executors share market data and reduce per-order overhead.
- Execution boundary is exchange:pair for this phase.

## Flow 3: Tick-driven system loop

1. Tick module starts coordinator on runtime init.
2. Registered components run in deterministic order.
3. Unhealthy components are skipped for safety.
4. Overlapping ticks are prevented.

### Main modules in this flow

- `market-making/tick`
- `market-making/strategy`
- `market-making/trackers`

### Why this flow exists

- It provides predictable periodic execution for strategy/tracker subsystems.

## Flow 3b: Fill routing with pooled executors

1. Private stream tracker receives fill event with clientOrderId.
2. FillRoutingService (in `market-making/execution/fill-routing.service.ts`) parses clientOrderId format `{orderId}:{seq}`.
3. If parse success: route to ExchangePairExecutor by order's exchange:pair.
4. If parse fail: fallback to ExchangeOrderMapping lookup by clientOrderId.
5. If still fail: lookup by exchangeOrderId.
6. If all fail: log orphaned fill for manual review.
7. ExchangePairExecutor.onFill() dispatches to strategy session.

### Main modules in this flow

- `market-making/trackers/private-stream-tracker`
- `market-making/execution/fill-routing.service.ts`
- `market-making/execution/exchange-order-mapping.service.ts`
- `market-making/strategy/execution/executor-registry.ts`
- `market-making/strategy/execution/exchange-pair-executor.ts`

### Why this flow exists

- Pooled executors need deterministic fill routing by orderId.
- Fallback chain provides recovery for parsing failures.

## Flow 4: Pause and withdraw orchestration

1. Orchestrator requests strategy stop.
2. System drains open exchange orders (cancel until clear).
3. Ledger unlock and withdraw debit mutations are applied with idempotency keys.
4. Durable pending outbox event is appended.
5. Withdrawal service executes external withdrawal.
6. On success, completed event is appended.
7. On failure, failed event is appended and ledger compensation rollback is applied.

### Main modules in this flow

- `market-making/orchestration`
- `market-making/ledger`
- `market-making/durability`
- `mixin/withdrawal`
- `market-making/trackers`

### Why this flow exists

- Withdraw is a multi-step cross-module business action that must stay safe and recoverable.

## Flow 5: Ledger and durability coupling

1. Business services request a balance mutation command.
2. Ledger service applies append-only ledger entry + read-model update atomically.
3. Mutation idempotency key blocks duplicates.
4. Durability service appends outbox event for downstream processing.
5. Consumers mark receipts for idempotent event handling.

### Main modules in this flow

- `market-making/ledger`
- `market-making/durability`
- any caller module (user-orders, orchestration, rewards)

### Why this flow exists

- Financial operations need replay safety, traceability, and deterministic compensation.

## Flow 6: Reward allocation and transfer

1. Reward pipeline collects eligible basis and computes allocations.
2. Share ledger and reward ledger entities are updated.
3. Reward receiver checks confirmations on schedule.
4. Reward vault transfer executes under idempotent durability guard.

### Main modules in this flow

- `market-making/rewards`
- `market-making/ledger`
- `market-making/durability`
- `mixin/transaction`
- `web3`

### Why this flow exists

- Reward distribution must be auditable, accurate, and robust against retries.

## Flow 7: Campaign sync and score update

1. Scheduler syncs campaign data from external sources.
2. Join operations are scheduled for active campaign participation.
3. Daily score estimator writes HUFI score snapshots from strategy history.

### Main modules in this flow

- `campaign`
- `market-making/local-campaign`
- `market-making/strategy` (history source)

### Why this flow exists

- It connects trading activity to campaign and score business requirements.

## Trigger Map

- HTTP controllers: admin/auth/data/user-orders/mixin/health.
- Cron schedules: snapshots, campaign sync, score estimation, reconciliation, reward checks.
- Queue processors: `snapshots`, `market-making`, `withdrawals`, `withdrawal-confirmations`, `local-campaigns`.
- Runtime worker loops: strategy intent worker and tick coordinator.

## Notes on cautious wording

- Some branches are conditional (for example withdrawal queueing and campaign join scheduling behavior), so docs should describe intended flow and note conditional paths when code gates are present.
- Legacy aliases exist in strategy runtime naming and should be treated as compatibility behavior, not new design preference.

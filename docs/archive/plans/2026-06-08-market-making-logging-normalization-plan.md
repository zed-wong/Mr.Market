# Market-Making Logging Normalization Plan

## Goal

Make execution-layer logs readable, actionable, and scalable.

Current logs mix lifecycle events, per-tick decisions, expected skips, diagnostics, and real alerts at `log`/`warn` level. The result is unreadable console output and noisy webhook alerts.

## Core Direction

Do not add a new `MarketMakingLogService`.

Extend the existing `CustomLogger` with a domain logger adapter:

```ts
private readonly logger = new CustomLogger(ServiceName.name);
private readonly mmLog = this.logger.marketMaking();
```

Usage:

```ts
this.mmLog.info('strategy resumed', fields);
this.mmLog.debug('strategy decision', fields);
this.mmLog.warn('strategy blocked', fields, {
  onceKey: `strategy-blocked:${strategyKey}:${reason}`,
  windowMs: 60_000,
});
this.mmLog.error('intent failed', fields);
```

This keeps `CustomLogger` generic while giving market-making a clean, domain-specific logging surface.

## Console Format

Use a short human-readable message first, then structured fields:

```text
[MM] <area> <result> | <identity fields> | <diagnostic fields>
```

Examples:

```text
[MM] strategy blocked | reason=order_book_stale strategy=ddc840... exchange=mexc pair=XIN/USDT account=2 | ageMs=9297 actions=0
[MM] intents published | strategy=ddc840... exchange=mexc pair=XIN/USDT account=2 | creates=1 cancels=1 driver=worker
[MM] quote blocked | reason=insufficient_balance side=buy strategy=ddc840... pair=XIN/USDT | required=5.199 available=2.82288 asset=USDT
[MM] runtime slow | scope=fetch_order exchange=mexc pair=XIN/USDT account=2 | durationMs=2861 thresholdMs=500
```

## Field Rules

Identity fields come first:

- `reason`
- `strategy`
- `exchange`
- `pair`
- `account`
- `side`
- `order`
- `slot`
- `scope`

Diagnostic fields come second:

- `actions`
- `creates`
- `cancels`
- `layers`
- `ageMs`
- `durationMs`
- `thresholdMs`
- `required`
- `available`
- `asset`
- `status`
- `repeat`
- `driver`

Skip empty values:

- `undefined`
- `null`
- empty string

## Log Level Rules

### `info`

Only low-frequency lifecycle events and final results:

- strategy resumed/stopped
- session created/destroyed
- order book subscribed/released
- balance watcher started/reused
- intent batch published
- order created/cancelled/fill final
- order state changed

### `debug`

High-frequency details:

- tick decision
- mid/spread/layers
- single intent details
- balance refresh due selection
- watchBalance payload
- fetchOrderBook top bid/ask
- normal quote filtering

### `warn`

Actionable abnormal trends. Repeated warnings should use `onceKey/windowMs`.

- strategy blocked by stale order book
- balance cache stale for a sustained period
- repeated insufficient balance blocking the strategy
- runtime slow
- repeated cancel/fetch failures
- unusable order book stream

### `error`

Non-recoverable failures or consistency risks:

- intent execution failed and cannot recover
- ledger/reconciliation failure
- non-idempotent exchange failure
- unexpected invariant violation

## Implementation Plan

### 1. Extend `CustomLogger`

File:

- `server/src/modules/infrastructure/logger/logger.service.ts`

Changes:

- Add `marketMaking()` adapter.
- Add domain formatter for `[MM] ... | key=value`.
- Add field ordering.
- Add `onceKey/windowMs` rate limiting.
- Keep webhook behavior only for real `warn`/`error` after rate limiting.

### 2. Normalize `ExecutorOrchestratorService`

File:

- `server/src/modules/market-making/strategy/intent/executor-orchestrator.service.ts`

Changes:

- Single `Intent published` logs become `debug`.
- Batch publish becomes concise `info`.
- Batch summary should include `creates`, `cancels`, `strategy`, `exchange`, `pair`, `account`, `driver`.

### 3. Normalize `BalanceRefreshScheduler`

File:

- `server/src/modules/market-making/balance-state/balance-refresh-scheduler.ts`

Changes:

- `registeredAccounts` -> `debug`.
- `dueSelection` -> `debug`.
- `markDue` -> `debug`.
- Slow refresh warning remains handled by runtime timing aggregation.

### 4. Normalize `PureMarketMakingStrategyController`

File:

- `server/src/modules/market-making/strategy/controllers/pure-market-making-strategy.controller.ts`

Changes:

- `midPrice/bidSpread/askSpread/layers/liveBuys/liveSells` -> `debug('strategy decision')`.
- `tracked price source unavailable` -> rate-limited `warn('strategy blocked')`.
- `stale tracked market data` -> rate-limited `warn('strategy blocked')`.
- `no_quotes_after_filters` -> rate-limited `warn('strategy skipped')`.
- Quote skip logs should use consistent `reason` fields.

### 5. Normalize `AdaptivePmmStateService`

File:

- `server/src/modules/market-making/strategy/pmm/adaptive-pmm-state.service.ts`

Changes:

- Continue persisting full `adaptive_pmm.decision` metadata.
- Stop printing full JSON decision snapshots to console every tick.
- Normal `quote_build` decision -> `debug('adaptive decision')`.
- Safety/block reasons -> rate-limited `warn`.

### 6. Normalize `UserStreamIngestionService`

File:

- `server/src/modules/market-making/trackers/user-stream-ingestion.service.ts`

Changes:

- balance watcher start/reuse -> `info`.
- `watchBalance received payload` -> `debug`.
- `Seeded balance cache from fetchBalance` -> `info` or `debug`.
- `watchBalance loop failed` -> rate-limited `warn`.

### 7. Normalize `OrderBookIngestionService`

File:

- `server/src/modules/market-making/trackers/order-book-ingestion.service.ts`

Changes:

- subscribe/release -> `info`.
- REST seed success -> `info` or `debug`.
- unusable streamed order book -> rate-limited `warn`.
- seed failed -> rate-limited `warn`.

### 8. Normalize `MarketMakingRuntimeTimingService`

File:

- `server/src/modules/market-making/tick/runtime-timing.service.ts`

Changes:

- Replace per-event `Runtime timing threshold exceeded` warnings with rate-limited `warn('runtime slow')`.
- Aggregate by `scope/exchange/pair/account`.
- Include `count`, `maxMs`, `lastMs`, and `thresholdMs` when possible.

### 9. Normalize `QuotePlannerService`

File:

- `server/src/modules/market-making/strategy/quote/quote-planner.service.ts`

Changes:

- Expected `insufficient_balance` filtering -> `debug`.
- Sustained strategy-level insufficient balance -> rate-limited `warn`.
- `quantization_rejected` / min-notional filtering -> `debug`.
- Use consistent fields: `reason`, `side`, `required`, `available`, `asset`, `slot`.

### 10. Normalize `TrackedOrderShutdownService`

File:

- `server/src/modules/market-making/trackers/tracked-order-shutdown.service.ts`

Changes:

- Treat `Unknown order id` and `Order cancelled` as idempotent success during cleanup.
- Do not warn for idempotent cancel results.
- Real cancel failures -> rate-limited `warn('shutdown cancel failed')`.

### 11. Normalize `ExchangeConnectorAdapterService`

File:

- `server/src/modules/market-making/execution/exchange-connector-adapter.service.ts`

Changes:

- `fetchOrderBook bids/asks/topBid/topAsk` -> `debug`.
- Do not print high-frequency market data at `info`.
- Let callers/runtime timing produce aggregated warnings for slow/failing calls.

### 12. Normalize `StrategySessionRegistryService`

File:

- `server/src/modules/market-making/strategy/runtime/strategy-session-registry.service.ts`

Changes:

- `Order book ingestion available=true` -> `debug` or remove.
- connector health changes remain `info`.
- session lifecycle logs use `[MM] session ...` format.

### 13. Reduce global request log noise

File:

- `server/src/main.ts`

Changes:

- Avoid `info` logging every admin polling request.
- Move request logs to `debug`, or filter polling endpoints such as:
  - `/admin/market-making/direct-orders`
  - `/admin/market-making/campaigns`
- Keep slow/error request logging if needed.

### 14. Normalize `UserOrdersService`

File:

- `server/src/modules/market-making/user-orders/user-orders.service.ts`

Changes:

- Replace free-form state update log with:

```text
[MM] order state changed | order=... status=running
```

## Rollout Order

1. Add `logger.marketMaking()` and tests for formatting/rate limiting.
2. Convert low-risk high-noise services:
   - `ExecutorOrchestratorService`
   - `BalanceRefreshScheduler`
   - `UserStreamIngestionService`
3. Convert strategy decision logs:
   - `PureMarketMakingStrategyController`
   - `AdaptivePmmStateService`
   - `QuotePlannerService`
4. Convert runtime/exchange/shutdown logs:
   - `MarketMakingRuntimeTimingService`
   - `ExchangeConnectorAdapterService`
   - `TrackedOrderShutdownService`
5. Convert lifecycle and request logs:
   - `OrderBookIngestionService`
   - `StrategySessionRegistryService`
   - `UserOrdersService`
   - `main.ts`
6. Run server lint/typecheck/tests.

## Success Criteria

After direct resume/stop on a market-making order:

- Console shows lifecycle and compact summaries, not every tick detail.
- Expected per-tick decisions appear only in debug.
- Repeated stale/slow/balance warnings are rate-limited.
- Webhook alerts only fire for actionable warnings/errors.
- Detailed adaptive decisions remain available in execution history.

## Final Principle

Console is for humans. Fields are for search. History and metrics are for analysis. Warnings are for action.

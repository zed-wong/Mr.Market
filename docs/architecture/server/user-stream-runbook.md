# User Stream Runbook

## Scope

This runbook covers the market-making user stream path for `order`, `trade`, and `balance` events, including the WS-primary and REST-recovery modes used by dual-account strategies.

## What To Check First

1. Open the admin direct market-making status for the affected order.
2. Check `userStreamCapabilities` to confirm whether the exchange/account is `full`, `partial`, or `rest_only`.
3. Check `streamHealth` for each account:
   - `healthy`: recent user-stream activity is arriving.
   - `degraded`: stream is alive but balance freshness is falling behind.
   - `silent`: no recent user-stream activity; REST recovery should be active.
   - `reconnecting`: watcher loop is retrying after exchange/watch failure.
4. Check `userStreamRuntime`:
   - `activeWatcherCount`
   - `queueDepth`
   - `duplicateFillSuppressionCount`
5. Check `balanceCacheStatus` for each required asset/account. If entries are stale or missing, tick-time sizing skips the current cycle and the background refresh scheduler should recover the cache.

## Expected Operating Modes

### Full capability

- `watchOrders`, `watchMyTrades`, and `watchBalance` are available.
- Trade events are the preferred fill source.
- Order events still update order state, but duplicate fill routing is suppressed once the same trade cumulative quantity is observed.

### Partial capability

- One or more watch methods are unavailable.
- Fill routing still works through the available stream plus REST order reconciliation.
- Balance freshness may depend more heavily on `BalanceRefreshScheduler` driving `BalanceStateRefreshService`.

### Rest-only

- No private/user stream is available.
- Order recovery and balance refresh rely on off-tick REST workers only.
- This mode is slower but should remain safe.

## Common Failure Modes

### Queue depth keeps growing

- Symptom: `userStreamRuntime.queueDepth` trends upward and does not drain.
- Check whether executor callbacks are blocked or failing.
- Check whether the exchange watcher is flooding repeated updates.
- If duplicate fills are rising at the same time, inspect the exchange payload shape and normalizer output.

### Stream is silent

- Symptom: `streamHealth.state = silent`.
- Confirm whether the exchange/account actually supports the relevant watch methods.
- Confirm watcher state is active for the order/account pair.
- Verify `lastBalanceRefreshAt` continues to move forward; if so, REST recovery is covering the gap.

### Duplicate fill suppression keeps rising

- Symptom: `duplicateFillSuppressionCount` increases rapidly.
- A moderate increase is expected on exchanges that emit both order and trade updates for the same fill.
- A sharp unexpected increase usually means the exchange is replaying stale cumulative fills or the normalizer is mapping the same fill fingerprint repeatedly.

### Stale balance cache

- Symptom: `balanceCacheStatus[].stale = true`.
- Strategy sizing skips the affected tick instead of doing inline REST backfill.
- If stale persists, inspect `watchBalance` support and `BalanceRefreshScheduler` / `BalanceStateRefreshService` timing.

## Recovery Guidance

1. Do not rely on private WS replay after restart.
2. Let watcher loops reconnect automatically first.
3. If the stream remains silent, confirm off-tick REST balance refresh and order reconciliation are still healthy.
4. If a specific exchange payload changed, update the exchange normalizer instead of adding parsing logic in ingestion or strategy code.

## Implementation Notes

- Runtime observability is intentionally in-memory.
- Persistent health/timestamp storage is deferred because restart safety already comes from REST recovery and tracked-order reconciliation.

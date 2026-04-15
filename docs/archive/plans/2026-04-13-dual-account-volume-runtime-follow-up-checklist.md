# Dual-Account Volume Runtime Follow-Up Checklist

Date: 2026-04-13

Status: TODO

## Context

This checklist captures the remaining runtime issues observed from the latest
MEXC `dualAccountVolume` logs after the fee-buffer and maker-price guard
changes were deployed.

What looked improved in this run:

- No `30004 Insufficient position` rejections appeared in the sampled window
- No `maker_not_best` skips appeared in the sampled window

What still looks wrong or risky:

- Tick overlap remains chronic because per-cycle decision and execution work is
  still much slower than the 1s coordinator cadence
- Preferred-side evaluation often collapses to tiny below-minimum buy capacity,
  then falls back to the sell side a few seconds later
- Account 4 and account 8 still share one per-exchange request queue, so one
  dual-account strategy serializes its own maker/taker state reads and writes
- IOC taker success still appears to be inferred from "did not throw" plus
  maker settlement, instead of explicit taker fill-completeness checks

## Findings Snapshot

| Priority | Problem | Evidence From Latest Logs | Why It Matters |
| --- | --- | --- | --- |
| P1 | Tick backpressure is still chronic | `decisionDurationMs` often `3.5s-5.5s`; many cycles log `Tick overlap detected` and `skippedCount>0` while `tickSizeMs=1000` | Decisions and verification run on stale state and reduce runtime throughput |
| P1 | Exchange request queue is still too coarse | Both maker/taker accounts on MEXC are serialized through the same adapter queue | Account 4 and 8 block each other even though they are distinct accounts |
| P2 | Inventory recovery is still reactive and slow | Buy side repeatedly shrinks to tiny below-minimum quantities, then fallback sell cycles continue to run | Strategy can drift into one-sided inventory exhaustion without actively restoring symmetry |
| P1 | Taker IOC success semantics may still be too weak | Logs show `Dual-account taker completed` based on downstream success logging, but no explicit `filled/remaining/status` telemetry for the taker leg | Partial IOC fills could still be counted as full cycle success without proof |
| P2 | Preferred-side failure is expensive to prove | Every failed preferred-side attempt burns balance reads, quantization, and rule checks before fallback | Latency compounds into overlap pressure and stale market checks |

## Todo Checklist

### Execution Correctness

- [ ] Log explicit taker IOC result fields for every dual-account taker leg: exchange status, filled, remaining, average, and cost
- [ ] Change dual-account cycle success criteria so taker completion requires explicit full-fill confirmation, not only "no exception" plus maker settlement
- [ ] Add unit coverage for partial IOC taker results and ensure they do not increment `completedCycles`
- [ ] Add a sandbox/system scenario that simulates partial taker fills and verifies the maker leg is handled safely

### Latency And Throughput

- [ ] Split exchange adapter rate limiting by `exchange + accountLabel` for state reads and writes where account isolation is safe
- [ ] Reuse one live balance snapshot per dual-account decision so preferred-side and fallback-side evaluation do not fetch the same balances twice
- [ ] Measure and log per-cycle balance-read time separately from rule-load time and quantization time so slow steps are visible
- [ ] Add an alerting/log threshold when `decisionDurationMs > tickSizeMs` or when overlap bursts exceed a fixed count
- [ ] Re-evaluate whether `strategy.tick_size_ms=1000` is realistic for dual-account volume on MEXC after the above optimizations

### Inventory And Rebalance Behavior

- [ ] Persist and log per-account pre-cycle and post-cycle free base/quote balances for the maker and taker accounts
- [ ] Verify whether the repeated `buy -> below_exchange_minimums -> fallback sell` pattern is expected inventory drift or a correctness bug
- [ ] Revisit the rebalance trigger so the runtime can proactively restore symmetry before the preferred side collapses to microscopic below-minimum size
- [ ] Add bounded soak coverage that exercises long alternating/fallback sequences and asserts inventory does not drift into a stuck one-sided pattern

### Observability And Operations

- [ ] Extend operator logs or status endpoints with dual-account runtime counters for fallback frequency, preferred-side rejection reasons, and overlap-burst counts
- [ ] Capture a short operator runbook for reading dual-account logs: how to interpret capacity shrink, below-minimum skips, fallback decisions, and taker completion lines
- [ ] Run a new bounded soak after the above fixes and record whether overlap pressure, fallback frequency, and cycle latency improved


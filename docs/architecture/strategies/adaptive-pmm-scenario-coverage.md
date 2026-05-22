# Adaptive PMM Scenario Coverage

This maps the 21 scenarios from
`docs/plans/2026-05-21-adaptive-pmm-plan.md` to executable coverage.

| # | Scenario | Coverage |
|---|---|---|
| 1 | Calm daily market | `pure-market-making-safety.mock.system.spec.ts` logical 30-minute soak, `calm-daily` case |
| 2 | News / price step | `pure-market-making-safety.mock.system.spec.ts` `widens spread and reduces size from adaptive volatility signals`; `quote-executor-manager.service.spec.ts` volatility widen / max-spread clamp / missing volatility fallback |
| 3 | One-way up trap | `pure-market-making-safety.mock.system.spec.ts` logical 30-minute soak, `one-way-up-inventory-wins` case; `suppresses imbalance skew when inventory deviation is severe` |
| 4 | One-way down | `quote-executor-manager.service.spec.ts` positive/negative inventory size discount behavior plus imbalance direction tests |
| 5 | Flash crash | `strategy-market-data-provider.service.spec.ts` `marks adaptive PMM snapshot as crashed when mid changes beyond threshold`; PMM unsafe-data cancel path in `strategy.service.spec.ts` and system safety spec |
| 6 | Sideways noisy book | `strategy-market-data-provider.service.spec.ts` realized volatility from log returns and EWMA imbalance smoothing; logical 30-minute soak `noisy-sideways` case; PMM cancel budget test in `strategy.service.spec.ts` |
| 7 | Toxic flow | `pmm-markout-evaluator.service.spec.ts`; `quote-executor-manager.service.spec.ts` toxic-side widen/shrink/pause/recovery; system safety spec toxic-side case and logical 30-minute soak `toxic-flow` case |
| 8 | Short WS disconnect | `strategy-market-data-provider.service.spec.ts` fresh/soft/hard freshness thresholds; connector disconnect/resume system safety case covers tick pause without exchange mutation |
| 9 | Medium WS disconnect | `strategy-market-data-provider.service.spec.ts` soft stale threshold; `strategy.service.spec.ts` and system safety spec unsafe tracked-data cancel/no-create path |
| 10 | Long WS disconnect | `strategy-market-data-provider.service.spec.ts` hard stale threshold; PMM unsafe-data cancel/no-create path; warmup tests cover recovery behavior |
| 11 | Thin small-cap book | `strategy-market-data-provider.service.spec.ts` insufficient imbalance depth; logical 30-minute soak `thin-book` case |
| 12 | Cold restart | `strategy.service.spec.ts` and system safety spec conservative warmup with thin signal history; startup restore system safety case |
| 13 | Exchange rate limit / reject | `runtime-observation.service.spec.ts`; `strategy-intent-execution.service.spec.ts` records intent failures; `strategy.service.spec.ts` and system safety spec runtime pressure widen / cadence slow |
| 14 | Exchange maintenance recovery | Connector disconnect/resume system safety case plus warmup tests prove recovery starts conservatively after unavailable runtime state |
| 15 | Deep trapped inventory | `quote-executor-manager.service.spec.ts` severe inventory side reduction and extreme inventory side pause; no cost-price anchoring is documented in `adaptive-pmm.md` |
| 16 | Reconciliation failure | `balance-ledger.service.spec.ts` reservation pause on rebuild mismatch; `strategy.service.spec.ts` PMM cancels and skips creates when reservation is paused |
| 17 | One-off adverse fill | `pmm-markout-evaluator.service.spec.ts` markout score accumulation threshold behavior; toxic protection only acts through accumulated side state |
| 18 | High volatility + severe inventory | `quote-executor-manager.service.spec.ts` vol size reduction, max layers in volatility, severe inventory suppression; logical 30-minute soak `high-vol-severe-inventory` case |
| 19 | Low volatility + severe inventory | `quote-executor-manager.service.spec.ts` inventory skew and inventory side reduction without relying on volatility; extreme inventory side pause case |
| 20 | Top-of-book spoof-like flash | `strategy-market-data-provider.service.spec.ts` EWMA imbalance smoothing and insufficient-depth gate |
| 21 | Small budget with many configured layers | `strategy.service.spec.ts` and system safety spec single-layer gate from `layeringMinBudgetMultiple * minOrderNotional` |

The long-run soak requirement is covered by the system spec named
`runs a logical 30-minute adaptive scenario soak without action storms or unsafe
stale creates`. It advances timestamps by 10 seconds for 180 ticks and cycles
the plan's required scenarios 1, 3, 6, 7, 11, and 18.

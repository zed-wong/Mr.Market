# Planning Docs

This directory contains active dated plans, current implementation todo items, and progress tracking.

## Why These Docs Keep Dates

Planning docs intentionally keep dates in their filenames.

- The date preserves the planning context for that iteration.
- A dated doc is not automatically obsolete just because it is older.
- If a dated doc is still guiding current work, it should remain in `planning/`.
- If it is no longer guiding current work, it should move to `../archive/plans/`.

## Doc Types

Use dated files, but keep the document role clear.

- `YYYY-MM-DD-*-roadmap.md`
  Use for stage goals, sequencing, boundaries, and phase gates.
  Do not use for detailed execution steps.
- `YYYY-MM-DD-*-plan.md`
  Use for implementation approach, execution steps, and validation details.
  Do not use for broad project prioritization.
- `YYYY-MM-DD-*-checklist.md`
  Use for point-in-time status snapshots: completed work, remaining work, and blockers.
  Do not use for long design background.
- `progress-log.md`
  Use for rolling chronological change notes.
  Do not create a new dated plan when a short progress entry is enough.

## Current Active Files And Roles

- **`2026-04-08-intent-worker-rate-limiting-improvements.md`**
  Role: active implementation plan for the current intent-worker rate-limit follow-up (not yet started)
- **`2026-04-13-hyperliquid-pancakeswap-volume-strategy.md`**
  Role: active implementation + validation plan for Hyperliquid dual-account volume and PancakeSwap live AMM volume runs
- **`2026-04-14-hummingbot-like-user-stream-plan.md`**
  Role: active implementation record for the 2026-04-14 user-stream migration (Phase 0+1/2 done, follow-up work remaining)
- **`2026-04-14-split-strategy-service-dual-account.md`**
  Role: not started. StrategyService has grown to 6827 lines. Plan to split into focused per-strategy-type services
- **`2026-04-16-dual-account-4-way-capacity-selection.md`**
  Role: active. Current feature branch (`dualAccountBestCapacityVolume`). 4-way best-capacity volume strategy
- **`2026-04-18-codebase-health-audit.md`**
  Role: active. Health audit findings and remediation checklist from 2026-04-18
- **`2026-04-18-admin-direct-best-capacity-session-failure-plan.md`**
  Role: active implementation plan for fixing admin-direct `dualAccountBestCapacityVolume` partial-start failures, pair/symbol normalization gaps, and orphan runtime row rollback
- **`todo.md`**
  Role: current open work list with short summaries plus detailed checklist sections
- **`progress-log.md`**
  Role: rolling chronological implementation log

## Archived

- **`2026-04-12-multi-account-counter-recon-volume-strategy.md`** → archived to `../archive/plans/`. Superseded by `2026-04-16-dual-account-4-way-capacity-selection.md` (the 4-way capacity approach replaced the multi-account randomization idea)

## When To Update Vs Create

- If work is continuing within the same phase and the same document role, update the existing dated doc.
- If the team introduces a new phase boundary or a materially different implementation approach, create a new dated doc.
- If the change is just a short status update, add it to `progress-log.md`.
- If a dated doc stops guiding current work, move it to `../archive/plans/`.

## Notes

- Historical plans live under `../archive/plans/`, including older completed or superseded dated plans
- Completed one-off TODO/checklist docs should move to `../archive/plans/` once the implementation log and active plan index are updated
- For current architecture reference, see `../architecture/`

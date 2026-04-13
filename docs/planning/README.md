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
  Role: active implementation plan for the current intent-worker rate-limit follow-up
- **`2026-04-13-hyperliquid-pancakeswap-volume-strategy.md`**
  Role: active validation checklist for Hyperliquid dual-account volume and PancakeSwap live AMM volume runs
- **`2026-04-13-dual-account-volume-runtime-follow-up-checklist.md`**
  Role: active checklist for remaining dual-account runtime issues observed in latest MEXC runs
- **`todo.md`**
  Role: current open work list with short summaries plus detailed checklist sections
- **`progress-log.md`**
  Role: rolling chronological implementation log

## When To Update Vs Create

- If work is continuing within the same phase and the same document role, update the existing dated doc.
- If the team introduces a new phase boundary or a materially different implementation approach, create a new dated doc.
- If the change is just a short status update, add it to `progress-log.md`.
- If a dated doc stops guiding current work, move it to `../archive/plans/`.

## Notes

- Historical plans live under `../archive/plans/`, including older completed or superseded dated plans
- For current architecture reference, see `../architecture/`

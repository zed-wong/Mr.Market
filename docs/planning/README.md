# Planning Docs

This directory contains active dated plans, current implementation todo items, and progress tracking.

## Why These Docs Keep Dates

Planning docs intentionally keep dates in their filenames.

- The date preserves the planning context for that iteration.
- A dated doc is not automatically obsolete just because it is older.
- If a dated doc is still guiding current work, it should remain in `planning/`.
- If it is no longer guiding current work, it can move to `../archive/`.

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

## Current Files And Roles

- **`todo.md`**
  Role: current open work list with short summaries plus detailed checklist sections
- **`progress-log.md`**
  Role: rolling chronological implementation log
- **`2026-03-18-market-making-testing-roadmap.md`**
  Role: market-making testing roadmap for stage order, boundaries, and phase gates
- **`2026-03-15-ccxt-sandbox-integration-testing-plan.md`**
  Role: detailed Track A sandbox execution plan
- **`2026-03-20-system-test-gap-analysis-and-improvement-plan.md`**
  Role: gap-analysis reference for current system-test coverage and remaining infrastructure/runtime fidelity work
- **`2026-03-21-persistent-sandbox-market-making-validation-plan.md`**
  Role: current operator-facing persistent sandbox validation proposal
- **`2026-03-23-dual-mode-self-hosted-cli-idea.md`** (in `../plans/`)
  Role: IDEA — dual-mode architecture (SaaS + self-hosted CLI) for future consideration

## When To Update Vs Create

- If work is continuing within the same phase and the same document role, update the existing dated doc.
- If the team introduces a new phase boundary or a materially different implementation approach, create a new dated doc.
- If the change is just a short status update, add it to `progress-log.md`.
- If a dated doc stops guiding current work, move it to `../archive/`.

## Notes

- Historical plans live under `../archive/`, including older completed or superseded dated plans
- For current architecture reference, see `../architecture/`

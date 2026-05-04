# Planning Docs

This directory contains active dated plans, current implementation todo items, and progress tracking.

## Why These Docs Keep Dates

Planning docs intentionally keep dates in their filenames.

- The date preserves the planning context for that iteration.
- A dated doc is not automatically obsolete just because it is older.
- If a dated doc is still guiding current work, it should remain in `plans/`.
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
- `progress.md`
  Use for rolling chronological change notes.
  Do not create a new dated plan when a short progress entry is enough.

## When To Update Vs Create

- If the change is just a short status update, add it to `progress.md`.
- If a dated doc stops guiding current work, move it to `../archive/plans/`.
- Don't edit docs/plans/README.md

## Notes

- Historical plans live under `../archive/plans/`, including older completed or superseded dated plans
- Completed one-off TODO/checklist docs should move to `../archive/plans/` once the implementation log and active plan index are updated
- For current architecture reference, see `../architecture/`

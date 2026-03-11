# StrategyDefinitionVersion Evaluation

**Date:** 2026-03-11
**Decision:** Keep `StrategyDefinitionVersion` for now

## Summary

The snapshot mechanism is now stable enough that `MarketMakingOrder.strategySnapshot` is the runtime source of truth, but `StrategyDefinitionVersion` still has active product and admin responsibilities. Removing it now would create avoidable regressions without reducing meaningful runtime complexity.

## Current Dependencies

1. Admin publish flow persists immutable definition snapshots in `server/src/modules/admin/strategy/adminStrategy.service.ts`
2. Version history endpoint still returns stored versions in `server/src/modules/admin/strategy/adminStrategy.service.ts`
3. Seeder keeps definition history aligned for bootstrapped environments in `server/src/database/seeder/seed.ts`
4. `StrategyInstance.definitionVersion` still binds instances to the published definition version for admin/audit visibility

## Why Not Remove It Now

1. Runtime execution no longer depends on live definition re-resolution, so removing the table does not materially simplify execution hot paths
2. Admin/API behavior would lose version history unless replaced with a new audit model
3. Seeder, migration, and frontend expectations would all need coordinated changes for limited near-term benefit

## Revisit Conditions

Remove `StrategyDefinitionVersion` only after all of the following are true:

1. Admin publish/version-list APIs are retired or replaced by another audit store
2. Frontend no longer depends on definition version history
3. Seeder no longer needs to backfill version snapshots
4. `StrategyInstance.definitionVersion` is either removed or explicitly re-scoped to snapshot metadata only

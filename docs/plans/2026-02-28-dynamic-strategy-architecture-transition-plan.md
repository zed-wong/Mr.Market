# Dynamic Strategy Architecture Transition Plan

## Goals
- Move from hardcoded strategy types to DB-backed strategy definitions.
- Separate strategy configuration from strategy execution (Hummingbot V2 style).
- Manage definitions and instances from admin UI.
- Seed built-in strategy definitions via `defaultStrategyDefinitions` and `seedStrategyDefinitions()`.
- Keep backward compatibility during migration.

## Current State
- Strategy runtime was historically driven by hardcoded `strategyType` branches in `StrategyService`.
- Runtime rows already persisted in `strategy_instances`, but definition catalog/versioning did not exist.
- Seeder previously handled grow/spot metadata only; no strategy catalog seeds.

## Scope (V1)
- Dynamic configuration hot-plug only: DB-driven definitions, validation, instance lifecycle.
- No custom uploaded executable strategy code in V1.
- Executors remain local/whitelisted via `executorType`.

## Architecture Target

### Strategy Definition Layer
- Table: `strategy_definitions`
  - key/name/description/executorType/configSchema/defaultConfig/enabled/visibility/currentVersion
- Table: `strategy_definition_versions`
  - immutable version snapshots per definition publish

### Strategy Instance Layer
- Extend `strategy_instances`:
  - `definitionId` (FK-like linkage)
  - `definitionVersion`
- Keep `strategyType` for compatibility during transition.

### Executor Layer
- Standard executor contract:
  - `validateConfig(config)`
  - `onStart(context)`
  - `onTick(context)`
  - `onStop(context)`
- `StrategyExecutorRegistry` maps `executorType -> executor`.
- Built-ins: `pureMarketMaking`, `arbitrage`, `volume`.

### Validation Layer
- Validate merged config (`defaultConfig + override`) against `configSchema` on validate/start.
- Enforce required/type/min/enum and reject unknown fields where configured.

## API & Admin UI

### Admin APIs
- Definitions:
  - `POST /admin/strategy/definitions`
  - `GET /admin/strategy/definitions`
  - `GET /admin/strategy/definitions/:id`
  - `POST /admin/strategy/definitions/:id/update`
  - `POST /admin/strategy/definitions/:id/enable`
  - `POST /admin/strategy/definitions/:id/disable`
  - `POST /admin/strategy/definitions/:id/publish`
  - `GET /admin/strategy/definitions/:id/versions`
- Instances:
  - `POST /admin/strategy/instances/validate`
  - `POST /admin/strategy/instances/start`
  - `POST /admin/strategy/instances/stop`
  - `GET /admin/strategy/instances`
  - `POST /admin/strategy/instances/backfill-definition-links`

### Admin UI
- `/manage/settings/strategies` supports:
  - definition list and create
  - enable/disable
  - publish version and version history
  - validate/start/stop instance
  - legacy link backfill trigger
- Existing market-making pair management remains unchanged.

## Seeder Plan
- `server/src/database/seeder/defaultSeedValues.ts`
  - add `defaultStrategyDefinitions` for pure MM/arbitrage/volume.
- `server/src/database/seeder/seed.ts`
  - add `seedStrategyDefinitions()` and version snapshot seeding.

## Migration Plan

### Schema Migration
- Run migrations to create/alter:
  - `strategy_definitions`
  - `strategy_definition_versions`
  - `strategy_instances.definitionId`
  - `strategy_instances.definitionVersion`

### Backfill
- Seed definitions and initial version snapshots.
- Backfill legacy instance rows with definition links:
  - `POST /admin/strategy/instances/backfill-definition-links`

### Dual Path
- Keep legacy start/stop behavior compatible while routing new flow through definitions.
- Keep legacy `strategyType` until cutover stability window ends.

### Cutover
- Use definition-based UI/API paths as primary flow.
- After stability, retire legacy type-specific paths and cleanup branches.

## Operations & Verification

### Migration Steps
1. `bun run migration:run`
2. `bun run migration:seed`
3. Call backfill endpoint with admin auth.

### Verification Checklist
- `strategy_definitions` has seeded rows.
- `strategy_definition_versions` has at least one version per definition.
- legacy `strategy_instances` rows have `definitionId` after backfill.
- `/manage/settings/strategies` supports validate/start/stop and version operations.

### Rollback Notes
- Runtime compatibility retained via `strategyType`.
- Dynamic flow can be operationally disabled by reverting callers to legacy endpoints.
- Do not remove legacy fields until all integrations are cut over.

## Testing Plan
- Unit:
  - registry dispatch
  - schema validation
  - compatibility adapters
- Integration/E2E:
  - definition validate/start/stop/list
  - migration/seed/backfill correctness

## Risks & Mitigations
- Strategy key identity drift: keep `strategyKey` semantics stable through V1.
- Invalid dynamic config: enforce validation at validate/start entrypoints.
- Scope creep from code hot-plug: keep executor implementations local in V1.

## Future (Post-V1)
- Optional strategy market import/export of signed definition packages.
- Full JSON Schema validator, feature flags, and finer-grained RBAC/audit logs.

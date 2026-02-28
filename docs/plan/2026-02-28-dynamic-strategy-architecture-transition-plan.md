# Dynamic Strategy Architecture Transition Plan

## Goals
- Move from hardcoded strategy types to DB-driven strategy definitions.
- Separate strategy configuration from execution (Hummingbot V2 style).
- Manage strategy definitions and instances from admin UI.
- Seed strategy definitions just like market-making pairs in seeder.
- Keep backward compatibility during migration.

## Current State (from codebase)
- Strategy execution type branching is hardcoded in `server/src/modules/market-making/strategy/strategy.service.ts`.
- Strategy config shapes are static DTOs in `server/src/modules/market-making/strategy/strategy.dto.ts`.
- Admin start/stop flow is hardcoded for three types in:
  - `server/src/modules/admin/strategy/admin-strategy.dto.ts`
  - `server/src/modules/admin/strategy/adminStrategy.service.ts`
- Runtime instances are persisted in `strategy_instances` (`server/src/common/entities/market-making/strategy-instances.entity.ts`) but there is no strategy definition catalog.
- Seeder currently seeds grow data and market-making pairs, not strategy definitions:
  - `server/src/database/seeder/seed.ts`
  - `server/src/database/seeder/defaultSeedValues.ts`

## Scope for V1
- Implement configuration hot-plug (DB-driven definitions + dynamic instance config).
- Do not implement code upload/download strategy marketplace yet.
- Keep executor code local and whitelisted by `executorType`.

## Architecture Target

### 1) Strategy Definition Layer (new)
Add table: `strategy_definitions`
- `id` (uuid)
- `key` (unique, e.g. `pure-market-making`)
- `name`
- `description`
- `executorType` (maps to local executor implementation)
- `configSchema` (JSON Schema)
- `defaultConfig` (JSON)
- `enabled` (bool)
- `visibility` (`system` | `private` | `public` future)
- `createdBy` (nullable)
- `createdAt`, `updatedAt`

Optional table: `strategy_definition_versions`
- immutable version history for schema/default changes.

### 2) Instance Layer (extend existing)
Extend `strategy_instances` with:
- `definitionId` (FK strategy_definitions.id)
- `definitionVersion` (optional)
- keep `parameters` as actual instance config
- keep legacy `strategyType` temporarily for compatibility

### 3) Executor Layer
Define a common interface:
- `validateConfig(config)`
- `onStart(context)`
- `onTick(context)`
- `onStop(context)`

Add `StrategyExecutorRegistry`:
- maps `executorType -> executor class`
- register built-ins: arbitrage, pure market making, volume
- remove hardcoded branching from `StrategyService` and dispatch via registry

### 4) Validation Layer
- Validate instance config against `configSchema` at create/start.
- Add domain preflight checks (exchange exists, pair exists, numeric bounds).
- Return field-level validation errors for admin UI.

## API Plan

### Admin Strategy Definition APIs (new)
- `POST /admin/strategy/definitions`
- `GET /admin/strategy/definitions`
- `GET /admin/strategy/definitions/:id`
- `POST /admin/strategy/definitions/:id/update`
- `POST /admin/strategy/definitions/:id/enable`
- `POST /admin/strategy/definitions/:id/disable`

### Strategy Instance APIs (new/refactor)
- `POST /admin/strategy/instances/start` (definitionId + config + user/client)
- `POST /admin/strategy/instances/stop`
- `GET /admin/strategy/instances/running`
- `GET /admin/strategy/instances/all`

### Backward Compatibility
- Keep existing endpoints and translate payload to definition-based flow internally.
- Deprecate old type-specific endpoints after migration window.

## Admin UI Plan

### New page: Manage Strategies
- Strategy catalog table:
  - name, key, executorType, version, enabled
- Strategy editor:
  - metadata + schema/default config
- Strategy launcher:
  - form rendered from `configSchema`
  - start/stop instance actions
- Instance monitor:
  - running status, last error, recent events/intents

### Keep Existing
- Existing market-making pair management stays unchanged and independent.

## Seeder Plan
In `server/src/database/seeder/defaultSeedValues.ts`:
- add `defaultStrategyDefinitions` with built-in templates:
  - `pure-market-making`
  - `arbitrage`
  - `volume`

In `server/src/database/seeder/seed.ts`:
- add `seedStrategyDefinitions()` with idempotent upsert semantics.
- run it during standard seed pipeline.

## Migration Plan

### Step 1: Schema Migration
- create `strategy_definitions` (+ versions optional)
- alter `strategy_instances` with `definitionId` (+ version)

### Step 2: Backfill
- insert built-in definitions
- map existing instances:
  - `arbitrage` -> corresponding definition
  - `pureMarketMaking` -> corresponding definition
  - `volume` -> corresponding definition
- preserve existing `parameters`

### Step 3: Dual Path
- old endpoints continue to work
- new endpoints use definitions directly
- verify parity in behavior

### Step 4: Cutover
- switch admin UI to new endpoints
- deprecate/remove legacy branching once stable

## Testing Plan
- Unit:
  - executor registry dispatch
  - schema validation pass/fail
  - backward-compat adapter logic
- Integration:
  - start/stop instance from definition
  - intent generation and execution unchanged for existing strategies
- Migration:
  - backfill correctness for legacy rows
  - rollback safety

## Risks & Mitigations
- Risk: key/identity mismatch with existing `strategyKey`-based flows
  - Mitigation: keep `strategyKey` semantics stable during V1.
- Risk: invalid dynamic configs cause runtime failures
  - Mitigation: strict JSON schema + preflight validation.
- Risk: mixing config hot-plug with code hot-plug increases scope
  - Mitigation: V1 only supports whitelisted local executors.

## Future: Strategy Market (Not in V1)
- Add import/export for definitions (metadata + schema + default config)
- Add signature/hash verification and compatibility metadata
- Keep execution code local; imported packages should not execute arbitrary code

## Execution Order
1. DB schema + migration + seed definitions
2. Executor interface + registry refactor (no behavior change)
3. New definition/instance services + admin APIs
4. Backward compatibility adapters for existing APIs
5. Admin manage strategies UI
6. Migration rollout + cleanup

# Strategy Addition And Admin Direct Simplification Plan

**Goal:** Reduce the number of code changes required to add a new strategy, and remove the extra hand-wiring currently needed before a new strategy can run through admin direct market making.

**Status:** Phase 1 and Phase 2 mostly complete. Phase 3 (Task 7) remaining.

**Date:** 2026-04-18

---

## Problem Summary

Adding a new strategy is still expensive because the codebase only made strategy definition data dynamic, not the full launch and runtime registration path.

Today, a new strategy can require changes across:

1. backend strategy type unions
2. backend controller registration
3. backend runtime dispatcher branches
4. seeded strategy definition files
5. admin settings controller pickers and labels
6. admin direct controller-type unions and helpers
7. admin direct create-order UI branches
8. admin direct config-override mapping
9. admin direct status and details rendering

The result is that `StrategyDefinition.configSchema` exists, but admin direct still behaves like a per-controller custom UI instead of a schema-driven launcher.

---

## Root Cause

### Root cause 1: strategy definitions are dynamic, but strategy runtime registration is static

The system stores `configSchema`, `defaultConfig`, `launchSurfaces`, and `directExecutionMode` in `StrategyDefinition`, but runtime dispatch still requires hardcoded edits for every new controller type.

Current static registration points include:

- `server/src/modules/market-making/strategy/config/strategy-controller.types.ts`
- `server/src/modules/market-making/strategy/strategy.module.ts`
- `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts`

### Root cause 2: admin direct is optimized for a few known strategies, not generalized

Admin direct currently contains specialized logic for:

- `pureMarketMaking`
- `dualAccountVolume`
- `dualAccountBestCapacityVolume`

That logic is spread across:

- direct form rendering
- direct validation rules
- direct config field mapping
- direct details/status typing and display

A new direct-compatible strategy therefore needs UI and mapping work before it can launch, even when its schema is already defined.

### Root cause 3: direct-order backend metadata still assumes a narrow controller set

Some backend admin direct helpers still narrow controller handling to a small fixed set. That makes unknown strategies fall into legacy behavior instead of behaving as generic direct orders with strategy-specific config.

### Root cause 4: frontend keeps duplicated strategy template knowledge

The frontend admin settings area has its own controller list, labels, and schema templates, separate from backend seeds and runtime capabilities.

That means a new strategy schema is often described twice:

- once in backend seed JSON
- again in frontend config templates and labels

---

## Progress

### 2026-04-18 Implementation

- **Task 1: DONE** — Replaced `isDualAccountControllerType()` with data-driven `isDualAccountMode()` that detects dual-account by config data (maker/taker labels) instead of hardcoded controller type unions. Added `directExecutionMode` to `DirectOrderSummary` and `DirectOrderStatus` API responses. Backend `readControllerType()` now also checks `resolvedConfig.controllerType` as fallback.
- **Task 2: DONE** (pre-existing) — Schema-driven fallback form exists in `CreateOrderModal` via `SchemaConfigForm`.
- **Task 3: DONE** (pre-existing) — `buildGenericSchemaConfigOverrides()` handles generic config submission.
- **Task 4: DONE** — Added generic config key-value rendering in `OrderDetailsDialog` for unknown strategy types. Added `isKnownDirectStrategyControllerType` to distinguish known strategies from schema-driven ones. Account routing uses `isDualAccountOrder()` with capability awareness.
- **Task 5: DONE** — Added `start()` method to `StrategyController` interface and all 6 implementations. Simplified `StrategyRuntimeDispatcherService.startByStrategyType()` to delegate through registry. Removed 140+ lines of if-chain dispatch logic and dead helper methods.
- **Task 6: DONE** — Backend strategy definition capabilities (`directOrderCompatible`, `directExecutionMode`, `launchSurfaces`) are exposed through API responses. Frontend direct page uses `directExecutionMode` for dual-account routing. `isDualAccountOrder()` capability checks are propagated through `CreateOrderModal` and `OrderDetailsDialog`.
- **Task 7: REMAINING** — `CONFIG_SCHEMA_TEMPLATES` (394 lines) in frontend still duplicates backend seed data. Not blocking: new strategies work through schema-driven fallback without touching template map. Requires either an API endpoint for seed definitions or build-time template generation.

---

For a new direct-compatible strategy, the effective current flow is:

1. implement strategy logic and controller
2. add new `StrategyType` union member
3. register the controller in `StrategyModule`
4. extend runtime dispatcher mapping and start logic
5. add backend seed definition and default config
6. add frontend strategy-settings controller picker entry
7. add frontend labels and controller display helpers
8. add admin direct type/helper support
9. add admin direct form branches
10. add admin direct override mapping branches
11. add admin direct details/status branches
12. then finally test whether the strategy can actually launch

This is too much surface area for what should mostly be a schema + controller addition.

---

## Target Add-Strategy Flow

The target flow should be:

1. implement strategy logic and runtime controller
2. define the strategy schema, defaults, and launch capabilities once
3. if no custom UX is needed, launch immediately through generic admin direct schema-driven UI
4. optionally add a specialized UI later only if the generic launcher is not good enough

That turns direct-launch support from mandatory hand-wiring into optional UX optimization.

---

## Scope

### In scope

- reduce add-new-strategy edits required for admin direct launch
- add a schema-driven admin direct fallback for new strategies
- remove controller-type assumptions from direct order metadata and status handling
- reduce duplicated controller registration points on the backend
- reduce duplicated strategy template/schema knowledge on the frontend
- document the new minimal add-strategy workflow

### Not in scope

- redesigning strategy behavior itself
- removing the existing optimized UI for current direct-launch strategies
- changing strategy execution semantics for existing controllers
- broad refactors outside strategy registration and admin direct launch paths

---

## Desired End State

### 1. Admin direct must support generic schema-driven launch

If a strategy definition is marked as direct-launch compatible, admin direct should be able to render and submit it even if there is no strategy-specific UI branch yet.

### 2. Specialized UI becomes optional, not mandatory

The current optimized direct forms for PMM and dual-account volume strategies should stay, but they should be treated as enhancements layered on top of a generic fallback.

### 3. Backend controller registration should have one obvious source of truth

A new strategy controller should not require separate edits to:

- a strategy type union
- a dispatcher if-chain
- a module array
- multiple frontend controller allowlists

### 4. Strategy schema should be defined once

The system should stop maintaining frontend-only copies of backend strategy schema wherever possible.

---

## Implementation Plan

### Phase 1: Make Admin Direct Generic Enough To Launch New Strategies

### Task 1: Generalize direct-order controller metadata

Update admin direct runtime metadata so unknown controller types are not coerced into `pureMarketMaking`, and dual-account behavior is inferred from stored execution data or capabilities rather than fixed unions only.

**Files likely touched:**

- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- `interface/src/lib/types/hufi/admin-direct-market-making.ts`
- `interface/src/lib/components/market-making/direct/OrderDetailsDialog.svelte`

**Expected result:**

- new strategies can at least list, inspect, resume, and duplicate without being misclassified

### Task 2: Add a schema-driven fallback form in admin direct

Keep the current hand-optimized direct form for existing strategies, but add a generic form path driven by `StrategyDefinition.configSchema` and `defaultConfig`.

That fallback must:

- hide runtime-owned fields injected by the server
- respect required fields and basic field types
- reuse existing generic schema form components where possible

**Files likely touched:**

- `interface/src/lib/components/market-making/direct/CreateOrderModal.svelte`
- `interface/src/lib/components/admin/settings/strategies/SchemaConfigForm.svelte`
- `interface/src/lib/helpers/market-making/direct/helpers.ts`

**Expected result:**

- a newly added direct-compatible strategy can launch without first adding a custom create-order branch

### Task 3: Make admin direct payload building schema-first

Preserve the current quick-field mapping for the existing optimized strategies, but allow new strategies to submit sanitized generic config overrides directly from schema-rendered fields.

The generic path should:

- strip runtime-owned fields
- submit only user-configurable values
- avoid requiring controller-specific override mappers

**Files likely touched:**

- `interface/src/routes/(bottomNav)/(admin)/manage/market-making/direct/+page.svelte`
- `interface/src/lib/helpers/market-making/direct/helpers.ts`

**Expected result:**

- new strategies no longer need `normalizeConfigOverrides()` edits before they can launch

### Task 4: Remove controller-type assumptions from direct status/details

Make direct order details and summary views tolerant of unknown strategy controller types.

The UI should still show generic config, runtime state, and account routing even when there is no strategy-specific card layout.

**Files likely touched:**

- `interface/src/lib/components/market-making/direct/OrderDetailsDialog.svelte`
- `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- `interface/src/lib/types/hufi/admin-direct-market-making.ts`

**Expected result:**

- generic strategies remain operable after launch, not only launchable

---

### Phase 2: Reduce Backend Registration Friction

### Task 5: Collapse backend strategy registration to one registry contract

Refactor runtime dispatch so controller registration, type mapping, cadence lookup, rerun handling, and start behavior are sourced from one registry contract rather than a mix of:

- union types
- module arrays
- dispatcher `if` chains

The preferred shape is:

- controller or controller metadata declares its strategy key/type
- registry discovers registered controllers
- dispatcher delegates through registry instead of hardcoded branching

**Files likely touched:**

- `server/src/modules/market-making/strategy/config/strategy-controller.types.ts`
- `server/src/modules/market-making/strategy/controllers/strategy-controller.registry.ts`
- `server/src/modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts`
- `server/src/modules/market-making/strategy/strategy.module.ts`

**Expected result:**

- adding a new controller requires materially fewer backend edits

### Task 6: Normalize controller capability metadata as the public contract

Treat capability metadata such as:

- `launchSurfaces`
- `directExecutionMode`
- future launch hints

as the shared contract for frontend and admin direct routing, instead of inferring too much from controller name patterns.

**Files likely touched:**

- `server/src/modules/admin/strategy/strategy-definition-capabilities.ts`
- direct strategy list endpoints and consuming frontend code

**Expected result:**

- launch behavior is controlled by explicit metadata, not controller-name branching

---

### Phase 3: Remove Frontend Template Duplication

### Task 7: Stop maintaining duplicate frontend strategy templates

The admin settings frontend currently has a separate `CONFIG_SCHEMA_TEMPLATES` map and separate controller picker knowledge. Reduce this duplication by sourcing builtin definitions from backend schema/default sources wherever practical.

Possible acceptable implementations:

1. expose builtin strategy templates from the backend and consume them in frontend settings
2. generate frontend templates from backend seed/schema source
3. centralize controller metadata into one shared source consumed by both settings and direct launch

**Files likely touched:**

- `interface/src/lib/helpers/admin/settings/strategies/configTemplates.ts`
- `interface/src/lib/components/admin/settings/strategies/CreateDefinitionModal.svelte`
- backend seed definition sources under `server/src/database/seeder/`

**Expected result:**

- a new strategy schema is defined once, not once per layer

---

## Validation Plan

### Focused behavior validation

For a newly added direct-compatible strategy that does not have custom frontend support:

1. create or seed the strategy definition
2. confirm it appears in admin direct strategy list
3. open the generic direct-launch form
4. submit valid config
5. confirm the order starts
6. confirm the order appears in direct order list
7. confirm status/details load
8. confirm stop and resume still work
9. confirm duplicate/prefill still works at least through the generic path

### Regression validation

Existing optimized direct-launch strategies must still preserve their current UX:

- `pureMarketMaking`
- `dualAccountVolume`
- `dualAccountBestCapacityVolume`

Regression checks:

- PMM quick fields still map correctly
- dual-account quick fields still map correctly
- best-capacity quick fields still map correctly
- direct status/details still show existing specialized information

### Tests

Add focused tests for:

- generic direct schema filtering of runtime-owned fields
- generic direct config override normalization
- direct-order controller metadata handling for unknown controller types
- existing direct quick-field mapper regressions
- backend registry-based dispatch if Phase 2 lands

---

## Success Criteria

This plan is successful when all of the following are true:

1. a new strategy can be added without touching `CreateOrderModal` or direct override mapper logic
2. admin direct can launch any direct-compatible strategy using schema-driven fallback UI
3. direct order list and details work for new strategies without hardcoded controller unions
4. backend runtime registration no longer requires multiple unrelated edits for each new controller
5. strategy schema/default metadata is no longer duplicated across backend seeds and frontend template maps

---

## Minimal Future Workflow

After this plan lands, the expected future workflow for adding a new direct-compatible strategy should be:

1. implement strategy runtime/controller
2. register it through the unified backend registry path
3. define `configSchema`, `defaultConfig`, `launchSurfaces`, and `directExecutionMode`
4. verify it launches through generic admin direct UI
5. optionally add a custom optimized UI later if product value justifies it

That is the bar this refactor should aim to meet.

# API Key Identity Migration Plan

## Summary
Hard-cut the admin API key identity model to:
- `name` = operator-facing display label only
- `key_id` = canonical identifier for selection, execution, and runtime routing
- runtime `accountLabel` = `key_id`

This is an MVP cutover, not a compatibility rollout. Old frontend bundles, old direct-MM orders, old persisted strategy state, and old API key rows are not supported after the cutover. The deployment assumption is that the current database can be wiped and re-seeded from zero.

## Goals
- Remove `exchange_index` from schema, DTOs, frontend types, and runtime logic
- Make backend derive execution identity from `apiKeyId` / `key_id`, not client-provided labels
- Make the frontend send only API key IDs for direct MM account selection
- Keep the implementation simple by avoiding temporary compatibility branches
- Reboot the system from a clean DB + seed state after the code cutover

## Non-goals
- Supporting old frontend payloads after the cutover
- Preserving existing direct MM orders, strategy instances, tracked orders, or strategy intents
- Preserving existing `api_keys_config` rows
- Renaming every internal `accountLabel` symbol across the strategy subsystem

## Cutover assumptions
- A maintenance window is acceptable
- The current database can be deleted before release validation
- Operators will hard refresh the admin UI after deployment
- Existing API keys will be re-added manually after the reset
- Existing direct MM runtime state will be discarded rather than migrated

## Architecture decisions
### Identity model
- `key_id`: canonical identity for persistence, selection, execution, and runtime routing
- `name`: display-only label for operators
- `accountLabel`: opaque internal runtime account key whose value is always `key_id` for admin-owned API keys

### Runtime model
- Backend derives `accountLabel` from `apiKeyId` server-side
- Frontend does not send `accountLabel`, `makerAccountLabel`, or `takerAccountLabel` for admin direct MM start requests
- Duplicate-account checks use `key_id`
- Display logic uses `name`, optionally with `key_id` as secondary disambiguation

### Default-label rule
- Keep generic `'default'` fallback behavior only where the broader strategy subsystem still needs it for non-admin or sandbox paths
- Do not use `exchange_index`, display aliases, or human-readable names as the runtime identity for admin API keys

## Deployment strategy
### Phase 1: code cutover
- Update backend and frontend in the same release branch
- Remove old payload expectations from direct MM and add-key flows
- Switch runtime account registration and lookup to `key_id`
- Remove `exchange_index` from active schema, types, tests, and UI logic

### Phase 2: operational reset
- Stop direct MM / strategy runtime workers
- Delete the existing database
- Re-run migrations from zero
- Re-run seeders
- Re-add admin API keys through the new UI/API

### Phase 3: post-reset validation
- Validate only newly created API keys, newly created direct MM orders, and newly created runtime state
- Do not attempt to resume or inspect old orders because they are intentionally discarded

## Runtime state to discard at cutover
Because this is a hard cutover, all old persisted runtime/account state is disposable:
- `api_keys_config`
- admin direct market-making orders
- `strategy_instances`
- `tracked_order`
- `strategy_order_intent`
- any derived runtime/session state in memory

After deployment, only orders and strategy state created by the new code are expected to work.

## File-by-file implementation checklist

### Server schema and contracts
#### `server/src/common/entities/admin/api-keys.entity.ts`
- Remove `exchange_index`
- Update comments so:
  - `name` = display label
  - `key_id` = canonical identity

#### `server/src/modules/admin/exchanges/exchanges.dto.ts`
- Remove `exchange_index` from `AddAPIKeyDto`
- Keep `name` required and trimmed
- Update Swagger descriptions to reflect display-vs-identity semantics

#### `server/src/database/migrations/<new migration>.ts`
- Add a forward migration that removes `exchange_index` from `api_keys_config`
- Preserve `key_id`, `exchange`, `name`, `api_key`, `api_secret`, `permissions`, and `created_at`
- Because the DB is being reset, no data backfill is required for current production rows

### Server API key services
#### `server/src/modules/market-making/exchange-api-key/exchange-api-key.service.ts`
- Stop requiring or populating `exchange_index`
- Validate `name` directly
- Build runtime exchange account configs with `label = key.key_id`
- Update account signature/hash logic to stop including `exchange_index`
- Audit remaining read/load paths for hidden alias assumptions

#### `server/src/modules/market-making/exchange-api-key/exchange-api-key.service.spec.ts`
- Remove `exchange_index` fixtures and fallback assertions
- Add tests asserting:
  - add key does not accept or require `exchange_index`
  - runtime account label derives from `key_id`
  - duplicate `name` values do not break execution identity

### Exchange init/runtime wiring
#### `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts`
- Replace `key.exchange_index` with `key.key_id` in runtime account configs
- Update signature/hash logic to use `key_id`
- Ensure readiness/listener behavior continues to treat labels as opaque strings

#### `server/src/modules/infrastructure/exchange-init/exchange-init.service.spec.ts`
- Remove `exchange_index` fixtures
- Assert registered account labels are `key_id`

### Admin direct market making backend
#### `server/src/modules/admin/market-making/admin-direct-mm.dto.ts`
- Remove `accountLabel`, `makerAccountLabel`, and `takerAccountLabel` from the start DTO
- Keep `apiKeyId`, `makerApiKeyId`, and `takerApiKeyId`

#### `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- Resolve execution accounts from API key IDs only
- Derive runtime `accountLabel` from `apiKey.key_id`
- Remove request-time label matching logic
- Remove any dependency on `exchange_index` or `resolvedConfig.exchange_index`
- Ensure list/status payloads expose display-friendly labels separately from runtime labels if needed

#### `server/src/modules/admin/market-making/admin-direct-mm.service.spec.ts`
- Replace fixture `exchange_index` values with `key_id` expectations
- Add regression tests for:
  - dual-account distinctness based on `key_id`
  - same `name`, different `key_id` still works
  - exchange mismatch still fails correctly

### Strategy/runtime contracts
#### `server/src/modules/market-making/strategy/config/strategy.dto.ts`
- Keep `accountLabel` fields only as internal runtime labels carrying `key_id`
- Update docs/comments/examples so labels are treated as opaque runtime IDs, not aliases

#### `server/src/modules/market-making/strategy/strategy.service.ts`
- Ensure account label resolution works when labels are `key_id`
- Remove assumptions that labels are human-readable
- Audit `'default'` fallback behavior so admin API key flows do not accidentally route to a non-`key_id` label

#### Related tracker/execution files
- `server/src/modules/market-making/trackers/private-stream-tracker.service.ts`
- `server/src/modules/market-making/trackers/private-stream-ingestion.service.ts`
- `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`
- `server/src/modules/market-making/strategy/execution/exchange-pair-executor.ts`

Checklist:
- confirm `accountLabel` is treated as opaque string
- remove any implicit alias semantics
- keep behavior stable when label becomes `key_id`

### Frontend types and helper payloads
#### `interface/src/lib/types/hufi/admin.ts`
- Remove `exchange_index` from `AdminSingleKey`

#### `interface/src/lib/types/hufi/admin-direct-market-making.ts`
- Remove `accountLabel`, `makerAccountLabel`, and `takerAccountLabel` from direct-start payload types
- Keep direct-order summary/status types aligned with the backend response contract

#### Frontend helper files under `interface/src/lib/helpers/mrm/admin/`
- Remove `exchange_index` from add-key payloads
- Remove client-sent runtime label fields from direct-start payloads
- Keep only `apiKeyId`, `makerApiKeyId`, and `takerApiKeyId`

### Frontend API key management UI
#### `interface/src/lib/components/admin/exchanges/addAPIKey.svelte`
- Stop constructing/sending `exchange_index`
- Submit only `exchange`, `name`, `api_key`, `api_secret`, and `permissions`

#### `interface/src/routes/(bottomNav)/(admin)/manage/settings/api-keys/+page.svelte`
- Remove search/filter dependency on `exchange_index`
- Search over `name`, `exchange`, `key_id`, and `api_key`

#### API key list components
Likely files:
- `interface/src/lib/components/admin/exchanges/keyList.svelte`
- related row/detail components

Checklist:
- remove `exchange_index` display
- show `name` as primary label
- show `key_id` as a secondary technical identifier where disambiguation is useful

### Frontend direct market making UI
#### `interface/src/lib/components/market-making/direct/CreateOrderModal.svelte`
- Replace `{apiKey.name} ({apiKey.exchange_index})` with `apiKey.name` or `apiKey.name ({apiKey.key_id})`

#### `interface/src/routes/(bottomNav)/(admin)/manage/market-making/direct/+page.svelte`
- Compare selected accounts by `key_id`, not `exchange_index`
- Send only API key IDs
- Do not send runtime label fields

#### `interface/src/lib/components/market-making/direct/api-key-filter.test.ts`
- Remove `exchange_index` fixtures
- Keep tests focused on permissions, exchange, and key selection behavior

### System/integration tests
#### `server/test/system/market-making/user-orders/admin-direct-market-making.sandbox.system.spec.ts`
- Replace `exchange_index` expectations with `key_id`-backed runtime labels
- Verify end-to-end direct MM execution resolves the correct account from ID only

## Recommended implementation order
1. Remove `exchange_index` from frontend payloads and UI usage
2. Remove `exchange_index` from backend DTOs and runtime account derivation
3. Switch exchange-init and direct MM runtime identity to `key_id`
4. Update tests and fixtures to `key_id`-based labels
5. Add and run the schema-removal migration
6. Stop runtime services and delete the existing DB
7. Re-run migrations and seeders from zero
8. Re-add API keys and validate new direct MM flows

## Operational cutover checklist
- Announce a maintenance window
- Stop strategy/direct-MM workers and API traffic
- Deploy backend and frontend together
- Delete the existing DB
- Run migrations from zero
- Run seeders
- Hard refresh the admin UI
- Recreate admin API keys
- Validate only newly created orders

## Validation checklist
### After code cutover
- Add API key works without sending `exchange_index`
- API key list/search works without reading `exchange_index`
- direct MM single-account start payload contains only `apiKeyId`
- direct MM dual-account start payload contains only `makerApiKeyId` and `takerApiKeyId`
- duplicate-account prevention uses `key_id`

### After DB reset
- exchange-init registers admin API key runtime labels as `key_id`
- newly created single-account direct MM orders run successfully
- newly created dual-account direct MM orders run successfully
- service restart can restore only post-cutover orders correctly
- old orders are absent by design

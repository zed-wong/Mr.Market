# Server Design Logic Map

This doc tree explains backend design in simple business terms.

## Scope

- Root module wiring in `server/src/app.module.ts`.
- All backend modules under `server/src/modules`.
- Core entities under `server/src/common/entities`.
- Runtime flows for strategy execution, payment intake, ledger, and withdrawal orchestration.

## How to use this tree

1. Start with `module-map.md` to see dependency direction and business purpose.
2. Read `business-flows.md` to follow real runtime paths.
3. Read `entity-ownership.md` to find data ownership and cross-module usage.

## Design principles in current code

- Domain modules keep feature boundaries clear.
- Queue workers and schedulers run long-lived flows.
- Durable intent and ledger records protect side effects.
- Strategy runtime is split into controller, intent, execution, and worker stages.
- Admin-owned exchange runtime identity is the `api_keys_config.key_id`; frontend payloads do not provide execution account labels.

## Test structure

- `server/src/**/*.spec.ts` holds unit and module-level tests close to the code they verify.
- `server/test/system/**` holds system-level checks that exercise app contracts, migrations, seeds, and infrastructure flows.
- `server/test/helpers/**` holds shared helpers for non-unit backend suites.
- `server/test/config/**` holds dedicated Jest entry points and shared test environment setup.

## Seeder backup data

- `server/src/database/seeder/data/exchange-icon-backup.ts` stores backup-only exchange `exchange_id` + display `name` + `icon_url` mappings.
- This dataset is intentionally not connected to active seed execution and is reserved for future fallback use.

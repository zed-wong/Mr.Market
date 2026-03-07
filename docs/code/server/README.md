# Server Design Logic Map

This doc tree explains backend design in simple business terms.

## Scope

- Root module wiring in `server/src/app.module.ts`.
- All backend modules under `server/src/modules`.
- Core entities under `server/src/common/entities`.
- Runtime flows for strategy execution, payment intake, ledger, and withdrawal orchestration.

## How to use this tree

1. Start with `module-map.md` to see dependency direction.
2. Read `module-purpose.md` to understand each module contract.
3. Read `business-flows.md` to follow real runtime paths.
4. Read `entity-ownership.md` to find data ownership and cross-module usage.

## Design principles in current code

- Domain modules keep feature boundaries clear.
- Queue workers and schedulers run long-lived flows.
- Durable intent and ledger records protect side effects.
- Strategy runtime is split into controller, intent, execution, and worker stages.

# Strategy Dynamic Migration Guide

This guide documents how to transition existing environments from hardcoded strategy types to dynamic strategy definitions.

## What changed

- Strategy definitions are now stored in DB (`strategy_definitions`).
- Definition version history is tracked in `strategy_definition_versions`.
- Strategy runtime instances can reference definitions via:
  - `strategy_instances.definitionId`
  - `strategy_instances.definitionVersion`
- Admin APIs support dynamic instance lifecycle and definition management.

## Migration steps

1. Run DB migrations

```bash
bun run migration:run
```

2. Seed default strategy definitions and version snapshots

```bash
bun run migration:seed
```

3. Backfill legacy strategy instances to definition links

Use admin API:

```bash
POST /admin/strategy/instances/backfill-definition-links
Authorization: Bearer <admin-token>
```

Response:

```json
{
  "updated": 12,
  "skipped": 3
}
```

## Verification checklist

- `strategy_definitions` table has seeded rows.
- `strategy_definition_versions` has at least one row per definition.
- Legacy rows in `strategy_instances` have `definitionId` populated after backfill.
- Admin UI page `/manage/settings/strategies` can:
  - list definitions and versions,
  - validate/start/stop instances,
  - run backfill successfully.

## Rollback notes

- Runtime still keeps `strategyType` for compatibility.
- Dynamic flow can be disabled operationally by reverting UI calls to legacy start/stop endpoints.
- Do not drop legacy columns until all integrations are fully cut over.

## Future hardening

- Move from custom schema checks to full JSON Schema validator library.
- Add explicit feature flags for dynamic strategy APIs.
- Add per-definition role-based permissions and audit logs.

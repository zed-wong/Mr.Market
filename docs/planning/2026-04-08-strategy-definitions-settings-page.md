# Strategy Definitions Settings Page

## Goal
Build out the `/manage/settings/strategies` page following the same design language as `/manage/market-making/direct` — skeleton loading, summary panels (2-col grid), a full-width table, and modal-driven CRUD actions.

---

## Backend Capabilities (already implemented)

All API helpers exist in `interface/src/lib/helpers/mrm/admin/strategy.ts`:

| Action | Endpoint | Method |
|--------|----------|--------|
| List definitions | `/admin/strategy/definitions` | GET |
| Create definition | `/admin/strategy/definitions` | POST |
| Get definition | `/admin/strategy/definitions/:id` | GET |
| Update definition | `/admin/strategy/definitions/:id/update` | POST |
| Enable definition | `/admin/strategy/definitions/:id/enable` | POST |
| Disable definition | `/admin/strategy/definitions/:id/disable` | POST |
| Remove definition | `/admin/strategy/definitions/:id/remove` | DELETE |
| List instances | `/admin/strategy/instances?runningOnly=` | GET |
| Validate instance config | `/admin/strategy/instances/validate` | POST |
| Start instance | `/admin/strategy/instances/start` | POST |
| Stop instance | `/admin/strategy/instances/stop` | POST |

**No backend changes required.**

---

## Page Layout (mirrors `/manage/market-making/direct`)

```
┌──────────────────────────────────────────────────────────┐
│  Skeleton loading (3 skeleton blocks while pageLoading)  │
├──────────────────────────────────────────────────────────┤
│  2-col grid: summary panels                              │
│  ┌──────────────────────┐  ┌──────────────────────────┐  │
│  │  DefinitionsPanel    │  │  InstancesSummaryPanel    │  │
│  │  - Total count       │  │  - Running count          │  │
│  │  - Enabled count     │  │  - Stopped count          │  │
│  │  - By controller     │  │  - Total count            │  │
│  │    type breakdown    │  │  - Latest activity        │  │
│  └──────────────────────┘  └──────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│  DefinitionsTable (full-width card, same style as        │
│  OrdersTable)                                            │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Header: "Strategy Definitions" + subtitle            ││
│  │ Actions: [+ New Definition] [↻ Refresh]              ││
│  │                                                      ││
│  │ Table columns:                                       ││
│  │  Name | Key | Controller Type | Visibility |         ││
│  │  Enabled | Created | Actions                         ││
│  │                                                      ││
│  │ Row actions:                                         ││
│  │  - Toggle enabled (inline switch)                    ││
│  │  - Edit (opens EditDefinitionModal)                  ││
│  │  - Remove (opens RemoveConfirmModal)                 ││
│  │  - Row click → DefinitionDetailsModal                ││
│  └──────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────┤
│  InstancesTable (full-width card below, collapsible)     │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Header: "Strategy Instances" + subtitle              ││
│  │ Filter: [All / Running only]                         ││
│  │                                                      ││
│  │ Table columns:                                       ││
│  │  Strategy Key | Definition Name | Type | Status |    ││
│  │  User | Created | Actions                            ││
│  │                                                      ││
│  │ Row actions:                                         ││
│  │  - Stop (if running)                                 ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

---

## File Structure

### Page files (already exist, need updating)
| File | Change |
|------|--------|
| `interface/src/routes/(bottomNav)/(admin)/manage/settings/strategies/+page.ts` | Already loads `definitions` and `instances` — no change |
| `interface/src/routes/(bottomNav)/(admin)/manage/settings/strategies/+page.svelte` | Replace stub with full page layout, skeleton, panels, tables, modals |

### New components → `interface/src/lib/components/admin/settings/strategies/`
| Component | Purpose |
|-----------|---------|
| `DefinitionsSummaryPanel.svelte` | Summary card: total, enabled, type breakdown |
| `InstancesSummaryPanel.svelte` | Summary card: running, stopped, total counts |
| `DefinitionsTable.svelte` | Full-width table of strategy definitions with inline toggle + row actions |
| `InstancesTable.svelte` | Full-width table of strategy instances with status badges |
| `CreateDefinitionModal.svelte` | Modal form: key, name, description, controllerType (dropdown), configSchema (textarea), defaultConfig (textarea), visibility |
| `EditDefinitionModal.svelte` | Modal form pre-filled with existing definition data |
| `RemoveDefinitionModal.svelte` | Confirm dialog with guard messaging (must disable first, no linked instances) |
| `DefinitionDetailsModal.svelte` | Read-only modal showing full definition detail including JSON config |
| `StopInstanceModal.svelte` | Confirm dialog for stopping a running instance |
| `helpers.ts` | Shared helpers: `formatDate()`, `getControllerTypeLabel()`, `getStatusClasses()`, `getVisibilityLabel()` |

---

## Component Details

### DefinitionsSummaryPanel
- Same card style as `ApiKeysPanel`: `bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50`
- Shows: total definitions count, enabled count, breakdown badges by controllerType (pureMarketMaking, arbitrage, volume)
- Bottom link button: "View all definitions" scrolls to table

### InstancesSummaryPanel
- Same card style as `CampaignsPanel`
- Shows: total instances, running count (green badge), stopped count
- Shows latest instance `updatedAt` as relative time

### DefinitionsTable
- Mirrors `OrdersTable` exactly: same header layout, button styles, table structure
- Columns: Name (bold), Key (monospace), Controller Type (badge like strategy label), Visibility (badge), Enabled (toggle), Created (formatted date), Actions (edit / remove buttons)
- Controller type badges: `pureMarketMaking` → "Market Making", `arbitrage` → "Arbitrage", `volume` → "Volume"
- Enabled toggle: calls `enableStrategyDefinition` / `disableStrategyDefinition` directly with toast feedback
- Empty state: centered message like OrdersTable

### CreateDefinitionModal
- Modal overlay like `CreateOrderModal`
- Fields:
  - `key` — text input, required (e.g. `pure-market-making-v2`)
  - `name` — text input, required
  - `description` — textarea, optional
  - `controllerType` — select dropdown: pureMarketMaking / arbitrage / volume
  - `configSchema` — monospace textarea, JSON, pre-filled with `{}`
  - `defaultConfig` — monospace textarea, JSON, pre-filled with `{}`
  - `visibility` — select: system / public
  - `createdBy` — text input, optional
- Submit calls `createStrategyDefinition()`, refreshes page, closes modal

### EditDefinitionModal
- Same form as Create but pre-filled, without `key` field (immutable)
- Submit calls `updateStrategyDefinition(id, payload)`

### InstancesTable
- Simpler table, read-only focus
- Filter toggle: "All" / "Running only" (re-fetches with `runningOnly` param)
- Columns: Strategy Key, Definition Name (linked), Type (badge), Status (badge with dot for running), User ID (truncated), Created, Actions
- Status badge styles: reuse `getStatusClasses()` from direct MM helpers pattern
- Stop button only shown for running instances

---

## Execution Order

| Step | Scope | Depends on |
|------|-------|------------|
| 1 | Create `helpers.ts` with shared formatters and badge helpers | — |
| 2 | Create `DefinitionsSummaryPanel.svelte` | Step 1 |
| 3 | Create `InstancesSummaryPanel.svelte` | Step 1 |
| 4 | Create `DefinitionsTable.svelte` | Step 1 |
| 5 | Create `CreateDefinitionModal.svelte` | Step 1 |
| 6 | Create `EditDefinitionModal.svelte` | Step 5 (similar form) |
| 7 | Create `RemoveDefinitionModal.svelte` | — |
| 8 | Create `DefinitionDetailsModal.svelte` | — |
| 9 | Create `InstancesTable.svelte` | Step 1 |
| 10 | Create `StopInstanceModal.svelte` | — |
| 11 | Update `+page.svelte` — wire everything together | Steps 2-10 |

Steps 2-3 are independent. Steps 4-10 are independent. Step 11 depends on all.

All changes are frontend-only. No new dependencies, no DB changes, no backend modifications.

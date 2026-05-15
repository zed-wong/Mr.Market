# Admin Interface Sidebar + Pages Redesign Plan

**Goal:** Redesign Admin Interface from a crowded left menu into a collapsible operations console, and make every navigation item land on a useful page.

**Scope:** Frontend admin-interface only. Reuse existing APIs/pages where available. Do not add new backend APIs in this phase.

---

## 1. Design System Boundary

`admin-interface/DESIGN.md` is a stable Google DESIGN.md design-system spec. It should define tokens and reusable visual rules only:

- colors, typography, spacing, radius, elevation;
- table/card/button/navigation visual rules;
- loading / empty / error / retry state rules;
- general guidance that navigation can collapse/expand and must avoid excessive density.

This implementation plan owns the feature-specific decisions. Do not put route matrices or rollout steps into `DESIGN.md`.

---

## 2. Sidebar Model

Replace the always-expanded sidebar with collapsible top-level groups.

Default visible groups:

- Overview
- Execution
- System

Deferred / planned groups:

- Funding
- Scheduling

Behavior:

- First load shows only top-level groups, not all children.
- Clicking a group expands/collapses it.
- Current route auto-expands its parent group.
- Expanded state persists in `localStorage`.
- Mobile behaves like an accordion: opening one group closes the others.
- Deferred groups show a clear `Planned` state instead of looking fully available.

---

## 3. Navigation IA

Target IA:

```text
Overview
- System Status
- Capital Summary
- Pending Actions
- Risk Alerts

Execution
- Strategies
- Runs
- Market Making
- Positions
- Logs

System
- Users
- Roles
- API Keys
- System Config
- Audit Log

Funding  Planned
- Reservations
- Orders
- Deposits
- Withdrawals
- Treasury
- Assets

Scheduling  Planned
- Chain Schedules
- Job Queue
- Retry Center
- Routes
```

Use `Execution`, not `Trading`, because it better matches the admin user's mental model and the yellowpaper execution layer.

---

## 4. Page Strategy

Every sidebar leaf must open a real page surface.

### Real pages now

Reuse existing working pages:

- `Execution / Strategies` ← existing `settings/strategies`
- `Execution / Market Making` ← existing `market-making/direct`
- `System / Users` ← existing `users`
- `System / API Keys` ← existing `settings/api-keys`
- `System / System Config` ← existing settings pages for fees, exchanges, spot pairs, market-making pairs, min balances
- `Overview / System Status` ← existing health/session-level information where available

### Planned pages now

Use a shared `PlannedSurface` component for pages without backend support yet:

- Capital Summary
- Pending Actions
- Risk Alerts
- Runs
- Positions
- Logs if no HTTP logs API exists
- Roles
- Audit Log
- all Funding pages
- all Scheduling pages

`PlannedSurface` must not be empty. It should show:

- page purpose;
- related architecture layer;
- what data will appear here later;
- what backend/API support is missing.

---

## 5. Route Mapping

New canonical routes:

```text
/overview/status
/overview/capital
/overview/actions
/overview/risks

/execution/strategies
/execution/runs
/execution/market-making
/execution/positions
/execution/logs

/system/users
/system/roles
/system/api-keys
/system/config
/system/audit

/funding/reservations
/funding/orders
/funding/deposits
/funding/withdrawals
/funding/treasury
/funding/assets

/scheduling/chains
/scheduling/jobs
/scheduling/retry
/scheduling/routes
```

Keep legacy routes temporarily and redirect them to the new routes. Do not delete old route files in this phase.

Examples:

- `/users` → `/system/users`
- `/settings/api-keys` → `/system/api-keys`
- `/settings/strategies` → `/execution/strategies`
- `/market-making/direct` → `/execution/market-making`
- `/health` → `/overview/status`
- `/revenue` → `/overview/capital`

---

## 6. Files to Touch

Main files:

- `admin-interface/src/lib/components/shell/Sidebar.svelte`
- `admin-interface/src/lib/components/shell/nav-items.ts`
- `admin-interface/src/lib/components/shell/SidebarGroup.svelte`
- `admin-interface/src/lib/stores/sidebar.ts`
- `admin-interface/src/lib/components/shell/PlannedSurface.svelte`
- `admin-interface/src/routes/**/+page.svelte`
- `admin-interface/src/i18n/en.json`
- `admin-interface/src/i18n/zh.json`

Optional light update:

- `admin-interface/DESIGN.md` only if stable tokens/rules are missing.

---

## 7. Implementation Order

1. Update `nav-items.ts` to the final IA.
2. Build `SidebarGroup.svelte` and `sidebar.ts` persistence store.
3. Refactor `Sidebar.svelte` to show collapsible groups.
4. Add `PlannedSurface.svelte`.
5. Create new canonical routes.
6. Move/wrap existing real pages into new routes.
7. Add redirects from legacy routes.
8. Add/adjust i18n keys.
9. Run checks and screenshot review.

---

## 8. Acceptance Criteria

- Sidebar first load shows only top-level groups, not all child links.
- Group click expands/collapses children.
- Active route expands parent group automatically.
- Expanded state survives refresh.
- Mobile sidebar does not become a long crowded list.
- Every nav item has a working route.
- Existing functional pages are reused, not duplicated from scratch.
- Missing backend pages show `PlannedSurface`, not blank placeholders.
- Legacy routes redirect correctly.
- `bun --cwd admin-interface run check` passes.
- Dev server screenshots are provided for collapsed sidebar, expanded group, one real page, and one planned page.

---

## 9. Not in This Phase

- No new backend APIs.
- No full Funding implementation.
- No full Scheduling implementation.
- No roles/permissions backend.
- No audit-log backend.
- No deletion of old routes until the new IA is verified.

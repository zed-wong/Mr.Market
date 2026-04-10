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

---

## Improvement: Schema-Driven Config Editing

### Problem

Both `CreateDefinitionModal` and `EditDefinitionModal` use raw JSON `<textarea>` for
`configSchema` and `defaultConfig`. This is unfriendly because:

1. Admin must manually write valid JSON — easy to make syntax errors
2. No field labels, hints, or types — admin must know the DTO structure by heart
3. No validation that `defaultConfig` matches `configSchema`
4. No awareness of which fields exist per `controllerType`

### Solution: Two-Part Approach

#### Part 1 — Config Schema Templates (for `configSchema` field)

When the admin selects a `controllerType`, auto-populate `configSchema` from a
built-in template map. The admin can then customize it, but starts from a correct
baseline instead of `{}`.

**New file:** `interface/src/lib/components/admin/settings/strategies/configTemplates.ts`

```ts
// One template per controllerType, derived from the server DTOs.
//
// Fields injected at runtime by the execution engine are EXCLUDED:
//   - pair, exchangeName, accountLabel — set from the direct order form
//   - userId, clientId, marketMakingOrderId — set by the server
// See admin-direct-mm.service.ts directStart() lines 117-126.
//
export const CONFIG_SCHEMA_TEMPLATES: Record<string, object> = {
  pureMarketMaking: {
    type: "object",
    required: ["bidSpread", "askSpread", "orderAmount",
               "orderRefreshTime", "numberOfLayers", "priceSourceType",
               "amountChangePerLayer", "amountChangeType"],
    properties: {
      oracleExchangeName:    { type: "string",  description: "Oracle exchange for price data (optional, defaults to order exchange)" },
      bidSpread:             { type: "number",  description: "Bid spread %" },
      askSpread:             { type: "number",  description: "Ask spread %" },
      orderAmount:           { type: "number",  description: "Order amount per layer" },
      orderRefreshTime:      { type: "number",  description: "Refresh time (ms)" },
      numberOfLayers:        { type: "number",  description: "Number of order layers" },
      priceSourceType:       { type: "string",  enum: ["MID_PRICE","BEST_BID","BEST_ASK","LAST_PRICE"] },
      amountChangePerLayer:  { type: "number",  description: "Amount change per layer" },
      amountChangeType:      { type: "string",  enum: ["fixed","percentage"] },
      ceilingPrice:          { type: "number",  description: "Max buy price (optional)" },
      floorPrice:            { type: "number",  description: "Min sell price (optional)" },
      hangingOrdersEnabled:  { type: "boolean", description: "Enable hanging orders" },
      makerHeavyMode:        { type: "boolean", description: "Enable maker-heavy widening" },
      makerHeavyBiasBps:     { type: "number",  description: "Maker-heavy bias (bps)" },
      inventoryTargetBaseRatio: { type: "number", description: "Target base inventory ratio (0-1)" },
      inventorySkewFactor:   { type: "number",  description: "Inventory skew factor" },
    }
  },
  arbitrage: {
    type: "object",
    required: ["amountToTrade", "minProfitability", "exchangeAName", "exchangeBName"],
    properties: {
      amountToTrade:         { type: "number",  description: "Amount to trade" },
      minProfitability:      { type: "number",  description: "Min profit threshold (decimal, e.g. 0.01 = 1%)" },
      exchangeAName:         { type: "string",  description: "First exchange" },
      exchangeBName:         { type: "string",  description: "Second exchange" },
      checkIntervalSeconds:  { type: "number",  description: "Check interval (seconds)" },
      maxOpenOrders:         { type: "number",  description: "Max open orders" },
    }
  },
  volume: {
    type: "object",
    required: ["incrementPercentage", "intervalTime", "tradeAmount", "numTrades", "pricePushRate"],
    properties: {
      executionCategory:     { type: "string",  enum: ["clob_cex","amm_dex"], description: "Execution venue category" },
      incrementPercentage:   { type: "number",  description: "Price offset from mid %" },
      intervalTime:          { type: "number",  description: "Interval between trades (seconds)" },
      tradeAmount:           { type: "number",  description: "Amount per trade" },
      numTrades:             { type: "number",  description: "Total number of trades" },
      pricePushRate:         { type: "number",  description: "Price push rate after each trade %" },
      postOnlySide:          { type: "string",  enum: ["buy","sell"], description: "First trade side" },
      // DEX-only fields (required when executionCategory = amm_dex)
      dexId:                 { type: "string",  enum: ["uniswapV3","pancakeV3"] },
      chainId:               { type: "number",  description: "EVM chain ID" },
      tokenIn:               { type: "string",  description: "Input token address" },
      tokenOut:              { type: "string",  description: "Output token address" },
      feeTier:               { type: "number",  description: "V3 fee tier (500, 3000, 10000)" },
      slippageBps:           { type: "number",  description: "Slippage tolerance (bps)" },
    }
  },
};
```

**UI change in CreateDefinitionModal:**
- When `controllerType` changes, if `configSchema` is still `{}` or matches the
  previous template, auto-replace with the new template
- Show a "Reset to template" button next to the schema field

#### Part 2 — Form-Based Default Config Editor (for `defaultConfig` field)

Replace the raw JSON textarea for `defaultConfig` with a **dynamic form** generated
from the current `configSchema`. Each property becomes a labeled input field.

**New component:** `interface/src/lib/components/admin/settings/strategies/SchemaConfigForm.svelte`

Props:
- `schema: Record<string, unknown>` — the parsed configSchema
- `config: Record<string, unknown>` — the current defaultConfig (bind:value)

Behavior:
- Reads `schema.properties` → renders one field per property
- Field type mapping:
  - `{ type: "string" }` → text input
  - `{ type: "string", enum: [...] }` → select dropdown
  - `{ type: "number" }` → number input
  - `{ type: "boolean" }` → toggle/checkbox
- Required fields (from `schema.required[]`) get a `*` label marker
- `description` from schema property → shown as hint text below input
- Unknown/complex types → fallback to a text input
- "Show raw JSON" toggle at the bottom for power users who want to edit directly

**Wireframe:**
```
┌─ Default Config ──────────────────────────────────────┐
│                                                        │
│  pair *                         exchangeName *         │
│  ┌──────────────────────┐       ┌────────────────────┐ │
│  │ BTC/USDT             │       │ binance            │ │
│  └──────────────────────┘       └────────────────────┘ │
│  Trading pair, e.g. BTC/USDT    Exchange name          │
│                                                        │
│  bidSpread *          askSpread *        orderAmount *  │
│  ┌──────────┐         ┌──────────┐      ┌──────────┐  │
│  │ 0.1      │         │ 0.1      │      │ 0.01     │  │
│  └──────────┘         └──────────┘      └──────────┘  │
│  Bid spread %         Ask spread %      Order amount   │
│                                                        │
│  priceSourceType *              amountChangeType *     │
│  ┌──────────────────────┐       ┌────────────────────┐ │
│  │ MID_PRICE        ▾  │       │ percentage       ▾ │ │
│  └──────────────────────┘       └────────────────────┘ │
│                                                        │
│  ┌ ☐ Show raw JSON ──────────────────────────────────┐ │
│  │ (collapsed by default, expands to editable JSON)  │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

#### Part 3 — Config Schema Display Improvement

For `configSchema` itself (the JSON Schema definition), keep the textarea but:
- Add pretty-print formatting on blur
- Add a "Use template" button that populates from `CONFIG_SCHEMA_TEMPLATES`
- In `EditDefinitionModal`, keep it read-only (already done) but render it in
  a collapsible `<pre>` block instead of a disabled textarea

### Files to Change

| File | Change |
|------|--------|
| `...strategies/configTemplates.ts` | **New** — template map for all controllerTypes |
| `...strategies/SchemaConfigForm.svelte` | **New** — dynamic form component |
| `...strategies/CreateDefinitionModal.svelte` | Replace `defaultConfig` textarea with `SchemaConfigForm`, add template auto-populate for `configSchema` |
| `...strategies/EditDefinitionModal.svelte` | Replace `defaultConfig` textarea with `SchemaConfigForm` |
| `...strategies/DefinitionDetailsModal.svelte` | Render `defaultConfig` as labeled fields instead of raw JSON (read-only mode of `SchemaConfigForm`) |

### Execution Order

| Step | Scope | Depends on |
|------|-------|------------|
| 1 | Create `configTemplates.ts` | — |
| 2 | Create `SchemaConfigForm.svelte` | — |
| 3 | Update `CreateDefinitionModal.svelte` — wire template + form | Steps 1-2 |
| 4 | Update `EditDefinitionModal.svelte` — wire form | Step 2 |
| 5 | Update `DefinitionDetailsModal.svelte` — read-only form view | Step 2 |

Steps 1 and 2 are independent. No backend changes, no new dependencies.

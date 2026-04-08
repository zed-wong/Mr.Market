# Plan: Remove LocalCampaignService + CampaignJoin, API-only Source of Truth

> **Context:** This is an architectural decision to eliminate redundant local campaign tracking systems. The codebase has two separate campaign mechanisms: `LocalCampaignService` (intended for local reward splitting but never functional) and `CampaignJoin` (local shadow of HuFi participation). The HuFi API is the authoritative source for both.

## Key Findings

1. **HuFi Recording Oracle already tracks join status** — `CampaignService.joinCampaigns()` cron at `campaign.service.ts:369` calls `GET /mr-market/campaign?chainId=...&walletAddress=...` to check if a wallet is already joined. This is the single source of truth.

2. **`CampaignParticipation.contributionAmount` is dead** — never written by any code. `LocalCampaignProcessor.distributeRewards()` always exits early (line 51: `if (totalContribution.isZero()) return`). The current local reward distribution flow should be removed entirely for now rather than preserved.

3. **Test helpers mock `LocalCampaignService` as empty objects** — not actual service mocks. Safe to remove.

4. **Migration `1772300000000-ClearCampaignJoinRecords.ts` already exists** — someone already started thinking about this cleanup. The `up` migration clears `campaign_join` table. Need to extend it to drop the table.

## Problem Statement

The codebase maintains two separate campaign tracking systems that are redundant and partially dead:

1. **`LocalCampaignService`** + `Campaign` + `CampaignParticipation` — currently writes local participation records, but `contributionAmount` is never written, making the reward distribution pipeline ineffective. This whole local campaign and reward distribution flow should be removed for now.

2. **`CampaignJoin` entity** — used by admin direct MM to shadow HuFi participation records locally. HuFi itself tracks participation server-side via the Recording Oracle. The local shadow is unnecessary and creates sync complexity.

The HuFi API (`CampaignService.getCampaigns()`) is the authoritative source for campaign data and participation. The backend admin campaigns endpoint should become an internal proxy/aggregation layer over HuFi APIs: it fetches campaigns from HuFi, enriches them with `joined`, and returns a frontend-ready response. It is not a local persistence layer and not a direct frontend-to-HuFi integration. Both local systems should be removed and replaced with API-only reads.

## Implementation Order

Execute in this order to maintain a working app at every step:

### Phase 1: Backend — Add joined flag to campaigns (prerequisite for frontend)
Modify the existing `GET /admin/market-making/campaigns` endpoint to annotate each campaign with `joined: boolean`.

**Step 1a: Update `admin-direct-mm.service.ts`**
- Keep `listCampaigns()` but enrich with `joined` status
- For each campaign, call `hufiRecordingOracleAPI.get('/mr-market/campaign?chainId=...&walletAddress=...')` (same pattern as `campaign.service.ts:369`)
- Get the wallet address from `this.configService` or `Web3Service`
- Return `Array<CampaignDataDto & { joined: boolean }>`

**Step 1b: Create migration to drop tables**
- Update `server/src/database/migrations/1772300000000-ClearCampaignJoinRecords.ts` — change `DELETE FROM` to `DROP TABLE IF EXISTS campaign_join`
- Create `1772400000000-DropCampaignTables.ts` — `DROP TABLE IF EXISTS campaign` and `campaign_participation`

### Phase 2: Backend — Replace CampaignJoin with HuFi-backed join endpoint, then remove local storage
After frontend is updated to use `joined` flag from the enriched response and manual join is routed through backend-to-HuFi proxying.

**Step 2a: Update `admin-direct-mm.service.ts`**
- Replace local `CampaignJoin` persistence with a backend join proxy method that calls HuFi directly
- Keep a backend `joinCampaign()` entry point, but make it proxy the join request to HuFi instead of saving a `CampaignJoin` row
- After a successful HuFi join, have the frontend refresh `listCampaigns()` and consume `joined: true` from the campaigns response
- Remove `campaignJoinRepository` from constructor and `@InjectRepository`
- Remove `listCampaignJoins()` method
- Remove `CampaignJoin` from app.module.ts TypeORM feature array (line 160)

**Step 2b: Update `admin-direct-mm.controller.ts`**
- Keep a backend `POST /campaign-join` endpoint as the frontend trigger for manual join
- Make this endpoint proxy the join operation to HuFi rather than writing local `CampaignJoin` state
- Remove `GET /campaign-joins` endpoint (lines 79-83)

**Step 2c: Delete files**
- `server/src/common/entities/market-making/campaign-join.entity.ts`
- Keep `server/src/modules/admin/market-making/admin-direct-mm.dto.ts` if `CampaignJoinRequestDto` is still used by the backend proxy endpoint; otherwise remove only the unused local-storage DTO shapes

**Step 2d: Update `app.module.ts`**
- Remove `CampaignJoin` import (line 31)
- Remove `CampaignJoin` from TypeORM.forFeature (line 160)

### Phase 3: Backend — Remove LocalCampaignModule and current local reward distribution flow
**Step 3a: Update `market-making.processor.ts`**
- Remove `LocalCampaignService` import (line 23)
- Remove `localCampaignService` from constructor (line 71)
- Remove `localCampaignService.joinCampaign()` call (lines 997-1005)
- Remove the current local campaign reward tracking path rather than keeping it dormant
- Keep the HuFi API call chain, remove the local participation record creation

**Step 3b: Update `user-orders.module.ts`**
- Remove `LocalCampaignModule` import (line 23)
- Remove from `imports` array (line 51)

**Step 3c: Update `app.module.ts`**
- Remove `LocalCampaignModule` import (line 70)
- Remove from `imports` array (line 189)

**Step 3d: Delete LocalCampaignModule directory**
- `server/src/modules/market-making/local-campaign/` — entire directory

**Step 3e: Delete entities**
- `server/src/common/entities/campaign/campaign.entity.ts`
- `server/src/common/entities/campaign/campaign-participation.entity.ts`

**Step 3f: Explicitly remove current reward distribution flow**
- Remove the Bull queue usage for `local-campaigns` and the `LocalCampaignProcessor.distributeRewards()` flow
- Do not replace it with another off-chain/local reward splitter in this change
- Leave reward distribution as a future redesign implemented through the on-chain + Mixin flow below

### Phase 4: Frontend — Replace CampaignJoin with joined flag
**Step 4a: Update types**
- `interface/src/lib/types/hufi/admin-direct-market-making.ts`:
  - Remove `CampaignJoinRecord` type
  - Remove `CampaignJoinPayload` type
  - Add `joined: boolean` to the campaign type (or just use the enriched response from the API)

**Step 4b: Update helpers**
- `interface/src/lib/helpers/mrm/admin/direct-market-making.ts`:
  - Keep `joinAdminCampaign()` as the frontend action for manual joins, but make it call the backend proxy endpoint instead of relying on local `CampaignJoin` persistence
  - Remove `listCampaignJoins()` function
  - Update `listAdminCampaigns()` return type to include `joined` field

**Step 4c: Update `+page.ts`**
- Remove `listCampaignJoins` from `Promise.all`
- Remove `campaignJoins` from the return object

**Step 4d: Update `+page.svelte`**
- Remove `CampaignJoinRecord` import and local `campaignJoins` state
- Keep manual join UX, but wire it so the frontend button calls the backend join endpoint
- After join success, refresh campaigns and rely on `campaign.joined` from the backend response
- Remove `showAllCampaigns` and `AllCampaignsModal` if it only showed local joins
- Derive `joinedCampaigns = campaigns.filter(c => c.joined)`
- Derive `availableCampaigns = campaigns.filter(c => !c.joined)`
- Update `CampaignsPanel` to use `joined` flag from campaign object instead of `campaignJoins` cross-reference

**Step 4e: Update `CampaignsPanel.svelte`**
- Replace local join cross-reference logic with `joinedCampaigns = campaigns.filter(c => c.joined)`
- Render available campaigns from `availableCampaigns = campaigns.filter(c => !c.joined)`
- No longer need to cross-reference `campaignJoins` array

**Step 4f: Update `AllCampaignsModal.svelte`**
- Use `campaigns.filter(c => c.joined)` for joined campaigns
- Use `campaigns.filter(c => !c.joined)` for available campaigns
- No longer need to cross-reference `campaignJoins`

**Step 4g: Delete JoinCampaignModal**
- `interface/src/lib/components/market-making/direct/JoinCampaignModal.svelte`

**Step 4h: Update OrdersTable/OrderDetailsDialog**
- Check for any `campaignJoins` references for order-campaign linking
- If `orderId` on `CampaignJoin` was used to link orders to campaigns, remove or redesign

**Step 4i: Update i18n**
- `interface/src/i18n/en.json` — remove campaign-join related keys
- `interface/src/i18n/zh.json` — remove campaign-join related keys

### Phase 5: Tests
**Step 5a: Update `admin-direct-mm.service.spec.ts`**
- Remove `campaignJoinRepository` mock from `buildService()`
- Remove tests for `joinCampaign()` and `listCampaignJoins()`
- Update `listCampaigns` tests to verify `joined` flag is present

**Step 5b: Update test helpers**
- `server/test/system/helpers/market-making-payment.helper.ts` — remove `LocalCampaignService` provider (lines 233-236)
- `server/test/system/helpers/market-making-runtime.helper.ts` — remove `LocalCampaignService` provider (lines 204-207)
- `server/test/system/helpers/market-making-single-tick.helper.ts` — remove `LocalCampaignService` provider (lines 295-298)

**Step 5c: Run tests**
```bash
cd server && bun test src/modules/admin/market-making/admin-direct-mm.service.spec.ts
```

## What Already Exists

- `CampaignService.getCampaigns()` — fetches from HuFi Campaign Launcher API. **This becomes the single source.**
- `CampaignService.joinCampaigns()` cron already checks HuFi Recording Oracle for join status via `GET /mr-market/campaign?chainId=...&walletAddress=...` (campaign.service.ts:369-375). **This pattern is reused for the enriched response.**
- `CampaignService.joinCampaignWithAuth()` — joins HuFi campaign via Recording Oracle. Admin direct MM already uses this.
- `LocalCampaignProcessor.distributeRewards()` — dead code, always returns early. Being removed.
- `CampaignJoin` entity — only used by admin direct MM, not by the actual reward pipeline. Being removed.
- `1772300000000-ClearCampaignJoinRecords.ts` migration — already exists, clears `campaign_join` table. Will be extended to drop it.
- `LocalCampaignService` in test helpers — provided as empty objects `useValue: {}`, not real mocks. Safe to remove.

## Reward Distribution (Future State, not implemented in this cleanup)

The current local reward distribution flow should be removed for now. The intended future reward path is:

```
[HuFi contract]
  -> [Our EVM wallet]
  -> [Distribute on-chain order users first]
  -> [Transfer remainder into Mixin bot]
  -> [Distribute by tx]
```

This cleanup removes the dead local splitter and prepares for that future architecture instead of preserving a partial off-chain campaign reward system.

## NOT in Scope

- Removing `CampaignService` (HuFi API integration) — this is the active integration
- Implementing the future reward distribution path above in this PR
- Modifying the `RewardLedger` / `RewardAllocation` / `ShareLedgerEntry` reward pipeline — independent and working
- HuFi API caching — not adding caching in this PR
- Auto-join cron (`joinCampaigns()` in `campaign.service.ts`) — keep it, it handles user MM campaign joins via HuFi

## Data Flow (After)

```
Admin loads direct MM page
  → GET /admin/market-making/campaigns
  → CampaignService.getCampaigns()  [HuFi API]
  → For each campaign: check HuFi Recording Oracle for enrollment
  → Return campaigns with joined: true/false
  → Frontend: single list, no reconciliation needed
```

## Data Flow (After)

```
Admin loads direct MM page
  ┌─────────────────────────────────────────────────────┐
  │  GET /admin/market-making/campaigns                │
  │    → CampaignService.getCampaigns()                 │
  │       [HuFi Campaign Launcher API]                  │
  │    → For each campaign:                             │
  │       GET /mr-market/campaign?chainId=&address=     │
  │         [HuFi Recording Oracle API]                 │
  │       → joined: true/false                          │
  │    → Return: Campaign[] + joined flag               │
  └─────────────────────────────────────────────────────┘
  Frontend: single list, no reconciliation needed
  joinedCampaigns = campaigns.filter(c => c.joined)
  availableCampaigns = campaigns.filter(c => !c.joined)
  manual join button -> backend endpoint -> HuFi join -> refetch campaigns -> joined: true
```

## Files to Delete

| File | Lines | Reason |
|---|---|---|
| `server/src/modules/market-making/local-campaign/local-campaign.module.ts` | ~22 | Dead module |
| `server/src/modules/market-making/local-campaign/local-campaign.service.ts` | ~78 | Dead service |
| `server/src/modules/market-making/local-campaign/local-campaign.controller.ts` | ~10 | Dead controller |
| `server/src/modules/market-making/local-campaign/local-campaign.processor.ts` | ~50 | Dead processor |
| `server/src/common/entities/campaign/campaign.entity.ts` | ~56 | Dead entity |
| `server/src/common/entities/campaign/campaign-participation.entity.ts` | ~41 | Dead entity |
| `server/src/common/entities/market-making/campaign-join.entity.ts` | ~46 | Replaced by API response |
| `interface/src/lib/components/market-making/direct/JoinCampaignModal.svelte` | ~120 | No longer needed |

## Files to Modify

| File | Change |
|---|---|
| `server/src/app.module.ts` | Remove `LocalCampaignModule` (line 70, 189), `CampaignJoin` (line 31, 160) |
| `server/src/modules/admin/market-making/admin-direct-mm.service.ts` | Remove `CampaignJoin` repo, `joinCampaign()`, `listCampaignJoins()`. Update `listCampaigns()` to add `joined` flag |
| `server/src/modules/admin/market-making/admin-direct-mm.controller.ts` | Remove `POST /campaign-join`, `GET /campaign-joins` endpoints |
| `server/src/modules/admin/market-making/admin-direct-mm.dto.ts` | Remove `CampaignJoinRequestDto` |
| `server/src/modules/market-making/user-orders/market-making.processor.ts` | Remove `LocalCampaignService` injection, `localCampaignService.joinCampaign()` call, and HuFi participation logging block |
| `server/src/modules/market-making/user-orders/user-orders.module.ts` | Remove `LocalCampaignModule` import (line 23, 51) |
| `server/src/modules/campaign/campaign.service.ts` | Keep as-is (HuFi API integration) |
| `server/src/database/migrations/1772300000000-ClearCampaignJoinRecords.ts` | Extend to `DROP TABLE IF EXISTS campaign_join` |
| `server/src/modules/admin/market-making/admin-direct-mm.service.spec.ts` | Remove `campaignJoinRepository` mock, remove join/list tests, update listCampaigns tests |
| `server/test/system/helpers/market-making-payment.helper.ts` | Remove `LocalCampaignService` provider (lines 233-236) |
| `server/test/system/helpers/market-making-runtime.helper.ts` | Remove `LocalCampaignService` provider (lines 204-207) |
| `server/test/system/helpers/market-making-single-tick.helper.ts` | Remove `LocalCampaignService` provider (lines 295-298) |
| `interface/src/routes/(bottomNav)/(admin)/manage/market-making/direct/+page.ts` | Remove `listCampaignJoins` from Promise.all |
| `interface/src/routes/(bottomNav)/(admin)/manage/market-making/direct/+page.svelte` | Remove campaignJoins state, join modal state, handleJoinCampaign() |
| `interface/src/lib/helpers/mrm/admin/direct-market-making.ts` | Remove `joinAdminCampaign()`, `listCampaignJoins()` |
| `interface/src/lib/components/market-making/direct/CampaignsPanel.svelte` | Replace `getJoinForCampaign()` cross-ref with `campaign.joined` |
| `interface/src/lib/components/market-making/direct/AllCampaignsModal.svelte` | Replace `getJoinCampaign()` cross-ref with `campaigns.filter(c => c.joined)` |
| `interface/src/lib/types/hufi/admin-direct-market-making.ts` | Remove `CampaignJoinRecord`, `CampaignJoinPayload` |
| `interface/src/i18n/en.json` | Remove campaign-join translations |
| `interface/src/i18n/zh.json` | Remove campaign-join translations |

## New Migration

`1772400000000-DropCampaignTables.ts`:
```ts
// Drops campaign_join table (extends existing ClearCampaignJoinRecords)
// Drops campaign table
// Drops campaign_participation table
```

## Failure Modes

1. **HuFi Recording Oracle API is down** — `GET /mr-market/campaign?...` fails. If the call throws, `listCampaigns()` should catch and return `joined: false` for that campaign (graceful degradation). Not blocking.
2. **HuFi Campaign Launcher API is down** — `getCampaigns()` returns `[]`, admin sees empty list. Status quo — this already happens with the current architecture.
3. **Auto-join cron loses local participation record** — `market-making.processor.ts` no longer calls `localCampaignService.joinCampaign()`. The cron in `campaign.service.ts` still handles auto-joins. No regression.
4. **Frontend renders stale joined status** — campaigns are fetched fresh on every page load (no caching). Status is always current.

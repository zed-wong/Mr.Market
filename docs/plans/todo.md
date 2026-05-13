# Todos

> Items are ordered by strategic priority. Distribution and core-loop completeness before depth.

---

## Priority 1 — EVM Wallet Support (Distribution Unlock)

Mixin-only auth caps the addressable market to ~1M users. EVM wallet support opens the full crypto ecosystem.

### HuFi Campaigns — EVM

- [ ] Mr.Market users can create campaigns with EVM wallets (including Mixin EVM wallet) in web3-interface
- [ ] Mr.Market users can join HuFi campaigns by creating market-making orders with EVM wallets in web3-interface
- [ ] Mr.Market users can see joined HuFi campaigns with EVM wallets in web3-interface
- [ ] Mr.Market users can see their created campaigns with EVM wallets in web3-interface

---

## Priority 2 — Funding Lifecycle (Table Stakes)

Users cannot complete the full loop without these. No real value is delivered until this is closed end-to-end.

### Backend

- [ ] Backend can withdraw to exchange (should link exchange API key only from DB)
- [ ] After withdrawal to exchange, deposit status can be tracked by backend and updated in real time
- [ ] After deposit arrives on exchange, join campaign should be triggered automatically
- [ ] After join campaign (or no campaign to join), market-making handler starts immediately
- [ ] Implement actual HuFi join campaign execution in market-making `join_campaign` flow (not only local participation)
- [ ] Implement actual HuFi join campaign execution in `CampaignService.joinCampaigns` cron flow
- [ ] Add backend tests for market-making `join_campaign` flow: successful HuFi join, no campaign match, and failure fallback
- [ ] Add backend tests for cron auto-join flow: already joined skip, new campaign join, and API error handling
- [ ] User calling stop endpoint or initializing withdrawal is handled correctly and on time

---

## Priority 3 — Complete Campaign Loop (Demonstrable Flow)

The full user journey — create → fund → join → execute → earn — must be closeable before any scaling effort.

### HuFi Campaigns — Mixin

- [ ] Mr.Market users can create campaigns with Mixin wallet in web3-interface
- [ ] Mr.Market users can join HuFi campaigns by creating market-making orders with Mixin wallet in web3-interface
- [ ] Mr.Market users can see joined HuFi campaigns (via market-making orders) in web3-interface
- [ ] Mr.Market users can see their created campaigns with Mixin wallet in web3-interface

### UI Follow-ups

- [ ] Test join campaign process manually end-to-end
- [ ] Show user created order in `/market-making/+page.svelte`
- [ ] Show created order details in detail page
- [ ] Mr.Market users should see volume created by HuFi campaigns

---

## Priority 4 — Execution Visibility & Reporting

Users need feedback that the system is working. No visibility = no trust = no retention.

### Backend

- [ ] Market-making execution system: order status updates, place/cancel order logs, error handling — reflect on user's market-making order details
- [ ] Comprehensive order tracking: volume created, profit made, placed order count, filled order amount, success/failure/cancel count
- [ ] Campaign reward trading: calculate reward based on performance

---

## Priority 5 — Admin UX

Internal tooling. Only relevant once there are operators and campaigns to manage.

### Interface

- [ ] Add a setup guide for initialization: step-by-step, helps admin understand settings and get started
- [ ] Update admin login page UI to match the rest of the interface
- [ ] Merge exchange and API key management into one page with consistent logic
- [ ] Design a manage strategy page that allows admin to add/remove/create template and custom strategies

### Backend

- [ ] Unified Exchange Account: merge `admin_exchanges` + `api_keys_config` into single `ExchangeAccount` entity
- [ ] Remove `exchangeName`/`pair` from `StrategyInstance.parameters` — derive from bound `MarketMakingOrder` at runtime
- [ ] Move `userId`/`clientId`/`marketMakingOrderId` injection to after schema validation so strict schemas pass
- [ ] Make legacy admin strategy start fail on ambiguous enabled definitions instead of silently picking the oldest match
- [ ] Validate `controllerType` on strategy definition creation and reject unsupported values early
- [ ] Roll back started runtime sessions when admin strategy start succeeds in dispatcher but fails to link in storage
- [ ] Align admin strategy definition/instance endpoints with idiomatic REST semantics and boolean query parsing

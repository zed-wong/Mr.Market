# Mr.Market

## Backend

### Validation of create market making process
- [x] 1. user can open invoice payment page in confirm payment step
- [x] 2. invoice payment can be handled correctly by backend
3. backend can withdraw to exchange (should link exchange api key only from db)
4. after withdrawal to exchange, the deposit status can be tracked by backend, update in real time
5. after arrival of deposit to exchange, then join campaign should be triggered automatically
6. after join campaign, or no campain to join, the market making handler can start mm right away
7. implement actual HuFi join campaign execution in market making `join_campaign` flow (not only local participation)
8. implement actual HuFi join campaign execution in `CampaignService.joinCampaigns` cron flow
9. add backend tests for market making `join_campaign` flow: successful HuFi join, no campaign match, and failure fallback behavior
10. add backend tests for cron auto-join flow: already joined skip, new campaign join, and API error handling
11. user call stop endpoint or initialize withdrawal, can be handled correctly by backend on time

### Market making execution system
1. market making execution system, including order status updates, place/cancel order logs, error handling. reflect on user's market making orders details.
2. comprehensive order tracking, including volume created, profit made, placed order count, filled order amount, success/failure/cancel count.
3. campaign reward trading, calculate reward based on performance.

### Dynamic strategy management
- [x] 1. Add DB-backed strategy definitions (`strategy_definitions`) and link runtime instances with `definitionId`/`definitionVersion`
- [x] 2. Add strategy definition version snapshots (`strategy_definition_versions`) and publish/list flow
- [x] 3. Add admin APIs for definition lifecycle and instance lifecycle (validate/start/stop/list/backfill)
- [x] 4. Add seed defaults for built-in executors (pureMarketMaking/arbitrage/volume)
- [x] 5. Add admin strategy manage UI page under settings
- [ ] 6. Replace custom schema checks with a full JSON Schema validator
- [ ] 7. Add feature flag gating for dynamic definition flow in production environments
- [ ] 8. Add audit logs/permissions split for strategy definition management operations

## Interface

### Connect payment state to confirm payment page
- [x] 1. after user clicked pay button in create-new market making page, should start loading and fetch payment status from backend
- [x] 2. after payment status fetched, should show payment successful, and redirect to order details page
- [x] 3. order details page should fetch order details from backend, and show order details (connect ui to backend)
- [x] 4. make sure order details page is connected to backend correctly

### Create market making UI
- [x] 1. when select trading pair, there should be an small icon that represents the chain of the asset

### Admin page
- [] 1. Add a setup guide for initialization that is step by step, allowing admin to have basic understanding of how setting works, and makes it easier to set up all the things
- [] 2. Support sorting and filter in manage market making pairs/spot trading pairs
- [x] 3. Add manage strategies page aligned with existing settings page design

### Admin exchanges management
1. should design a way to merge /exchanges and /api-keys. so user don't get confused when adding exchange. api keys should be managed in the same place as exchanges, should be in the dropdown of the added exchange management page

### E2e Test
- [x] 1. Create market making UI
- [x] 2. Admin add trading pairs
- [x] 3. Admin add exchanges

# Hufi 

## UI
### Campaigns
- [-] 0. Mr.Market users can see all campaigns, and specific campaign details under /market-making/hufi
- [] 1. Mr.Market users should see volume created by Hufi campaigns
- [] 2. Mr.Market users can create campaigns with mixin wallet under /market-making/hufi
- [] 3. Mr.Market users can join hufi campaigns by creating market making orders with mixin wallet under /market-making/hufi
- [] 4. Mr.Market users can see joined hufi campaigns (via market making orders) under /market-making/hufi
- [] 5. Mr.Market users can see their created campaigns with mixin wallet under /market-making/hufi

- [] 6. Mr.Market users can create campaigns with evm wallets (including mixin evm wallet) under /market-making/hufi
- [] 7. Mr.Market users can join hufi campaigns by creating market making orders with evm wallets under /market-making/hufi
- [] 8. Mr.Market users can see joined hufi campaigns with evm wallets under /market-making/hufi
- [] 9. Mr.Market users can see their created campaigns with evm wallets under /market-making/hufi

- [] 10. HuFi Learn more page should introduce each types of campaigns
- [] 11. HuFi campaigns page should have a filter button put on top of the page, allowing user open dialog to filter campaigns (by campaign type, create/end date, DESC or ASC, reward amount)
- [] 12. For different types of campaigns, should have different types of actions in details page

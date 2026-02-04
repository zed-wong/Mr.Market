## Mr.Market
### Validation of create market making process
1. user can open invoice payment page in confirm payment step
2. invoice payment can be handled correctly by backend
3. backend can withdraw to exchange (should link exchange api key only from db)
4. after withdrawal to exchange, the deposit status can be tracked by backend, update in real time
5. after arrival of deposit to exchange, then join campaign should be triggered automatically
6. after join campaign, or no campain to join, the market making handler can start mm right away
7. user call stop endpoint or initialize withdrawal, can be handled correctly by backend on time

### Connect payment state to confirm payment page
- [x] 1. after user clicked pay button in create-new market making page, should start loading and fetch payment status from backend
- [x] 2. after payment status fetched, should show payment successful, and redirect to order details page
- [x] 3. order details page should fetch order details from backend, and show order details (connect ui to backend)
- [x] 4. make sure order details page is connected to backend correctly

### Create market making UI
- [x] 1. when select trading pair, there should be an small icon that represents the chain of the asset

### Admin page
- [] 1. Add a setup guide for initialization that is step by step, allowing admin to have basic understanding of how setting works, and makes it easier to set up all the things

### Admin exchanges management
1. should design a way to merge /exchanges and /api-keys. so user don't get confused when adding exchange. api keys should be managed in the same place as exchanges, should be in the dropdown of the added exchange management page

### E2e Test
- [x] 1. Create market making UI
- [x] 2. Admin add trading pairs
- [x] 3. Admin add exchanges
- [] 4.

## Hufi 

### Campaigns
1. Mr.Market users can join hufi campaigns under /market-making/hufi
2. Mr.Market users can create campaigns under /market-making/hufi

### Join Hufi campaign directly
1. Create page for users to configure their exchange API keys to join hufi campaigns directly
2. User should be able to add/select exchange, enter API keys, and join campaign in one flow
3. Page should be accessible from campaign detail page via "Join Directly" button

### Hufi Controller
1. Should add an endpoint to cache data from hufi recording oracle api, to return to the frontend, frontend use data from this api, and fallback to recording oracle api when this cache endpoint is not available

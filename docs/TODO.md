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
1. after user clicked pay button in create-new market making page, should start loading and fetch payment status from backend
2. after payment status fetched, should show payment successful, and redirect to order details page
3. order details page should fetch order details from backend, and show order details (connect ui to backend)

### Create market making UI
1. when select trading pair, there should be an small icon that represents the chain of the asset

### Admin add trading pairs
- [x] 1. Add a special add trading pair dialog that only require users to enter symbol, and it will fetch all available related trading pairs from ccxt, allowing user to add trading pair with one-click
- [x] 2. Add a setup guide for initialization that is step by step, allowing admin to have basic understanding of how setting works, and makes it easier to set up all the things

### Admin exchanges management
1. should design a way to merge /exchanges and /api-keys. so user don't get confused when adding exchange. api keys should be managed in the same place as exchanges, should be in the dropdown of the added exchange management page


## Hufi 

### Hufi education FAQ
- [x] 1. Hufi education FAQ under /market-making/hufi/learn-more and Mr.market FAQ under /market-making/learn-more
- [x] 2. for hufi, mainly about how hufi works, how it benefits users, how safe it is
- [x] 3. for mr.market, mainly about what is market making, why to market make, and how it benefits projects 

### Campaigns
1. Mr.Market users can join hufi campaigns under /market-making/hufi
2. Mr.Market users can create campaigns under /market-making/hufi

### Join Hufi campaign directly
1. Create page for users to configure their exchange API keys to join hufi campaigns directly
2. User should be able to add/select exchange, enter API keys, and join campaign in one flow
3. Page should be accessible from campaign detail page via "Join Directly" button

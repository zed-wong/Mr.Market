# Web3 Router Funding Request First Design

## Goal

This document records the corrected EVM-first Web3 funding design for `web3-interface` and server-side Web3 funding.

The chosen model is:

> **Funding Request First + Stateless Router + Server Event Listener + Order-Scoped Ledger**

The Solidity contract is only a Router. It forwards funds and emits user-request events. The server owns order creation, ledger mutation, exchange funding, and withdrawal payout.

## Confirmed Decisions

- First chain family is **EVM**.
- Authentication remains **SIWE + JWT**.
- Router is not a long-term custody vault and does not maintain user balances.
- Router forwards ERC-20 funding to a static server-held receiver address.
- Server may hold the receiver private key and may move funds to exchange/API-key accounts for market making.
- Server listens to Router events and updates the ledger.
- Ledger is the balance source of truth.
- There is no durable generic user wallet balance. Wallet-like balances in UI are projections for user experience only.
- Funding scope is order-oriented. Product semantics should be `orderId + tokenContractAddress`; if the backend still needs an `assetId`, it can use a canonical EVM asset id such as `evm:{chainId}:{tokenAddressLowercase}`.
- `orderId` must not be exposed on-chain. This design avoids putting either `orderId` or `hashed orderId` on-chain.
- Server should avoid spending gas on funding. User pays the funding Router transaction gas.
- Withdrawal payout gas can be recovered from the user as a server-priced withdrawal/network fee, preferably debited from order-scoped funds.

## Why Not Hashed Order ID

A hashed-order design requires the server to create an order before funding:

```text
create orderId -> hash orderId -> user funds orderHash -> server marks order funded
```

That exposes an order-derived identifier on-chain and creates unpaid `awaiting_funding` orders.

The chosen design creates only a funding request before payment:

```text
create funding request -> user routes funds -> server creates formal order
```

This is more private because the chain contains no order identifier or order-derived hash. The server later binds:

```text
requestId -> fundingRequest -> orderDraft -> orderId
```

## High-Level Flow

```diagram
╭────────────────╮
│ web3-interface │
╰───────┬────────╯
        │ 1. create funding request with order draft
        ▼
╭────────────────╮
│ Server         │ stores requestId + payloadHash + draft
╰───────┬────────╯
        │ 2. return Router tx params
        ▼
╭────────────────╮
│ User Wallet    │ approve + routeFunds
╰───────┬────────╯
        │ 3. user-paid gas
        ▼
╭────────────────╮
│ Router         │ transfer ERC-20 to receiver + emit event
╰───────┬────────╯
        │ 4. server indexes event
        ▼
╭────────────────╮
│ Server         │ validate event, create order, write ledger
╰────────────────╯
```

## Funding Request Flow

### 1. User submits an order draft

The user fills market-making order parameters in `web3-interface`, such as market, token, amount, strategy type, spread, and limits. These business parameters do not go on-chain.

### 2. Server creates a funding request

Example API:

```http
POST /web3/funding-requests
```

Example request:

```json
{
  "chainId": 11155111,
  "tokenContractAddress": "0xToken",
  "amount": "1000",
  "orderDraft": {
    "market": "ETH/USDT",
    "strategyType": "spread",
    "spreadBps": 50,
    "minPrice": "2500",
    "maxPrice": "3500"
  }
}
```

Server responsibilities:

- Require SIWE/JWT for this action.
- Validate the caller EVM address.
- Validate supported chain and token.
- Validate the order draft.
- Generate a `requestId`.
- Compute a `payloadHash`.
- Persist the funding request with status `created` and expiry.
- Return Router transaction parameters.

Example response:

```json
{
  "requestId": "0x...",
  "payloadHash": "0x...",
  "routerAddress": "0xRouter",
  "receiverAddress": "0xServerReceiver",
  "tokenContractAddress": "0xToken",
  "amount": "1000",
  "expiresAt": "2026-06-02T00:00:00Z"
}
```

### 3. Payload hash

Recommended hash inputs:

```text
payloadHash = keccak256(
  chainId,
  routerAddress,
  receiverAddress,
  userEvmAddress,
  tokenContractAddress,
  amount,
  requestId,
  canonicalOrderDraftJsonHash,
  serverSecretSalt
)
```

The full order draft remains server-side. The event only carries `payloadHash`, so observers cannot recover the order parameters or `orderId`.

### 4. User calls Router

The frontend checks allowance, asks for ERC-20 approval if needed, then calls:

```solidity
routeFunds(requestId, token, amount, payloadHash)
```

The user pays gas. Router transfers the ERC-20 from the user to the server receiver and emits `FundsRouted`.

### 5. Server handles the event

The server listener validates:

- event chain id;
- Router contract address;
- request id exists;
- request status is `created`;
- request is not expired;
- event user equals request owner;
- token, amount, receiver, and payload hash match the stored request;
- transaction has enough confirmations;
- event is not already processed by `chainId + txHash + logIndex`;
- request has not already created an order.

After validation:

- mark funding request `onchain_seen`;
- create the formal market-making order;
- bind `requestId -> orderId`;
- write immutable ledger credit for `orderId + tokenContractAddress`;
- continue order lifecycle into `funded`, `pending_exchange_transfer`, or `running` according to the trading layer.

## Router Contract Shape

Recommended name:

```text
MrMarketRouter
```

Core state:

```solidity
address public receiver;
address public owner;
mapping(address => bool) public supportedTokens; // optional
```

Core functions:

```solidity
function routeFunds(
    bytes32 requestId,
    address token,
    uint256 amount,
    bytes32 payloadHash
) external;

function requestWithdrawal(
    bytes32 requestId,
    address token,
    uint256 amount,
    address recipient,
    bytes32 payloadHash
) external;

function setReceiver(address newReceiver) external onlyOwner;

function setSupportedToken(address token, bool supported) external onlyOwner;
```

Core events:

```solidity
event FundsRouted(
    bytes32 indexed requestId,
    address indexed user,
    address indexed token,
    uint256 amount,
    bytes32 payloadHash,
    address receiver
);

event WithdrawalRequested(
    bytes32 indexed requestId,
    address indexed user,
    address indexed token,
    uint256 amount,
    address recipient,
    bytes32 payloadHash
);

event ReceiverUpdated(address oldReceiver, address newReceiver);

event TokenSupportUpdated(address token, bool supported);
```

Router should not create orders, mutate ledgers, store balances, execute exchange operations, or record completion.

## Router State and Idempotency

The Router should stay stateless for request processing. It does not need to store used `requestId` values because doing so increases user gas and the server must handle idempotency anyway.

Server idempotency keys:

```text
event idempotency: chainId + txHash + logIndex
request idempotency: requestId + status
ledger idempotency: typed operation id / event evidence id
```

If a user repeats a request, the server processes only the first valid event. Later valid transfers with the same request require rejection/refund/support handling.

## Withdrawal Request Flow

Router does not pay users. It only emits a user-authored withdrawal request event. Server validates ledger availability and pays the recipient.

### 1. Server prepares withdrawal request

Example API:

```http
POST /web3/withdrawal-requests
```

Example request:

```json
{
  "orderId": "ord_...",
  "tokenContractAddress": "0xToken",
  "amount": "100",
  "recipient": "0xRecipient"
}
```

Server responsibilities:

- Require SIWE/JWT.
- Verify the user can operate the order.
- Verify order-scoped available balance.
- Estimate withdrawal/network fee.
- Generate `requestId` and `payloadHash`.
- Persist withdrawal request with status `created` and expiry.
- Return Router call parameters.

### 2. User emits withdrawal request

Frontend calls:

```solidity
requestWithdrawal(requestId, token, amount, recipient, payloadHash)
```

The user pays gas for this event transaction.

### 3. Server pays out

After indexing and validating `WithdrawalRequested`, server:

- validates request id, owner, token, amount, recipient, payload hash, expiry, confirmation, and idempotency;
- checks reconciliation state and order-scoped ledger availability;
- debits withdrawal principal from `orderId + tokenContractAddress`;
- debits withdrawal/network fee from order-scoped funds;
- sends payout via EVM transfer, exchange withdrawal, Mixin transfer, or another configured payout rail;
- stores payout tx hash or external payout id;
- marks the request `paid` or terminally failed/rejected.

## Withdrawal Fee Model

Preferred fee model:

> Deduct server-priced withdrawal/network fee from the order-scoped balance.

Example:

```text
order available USDT: 102
user withdrawal amount: 100
server withdrawal fee: 2

ledger debit principal: 100 USDT from orderId + tokenContractAddress
ledger debit fee:       2 USDT from orderId + tokenContractAddress
server pays recipient: 100 USDT
```

The server still pays the actual chain gas from its own wallet when it performs an EVM payout. The fee reimburses that cost at the business layer. This avoids introducing a generic user gas balance.

## Data Model

### `web3_funding_request`

```text
id
requestId
chainId
evmAddress
tokenContractAddress
amount
payloadHash
orderDraftJson
status: created | onchain_seen | order_created | rejected | expired
txHash nullable
logIndex nullable
orderId nullable
createdAt
expiresAt
updatedAt
```

### `web3_withdrawal_request`

```text
id
requestId
chainId
evmAddress
orderId
tokenContractAddress
amount
recipient
feeTokenContractAddress
feeAmount
payloadHash
status: created | onchain_seen | processing | paid | failed | rejected | expired
requestTxHash nullable
requestLogIndex nullable
payoutTxHash nullable
externalPayoutId nullable
createdAt
expiresAt
updatedAt
```

### `web3_event_log`

Optional but recommended for replay, audit, and idempotency:

```text
id
chainId
contractAddress
eventName
txHash
logIndex
blockNumber
payloadJson
processedAt
createdAt
```

## Ledger Semantics

All balance effects are immutable, transactional, idempotent ledger entries.

Funding:

```text
FundsRouted confirmed
-> create order
-> credit orderId + tokenContractAddress
```

Server movement to exchange:

```text
server receiver -> exchange/API-key account
-> ledger movement attributed to the order
```

Trading:

```text
fills, fees, rewards, reversals
-> attributable to the order
```

Withdrawal:

```text
WithdrawalRequested confirmed
-> debit principal from orderId + tokenContractAddress
-> debit withdrawal/network fee from orderId + tokenContractAddress
-> server payout evidence recorded
```

There must be no generic user balance adjustment path.

## UI Behavior

`web3-interface` must not require global login. Public/read-only surfaces should render normally for disconnected users.

Require wallet connection and SIWE only at action boundaries:

- create funding request;
- create withdrawal request;
- view private orders or private funding projections;
- perform order management actions.

Funding UX should feel like one action:

```text
Create Order & Fund
```

Implementation sequence:

1. Prompt SIWE if needed.
2. Prompt wallet connection if needed.
3. Create funding request on server.
4. Check ERC-20 allowance.
5. Ask user to approve if needed.
6. Call Router `routeFunds`.
7. Show pending confirmation/indexing state.
8. Show the formal order after server creates it from the confirmed event.

## Edge Cases

### Request created but never funded

Expire the funding request. Do not create an order.

### Duplicate Router calls

Process the first valid event only. Mark later events duplicate/rejected and route them to refund/support handling if funds were transferred.

### Direct transfer to receiver without Router

Do not auto-attribute. Treat as unattributed incoming transfer requiring manual refund/support handling.

### Receiver update

Funding requests must bind the receiver in `payloadHash`. Events also emit the receiver. This preserves evidence when the Router admin updates the global receiver.

### Event mismatch

If token, amount, user, receiver, or payload hash does not match the stored request, reject the event and avoid ledger credit.

### Reconciliation mismatch

If reconciliation detects mismatch, block risk-increasing operations and withdrawal processing until resolved.

## Implementation Direction

The existing vault/REST funding prototype should be refactored into this design:

- Replace `MrMarketVault.sol` with `MrMarketRouter.sol`.
- Replace ordinary deposit verification with Router event indexing and funding-request verification.
- Replace direct REST withdrawal mutation with prepare/status APIs plus Router `WithdrawalRequested` event processing.
- Keep and reuse SIWE, JWT, Reown/AppKit, server Web3 utilities, ledger service patterns, and no-global-login UI behavior.
- Update wallet/account pages to show ledger-derived order funding projections, not durable generic wallet balances.

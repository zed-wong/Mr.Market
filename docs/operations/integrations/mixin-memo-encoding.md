# Mixin Memo Encoding Guide

This document describes the memo format that the backend execution layer currently treats as authoritative on `main`.

## Source Of Truth

- `server/src/common/constants/memo.ts`
- `server/src/common/helpers/mixin/memo.ts`
- `server/src/common/helpers/mixin/memo.spec.ts`
- `server/src/modules/mixin/snapshots/snapshots.service.ts`
- `server/src/modules/market-making/user-orders/user-orders.service.ts`

## Current Scope

- Backend snapshot intake actively supports **Market Making create** memos.
- Backend helpers also support **Simply Grow create/deposit** memo encoding and decoding.
- Backend snapshot intake does **not** currently process **Arbitrage** binary memos on `main`.
- `Spot` uses a separate colon-delimited helper (`decodeSpotMemo`) and is not part of the binary execution flow described here.

Important compatibility note:

- `interface/src/lib/helpers/mixin/memo.ts` still contains legacy `encodeArbitrageCreateMemo(...)`.
- The same interface helper still appends `rewardAddress` to Simply Grow payloads.
- Treat the backend helper as the protocol source of truth for execution-layer work. The backend decoder is tolerant enough to read older Simply Grow memos because it only consumes the first 16 bytes of `orderId`, but that legacy payload is not the canonical backend format anymore.

## Binary Envelope

All binary memos share this envelope:

```text
┌─────────────┬──────────────┬─────────┬────────────────┬──────────┐
│   Version   │ Trading Type │ Action  │   Payload      │ Checksum │
│   (1 byte)  │   (1 byte)   │(1 byte) │  (variable)    │ (4 bytes)│
└─────────────┴──────────────┴─────────┴────────────────┴──────────┘
```

`Checksum` is the first 4 bytes of a double-SHA256 hash over the payload.

## Numeric Maps

Current backend constants:

```typescript
MemoVersion.Current = 1

TradingTypeKey = {
  0: "Spot",
  1: "Market Making",
  2: "Simply Grow",
}

MarketMakingMemoActionKey = {
  1: "create",
  2: "deposit",
}

SimplyGrowMemoActionKey = {
  1: "create",
  2: "deposit",
}
```

There is no backend `ArbitrageMemoActionKey` on `main`.

## Supported Backend Memo Types

### 1. Market Making Create

Purpose: bind an incoming Mixin payment to a previously created market-making intent.

Structure:

```text
┌─────────┬──────────────┬────────┬──────────────────────┬──────────────┬──────────┐
│ Version │ Trading Type │ Action │ Market Making Pair ID│   Order ID   │ Checksum │
│ 1 byte  │   1 byte     │ 1 byte │      16 bytes        │   16 bytes   │ 4 bytes  │
└─────────┴──────────────┴────────┴──────────────────────┴──────────────┴──────────┘
```

Canonical size before Base58 encoding: 39 bytes.

Fields:

- `version = 1`
- `tradingType = 1` (`Market Making`)
- `action = 1` (`create`)
- `marketMakingPairId` as UUID bytes
- `orderId` as UUID bytes

Example:

```typescript
const memo = encodeMarketMakingCreateMemo({
  version: 1,
  tradingType: "Market Making",
  action: "create",
  marketMakingPairId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  orderId: "12345678-90ab-cdef-1234-567890abcdef",
});
```

### 2. Simply Grow Create Or Deposit

Purpose: encode a Simply Grow order reference for backend helper usage.

Canonical backend structure:

```text
┌─────────┬──────────────┬────────┬──────────────┬──────────┐
│ Version │ Trading Type │ Action │   Order ID   │ Checksum │
│ 1 byte  │   1 byte     │ 1 byte │   16 bytes   │ 4 bytes  │
└─────────┴──────────────┴────────┴──────────────┴──────────┘
```

Canonical backend size before Base58 encoding: 23 bytes.

Fields:

- `version = 1`
- `tradingType = 2` (`Simply Grow`)
- `action = 1` (`create`) or `2` (`deposit`)
- `orderId` as UUID bytes

Example:

```typescript
const memo = encodeSimplyGrowCreateMemo({
  version: 1,
  tradingType: "Simply Grow",
  action: "create",
  orderId: "12345678-90ab-cdef-1234-567890abcdef",
});
```

Compatibility note:

- Older interface-side memos may append `rewardAddress` bytes after `orderId`.
- Backend `decodeSimplyGrowCreateMemo(payload)` still parses the leading fields and ignores that trailing legacy data.

## Not In Current Backend Snapshot Runtime

The backend snapshot switch currently handles only:

- `TradingTypeKey.MarketMaking` with `create`
- `TradingTypeKey.SimplyGrow` decode-only branch

It does not contain an arbitrage binary-memo execution branch on `main`, so do not treat arbitrage memo examples from old interface helpers as supported backend behavior.

## Encode/Decode Flow

### Encoding

Current backend helpers:

```typescript
const payload = Buffer.concat([
  versionBuffer,
  tradingTypeBuffer,
  actionBuffer,
  ...payloadFields,
]);

const checksum = computeMemoChecksum(payload);
const completeBuffer = Buffer.concat([payload, checksum]);
return base58.encode(completeBuffer);
```

### Decoding

Backend decoding is a two-step flow:

```typescript
const { payload, version, tradingTypeKey, action } = memoPreDecode(memo);

if (tradingTypeKey === TradingTypeKey.MarketMaking) {
  const details = decodeMarketMakingCreateMemo(payload);
}
```

`memoPreDecode(...)` is responsible for:

- Base58 decode
- checksum verification
- extracting `version`, `tradingTypeKey`, and `action`

Type-specific decoders then parse the payload bytes.

## Current Usage In Application

### Market Making Payment Creation

The current flow is backend-authored, not frontend-authored:

1. Frontend calls `POST /user-orders/market-making/intent`.
2. `UserOrdersService.createMarketMakingOrderIntent(...)` generates `orderId`.
3. The backend encodes the market-making memo with that `orderId`.
4. The backend returns `orderId`, `memo`, and `expiresAt`.
5. Frontend uses the returned payment metadata to open the Mixin payment flow.

Representative backend path:

```typescript
const orderId = randomUUID();
const memo = encodeMarketMakingCreateMemo({
  version: 1,
  tradingType: "Market Making",
  action: "create",
  marketMakingPairId,
  orderId,
});
```

### Snapshot Intake

`SnapshotsService.handleSnapshot(...)` currently:

1. Calls `memoPreDecode(memo)`.
2. Rejects invalid checksum/version.
3. Switches on `tradingTypeKey`.
4. For market making:
   - decodes the payload
   - loads the intent by `orderId`
   - checks pair binding, user binding, and intent expiry
   - refunds mismatches
   - queues `process_market_making_snapshots` when valid

High-level shape:

```typescript
const { payload, version, tradingTypeKey, action } = memoPreDecode(memo);

if (version !== MemoVersion.Current) {
  await refund(snapshot);
  return;
}

if (
  tradingTypeKey === TradingTypeKey.MarketMaking &&
  action === MarketMakingMemoActionKey.Create
) {
  const details = decodeMarketMakingCreateMemo(payload);
  // validate intent, pair, payer, expiry
  // queue process_market_making_snapshots
}
```

## Validation Guidance

- Always call `memoPreDecode(...)` before any type-specific decoder.
- Treat checksum failure as a hard invalid-memo case.
- Validate UUID inputs before encoding.
- Keep frontend helper changes aligned with backend constants in `server/src/common/constants/memo.ts`.
- Do not rely on interface-side arbitrage or legacy Simply Grow helpers as the canonical backend contract.

## Tests

Primary test coverage today:

- `server/src/common/helpers/mixin/memo.spec.ts`
- `server/src/modules/mixin/snapshots/snapshots.service.spec.ts`

Recommended decode pattern in tests:

```typescript
const encoded = encodeMarketMakingCreateMemo(original);
const { payload } = memoPreDecode(encoded);
const decoded = decodeMarketMakingCreateMemo(payload);

expect(decoded).toEqual(original);
```

For legacy Simply Grow compatibility, keep at least one test that decodes an interface-generated memo and asserts the backend still extracts the same `orderId`.

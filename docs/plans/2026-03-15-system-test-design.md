# System Test Design

**Date**: 2026-03-15
**Status**: Draft design, pending implementation

## Overview

This document defines a realistic test design for three market-making system-level flows:

1. Deposit tracking verification
2. HuFi campaign join flow
3. Market-making lifecycle progression

This document is a companion design note, not the March 15 sandbox testing source of truth. The authoritative sandbox integration scope remains `docs/plans/2026-03-15-ccxt-sandbox-integration-testing-plan.md`.

## Design Corrections

The original draft had three structural problems:

1. It mixed Chinese and English in the same document.
2. It labeled several mock-heavy scenarios as "system tests" even when they were not exercising a real system boundary.
3. It implied broader end-to-end coverage than the current runtime can credibly support.

This revised version keeps the intended coverage, but narrows each suite to a defensible boundary.

## Suite 1: Deposit Tracking System Test

### Purpose

Verify the deposit-tracking decision logic across three confirmation sources:

1. Mixin withdrawal record
2. On-chain transaction record
3. Exchange deposit history

### Target File

```text
server/test/system/market-making/deposit-tracking.system.spec.ts
```

### Test Boundary

This suite should validate deposit-tracking orchestration and reconciliation logic. It may use sandbox exchange data for deposit-history reads, but it should not pretend to validate a real end-to-end withdrawal if no real transfer is executed.

### Proposed Structure

```typescript
describe('Deposit Tracking System Test', () => {
  const REQUIRED_ENV_VARS = [
    'CCXT_SANDBOX_EXCHANGE',
    'CCXT_SANDBOX_API_KEY',
    'CCXT_SANDBOX_SECRET',
    'DEPOSIT_TEST_ASSET_SYMBOL',
    'DEPOSIT_TEST_NETWORK',
    'DEPOSIT_TEST_MIN_AMOUNT',
  ];

  describe('Phase 1: Deposit Address Retrieval', () => {
    it('fetches a deposit address for the configured asset and network', async () => {
      // Use ExchangeApiKeyService.getDepositAddress()
    });

    it('handles unsupported networks explicitly', async () => {
      // Assert a controlled validation or adapter error
    });
  });

  describe('Phase 2: Exchange Deposit History', () => {
    it('fetches deposit history from the sandbox exchange', async () => {
      // Use CCXT fetchDeposits() when supported by the exchange
    });

    it('matches deposits by txId and amount', async () => {
      // Validate matching logic against controlled fixture data
    });
  });

  describe('Phase 3: Triple Verification', () => {
    it('marks a deposit confirmed only when all required sources align', async () => {
      // Reconcile Mixin, on-chain, and exchange confirmations
    });

    it('keeps the deposit pending when only partial confirmation exists', async () => {
      // Example: Mixin confirmed, exchange record missing
    });
  });
});
```

### Required Environment Variables

```bash
CCXT_SANDBOX_EXCHANGE=okx
CCXT_SANDBOX_API_KEY=your_api_key
CCXT_SANDBOX_SECRET=your_api_secret
DEPOSIT_TEST_ASSET_SYMBOL=USDT
DEPOSIT_TEST_NETWORK=TRC20
DEPOSIT_TEST_MIN_AMOUNT=10
```

### Implementation Notes

- Do not require a real transfer for the first implementation.
- Treat unsupported `fetchDeposits()` behavior as an explicit skip or capability check, not a silent pass.
- Cover empty history, partial matches, and amount mismatch cases.

## Suite 2: HuFi Campaign System Test

### Purpose

Verify the campaign discovery and join flow:

1. Fetch campaigns
2. Match an eligible campaign
3. Complete Web3 authentication
4. Attempt campaign join

### Target File

```text
server/test/system/market-making/hufi-campaign.system.spec.ts
```

### Test Boundary

This suite should validate the HuFi-facing service flow against real HuFi endpoints only if stable test endpoints are available. If the external services are not stable or not intended for automated tests, downgrade the suite to a contract-style system test with controlled HTTP mocks and document that boundary clearly.

### Proposed Structure

```typescript
describe('HuFi Campaign System Test', () => {
  const REQUIRED_ENV_VARS = [
    'HUFI_CAMPAIGN_LAUNCHER_URL',
    'HUFI_RECORDING_ORACLE_URL',
    'WEB3_PRIVATE_KEY',
    'TEST_EXCHANGE_NAME',
    'TEST_SYMBOL',
  ];

  describe('Phase 1: Campaign Discovery', () => {
    it('fetches active campaigns from the launcher', async () => {
      // Exercise CampaignService.getCampaigns()
    });

    it('filters campaigns by exchange and symbol', async () => {
      // Match by exchange, base symbol, and active status
    });
  });

  describe('Phase 2: Web3 Authentication', () => {
    it('gets an authentication nonce from the oracle', async () => {
      // Exercise get_auth_nonce()
    });

    it('authenticates with a signed message', async () => {
      // Exercise authenticate_web3_user()
    });
  });

  describe('Phase 3: Campaign Join', () => {
    it('executes the joinCampaignWithAuth flow', async () => {
      // Attempt join with authenticated context
    });

    it('handles an already-joined campaign idempotently', async () => {
      // Repeated runs should not cause a false failure
    });
  });

  describe('Phase 4: Matching Rules', () => {
    it('matches campaigns by base symbol derived from the pair', async () => {
      // Example: BTC/USDT -> BTC
    });

    it('excludes expired campaigns', async () => {
      // endBlock-derived expiry check
    });

    it('excludes completed campaigns', async () => {
      // status !== Complete
    });
  });
});
```

### Required Environment Variables

```bash
HUFI_CAMPAIGN_LAUNCHER_URL=https://campaign-launcher.example.com
HUFI_RECORDING_ORACLE_URL=https://recording-oracle.example.com
WEB3_PRIVATE_KEY=0x...
TEST_EXCHANGE_NAME=okx
TEST_SYMBOL=BTC
```

### Implementation Notes

- Use a test-only wallet and testnet-compatible credentials.
- Keep repeated runs idempotent.
- If HuFi services are unstable, use HTTP mocks and rename the suite boundary accordingly in the spec description.

## Suite 3: Market-Making Lifecycle System Test

### Purpose

Verify the highest-value lifecycle transitions in the market-making flow:

1. Order creation
2. Withdrawal initiation
3. Deposit confirmation
4. Campaign join attempt
5. Strategy start
6. Stop and cleanup

### Target File

```text
server/test/system/market-making/market-making-lifecycle.system.spec.ts
```

### Test Boundary

This suite should validate lifecycle orchestration and state progression. It should not claim full exchange-to-fill end-to-end coverage unless real fill ingestion exists in the runtime. Until then, order placement can be real while downstream fill progression remains bounded to the currently implemented runtime behavior.

### Proposed Structure

```typescript
describe('Market Making Lifecycle System Test', () => {
  const REQUIRED_ENV_VARS = [
    'CCXT_SANDBOX_EXCHANGE',
    'CCXT_SANDBOX_API_KEY',
    'CCXT_SANDBOX_SECRET',
    'HUFI_CAMPAIGN_LAUNCHER_URL',
    'HUFI_RECORDING_ORACLE_URL',
    'WEB3_PRIVATE_KEY',
    'TEST_PAIR',
    'TEST_BASE_AMOUNT',
    'TEST_QUOTE_AMOUNT',
  ];

  describe('Phase 1: Order Creation', () => {
    it('creates a market-making order in payment-pending state', async () => {});

    it('transitions to payment-complete after funding is recorded', async () => {});
  });

  describe('Phase 2: Withdrawal to Exchange', () => {
    it('retrieves a deposit address from the exchange', async () => {});

    it('initiates withdrawal with tracking metadata', async () => {});
  });

  describe('Phase 3: Deposit Confirmation', () => {
    it('polls until the deposit reaches the expected confirmation state', async () => {});
  });

  describe('Phase 4: Campaign Join', () => {
    it('attempts to join a matching HuFi campaign when one exists', async () => {});
  });

  describe('Phase 5: Strategy Start', () => {
    it('starts market making from the strategy snapshot', async () => {});

    it('places initial sandbox orders through CCXT', async () => {});
  });

  describe('Phase 6: Stop and Cleanup', () => {
    it('cancels open orders during stop', async () => {});

    it('releases exchange resources during teardown', async () => {});
  });
});
```

### Required Environment Variables

```bash
CCXT_SANDBOX_EXCHANGE=okx
CCXT_SANDBOX_API_KEY=your_api_key
CCXT_SANDBOX_SECRET=your_api_secret
HUFI_CAMPAIGN_LAUNCHER_URL=https://campaign-launcher.example.com
HUFI_RECORDING_ORACLE_URL=https://recording-oracle.example.com
WEB3_PRIVATE_KEY=0x...
TEST_PAIR=BTC/USDT
TEST_BASE_AMOUNT=0.001
TEST_QUOTE_AMOUNT=100
```

### Implementation Notes

- Use unique IDs per test run.
- Verify persisted state transitions at each phase.
- Clean up created orders and exchange resources in teardown.
- Use an extended timeout for lifecycle tests.

## Shared Test Infrastructure

### Environment Helper

```typescript
export function getSystemTestSkipReason(requiredVars: string[]): string | null {
  const missing = requiredVars.filter((name) => !process.env[name]?.trim());
  return missing.length > 0 ? `missing env vars: ${missing.join(', ')}` : null;
}
```

### Test Database Helper

```typescript
export async function createTestDatabaseModule(entities: any[]) {
  return TypeOrmModule.forRoot({
    type: 'sqlite',
    database: ':memory:',
    dropSchema: true,
    entities,
    synchronize: true,
  });
}
```

### Mock Helper Boundary

```typescript
export function createMockExchangeInitService(exchange: any) {
  return {
    provide: ExchangeInitService,
    useValue: { getExchange: jest.fn().mockReturnValue(exchange) },
  };
}
```

Use mocks only for dependencies outside the suite boundary. If mocks replace the primary behavior under test, the suite is no longer a system test and should be renamed accordingly.

## Implementation Priority

| Priority | Suite | Complexity | Main Dependency |
| --- | --- | --- | --- |
| P1 | Deposit tracking | Medium | CCXT sandbox deposit history support |
| P2 | HuFi campaign | Medium | Stable HuFi API or contract mocks |
| P3 | Market-making lifecycle | High | Sandbox exchange plus current runtime orchestration |

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| HuFi API instability | Add retries only where safe, otherwise use explicit HTTP mocks |
| Long-running tests | Keep them opt-in and set suite-specific timeouts |
| State leakage across runs | Use isolated test data and mandatory cleanup |
| Sandbox balance limitations | Check prerequisites up front and skip explicitly when unavailable |

## Acceptance Criteria

- All suites run through `bun run test:system`
- Missing environment variables produce explicit skips
- Created sandbox orders and transient test data are cleaned up
- The docs list all required environment variables
- No suite claims unsupported full end-to-end fill-ingestion coverage

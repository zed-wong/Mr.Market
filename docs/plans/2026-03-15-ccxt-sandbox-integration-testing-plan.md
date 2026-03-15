# CCXT Sandbox Integration Testing and Execution Engine Validation Plan

## Overview

This plan implements integration testing capabilities for the Mr.Market market-making system's Execution Engine with CCXT exchange testnet/sandbox environments. By connecting to real exchange test networks, we can verify the correctness of core market-making flows without using real funds.

## Background and Goals

### Current State

- Project has 36 unit test files using Jest mocks to simulate exchanges
- `ExchangeInitService` supports multiple exchanges (OKX, Binance, Alpaca, Gate, MEXC, etc.)
- Lacks integration tests with real exchange APIs

### Goals

1. **Phase 1**: Establish CCXT testnet/sandbox infrastructure
2. **Phase 2**: Implement Execution Engine core integration tests
3. **Phase 3**: Expand market-making flow validation

## Solution Details

### Phase 1: CCXT Sandbox Infrastructure

#### 1.1 Configuration Support

Add testnet mode to `ExchangeInitService`:

```typescript
// New configuration interface
interface ExchangeConfig {
  name: string;
  accounts: Array<{
    label: string;
    apiKey: string;
    secret: string;
  }>;
  class: any;
  testnet?: boolean;  // New
}
```

Environment variables:
```bash
# .env configuration
EXCHANGE_TESTNET=true
OKX_TESTNET_API_KEY=xxx
OKX_TESTNET_SECRET=xxx
BINANCE_TESTNET_API_KEY=xxx
BINANCE_TESTNET_SECRET=xxx
```

#### 1.2 Supported Exchanges

| Exchange | Parameter | Test Network |
|----------|-----------|--------------|
| Binance | `testnet: true` | binance-testnet |
| OKX | `testnet: true` | okx testnet |
| Gate | `testnet: true` | gate testnet |
| Bybit | `testnet: true` | bybit testnet |
| KuCoin | `testnet: true` | kucoin testnet |
| Alpaca | `paper: true` | alpaca paper trading |

#### 1.3 Test Base Class

Create integration test base class `test/helpers/sandbox-exchange.helper.ts`:

```typescript
// Provides test exchange instances and cleanup functions
class SandboxExchangeHelper {
  async setupExchange(name: string): Promise<ccxt.Exchange>
  async cleanup(): Promise<void>
  async getTestnetBalance(): Promise<Record<string, number>>
}
```

### Phase 2: Execution Engine Integration Tests

#### 2.1 ExchangeConnectorAdapter Integration Tests

Test file: `server/src/modules/market-making/execution/exchange-connector-adapter.integration.spec.ts`

```typescript
describe('ExchangeConnectorAdapterService (Integration)', () => {
  // Order lifecycle tests
  it('places, cancels, and fetches limit orders', async () => {
    // 1. Place order
    // 2. Verify order status
    // 3. Cancel order
    // 4. Verify cancellation success
  });

  // Order book fetch tests
  it('fetches order book successfully', async () => {
    // Fetch BTC/USDT order book
  });

  // Rate limiting tests
  it('respects rate limiting between requests', async () => {
    // Verify request intervals
  });
});
```

#### 2.2 Tick → Intent → Exchange Execution Flow

Test file: `server/src/modules/market-making/strategy/execution/execution-flow.integration.spec.ts`

Validate complete flow:
1. Tick triggers strategy calculation
2. Generate Intents (place/cancel orders)
3. Intent Worker executes
4. ExchangeConnectorAdapter calls real API
5. Verify order status updates

#### 2.3 Fill Routing Integration

Test file: `server/src/modules/market-making/execution/fill-routing.integration.spec.ts`

Validate:
1. Use real `clientOrderId` format `{orderId}:{seq}`
2. Fill events route to correct session
3. ExchangeOrderMapping fallback works correctly

### Phase 3: Market-Making Core Flow Validation

#### 3.1 Multi-Order Concurrency

Validate scheduling and execution of multiple orders on the same `exchange:pair`.

#### 3.2 Pause/Stop/Resume

Test complete flow of `PauseWithdrawOrchestratorService`:
1. `stopStrategyForUser`
2. `cancelUntilDrained`
3. `unlockFunds` → `debitWithdrawal`
4. Failure rollback

#### 3.3 Balance Tracking

Validate consistency between `BalanceLedgerService` and real exchange balances.

## Test Layering Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Unit Tests (Jest Mock)                                    │
│  - Fast execution, no external dependencies              │
│  - Validate business logic correctness                   │
│  - Existing 36 spec files                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Integration Tests (CCXT Testnet)                         │
│  - Real API calls                                         │
│  - Validate exchange communication                        │
│  - New 3-5 integration spec files                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  E2E Tests (Optional)                                     │
│  - Complete market-making lifecycle                       │
│  - Requires testnet funds                                │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Infrastructure

- [ ] Add testnet configuration support to `ExchangeInitService`
- [ ] Add `exchange.testnet` config to `configuration.ts`
- [ ] Create test environment variable template `.env.testnet.example`
- [ ] Create `SandboxExchangeHelper` test base class

### Step 2: Connector Integration Tests

- [ ] Create `exchange-connector-adapter.integration.spec.ts`
- [ ] Test order lifecycle (place → fetch → cancel)
- [ ] Test rate limiting mechanism
- [ ] Add multi-exchange switching tests

### Phase 3: Execution Flow Tests

- [ ] Create `execution-flow.integration.spec.ts`
- [ ] Test tick → intent → exchange complete flow
- [ ] Test fill routing integration

### Phase 4: Core Flow Validation

- [ ] Test multi-order concurrency
- [ ] Test pause/stop/resume
- [ ] Test balance tracking
- [ ] Update `docs/tests/MARKET_MAKING.md`

## Files to Modify

| File | Change |
|------|--------|
| `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts` | Add testnet support |
| `server/src/config/configuration.ts` | Add testnet config |
| `server/.env.testnet.example` | New testnet config template |
| `server/test/helpers/sandbox-exchange.helper.ts` | New test base class |
| `server/src/modules/market-making/execution/exchange-connector-adapter.integration.spec.ts` | New integration test |
| `server/src/modules/market-making/strategy/execution/execution-flow.integration.spec.ts` | New integration test |
| `server/src/modules/market-making/execution/fill-routing.integration.spec.ts` | New integration test |
| `docs/tests/MARKET_MAKING.md` | Update test docs |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Testnet API instability | Use multiple exchanges, fallback strategy |
| Testnet balance exhaustion | Automated balance check + alerts |
| Network latency causing test timeouts | Adjust Jest timeout settings |
| Exchange API changes | Lock CCXT dependency version |

## Acceptance Criteria

### Phase 1 Complete

- [ ] Testnet mode can be enabled via environment variable
- [ ] At least one exchange (OKX/Binance) can connect to testnet

### Phase 2 Complete

- [ ] `ExchangeConnectorAdapter` integration tests pass
- [ ] Order lifecycle validated on testnet

### Phase 3 Complete

- [ ] Tick → Intent → Exchange flow validated
- [ ] Fill routing works in real environment

---

**Created**: 2026-03-15
**Status**: Planning
**Priority**: High

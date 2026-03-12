# Complete Market Making Cycle Implementation Design

**Date**: 2026-03-12
**Status**: Design Complete, Pending Implementation
**Estimated Time**: 3-7 days

---

## 1. Project Goal

Complete the full market-making business cycle:

```
User Payment (Mixin) → Withdraw to Exchange → Deposit Tracking → HuFi Campaign Join → Market Making Execution → Metrics Tracking
```

**Verification Method**: Small amount real fund testing

---

## 2. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Mr.Market Complete Market Making Flow                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                           │
│  │ User Payment │ ← Mixin Invoice                                           │
│  │ pending_pay  │                                                           │
│  └──────┬───────┘                                                           │
│         ↓                                                                   │
│  ┌──────────────┐     ┌─────────────────────────────────────┐               │
│  │ Phase 1      │     │ 1. Get exchange deposit address     │               │
│  │ Withdraw to  │────→│    (CCXT)                           │               │
│  │ Exchange     │     │ 2. Mixin withdraw to exchange       │               │
│  │ withdrawal   │     │ 3. Record tx_hash                   │               │
│  └──────┬───────┘     └─────────────────────────────────────┘               │
│         ↓                                                                   │
│  ┌──────────────┐     ┌─────────────────────────────────────┐               │
│  │ Phase 2      │     │ Triple Verification:                │               │
│  │ Deposit      │────→│ 1. Mixin withdrawal record          │               │
│  │ Tracking     │     │ 2. On-chain transaction record      │               │
│  └──────┬───────┘     │ 3. Exchange Deposit History (CCXT)  │               │
│         ↓             └─────────────────────────────────────┘               │
│  ┌──────────────┐                                                           │
│  │ Phase 3      │     ┌─────────────────────────────────────┐               │
│  │ HuFi Join    │────→│ 1. Find matching Campaign           │               │
│  │ campaign     │     │ 2. Sign with local EVM private key  │               │
│  └──────┬───────┘     │ 3. Send join request to HuFi        │               │
│         ↓             │ 4. Record participation locally      │               │
│  ┌──────────────┐     └─────────────────────────────────────┘               │
│  │ Phase 4      │                                                           │
│  │ Market Making│ ←── ExchangePairExecutor (implemented)                    │
│  │ mm_running   │                                                           │
│  └──────┬───────┘                                                           │
│         ↓                                                                   │
│  ┌──────────────┐                                                           │
│  │ Metrics      │ ←── Order stats, volume, profit                           │
│  │ Tracking     │                                                           │
│  └──────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Order Status Flow

```
pending_payment          Waiting for user payment
        ↓ (payment complete)
withdrawal_pending       Withdrawal in progress (Phase 1)
        ↓ (Mixin withdrawal sent)
withdrawal_confirmed     Withdrawal on-chain
        ↓ (on-chain confirmed + exchange received)
deposit_confirmed        Deposit confirmed (Phase 2)
        ↓
campaign_joining         Joining Campaign (Phase 3, optional)
        ↓ (join success or no match)
mm_running               Market making running (Phase 4)
        ↓ (user triggers stop)
mm_stopping              Stopping
        ↓
withdrawal_to_user       Withdraw to user
        ↓
completed                Completed
```

**Error States**:
- `withdrawal_failed` - Withdrawal failed
- `deposit_timeout` - Deposit timeout
- `mm_paused` - Market making paused (consecutive errors)

---

## 4. Phase 1: Withdraw to Exchange

### 4.1 Current State
- Code exists but disabled (validation mode)
- Location: `market-making.processor.ts`

### 4.2 Changes

Enable real withdrawal logic:

```typescript
// market-making.processor.ts - processWithdrawToExchange()

async processWithdrawToExchange(job: Job) {
  const { orderId } = job.data;
  const order = await this.orderRepository.findOne(orderId);

  // Get exchange deposit address
  const depositAddress = await this.exchangeService.getDepositAddress(
    order.exchangeName,
    order.asset.symbol
  );

  // Execute Mixin withdrawal
  const withdrawal = await this.mixinService.createWithdrawal({
    address: depositAddress,
    amount: order.amount,
    asset_id: order.asset.mixinAssetId,
    trace_id: uuidv4() // idempotency key
  });

  // Update order status
  await this.orderRepository.update(orderId, {
    status: 'withdrawal_pending',
    withdrawalTxHash: withdrawal.transaction_hash,
    withdrawalTraceId: withdrawal.trace_id,
    depositAddress: depositAddress
  });

  // Trigger deposit tracking
  await this.depositTrackingQueue.add('track_deposit', { orderId });
}
```

### 4.3 Key Points
- Get exchange deposit address (CCXT `fetchDepositAddress`)
- Mixin withdrawal (idempotent, using trace_id)
- Store tx_hash for subsequent tracking
- Error handling: retry 3 times, refund on failure

---

## 5. Phase 2: Deposit Tracking

### 5.1 Current State
- Does not exist, needs to be created

### 5.2 Triple Verification Mechanism

```
┌─────────────────────────────────────────────────────────────────┐
│                     Triple Verification                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ Mixin Withdrawal Record                                     │
│     API: Mixin API /withdrawals/{traceId}                       │
│     Confirm: status === 'confirmed'                             │
│     Get: transaction_hash                                       │
│                                                                 │
│  2️⃣ On-chain Transaction Record                                 │
│     API: Block explorer / Chain node RPC                        │
│     Confirm: confirmations >= required (BTC:6, ETH:12, BSC:15)  │
│     Match: txHash === mixin.transaction_hash                    │
│                                                                 │
│  3️⃣ Exchange Deposit History                                    │
│     API: CCXT fetchDeposits                                     │
│     Confirm: status === 'ok'                                    │
│     Match: txId === txHash && amount === expectedAmount         │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│  All three pass → Deposit confirmed                             │
│                                                                 │
└─────────────────────────────────────��───────────────────────────┘
```

### 5.3 New Services

**DepositTrackingService**:

```typescript
// deposit-tracking.service.ts

interface DepositTrackingResult {
  mixinStatus: {
    confirmed: boolean;
    txHash: string;
    traceId: string;
  };
  onchainStatus: {
    confirmed: boolean;
    txHash: string;
    confirmations: number;
    requiredConfirmations: number;
  };
  exchangeStatus: {
    received: boolean;
    txId: string;
    amount: string;
  };
  fullyConfirmed: boolean;
}

@Injectable()
export class DepositTrackingService {
  // Check every 30 seconds
  @Cron('*/30 * * * * *')
  async checkPendingDeposits() {
    const orders = await this.orderRepository.find({
      where: { status: In(['withdrawal_pending', 'withdrawal_confirmed']) }
    });

    for (const order of orders) {
      const result = await this.trackDeposit(order);

      if (result.fullyConfirmed) {
        await this.orderRepository.update(order.id, {
          status: 'deposit_confirmed',
          depositConfirmedAt: new Date()
        });
        // Trigger HuFi join
        await this.campaignQueue.add('join_campaign', { orderId: order.id });
      } else {
        // Update tracking status
        await this.orderRepository.update(order.id, {
          depositTrackingStatus: JSON.stringify(result)
        });
      }
    }
  }

  async trackDeposit(order: MarketMakingOrder): Promise<DepositTrackingResult> {
    const result = this.initEmptyResult();

    // 1. Check Mixin withdrawal record
    result.mixinStatus = await this.checkMixinWithdrawal(order.withdrawalTraceId);

    if (!result.mixinStatus.confirmed) {
      return result;
    }

    // 2. Check on-chain transaction record
    result.onchainStatus = await this.chainTrackerService.getTransaction(
      order.asset.chain,
      result.mixinStatus.txHash
    );

    if (!result.onchainStatus.confirmed) {
      return result;
    }

    // 3. Check exchange Deposit History
    result.exchangeStatus = await this.checkExchangeDeposit(
      order.exchangeName,
      order.asset.symbol,
      result.mixinStatus.txHash,
      order.amount
    );

    result.fullyConfirmed =
      result.mixinStatus.confirmed &&
      result.onchainStatus.confirmed &&
      result.exchangeStatus.received;

    return result;
  }
}
```

**ChainTrackerService** (on-chain tracking):

```typescript
// chain-tracker.service.ts

@Injectable()
export class ChainTrackerService {
  private readonly requiredConfirmations: Record<string, number> = {
    'bitcoin': 6,
    'ethereum': 12,
    'bsc': 15,
    'polygon': 20,
    'arbitrum': 12
  };

  async getTransaction(chain: string, txHash: string): Promise<OnchainStatus> {
    const provider = this.getProvider(chain);

    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return {
        confirmed: false,
        txHash,
        confirmations: 0,
        requiredConfirmations: this.requiredConfirmations[chain] || 12
      };
    }

    const required = this.requiredConfirmations[chain] || 12;

    return {
      confirmed: tx.confirmations >= required,
      txHash,
      confirmations: tx.confirmations,
      requiredConfirmations: required
    };
  }

  private getProvider(chain: string) {
    // Return appropriate provider based on chain type
    // Can be ethers provider, bitcoin RPC, or third-party API
  }
}
```

### 5.4 Timeout Handling

```typescript
// Alert if not confirmed after 1 hour
if (order.withdrawalAt && Date.now() - order.withdrawalAt.getTime() > 3600000) {
  await this.alertService.sendAlert({
    type: 'deposit_timeout',
    orderId: order.id,
    trackingStatus: result
  });

  await this.orderRepository.update(order.id, {
    status: 'deposit_timeout'
  });
}
```

---

## 6. Phase 3: HuFi Campaign Join

### 6.1 Current State
- `CampaignService` has HuFi API client
- `join_campaign` flow only creates local records, does not actually join

### 6.2 Changes

**Separation of Local Record vs Actual Join**:
- `CampaignParticipation` entity: Only records participation info, does not trigger operations
- `HuFiIntegrationService`: Responsible for actually calling HuFi API to join

**HuFiIntegrationService**:

```typescript
// hufi-integration.service.ts

interface JoinCampaignResult {
  success: boolean;
  campaignId?: string;
  txHash?: string;
  reason?: string;
  error?: string;
}

@Injectable()
export class HuFiIntegrationService {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly systemWalletService: SystemWalletService,
    private readonly participationRepository: Repository<CampaignParticipation>
  ) {}

  async joinCampaign(order: MarketMakingOrder): Promise<JoinCampaignResult> {
    // 1. Find matching Campaign
    const campaigns = await this.campaignService.getCampaigns();
    const matchingCampaign = this.findMatchingCampaign(campaigns, order);

    if (!matchingCampaign) {
      this.logger.log(`No matching campaign for order ${order.id}`);
      return { success: false, reason: 'no_matching_campaign' };
    }

    // 2. Get system EVM wallet
    const systemWallet = await this.systemWalletService.getWallet();

    // 3. Build signature data
    const signData = {
      campaignId: matchingCampaign.id,
      address: systemWallet.address,
      pair: order.pair,
      exchange: order.exchange,
      amount: order.amount,
      timestamp: Date.now()
    };

    // 4. Sign with EVM private key
    const signature = await this.systemWalletService.signMessage(
      systemWallet.privateKey,
      JSON.stringify(signData)
    );

    // 5. Call HuFi API to join
    try {
      const result = await this.campaignService.joinCampaignWithAuth({
        campaignId: matchingCampaign.id,
        address: systemWallet.address,
        signature,
        ...signData
      });

      // 6. Create local record (for recording only)
      await this.participationRepository.save({
        orderId: order.id,
        campaignId: matchingCampaign.id,
        hufiParticipationId: result.participationId,
        status: 'joined',
        joinedAt: new Date(),
        txHash: result.txHash
      });

      return {
        success: true,
        campaignId: matchingCampaign.id,
        txHash: result.txHash
      };
    } catch (error) {
      this.logger.error(`HuFi join failed for order ${order.id}`, error);

      // Record failure, but don't block market making
      await this.participationRepository.save({
        orderId: order.id,
        campaignId: matchingCampaign.id,
        status: 'join_failed',
        error: error.message
      });

      return {
        success: false,
        reason: 'join_failed',
        error: error.message
      };
    }
  }

  private findMatchingCampaign(campaigns: Campaign[], order: MarketMakingOrder): Campaign | null {
    return campaigns.find(c =>
      c.pair === order.pair &&
      c.exchange === order.exchange &&
      c.status === 'active' &&
      new Date(c.startTime) <= new Date() &&
      new Date(c.endTime) >= new Date()
    ) || null;
  }
}
```

**Integration into Flow**:

```typescript
// market-making.processor.ts - processJoinCampaign()

async processJoinCampaign(job: Job) {
  const { orderId } = job.data;
  const order = await this.orderRepository.findOne(orderId);

  // Call HuFi join service
  const result = await this.huFiIntegrationService.joinCampaign(order);

  // Regardless of success, trigger market making
  await this.startMmQueue.add('start_mm', { orderId });
}
```

### 6.3 Key Points
- Use local EVM private key for signing
- Join failure does not block market making
- Local record is for recording only

---

## 7. Phase 4: Market Making Execution

### 7.1 Current State
- `ExchangePairExecutor` implemented
- Strategy controllers implemented
- Order placement/cancellation via CCXT

### 7.2 Addition: Metrics Tracking

```typescript
// Add statistics in ExchangePairExecutor

interface OrderMetrics {
  placedCount: number;        // Number of orders placed
  filledCount: number;        // Number of fills
  cancelledCount: number;     // Number of cancellations
  failedCount: number;        // Number of failures
  totalVolume: BigNumber;     // Total volume
  totalProfit: BigNumber;     // Total profit
  avgSpread: BigNumber;       // Average spread
}

// Extend StrategySession
class StrategySession {
  metrics: OrderMetrics = {
    placedCount: 0,
    filledCount: 0,
    cancelledCount: 0,
    failedCount: 0,
    totalVolume: ZERO,
    totalProfit: ZERO,
    avgSpread: ZERO
  };

  onFill(fill: FillEvent) {
    this.metrics.filledCount++;
    this.metrics.totalVolume = this.metrics.totalVolume.plus(fill.amount);
    // Calculate profit...
  }
}

// Periodic persistence
@Cron('*/10 * * * *')
async persistMetrics() {
  for (const executor of this.executorRegistry.getActiveExecutors()) {
    for (const session of executor.getActiveSessions()) {
      await this.orderMetricsRepository.upsert({
        orderId: session.orderId,
        ...session.metrics,
        updatedAt: new Date()
      });
    }
  }
}
```

---

## 8. Error Handling Strategy

| Phase | Error Type | Handling | Status Change |
|-------|------------|----------|---------------|
| Phase 1 | Get deposit address failed | Retry 3 times | Keep current status |
| Phase 1 | Mixin withdrawal failed | Retry 3 times, refund on failure | `withdrawal_failed` → refund |
| Phase 2 | Deposit timeout (>1h) | Alert + manual intervention | `deposit_timeout` |
| Phase 3 | No matching Campaign | Skip, continue market making | Go directly to Phase 4 |
| Phase 3 | HuFi join failed | Log, continue market making | Record failure, continue |
| Phase 4 | Order placement failed | Retry, pause on consecutive failures | `mm_paused` |
| Phase 4 | API rate limit | Wait and retry | Keep `mm_running` |

---

## 9. Testing Plan

| Phase | Test Item | Environment | Verification Point |
|-------|-----------|-------------|-------------------|
| Phase 1 | Mixin withdrawal | Mixin sandbox | tx_hash returned correctly |
| Phase 1 | Exchange address retrieval | Exchange testnet | Address format correct |
| Phase 2 | Mixin withdrawal query | Mixin sandbox | Status returned correctly |
| Phase 2 | On-chain transaction query | Mainnet (small amount) | Confirmations correct |
| Phase 2 | Exchange Deposit query | Exchange testnet | Matching logic correct |
| Phase 3 | Campaign matching | Mock data | Matching logic correct |
| Phase 3 | EVM signing | Unit test | Signature format correct |
| Phase 3 | HuFi API call | HuFi testnet | Join successful |
| Phase 4 | Order placement/cancellation | Exchange testnet | Operations correct |
| E2E | Complete flow | Small real funds | Full flow passes |

---

## 10. File Change List

### New Files
- `server/src/modules/market-making/deposit/deposit-tracking.service.ts`
- `server/src/modules/market-making/deposit/chain-tracker.service.ts`
- `server/src/modules/market-making/hufi/hufi-integration.service.ts`
- `server/src/modules/market-making/metrics/order-metrics.service.ts`

### Modified Files
- `server/src/modules/market-making/user-orders/market-making.processor.ts` - Enable withdrawal, integrate deposit tracking
- `server/src/modules/market-making/user-orders/user-orders.entity.ts` - Add tracking fields
- `server/src/modules/market-making/execution/exchange-pair-executor.ts` - Add statistics
- `server/src/modules/campaign/campaign.service.ts` - May need to adjust join API

---

## 11. Timeline

| Day | Task | Output |
|-----|------|--------|
| Day 1-2 | Phase 1 + Phase 2 | Withdraw to exchange + Deposit tracking |
| Day 2-3 | Phase 3 | HuFi integration + testing |
| Day 3-4 | Phase 4 addition | Metrics tracking |
| Day 4-5 | Integration testing | E2E flow verification |
| Day 5-7 | Real fund testing + fixes | Production ready |

---

## 12. Key Decisions

1. **Fund Flow**: Mixin → CEX (via Mixin withdrawal to exchange)
2. **Exchange Support**: CCXT generic interface
3. **HuFi Integration**: Synchronous integration, using local EVM private key signing
4. **Verification Method**: Small amount real fund testing

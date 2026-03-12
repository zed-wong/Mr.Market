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

## 2. Existing Codebase

### Existing Services (Do NOT recreate)
- `ExchangeApiKeyService` - `exchange-api-key.service.ts`
  - `getDepositAddress()`, `findFirstAPIKeyByExchange()`
- `CampaignService` - `campaign.service.ts`
  - `getCampaigns()`, `joinCampaignWithAuth(wallet, key, chainId, address)`
- `WithdrawalService` - `withdrawal.service.ts`
  - `executeWithdrawal(asset_id, destination, memo, amount, requestKey?)`
- `MarketMakingOrderProcessor` - `market-making.processor.ts`
  - Already has `@Process('withdraw_to_exchange')` and `@Process('join_campaign')`

### Existing State Definitions (`states.ts`)
```typescript
type MarketMakingStates =
  | 'payment_pending'
  | 'payment_incomplete'
  | 'payment_complete'
  | 'withdrawing'
  | 'withdrawal_confirmed'
  | 'deposit_confirming'
  | 'deposit_confirmed'
  | 'joining_campaign'
  | 'campaign_joined'
  | 'created'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'failed'
  | 'refunded'
  | 'deleted';
```

### Existing Payment State Structure (`payment-state.entity.ts`)
```typescript
// Dual-asset structure
baseAssetId, baseAssetAmount, baseAssetSnapshotId
quoteAssetId, quoteAssetAmount, quoteAssetSnapshotId
// Fees
baseFeeAssetId, baseFeeAssetAmount
quoteFeeAssetId, quoteFeeAssetAmount
```

---

## 3. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Mr.Market Complete Market Making Flow                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                           │
│  │ User Payment │ ← Mixin Invoice                                           │
│  │ payment_     │                                                           │
│  │ pending/     │                                                           │
│  │ complete     │                                                           │
│  └──────┬───────┘                                                           │
│         ↓                                                                   │
│  ┌──────────────┐     ┌─────────────────────────────────────┐               │
│  │ Phase 1      │     │ Supports single/dual asset:          │               │
│  │ Withdraw to  │────→│ 1. Get exchange deposit address     │               │
│  │ Exchange     │     │    (CCXT)                           │               │
│  │ withdrawing  │     │ 2. Mixin withdraw to exchange       │               │
│  └──────┬───────┘     │ 3. Record txHash per leg            │               │
│         ↓             └─────────────────────────────────────┘               │
│  ┌──────────────┐                                                           │
│  │ Phase 2      │     ┌─────────────────────────────────────┐               │
│  │ Deposit      │────→│ Triple verification (per leg):      │               │
│  │ Tracking     │     │ 1. Mixin withdrawal record          │               │
│  │ deposit_     │     │ 2. On-chain transaction record      │               │
│  │ confirming   │     │ 3. Exchange Deposit History (CCXT)  │               │
│  └──────┬───────┘     └─────────────────────────────────────┘               │
│         ↓                                                                   │
│  ┌──────────────┐                                                           │
│  │ Phase 3      │     ┌─────────────────────────────────────┐               │
│  │ HuFi Join    │────→│ 1. Match by symbol + exchangeName   │               │
│  │ joining_     │     │ 2. Call CampaignService             │               │
│  │ campaign     │     │    .joinCampaignWithAuth(...)       │               │
│  └──────┬───────┘     └─────────────────────────────────────┘               │
│         ↓                                                                   │
│  ┌──────────────┐                                                           │
│  │ Phase 4      │                                                           │
│  │ Market Making│ ←── ExchangePairExecutor (implemented)                    │
│  │ running      │                                                           │
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

## 4. Order State Flow

```
payment_pending          Waiting for user payment
        ↓
payment_incomplete       Partial payment (skipped for single asset)
        ↓
payment_complete         Payment complete
        ↓
withdrawing              Withdrawal in progress (Phase 1)
        ↓
withdrawal_confirmed     Withdrawal on-chain
        ↓
deposit_confirming       Waiting for exchange deposit (Phase 2)
        ↓
deposit_confirmed        Deposit confirmed
        ↓
joining_campaign         Joining Campaign (Phase 3, optional)
        ↓
campaign_joined          Campaign joined (or skipped if no match)
        ↓
created                  Ready to start market making
        ↓
running                  Market making running (Phase 4)
        ↓ (user triggers stop)
stopped                  Stopped
```

**Error States**:
- `failed` - Failed
- `refunded` - Refunded

---

## 5. Phase 1: Withdraw to Exchange

### 5.1 Current State
- Code exists but disabled (validation mode)
- Location: `market-making.processor.ts` `processWithdrawToExchange()`
- Method: `withdrawalService.executeWithdrawal()` (NOT createWithdrawal)

### 5.2 Changes

**Support Single/Dual Asset**:

```typescript
// market-making.processor.ts - processWithdrawToExchange()

async processWithdrawToExchange(job: Job) {
  const { orderId } = job.data;
  const order = await this.userOrdersService.findMarketMakingByOrderId(orderId);
  const paymentState = await this.paymentStateRepository.findOne({ where: { orderId } });

  const apiKey = await this.exchangeService.findFirstAPIKeyByExchange(order.exchangeName);
  const pairConfig = await this.getPairConfig(order.pair);

  // Determine if single asset order
  const isSingleAsset = !paymentState.quoteAssetId || paymentState.quoteAssetId === paymentState.baseAssetId;

  // Get deposit address for base
  const baseNetwork = await this.networkMappingService.getNetworkForAsset(
    paymentState.baseAssetId,
    pairConfig.base_symbol,
  );
  const baseDepositAddress = await this.exchangeService.getDepositAddress({
    exchange: order.exchangeName,
    apiKeyId: apiKey.key_id,
    symbol: pairConfig.base_symbol,
    network: baseNetwork,
  });

  // Execute base withdrawal
  const baseWithdrawal = await this.withdrawalService.executeWithdrawal(
    paymentState.baseAssetId,
    baseDepositAddress.address,
    baseDepositAddress.memo || `MM:${orderId}:base`,
    paymentState.baseAssetAmount,
    `${orderId}:base`,
  );

  // Handle quote for dual-asset orders
  let quoteWithdrawal = null;
  let quoteDepositAddress = null;
  if (!isSingleAsset) {
    const quoteNetwork = await this.networkMappingService.getNetworkForAsset(
      paymentState.quoteAssetId,
      pairConfig.quote_symbol,
    );
    quoteDepositAddress = await this.exchangeService.getDepositAddress({
      exchange: order.exchangeName,
      apiKeyId: apiKey.key_id,
      symbol: pairConfig.quote_symbol,
      network: quoteNetwork,
    });
    quoteWithdrawal = await this.withdrawalService.executeWithdrawal(
      paymentState.quoteAssetId,
      quoteDepositAddress.address,
      quoteDepositAddress.memo || `MM:${orderId}:quote`,
      paymentState.quoteAssetAmount,
      `${orderId}:quote`,
    );
  }

  // Update order with tracking info
  await this.marketMakingRepository.update(orderId, {
    state: 'withdrawing',
    baseWithdrawalTxHash: baseWithdrawal[0]?.transaction_hash,
    baseWithdrawalTraceId: `${orderId}:base`,
    baseDepositAddress: baseDepositAddress.address,
    baseDepositNetwork: baseNetwork,
    quoteWithdrawalTxHash: quoteWithdrawal?.[0]?.transaction_hash,
    quoteWithdrawalTraceId: isSingleAsset ? null : `${orderId}:quote`,
    quoteDepositAddress: quoteDepositAddress?.address,
    quoteDepositNetwork: isSingleAsset ? null : quoteNetwork,
    isSingleAssetOrder: isSingleAsset,
  });
}
```

---

## 6. Phase 2: Deposit Tracking

### 6.1 Trigger Method
Use `@Cron` polling to query orders in `deposit_confirming` state.

### 6.2 Triple Verification Mechanism (Per Leg)

```
┌─────────────────────────────────────────────────────────────────┐
│              Triple Verification (base and quote separately)     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ Mixin Withdrawal Record                                     │
│     Confirm: status is confirmed                                │
│     Get: transaction_hash                                       │
│                                                                 │
│  2️⃣ On-chain Transaction Record                                 │
│     Confirm: confirmations >= required                          │
│     BTC: 6, ETH: 12, BSC: 15                                    │
│                                                                 │
│  3️⃣ Exchange Deposit History                                    │
│     Confirm: status === 'ok'                                    │
│     Match: txId + amount                                        │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│  Both base + quote confirmed → Overall confirmed                │
│  Single asset order: Only verify base                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Entity Field Design

```typescript
// user-orders.entity.ts - New fields

// Withdrawal tracking
@Column({ nullable: true })
baseWithdrawalTxHash?: string;

@Column({ nullable: true })
baseWithdrawalTraceId?: string;

@Column({ nullable: true })
baseDepositAddress?: string;

@Column({ nullable: true })
baseDepositNetwork?: string;

@Column({ nullable: true })
quoteWithdrawalTxHash?: string;

@Column({ nullable: true })
quoteWithdrawalTraceId?: string;

@Column({ nullable: true })
quoteDepositAddress?: string;

@Column({ nullable: true })
quoteDepositNetwork?: string;

@Column({ default: false })
isSingleAssetOrder?: boolean;

// Deposit tracking status
@Column({ nullable: true })
baseDepositConfirmedAt?: Date;

@Column({ nullable: true })
quoteDepositConfirmedAt?: Date;

@Column('simple-json', { nullable: true })
depositTrackingStatus?: {
  base: {
    mixinConfirmed: boolean;
    onchainConfirmations: number;
    exchangeReceived: boolean;
  };
  quote?: {
    mixinConfirmed: boolean;
    onchainConfirmations: number;
    exchangeReceived: boolean;
  };
  allConfirmed: boolean;
};
```

### 6.4 DepositTrackingService

**Note**: Amounts (`baseAssetAmount`, `quoteAssetAmount`) are stored in `PaymentState` entity, NOT in `MarketMakingOrder`. Must join with PaymentState repository.

```typescript
// deposit-tracking.service.ts
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentState } from 'src/common/entities/orders/payment-state.entity';

@Injectable()
export class DepositTrackingService {
  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly orderRepository: Repository<MarketMakingOrder>,
    @InjectRepository(PaymentState)
    private readonly paymentStateRepository: Repository<PaymentState>,
    private readonly chainTracker: ChainTrackerService,
    @InjectQueue('market-making') private readonly marketMakingQueue: Queue,
  ) {}

  @Cron('*/30 * * * * *') // Every 30 seconds
  async checkPendingDeposits() {
    const orders = await this.orderRepository.find({
      where: { state: In(['withdrawing', 'withdrawal_confirmed', 'deposit_confirming']) },
    });

    for (const order of orders) {
      // IMPORTANT: Get amounts from PaymentState, not Order
      const paymentState = await this.paymentStateRepository.findOne({
        where: { orderId: order.orderId }
      });
      if (!paymentState) continue;

      const result = await this.trackDeposit(order, paymentState);

      // Update tracking status
      await this.orderRepository.update(order.orderId, {
        depositTrackingStatus: result,
      });

      // Check if all confirmed
      if (result.allConfirmed) {
        await this.orderRepository.update(order.orderId, {
          state: 'deposit_confirmed',
          baseDepositConfirmedAt: result.base.exchangeReceived ? new Date() : undefined,
          quoteDepositConfirmedAt: result.quote?.exchangeReceived ? new Date() : undefined,
        });

        // Trigger Campaign join
        await this.marketMakingQueue.add('join_campaign', { orderId: order.orderId });
      }

      // Timeout check
      await this.checkTimeout(order);
    }
  }

  async trackDeposit(order: MarketMakingOrder, paymentState: PaymentState): Promise<DepositTrackingResult> {
    const result: DepositTrackingResult = {
      base: { mixinConfirmed: false, onchainConfirmations: 0, exchangeReceived: false },
      allConfirmed: false,
    };

    // Verify base - use paymentState for amounts
    result.base = await this.verifyLeg(
      order.baseWithdrawalTraceId,
      order.baseWithdrawalTxHash,
      order.baseDepositAddress,
      order.baseDepositNetwork,
      paymentState.baseAssetAmount,  // From PaymentState, NOT order
      order.exchangeName,
    );

    // Verify quote for dual-asset
    if (!order.isSingleAssetOrder && order.quoteWithdrawalTraceId) {
      result.quote = await this.verifyLeg(
        order.quoteWithdrawalTraceId,
        order.quoteWithdrawalTxHash,
        order.quoteDepositAddress,
        order.quoteDepositNetwork,
        paymentState.quoteAssetAmount,  // From PaymentState, NOT order
        order.exchangeName,
      );
    }

    // Determine overall confirmation
    const baseConfirmed = result.base.mixinConfirmed && result.base.exchangeReceived;
    const quoteConfirmed = order.isSingleAssetOrder || (result.quote?.mixinConfirmed && result.quote?.exchangeReceived);
    result.allConfirmed = baseConfirmed && quoteConfirmed;

    return result;
  }
}
```

---

## 7. Phase 3: HuFi Campaign Join

### 7.1 Current State
- `CampaignService` has complete API
- `join_campaign` flow only creates local record, doesn't actually join

### 7.2 Campaign Matching Logic

**CampaignDataDto Actual Fields**:
```typescript
// campaign.dto.ts
chainId: number;
exchangeName: string;
symbol: string;        // NOT pair!
endBlock: number;      // Misleading name - actually Unix timestamp in seconds!
address: string;
status: string;
```

**Note**: Despite the name `endBlock`, this field is actually a Unix timestamp in seconds (not a blockchain block height). The campaign-sync.service.ts shows it's used as `endBlock * 1000` for Date comparison.

**Matching Logic**:
```typescript
private findMatchingCampaign(campaigns: CampaignDataDto[], order: MarketMakingOrder): CampaignDataDto | null {
  // Extract symbol from order.pair (e.g., "BTC/USDT" → "BTC")
  const baseSymbol = order.pair.split('/')[0];

  return campaigns.find(c =>
    c.symbol === baseSymbol &&
    c.exchangeName === order.exchangeName &&
    c.status !== 'Complete' &&
    c.endBlock * 1000 >= Date.now()  // endBlock is Unix seconds, multiply by 1000 for ms
  ) || null;
}
```

### 7.3 HuFiIntegrationService

**Config Keys**: Use existing `web3.private_key` config (defined in configuration.ts) to derive wallet address. Do NOT create new config keys.

```typescript
// hufi-integration.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { CampaignDataDto } from 'src/modules/campaign/campaign.dto';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Wallet } from 'ethers';

interface JoinCampaignResult {
  success: boolean;
  campaignAddress?: string;
  chainId?: number;
  reason?: string;
  error?: string;
}

@Injectable()
export class HuFiIntegrationService {
  private readonly logger = new CustomLogger(HuFiIntegrationService.name);

  constructor(
    private readonly campaignService: CampaignService,
    private readonly configService: ConfigService,
  ) {}

  async joinCampaign(order: MarketMakingOrder): Promise<JoinCampaignResult> {
    try {
      // 1. Get campaigns
      const campaigns = await this.campaignService.getCampaigns();
      const matchingCampaign = this.findMatchingCampaign(campaigns, order);

      if (!matchingCampaign) {
        return { success: false, reason: 'no_matching_campaign' };
      }

      // 2. Get system wallet - use existing web3.private_key config
      const privateKey = this.configService.get<string>('web3.private_key');
      if (!privateKey) {
        return { success: false, reason: 'wallet_not_configured' };
      }

      // Derive wallet address from private key
      const wallet = new Wallet(privateKey);
      const walletAddress = wallet.address;

      // 3. Call existing CampaignService.joinCampaignWithAuth
      // Signature: joinCampaignWithAuth(wallet_address, private_key, chain_id, campaign_address)
      await this.campaignService.joinCampaignWithAuth(
        walletAddress,
        privateKey,
        matchingCampaign.chainId,
        matchingCampaign.address,
      );

      return {
        success: true,
        campaignAddress: matchingCampaign.address,
        chainId: matchingCampaign.chainId,
      };
    } catch (error) {
      // Failure does not block market making
      this.logger.error(`HuFi join failed (non-blocking): ${error.message}`);
      return { success: false, reason: 'join_failed', error: error.message };
    }
  }

  private findMatchingCampaign(campaigns: CampaignDataDto[], order: MarketMakingOrder): CampaignDataDto | null {
    const baseSymbol = order.pair.split('/')[0];

    return campaigns.find(c =>
      c.symbol === baseSymbol &&
      c.exchangeName === order.exchangeName &&
      c.status !== 'Complete' &&
      c.endBlock * 1000 >= Date.now()  // endBlock is Unix seconds
    ) || null;
  }
}
```

---

## 8. Phase 4: Market Making Execution

### 8.1 Current State
- `ExchangePairExecutor` implemented
- Strategy controllers implemented
- Order placement/cancellation via CCXT

### 8.2 Addition: Metrics Tracking

```typescript
interface OrderMetrics {
  placedCount: number;
  filledCount: number;
  cancelledCount: number;
  failedCount: number;
  totalVolume: string;
  totalProfit: string;
}
```

---

## 9. Error Handling Strategy

| Phase | Error Type | Handling | State Change |
|-------|------------|----------|--------------|
| Phase 1 | Get deposit address failed | Retry 3 times | Keep `withdrawing` |
| Phase 1 | Mixin withdrawal failed | Retry 3 times, refund on failure | `failed` → refund |
| Phase 2 | Deposit timeout (>1h) | Alert + manual intervention | `failed` |
| Phase 3 | No matching Campaign | Skip, continue market making | Go directly to `created` |
| Phase 3 | HuFi join failed | Log, continue market making | Continue |
| Phase 4 | Order placement failed | Retry, pause on consecutive failures | `paused` |

---

## 10. File Change List

### New Files
- `server/src/modules/market-making/deposit/deposit.module.ts`
- `server/src/modules/market-making/deposit/deposit-tracking.service.ts`
- `server/src/modules/market-making/deposit/deposit-tracking.service.spec.ts`
- `server/src/modules/market-making/deposit/chain-tracker.service.ts`
- `server/src/modules/market-making/deposit/chain-tracker.service.spec.ts`
- `server/src/modules/market-making/hufi/hufi.module.ts`
- `server/src/modules/market-making/hufi/hufi-integration.service.ts`
- `server/src/modules/market-making/hufi/hufi-integration.service.spec.ts`
- `server/src/modules/market-making/metrics/order-metrics.service.ts`

### Modified Files
- `server/src/common/entities/orders/user-orders.entity.ts` - Add dual-asset tracking fields
- `server/src/modules/market-making/user-orders/market-making.processor.ts` - Enable withdrawal, integrate deposit tracking
- `server/src/modules/market-making/user-orders/user-orders.module.ts` - Import new modules

---

## 11. Key Decisions

1. **Asset Support**: Support both single and dual asset orders
2. **State Names**: Use existing `withdrawing`, `deposit_confirming`, `joining_campaign`, `running`
3. **Trigger Method**: Cron polling for orders in `deposit_confirming` state
4. **Campaign Matching**: Use `symbol` + `exchangeName` + `endBlock`
5. **Method Name**: `executeWithdrawal` (NOT createWithdrawal)

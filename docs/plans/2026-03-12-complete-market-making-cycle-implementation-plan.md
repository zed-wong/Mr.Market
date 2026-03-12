# Complete Market Making Cycle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the full market-making business cycle from user payment to market making execution with metrics tracking

**Architecture:** Intent-driven order flow with triple verification for deposit tracking. Supports single and dual asset orders.
**Tech Stack:** NestJS, CCXT, Bull Queue, Mixin SDK, ethers

**Related Design Doc:** `docs/plans/2026-03-12-complete-market-making-cycle-design.en.md`

---

## Prerequisites

### Existing Services (Do NOT recreate)
- `ExchangeApiKeyService` - `server/src/modules/market-making/exchange-api-key/exchange-api-key.service.ts`
  - Has `getDepositAddress()`, `findFirstAPIKeyByExchange()`
- `CampaignService` - `server/src/modules/campaign/campaign.service.ts`
  - Has `getCampaigns()`, `joinCampaignWithAuth(wallet, key, chainId, address)`
- `WithdrawalService` - `server/src/modules/mixin/withdrawal/withdrawal.service.ts`
  - Has `executeWithdrawal(asset_id, destination, memo, amount, requestKey?)`
- `MarketMakingOrderProcessor` - `server/src/modules/market-making/user-orders/market-making.processor.ts`
  - Already has `@Process('withdraw_to_exchange')` and `@Process('join_campaign')` handlers

### Existing State Definitions (`states.ts`)
```typescript
type MarketMakingStates =
  | 'payment_pending' | 'payment_incomplete' | 'payment_complete'
  | 'withdrawing' | 'withdrawal_confirmed'
  | 'deposit_confirming' | 'deposit_confirmed'
  | 'joining_campaign' | 'campaign_joined'
  | 'created' | 'running' | 'paused' | 'stopped'
  | 'failed' | 'refunded' | 'deleted';
```

### Required Config
- System wallet: 使用现有 `web3.private_key`（从私钥派生地址）
- Chain RPC URLs: 使用现有 `web3.network.mainnet.rpc_url`, `web3.network.bsc.rpc_url`

---

## Chunk 1: Entity & Database Updates

### Task 1: Add dual-asset tracking fields to MarketMakingOrder

**Files:**
- Modify: `server/src/common/entities/orders/user-orders.entity.ts`

- [ ] **Step 1: Add tracking fields to MarketMakingOrder class**

```typescript
// user-orders.entity.ts - Add to MarketMakingOrder class

// === Withdrawal Tracking (dual-asset) ===
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

// === Deposit Tracking Status ===
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

- [ ] **Step 2: Run migration**

Run: `cd server && bun run migration:generate -- -n AddDualAssetDepositTrackingFields`
Expected: Migration file created

- [ ] **Step 3: Run migration**

Run: `cd server && bun run migration:run`
Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add server/src/common/entities/orders/user-orders.entity.ts server/src/migrations/
git commit -m "feat(entity): add dual-asset deposit tracking fields"
```

---

## Chunk 2: Deposit Tracking Service

### Task 2: Create DepositModule with tracking services

**Files:**
- Create: `server/src/modules/market-making/deposit/deposit.module.ts`
- Create: `server/src/modules/market-making/deposit/chain-tracker.service.ts`
- Create: `server/src/modules/market-making/deposit/deposit-tracking.service.ts`
- Create: `server/src/modules/market-making/deposit/deposit-tracking.service.spec.ts`

- [ ] **Step 1: Create ChainTrackerService**

```typescript
// chain-tracker.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

export interface OnchainStatus {
  confirmed: boolean;
  txHash: string;
  confirmations: number;
  requiredConfirmations: number;
}

@Injectable()
export class ChainTrackerService {
  // 使用现有配置键名 (configuration.ts -> web3.network.*)
  private readonly chainConfigs: Record<string, { rpcUrl: string; requiredConfirmations: number }>;

  constructor(private readonly configService: ConfigService) {
    this.chainConfigs = {
      ethereum: {
        // 配置键名: web3.network.mainnet.rpc_url
        rpcUrl: this.configService.get('web3.network.mainnet.rpc_url') || '',
        requiredConfirmations: 12,
      },
      bsc: {
        // 配置键名: web3.network.bsc.rpc_url
        rpcUrl: this.configService.get('web3.network.bsc.rpc_url') || '',
        requiredConfirmations: 15,
      },
      polygon: {
        // 配置键名: web3.network.polygon.rpc_url
        rpcUrl: this.configService.get('web3.network.polygon.rpc_url') || '',
        requiredConfirmations: 20,
      },
    };
  }

  async getTransaction(chain: string, txHash: string): Promise<OnchainStatus> {
    const config = this.chainConfigs[chain];
    if (!config || !config.rpcUrl) {
      throw new Error(`Unsupported or unconfigured chain: ${chain}`);
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { confirmed: false, txHash, confirmations: 0, requiredConfirmations: config.requiredConfirmations };
    }

    const latestBlock = await provider.getBlockNumber();
    const confirmations = latestBlock - receipt.blockNumber;

    return {
      confirmed: confirmations >= config.requiredConfirmations,
      txHash,
      confirmations,
      requiredConfirmations: config.requiredConfirmations,
    };
  }
}
```

- [ ] **Step 2: Create DepositTrackingService with Cron**

```typescript
// deposit-tracking.service.ts
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bull';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { Repository, In } from 'typeorm';
import { ChainTrackerService } from './chain-tracker.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

interface LegTrackingResult {
  mixinConfirmed: boolean;
  onchainConfirmations: number;
  exchangeReceived: boolean;
}

interface DepositTrackingResult {
  base: LegTrackingResult;
  quote?: LegTrackingResult;
  allConfirmed: boolean;
}

@Injectable()
export class DepositTrackingService {
  private readonly logger = new CustomLogger(DepositTrackingService.name);

  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly orderRepository: Repository<MarketMakingOrder>,
    private readonly chainTracker: ChainTrackerService,
    @InjectQueue('market-making') private readonly marketMakingQueue: Queue,
  ) {}

  @Cron('*/30 * * * * *') // Every 30 seconds
  async checkPendingDeposits() {
    const orders = await this.orderRepository.find({
      where: { state: In(['withdrawing', 'withdrawal_confirmed', 'deposit_confirming']) },
    });

    for (const order of orders) {
      try {
        const result = await this.trackDeposit(order);

        await this.orderRepository.update(order.orderId, {
          depositTrackingStatus: result,
        });

        if (result.allConfirmed) {
          await this.orderRepository.update(order.orderId, {
            state: 'deposit_confirmed',
            baseDepositConfirmedAt: result.base.exchangeReceived ? new Date() : undefined,
            quoteDepositConfirmedAt: result.quote?.exchangeReceived ? new Date() : undefined,
          });

          await this.marketMakingQueue.add('join_campaign', { orderId: order.orderId });
        }
      } catch (error) {
        this.logger.error(`Error tracking deposit for order ${order.orderId}: ${error.message}`);
      }
    }
  }

  async trackDeposit(order: MarketMakingOrder): Promise<DepositTrackingResult> {
    // Implementation: triple verification per leg
    // 1. Mixin withdrawal status
    // 2. On-chain confirmations
    // 3. Exchange deposit received
    // ...
  }
}
```

- [ ] **Step 3: Create DepositModule**

```typescript
// deposit.module.ts
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { DepositTrackingService } from './deposit-tracking.service';
import { ChainTrackerService } from './chain-tracker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketMakingOrder]),
    BullModule.registerQueue({ name: 'market-making' }),
  ],
  providers: [DepositTrackingService, ChainTrackerService],
  exports: [DepositTrackingService, ChainTrackerService],
})
export class DepositModule {}
```

- [ ] **Step 4: Write unit tests**

- [ ] **Step 5: Register DepositModule in UserOrdersModule**

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/market-making/deposit/
git commit -m "feat(deposit): add deposit tracking with triple verification"
```

---

## Chunk 3: Enable Withdrawal Flow

### Task 3: Enable real withdrawal in MarketMakingOrderProcessor

**Files:**
- Modify: `server/src/modules/market-making/user-orders/market-making.processor.ts`

- [ ] **Step 1: Update processWithdrawToExchange for dual-asset support**

Locate the withdrawal code block and update to support single/dual asset:

```typescript
// Determine if single asset order
const isSingleAsset = !paymentState.quoteAssetId ||
  paymentState.quoteAssetId === paymentState.baseAssetId;

// Execute base withdrawal
const baseWithdrawal = await this.withdrawalService.executeWithdrawal(
  paymentState.baseAssetId,
  baseDepositAddress.address,
  baseDepositAddress.memo || `MM:${orderId}:base`,
  paymentState.baseAssetAmount,
  `${orderId}:base`,
);

// Execute quote withdrawal (if dual-asset)
let quoteWithdrawal = null;
if (!isSingleAsset) {
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
```

- [ ] **Step 2: Remove validation mode refund logic**

Remove the `this.refundMarketMakingPendingOrder(...)` call at line 869-873.

- [ ] **Step 3: Run tests**

Run: `bun test server/src/modules/market-making/user-orders/market-making.processor.spec.ts`

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/market-making/user-orders/market-making.processor.ts
git commit -m "feat(withdrawal): enable real dual-asset withdrawal to exchange"
```

---

## Chunk 4: HuFi Integration

### Task 4: Implement HuFi Integration

**Files:**
- Create: `server/src/modules/market-making/hufi/hufi.module.ts`
- Create: `server/src/modules/market-making/hufi/hufi-integration.service.ts`
- Create: `server/src/modules/market-making/hufi/hufi-integration.service.spec.ts`

- [ ] **Step 1: Create HuFiIntegrationService**

```typescript
// hufi-integration.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { CampaignDataDto } from 'src/modules/campaign/campaign.dto';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

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
      const campaigns = await this.campaignService.getCampaigns();
      const matchingCampaign = this.findMatchingCampaign(campaigns, order);

      if (!matchingCampaign) {
        return { success: false, reason: 'no_matching_campaign' };
      }

      // 使用现有配置键名 (configuration.ts -> web3.private_key)
      const privateKey = this.configService.get<string>('web3.private_key');

      if (!privateKey) {
        return { success: false, reason: 'wallet_not_configured' };
      }

      // 从私钥派生钱包地址
      const { Wallet } = await import('ethers');
      const wallet = new Wallet(privateKey);
      const walletAddress = wallet.address;

      // Call existing CampaignService.joinCampaignWithAuth
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
      this.logger.error(`HuFi join failed (non-blocking): ${error.message}`);
      return { success: false, reason: 'join_failed', error: error.message };
    }
  }

  private findMatchingCampaign(campaigns: CampaignDataDto[], order: MarketMakingOrder): CampaignDataDto | null {
    // Extract base symbol from pair (e.g., "BTC/USDT" → "BTC")
    const baseSymbol = order.pair.split('/')[0];

    return campaigns.find(c =>
      c.symbol === baseSymbol &&
      c.exchangeName === order.exchangeName &&
      c.status !== 'Complete' &&
      c.endBlock * 1000 >= Date.now()
    ) || null;
  }
}
```

- [ ] **Step 2: Create HuFiModule**

```typescript
// hufi.module.ts
import { Module } from '@nestjs/common';
import { CampaignModule } from 'src/modules/campaign/campaign.module';
import { HuFiIntegrationService } from './hufi-integration.service';

@Module({
  imports: [CampaignModule],
  providers: [HuFiIntegrationService],
  exports: [HuFiIntegrationService],
})
export class HuFiModule {}
```

- [ ] **Step 3: Write unit tests**

- [ ] **Step 4: Register HuFiModule in UserOrdersModule**

- [ ] **Step 5: Integrate into processJoinCampaign**

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/market-making/hufi/
git commit -m "feat(hufi): integrate HuFi campaign join with EVM signing"
```

---

## Chunk 5: Metrics Tracking

### Task 5: Add order metrics tracking

**Files:**
- Create: `server/src/common/entities/market-making/order-metrics.entity.ts`
- Create: `server/src/modules/market-making/metrics/order-metrics.service.ts`

- [ ] **Step 1: Create OrderMetrics entity**

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Create OrderMetricsService**

- [ ] **Step 4: Integrate into ExchangePairExecutor**

- [ ] **Step 5: Commit**

---

## Chunk 6: Testing & Integration

### Task 6: E2E testing and final integration

- [ ] **Step 1: Write deposit tracking E2E test**

- [ ] **Step 2: Write HuFi integration E2E test**

- [ ] **Step 3: Run all tests**

- [ ] **Step 4: Manual test with real funds (optional)**

- [ ] **Step 5: Final commit**

---

## Summary

| Chunk | Tasks | Time |
|-------|-------|------|
| 1 | Entity updates | 0.5 day |
| 2 | Deposit tracking | 1 day |
| 3 | Enable withdrawal | 0.5 day |
| 4 | HuFi integration | 1 day |
| 5 | Metrics | 0.5 day |
| 6 | Testing | 0.5 day |
| **Total** | | **4 days** |

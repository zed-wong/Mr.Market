# Complete Market Making Cycle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the full market-making business cycle from user payment to market making execution with metrics tracking

**Architecture:** Intent-driven order flow with triple verification for deposit tracking. Phases are sequential: Withdrawal → Deposit Tracking → Campaign Join → Market Making Execution.
**Tech Stack:** NestJS, CCXT, Bull Queue, Mixin SDK, ethers

**Related Design Doc:** `docs/plans/2026-03-12-complete-market-making-cycle-design.en.md`

---

## Prerequisites

### Existing Services (Do NOT recreate)
- `ExchangeApiKeyService` - `server/src/modules/market-making/exchange-api-key/exchange-api-key.service.ts`
  - Has `getDepositAddress()`, `findFirstAPIKeyByExchange()`
- `CampaignService` - `server/src/modules/campaign/campaign.service.ts`
  - Has `getCampaigns()`, `joinCampaignWithAuth()`, `get_auth_nonce()`, `authenticate_web3_user()`, `join_campaign()`
- `WithdrawalService` - `server/src/modules/mixin/withdrawal/withdrawal.service.ts`
  - Has `createWithdrawal()`
- `MarketMakingOrderProcessor` - `server/src/modules/market-making/user-orders/market-making.processor.ts`
  - Already has `@Process('withdraw_to_exchange')` and `@Process('join_campaign')` handlers

### Required Config
- System wallet private key for HuFi signing (stored in config)
- Chain RPC URLs for on-chain tracking

### Queues (Already registered in user-orders.module.ts)
- `market-making` queue with BullModule.registerQueue

---

## Chunk 1: Entity & Database Updates

### Task 1: Add tracking fields to MarketMakingOrder entity

**Files:**
- Modify: `server/src/common/entities/orders/user-orders.entity.ts`

- [ ] **Step 1: Add tracking fields to MarketMakingOrder class**

```typescript
// user-orders.entity.ts - Add to MarketMakingOrder class

@Column({ nullable: true })
withdrawalTxHash?: string;

@Column({ nullable: true })
withdrawalTraceId?: string;

@Column({ nullable: true })
depositAddress?: string;

@Column({ nullable: true })
depositNetwork?: string;

@Column({ nullable: true })
depositConfirmedAt?: Date;

@Column('simple-json', { nullable: true })
depositTrackingStatus?: {
  mixinStatus: { confirmed: boolean; txHash: string; traceId: string };
  onchainStatus: { confirmed: boolean; txHash: string; confirmations: number; requiredConfirmations: number };
  exchangeStatus: { received: boolean; txId: string; amount: string };
  fullyConfirmed: boolean;
};
```

- [ ] **Step 2: Run migration**

Run: `cd server && bun run migration:generate -- -n AddDepositTrackingFields`
Expected: Migration file created in `server/src/migrations/`

- [ ] **Step 3: Run migration**

Run: `cd server && bun run migration:run`
Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add server/src/common/entities/orders/user-orders.entity.ts server/src/migrations/
git commit -m "feat(entity): add deposit tracking fields to MarketMakingOrder"
```

---

## Chunk 2: Deposit Tracking Service

### Task 2: Implement ChainTrackerService

**Files:**
- Create: `server/src/modules/market-making/deposit/chain-tracker.service.ts`
- Create: `server/src/modules/market-making/deposit/chain-tracker.service.spec.ts`

- [ ] **Step 1: Implement ChainTrackerService**

```typescript
// chain-tracker.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

interface OnchainStatus {
  confirmed: boolean;
  txHash: string;
  confirmations: number;
  requiredConfirmations: number;
}

@Injectable()
export class ChainTrackerService {
  private readonly chainConfigs: Record<string, { rpcUrl: string; requiredConfirmations: number }>;

  constructor(private readonly configService: ConfigService) {
    this.chainConfigs = {
      ethereum: {
        rpcUrl: this.configService.get('chains.ethereumRpcUrl') || '',
        requiredConfirmations: 12,
      },
      bsc: {
        rpcUrl: this.configService.get('chains.bscRpcUrl') || '',
        requiredConfirmations: 15,
      },
      bitcoin: {
        rpcUrl: '',
        requiredConfirmations: 6,
      },
    };
  }

  async getTransaction(chain: string, txHash: string): Promise<OnchainStatus> {
    const config = this.chainConfigs[chain];
    if (!config) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    if (chain === 'bitcoin') {
      return this.getBitcoinTransaction(txHash, config.requiredConfirmations);
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

  private async getBitcoinTransaction(txHash: string, required: number): Promise<OnchainStatus> {
    // Use block explorer API for Bitcoin
    // Implementation depends on chosen API (blockstream, blockchain.com, etc.)
    throw new Error('Bitcoin tracking not implemented');
  }
}
```

- [ ] **Step 2: Write unit tests**

```typescript
// chain-tracker.service.spec.ts
describe('ChainTrackerService', () => {
  it('should get transaction from ethereum chain', async () => {
    // ...
  });

  it('should throw for unsupported chain', async () => {
    // ...
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test server/src/modules/market-making/deposit/chain-tracker.service.spec.ts`
Expected: All tests pass

---

### Task 3: Implement DepositTrackingService

**Files:**
- Create: `server/src/modules/market-making/deposit/deposit.module.ts`
- Create: `server/src/modules/market-making/deposit/deposit-tracking.service.ts`
- Create: `server/src/modules/market-making/deposit/deposit-tracking.service.spec.ts`

- [ ] **Step 1: Create DepositModule**

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

- [ ] **Step 2: Implement DepositTrackingService**

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

interface DepositTrackingResult {
  mixinStatus: { confirmed: boolean; txHash: string; traceId: string };
  onchainStatus: { confirmed: boolean; txHash: string; confirmations: number; requiredConfirmations: number };
  exchangeStatus: { received: boolean; txId: string; amount: string };
  fullyConfirmed: boolean;
}

@Injectable()
export class DepositTrackingService {
  private readonly logger = new CustomLogger(DepositTrackingService.name);
  private readonly TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly orderRepository: Repository<MarketMakingOrder>,
    private readonly chainTracker: ChainTrackerService,
    @InjectQueue('market-making') private readonly marketMakingQueue: Queue,
  ) {}

  @Cron('*/30 * * * * *')
  async checkPendingDeposits() {
    const orders = await this.orderRepository.find({
      where: { state: In(['withdrawal_pending', 'withdrawal_confirmed']) },
    });

    for (const order of orders) {
      try {
        const result = await this.trackDeposit(order);

        if (result.fullyConfirmed) {
          await this.orderRepository.update(order.orderId, {
            state: 'deposit_confirmed',
            depositConfirmedAt: new Date(),
          });
          await this.marketMakingQueue.add('join_campaign', { orderId: order.orderId });
        } else {
          await this.orderRepository.update(order.orderId, {
            depositTrackingStatus: result,
          });
        }
      } catch (error) {
        this.logger.error(`Error tracking deposit for order ${order.orderId}: ${error.message}`);
      }
    }
  }

  async trackDeposit(order: MarketMakingOrder): Promise<DepositTrackingResult> {
    // Triple verification: Mixin → On-chain → Exchange
    // Implementation details...
  }
}
```

- [ ] **Step 3: Write unit tests**

- [ ] **Step 4: Register DepositModule in UserOrdersModule**

```typescript
// user-orders.module.ts
import { DepositModule } from '../deposit/deposit.module';

@Module({
  imports: [
    // ... existing imports
    DepositModule,
  ],
})
export class UserOrdersModule {}
```

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/market-making/deposit/
git commit -m "feat(deposit): add deposit tracking with triple verification"
```

---

## Chunk 3: Enable Withdrawal Flow

### Task 4: Enable real withdrawal in MarketMakingOrderProcessor

**Files:**
- Modify: `server/src/modules/market-making/user-orders/market-making.processor.ts`

- [ ] **Step 1: Remove validation mode refund logic**

Locate lines 865-878 where validation mode refunds are done, replace with real withdrawal logic.

- [ ] **Step 2: Enable real withdrawal code**

Uncomment and update the existing withdrawal code block in `processWithdrawToExchange()`.

- [ ] **Step 3: Update order with tracking info**

```typescript
await this.marketMakingRepository.update(orderId, {
  state: 'withdrawal_pending',
  withdrawalTxHash: baseWithdrawal.transaction_hash,
  withdrawalTraceId: baseWithdrawal.trace_id,
  depositAddress: baseDepositAddress.address,
  depositNetwork: baseNetwork,
});
```

- [ ] **Step 4: Run tests**

Run: `bun test server/src/modules/market-making/user-orders/market-making.processor.spec.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/market-making/user-orders/market-making.processor.ts
git commit -m "feat(withdrawal): enable real withdrawal to exchange"
```

---

## Chunk 4: HuFi Integration

### Task 5: Implement HuFi Integration

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
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

interface JoinCampaignResult {
  success: boolean;
  campaignId?: string;
  txHash?: string;
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

      const walletAddress = this.configService.get<string>('hufi.system_wallet_address');
      const privateKey = this.configService.get<string>('hufi.system_wallet_private_key');

      if (!walletAddress || !privateKey) {
        return { success: false, reason: 'wallet_not_configured' };
      }

      const result = await this.campaignService.joinCampaignWithAuth(
        walletAddress,
        privateKey,
        matchingCampaign.chainId,
        matchingCampaign.address,
      );

      return { success: true, campaignId: matchingCampaign.address, txHash: result?.txHash };
    } catch (error) {
      this.logger.error(`HuFi join failed (non-blocking): ${error.message}`);
      return { success: false, reason: 'join_failed', error: error.message };
    }
  }

  private findMatchingCampaign(campaigns: any[], order: MarketMakingOrder): any | null {
    return campaigns.find(c =>
      c.pair === order.pair &&
      c.exchange === order.exchangeName &&
      c.status !== 'Complete'
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

```typescript
// market-making.processor.ts
import { HuFiIntegrationService } from '../hufi/hufi-integration.service';

@Process('join_campaign')
async handleJoinCampaign(job: Job<{ orderId: string }>) {
  const { orderId } = job.data;
  const order = await this.userOrdersService.findMarketMakingByOrderId(orderId);

  const result = await this.huFiIntegrationService.joinCampaign(order);

  if (result.success) {
    this.logger.log(`HuFi campaign joined: ${result.campaignId}`);
  } else {
    this.logger.log(`HuFi join skipped: ${result.reason}`);
  }

  await (job.queue as any).add('start_mm', { orderId });
}
```

- [ ] **Step 6: Add config for system wallet**

```bash
# Add to .env or config
HUFI_SYSTEM_WALLET_ADDRESS=0x...
HUFI_SYSTEM_WALLET_PRIVATE_KEY=...
```

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/market-making/hufi/
git commit -m "feat(hufi): integrate HuFi campaign join with EVM signing"
```

---

## Chunk 5: Market Making Metrics Tracking

### Task 6: Add order metrics tracking

**Files:**
- Create: `server/src/common/entities/market-making/order-metrics.entity.ts`
- Create: `server/src/modules/market-making/metrics/order-metrics.service.ts`
- Create: `server/src/modules/market-making/metrics/order-metrics.service.spec.ts`
- Modify: `server/src/modules/market-making/strategy/execution/exchange-pair-executor.ts`

- [ ] **Step 1: Create OrderMetrics entity**

```typescript
// order-metrics.entity.ts
@Entity()
export class OrderMetrics {
  @PrimaryColumn()
  orderId: string;

  @Column({ default: 0 })
  placedCount: number;

  @Column({ default: 0 })
  filledCount: number;

  @Column({ default: 0 })
  cancelledCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ type: 'decimal', precision: 30, scale: 18, default: '0' })
  totalVolume: string;

  @Column({ type: 'decimal', precision: 30, scale: 18, default: '0' })
  totalProfit: string;

  @Column()
  updatedAt: Date;
}
```

- [ ] **Step 2: Run migration**

- [ ] **Step 3: Create OrderMetricsService with persistence cron**

- [ ] **Step 4: Integrate metrics into ExchangePairExecutor**

- [ ] **Step 5: Write unit tests**

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/market-making/metrics/
git commit -m "feat(metrics): add order metrics tracking for market making"
```

---

## Chunk 6: E2E Testing

### Task 7: Write E2E tests

**Files:**
- Create: `server/src/modules/market-making/deposit/deposit-tracking.e2e.spec.ts`
- Create: `server/src/modules/market-making/hufi/hufi-integration.e2e.spec.ts`

- [ ] **Step 1: Write deposit tracking E2E test**

- [ ] **Step 2: Write HuFi integration E2E test**

- [ ] **Step 3: Run all tests**

- [ ] **Step 4: Manual test with real funds (optional)**

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/market-making/deposit/deposit-tracking.e2e.spec.ts
git add server/src/modules/market-making/hufi/hufi-integration.e2e.spec.ts
git commit -m "test: add E2E tests for deposit tracking and HuFi integration"
```

---

## Summary

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Chunk 1 | Entity updates | 0.5 day |
| Chunk 2 | Deposit tracking service | 1 day |
| Chunk 3 | Enable withdrawal | 0.5 day |
| Chunk 4 | HuFi integration | 1 day |
| Chunk 5 | Metrics tracking | 0.5 day |
| Chunk 6 | E2E testing | 0.5 day |
| **Total** | | **4 days** |

---

## Execution Notes

- Each chunk should be committed separately
- Tests must pass before moving to next chunk
- Use feature flags to enable/disable new flows in production
- Monitor logs closely during initial real fund testing
- HuFi join failure is non-blocking - market making continues regardless

# 完整做市闭环实现方案

**日期**: 2026-03-12
**状态**: 设计完成，待实现
**预估时间**: 3-7 天

---

## 一、项目目标

跑通完整的做市业务闭环：

```
用户支付 (Mixin) → 提现到交易所 → 充值追踪确认 → HuFi Campaign 加入 → 做市执行 → 数据追踪
```

**验证方式**: 小额真实资金测试

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Mr.Market 完整做市流程                              │
├────────────────────���────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                           │
│  │ 用户支付      │ ← Mixin Invoice                                           │
│  │ pending_pay  │                                                           │
│  └──────┬───────┘                                                           │
│         ↓                                                                   │
│  ┌──────────────┐     ┌─────────────────────────────────────┐               │
│  │ Phase 1      │     │ 1. 获取交易所充值地址 (CCXT)          │               │
│  │ 提现到交易所  │────→│ 2. Mixin 提现到交易所地址            │               │
│  │ withdrawal   │     │ 3. 记录 tx_hash                      │               │
│  └──────┬───────┘     └─────────────────────────────────────┘               │
│         ↓                                                                   │
│  ┌──────────────┐     ┌─────────────────────────────────────┐               │
│  │ Phase 2      │     │ 三重验证：                           │               │
│  │ 充值追踪      │────→│ 1. Mixin 提现记录                    │               │
│  │ deposit      │     │ 2. 链上转账记录                      │               │
│  └──────┬───────┘     │ 3. 交易所 Deposit History (CCXT)    │               │
│         ↓             └─────────────────────────────────────┘               │
│  ┌──────────────┐                                                           │
│  │ Phase 3      │     ┌─────────────────────────────────────┐               │
│  │ HuFi 加入    │────→│ 1. 查找匹配 Campaign                 │               │
│  │ campaign     │     │ 2. 本地 EVM 私钥签名                 │               │
│  └──────┬───────┘     │ 3. 发送加入请求到 HuFi              │               │
│         ↓             │ 4. 本地记录参与信息                  │               │
│  ┌──────────────┐     └─────────────────────────────────────┘               │
│  │ Phase 4      │                                                           │
│  │ 做市执行      │ ←── ExchangePairExecutor (已实现)                         │
│  │ mm_running   │                                                           │
│  └──────┬───────┘                                                           │
│         ↓                                                                   │
│  ┌──────────────┐                                                           │
│  │ 数据追踪      │ ←── 订单统计、交易量、利润                                │
│  └──────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、订单状态流转

```
pending_payment          等待用户支付
        ↓ (支付完��)
withdrawal_pending       提现处理中 (Phase 1)
        ↓ (Mixin 提现已发送)
withdrawal_confirmed     提现已上链
        ↓ (链上确认 + 交易所到账)
deposit_confirmed        充值已确认 (Phase 2)
        ↓
campaign_joining         正在加入 Campaign (Phase 3, 可选)
        ↓ (加入成功或无匹配)
mm_running               做市执行中 (Phase 4)
        ↓ (用户触发停止)
mm_stopping              停止中
        ↓
withdrawal_to_user       提现回用户
        ↓
completed                完成
```

**错误状态**：
- `withdrawal_failed` - 提现失败
- `deposit_timeout` - 充值超时
- `mm_paused` - 做市暂停（连续错误）

---

## 四、Phase 1: 提现到交易所

### 4.1 现状
- 代码已存在，但被禁用（validation mode）
- 位置: `market-making.processor.ts`

### 4.2 改动内容

启用真实提现逻辑：

```typescript
// market-making.processor.ts - processWithdrawToExchange()

async processWithdrawToExchange(job: Job) {
  const { orderId } = job.data;
  const order = await this.orderRepository.findOne(orderId);

  // 获取交易所充值地址
  const depositAddress = await this.exchangeService.getDepositAddress(
    order.exchangeName,
    order.asset.symbol
  );

  // 执行 Mixin 提现
  const withdrawal = await this.mixinService.createWithdrawal({
    address: depositAddress,
    amount: order.amount,
    asset_id: order.asset.mixinAssetId,
    trace_id: uuidv4() // 幂等键
  });

  // 更新订单状态
  await this.orderRepository.update(orderId, {
    status: 'withdrawal_pending',
    withdrawalTxHash: withdrawal.transaction_hash,
    withdrawalTraceId: withdrawal.trace_id,
    depositAddress: depositAddress
  });

  // 触发充值追踪
  await this.depositTrackingQueue.add('track_deposit', { orderId });
}
```

### 4.3 关键点
- 获取交易所充值地址（CCXT `fetchDepositAddress`）
- Mixin 提现（幂等，使用 trace_id）
- 存储 tx_hash 用于后续追踪
- 错误处理：重试 3 次，失败则退款

---

## 五、Phase 2: 充值追踪

### 5.1 现状
- 不存在，需要新建

### 5.2 三重验证机制

```
┌─────────────────────────────────────────────────────────────────┐
│                      三重验证                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ Mixin 提现记录                                              │
│     API: Mixin API /withdrawals/{traceId}                       │
│     确认: status === 'confirmed'                                │
│     获取: transaction_hash                                      │
│                                                                 │
│  2️⃣ 链上转账记录                                                 │
│     API: 区块链浏览器 / 链节点 RPC                                │
│     确认: confirmations >= required (BTC:6, ETH:12, BSC:15)     │
│     匹配: txHash === mixin.transaction_hash                     │
│                                                                 │
│  3️⃣ 交易所 Deposit History                                       │
│     API: CCXT fetchDeposits                                     │
│     确认: status === 'ok'                                       │
│     匹配: txId === txHash && amount === expectedAmount          │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│  三者全部通过 → 充值确认                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 新增服务

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
  // 每 30 秒检查一次
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
        // 触发 HuFi 加入
        await this.campaignQueue.add('join_campaign', { orderId: order.id });
      } else {
        // 更新追踪状态
        await this.orderRepository.update(order.id, {
          depositTrackingStatus: JSON.stringify(result)
        });
      }
    }
  }

  async trackDeposit(order: MarketMakingOrder): Promise<DepositTrackingResult> {
    const result = this.initEmptyResult();

    // 1. 查 Mixin 提现记录
    result.mixinStatus = await this.checkMixinWithdrawal(order.withdrawalTraceId);

    if (!result.mixinStatus.confirmed) {
      return result;
    }

    // 2. 查链上转账记录
    result.onchainStatus = await this.chainTrackerService.getTransaction(
      order.asset.chain,
      result.mixinStatus.txHash
    );

    if (!result.onchainStatus.confirmed) {
      return result;
    }

    // 3. 查交易所 Deposit History
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

**ChainTrackerService**（链上追踪）:

```typescript
// chain-tracker.service.ts

@Injectable()
export class ChainTrackerService {
  private readonly requiredConfirmations = {
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
      return { confirmed: false, txHash, confirmations: 0, requiredConfirmations: this.requiredConfirmations[chain] };
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
    // 根据链类型返回对应的 provider
    // 可以是 ethers provider, bitcoin RPC, 或第三方 API
  }
}
```

### 5.4 超时处理

```typescript
// 超过 1 小时未确认，触发告警
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

## 六、Phase 3: HuFi Campaign 加入

### 6.1 现状
- `CampaignService` 已有 HuFi API 客户端
- `join_campaign` 流程只创建本地记录，未真实加入

### 6.2 改动内容

**本地记录 vs 实际加入分离**:
- `CampaignParticipation` 实体：仅记录参与信息，不触发操作
- `HuFiIntegrationService`：负责实际调用 HuFi API 加入

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
    // 1. 查找匹配的 Campaign
    const campaigns = await this.campaignService.getCampaigns();
    const matchingCampaign = this.findMatchingCampaign(campaigns, order);

    if (!matchingCampaign) {
      this.logger.log(`No matching campaign for order ${order.id}`);
      return { success: false, reason: 'no_matching_campaign' };
    }

    // 2. 获取系统 EVM 钱包
    const systemWallet = await this.systemWalletService.getWallet();

    // 3. 构建签名数据
    const signData = {
      campaignId: matchingCampaign.id,
      address: systemWallet.address,
      pair: order.pair,
      exchange: order.exchange,
      amount: order.amount,
      timestamp: Date.now()
    };

    // 4. EVM 私钥签名
    const signature = await this.systemWalletService.signMessage(
      systemWallet.privateKey,
      JSON.stringify(signData)
    );

    // 5. 调用 HuFi API 加入
    try {
      const result = await this.campaignService.joinCampaignWithAuth({
        campaignId: matchingCampaign.id,
        address: systemWallet.address,
        signature,
        ...signData
      });

      // 6. 创建本地记录（仅记录用）
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

      // 记录失败，但不阻止做市
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

**集成到流程中**:

```typescript
// market-making.processor.ts - processJoinCampaign()

async processJoinCampaign(job: Job) {
  const { orderId } = job.data;
  const order = await this.orderRepository.findOne(orderId);

  // 调用 HuFi 加入服务
  const result = await this.huFiIntegrationService.joinCampaign(order);

  // 无论成功与否，都触发做市
  await this.startMmQueue.add('start_mm', { orderId });
}
```

### 6.3 关键点
- 使用本地 EVM 私钥签名
- 加入失败不阻止做市继续
- 本地记录仅做记录用

---

## 七、Phase 4: 做市执行

### 7.1 现状
- `ExchangePairExecutor` 已实现
- 策略控制器已实现
- 订单下达/取消通过 CCXT

### 7.2 补充：数据追踪

```typescript
// 在 ExchangePairExecutor 中增加统计

interface OrderMetrics {
  placedCount: number;        // 下单次数
  filledCount: number;        // 成交次数
  cancelledCount: number;     // 撤单次数
  failedCount: number;        // 失败次数
  totalVolume: BigNumber;     // 总交易量
  totalProfit: BigNumber;     // 总利润
  avgSpread: BigNumber;       // 平均价差
}

// 扩展 StrategySession
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
    // 计算利润...
  }
}

// 定时持久化
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

## 八、错误处理策略

| 阶段 | 错误类型 | 处理方式 | 状态变更 |
|------|---------|---------|---------|
| Phase 1 | 获取充值地址失败 | 重试 3 次 | 保持原状态 |
| Phase 1 | Mixin 提现失败 | 重试 3 次，失败后退款 | `withdrawal_failed` → 退款 |
| Phase 2 | 充值超时 (>1h) | 告警 + 人工介入 | `deposit_timeout` |
| Phase 3 | 无匹配 Campaign | 跳过，继续做市 | 直接进入 Phase 4 |
| Phase 3 | HuFi 加入失败 | 记录日志，继续做市 | 记录失败，继续 |
| Phase 4 | 下单失败 | 重试，连续失败则暂停 | `mm_paused` |
| Phase 4 | API 限流 | 等待后重试 | 保持 `mm_running` |

---

## 九、测试计划

| 阶段 | 测试项 | 环境 | 验证点 |
|------|--------|------|--------|
| Phase 1 | Mixin 提现 | Mixin sandbox | tx_hash 正确返回 |
| Phase 1 | 交易所地址获取 | 交易所 testnet | 地址格式正确 |
| Phase 2 | Mixin 提现查询 | Mixin sandbox | 状态正确返回 |
| Phase 2 | 链上交易查询 | 主网（小额） | 确认数正确 |
| Phase 2 | 交易所 Deposit 查询 | 交易所 testnet | 匹配逻辑正确 |
| Phase 3 | Campaign 匹配 | Mock 数据 | 匹配逻辑正确 |
| Phase 3 | EVM 签名 | 单元测试 | 签名格式正确 |
| Phase 3 | HuFi API 调用 | HuFi testnet | 加入成功 |
| Phase 4 | 下单/撤单 | 交易所 testnet | 操作正确 |
| E2E | 完整流程 | 小额真实资金 | 全流程通过 |

---

## 十、文件改动清单

### 新增文件
- `server/src/modules/market-making/deposit/deposit-tracking.service.ts`
- `server/src/modules/market-making/deposit/chain-tracker.service.ts`
- `server/src/modules/market-making/hufi/hufi-integration.service.ts`
- `server/src/modules/market-making/metrics/order-metrics.service.ts`

### 修改文件
- `server/src/modules/market-making/user-orders/market-making.processor.ts` - 启用提现，集成充值追踪
- `server/src/modules/market-making/user-orders/user-orders.entity.ts` - 增加追踪字段
- `server/src/modules/market-making/execution/exchange-pair-executor.ts` - 增加统计
- `server/src/modules/campaign/campaign.service.ts` - 可能需要调整 join API

---

## 十一、时间安排

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-2 | Phase 1 + Phase 2 | 提现到交易所 + 充值追踪 |
| Day 2-3 | Phase 3 | HuFi 集成 + 测试 |
| Day 3-4 | Phase 4 补充 | 数据追踪 |
| Day 4-5 | 集成测试 | E2E 流程验证 |
| Day 5-7 | 真实资金测试 + 修复 | 生产就绪 |

---

## 十二、关键决策

1. **资金流转**: Mixin → CEX（通过 Mixin 提现到交易所）
2. **交易所支持**: CCXT 通用接口
3. **HuFi 集成**: 同步集成，使用本地 EVM 私钥签名
4. **验证方式**: 小额真实资金测试

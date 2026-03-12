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

## 二、现有代码基础

### 已有服务（不要重复创建）
- `ExchangeApiKeyService` - `exchange-api-key.service.ts`
  - `getDepositAddress()`, `findFirstAPIKeyByExchange()`
- `CampaignService` - `campaign.service.ts`
  - `getCampaigns()`, `joinCampaignWithAuth(wallet, key, chainId, address)`
- `WithdrawalService` - `withdrawal.service.ts`
  - `executeWithdrawal(asset_id, destination, memo, amount, requestKey?)`
- `MarketMakingOrderProcessor` - `market-making.processor.ts`
  - 已有 `@Process('withdraw_to_exchange')` 和 `@Process('join_campaign')`

### 已有状态定义 (`states.ts`)
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

### 已有支付状态结构 (`payment-state.entity.ts`)
```typescript
// 双资产结构
baseAssetId, baseAssetAmount, baseAssetSnapshotId
quoteAssetId, quoteAssetAmount, quoteAssetSnapshotId
// 手续费
baseFeeAssetId, baseFeeAssetAmount
quoteFeeAssetId, quoteFeeAssetAmount
```

---

## 三、整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Mr.Market 完整做市流程                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                           │
│  │ 用户支付      │ ← Mixin Invoice                                           │
│  │ payment_     │                                                           │
│  │ pending/     │                                                           │
│  │ complete     │                                                           │
│  └──────┬───────┘                                                           │
│         ↓                                                                   │
│  ┌──────────────┐     ┌─────────────────────────────────────┐               │
│  │ Phase 1      │     │ 支持单/双资产：                       │               │
│  │ 提现到交易所  │────→│ 1. 获取交易所充值地址 (CCXT)          │               │
│  │ withdrawing  │     │ 2. Mixin 提现到交易所地址            │               │
│  └──────┬───────┘     │ 3. 记录每条腿的 txHash               │               │
│         ↓             └─────────────────────────────────────┘               │
│  ┌──────────────┐                                                           │
│  │ Phase 2      │     ┌─────────────────────────────────────┐               │
│  │ 充值追踪      │────→│ 三重验证（每条腿独立）：              │               │
│  │ deposit_     │     │ 1. Mixin 提现记录                    │               │
│  │ confirming   │     │ 2. 链上转账记录                      │               │
│  └──────┬───────┘     │ 3. 交易所 Deposit History (CCXT)    │               │
│         ↓             └─────────────────────────────────────┘               │
│  ┌──────────────┐                                                           │
│  │ Phase 3      │     ┌─────────────────────────────────────┐               │
│  │ HuFi 加入    │────→│ 1. 用 symbol + exchangeName 匹配     │               │
│  │ joining_     │     │ 2. 调用 CampaignService              │               │
│  │ campaign     │     │    .joinCampaignWithAuth(...)       │               │
│  └──────┬───────┘     └─────────────────────────────────────┘               │
│         ↓                                                                   │
│  ┌──────────────┐                                                           │
│  │ Phase 4      │                                                           │
│  │ 做市执行      │ ←── ExchangePairExecutor (已实现)                         │
│  │ running      │                                                           │
│  └──────┬───────┘                                                           │
│         ↓                                                                   │
│  ┌──────────────┐                                                           │
│  │ 数据追踪      │ ←── 订单统计、交易量、利润                                │
│  └──────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 四、订单状态流转

```
payment_pending          等待用户支付
        ↓
payment_incomplete       部分支付（单资产时跳过）
        ↓
payment_complete         支付完成
        ↓
withdrawing              提现处理中 (Phase 1)
        ↓
withdrawal_confirmed     提现已上链
        ↓
deposit_confirming       等待交易所到账 (Phase 2)
        ↓
deposit_confirmed        充值已确认
        ↓
joining_campaign         正在加入 Campaign (Phase 3, 可选)
        ↓
campaign_joined          Campaign 加入成功（或无匹配时跳过）
        ↓
created                  准备开始做市
        ↓
running                  做市执行中 (Phase 4)
        ↓ (用户触发停止)
stopped                  已停止
```

**错误状态**：
- `failed` - 失败
- `refunded` - 已退款

---

## 五、Phase 1: 提现到交易所

### 5.1 现状
- 代码已存在，但被禁用（validation mode）
- 位置：`market-making.processor.ts` 的 `processWithdrawToExchange()`
- 方法：`withdrawalService.executeWithdrawal()`（不是 createWithdrawal）

### 5.2 改动内容

**支持单/双资产**：

```typescript
// market-making.processor.ts - processWithdrawToExchange()

async processWithdrawToExchange(job: Job) {
  const { orderId } = job.data;
  const order = await this.userOrdersService.findMarketMakingByOrderId(orderId);
  const paymentState = await this.paymentStateRepository.findOne({ where: { orderId } });

  const apiKey = await this.exchangeService.findFirstAPIKeyByExchange(order.exchangeName);
  const pairConfig = await this.getPairConfig(order.pair);

  // 判断是否为单资产订单
  const isSingleAsset = !paymentState.quoteAssetId || paymentState.quoteAssetId === paymentState.baseAssetId;

  // 获取充值地址
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

  // 执行 base 提现
  const baseWithdrawal = await this.withdrawalService.executeWithdrawal(
    paymentState.baseAssetId,
    baseDepositAddress.address,
    baseDepositAddress.memo || `MM:${orderId}:base`,
    paymentState.baseAssetAmount,
    `${orderId}:base`,
  );

  // 双资产时处理 quote
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

  // 更新订单状态和追踪信息
  await this.marketMakingRepository.update(orderId, {
    state: 'withdrawing',
    // 存储到新增的追踪字段
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

## 六、Phase 2: 充值追踪

### 6.1 触发方式
使用 `@Cron` 轮询，查询 `deposit_confirming` 状态的订单。

### 6.2 三重验证机制（每条腿独立）

```
┌─────────────────────────────────────────────────────────────────┐
│              三重验证（base 和 quote 分别验证）                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ Mixin 提现记录                                              │
│     确认: 状态为 confirmed                                       │
│     获取: transaction_hash                                      │
│                                                                 │
│  2️⃣ 链上转账记录                                                 │
│     确认: confirmations >= required                             │
│     BTC: 6, ETH: 12, BSC: 15                                    │
│                                                                 │
│  3️⃣ 交易所 Deposit History                                       │
│     确认: status === 'ok'                                       │
│     匹配: txId + amount                                         │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│  base + quote 都确认 → 整体确认                                  │
│  单资产订单：只验证 base                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 实体字段设计

```typescript
// user-orders.entity.ts - 新增字段

// 提现追踪
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

// 充值追踪状态
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

```typescript
// deposit-tracking.service.ts

@Injectable()
export class DepositTrackingService {
  @Cron('*/30 * * * * *') // 每 30 秒
  async checkPendingDeposits() {
    const orders = await this.orderRepository.find({
      where: { state: In(['withdrawing', 'withdrawal_confirmed', 'deposit_confirming']) },
    });

    for (const order of orders) {
      const result = await this.trackDeposit(order);

      // 更新追踪状态
      await this.orderRepository.update(order.orderId, {
        depositTrackingStatus: result,
      });

      // 检查是否全部确认
      if (result.allConfirmed) {
        await this.orderRepository.update(order.orderId, {
          state: 'deposit_confirmed',
          baseDepositConfirmedAt: result.base.exchangeReceived ? new Date() : undefined,
          quoteDepositConfirmedAt: result.quote?.exchangeReceived ? new Date() : undefined,
        });

        // 触发 Campaign 加入
        await this.marketMakingQueue.add('join_campaign', { orderId: order.orderId });
      }

      // 超时检查
      await this.checkTimeout(order);
    }
  }

  async trackDeposit(order: MarketMakingOrder): Promise<DepositTrackingResult> {
    const result: DepositTrackingResult = {
      base: { mixinConfirmed: false, onchainConfirmations: 0, exchangeReceived: false },
      allConfirmed: false,
    };

    // 验证 base
    result.base = await this.verifyLeg(
      order.baseWithdrawalTraceId,
      order.baseWithdrawalTxHash,
      order.baseDepositAddress,
      order.baseDepositNetwork,
      order.baseAssetAmount,
      order.exchangeName,
    );

    // 双资产时验证 quote
    if (!order.isSingleAssetOrder && order.quoteWithdrawalTraceId) {
      result.quote = await this.verifyLeg(
        order.quoteWithdrawalTraceId,
        order.quoteWithdrawalTxHash,
        order.quoteDepositAddress,
        order.quoteDepositNetwork,
        order.quoteAssetAmount,
        order.exchangeName,
      );
    }

    // 判断整体确认
    const baseConfirmed = result.base.mixinConfirmed && result.base.exchangeReceived;
    const quoteConfirmed = order.isSingleAssetOrder || (result.quote?.mixinConfirmed && result.quote?.exchangeReceived);
    result.allConfirmed = baseConfirmed && quoteConfirmed;

    return result;
  }
}
```

---

## 七、Phase 3: HuFi Campaign 加入

### 7.1 现状
- `CampaignService` 已有完整 API
- `join_campaign` 流程只创建本地记录，未真实加入

### 7.2 Campaign 匹配逻辑

**CampaignDataDto 实际字段**：
```typescript
// campaign.dto.ts
chainId: number;
exchangeName: string;
symbol: string;        // 不是 pair！
endBlock: number;      // 不是 endTime！
address: string;
status: string;
```

**匹配逻辑**：
```typescript
private findMatchingCampaign(campaigns: CampaignDataDto[], order: MarketMakingOrder): CampaignDataDto | null {
  // 从 order.pair 提取 symbol (如 "BTC/USDT" → "BTC")
  const baseSymbol = order.pair.split('/')[0];

  return campaigns.find(c =>
    c.symbol === baseSymbol &&
    c.exchangeName === order.exchangeName &&
    c.status !== 'Complete' &&
    c.endBlock * 1000 >= Date.now()  // endBlock 是区块号，需转换
  ) || null;
}
```

### 7.3 HuFiIntegrationService

```typescript
// hufi-integration.service.ts

@Injectable()
export class HuFiIntegrationService {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly configService: ConfigService,
  ) {}

  async joinCampaign(order: MarketMakingOrder): Promise<JoinCampaignResult> {
    try {
      // 1. 获取 campaigns
      const campaigns = await this.campaignService.getCampaigns();
      const matchingCampaign = this.findMatchingCampaign(campaigns, order);

      if (!matchingCampaign) {
        return { success: false, reason: 'no_matching_campaign' };
      }

      // 2. 获取系统钱包配置
      const walletAddress = this.configService.get<string>('hufi.system_wallet_address');
      const privateKey = this.configService.get<string>('hufi.system_wallet_private_key');

      if (!walletAddress || !privateKey) {
        return { success: false, reason: 'wallet_not_configured' };
      }

      // 3. 调用已有的 CampaignService.joinCampaignWithAuth
      // 签名: joinCampaignWithAuth(wallet_address, private_key, chain_id, campaign_address)
      const result = await this.campaignService.joinCampaignWithAuth(
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
      // 失败不阻止做市
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
      c.endBlock * 1000 >= Date.now()
    ) || null;
  }
}
```

---

## 八、Phase 4: 做市执行

### 8.1 现状
- `ExchangePairExecutor` 已实现
- 策略控制器已实现
- 订单下达/取消通过 CCXT

### 8.2 补充：数据追踪

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

## 九、错误处理策略

| 阶段 | 错误类型 | 处理方式 | 状态变更 |
|------|---------|---------|---------|
| Phase 1 | 获取充值地址失败 | 重试 3 次 | 保持 `withdrawing` |
| Phase 1 | Mixin 提现失败 | 重试 3 次，失败后退款 | `failed` → 退款 |
| Phase 2 | 充值超时 (>1h) | 告警 + 人工介入 | `failed` |
| Phase 3 | 无匹配 Campaign | 跳过，继续做市 | 直接进入 `created` |
| Phase 3 | HuFi 加入失败 | 记录日志，继续做市 | 继续 |
| Phase 4 | 下单失败 | 重试，连续失败则暂停 | `paused` |

---

## 十、文件改动清单

### 新增文件
- `server/src/modules/market-making/deposit/deposit.module.ts`
- `server/src/modules/market-making/deposit/deposit-tracking.service.ts`
- `server/src/modules/market-making/deposit/deposit-tracking.service.spec.ts`
- `server/src/modules/market-making/deposit/chain-tracker.service.ts`
- `server/src/modules/market-making/deposit/chain-tracker.service.spec.ts`
- `server/src/modules/market-making/hufi/hufi.module.ts`
- `server/src/modules/market-making/hufi/hufi-integration.service.ts`
- `server/src/modules/market-making/hufi/hufi-integration.service.spec.ts`
- `server/src/modules/market-making/metrics/order-metrics.service.ts`

### 修改文件
- `server/src/common/entities/orders/user-orders.entity.ts` - 增加双资产追踪字段
- `server/src/modules/market-making/user-orders/market-making.processor.ts` - 启用提现，集成充值追踪
- `server/src/modules/market-making/user-orders/user-orders.module.ts` - 导入新模块

---

## 十一、关键决策

1. **资产支持**: 同时支持单资产和双资产订单
2. **状态名**: 使用现有 `withdrawing`, `deposit_confirming`, `joining_campaign`, `running`
3. **触发方式**: Cron 轮询 `deposit_confirming` 状态的订单
4. **Campaign 匹配**: 用 `symbol` + `exchangeName` + `endBlock`
5. **方法名**: `executeWithdrawal`（不是 createWithdrawal）

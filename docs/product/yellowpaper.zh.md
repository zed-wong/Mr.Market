# HuFi 黄皮书：技术规范

## 摘要

本黄皮书定义 HuFi 和 Mr.Market 的技术架构、数据模型、状态机和执行规范。它是实现的事实源，与白皮书的论点和愿景互补。

## 1. 系统架构概览

系统分为三层加横向能力：

```
┌─────────────────────────────────────────────┐
│                  资金层                       │
│  Mixin / EVM / Solana → Order Balance        │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│                  调度层                       │
│  NestJS · 状态机 · 额度 · 任务队列 · API     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│                  交易层                       │
│  Controller → Action → Executor → State     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│            横向：账本·对账·风控·审计·观测      │
└─────────────────────────────────────────────┘
```

核心数据流：

```
资金进入 → 订单余额 → 策略配置快照 → 额度 reservation → 交易所订单 → 成交和 fee → 账本、奖励和审计记录
```

## 2. 实例与策略模型

### 2.1 实例定义

一个实例是一个完整部署的 Mr.Market 服务器，可同时运行多个策略。

### 2.2 资金隔离：额度（Quota）机制

资金隔离采用额度机制，而非物理资金分离。原因：交易所账户无法在内部对余额分区。

- 交易所账户持有混合资金；
- 每个策略实例被分配一个源自其订单的额度；
- 运行时确保订单的实时资金使用量不超过其额度；
- 系统在每个订单层面追踪使用量，并在交易时执行限额。

**冲突防止规则**：

- 在交易所执行下单时，订单关联用户订单的 ID；
- 同一交易所上所有活跃策略额度之和不得超过该交易所账户余额。

### 2.3 订单生命周期

```
等待入金 → 已入金 → 运行中 → 停止中 → 已停止
                ↘ 提现中 → 已退款
                          ↘ 失败
```

状态变更必须幂等。数据库是事实源，内存状态只作运行时缓存。

## 3. CEX 优先执行边界

第一版实施范围只包含 CEX 执行。

定义：

| 概念 | 定义 |
|------|------|
| 执行账户 | 一个交易所 API key |
| 混合资金 | API key 在交易所层面的资金 |
| 内部隔离 | 由 Mr.Market 内部账本执行 |
| 策略实例绑定 | 每个策略实例绑定一个订单和一个执行账户 |

约束：

1. 每个交易所订单和成交必须能归因回发起它的 Mr.Market 订单；
2. rate limit、open order limit、交易对冲突和 API key 健康状态共同限制一个执行账户可支持的订单数；
3. 交易层不能绕过账本直接修改用户余额。

## 4. 订单余额模型（Order Balance）

Mr.Market 订单余额是额度执行的事实源。余额绑定到具体 Mr.Market 订单，而非仅绑定用户或交易所账户。

### 4.1 余额字段

每个订单按资产维护以下字段：

| 字段 | 含义 |
|------|------|
| `available` | 可用于新 reservation 的额度 |
| `locked` | 已 reservation 但尚未成交的额度 |
| `total` | `available + locked` |
| `initialDeposit` | 初始入金金额 |
| `realizedDelta` | 已实现盈亏 |
| `feePaid` | 已支付手续费 |

### 4.2 Reservation 规则

策略下单前必须先从订单余额中 reserve 额度：

| 订单方向 | 锁定资产 | 锁定量 |
|----------|----------|--------|
| 买单 | quote 资产 | `price × qty + estimatedFee` |
| 卖单 | base 资产 | `qty + estimatedFee` |

成交后，系统按 fill 更新订单级余额。撤单后，未成交部分的 locked 额度释放回 available。

### 4.3 手续费处理

优先级：

1. **真实 fee**：优先使用成交事件或 CCXT 返回的实际 fee；
2. **估算 fee**：真实 fee 不可用时，根据订单角色使用 CCXT market 的 maker/taker rate：
   - post-only maker order → maker fee
   - IOC / market order / taker leg → taker fee
   - 角色不确定 → 使用更保守的 taker fee
3. **修正**：估算 fee 必须在之后被真实 fee 或对账结果修正。

## 5. 调度层规范

调度层是系统控制面，基于 NestJS 后端。

### 5.1 职责

| 职责 | 说明 |
|------|------|
| 订单管理 | 创建订单，绑定用户 |
| 配置固化 | 保存策略配置快照 |
| 生命周期 | 管理订单状态机转换 |
| 额度计算 | 计算 capital quota 和 execution quota |
| 任务调度 | 任务队列、tick loop、启动、停止、提现和对账 |
| API | HTTP API、管理接口、前端读取模型 |
| 审计 | 保存审计日志、状态变更、错误原因 |

### 5.2 两个原则

1. **数据库是事实源**：内存状态只能作为运行时缓存；
2. **幂等性**：所有会改变资金、订单或奖励的动作必须幂等。

## 6. 交易层规范

### 6.1 执行链路

```
Config → Controller → Action → Executor → State / Report
```

对应到 Mr.Market 数据流：

```
Mr.Market order
  → strategy config snapshot
  → order balance / quota
  → exchange order
  → fill ledger
  → reward attribution
```

### 6.2 职责划分

| 组件 | 职责 |
|------|------|
| Controller | 根据策略配置和市场状态产生 Action |
| Executor | 下单、撤单、重试、限速、交易所错误处理 |
| Ledger | 记录余额变化（余额只能通过 Ledger 发生） |

### 6.3 约束

- 每个 exchange order 必须能映射回唯一 Mr.Market order；
- fill 进入系统后必须更新订单级余额、fee、PnL 和奖励归因基础；
- 交易层不能绕过 Ledger 直接修改用户余额。

## 7. 资金层规范

### 7.1 原则

| 原则 | 说明 |
|------|------|
| 归属 | 资金归属于具体 user order，而非仅 user 或钱包地址 |
| 可追踪 | 每笔入金、退款、提现和到账确认必须可追踪、可重放、可审计 |
| 职责边界 | 资金层只负责资金进入、退出和确认，不决定策略，不承诺收益 |
| 事实源 | 内部订单余额是运行时额度事实源，外部链/钱包/交易所余额只是证据来源 |

### 7.2 资金入口

近期：Mixin 入金和退款。后续：EVM、Solana 及其他链上入口。

## 8. 奖励分配规范

### 8.1 两层模型

**第一层：HuFi recording oracle**

Mr.Market 通过 campaign id、web3 address 和 exchange API key 绑定到一个 campaign。Oracle API 提供该 API key 在 campaign 中的：
- 总 score
- 每日可查询的 payout token、daily payout amount 和 payout score

**第二层：Mr.Market 内部分配**

Mr.Market 只将自己从 campaign 中获得的每日 reward pool 分配给内部可归因的用户订单。

### 8.2 Internal Score 计算

```text
eligible_fills =
  exchange fills
  where
    fill.executed_at >= campaign_start_time
    and fill.executed_at < campaign_end_time
    and fill.api_key_id = campaign.api_key_id
    and fill.order_id is attributable to a Mr.Market user order
```

每个 user order 的 internal score 基于其 eligible fills 计算。

### 8.3 平台费

```text
gross_daily_payout    = oracle_payout(campaign_id, day)
platform_fee           = gross_daily_payout × campaign_fee_rate
net_user_reward_pool   = gross_daily_payout - platform_fee
```

- 费率由管理员按 campaign 配置；
- fee 配置是 campaign-level 配置，只影响未来尚未结算的 reward day；
- 已结算的 daily allocation 不因管理员修改费率而被重写。

### 8.4 用户分配公式

```text
total_internal_score(campaign, day) = Σ(all eligible user_internal_scores for campaign day)

user_reward(campaign, day) = user_internal_score(campaign, day)
  / total_internal_score(campaign, day)
  × net_user_reward_pool(campaign, day)
```

### 8.5 不变量

```text
Σ(user_rewards) + platform_fee + undistributed_remainder = gross_daily_payout
Σ(user_rewards) ≤ gross_daily_payout
```

## 9. 横向能力规范

| 能力 | 说明 |
|------|------|
| 账本（Ledger） | 所有余额变化只能通过 Ledger 发生 |
| 对账（Reconciliation） | 定期比较内部账本、交易所订单、交易所余额、Mixin 或链上记录 |
| 风控（Risk） | 检查余额不足、API key 异常、rate limit、交易对冲突、订单过期、异常成交 |
| 审计（Audit） | 任何人能从订单、资金、交易和奖励记录中复现一笔活动的结果 |
| 观测（Observability） | 运行状态、失败原因、执行延迟、成交质量和奖励分配可查询 |

## 10. 开放技术决策

1. 策略配置快照的具体序列化格式？
2. Reservation 的并发控制模型：乐观锁还是悲观锁？
3. Internal score 的具体公式：是基于 fill volume、fill count 还是混合？
4. 对账检测到差异时的自动修正策略？
5. 多实例共享同一 API key 时的 rate limit 分区策略？
6. 订单状态机回滚条件：哪些失败需要人工介入？
7. 估算 fee 修正的最大容忍延迟？
8. Ledger entry 的不可变性保证机制？
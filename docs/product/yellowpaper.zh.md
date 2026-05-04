# Mr.Market 黄皮书：技术规范

## 摘要

本黄皮书定义 HuFi 和 Mr.Market 的技术架构、数据模型、状态机和执行规范。它是实现的事实源，与白皮书的论点和愿景互补。

## 目录

- [1. 系统架构概览](#1-系统架构概览)
- [2. 资金层规范](#2-资金层规范)
  - [2.1 原则](#21-原则)
  - [2.2 资金入口](#22-资金入口)
  - [2.3 订单余额模型（Order Balance）](#23-订单余额模型order-balance)
  - [2.4 余额字段](#24-余额字段)
  - [2.5 资金隔离：额度（Quota）机制](#25-资金隔离额度quota机制)
  - [2.6 资金锁定规则](#26-资金锁定规则)
  - [2.7 手续费处理](#27-手续费处理)
  - [2.8 Ledger、Balance 与 LOCK](#28-ledgerbalance-与-lock)
  - [2.9 Ledger 并发与重建规则](#29-ledger-并发与重建规则)
- [3. 调度层规范](#3-调度层规范)
  - [3.1 实例定义](#31-实例定义)
  - [3.2 策略实例与用户订单](#32-策略实例与用户订单)
  - [3.3 策略定义与配置快照](#33-策略定义与配置快照)
  - [3.4 CEX 优先执行边界](#34-cex-优先执行边界)
  - [3.5 订单生命周期](#35-订单生命周期)
  - [3.6 职责](#36-职责)
  - [3.7 两个原则](#37-两个原则)
  - [3.8 状态机规范](#38-状态机规范)
- [4. 交易层规范](#4-交易层规范)
  - [4.1 执行链路](#41-执行链路)
  - [4.2 职责划分](#42-职责划分)
  - [4.3 约束](#43-约束)
  - [4.4 Tick 执行规范](#44-tick-执行规范)
    - [4.4.1 Tick 协调器](#441-tick-协调器)
    - [4.4.2 数据流](#442-数据流)
    - [4.4.3 Controller 与 Intent](#443-controller-与-intent)
    - [4.4.4 并行边界](#444-并行边界)
    - [4.4.5 不变量](#445-不变量)
- [5. 奖励分配规范](#5-奖励分配规范)
  - [5.1 两层模型](#51-两层模型)
  - [5.2 Internal Score 计算](#52-internal-score-计算)
  - [5.3 平台费](#53-平台费)
  - [5.4 用户分配公式](#54-用户分配公式)
  - [5.5 不变量](#55-不变量)

## 1. 系统架构概览

系统分为三层加横向能力：

```text
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

```text
资金进入 → 用户余额 → 策略配置快照 → LOCK → 交易所订单 → 成交和 fee → 账本、奖励和审计记录
```

## 2. 资金层规范

资金层负责资金进入、退出、归属确认和订单级余额事实源。资金层不决定策略，不承诺收益。

### 2.1 原则

| 原则 | 说明 |
|------|------|
| 归属 | 资金归属于具体 user order，而非仅 user 或钱包地址 |
| 可追踪 | 每笔入金、退款、提现和到账确认必须可追踪、可重放、可审计 |
| 职责边界 | 资金层只负责资金进入、退出和确认，不决定策略，不承诺收益 |
| 事实源 | Ledger Entry 是余额事实源，BalanceReadModel 是运行时额度检查和 LOCK 的 read model，外部链/钱包/交易所余额只是证据来源 |

### 2.2 资金入口

近期：Mixin 入金和退款。后续：EVM、Solana 及其他链上入口。

Mixin Network 是当前阶段 Mr.Market 的主要资产目录和资金入口。资金层使用 Mixin `asset_id` 作为当前实现中的资产身份，并使用 Mixin `chain_id` 判断该资产所在网络。

CCXT 不作为 Mr.Market 的资产事实源。CCXT 只用于确认交易所 market 能力、交易精度、最小下单量、手续费能力，以及把内部资产和网络信息转换成交易所需要的 symbol / network 参数。

未来接入 EVM、Solana 或其他资金入口时，外部资产标识必须先映射到对应的 Mixin asset identity，或映射到与其等价的内部 canonical asset identity，然后才能进入 BalanceReadModel。资金层不得只依赖 symbol 完成资产判断。

### 2.3 用户余额模型（Balance Read Model）

BalanceReadModel 是运行时额度检查和 LOCK 的 read model。余额按 `userId + assetId` 维度维护，通过 Ledger Entry 推导。下单、成交、撤单、fee 和 PnL 都必须通过 Ledger Entry 表达，并更新余额视图。

### 2.4 余额字段

每个用户按资产维护以下字段：

| 字段 | 含义 |
|------|------|
| `available` | 可用于新 LOCK 的额度 |
| `locked` | 已 LOCK 但尚未成交或释放的额度 |
| `total` | `available + locked` |
| `initialDeposit` | 初始入金金额 |
| `realizedDelta` | 已实现盈亏 |
| `feePaid` | 已支付手续费 |

### 2.5 资金隔离：额度（Quota）机制

资金隔离采用额度机制，而非交易所内物理资金分离。原因：交易所账户无法在内部对余额分区。

- 交易所账户持有混合资金；
- 每个用户按资产获得额度；
- 运行时确保用户的实时资金使用量不超过其额度；
- 系统必须在 LOCK 和下单时进行两级额度检查：用户级（BalanceReadModel.available ≥ LOCK 请求量）和账户级（同一执行账户下所有用户的 LOCK 总和 ≤ 交易所账户余额），任一检查失败则拒绝 LOCK；
- 下单前必须 LOCK；
- LOCK 读取 BalanceReadModel 执行额度检查；余额事实源是 Ledger Entry。

### 2.6 资金锁定规则

资金锁定（LOCK）是 Mr.Market 内部的资金占用机制。它用于在外部交易所下单前占用用户余额，防止多个策略实例或多个 tick 重复使用同一份资金。

Hummingbot 类单用户 bot 通常可以依赖交易所余额和交易所挂单锁定；Mr.Market 不能只依赖交易所余额，因为多个用户订单可能共享同一个执行账户。交易所只看到混合资金，无法区分每笔资金属于哪个用户。因此，Mr.Market 必须在内部先完成 LOCK，再允许外部下单。

#### 实现方式

系统通过 `BalanceLedgerService` 提供原子化的 LOCK / UNLOCK 操作，不需要独立的 Reservation 实体。每笔 LOCK 直接在 Ledger Entry 中记录，并通过内存锁（`userId:assetId` 级别）串行化并发操作。

```text
BalanceReadModel.available
  → LOCK entry（绑定 intentId）
  → BalanceReadModel.locked
  → exchange order
  → 成交: MM_REALIZED_PNL / FEE_DEBIT / ADJUSTMENT
  → 取消/失败: UNLOCK
```

#### 锁定资产

策略下单前必须先锁定对应额度。

| 订单方向 | 锁定资产 | 锁定量 |
|----------|----------|--------|
| 买单 | quote 资产 | `price × qty + estimatedFee` |
| 卖单 | base 资产 | `qty + estimatedFee` |

> 保守原则：LOCK 必须覆盖成交后交易所可能扣除的最大手续费。如果 fee asset 与锁定资产不同，fee 部分必须在 fee asset 对应的余额中单独锁定。

真实 fee 不可用时，使用 taker fee 估算；真实 fee 到达后必须修正。

#### LOCK 与 Intent 绑定

每次 LOCK 必须通过 `refType` 和 `refId` 关联到一个具体的 intent 或 tracked order。没有关联 intent 的 LOCK 不被允许。

| 场景 | refType | refId |
|------|---------|-------|
| 策略下单前锁定 | `strategy_intent` | intent ID |
| 手动调整锁定 | `manual_adjustment` | 调整记录 ID |

Intent 进入终态（`DONE`、`CANCELLED`、`FAILED`、`EXPIRED`）时，系统必须自动释放其关联的 LOCK。如果 intent 因异常未被处理，LOCK 依赖超时机制释放。

#### 超时自动释放

每笔 LOCK entry 必须记录 `expiresAt`。后台定时任务扫描已过期但尚未释放的 LOCK，自动执行 UNLOCK 并记录审计事件。

超时阈值按场景配置：

| 场景 | 超时 |
|------|------|
| 策略下单 | intent 超时阈值 + 缓冲（如 5 分钟） |
| 手动操作 | 管理员配置 |

#### 账户级额度检查

多个用户订单可能共享同一个执行账户（exchange API key）。系统必须在 LOCK 时进行两级额度检查：

1. **用户级**：`BalanceReadModel.available ≥ LOCK 请求量`，由 `BalanceLedgerService` 在事务内保证；
2. **账户级**：同一执行账户下所有用户的 LOCK 总和 ≤ 交易所账户余额。此检查在 intent worker 执行前完成。

任一检查失败则拒绝 LOCK。

#### Ledger Entry 映射

| 动作 | Ledger Entry type | 说明 |
|------|-------------------|------|
| 下单前锁定 | `LOCK` | `refType`/`refId` 指向关联 intent |
| 取消/失败释放 | `UNLOCK` | `refType`/`refId` 指向释放原因 |
| 成交结算 | `MM_REALIZED_PNL` | 已实现盈亏计入 available |
| 手续费扣除 | `FEE_DEBIT` | 从 available 扣除 |
| 余额修正 | `ADJUSTMENT` | 对账修正或冲正 |

`BalanceReadModel.locked` 是所有未释放 LOCK entry 聚合后的派生视图。

#### 不变量

1. 外部订单创建前必须有对应的 LOCK entry；
2. 每笔 LOCK 必须关联一个 intent 或 tracked order（通过 `refType`/`refId`）；
3. `available` 不得小于 0；同一 `userId:assetId` 的 LOCK 操作通过内存锁串行化；
4. `locked` 不得小于 0；UNLOCK 金额不得超过对应 LOCK 金额；
5. Intent 进入终态时必须自动释放关联 LOCK；
6. 超时 LOCK 必须由后台任务自动释放；
7. 系统恢复时，未释放 LOCK 必须能和 open exchange order 或 intent 对账；
8. 对账时如果找不到对应外部订单或 intent，LOCK 必须释放并记录审计事件。

### 2.7 手续费处理

优先级：

1. **真实 fee**：优先使用成交事件或 CCXT 返回的实际 fee；
2. **估算 fee**：真实 fee 不可用时，根据订单角色使用 CCXT market 的 maker/taker rate：
   - post-only maker order → maker fee
   - IOC / market order / taker leg → taker fee
   - 角色不确定 → 使用更保守的 taker fee
3. **修正**：估算 fee 必须在之后被真实 fee 或对账结果修正。

### 2.8 Ledger、Balance 与 LOCK

Mr.Market 的余额系统采用 ledger-first 模型。用户余额是由不可变 Ledger Entry 推导出的结果。

| 对象 | 归属模块 | 职责 |
|------|----------|------|
| `LedgerEntry` | 资金层 / Ledger 模块 | 记录一笔不可变余额变化 |
| `BalanceReadModel` | 资金层 / Balance 模块 | 某个用户、某个资产的当前余额视图 |

每条 `LedgerEntry` 必须包含：`userId`、`assetId`、`amount`、`type`、`idempotencyKey`、`refType`、`refId` 和 `createdAt`。Ledger Entry 创建后不可修改；任何修正必须通过新的 ADJUSTMENT entry 表达。

余额字段由 ledger 聚合得到：

```text
total = available + locked
available = 可用于新 LOCK 的余额
locked = 已被 LOCK 锁定、尚未释放或结算的余额
```

| Ledger 类型 | 含义 |
|-------------|------|
| `DEPOSIT_CREDIT` | 用户入金确认 |
| `LOCK` | 下单前锁定余额，通过 `refType`/`refId` 关联 intent |
| `UNLOCK` | 释放锁定余额（涵盖取消、失败、过期等场景；具体原因通过 `refType` 和 `refId` 追溯，如 `intent.expired`、`intent.failed`、`order.cancelled`） |
| `MM_REALIZED_PNL` | 已实现盈亏 |
| `FEE_DEBIT` | 扣除手续费 |
| `WITHDRAW_DEBIT` | 提现或退款扣减 |
| `REWARD_CREDIT` | 奖励入账 |
| `ADJUSTMENT` | 余额修正（可正可负） |

不变量：

1. 所有余额变化只能通过 Ledger Entry 发生；
2. 同一个 `idempotencyKey` 只能产生一次有效 ledger 影响；
3. `available` 不得小于 0；
4. `locked` 不得小于 0；
5. 外部订单不得绕过 LOCK 直接占用资金；
6. Ledger Entry 不可更新、不可删除，修正只能追加 ADJUSTMENT 记录。

### 2.9 Ledger 并发与重建规则

Ledger Entry 是余额事实源；`BalanceReadModel` 是运行时查询和并发控制使用的 read model。任何余额变化必须在同一个数据库 transaction 中同时完成：

```text
validate idempotencyKey
  → append LedgerEntry
  → update BalanceReadModel
  → commit
```

如果 transaction 失败，Ledger Entry 和 `BalanceReadModel` 都不得生效。

#### 幂等性

每个会改变余额的操作必须提供稳定 `idempotencyKey`。同一个 `idempotencyKey` 重复提交时：

| 情况 | 处理 |
|------|------|
| 请求内容与已记录 ledger 一致 | 返回已有结果 |
| 请求内容与已记录 ledger 不一致 | 拒绝，并记录审计错误 |
| 原 transaction 未提交 | 不产生余额影响 |

#### 并发控制

`BalanceReadModel` 更新必须按 `userId + assetId` 串行化。实现可以使用数据库 row lock、乐观锁版本号或内存锁等价机制。无论采用哪种方式，必须保证：

1. `available` 不得被并发扣成负数；
2. 同一份 available 不得被两个 LOCK 同时锁定；
3. `LedgerEntry` 与 `BalanceReadModel` 不得出现一方成功、一方失败；
4. 余额检查和余额更新必须在同一 transaction 内完成。

#### Reversal

Ledger Entry 不可更新、不可删除。修正历史 entry 时，必须追加新的 `ADJUSTMENT` entry，并通过 `refType: 'adjustment'` 和 `refId` 指向原 entry。

```text
原 entry:      MM_REALIZED_PNL +10
修正 entry:    ADJUSTMENT     -10, refType='adjustment', refId=<originalEntryId>
```

被修正的原 entry 仍然保留在 ledger 中。余额重建时必须同时应用原 entry 和 ADJUSTMENT entry。

#### 重建规则

系统必须能够从 Ledger Entry 重建任意 `BalanceReadModel`：

```text
BalanceReadModel(userId, assetId)
  = Σ(LedgerEntry where userId and assetId)
```

重建用于：

- 修复 read model 损坏；
- 验证 `BalanceReadModel` 与 ledger 聚合是否一致；
- 灾难恢复；
- 审计历史余额。

若 `BalanceReadModel` 与 ledger 聚合结果不一致，以 ledger 为准。系统必须暂停受影响用户的新 LOCK，重建 read model，并记录审计事件。

## 3. 调度层规范

调度层是系统控制面，基于 NestJS 后端。它负责实例、订单、策略配置、生命周期、额度计算、任务调度和 API。

### 3.1 实例定义

一个实例是一个完整部署的 Mr.Market 服务器，可同时运行多个策略。

### 3.2 策略实例与用户订单

- 一个策略实例绑定一个 Mr.Market 用户订单；
- 一个策略实例绑定一个执行账户；
- 策略配置快照从用户订单创建或启动时固化；
- 后续交易、fill、fee、PnL 都必须能归因回该订单。

### 3.3 策略定义与配置快照

Mr.Market 的策略系统把“策略产品”和“策略代码”分开。

- **策略产品**：可以被用户选择、展示、配置和下单的策略模板；
- **策略代码**：真正生成报价、下单、撤单和风控动作的服务端 Controller。

数据库只保存策略产品和配置，不保存可执行策略代码。

#### 三个对象

| 对象 | 作用 | 是否可变 |
|------|------|----------|
| `StrategyDefinition` | 策略模板。定义名称、key、配置 schema、默认参数、可见性、能力声明和 `controllerType` | 可由后台管理 |
| `strategySnapshot` | 订单级策略快照。保存某个订单实际使用的已解析配置 | 创建后不可变 |
| `Strategy Controller` | 服务端内置策略逻辑。根据快照配置和市场状态生成 intent | 只能通过代码发布 |

#### 创建流程

创建做市订单时，系统按以下流程生成订单级策略快照：

```text
StrategyDefinition.defaultConfig
  + 用户传入的 configOverrides
  → configSchema 校验
  → decimal 字段规范化
  → MarketMakingOrder.strategySnapshot
```

`strategySnapshot` 至少包含：

| 字段 | 含义 |
|------|------|
| `strategyDefinitionId` | 来源策略定义 |
| `definitionKey` | 来源策略 key |
| `controllerType` | 绑定的内置 Controller 类型 |
| `resolvedConfig` | 订单实际使用的配置 |
| `resolvedAt` | 快照生成时间 |

订单进入运行时后，只能读取 `strategySnapshot.resolvedConfig`。后续修改 `StrategyDefinition` 不得改变已创建订单。

#### 可调范围

用户可以调整的是 Controller 已暴露的参数，例如：

- spread、订单金额、层数、刷新时间；
- 价格源、价格上下限、库存倾斜；
- 买卖方向、slippage、交易次数和间隔；
- EMA/RSI 阈值、时间窗口、止盈止损。

这些参数可以改变策略行为，但不能创造新的策略逻辑。

如果需要新增 signal、组合条件、执行状态机、hedging 规则或新的订单协调方式，必须新增或修改服务端 `Strategy Controller`，并注册新的 `controllerType`。

### 3.4 CEX 优先执行边界

第一版实施范围只包含 CEX 执行。

定义：

| 概念 | 定义 |
|------|------|
| 执行账户 | 一个交易所 API key |
| 混合资金 | API key 在交易所层面的资金 |
| 内部隔离 | 由 Mr.Market 内部账本和 Order Balance 执行 |
| 策略实例绑定 | 每个策略实例绑定一个订单和一个执行账户 |

约束：

1. 每个交易所订单和成交必须能归因回发起它的 Mr.Market 订单；
2. rate limit、open order limit、交易对冲突和 API key 健康状态共同限制一个执行账户可支持的订单数；
3. 交易层不能绕过账本直接修改用户余额。

### 3.5 订单生命周期

```text
payment_pending
  → payment_incomplete
  → payment_complete
  → (deposit_confirming → deposit_confirmed)?
  → (joining_campaign → campaign_joined)?
  → created
  → running ⇄ paused
  → stopping → stopped
  → withdrawing → withdrawal_confirmed → refunded

任意非终态 → failed
```

> 括号中的路径为可选流程。未启用外部提现时，`payment_complete` 可直接进入 `created`；未接入 campaign 时，跳过 `joining_campaign` / `campaign_joined`。

状态变更必须幂等。数据库是事实源，内存状态只作运行时缓存。

### 3.6 职责

| 职责 | 说明 |
|------|------|
| 订单管理 | 创建订单，绑定用户 |
| 配置固化 | 保存策略配置快照 |
| 生命周期 | 管理订单状态机转换 |
| 额度计算 | 计算 capital quota 和 execution quota |
| 任务调度 | 任务队列、tick loop、启动、停止、提现和对账 |
| API | HTTP API、管理接口、前端读取模型 |
| 审计 | 保存审计日志、状态变更、错误原因 |

### 3.7 两个原则

1. **数据库是事实源**：内存状态只能作为运行时缓存；
2. **幂等性**：所有会改变资金、订单或奖励的动作必须幂等。

### 3.8 状态机规范

所有会影响资金、订单、执行或奖励的对象必须有显式状态机。状态迁移必须幂等；重复请求不得产生重复资金影响。

#### 订单创建 Intent 状态

| 项 | 说明 |
|----|------|
| 归属模块 | 调度层 / User Orders 模块 |
| 状态对象 | `MarketMakingOrderIntent.state` |

```text
pending → in_progress → completed
                    ↘ expired
```

`MarketMakingOrderIntent` 表示用户创建市场做市订单的前置意图。`completed` 表示已生成正式 `MarketMakingOrder`；`expired` 表示该 intent 超时，不得继续用于创建订单。

#### 用户订单状态

| 项 | 说明 |
|----|------|
| 归属模块 | 调度层 / User Orders 模块 |
| 状态对象 | `MarketMakingOrder.state` |

```text
payment_pending
  → payment_incomplete
  → payment_complete
  → withdrawing
  → withdrawal_confirmed
  → deposit_confirming
  → deposit_confirmed
  → joining_campaign
  → campaign_joined
  → created
  → running
  → paused
  → stopped
  → refunded
  → deleted

任意非终态 → failed
```

`payment_complete` 表示订单资金已确认；`withdrawal_confirmed` 和 `deposit_confirmed` 表示资金转移路径已确认；`campaign_joined` 表示订单已绑定外部 campaign；`running` 表示策略可以产生 intent；`stopped` 表示没有活跃执行；`refunded`、`failed` 和 `deleted` 为终态。未启用外部提现或 campaign 接入时，流程可以停在 `payment_complete` 或直接进入 `created`。

#### LOCK 生命周期

资金锁定通过 Ledger Entry 的 LOCK / UNLOCK 类型表达，没有独立的 Reservation 实体。

| 项 | 说明 |
|----|------|
| 归属模块 | 资金层 / BalanceLedgerService |
| 实现方式 | LedgerEntry type = `LOCK` / `UNLOCK`，通过 `refType`/`refId` 关联 intent |

```text
LOCK（绑定 intentId）
  → 成交: MM_REALIZED_PNL / FEE_DEBIT / ADJUSTMENT
  → 取消/失败: UNLOCK
  → 超时: 后台任务自动 UNLOCK
```

LOCK 不可逆：只能通过对应的 UNLOCK entry 或成交结算 entry 释放。`BalanceReadModel.locked` 是所有未释放 LOCK 聚合后的派生视图。

#### Intent 状态

| 项 | 说明 |
|----|------|
| 归属模块 | 交易层 / Strategy Intent 模块 |
| 状态对象 | `StrategyOrderIntent.status` |

```text
NEW → SENT → ACKED → DONE
        ↘ FAILED
        ↘ CANCELLED
NEW → EXPIRED（超时未提交 worker）
SENT → EXPIRED（超时未收到 ACK）
```

`EXPIRED` 表示 intent 在预期时间内未被处理，必须释放其关联 LOCK。系统必须设置 intent 超时阈值，超时后 intent 自动进入 `EXPIRED`，关联 LOCK 由后台任务自动释放或进入人工处理。

`NEW` 表示 Controller 已产生执行意图；`SENT` 表示已提交给执行 worker；`ACKED` 表示交易所已接受；`DONE` 表示成交、撤单或无需继续处理。`FAILED` 和 `CANCELLED` 为终态。

#### 提现状态

| 项 | 说明 |
|----|------|
| 归属模块 | 资金层 / Withdrawal 模块 |
| 状态对象 | `Withdrawal.status` |

```text
pending → queued → processing → sent → confirmed → completed
                                      ↘ failed
                                      ↘ refunded
```

提现必须在策略停止、外部订单撤销、LOCK 释放后执行。`confirmed` 表示外部转账已确认；`completed` 表示提现流程已完成。`completed` 后不得回滚，只能通过新的 reversal entry 表达异常。

#### 奖励结算状态

| 项 | 说明 |
|----|------|
| 归属模块 | 奖励层 / Reward Pipeline 模块 |
| 状态对象 | `RewardLedger.status`、`RewardAllocation.status` |

```text
OBSERVED → CONFIRMED → DISTRIBUTED
```

如果奖励需要先转入 Mixin 或其他分发账户，则允许经过中间状态：

```text
CONFIRMED → TRANSFERRING_TO_MIXIN → TRANSFERRED_TO_MIXIN → DISTRIBUTED
```

用户级奖励分配按 allocation 跟踪：

```text
CREATED → CREDITED
```

`OBSERVED` 表示系统已观察到外部 reward transfer；`CONFIRMED` 表示链上或外部来源已确认；`DISTRIBUTED` 表示该 reward 已完成内部用户分配。`CREATED` 表示用户分配记录已生成；`CREDITED` 表示该分配已通过内部 ledger 计入用户余额。

奖励分配必须从已确认的 `RewardLedger` 产生。已 `CREDITED` 的用户奖励不得因后续 fee 配置、score 规则或 campaign 参数变更被重写；如需修正，必须通过新的 ledger reversal 或新的 reward 记录表达。

## 4. 交易层规范

### 4.1 执行链路

```text
Config → Controller → Action → Executor → State / Report
```

对应到 Mr.Market 数据流：

```text
Mr.Market order
  → strategy config snapshot
  → order balance / quota
  → exchange order
  → fill ledger
  → reward attribution
```

### 4.2 职责划分

| 组件 | 职责 |
|------|------|
| Controller | 根据策略配置和市场状态产生 Action |
| Executor | 下单、撤单、重试、限速、交易所错误处理 |
| Ledger | 记录余额变化（余额只能通过 Ledger 发生） |

### 4.3 约束

- 每个 exchange order 必须能映射回唯一 Mr.Market order；
- fill 进入系统后必须更新订单级余额、fee、PnL 和奖励归因基础；
- 交易层不能绕过 Ledger 直接修改用户余额。

### 4.4 Tick 执行规范

交易层采用 tick-driven runtime，但 tick 只负责推进时间和分发轻量信号，不承载长时间 I/O、交易所请求或数据库重写路径。

#### 4.4.1 Tick 协调器

系统由 Tick 协调器以固定间隔产生时间戳信号，并按优先级通知注册组件。

| 约束 | 说明 |
|------|------|
| Tick 只推进时间 | Tick 不直接执行策略决策、交易所 I/O 或余额结算 |
| 数据组件优先 | orderbook、user stream、balance freshness 必须先于策略组件更新 |
| 超时不排队 | 如果一次 tick 超时，下一次 tick 应被丢弃而非排队 |
| 健康检查前置 | 不健康组件跳过当次 tick，并记录原因 |

#### 4.4.2 数据流

交易层数据分为写路径、兜底轮询路径和读路径。

```text
写路径：WebSocket / user stream / orderbook task → 内存快照
兜底路径：REST poller → 修正过期或缺失快照
读路径：Controller → 只读快照 → 生成 action
```

| 约束 | 说明 |
|------|------|
| 写路径独立运行 | WebSocket、orderbook、balance watcher 不依赖 tick 消费队列 |
| Controller 只读快照 | 策略决策不得等待 REST、DB 或外部 API |
| REST 只做兜底 | REST poller 只在数据过期、缺失或对账需要时触发 |
| DB 写入异步化 | fill、intent、ledger、audit 写入不得阻塞 tick 主循环 |

#### 4.4.3 Controller 与 Intent

Controller 只产生 actions，不直接执行 side effect。Actions 转换为 intents 后，由 intent worker 独立执行。

```text
Tick
  → freshness check
  → Controller reads snapshot
  → Action[]
  → Intent Store
  → Intent Worker
  → LOCK / risk check / exchange order
  → fill / cancel / ledger settlement
```

| 约束 | 说明 |
|------|------|
| Controller 不下单 | Controller 只能生成 action / intent |
| Intent 批量写入 | 同一决策周期产生的 intents 应批量写入 |
| Worker 独立执行 | 下单、撤单、LOCK/UNLOCK 和 ledger settlement 在 worker 或执行服务中完成 |
| Per-strategy 串行 | 同一 strategy 的 intent 不得并发执行 |
| Per-exchange 限流 | 同一 exchange/account 的 intent 必须受 rate limit 和并发上限约束 |

#### 4.4.4 并行边界

| 边界 | 规则 |
|------|------|
| 不同 exchange + pair | 可以并行 |
| 同一 exchange + pair | 共享 orderbook 和账户状态，必须串行或显式加锁 |
| 同一 strategy | intent 串行执行 |
| 同一 `userId + assetId` | LOCK / balance mutation 串行执行 |

#### 4.4.5 不变量

1. Tick 不等待交易所下单、撤单或 `loadMarkets()`；
2. Controller 不直接修改余额、不直接调用 Ledger；
3. Controller 不直接调用交易所下单或撤单；
4. 下单前必须经过 risk check 和 LOCK；
5. fill/cancel 事件必须最终进入 ledger settlement 或 UNLOCK；
6. stale market data 下不得产生新的下单 intent；
7. tick 落后时丢弃过期 tick，不追赶执行历史 tick。

## 5. 奖励分配规范

### 5.1 两层模型

**第一层：HuFi recording oracle**

Mr.Market 通过 campaign id、web3 address 和 exchange API key 绑定到一个 campaign。Oracle API 提供该 API key 在 campaign 中的：
- 总 score
- 每日可查询的 payout token、daily payout amount 和 payout score

**第二层：Mr.Market 内部分配**

Mr.Market 只将自己从 campaign 中获得的每日 reward pool 分配给内部可归因的用户订单。

### 5.2 Internal Score 计算

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

### 5.3 平台费

```text
gross_daily_payout    = oracle_payout(campaign_id, day)
platform_fee           = gross_daily_payout × campaign_fee_rate
net_user_reward_pool   = gross_daily_payout - platform_fee
```

- 费率由管理员按 campaign 配置；
- fee 配置是 campaign-level 配置，只影响未来尚未结算的 reward day；
- 已结算的 daily allocation 不因管理员修改费率而被重写。

### 5.4 用户分配公式

```text
total_internal_score(campaign, day) = Σ(all eligible user_internal_scores for campaign day)

user_reward(campaign, day) = user_internal_score(campaign, day)
  / total_internal_score(campaign, day)
  × net_user_reward_pool(campaign, day)
```

### 5.5 不变量

```text
Σ(user_rewards) + platform_fee + undistributed_remainder = gross_daily_payout
Σ(user_rewards) ≤ gross_daily_payout

undistributed_remainder = net_user_reward_pool - Σ(user_rewards)
```

- `undistributed_remainder` 是比例分配中因 decimal 截断或取整产生的舍入差额；
- 当 `total_internal_score = 0` 时，`net_user_reward_pool` 全部成为 `undistributed_remainder`，不进行分配；
- 舍入规则：每个用户奖励向下取整到最小精度单位，差额归入 `undistributed_remainder`。
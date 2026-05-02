# HuFi 黄皮书：技术规范

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
  - [2.6 Reservation 规则](#26-reservation-规则)
  - [2.7 手续费处理](#27-手续费处理)
  - [2.8 Ledger、Balance 与 Reservation](#28-ledgerbalance-与-reservation)
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
    - [4.4.2 数据流分离](#442-数据流分离)
    - [4.4.3 决策循环](#443-决策循环)
    - [4.4.4 Intent 分发](#444-intent-分发)
    - [4.4.5 并行约束](#445-并行约束)
- [5. 奖励分配规范](#5-奖励分配规范)
  - [5.1 两层模型](#51-两层模型)
  - [5.2 Internal Score 计算](#52-internal-score-计算)
  - [5.3 平台费](#53-平台费)
  - [5.4 用户分配公式](#54-用户分配公式)
  - [5.5 不变量](#55-不变量)
- [6. 横向能力规范](#6-横向能力规范)
  - [6.1 跨层不变量](#61-跨层不变量)
- [7. 开放技术决策](#7-开放技术决策)

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
资金进入 → 订单余额 → 策略配置快照 → 额度 reservation → 交易所订单 → 成交和 fee → 账本、奖励和审计记录
```

## 2. 资金层规范

资金层负责资金进入、退出、归属确认和订单级余额事实源。资金层不决定策略，不承诺收益。

### 2.1 原则

| 原则 | 说明 |
|------|------|
| 归属 | 资金归属于具体 user order，而非仅 user 或钱包地址 |
| 可追踪 | 每笔入金、退款、提现和到账确认必须可追踪、可重放、可审计 |
| 职责边界 | 资金层只负责资金进入、退出和确认，不决定策略，不承诺收益 |
| 事实源 | 内部订单余额是运行时额度事实源，外部链/钱包/交易所余额只是证据来源 |

### 2.2 资金入口

近期：Mixin 入金和退款。后续：EVM、Solana 及其他链上入口。

### 2.3 订单余额模型（Order Balance）

Order Balance 是额度执行的事实源。余额绑定到具体 Mr.Market 订单，而非仅绑定用户或交易所账户。下单、成交、撤单、fee 和 PnL 都通过订单级余额更新。

### 2.4 余额字段

每个订单按资产维护以下字段：

| 字段 | 含义 |
|------|------|
| `available` | 可用于新 reservation 的额度 |
| `locked` | 已 reservation 但尚未成交的额度 |
| `total` | `available + locked` |
| `initialDeposit` | 初始入金金额 |
| `realizedDelta` | 已实现盈亏 |
| `feePaid` | 已支付手续费 |

### 2.5 资金隔离：额度（Quota）机制

资金隔离采用额度机制，而非交易所内物理资金分离。原因：交易所账户无法在内部对余额分区。

- 交易所账户持有混合资金；
- 每个订单获得订单级额度；
- 运行时确保订单的实时资金使用量不超过其额度；
- 同一执行账户上所有活跃订单额度之和不得超过该账户余额；
- 下单前必须 reservation；
- reservation 的事实源是 Order Balance。

### 2.6 Reservation 规则

Reservation 是 Mr.Market 内部的订单级资金锁定机制。它用于在外部交易所下单前占用订单余额，防止多个策略实例或多个 tick 重复使用同一份资金。

Hummingbot 类单用户 bot 通常可以依赖交易所余额和交易所挂单锁定；Mr.Market 不能只依赖交易所余额，因为多个用户订单可能共享同一个执行账户。交易所只看到混合资金，无法区分每笔资金属于哪个 Mr.Market order。因此，Mr.Market 必须在内部先完成 reservation，再允许外部下单。

```text
OrderBalance.available
  → reserve_lock
  → OrderBalance.locked
  → exchange order
  → fill_settle / reserve_release
```

#### 锁定资产

策略下单前必须先从订单余额中 reserve 额度。

| 订单方向 | 锁定资产 | 锁定量 |
|----------|----------|--------|
| 买单 | quote 资产 | `price × qty + estimatedFee` |
| 卖单 | base 资产 | `qty`，手续费按交易所 fee asset 规则另行估算或结算 |

如果交易所手续费可能从同一资产扣除，reservation 必须包含保守 fee buffer。真实 fee 不可用时，使用 taker fee 估算；真实 fee 到达后必须修正。

#### 生命周期

```text
requested → active → consumed
                  ↘ released
                  ↘ expired
                  ↘ failed
```

| 状态 | 含义 |
|------|------|
| `requested` | 系统请求锁定资金 |
| `active` | 资金已锁定，可以绑定外部订单 |
| `consumed` | 外部订单成交，锁定额度已结算 |
| `released` | 外部订单取消、失败或未成交部分释放 |
| `expired` | reservation 超时未绑定有效外部订单 |
| `failed` | 锁定失败，例如余额不足或并发冲突 |

#### 与 Ledger 的关系

Reservation 本身不是最终余额事实源。所有 reservation 对余额的影响必须通过 Ledger Entry 表达：

| 动作 | Ledger Entry |
|------|--------------|
| 创建 active reservation | `reserve_lock` |
| 释放未使用 reservation | `reserve_release` |
| 成交结算 | `fill_settle` + `fee_debit` |
| 冲正异常 reservation | `reversal` |

`OrderBalance.locked` 是 active reservation 聚合后的派生视图。

#### 不变量

1. 外部订单创建前必须有 active reservation；
2. 一个 reservation 只能绑定一个外部订单或一个明确的 intent；
3. active reservation 的总额不得超过该订单对应资产的 available 余额；
4. reservation 终态不可逆；
5. 外部下单失败必须释放 reservation；
6. 外部订单部分成交时，已成交部分 consumed，未成交部分继续 locked 或 released；
7. 系统恢复时，active reservation 必须能和 open exchange order、intent 或 tracked order 对账；
8. 如果找不到对应外部订单或 intent，过期 reservation 必须释放或进入人工处理。

### 2.7 手续费处理

优先级：

1. **真实 fee**：优先使用成交事件或 CCXT 返回的实际 fee；
2. **估算 fee**：真实 fee 不可用时，根据订单角色使用 CCXT market 的 maker/taker rate：
   - post-only maker order → maker fee
   - IOC / market order / taker leg → taker fee
   - 角色不确定 → 使用更保守的 taker fee
3. **修正**：估算 fee 必须在之后被真实 fee 或对账结果修正。

### 2.8 Ledger、Balance 与 Reservation

Mr.Market 的余额系统采用 ledger-first 模型。订单余额是由不可变 Ledger Entry 推导出的结果。

| 对象 | 归属模块 | 职责 |
|------|----------|------|
| `LedgerEntry` | 资金层 / Ledger 模块 | 记录一笔不可变余额变化 |
| `OrderBalance` | 资金层 / Balance 模块 | 某个订单、某个资产的当前余额视图 |
| `Reservation` | 资金层 / Reservation 模块 | 策略下单前对订单余额的临时锁定，详见 2.6 |

每条 `LedgerEntry` 必须包含：`orderId`、`asset`、`amount`、`type`、`idempotencyKey`、`refType`、`refId` 和 `createdAt`。Ledger Entry 创建后不可修改；任何修正必须通过新的 reversal entry 表达。

余额字段由 ledger 聚合得到：

```text
total = available + locked
available = 可用于新 reservation 的余额
locked = 已被 reservation 锁定、尚未释放或结算的余额
```

| Ledger 类型 | 含义 |
|-------------|------|
| `deposit_credit` | 用户入金确认 |
| `reserve_lock` | 下单前锁定余额 |
| `reserve_release` | 撤单、失败或过期释放锁定余额 |
| `fill_settle` | 成交后结算 base/quote 变化 |
| `fee_debit` | 扣除手续费 |
| `withdraw_debit` | 提现或退款扣减 |
| `reversal` | 冲正历史 entry |

不变量：

1. 所有余额变化只能通过 Ledger Entry 发生；
2. 同一个 `idempotencyKey` 只能产生一次有效 ledger 影响；
3. `available` 不得小于 0；
4. `locked` 不得小于 0；
5. 外部订单不得绕过 reservation 直接占用资金；
6. Ledger Entry 不可更新、不可删除，只能追加 reversal 记录。

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
等待入金 → 已入金 → 运行中 → 停止中 → 已停止
                ↘ 提现中 → 已退款
                          ↘ 失败
```

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

#### Reservation 状态

Reservation 模块是资金层的并发锁定机制，用来在外部订单执行前占用订单级余额，确保策略不能重复使用同一份资金。

| 项 | 说明 |
|----|------|
| 归属模块 | 资金层 / Reservation 模块 |
| 状态对象 | `Reservation.state`（目标对象；当前实现由 ledger reservation entry 和 balance lock 表达） |

```text
requested → active → consumed
                  ↘ released
                  ↘ expired
                  ↘ failed
```

`active` reservation 才能绑定外部订单。`consumed`、`released`、`expired`、`failed` 为终态，终态不可逆。

#### Intent 状态

| 项 | 说明 |
|----|------|
| 归属模块 | 交易层 / Strategy Intent 模块 |
| 状态对象 | `StrategyOrderIntent.status` |

```text
NEW → SENT → ACKED → DONE
        ↘ FAILED
        ↘ CANCELLED
```

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

提现必须在策略停止、外部订单撤销、reservation 释放后执行。`confirmed` 表示外部转账已确认；`completed` 表示提现流程已完成。`completed` 后不得回滚，只能通过新的 reversal entry 表达异常。

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

交易层的正确性不仅取决于做什么决策，还取决于决策在何时、以何种方式被触发和传递。本节定义 tick 的结构、数据流和时序约束。

#### 4.4.1 Tick 协调器

系统由一个 Tick 协调器驱动。Tick 协调器以固定间隔（`tickSizeMs`，默认 1000ms）产生时间戳信号，并按优先级顺序通知注册组件。

| 编号 | 约束 | 说明 |
|------|------|------|
| T1 | Tick 协调器只产生时间戳信号，不执行策略决策或 I/O | Tick 的职责是推进时间，不是执行业务逻辑 |
| T2 | 组件按优先级顺序接收 tick 信号 | 数据刷新组件（orderbook、user stream）必须在策略组件之前执行，确保策略读到最新数据 |
| T3 | 如果一次 tick 超时，下一次 tick 被丢弃而非排队 | 丢弃 tick 优于排队，因为排队会导致策略基于过时数据决策 |
| T4 | 组件健康检查在每次 tick 开始时执行 | 不健康的组件跳过当次 tick |

> **当前实现说明：** Tick 协调器串行 `await` 调用每个组件的 `onTick()` 本身不是问题；Hummingbot 类系统也通常使用串行 tick 来保持单线程确定性和共享状态一致性。需要关注的是 `onTick()` 内部是否混入网络 I/O、DB 写入或长时间策略决策。当前实现中相关风险主要体现在策略决策仍在 tick 路径内执行（见 4.4.3）。

#### 4.4.2 数据流分离

交易层的数据分为写路径、兜底轮询路径和读路径。写路径负责持续接收外部数据并更新内存快照；兜底轮询路径只在 WebSocket 静默或数据过期时用 REST 修正状态；读路径供策略消费快照。

```text
┌─────────────────────────────────────────────────────┐
│                     写路径                            │
│                                                      │
│  OrderBook WS task ──→ 内存 orderbook 快照           │
│  Balance WS task   ──→ 内存 balance 快照             │
│  User Stream task  ──→ 内存 fill/order 状态           │
│                                                      │
│  写路径按自己的节奏运行，不依赖 tick 触发              │
└────────────────────────┬────────────────────────────┘
                         │ 内存状态
┌────────────────────────▼────────────────────────────┐
│                    兜底轮询路径                        │
│                                                      │
│  tick 只读 last_recv_time / stale 状态                │
│  WebSocket 正常：REST 低频或不触发                     │
│  WebSocket 静默：唤醒独立 REST poll loop 修正状态       │
└────────────────────────┬────────────────────────────┘
                         │ 内存状态
┌────────────────────────▼────────────────────────────┐
│                     读路径                            │
│                                                      │
│  Controller 读取内存快照 → 决策 → 产出 Actions       │
│  Controller 不直接调 REST API 或 WebSocket            │
└─────────────────────────────────────────────────────┘
```

| 编号 | 约束 | 说明 |
|------|------|------|
| D1 | 写路径组件不依赖 tick 触发 | OrderBook 追踪、余额刷新、WebSocket 消费应有自己的 async task / queue，不由 tick 驱动 |
| D2 | 读路径组件只读内存快照，不调 REST API | Controller 决策只读已在内存中的 orderbook、balance、order 状态，不做网络请求 |
| D3 | tick 对数据流最多做只读 freshness 检查 | tick 可以读取 `last_recv_time`、stale flag 等轻量状态，用来调整 REST 兜底轮询频率，但不消费 WebSocket 队列 |
| D4 | 写路径回调只做内存更新和事件入队 | 收到 WebSocket 推送或 REST 响应后，同步段只更新内存变量或投递内部事件，不等待 DB 写入、网络请求或策略执行 |
| D5 | 所有持久化在独立循环或 intent 分发中完成 | DB 写入不在写路径回调中，也不在 Controller 决策循环的同步路径中 |

> **当前实现说明：** `OrderBookIngestionService` 和 `UserStreamIngestionService` 已经有独立 watcher 循环，方向正确。但当前仍有四类阻塞 tick 的路径需要迁移或收敛：
>
> 1. `UserStreamTracker.onTick()` 会 `await flushPendingEvents()`，其中可能执行 fill routing、DB mapping 查询和 `executor.onFill()` 分发。User stream 队列消费应迁移到独立 async task。
> 2. `OrderBookTracker.onTick()` 会 flush 内存 snapshot queue，风险较低，但 orderbook 队列 drain 也不应由 tick 驱动。
> 3. `StrategyService.onTick()` 会进入 controller decision path；当前决策路径仍可能触发 `getReferencePrice()` 的 orderbook/ticker REST fallback、`loadTradingRules()` 的首次 `loadMarkets()`，以及 intent DB 写入。
> 4. `ExecutorOrchestratorService` 仍保留 `intent_execution_driver === 'sync'` 路径，会在当前调用链同步 `consumeIntents()`；目标架构应只保留 worker 异步执行。
>
> 目标架构中，WS/OrderBook/UserStream 的队列消费应迁移到独立 async task；tick 最多只读 freshness 状态并唤醒 REST 兜底轮询。

#### 4.4.3 决策循环

每个 Controller 实例拥有独立的决策循环（control loop），按自身的 cadence 运行，不被外层 tick 直接调用。Controller 与 tick 的关系是间接的生产者-消费者关系：Strategy tick 推送 executor reports 并设置 `executors_update_event`，Controller 在自己的循环中读取内存快照并产出 actions，Strategy tick 再从 actions queue 消费并分发执行。

```text
Strategy.tick():
  reports = orchestrator.getAllReports()
  controller.executorsInfo = reports[controllerId]
  controller.executorsUpdateEvent.set()

  actions = controller.actionsQueue.drain()
  await dispatchActions(actions)

Controller.controlLoop():
  while running:
    await sleep(cadenceMs)
    if not executorsUpdateEvent.isSet():
      continue
    actions = decideActions(timestamp, snapshot)   ← 只读内存快照
    await actionsQueue.put(actions)
    executorsUpdateEvent.clear()
```

| 编号 | 约束 | 说明 |
|------|------|------|
| C1 | Controller 独立运行，不被 tick 直接调用 | Controller 有自己的 cadenceMs 和 control loop；tick 只推送 executor reports、设置 update event，并消费 actions queue |
| C2 | 决策只读内存快照 | `decideActions` 不等待网络请求、不等待 DB 查询、不等待外部信号 |
| C3 | Controller 输出 actions，不直接执行 side effect | Controller 只把 actions 写入队列；下单、撤单、停止 executor 由 Strategy tick 或 intent worker 消费后执行 |
| C4 | Executor 独立运行，不依赖 Controller tick | Executor 有自己的 control loop，止损、止盈、超时和关闭检查读取内存状态，不等待 Strategy tick |
| C5 | 不同 exchange 或 pair 的 Controller / Executor 可以并行运行 | 不同 exchange+pair 没有共享可变状态时，可以并行运行；同一 exchange+pair 内部保持串行或显式锁保护 |

> **当前实现说明：** 当前代码尚未采用 event/queue 结构：Controller 的 `decideActions` 仍在 `StrategyService.onTickForPooledExecutors` → `ExchangePairExecutor.onTick` → `runSession` 中被 tick 同步调用，违反 C1。当前实现也违反 C2：`decideActions` 内部可能调用 `getReferencePrice()`（缓存未命中时刷新 orderbook REST API）、`loadTradingRules()`（首次调用交易所 `loadMarkets()`）等，存在网络 I/O。`onTickForPooledExecutors` 当前已使用 `Promise.all` 并行不同 executor，方向正确；剩余问题是 Controller 决策、actions 产出和 intent 写入仍在 tick 调用链内。

#### 4.4.4 Intent 分发

Controller 产出的 Actions 转换为 Intents 后，通过 Intent Store 分发到执行层。

```text
Controller.decideActions()
  → Action[]
  → toIntents(actions)            ← 纯计算，无 I/O
  → batchUpsertIntents(intents)    ← 单次 DB 写入

Intent Store (DB)
  ← StrategyIntentWorkerService 轮询消费
  ← per-strategy 串行 + per-exchange 并发限制
```

| 编号 | 约束 | 说明 |
|------|------|------|
| I1 | 同一决策周期产出的 Intents 必须批量写入 | 不得串行逐条 `await upsertIntent`，使用 `batchUpsertIntents` 单次 DB 操作 |
| I2 | 下单和撤单是 fire-and-forget | 生成 order_id 后立即返回，执行在 Intent Worker 的独立循环中完成 |
| I3 | 每个 strategy 同一时间只处理一个 intent | per-strategy serialization 保证同一策略的 intent 不并发执行冲突 |
| I4 | 每个 exchange 的并发 intent 数有上限 | `intent_worker_max_in_flight_per_exchange` 默认 1，防止交易所 rate limit |
| I5 | Intent 状态机不可逆 | `NEW → SENT → ACKED → DONE`，`FAILED` 和 `CANCELLED` 为终态 |

> **当前实现说明：** 当前实现已满足 I1：`ExecutorOrchestratorService.dispatchActions()` 使用 `batchUpsertIntents(intents)` 批量写入，不再串行逐条 `await upsertIntent`。Worker 模式下 I2 满足，intent 写入 DB 后由 `StrategyIntentWorkerService` 独立轮询消费；I3 和 I4 也已通过 `inFlightStrategyKeys` 与 `maxInFlightPerExchange` 实现。仍存在两个问题：代码保留 `intent_execution_driver === 'sync'` 路径，sync 模式会在当前调用链同步 `consumeIntents()`，违反 I2，应移除；I5 目前只有状态类型和调用约定，`StrategyIntentStoreService.updateIntentStatus()` 未集中校验合法状态迁移和终态不可逆，需补状态机保护。

#### 4.4.5 并行约束

| 编号 | 约束 | 说明 |
|------|------|------|
| P1 | 不同 ExchangePairExecutor 可以并行 tick | 不同 exchange+pair 的 executor 操作不同的 orderbook、不同的 quota，无共享可变状态 |
| P2 | 同一 ExchangePairExecutor 内的 session 串行 tick | 同一 exchange+pair 的多个 session 共享 orderbook 快照和 balance 缓存，串行保证快照一致性 |
| P3 | Intent 批量写入不阻塞其他 executor | 一个 executor 的 intent 持久化不应延迟其他 executor 的决策 |

> **当前实现说明：** P1 已满足：`StrategyService.onTickForPooledExecutors` 当前使用 `Promise.all` 并行 tick 不同 `ExchangePairExecutor`。P2 已满足：`ExchangePairExecutor.onTick` 内部仍按 session 顺序 `for...of` + `await` 串行执行。P3 的旧问题（串行逐条 `await upsertIntent`）已不存在，当前使用 `batchUpsertIntents`；但 intent 批量写入仍发生在 `runSession()` → `publishIntents()` → `dispatchActions()` 的 session tick 调用链内，因此会阻塞该 session 所在 executor 的后续 session。目标架构应通过 Controller actions queue / intent writer 独立任务把 DB 写入移出 executor session tick。

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
```

## 6. 横向能力规范

| 能力 | 说明 |
|------|------|
| 账本（Ledger） | 所有余额变化只能通过 Ledger 发生 |
| 对账（Reconciliation） | 定期比较内部账本、交易所订单、交易所余额、Mixin 或链上记录 |
| 风控（Risk） | 检查余额不足、API key 异常、rate limit、交易对冲突、订单过期、异常成交 |
| 审计（Audit） | 任何人能从订单、资金、交易和奖励记录中复现一笔活动的结果 |
| 观测（Observability） | 运行状态、失败原因、执行延迟、成交质量和奖励分配可查询 |

### 6.1 跨层不变量

以下不变量跨资金层、调度层、交易层和奖励层生效：

| 编号 | 不变量 |
|------|--------|
| I1 | 数据库是事实源，内存状态只能作为运行时缓存 |
| I2 | 所有资金变化必须通过 Ledger Entry 表达 |
| I3 | Ledger Entry 不可变，修正只能追加 reversal entry |
| I4 | 每个 exchange order 必须能映射回唯一 Mr.Market order |
| I5 | 每个 fill 必须能归因到唯一订单、strategy snapshot 和执行账户 |
| I6 | 下单前必须先 reservation，成交后必须结算 reservation |
| I7 | 订单运行时配置必须来自 `strategySnapshot`，不得重新解析 `StrategyDefinition` |
| I8 | `StrategyDefinition` 变更不得影响已创建订单 |
| I9 | 同一幂等 key 的请求不得产生重复订单、重复 ledger 或重复提现 |
| I10 | 用户可领取奖励不得超过该订单可归因的净奖励份额 |
| I11 | 平台费、用户奖励和未分配余量之和不得超过外部确认的 gross reward |
| I12 | 交易层不得绕过 Ledger 直接修改用户余额 |
| I13 | 终态对象不得回到非终态，只能通过新对象或 reversal 记录表达后续变化 |
| I14 | decimal 金额、价格和数量在交易运行时必须使用字符串或 BigNumber 表达 |

这些不变量优先级高于具体模块实现。任何新策略、新执行入口、新链或新交易所集成都必须证明不破坏上述约束。

## 7. 开放技术决策

1. 策略配置快照的具体序列化格式？
2. Reservation 的并发控制模型：乐观锁还是悲观锁？
3. Internal score 的具体公式：是基于 fill volume、fill count 还是混合？
4. 对账检测到差异时的自动修正策略？
5. 多实例共享同一 API key 时的 rate limit 分区策略？
6. 订单状态机回滚条件：哪些失败需要人工介入？
7. 估算 fee 修正的最大容忍延迟？
8. Controller 独立循环的 cadence 调度机制：基于 asyncio.Event 通知还是基于 setTimeout 轮询？
9. 写路径组件从 TickComponent 迁移到独立 async task 的优先级排序？
10. Fill 路径事件驱动化的 PubSub 机制选择？

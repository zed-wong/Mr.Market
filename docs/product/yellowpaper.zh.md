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
  - [2.6 Reservation 规则](#26-reservation-规则)
  - [2.7 手续费处理](#27-手续费处理)
  - [2.8 Ledger、Balance 与 Reservation](#28-ledgerbalance-与-reservation)
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
| 事实源 | Ledger Entry 是余额事实源，OrderBalance 是运行时额度检查和 reservation 的 read model，外部链/钱包/交易所余额只是证据来源 |

### 2.2 资金入口

近期：Mixin 入金和退款。后续：EVM、Solana 及其他链上入口。

### 2.3 订单余额模型（Order Balance）

Order Balance 是运行时额度检查和 reservation 的 read model。余额绑定到具体 Mr.Market 订单，而非仅绑定用户或交易所账户。下单、成交、撤单、fee 和 PnL 都必须通过 Ledger Entry 表达，并更新订单级余额视图。

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
- reservation 读取 OrderBalance 执行额度检查；余额事实源是 Ledger Entry。

### 2.6 Reservation 规则

Reservation 是 Mr.Market 内部的订单级资金锁定规则，不要求一开始就是独立持久化领域对象。它用于在外部交易所下单前占用订单余额，防止多个策略实例、多个 worker 或多个 tick 重复使用同一份资金。

Hummingbot 类单用户 bot 通常可以依赖交易所余额和交易所挂单锁定；Mr.Market 不能只依赖交易所余额，因为多个用户订单可能共享同一个执行账户。交易所只看到混合资金，无法区分每笔资金属于哪个 Mr.Market order。因此，Mr.Market 必须在内部先完成 reservation，再允许外部下单。

Reservation 的规范重点是不变量，而不是表结构。MVP 实现可以用 `LedgerEntry` 的 `reserve_lock` / `reserve_release` 加上 intent 或 tracked order 上的稳定引用表达。只有当恢复、对账、部分成交和人工处理需要更多查询能力时，才引入独立 `Reservation` 表。

```text
risk check
  → reserve_lock + OrderBalance.available → OrderBalance.locked
  → bind reservation ref to intent / tracked order
  → exchange order
  → fill_settle / reserve_release
```

#### 锁定资产

策略下单前必须先从订单余额中 reserve 额度。锁定必须和余额检查在同一个原子操作中完成，不能先读 `available` 再异步下单。

| 订单方向 | 锁定资产 | 锁定量 |
|----------|----------|--------|
| 买单 | quote 资产 | `price × qty + estimatedFee` |
| 卖单 | base 资产 | `qty + estimatedFee` |

#### 生命周期语义

以下状态是业务语义，不强制要求有独立 `Reservation.state` 字段。实现可以由 ledger entry type、intent status、tracked order status 和审计记录共同表达。

```text
requested → active → consumed
                  ↘ released
                  ↘ expired
                  ↘ failed
                  ↘ manual_review
```

| 状态 | 含义 |
|------|------|
| `requested` | 系统准备锁定资金；可选状态，MVP 可以直接从检查进入 `active` |
| `active` | 资金已锁定，可以绑定外部订单 |
| `consumed` | 外部订单成交，锁定额度已结算 |
| `released` | 外部订单取消、失败或未成交部分释放 |
| `expired` | reservation 超时未绑定有效外部订单 |
| `failed` | 锁定失败，例如余额不足或并发冲突 |
| `manual_review` | 内部锁定与外部订单无法自动对齐，需要人工处理 |

#### 与 Ledger 的关系

Reservation 本身不是最终余额事实源。所有 reservation 对余额的影响必须通过 Ledger Entry 表达：

| 动作 | Ledger Entry |
|------|--------------|
| 创建 active reservation | `reserve_lock`，并从 `available` 转入 `locked` |
| 释放未使用 reservation | `reserve_release` |
| 成交结算 | `fill_settle` + `fee_debit` |
| 冲正异常 reservation | `reversal` |

`OrderBalance.locked` 是 active reservation 聚合后的派生视图。实现层可以用 `LOCK` / `UNLOCK` 之类枚举名，但必须能清晰映射到 `reserve_lock` / `reserve_release` 的业务语义。

#### 不变量

1. 外部订单创建前必须先成功执行订单级 `reserve_lock`；
2. 一个 active reservation 只能绑定一个明确 intent 或一个外部订单；
3. `reserve_lock` 必须按 `orderId + asset` 串行化，并且不得让 `available` 小于 0；
4. 外部下单失败、拒单或未返回有效订单 ID 时，必须释放已锁定额度或进入 `manual_review`；
5. 取消订单时，未成交部分必须 `reserve_release`；
6. 外部订单部分成交时，已成交部分 `consumed`，未成交部分继续 `locked` 或 `released`；
7. reservation 一旦进入终态，不能改回 active；修正只能通过新的 ledger entry 或 reversal 表达；
8. 系统恢复时，active reservation 必须能和 open exchange order、intent 或 tracked order 对账；
9. 如果找不到对应外部订单或 intent，过期 reservation 必须释放或进入人工处理。

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
| `Reservation` | 资金层规则，可选独立模块 | 策略下单前对订单余额的临时锁定；MVP 可以由 ledger entry + intent / tracked order 引用表达，详见 2.6 |

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

以上 ledger 类型是业务语义名称。具体代码枚举可以不同，但必须保持一一映射，并且不能用泛化 adjustment 掩盖下单锁定、释放、成交和手续费的业务原因。

### 2.9 Ledger 并发与重建规则

Ledger Entry 是余额事实源；`OrderBalance` 是运行时查询和并发控制使用的 read model。任何余额变化必须在同一个数据库 transaction 中同时完成：

```text
validate idempotencyKey
  → append LedgerEntry
  → update OrderBalance
  → commit
```

如果 transaction 失败，Ledger Entry 和 `OrderBalance` 都不得生效。

#### 幂等性

每个会改变余额的操作必须提供稳定 `idempotencyKey`。同一个 `idempotencyKey` 重复提交时：

| 情况 | 处理 |
|------|------|
| 请求内容与已记录 ledger 一致 | 返回已有结果 |
| 请求内容与已记录 ledger 不一致 | 拒绝，并记录审计错误 |
| 原 transaction 未提交 | 不产生余额影响 |

#### 并发控制

`OrderBalance` 更新必须按 `orderId + asset` 串行化。实现可以使用数据库 row lock、乐观锁版本号或等价机制。无论采用哪种方式，必须保证：

1. `available` 不得被并发扣成负数；
2. 同一份 available 不得被两个 reservation 同时锁定；
3. `LedgerEntry` 与 `OrderBalance` 不得出现一方成功、一方失败；
4. 余额检查和余额更新必须在同一 transaction 内完成。

#### Reversal

Ledger Entry 不可更新、不可删除。修正历史 entry 时，必须追加新的 `reversal` entry，并通过 `reversalOf` 或等价引用指向原 entry。

```text
原 entry:      fill_settle +10
修正 entry:    reversal    -10, reversalOf=<originalEntryId>
```

被 reversal 的 entry 仍然保留在 ledger 中。余额重建时必须同时应用原 entry 和 reversal entry。

#### 重建规则

系统必须能够从 Ledger Entry 重建任意 `OrderBalance`：

```text
OrderBalance(orderId, asset)
  = Σ(LedgerEntry where orderId and asset)
```

重建用于：

- 修复 read model 损坏；
- 验证 `OrderBalance` 与 ledger 聚合是否一致；
- 灾难恢复；
- 审计历史余额。

若 `OrderBalance` 与 ledger 聚合结果不一致，以 ledger 为准。系统必须暂停受影响订单的新 reservation，重建 read model，并记录审计事件。

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

#### 设计判断

| 对象 | 作用 | 是否可变 |
|------|------|----------|
| `StrategyDefinition` | 策略模板。定义名称、key、配置 schema、默认参数、可见性、能力声明和 `controllerType` | 可由后台管理 |
| `strategySnapshot` | 订单级策略快照。保存某个订单实际使用的已解析配置 | 创建后不可变 |
| `Strategy Controller` | 服务端内置策略逻辑。根据快照配置和市场状态生成 intent | 只能通过代码发布 |

Mr.Market 没有把策略系统设计成“无限组合”的规则引擎，因为策略逻辑一旦允许任意拼装，调度、风控、reservation、intent 和状态机都会失去清晰边界。因此，真正可执行的策略逻辑收敛在服务端内置的 `Strategy Controller` 中；如果要支持新的策略大类，就新增或修改 Controller，而不是通过配置绕出新逻辑。但策略参数本身是开放的，同一个 Controller 可以对应无限多组参数。`StrategyDefinition` 定义哪些参数可配置、类型和默认值是什么；`strategySnapshot` 则在订单创建或启动时固化当时的配置版本。这样后台可以继续更新策略定义，但已存在订单不会被静默改写。旧订单是否升级到新定义，应该是显式选择，而不是系统默认行为。

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

#### Reservation 生命周期

Reservation 是资金层的并发锁定规则，用来在外部订单执行前占用订单级余额，确保策略不能重复使用同一份资金。

| 项 | 说明 |
|----|------|
| 归属 | 资金层规则；可选独立模块 |
| 状态载体 | MVP 由 ledger entry、intent status、tracked order status 和审计记录表达；需要更强查询和人工处理能力时再引入 `Reservation.state` |

```text
requested → active → consumed
                  ↘ released
                  ↘ expired
                  ↘ failed
                  ↘ manual_review
```

`active` reservation 才能绑定外部订单。`consumed`、`released`、`expired`、`failed`、`manual_review` 为终态或暂停态，不能无审计地回到 `active`。

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
  → reservation / risk check / exchange order
  → fill / cancel / ledger settlement
```

| 约束 | 说明 |
|------|------|
| Controller 不下单 | Controller 只能生成 action / intent |
| Intent 批量写入 | 同一决策周期产生的 intents 应批量写入 |
| Worker 独立执行 | 下单、撤单、reservation 和 ledger settlement 在 worker 或执行服务中完成 |
| Per-strategy 串行 | 同一 strategy 的 intent 不得并发执行 |
| Per-exchange 限流 | 同一 exchange/account 的 intent 必须受 rate limit 和并发上限约束 |

#### 4.4.4 并行边界

| 边界 | 规则 |
|------|------|
| 不同 exchange + pair | 可以并行 |
| 同一 exchange + pair | 共享 orderbook 和账户状态，必须串行或显式加锁 |
| 同一 strategy | intent 串行执行 |
| 同一 `orderId + asset` | reservation / balance mutation 串行执行 |

#### 4.4.5 不变量

1. Tick 不等待交易所下单、撤单或 `loadMarkets()`；
2. Controller 不直接修改余额、不直接调用 Ledger；
3. Controller 不直接调用交易所下单或撤单；
4. 下单前必须经过 risk check 和 reservation；
5. fill/cancel 事件必须最终进入 ledger settlement 或 reservation release；
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
```

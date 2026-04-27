# HuFi 白皮书唯一事实源

状态：草稿
日期：2026-04-27

本文档是 HuFi 白皮书、Mr.Market 路线图、HuFi 100 愿景，以及 HuFi 稳定币的源设计框架。

它的任务：

- 把长期论点定义得足够清楚，让产品、架构和路线图决策可以围绕它对齐；
- 把已经承诺的产品范围，与尚未准备进入实施阶段的研究想法区分开。

## 1. 核心论点

流动性获取应该从依赖关系的服务，变成由规则驱动的基础设施能力。

> Mr.Market 是一个做市运行时和活动执行基础，用于逐步构建一个由规则驱动的流动性层。

长期表述是：

> HuFi 可以成为一个流动性基础设施层，其中活动、执行、奖励和质量衡量由显式机制治理，而不是由私下谈判决定。

## 2. 主要用户

### 流动性需求方

主要用户是希望为某个资产获得有效流动性的代币或项目创始人。

他们关心：

- 可见的流动性和交易深度；
- 市场可信度和活跃度；

在第一个阶段，流动性需求方和资金提供方通常是同一个人。创始人创建活动、注入活动资金，并希望 Mr.Market 运行一个策略来改善流动性。

### 运营者和策略构建者

他们配置基础设施、发布策略、监控故障、运行Mr.Market实例，并赚取奖励。

## 3. 实例和策略模型

实例是一个完整部署的 Mr.Market 服务器。它同时运行多个策略，资金隔离采用额度quota机制，而非物理资金分离。交易所账户持有混合资金。每个策略实例被分配一个源自其订单的额度。运行时确保订单的实时资金使用量不超过其额度。这样设计是因为交易所账户无法在内部对余额进行分区。系统在每个订单层面追踪使用量，并在交易时执行限额。

冲突防止规则：

- 在交易所执行下单时，交易所内的订单关联用户订单的ID；
- 同一交易所上所有活跃策略额度之和不得超过该交易所账户余额。

### CEX 优先执行边界

第一阶段的实施范围只包含 CEX 执行。

对于 CEX 优先模型：
- 一个交易所 API key 是一个有边界的执行账户；
- 该 API key 持有的资金在交易所层面是混合资金；
- 订单级资金隔离由内部账本执行，而不是由交易所执行；
- 每个策略实例绑定到一个订单和一个执行账户；
- 每个交易所订单和成交都必须能归因回发起它的订单账本；
- rate limit、open order limit、交易对冲突和 API key 健康状态共同限制一个执行账户可以支持多少订单。

Mr.Market order balance 是 quota 执行的事实源。余额必须绑定到具体 Mr.Market order，而不是只绑定 user 或 exchange account。每个订单按资产维护 `available`、`locked`、`total`、`initialDeposit`、`realizedDelta` 和 `feePaid`。策略下单前必须先从该 order balance 中 reserve quota

每个 exchange order 必须只归属于一个 Mr.Market order，并记录本次下单的 quota reservation 和执行摘要。买单锁定 quote 资产，额度为 `price * qty + estimatedFee`；卖单锁定 base 资产，额度为 `qty + estimateFee`。成交后，系统按 fill 更新订单级余额；撤单后，未成交部分的 locked quota 释放回 available。

交易 fee 应该尽可能精确。优先使用成交事件或 CCXT 返回的真实 fee；如果真实 fee 不可用，则根据订单角色使用 CCXT market 的 maker/taker fee 计算。post-only maker order 使用 maker fee，IOC、market order 或 taker leg 使用 taker fee；角色不确定时使用更保守的 taker fee。估算 fee 必须在之后被真实 fee 或对账结果修正。

## 4. Campaign reward 分配

HuFi campaign reward 在 Mr.Market 中的分配模型有两层：

第一层由 HuFi recording oracle 决定：Mr.Market 作为 campaign 参与者，通过 campaign id、web3 address 和 exchange API key 绑定到一个 campaign。recording oracle API 会更新该 API key 在 campaign 中的总 score，并提供每天可查询的 payout token、daily payout amount 和 payout score。

第二层由 Mr.Market 内部执行：Mr.Market 只把自己从 campaign 中获得的每日 reward pool 分配给内部可归因的用户订单。HuFi oracle score 决定 Mr.Market 作为一个整体可以获得多少 reward；Mr.Market internal score 决定这笔 reward 在内部用户订单之间如何拆分。

### Internal score

Mr.Market 每天扫描所有已加入的 campaign，并根据 campaign id 计算该日内部 score。 Mr.Market 计算每个 user order 的 internal score。这个 internal score 不是替代 HuFi oracle score，而是 Mr.Market 内部用于拆分每日 campaign payout 的归因 score。

```text
eligible_fills =
  exchange fills
  where
    and fill.executed_at >= campaign_start_time
    and fill.executed_at < campaign_end_time
    and fill.api_key_id = campaign.api_key_id
    and fill.order_id is attributable to a Mr.Market user order
```

### Platform fee

Mr.Market 可以从 campaign reward 中收取 platform fee。fee rate 由管理员配置，可以按 campaign 设置，例如 10% 或 50%。 platform fee 在用户分配之前从每日 gross payout 中扣除：fee 配置应该是 campaign-level 配置，并且只影响未来尚未结算的 reward day。 已经结算的 daily allocation 不应该因为管理员之后修改 fee rate 而被重写。
```text
gross_daily_payout = oracle_payout(campaign_id, day)
platform_fee = gross_daily_payout * campaign_fee_rate
net_user_reward_pool = gross_daily_payout - platform_fee
```

### 用户分配公式

对每个 campaign day：
```text
total_internal_score(campaign, day) = sum(all eligible user_internal_scores for campaign day)

user_reward(campaign, day) = user_internal_score(campaign, day)
  / total_internal_score(campaign, day)
  * net_user_reward_pool(campaign, day)
```
Mr.Market 对任意 campaign day 的分配必须满足：
```text
sum(user_rewards)
+ platform_fee
+ undistributed_remainder
= gross_daily_payout
```
```text
sum(user_rewards) <= gross_daily_payout
```

## 5. 整体架构设计

整体架构分为三层：资金层、调度层、交易层。

核心数据流是：

```text
资金进入
  -> 订单余额
  -> 策略配置快照
  -> 额度 reservation
  -> 交易所订单
  -> 成交和 fee
  -> 账本、奖励和审计记录
```

### 资金层

资金层负责把外部资金变成 Mr.Market 内部可核算的订单余额。

近期优先支持 Mixin 入金和退款；之后再扩展 EVM、Solana 和其他资金来源。不同资金入口可以不同，但进入系统后必须变成同一种内部事实：

- 资金归属于具体 user order，而不是只归属于 user 或钱包地址；
- 每笔入金、退款、提现和到账确认都必须可追踪、可重放、可审计；
- 资金层只负责资金进入、退出和确认，不负责决定策略，也不承诺收益；
- 外部链、钱包和交易所余额只是证据来源，内部订单余额才是运行时额度事实源。

### 调度层

调度层是系统控制面，目前主要是 NestJS 后端。 它负责把用户意图变成可执行的、可审计的状态机：

- 创建订单和绑定用户；
- 固化策略配置快照；
- 管理订单生命周期：等待入金、已入金、提现中、运行中、停止中、已停止、失败、退款；
- 计算 capital quota 和 execution quota；
- 调度任务队列、tick loop、启动、停止、提现和对账；
- 提供 HTTP API、管理后台接口和前端读取模型；
- 保存审计日志、状态变更、错误原因和人工处理入口。

调度层是系统最复杂的部分，因为它同时连接资金、交易、奖励、前端和运维。它必须遵守两个原则：

- 数据库是事实源，内存状态只能作为运行时缓存；
- 所有会改变资金、订单或奖励的动作都必须幂等。

### 交易层

交易层负责执行策略。交易引擎可以参考 Hummingbot 的职责拆分：

```text
Config -> Controller -> Action -> Executor -> State / Report
```

Mr.Market 的链路是和订单绑定的：

```text
Mr.Market order
  -> strategy config snapshot
  -> order balance / quota
  -> exchange order
  -> fill ledger
  -> reward attribution
```

交易层的核心职责：

- controller 根据策略配置和市场状态产生 action；
- executor 负责下单、撤单、重试、限速和交易所错误处理；
- 每个 exchange order 必须能映射回唯一 Mr.Market order；
- fill 进入系统后必须更新订单级余额、fee、PnL 和 reward 归因基础；
- 交易层不能绕过 ledger 直接修改用户余额。

### 横向能力

三层之外还需要几项横向能力，否则系统无法成为可信的流动性基础设施：

- 账本：所有余额变化只能通过 ledger 发生；
- 对账：定期比较内部账本、交易所订单、交易所余额、Mixin 或链上记录；
- 风控：检查余额不足、API key 异常、rate limit、交易对冲突、订单过期和异常成交；
- 审计：任何人应该能从订单、资金、交易和奖励记录中复现一笔活动的结果；
- 观测：运行状态、失败原因、执行延迟、成交质量和 reward 分配都要可查询。


---

## 6. 产品模式决策

第一种产品模式不应该是黑箱盈利机器人。
糟糕的 v1 承诺：
> 存入资金，然后机器人会尽其所能最大化盈利。
这个承诺隐含了组合优化、交易所选择、交易对选择、风险评分、策略选择、回撤控制，以及亏损责任。
更好的 v1 承诺：
> 创建或资助一个活动，选择一个流动性目标，然后让 Mr.Market 引导执行设置。

产品模式：
- 引导模式：创始人选择目标，系统推荐策略、交易所、交易对、资金拆分和风险设置；
- 高级模式：专家手动选择交易所、交易对、策略、配置和活动关联；
- 自主盈利模式：未来研究方向，不属于 v1。



## 7. HuFi 100

HuFi 100 是长期愿景章节和研究议程，不是当前实施范围。

这个想法是：

> HuFi 100 可以成为最强 HuFi 实例的指数，在精神上类似于一个面向"由活动支持的链上经济实体"的 S&P 500。

尚未解决的难题是衡量。在衡量方法可信之前，HuFi 100 只是排行榜。排行榜可以被操纵。指数需要一套可辩护的方法论。

### 实例作为类公司实体

如果每个实例都被视为类似公司的实体，系统必须定义这个实例实际拥有什么：

- 活动金库；
- 交易资本；
- 奖励预算；
- 策略历史；
- 流动性深度；
- 交易量质量；
- 存续时长；
- 参与者活跃度；
- 已实现 PnL；
- 回撤；
- 滥用评分；
- 治理或创建者身份；
- 审计轨迹。

### 候选衡量维度

这些是研究维度：

- 流动性质量：价差、深度、在线时间、滑点降低、订单持续性；
- 交易量质量：对手方多样性、maker/taker 平衡、有机订单流信号、反自成交证据；
- 资本效率：每一美元资本产生的有效流动性；
- 奖励效率：每一单位奖励支出带来的流动性改善；
- 存续能力：奖励下降后的流动性持久度；
- 风险：回撤、库存失衡、提现失败、交易所集中度；
- 信任和可审计性：日志完整性、账本状态、链上记录、交易所记录；
- 抗滥用能力：刷量评分、循环交易、虚假深度衰减、重复自成交。

### 准入门槛开始时应该保守

在满足最低证据要求之前，一个实例不应该有资格进入 HuFi 100：

- 它已经运行了最短要求时长；
- 活动资本和奖励流向已有记录；
- 策略执行日志完整；
- 流动性质量超过基线；
- 滥用评分低于阈值；
- 会计缺口已经解决；
- 方法论可以从已存储数据中复现。

HuFi 100 不应该驱动近期实施。近期应该构建基础，让 HuFi 100 在未来成为可能：

1. 活动执行；
2. 实例会计；
3. 指标和滥用检测；
4. 方法论实验；
5. 指数发布。

## 8. HuFi 稳定币

HuFi 稳定币是长期愿景章节和研究议程，不是当前的实施范围。

只有当campaign行为为以下事项创造真实、反复出现的需求时，稳定币才有正当性：

> HuFi 100 是声誉和衡量层。稳定币位于campaign行为和衡量之后，而不是系统的基础。

近期稳定币工作应该仅限于研究问题：

- 真实活动中存在什么结算摩擦？
- 用一个稳定单位理解奖励是否更容易？
- 稳定单位会降低活动金库风险，还是增加风险？
- 什么储备模型在法律和运营上是现实可行的？
- 稳定币使用会改善流动性形成，还是只会增加代币复杂度？

## 9. 路线图

### 阶段 1：自筹资金活动运行时

目标：

- 创始人可以资助一个活动，并安全地运行流动性。

要求：

- 每个策略实例的额度源自订单余额，运行时执行额度约束；
- 策略实例关联到订单，成交归属到对应策略；
- 可靠的启动、停止、提现和对账；
- 用户可见的执行状态；
- 基础奖励核算。

### 阶段 2：引导式活动创建

目标：

- 创始人可以在不理解每一个策略参数的情况下选择流动性目标。

要求：

- 基于目标的设置流程；
- 推荐策略模板；
- 风险披露；
- 资金要求估算；
- 高级覆盖路径。

### 阶段 3：实例会计

目标：

- 每个由活动支持的实例都有持久的经济记录。

要求：

- 资本历史；
- 奖励历史；
- PnL 历史；
- 流动性质量指标；
- 执行故障记录；
- 滥用标记；
- 审计导出。

### 阶段 4：衡量研究

目标：

- 测试 HuFi 是否可以可信地对实例排序。

要求：

- 候选指标看板；
- 反操纵测试；
- 历史方法论回测；
- 公开方法论草案。

### 阶段 5：HuFi 100 研究发布

目标：

- 先以方法论形式发布 HuFi 100，再把它产品化为指数。

要求：

- 准入规则；
- 权重规则；
- 排除规则；
- 更新节奏；
- 抗操纵分析。

### 阶段 6：稳定币研究

目标：

- 判断 HuFi 稳定币是否解决了真实结算问题。

要求：

- 可观察到的结算需求；
- 储备模型；
- 风险模型；
- 法律审查；
- 集成计划。

## 开放决策

这些决策有意保持未解决状态。

1. 哪些具体指标可以让一个实例有资格进入 HuFi 100？
2. HuFi 100 应该只排名由活动支持的实例，还是排名任何运行策略的实例？
3. 创始人资助的活动是否应该在 v2 允许外部资金提供者参与，还是应该把它保留到更晚的市场阶段？
4. 最小可行的引导模式设置流程是什么？
5. 应该如何展示活动交易 PnL，同时避免暗示保证盈利？
6. 什么收入模型能与可信流动性对齐，而不是与刷量对齐？
7. 稳定币研究是否应该只在活动交易量达到某个阈值后开始？
8. 哪些滥用信号足够强，可以把一个实例从排名中排除？
9. 执行的哪些部分必须能被外部观察者验证？
10. 在流动性层论点开始变弱之前，可以接受多大程度的运营者自由裁量？



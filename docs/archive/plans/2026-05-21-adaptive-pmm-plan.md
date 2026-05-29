# 自适应 PMM 策略改造方案

## 这事儿想干嘛

现在的做市策略像个机器人，**不管市场什么样都按一套固定参数挂单**：价差固定、单量固定、刷新频率固定。
我们想让它**会看脸色**：市场抖了就挂宽点、单量小点；市场平稳就密集挂赚频率；手里货太多就多挂卖少挂买。

但这是个**渐进改造**，不重写策略，也不动钱、不动下单的部分——下单的事还是交给原来那帮"干活的服务"。

---

## 1. 现在已经有什么

得先承认，现在的策略**不是完全死的**，下面这些"会看脸色"的能力已经有了：

- **库存偏斜**：手里 BTC 多了，自动多挂卖
- **Maker 偏置**：可以让两边都挂得宽一点，保证是 maker 不是 taker
- **价格带保护**：超过设定上下限就一边停挂
- **过期单替换**：价格漂太远就撤了重挂
- **熔断**：出大事自动停
- **手续费下限**：再窄的价差也不能比手续费还窄

**真正死的参数只有这几个**：基础价差、单量、刷新时间、层数、参考价用什么。
**这次就是要把这 5 个变活。**

---

## 2. 哪些事策略不管（划清边界）

加智能之前先说清楚，**有些事不是策略该管的**，硬塞进来只会越加越乱：

- **市场闪崩** → 由熔断和价格带兜底。但**现在的熔断只看已实现亏损 + 价格带要用户配**，闪崩时未必能立刻识别。**所以 Phase 0 必须顺手补一个「市场波动熔断」**：当 σ 或最近 N 秒价格变动超阈值（如 60s 内 mid 变动 > `marketCrashBps`），立刻进入 §3.8 hard stale 同等处理（撤光 + 暂停 + 告警）。这一条不是 adaptive 信号，是和老 killSwitch 平级的硬开关。
- **手里货深度套牢**（成本远高于现价） → 这是**风险状态**，不是策略要去解决的问题。策略可以：减少卖侧单量、严重时暂停卖侧、告警通知。但**不保证按成本价卖出**——硬卡价格反而会让卖单挂不到，库存越来越偏。真正的平仓交给人工或对冲程序。
- **交易所宕机** → 由对账和订单状态机管恢复
- **资金安全** → 三层架构本身保证

策略只管一件事：**在正常市场里、有点小异常时，让报价跟着环境变**。

通用规矩：

- 所有信号都从**已经缓存的数据**里读，绝不在挂单决策时去问交易所
- 所有新加的配置都是**可选的**，不开就跟现在一样
- 每个改进都能**单独开关**，方便灰度
- 关键数值都打日志，出问题能查

---

## 3. 设计时要避开的 10 个坑

这 10 条是规则，不是建议。

**1. 想算波动率，得先有历史价格**
现在只存"最新盘口"，没存"过去一分钟中间价怎么走的"。波动率算不出来。**Phase 0 必须先补这个**。

**2. 算波动率不能临时去问交易所**
现在有些方法找不到缓存就去发 REST 请求兜底。**新加的方法不能这么干**，找不到就说"我不知道"，让策略退到安全模式。

**3. 波动率的单位别搞错**
价差是个比例数字（比如 0.1%），不能直接把"价格的标准差"加上去。要算**收益率的标准差**（log return），再乘以系数。

**4. JSON schema 有些写法不支持**
现在用的校验器不支持 `maximum`、`integer` 这些。要么扩展校验器，要么自己在代码里再校验一遍。

**5. 改了单量，别忘了"什么时候撤旧单"**
现在判断要不要撤单只看价格变化。如果只把单量变小了，旧单永远不会被撤换。**得加上"单量变化超过阈值也撤"**。

**6. 改刷新频率不能只改启动时的算法**
现在刷新时间在策略启动时算一次，之后一直用这个值。**得让它每个 tick 都能更新**。

**7. 算"成交后吃亏没"别从数据库查**
不要为了这个统计在 tick 里查数据库。改成：成交时记一笔"X 秒后来评估"，到时间了用缓存的中间价历史去算。

**8. 数据过期要分三档处理**（这条最容易写错）

阈值是**配置项**，下表是默认值，不要写死：

| 数据多老 | 怎么办 |
|---|---|
| `< staleSoftMs`（默认 2000） | 维持现有挂单，**不撤不挂** |
| `staleSoftMs ~ staleHardMs`（默认 2000~10000） | **把所有挂单都撤了**，但不挂新单，等数据 |
| `≥ staleHardMs`（默认 10000） | 熔断 / 暂停，等数据恢复 + warmup |

绝对不能用过期数据算新报价。

**9. 多个信号矛盾时谁说了算**（关键）

比如市场在涨（imbalance 说"顺势收紧卖价"），但你手里 BTC 越来越少（库存说"要补 BTC，收紧买价"），听谁的？

定死优先级（**高的压低的，不是简单加权**）：

1. **安全门**（熔断、价格带、数据过期、对账失败） → 一票否决
2. **库存信号**（基于账本真实持仓） → 库存偏得越多，越压住下面的信号
3. **毒性保护**（被反复套利就拉宽那一边）
4. **波动率**（决定价差、单量、刷新频率）
5. **microprice**（只调参考价，不调价差）
6. **盘口不平衡** → 优先级最低，库存严重偏离或薄盘时**直接当 0**

**10. 启动 / 恢复后要先"热身"**

**先说为什么不是「等所有信号完备再挂单」**：

**最高原则是资产安全**。但"不挂单"≠"安全"——它只在**信号完全不可信时**才是最安全的选择。信号已经够支撑保守报价时，**完全不挂单反而引入新风险**：库存停在重启前的旧状态、市场已经变了你却不动、对账数据也没有新的成交可以校验。

所以策略状态分三档，**资产安全门槛从严到松**：

| 信号状态 | 做法 | 资产安全怎么保证 |
|---|---|---|
| **完全不可信**（连 mid 都没有 / 数据 hard stale / 对账失败 / 闪崩） | **安全门**：撤光所有挂单，不挂新单 | 没有暴露面，0 风险 |
| **部分可信**（mid 有了，但 σ / 毒性分 / 库存信号还没全到位） | **热身**：用更宽的价差 + 更小的单量 + 1 层 | 暴露面极小，单笔最大亏损可控；即使错了也亏得少 |
| **全部可信** | 满负荷 adaptive | 由 adaptive 信号本身保证 |

**为什么不能"等全部信号完备"再挂**：

- **永远不会完备**：σ 是滚动窗口，新样本一直来。如果等"完备"，等到什么时候是头？
- **库存暴露不会因为不挂单消失**：手里已经有的 base / quote 还在，市场跌了照样亏。挂保守的 maker 单反而能慢慢调整库存。
- **竞争对手不等你**：大雾散一半的时候，别人已经在路上了。

热身分两种，**别混在一起**：

**(a) 全局热身**：服务重启、数据长时间断了之后恢复、交易所维护后恢复

热身期内：
- 双边价差用**正常值和热身值取最大**
- 双边单量缩到 20%
- 双边层数压到 1
- 信号样本不够就一直热身

**(b) 单边热身**：毒性冷却解除后

只对**被冷却的那一侧**渐进恢复：
- 那一侧价差从 cooldown 拉宽值线性收回基础值
- 那一侧单量从 cooldown 缩量值线性回到正常
- 另一侧不受影响

两种热身都**允许成交、允许学习信号**，但**不能让自适应信号在这时候加仓**。

---

## 4. 怎么分阶段做

每个阶段一个独立 PR，顺序来。

### 4.0 这次到底怎么改代码（按现有 codebase 落地）

这次不是重做一套策略框架，而是在现有结构上补四层能力：

#### 1. 通用 market data signal layer（补底座，不写 PMM 决策）

现状已经有：
- `modules/market-making/trackers/order-book-tracker.service.ts`：保存最新 order book 和更新时间。
- `modules/market-making/strategy/data/strategy-market-data-provider.service.ts`：给策略拿参考价、best bid/ask、order book freshness。

这次补：
- mid history：在 order book 更新路径维护 bounded mid 序列。
- tracked-only signal API：新增只读缓存的方法，不能 fallback 到 REST/ticker。
- volatility / microprice / imbalance / freshness / crash signal。
- 统一的 `AdaptivePmmSignalSnapshot`，给 PMM 决策层读。

边界：
- 这一层只回答“市场现在是什么状态”。
- 不决定 spread、size、layers、side pause。
- 不发交易所请求。

#### 2. 通用 runtime observation layer（补反馈，不改结算语义）

现状已经有：
- `ExchangePairExecutor`：session、tick、fill handler。
- `ExchangeOrderTrackerService`：订单状态、fill delta、recovered fill。
- `FillRoutingService` / user stream ingestion：fill 进入系统。
- `FillSettlementService`：fill 结算到账本。
- `RuntimeTimingService` / metrics：运行耗时统计。
- `StrategyExecutionHistory`：可承载执行历史 metadata。

这次补：
- fill markout 评估：在 fill 入口记录“X 秒后评估”，到点后用 mid history 算成交后是否不利。
- reject / cancel / rate-limit pressure 计数：先做 PMM 需要的轻量计数，后续可抽通用。
- decision snapshot 基础结构：先给 PMM 使用，长期版可落 `StrategyExecutionHistory.metadata` 或独立表。

边界：
- markout 登记应挂在 fill 入口（例如 `handleSessionFill` / fill routing 周边），不要塞进 ledger mutation。
- `FillSettlementService` 继续只做账本结算。
- 不改变 fill settlement、ledger idempotency、reservation release 的语义。

#### 3. PMM adaptive decision layer（PMM 专属）

现状已经有：
- `PureMarketMakingStrategyController`
- `StrategyService.buildPureMarketMakingActions`
- `QuoteExecutorManagerService.buildQuotes`
- PMM DTO / schema

这次改：
- 读取 `AdaptivePmmSignalSnapshot`。
- 计算 effective spread / reference price / size / layers / cadence / side pause。
- 使用 order-scoped inventory 替代配置里的 `currentBaseRatio`。
- 小资金强制 1 层：单侧预算 < `layeringMinBudgetMultiple × minOrderNotional`。
- 输出 decision snapshot 和 skip/cancel/create reason。

边界：
- PMM 只产 intent，不直接下单。
- PMM 不改余额。
- PMM 不绕过 intent worker、reservation、tracked order、reconciliation。

#### 4. 原 execution / ledger / reservation layer（保持语义不动）

现状这一层已经比较完整：
- `StrategyIntentExecutionService`
- `StrategyIntentWorkerService`
- `StrategyIntentStoreService`
- `OrderReservationService`
- `BalanceLedgerService`
- `ExchangeOrderTrackerService`
- `ReconciliationService`
- `FillSettlementService`

这次原则：
- 可以增加只读查询，例如 order-scoped inventory read。
- 可以增加风险门读取，例如 reconciliation mismatch 时 PMM 不新增风险订单。
- 不改 reservation 语义。
- 不改 ledger mutation 语义。
- 不改 exchange create/cancel 执行语义。
- 不把 user-level balance 当成 PMM 库存事实源。

一句话：**通用层只提供信号和观察事实；PMM 层决定怎么报价；执行/账本/预留层继续按原语义干活。**

### Phase 0：先把"看市场"的眼睛装上

**做什么**：
- 在盘口跟踪服务里多存一份"最近 N 秒的中间价历史"
- 提供四个新方法（只查缓存，不发请求）：取参考价、取价格历史、取 microprice、取盘口不平衡
- 把这四个东西打包成一个 `信号快照` 对象，**每个值都带"新不新鲜"标记**
- 实现 §3 第 8 条的"数据过期三档处理"

**没这个，后面全玩不转。**

### Phase 1：波动率影响价差

**做什么**：
- 价差 = 基础价差 + 系数 × 波动率
- 但要被**手续费下限**和**最大价差上限**夹住
- 样本不够时就用基础价差（等于关掉这个功能）

**测试要测**：样本不足时不变、高波动时变宽、被上限夹住、绝不发 REST 请求

### Phase 2：用 microprice + 盘口不平衡

**做什么**：
- 参考价的枚举 `priceSourceType` 里加一个 `MICROPRICE` 选项。**只走这一个入口**，**不要再加 `useMicroprice` 开关**。
- microprice 只改"参考价中心"，imbalance 只改"两边价差对称性"，**别让它俩搅在一起**
- 盘口太薄（深度小于阈值）→ 直接忽略 imbalance
- imbalance 要用 EWMA 平滑，防止有人刷单干扰

**imbalance 方向定义**（必须写死，否则没法写测试）：

把 imbalance ∈ [−1, 1] 当成**顺势微调**：

- `imb > 0`（买盘强、大概率上行）→ **卖单收紧（更容易成交、出货）+ 买单放远（少接反向刀）**
- `imb < 0`（卖盘强、大概率下行）→ **买单收紧 + 卖单放远**

具体到价差（base 是基础半边价差，bidPrice = mid − bidSpread，askPrice = mid + askSpread）：
```
bidSpread += k_imb · imb · weight    // imb>0 → bidSpread 变大 → bid 报得更低（放远）
askSpread -= k_imb · imb · weight    // imb>0 → askSpread 变小 → ask 报得更近（收紧）
```

注意**两个限制**：
- 收紧的那一边仍受 §3.9 优先级 4 的"波动率"和最终 clamp 约束，不能比 `feeFloor + minSpread` 还窄。
- imbalance 只调"对称性"，**不动参考价中心**——参考价中心由 microprice 负责，职责分离。

### Phase 3：库存信号从账本算，不从配置读

**做什么**：
- 现在配置里有个 `currentBaseRatio` 字段——**别再当真**
- 真实库存从订单级别的账本读
- 必须是**这一单的库存**，不能退回"这个用户总共有多少"
- 对账失败或余额异常时，**禁止任何加仓动作**

### Phase 4：单量和层数也跟着变

**做什么**：
- 单量 = 基础单量 × 波动率折扣 × 库存折扣 × 毒性折扣
- 波动率高就把层数砍到上限以内
- 层数还要先看资金够不够厚：单侧预算小于 `layeringMinBudgetMultiple × minOrderNotional` 时，强制只挂 1 层，默认倍数 10。小资金不拆多层，避免碎单、精度失败和限流浪费
- **顺便修 §3 第 5 条**：判断要不要撤单时，把单量变化也算进去
- 最后输出要符合交易所的精度、最小金额规则

### Phase 5：刷新节奏也跟着变 + 撤单预算

**做什么**：
- 每个 tick 后都更新一次"下次什么时候刷"
- 加一个"每秒最多撤几次单"的预算，防止波动大时把交易所限流打满
- 刷新节奏要综合考虑：波动率、单子挂了多久、限流状态、有没有正在撤单、最近 post-only 被拒了多少次

### Phase 6：成交后看走势，被套就保护

**做什么**：
- 成交时记一个"X 秒后来看"的事项
- 到时间用价格历史算：是不是刚买完就跌、刚卖完就涨？
- 每一边都维护一个"毒性分"
- 分数过高 → 拉宽那一边、缩量；非常高 → 那一边直接停一会儿
- MVP 版本毒性分存内存（重启就丢），长期版要持久化

### Phase 7：把每次决策都记下来

**做什么**：
- 每个 tick 输出一份"决策快照"：当时信号是啥、最终价差/单量/层数是多少、为什么选这个、风控检查结果
- 默认写日志；长期版写到执行历史表里
- soak test 跑长时间，验证：数据过期会真的阻断、高波动会真的变宽变小、只改单量会真的触发撤换、毒性触发会真的冷却、重启不会绕过订单/资金/对账

---

## 5. 21 种市场情况会发生什么

这是验证表，**每一行最终都要有测试覆盖**——按 Phase 分批补，不要求 Phase 0/1 PR 里一次性把 21 行写完。

**记号**：σ=波动率、Imb=盘口不平衡 (-1~1)、MP=microprice、Inv=库存偏离、TX=毒性分

| # | 啥情况 | σ | Imb | MP 偏哪边 | Inv | TX | 谁说了算 | 做什么 |
|---|------|----|----|----|----|----|------|----|
| 1 | **平静日常**（70% 时间这样） | 低 | ≈0 | 中间 | ≈0 | 低 | — | 跟现在一样，刷新慢点省限流 |
| 2 | **突发新闻、价格阶跃** | 飙升（样本少） | 乱 | 乱 | ≈0 | 低 | 波动率 | 价差拉宽（被上限夹住）+ 单量缩 + 刷新快；样本太少就回退基线 |
| 3 | **单边上涨追涨陷阱** | 中 | 持续 +0.6 | 高于中间 | base 越来越少 | 低 | 库存 | **库存压住 imbalance**：多挂买补库存，少挂卖；MP 上移参考价 |
| 4 | **单边下跌** | 中 | 持续 -0.6 | 低于中间 | quote 越来越少 | 低 | 库存 | 反过来；快到价格下限时安全门接管 |
| 5 | **闪崩**（5 分钟跌 5%） | 极高 | -0.9 | 远低于中间 | base 多 quote 少 | 中-高 | **安全门** | `marketCrashBps` 熔断接管：撤光 + 暂停 + 告警；卖侧毒性累积进入冷却 |
| 6 | **横盘但盘口跳动**（噪音） | 中（被噪音骗） | 来回翻 | 中间 | ≈0 | 低 | 波动率（要节制） | σ 用对数收益率（不容易被骗）；撤单预算压住频率；imbalance EWMA 平滑 |
| 7 | **被信息优势方反复吃**（毒性流） | 中 | 乱 | 乱 | 单边累积 | 高（单边） | 毒性保护 | 那一边拉宽 + 缩量 + 严重时停；解除后热身渐进恢复 |
| 8 | **WS 短暂断**（<2 秒） | — | — | — | — | — | 安全门 | 维持挂单不动 |
| 9 | **WS 中等断**（2~10 秒） | — | — | — | — | — | 安全门 | 撤掉所有挂单，不挂新的 |
| 10 | **WS 长断**（>10 秒） | — | — | — | — | — | 安全门 | 熔断；恢复后强制热身 |
| 11 | **薄盘小币** | 乱 | 数值大但样本少 | 容易失真 | — | — | 库存 | 深度不够时 imbalance 权重直接 0 |
| 12 | **重启冷启动** | 没样本 | 没样本 | — | 从账本读 | 内存清零 | 安全门（热身） | 强制热身：宽价差 + 小单量 + 1 层，攒够样本再放开 |
| 13 | **被交易所限流 / 撤单被拒** | 乱 | 乱 | — | — | — | 安全门 | 刷新退避到最大值；连续 post-only 被拒就拉宽价差 |
| 14 | **交易所维护后恢复** | 第一笔爆表 | 乱 | 乱 | 可能突变 | — | 安全门（热身） | 第一个 tick 只读不挂单，启动热身 |
| 15 | **库存深度套牢**（成本远高于现价） | 低 | ≈0 | 中间 | 高 | 低 | 设计边界 | **不强行平、不卡成本价**；卖侧缩量 / 严重时暂停卖侧 + 告警；平仓交给人工或对冲程序 |
| 16 | **对账失败** | — | — | — | 不可信 | — | 安全门 | 阻止一切加仓，只允许撤单，告警 |
| 17 | **被吃一次然后反向**（偶然） | 中 | 乱 | 乱 | 单边变化 | 中（首次） | 毒性保护（累积） | 一次不触发；滚动毒性分超阈值才动作，避免过拟合 |
| 18 | **高波动 + 库存严重偏离**（最危险） | 高 | 乱 | 乱 | 高 | 乱 | 库存 + 波动率 | 双重缩量；继续加偏的那一侧再压一道；imbalance 权重直接 0 |
| 19 | **低波动 + 库存严重偏离** | 极低 | ≈0 | 中间 | 高 | 低 | 库存 | 不靠 σ 收紧；按库存方向 skew；偏离极端时被压侧缩量 / 暂停 + 告警 |
| 20 | **顶档闪现大单**（疑似刷单） | 低 | 瞬时极值 | 瞬时偏 | ≈0 | 低 | imbalance（要节制） | imbalance 用 EWMA；翻得太快就短期忽略 |
| 21 | **小资金订单但配置多层** | 低 | ≈0 | 中间 | ≈0 | 低 | 资金门槛 | 单侧预算 < `10 × minOrderNotional` 时强制 1 层；资金够厚才进入多层逻辑 |

### 5.1 每个 tick 怎么决策（按顺序走）

```text
1. 安全检查
   熔断 / 价格带 / 数据死 / 对账失败  →  撤光 或 暂停
   数据有点老                        →  保持挂单不动
   还在热身                          →  价差用大的、单量缩、1 层

2. 算库存信号
   inv = (当前比例 − 目标比例)
   库存权重 = 偏离程度 / 严重阈值，最大 1

3. 算毒性保护（分两边）
   毒性分高    → 那一边拉宽 + 缩量
   毒性分极高  → 那一边冷却

4. 算波动率影响
   价差 += 系数 × σ           (有上限)
   单量 *= (1 − 系数 × σ̂)     (有下限)
   刷新 = 根据 σ 在 [最小, 最大] 之间取

5. 算 microprice
   priceSourceType === MICROPRICE 且深度够 → 参考价用 microprice，否则按配置回退（默认 mid）

6. 算 imbalance（最后，且会被压制）
   深度不够 → 权重 0
   库存严重偏离 → 权重再衰减（库存越偏越压）
   bidSpread += imb × 系数 × 权重    // imb>0 买盘强 → bid 放远
   askSpread -= imb × 系数 × 权重    // imb>0 买盘强 → ask 收紧（顺势出货）

7. 最后兜底
   价差 ∈ [手续费下限+最小价差, 最大自适应价差]
   minOrderNotional = max(exchangeMinNotional, exchangeMinAmount × referencePrice)
   单侧预算 < layeringMinBudgetMultiple × minOrderNotional → 强制 1 层
   单量、层数 → 符合交易所精度 / 最小金额 / 波动期最大层数
```

### 5.2 怎么验证

- 每种情况一个测试文件：造输入、查输出、查理由、查"没发任何请求"
- soak test：把第 1、3、6、7、11、18 串起来跑 30 分钟，看会不会出现撤单风暴、误触发、信号饥饿死循环

---

## 6. 配置都加些啥

在策略 JSON 里加这些字段（**全部可选**，不配就跟现在一样）：

```jsonc
{
  // Phase 1 波动率
  "volBasedSpread":           "开关",
  "sigmaWindowMs":            "波动率窗口，默认 60_000",
  "spreadSigmaMultiplier":    "σ 影响价差的系数，默认 1.0",
  "maxAdaptiveSpread":        "自适应后价差的硬上限",
  "volatilitySampleMinCount": "样本不够就不算 σ",

  // Phase 2 microprice / imbalance
  // 注意：microprice 只走 priceSourceType: "MICROPRICE"，不再有 useMicroprice 开关
  "imbalanceSkewFactor":       "imbalance 影响价差的系数",
  "imbalanceDepthLevels":      "看几档深度",
  "imbalanceMinDepthNotional": "深度不够就不算 imbalance",
  "imbalanceSmoothingMs":      "imbalance EWMA 平滑窗口",

  // Phase 3 库存
  "inventorySeverePivot":     "库存偏离多少算严重（触发对 imbalance 的压制）",
  "inventoryPauseSidePivot":  "库存偏离多少算极端（被压一侧缩量/暂停 + 告警）",

  // 市场波动熔断（§2 划清边界要求；Phase 0 一起做）
  "marketCrashWindowMs": "波动熔断观察窗口，默认 60_000",
  "marketCrashBps":      "窗口内 mid 变动超过则进入硬 stale（撤光+暂停+告警）",

  // Phase 4 单量 / 层数
  "adaptiveSizeEnabled":   "开关",
  "sizeVolScalingFactor":  "σ 缩量系数",
  "sizeFloor":             "缩量下限（不能缩到 0）",
  "maxLayersInVol":        "高波动时最多挂几层",
  "layeringMinBudgetMultiple": "单侧预算至少是 minOrderNotional 的多少倍才允许多层，默认 10",

  // Phase 5 刷新 + 撤单预算
  "adaptiveRefreshEnabled":  "开关",
  "refreshMinMs":            "最快多快刷",
  "refreshMaxMs":            "最慢多慢刷",
  "refreshVolPivot":         "σ 影响刷新的转折点",
  "cancelBudgetPerSec":      "每秒最多撤单次数；超过则本 tick 跳过新撤单",
  "postOnlyRejectThreshold": "连续 post-only 被拒次数阈值；超过则自动拉宽 spread",

  // Phase 6 毒性
  "adverseMarkoutGuardBps":   "毒性触发阈值",
  "adverseMarkoutWindowMs":   "成交后多久看走势",
  "adverseMarkoutCooldownMs": "冷却多久",

  // 过期 + 热身
  "staleSoftMs":     "默认 2000",
  "staleHardMs":     "默认 10000",
  "warmupTicks":     "热身最少多少 tick",
  "warmupMs":        "热身最少多少毫秒",
  "warmupSpread":    "热身价差",
  "warmupSizeRatio": "热身单量比例，默认 0.2"
}
```

DTO 同步加可选字段；策略覆写守卫同步放行；校验器不支持的关键字（`maximum` / `integer`）自己在代码里校验。

---

## 7. 改哪些文件

**Phase 0 信号底座 + 市场波动熔断**：
- `modules/market-making/trackers/order-book-tracker.service.ts` → 在 order book 更新路径维护 bounded mid history
- `modules/market-making/strategy/data/strategy-market-data-provider.service.ts` → 四个 tracked-only 方法、`AdaptivePmmSignalSnapshot`、stale 三档、市场波动熔断判定、参考价 normalize/pick 逻辑（支持 `MICROPRICE`）

**Phase 1/2 价差 + microprice + imbalance**：
- `modules/market-making/strategy/intent/quote-executor-manager.service.ts` → 决策合成、imbalance 方向公式
- `modules/market-making/strategy/strategy.service.ts` → 读信号、装配参数
- `modules/market-making/strategy/config/strategy.dto.ts` → 新增字段
- `modules/market-making/strategy/config/strategy-config-override.guard.ts` → 放行新字段
- **microprice 涉及的全部文件**（缺一个 `MICROPRICE` 都可能被运行时回退成 `MID_PRICE`）：
  - `common/enum/pricesourcetype.ts` → 枚举加 `MICROPRICE`
  - `modules/market-making/user-orders/market-making-order-snapshot.utils.ts` → snapshot 序列化/反序列化时不要丢失 `MICROPRICE`
  - `modules/market-making/strategy/data/strategy-market-data-provider.service.ts` → `getReferencePrice` / normalize 分支补 `MICROPRICE`

**Phase 3 库存从账本读**：
- `market-making/ledger/*` 与 `order-balance` read model → 提供 order-scoped 实时库存查询
- `modules/market-making/strategy/strategy.service.ts` → 切换库存来源；停止依赖配置 `currentBaseRatio`
- 对账服务相关入口 → mismatch 时阻断风险增加的钩子

**Phase 4 单量 / 层数**：
- `modules/market-making/strategy/intent/quote-executor-manager.service.ts` → 公式 + `isQuoteWithinTolerance` 加 qty/notional
- 交易所精度 / minNotional 工具 → 复用现有 quantization 逻辑

**Phase 5 动态刷新 + 撤单预算**（**注意职责分布**，不要只改 controller）：
- `modules/market-making/strategy/controllers/pure-market-making-strategy.controller.ts` → 提供 cadence 计算（输入 σ 等），但**只输出建议值**
- `modules/market-making/strategy/strategy.service.ts` → 拿到建议值后写回 session/runtime 状态
- `modules/market-making/strategy/execution/strategy-runtime-dispatcher.service.ts` + `strategy-intent-execution.service.ts` → 按更新后的 `cadenceMs` 推进 `nextRunAtMs`
- rate limit / post-only reject 计数器（若已有则复用，否则新增轻量计数器）

**Phase 6 markout / 毒性**：
- `modules/market-making/strategy/settlement/fill-settlement.service.ts` 的 fill handler → 在收到 fill 时登记评估 deadline（不在 tick 里查 DB）
- 新增（或复用 service）`MarkoutEvaluatorService` → 用 mid history 评估、维护 per-side toxicity score
- `modules/market-making/strategy/intent/quote-executor-manager.service.ts` → 读 toxicity 做 widen / 缩量 / cooldown

**Phase 7 决策快照 + 配置 + 测试**：
- `modules/market-making/strategy/intent/quote-executor-manager.service.ts` → 输出 decision snapshot
- `database/seeder/data/strategies/pure-market-making.json` → schema
- `common/entities/market-making/strategy-execution-history.entity.ts`（长期版落库时） → metadata 字段
- `test/system/market-making/strategy/pure-market-making/` → 情景 1–21 spec + soak

> 拆 PR 前再对照一遍这份清单，避免漏改 trackers、execution dispatcher、ledger read model、fill handler、microprice enum/snapshot 这些"看起来不属于策略"的边界。

---

## 8. 怎么验证 + 完成标准

```bash
cd server && bun run lint && bun run test
cd server && bun run test:system -- pure-market-making
```

**能算"长期能跑"的标准**：

- tick 里所有信号读取都是缓存，**零 I/O**
- 任何报价变化都能说清楚是哪个信号导致的
- 库存信号来自真实账本，不是配置字段
- 数据过期 / 对账失败 / 订单状态异常时，**加仓动作被拦住**
- 自适应字段不绕过交易所规则、限流、资金冻结
- 成交后能影响后续报价，有冷却恢复
- 重启后订单 / 资金 / 风控状态有明确恢复策略
- 决策快照 + 21 情景测试 + soak 全过

---

## 9. 还没拿定主意的事

1. **要不要上 Avellaneda–Stoikov 那套完整公式**？建议先用线性，所有 Phase 跑完看效果再说。
2. **信号产物（σ / microprice / imbalance）要不要写进执行历史**？默认不写，省存储；有归因需求再开。
3. **毒性冷却要不要持久化**？MVP 内存，长期版关键 side pause 状态要持久化。
4. **决策快照写哪**？执行历史表 metadata 还是单独建表？看 soak 时数据量决定。

---

## 10. 文档怎么跟着写

- 每个 Phase 合并后在 `docs/plans/progress.md` 加一行
- Phase 0–3 完成后，新开 `docs/architecture/strategies/adaptive-pmm.md` 写信号链路和公式
- Phase 7 完成后，把整套汇总到 `docs/architecture/market-making-flow.md`

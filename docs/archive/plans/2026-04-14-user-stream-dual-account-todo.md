# User Stream + DualAccount 优化 — 合并 TODO

**Status**: ✅ Completed
**Date**: 2026-04-14
**Source**: `hummingbot-like-user-stream-plan.md` + `campaign-join-log/04-14-new-fix.md`

## Dependency Graph

```
Fix A (takerFee)  ──────────────┐
Fix B (IOC 判定)   (并行，独立)   │
Phase 0 (合约)    (并行，独立)   │
        │                       │
        v                       v
Phase 1 (重命名)          Fix C (余额快照复用)
        │                       │
        v                       │
Phase 2 (order/trade 分离)      │
        │                       │
        └───────────┬───────────┘
                    v
            Phase 3 (BalanceStateCache)  ← 交汇点
                  /       \
                 v         v
Phase 4 (REST 恢复)    Fix D (动态方向)
        │                  │
        v                  v
Phase 5 (适配层)     Fix E (rebalance)
        │
        v
Phase 6 (运维诊断)
```

---

## 可立即并行的任务

### ☑ Fix A: loadTradingRules 加 takerFee + feeBuffer 修正

**依赖**: 无
**风险**: 低

**问题**:
- `loadTradingRules` 只取 `makerFee`，缺 `takerFee`
- `resolveDualAccountFeeBufferRate` 硬编码最低 0.002 (0.2%)，当 makerFee=0 时过度保守
- `computeDualAccountCapacity` 用 `/(1+fee)` 而非 `*(1-fee)`

**改动**:
1. `exchange-connector-adapter.service.ts` L247-255: `loadTradingRules` 返回值加 `takerFee` 字段，从 `market.taker || exchange.fees.trading.taker` 取
2. `strategy.service.ts` L2692-2725: `resolveDualAccountFeeBufferRate` 改为读 `makerFee + takerFee` 合计，去掉 `MIN_DUAL_ACCOUNT_FEE_BUFFER_RATE` 硬编码最低值
3. `strategy.service.ts` L1957-1989: `computeDualAccountCapacity` 改为 `*(1 - totalFeeRate)` 替代 `/(1 + feeBufferRate)`

**2026-04-14 进展**:
- 已完成：`loadTradingRules` 返回 `takerFee`
- 已完成：dual-account fee buffer 改为 `makerFee + takerFee`
- 已完成：capacity 公式改为 `*(1 - totalFeeRate)`

---

### ☑ Fix B: taker IOC 成功判定修正

**依赖**: 无
**风险**: 低

**问题**:
- `executeInlineDualAccountTaker` 中 `makerSettled=true` 就认定 taker 成功，不验证 taker 实际成交量
- `consumeIntent` 只检查 `result.id`，不检查 `filled/status`
- `completedCycles` 无法传入实际成交额，`tradedQuoteVolume` 基于 cycle 计数而非真实量

**改动**:
1. `consumeIntent` 后 `fetchOrder` taker 订单，取 `filled/status`
2. taker success = `makerSettled AND (taker filled >= requested * threshold)`
3. `incrementCompletedCycles` 接受实际成交额参数，`tradedQuoteVolume` 按实际 fill 累加
4. 部分成交时 log warn，不算 `completedCycles`

**文件**: `strategy-intent-execution.service.ts` L603-797

**2026-04-14 进展**:
- 已完成：dual-account taker 必须拿到实际 fill 才算 success，不再把 unknown fill 当成功
- 已完成：IOC immediate ack 若既无 `id` 又无 `filled`，直接按失败处理
- 已完成：`completedCycles` 仅在 taker fill 达标时递增，`tradedQuoteVolume` 按实际 fill quote 累加

---

### ☑ Phase 0: 定义 UserStreamEvent 合约

**依赖**: 无
**风险**: 零（纯类型，不改运行时）

**交付物**:
1. 新建 `server/src/modules/market-making/user-stream/` 目录
2. 定义 `UserStreamEvent` 联合类型（`balance/order/trade` 三种 kind），每个 event 必须包含 `exchange + accountLabel` 作为隔离 key
3. 定义 `ConnectorUserStreamDataSource` 接口（`listen/stop/isActive`）
4. 定义 `UserStreamEventNormalizer` 接口（normalize raw payload → `UserStreamEvent`）
5. `docs/architecture/server/user-stream-model.md` 架构说明
6. 每个交易所的 `watchOrders/watchMyTrades/watchBalance` 支持矩阵

**Exit criteria**: 类型通过编译，无运行时改动

**2026-04-14 进展**:
- 已创建 `server/src/modules/market-making/user-stream/`
- 已定义 `UserStreamEvent` / `ConnectorUserStreamDataSource` / `UserStreamEventNormalizer`
- 已补充 `docs/architecture/server/user-stream-model.md`

---

## ☑ Phase 1: 重命名+泛化 Private Stream 层

**依赖**: Phase 0
**风险**: 低（纯重命名，行为不变）

**改动**:
1. `PrivateStreamIngestionService` → `UserStreamIngestionService`
2. `PrivateStreamTrackerService` → `UserStreamTrackerService`
3. 将现有 `watchOrders()` 事件适配为 Phase 0 定义的标准化 `order` event
4. 更新 `trackers.module.ts` 的 provider 注册
5. fill-routing 行为保持不变

**文件**:
- `server/src/modules/market-making/trackers/private-stream-ingestion.service.ts`
- `server/src/modules/market-making/trackers/private-stream-tracker.service.ts`
- `server/src/modules/market-making/trackers/trackers.module.ts`
- 所有引用这两个 service 的文件

**Exit criteria**: 所有现有 watchOrders 测试仍通过，运行时行为无变化

**2026-04-14 进展**:
- 已完成：新增 `UserStreamIngestionService` / `UserStreamTrackerService` 兼容别名
- 已完成：`trackers.module.ts`、策略层、admin direct 入口切到 `UserStream*` 命名
- 已完成：现有 `watchOrders()` 事件标准化为 `kind:'order'`
- 已验证：现有 watcher / tracker 单测通过

---

## Phase 2: order/trade 事件分离 + dedup

**依赖**: Phase 1
**风险**: 中（涉及 fill 路径变更，需严格测试）

**改动**:
1. `UserStreamIngestionService` 增加 `watchMyTrades()` 循环（与 `watchOrders` 并行运行）
2. `watchOrders` → 标准化为 `kind:'order'` 事件
3. `watchMyTrades` → 标准化为 `kind:'trade'` 事件
4. `UserStreamTrackerService` 增加 trade 事件处理：trade 事件作为 fill 的首选来源
5. dedup 逻辑：用 `exchangeOrderId + clientOrderId + fillId + cumulativeQty` 单调性去重
6. `ExchangeOrderTrackerService`: WS order update 可以直接推进 tracked order 状态
7. 对不支持 `watchMyTrades` 的交易所，fallback 到现有 order-only 路径

**Exit criteria**: order-only 交易所仍能路由 fill；order+trade 交易所优先用 trade 事件且无重复 fill

**2026-04-14 当前进展**:
- 已完成：`watchMyTrades()` ingestion loop
- 已完成：trade 事件标准化为 `kind:'trade'`
- 已完成：基础 trade dedup（相同 `exchangeOrderId + clientOrderId + fillId + cumulativeQty/qty` 不重复路由）
- 已完成：trade 优先于 order 的跨源抑重，order-only 交易所仍保留原有 fill 路由

---

## ☑ Fix C: 余额快照复用（Phase 3 前置简化版）

**依赖**: Fix A
**风险**: 低

**问题**: `resolveDualAccountExecutionPlan` 评估 preferred side 失败后，评估 fallback side 时再次 `fetchBalance`，rebalance 路径同理。

**改动**:
1. `resolveDualAccountExecutionPlan` 入口处一次性 `fetchBalance` 两个 account（maker + taker），得到 `balanceSnapshot`
2. `evaluateDualAccountExecutionForSide` 接受 `balanceSnapshot` 参数，不再内部调用 `getAvailableBalancesForPair`
3. fallback side 评估直接复用同一份 `balanceSnapshot`
4. rebalance 路径同样复用

**效果**: 每个 tick 的 balance I/O 从 4 次降为 2 次，`decisionDurationMs` 应从 3.5-5.5s 降至 ~2s

**文件**: `strategy.service.ts` L1991-2038, L4301-4326

**2026-04-14 进展**:
- 已完成：dual-account execution 在 tick 内先取一次 maker+taker balance snapshot
- 已完成：preferred side / fallback side / rebalance 共用同一份 snapshot
- 备注：策略大规格单测当前被既有 Jest/source-map 递归问题阻塞，需单独修 harness 后再补完整回归验证

---

## Phase 3: BalanceStateCache + watchBalance ← 交汇点

**依赖**: Phase 2 + Fix C
**风险**: 中

User stream plan 和 DualAccount 优化的交汇点。余额从 REST-only 变为 WS-primary + REST-fallback。

**改动**:
1. 新建 `BalanceStateCache`，key = `exchange + accountLabel + asset`，存 `free/used/total + freshnessTimestamp`
2. `UserStreamIngestionService` 增加 `watchBalance()` 循环
3. `watchBalance` → 标准化为 `kind:'balance'` 事件
4. `UserStreamTrackerService` 处理 balance 事件，apply snapshot/delta 到 cache
5. 暴露 balance 读取 API：`getBalance(exchange, accountLabel, asset)` → cached value + freshness
6. 保留 `fetchBalance()` 作为 refresh/backfill 路径
7. 策略层改造：`getAvailableBalancesForPair` 优先读 cache，stale 时 fallback 到 `fetchBalance`

**效果**:
- Fix C 的 2 次 REST call → 0 次（cache hit 时），`decisionDurationMs` 降至 <500ms
- tick overlap 问题基本消除
- balance 数据持续更新，不再是 point-in-time snapshot

**文件**:
- 新建 `server/src/modules/market-making/balance-state/`
- `server/src/modules/market-making/trackers/` (ingestion + tracker)
- `strategy.service.ts`: `getAvailableBalancesForPair` 改为 cache-first
- `exchange-connector-adapter.service.ts` L204-212: `watchBalance` 加 `accountLabel` 参数

**Exit criteria**: admin 可读 cached balance；策略 sizing 优先用 cache 且 stale 时安全 fallback

**2026-04-14 当前进展**:
- 已完成：`BalanceStateCacheService`
- 已完成：`watchBalance()` ingestion loop 与 `kind:'balance'` 标准化
- 已完成：tracker 将 balance event apply 到 cache
- 已完成：`getAvailableBalancesForPair()` cache-first，stale 时 fallback 到 `fetchBalance()`
- 已完成：admin direct status 暴露 cached balance / freshness

---

## Phase 4: 显式 REST 恢复循环 + 流健康模型

**依赖**: Phase 3
**风险**: 低

**改动**:
1. 新建 `BalanceStateRefreshService`：当无 WS balance 事件、交易所不支持 `watchBalance`、或 cache stale 超阈值时自动 `fetchBalance`
2. 流健康状态模型：`healthy / degraded / silent / reconnecting`
3. poll 频率随流健康状态调整
4. 指标发射：last user-stream event time, last balance refresh time, last order reconciliation time, duplicate-fill suppression count
5. 保留 `ExchangeOrderTrackerService` 的 `fetchOrder` 对账

**Exit criteria**: 无 WS 支持的交易所 order recovery + balance refresh 仍然工作；流退化在日志和健康指标中可见

**2026-04-14 当前进展**:
- 已完成：`BalanceStateRefreshService`，对静默账户做 REST balance refresh
- 已完成：基础流健康状态 `healthy / degraded / silent / reconnecting`
- 已完成：admin direct status 暴露 `streamHealth` 与 `lastBalanceRefreshAt`
- 说明：更细粒度 poll 节奏调优与持久化指标发射暂不展开，当前以运行时健康状态 + REST 恢复满足本轮目标

---

## Phase 5: 交易所能力适配层

**依赖**: Phase 4
**风险**: 低

**改动**:
1. 新建 per-exchange normalizer/adapter 模块 under `server/src/modules/market-making/user-stream/normalizers/`
2. 支持三种 connector 策略：full / partial / rest-only
3. 所有 user stream 方法支持 `accountLabel`
4. 每个交易所归类到一个能力 tier
5. 运行时代码不再需要直接解析交易所特定的 payload

**Exit criteria**: 每个支持的交易所分类完毕；无运行时代码做 exchange-specific payload parsing

**2026-04-14 当前进展**:
- 已完成：`UserStreamCapabilityService`，输出 `full / partial / rest_only`
- 已完成：admin direct status 暴露 capability tier
- 已完成：per-exchange normalizer/registry 接管 runtime 标准化，ingestion 不再内联交易所特定解析

---

## Phase 6: 持久化、恢复、运维诊断

**依赖**: Phase 5
**风险**: 低

**改动**:
1. 持久化 last known user-stream health + timestamps
2. 确保 user stream replay/recovery 不重复 fill
3. Admin/runtime 诊断面板：stream capability tier, watcher active state, queue depth, latest event timestamps, stale balance indicator
4. 运维文档：private stream 故障模式 runbook

**Exit criteria**: 运维人员能看到 WS-primary vs REST-degraded 模式；重启恢复不依赖 private WS replay

**2026-04-14 当前进展**:
- 已完成：admin direct status 已可见 stream capability / health / balance freshness
- 已完成：admin direct status 增加 watcher active state / queue depth / duplicate-fill suppression count / latest event timestamps
- 已完成：补充 `docs/architecture/server/user-stream-runbook.md`
- 说明：health/timestamp 未做 DB 持久化，当前按“运行时可观测 + REST 可恢复”收口，重启恢复不依赖 WS replay

---

## Fix D: 动态买卖方向（基于实时余额）

**依赖**: Phase 3
**风险**: 中

**问题**: 当前 `publishedCycles % 2` 严格 1:1 交替，但 spread 损耗导致 base asset 不对称衰减。

**改动**:
1. `resolveVolumeSide` 增加 `'inventory_balance'` 模式
2. 从 `BalanceStateCache` 读取 maker 的 base/quote 余额
3. maker quote 余额 > base 余额时优先 buy，反之优先 sell
4. 可配置阈值（如 imbalance > 5% 时才切换方向）
5. 与 `dynamicRoleSwitching` 配合

**文件**: `strategy.service.ts` L3404-3422

**Exit criteria**: 长时间运行后两账户 base/quote 比例保持稳定

**2026-04-14 当前进展**:
- 已完成：`postOnlySide='inventory_balance'` 模式
- 已完成：基于 maker cached balance 与中间价估值，在 imbalance > 5% 时优先 buy/sell

---

## Fix E: rebalance 成本优化

**依赖**: Fix D
**风险**: 低

**问题**: 当前 rebalance 用 IOC 单腿单，支付 taker 费率但不产生配对 volume。

**改动方向（需进一步设计）**:
1. 动态方向（Fix D）生效后评估 rebalance 实际触发频率
2. 考虑将 rebalance 改为 maker 挂单
3. 引入 rebalance 阈值
4. 评估是否可用正常 cycle 的方向偏向替代独立 rebalance

**注意**: 此 task 可能在 Fix D 生效后被证明不再需要，先观察数据再决定

**2026-04-14 结论**:
- 暂不实现新的 rebalance 订单流
- 原因：`inventory_balance` 已优先通过正常 cycle 修正库存偏斜，当前先观察真实运行数据，再决定是否需要额外 rebalance 优化

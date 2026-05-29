# StrategyService 拆分方案

> 目标：把 `server/src/modules/market-making/strategy/strategy.service.ts`（当前 **9,243 行 / ~150 个 private 方法**）拆成一个真正只做"编排"的 coordinator，把算法、结算、恢复、风控、运行时基础设施按三层架构归位。
>
> 适用范围：仅 `server/src/modules/market-making/strategy/` 及邻近模块；不动 funding/trading 层公共能力。

---

## 1. 现状诊断

### 1.1 它现在干了什么（按代码块归类）

| 区块 | 代表方法 | 行数估算 |
|---|---|---|
| 生命周期 / Nest hook | `onModuleInit / onModuleDestroy / onApplicationShutdown / start / stop / health / onTick` | ~200 |
| Session registry | `upsertSession / restoreOrQueueStrategy / activatePendingStrategiesForExchange / removeSession / canActivateStrategyImmediately / isStrategyRuntimeEligible` | ~400 |
| Watcher 管理 | `startPrivateWatchers / startBalanceWatchers / stopBalanceWatchers / stopPrivateWatchers` | ~150 |
| 对外 facade | `startArbitrageStrategyForUser / executePureMarketMakingStrategy / executeVolumeStrategy / executeDualAccount* / stopStrategyForUser / stopMarketMakingStrategyForOrder / rerunStrategy / linkDefinitionToStrategyInstance` | ~500 |
| 持久化 | `upsertStrategyInstance / rollbackFailedStrategyStart / persistStrategyParams` | ~400 |
| PMM 算法 | `buildPureMarketMakingActions / buildLegacyQuotes / quantizeAndValidateQuote / resolveMinOrderNotional / isQuoteWithinTolerance / buildStaleOrderActions / buildCancelOrderAction / appendCancelAction / consumeCancelBudget` | ~1,200 |
| Adaptive PMM 状态机 | `resolveAdaptivePmmLayerCountFromBudget / shouldReadAdaptivePmmSignals / resolveAdaptivePmmWarmupState / resolveAdaptivePmmRuntimePressure* / applyAdaptivePmmRuntimePressureCadence / restoreAdaptivePmmRuntimePressureCadence / resolveAdaptivePmmWarmupSizeRatio / resolveAdaptivePmmSideRecovery* / shouldBlockAdaptivePmmForMarketSafety / isAdaptivePmmReservationPaused / appendAdaptivePmmSafetyCancels / logAdaptivePmmDecisionSnapshot / buildAdaptivePmmDecisionMetadata / persistAdaptivePmmDecisionSnapshot / updateAdaptivePmmCadence` | ~700 |
| Volume 算法 | `buildVolumeSessionActions / onVolumeActionsPublished / buildVolumeActions / buildClobVolumeParams / buildAmmDexVolumeParams / resolveVolumeSide / computeAmmAmountIn / calculateVWAPForAmount` | ~600 |
| Arbitrage 算法 | `buildArbitrageActions / evaluateArbitrageOpportunityVWAP` | ~200 |
| Time-indicator 算法 | EMA / RSI / cross / `fetchCandles / parseBaseQuote / isWithinTimeWindow / calcEma / calcRsi / avg / calcCross / safePct` | ~200 |
| Dual-account planner | `buildDualAccountSessionActions / onDualAccountVolumeActionsPublished / buildDualAccountVolumeActions / buildDualAccountBestCapacityVolumeActions / resolveDualAccountCycleAccounts / resolveDualAccountCycleAccountsFromBalances / computeDualAccountCapacity / buildDualAccountCapacityDiagnostics / resolveDualAccountCapacityLimiter / resolveDualAccountExecutionPlan / buildDualAccountBestCapacityCandidates / computeDualAccountImbalanceRatio / scoreDualAccountBestCapacityCandidate / resolveBestExecutableDualAccountCandidate / evaluateDualAccountExecutionForSide* / quantizeAndAdaptDualAccountQuote / resolveDualAccountFeeBufferRate / findDualAccountCandidateCapacity / loadDualAccountBalanceSnapshot / resolveDualAccountPreferredSide / resolveInventoryReferencePrice / normalizeDualAccountMakerPrice / isDualAccountMakerPriceValid / resolveBestDualAccountTradeabilityFromBalances / evaluateDualAccountTradeabilityForSideFromBalances / cloneDualAccountPairBalances / resolveDualAccountCycleRoles / advanceDualAccountCycleRolesAfterSuccess / buildActiveDualAccountCycleState / isDualAccountRebalanceAction` | ~1,800 |
| Dual-account rebalance | `maybeBuildDualAccountRebalanceAction / buildDualAccountRebalanceCandidate` | ~400 |
| Dual-account 配置归一化 | `mergeDualAccountConfigIntoRuntime / normalizeDualAccountStrategyParams / normalizeDualAccountBestCapacityStrategyParams / isBestCapacityConfig / resolveStrategyInputPair / resolveRuntimePair / maybeWarnDualAccountBestCapacityIgnoredFields / normalizeBehaviorProfile / applyVariance / readPositiveNumber / readNonNegativeNumber / readUnitIntervalNumber / isWithinDualAccountProfileWindow / resolveDualAccountBehaviorProfile / resolveNextDualAccountCadenceMs` | ~400 |
| Intent 发布 | `publishIntents / createIntent / latestIntentsByStrategy / getLatestIntentsForStrategy / clearIntentsForStrategy` | ~150 |
| 结算 | `handleSessionFill / applyDualAccountFillProgress / updateMatchedDualAccountCycleMetrics / finalizeSettledDualAccountCycle / applyFillToBalanceLedger / settleFillToBalanceLedger / applyFillFeeToBalanceLedger / buildFillLedgerEventKey / estimateMakerFeeSpread / pauseFillSettlementReservations / resolveTrackedOrderForFill / buildIncrementalSettlementFill / markTrackedFillSettled / mergeDualAccountFillRuntimeIntoPersisted` | ~1,200 |
| 启动恢复 | `restoreRuntimeStateForStrategy / restoreDualAccountVolumeRuntimeState / restoreMappedOpenOrder / findCreateIntentForOpenOrder / quantityMatches / recoverInterruptedCancelIntentsForStrategy / activateStrategyFromPersistence` | ~700 |
| 停机 / 取消 | `cancelAllRunningStrategies / cancelTrackedOrdersForStrategy / getCancelableTrackedOrders / waitForTrackedOrdersToSettle / forceTrackedOrdersTerminal / cancelRecoveredExchangeOrder / isOrderOwnedByStrategy / isTrackedOrderTerminal / isCancelResultFinal / normalizeExchangeOrderStatus` | ~500 |
| 风控 | `shouldTriggerKillSwitch / parseKillSwitchAbsoluteThreshold / parseKillSwitchPercentThreshold` | ~150 |
| 库存查询 | `getAvailableBalancesForPair / resolveOrderScopedInventoryRatio` | ~250 |
| 观测 | `recordSessionPnL / recordPureMarketMakingMarkout` | ~150 |
| 杂项 | `runSession / fetchStartPrice / getCadenceMs / routeFillForExchangePair / onTickForPooledExecutors / detachSessionFromExecutor / resolvePooledExecutorTarget / resolveAccountLabel / resolveRequiredAccountLabels / logSessionTickError / setConnectorHealthStatus / getConnectorHealthStatus / toErrorDetails / sleep / readString / generateRunId / recordSlotCancelTimestamp / isSlotWithinCancelCooldown / isSameActiveSession` | ~600 |

合计：**~9,200 行**，与文件实际行数吻合。

### 1.2 真正的架构问题

1. **Controller 是空壳，service 是上帝。** `controllers/*.ts` 不持有算法，所有 `buildXxxActions` 都在 `StrategyService` 上，`controller.tick()` 内部反回调 `strategyService.buildXxxActions(...)`，形成循环依赖与"god service"。
2. **结算 / 恢复已经有专门服务，但主类没把活交出去。** `settlement/fill-settlement.service.ts`、`recovery/strategy-startup-recovery.service.ts`、`execution/strategy-intent-store.service.ts` 都已存在，但核心逻辑仍留在 `StrategyService` 内。
3. **运行时状态 map 散落在 service 字段上**：`adaptivePmmWarmupStartedAtByStrategy / adaptivePmmWarmupTicksByStrategy / slotCancelCooldownByStrategy / cancelBudgetUsageByStrategySecond` 等本应归属于特定子域。
4. **Dual-account / PMM / Volume / Arbitrage / TimeIndicator 五条策略线全部塞在同一个文件里**，无法独立测试、独立演进。
5. **构造函数注入 24 个依赖**——直接证明职责边界已经崩塌。

---

## 2. 三层边界回顾（来自 `docs/AGENTS.md`）

```diagram
╭─────────────────────╮       ╭──────────────────────╮       ╭───────────────────────╮
│   Funding Layer     │       │  Scheduling Layer    │       │    Trading Layer      │
│ deposits/withdraws  │       │  tick / controllers  │       │  reservation / orders │
│ rewards / ledger    │       │  intent dispatch     │       │  fills / reconcile    │
╰─────────────────────╯       ╰──────────────────────╯       ╰───────────────────────╯
            ▲                            │                              │
            │                            ▼                              ▼
       ledger 是真理                StrategyService                IntentWorker
                                  （仅 coordinator）           （持有 reservation + 下单）
```

**StrategyService 的合法职责**仅限于：

- 实现 `onModuleInit / onModuleDestroy / onTick` 三个 hook
- 暴露对外 facade：`start*Strategy / stopStrategy* / getRunningStrategies / getSupportedControllerTypes`
- 持久化入口：创建/更新/停止 `StrategyInstance`
- runtime session map 的最小管理（增删查、pending activation）
- 调用 controller / dispatcher 拿 intents
- 调用 intent worker / executor，不亲自下单
- 调用 settlement / recovery 专用服务，不亲自结算/恢复
- health / status 汇总

**目标体量：600–800 行。** 超过即说明又在吞职责。

---

## 3. 拆分原则

1. **能搬进已有服务的，绝对不新建文件。** Settlement / Recovery / IntentStore 已存在，优先吸纳。
2. **Controller 反转：算法搬进 controller 自身。** `buildXxxActions` 是该 controller 的"大脑"，必须由 controller 持有依赖、对外只暴露 `tick(ctx) → ExecutorAction[]`。`StrategyService` 不再有任何 `buildXxx` 方法。
3. **新建目录数 ≤ 4，且都在 `strategy/` 下。** `runtime/ / quote/ / pmm/ / dual-account/`。跨模块的（trackers/risk/balance-state）各加一个文件，不新建目录。
4. **纯函数与状态服务区分。** `dual-account-config.ts`、`indicators/technical-indicators.ts` 是纯函数模块（无 `@Injectable()`），其它都是 service。
5. **不引入新抽象。** 不写 facade / interface / adapter 中间层，类型直接复用 `config/` 里的现有类型。
6. **不做兼容代码。** AGENTS.md 明确："Always keep the architecture 100% perfect at present, don't do compatibility unless mentioned"。每个 Phase 完成后旧路径直接删除。

---

## 4. 目标目录结构

```diagram
modules/market-making/
├─ strategy/
│  ├─ strategy.service.ts                            ← coordinator，目标 < 800 行
│  ├─ strategy.module.ts
│  ├─ controllers/                                   ← 每个 controller 自带算法
│  │  ├─ pure-market-making-strategy.controller.ts        (≈ 700 行)
│  │  ├─ arbitrage-strategy.controller.ts                 (≈ 300 行)
│  │  ├─ volume-strategy.controller.ts                    (≈ 500 行)
│  │  ├─ time-indicator-strategy.controller.ts            (≈ 400 行)
│  │  ├─ dual-account-volume-strategy.controller.ts       (≈ 400 行)
│  │  ├─ dual-account-best-capacity-volume-strategy.controller.ts (≈ 400 行)
│  │  ├─ indicators/technical-indicators.ts               ← 纯函数 EMA/RSI/cross
│  │  ├─ volume-controller.helpers.ts                     (existing)
│  │  └─ strategy-controller.registry.ts                  (existing)
│  ├─ runtime/                                       ← 新建
│  │  ├─ strategy-session-registry.service.ts            (≈ 500 行)
│  │  └─ strategy-watcher-manager.service.ts             (≈ 250 行)
│  ├─ quote/                                         ← 新建（纯计算 / 无策略状态）
│  │  └─ quote-planner.service.ts                        (≈ 500 行)
│  ├─ pmm/                                           ← 新建
│  │  └─ adaptive-pmm-state.service.ts                   (≈ 700 行)
│  ├─ dual-account/                                  ← 新建
│  │  ├─ dual-account-planner.service.ts                 (≈ 1,500 行)
│  │  ├─ dual-account-rebalance.service.ts               (≈ 500 行)
│  │  └─ dual-account-config.ts                          ← 纯函数
│  ├─ execution/                                     ← 已有；扩充 intent-store
│  │  └─ strategy-intent-store.service.ts                ← 吸纳 publishIntents / createIntent / latestIntentsByStrategy
│  ├─ intent/                                        ← 已有
│  ├─ settlement/                                    ← 已有；吸纳全部 fill → ledger 逻辑
│  │  └─ fill-settlement.service.ts                      ← 吸纳 handleSessionFill / applyFillToBalanceLedger / applyFillFeeToBalanceLedger / buildFillLedgerEventKey / buildIncrementalSettlementFill / markTrackedFillSettled / pauseFillSettlementReservations
│  ├─ recovery/                                      ← 已有；吸纳全部 restore* 逻辑
│  │  └─ strategy-startup-recovery.service.ts            ← 吸纳 restoreRuntimeStateForStrategy / restoreDualAccountVolumeRuntimeState / restoreMappedOpenOrder / findCreateIntentForOpenOrder / recoverInterruptedCancelIntentsForStrategy / activateStrategyFromPersistence
│  ├─ observation/                                   ← 已有；吸纳 recordSessionPnL / recordPureMarketMakingMarkout
│  ├─ data/                                          ← 已有
│  └─ config/                                        ← 已有
├─ trackers/
│  └─ tracked-order-shutdown.service.ts              ← 新建：cancelTrackedOrdersForStrategy / waitForTrackedOrdersToSettle / forceTrackedOrdersTerminal / cancelRecoveredExchangeOrder / isOrderOwnedByStrategy / isTrackedOrderTerminal / isCancelResultFinal / normalizeExchangeOrderStatus
├─ risk/                                             ← 新建
│  └─ kill-switch.service.ts                         ← shouldTriggerKillSwitch / parseKillSwitchAbsoluteThreshold / parseKillSwitchPercentThreshold
└─ balance-state/
   └─ order-scoped-balance-query.service.ts          ← 新建（或并入现有 service）：getAvailableBalancesForPair / resolveOrderScopedInventoryRatio
```

### 4.1 与"裸方案"的差异说明

| 你最初提案 | 修正 | 原因 |
|---|---|---|
| `controllers/{pmm,volume,arbitrage,time}-action-builder.service.ts` 旁挂 builder | **删除**，算法搬进对应 controller | 否则没解决"controller 空壳 + service 上帝"的本质问题 |
| `dual-account/{planner, capacity, rebalance, config-normalizer}` 4 文件 | **合并为 3 个**：`planner.service.ts` / `rebalance.service.ts` / `config.ts` | capacity / candidate / score / tradeability 共享中间状态，拆碎会变参数传递地狱 |
| `runtime/strategy-session.service.ts` + `runtime/strategy-lifecycle.service.ts` | **合并为 1 个 `strategy-session-registry.service.ts`** + 独立的 `strategy-watcher-manager.service.ts` | session 与 lifecycle 职责重叠；watcher 依赖完全不同的服务集合，单独拆 |
| `strategy/inventory/strategy-inventory.service.ts` | **删除**，移到 `balance-state/` | 余额来源必须 ledger / cache，不放策略子域 |
| `strategy/risk/strategy-kill-switch.service.ts` | **移到 `modules/market-making/risk/`** | 风控是横切关注点，不属 strategy 子域 |
| `strategy/recovery/strategy-order-cancel.service.ts` | **改放 `trackers/tracked-order-shutdown.service.ts`** | 取消/收尾是 tracked-order 的扩展，IntentWorker / Recovery 都要复用 |
| 一次新建 7-9 个目录 | **strategy/ 内只新建 4 个目录** | 控制变更面，避免一次性失控 |

---

## 5. 拆分顺序（强制按 Phase 走）

```diagram
Phase 1: 搬进已有服务（零新文件，~2,500 行下来）
  ├─ settlement/fill-settlement.service.ts ←
  │     handleSessionFill / applyFillToBalanceLedger /
  │     applyFillFeeToBalanceLedger / buildFillLedgerEventKey /
  │     buildIncrementalSettlementFill / markTrackedFillSettled /
  │     pauseFillSettlementReservations / settleFillToBalanceLedger /
  │     resolveTrackedOrderForFill / mergeDualAccountFillRuntimeIntoPersisted /
  │     applyDualAccountFillProgress / updateMatchedDualAccountCycleMetrics /
  │     finalizeSettledDualAccountCycle / estimateMakerFeeSpread
  ├─ recovery/strategy-startup-recovery.service.ts ←
  │     restoreRuntimeStateForStrategy / restoreDualAccountVolumeRuntimeState /
  │     restoreMappedOpenOrder / findCreateIntentForOpenOrder / quantityMatches /
  │     recoverInterruptedCancelIntentsForStrategy / activateStrategyFromPersistence
  ├─ execution/strategy-intent-store.service.ts ←
  │     publishIntents / createIntent / latestIntentsByStrategy /
  │     clearIntentsForStrategy / getLatestIntentsForStrategy
  └─ observation/runtime-observation.service.ts ←
        recordSessionPnL / recordPureMarketMakingMarkout

Phase 2: 反转 controller（核心架构修复）
  ├─ 每个 controller 实现 tick(ctx) → ExecutorAction[]
  ├─ buildPureMarketMakingActions → PureMarketMakingStrategyController.tick
  │     （含 buildLegacyQuotes / quantizeAndValidateQuote / resolveMinOrderNotional /
  │       isQuoteWithinTolerance / buildStaleOrderActions / buildCancelOrderAction /
  │       appendCancelAction / consumeCancelBudget —— 但这些公共部分稍后会被 Phase 3 抽到 quote/）
  ├─ buildVolumeSessionActions / onVolumeActionsPublished / buildVolumeActions /
  │     buildClobVolumeParams / buildAmmDexVolumeParams / resolveVolumeSide /
  │     computeAmmAmountIn / calculateVWAPForAmount → VolumeStrategyController
  ├─ buildArbitrageActions / evaluateArbitrageOpportunityVWAP → ArbitrageStrategyController
  ├─ buildTimeIndicatorActions / isWithinTimeWindow / fetchCandles / parseBaseQuote
  │     → TimeIndicatorStrategyController
  ├─ buildDualAccount* / on*ActionsPublished → 两个 DualAccount controller
  │     （此时仍直接调主 service 内的 dual-account helpers；Phase 3 再抽走）
  └─ StrategyService 删除所有 buildXxx 方法；改为 controller.tick(ctx)

Phase 3: 抽取支撑域服务
  ├─ quote/quote-planner.service.ts
  │     ← buildLegacyQuotes / quantizeAndValidateQuote / resolveMinOrderNotional /
  │       isQuoteWithinTolerance / buildStaleOrderActions / buildCancelOrderAction /
  │       appendCancelAction / consumeCancelBudget
  │     （由 PMM controller 注入；DualAccount planner 也复用 quantize）
  ├─ pmm/adaptive-pmm-state.service.ts
  │     ← 所有 resolveAdaptivePmm* / shouldReadAdaptivePmmSignals /
  │       shouldBlockAdaptivePmmForMarketSafety / isAdaptivePmmReservationPaused /
  │       appendAdaptivePmmSafetyCancels / logAdaptivePmmDecisionSnapshot /
  │       buildAdaptivePmmDecisionMetadata / persistAdaptivePmmDecisionSnapshot /
  │       updateAdaptivePmmCadence
  │     ← 同时把字段 adaptivePmmWarmupStartedAtByStrategy /
  │       adaptivePmmWarmupTicksByStrategy / slotCancelCooldownByStrategy /
  │       cancelBudgetUsageByStrategySecond 搬入此服务
  ├─ dual-account/dual-account-planner.service.ts
  │     ← buildDualAccountSessionActions / buildDualAccountVolumeActions /
  │       buildDualAccountBestCapacityVolumeActions /
  │       resolveDualAccountCycleAccounts* / computeDualAccountCapacity /
  │       buildDualAccountCapacityDiagnostics / resolveDualAccountCapacityLimiter /
  │       resolveDualAccountExecutionPlan / buildDualAccountBestCapacityCandidates /
  │       computeDualAccountImbalanceRatio / scoreDualAccountBestCapacityCandidate /
  │       resolveBestExecutableDualAccountCandidate / evaluateDualAccountExecution* /
  │       quantizeAndAdaptDualAccountQuote / resolveDualAccountFeeBufferRate /
  │       findDualAccountCandidateCapacity / loadDualAccountBalanceSnapshot /
  │       resolveDualAccountPreferredSide / resolveInventoryReferencePrice /
  │       normalizeDualAccountMakerPrice / isDualAccountMakerPriceValid /
  │       resolveBestDualAccountTradeability* / cloneDualAccountPairBalances /
  │       resolveDualAccountCycleRoles / advanceDualAccountCycleRolesAfterSuccess /
  │       buildActiveDualAccountCycleState
  ├─ dual-account/dual-account-rebalance.service.ts
  │     ← maybeBuildDualAccountRebalanceAction / buildDualAccountRebalanceCandidate /
  │       isDualAccountRebalanceAction
  ├─ dual-account/dual-account-config.ts                 (纯函数)
  │     ← mergeDualAccountConfigIntoRuntime / normalizeDualAccount* /
  │       isBestCapacityConfig / resolveStrategyInputPair / resolveRuntimePair /
  │       maybeWarnDualAccountBestCapacityIgnoredFields / normalizeBehaviorProfile /
  │       applyVariance / readPositiveNumber / readNonNegativeNumber /
  │       readUnitIntervalNumber / isWithinDualAccountProfileWindow /
  │       resolveDualAccountBehaviorProfile / resolveNextDualAccountCadenceMs
  ├─ risk/kill-switch.service.ts
  │     ← shouldTriggerKillSwitch / parseKillSwitchAbsoluteThreshold /
  │       parseKillSwitchPercentThreshold
  └─ controllers/indicators/technical-indicators.ts      (纯函数)
        ← calcEma / calcRsi / avg / calcCross / safePct

Phase 4: 抽取 runtime 基础设施
  ├─ runtime/strategy-session-registry.service.ts
  │     ← sessions map / pendingActivationStrategies / upsertSession /
  │       restoreOrQueueStrategy / canActivateStrategyImmediately /
  │       activatePendingStrategiesForExchange / removeSession /
  │       isStrategyRuntimeEligible / isSameActiveSession / detachSessionFromExecutor /
  │       resolvePooledExecutorTarget / resolveAccountLabel /
  │       resolveRequiredAccountLabels / setConnectorHealthStatus /
  │       getConnectorHealthStatus
  ├─ runtime/strategy-watcher-manager.service.ts
  │     ← startPrivateWatchers / stopPrivateWatchers /
  │       startBalanceWatchers / stopBalanceWatchers
  ├─ trackers/tracked-order-shutdown.service.ts
  │     ← cancelAllRunningStrategies / cancelTrackedOrdersForStrategy /
  │       getCancelableTrackedOrders / waitForTrackedOrdersToSettle /
  │       forceTrackedOrdersTerminal / cancelRecoveredExchangeOrder /
  │       isOrderOwnedByStrategy / isTrackedOrderTerminal / isCancelResultFinal /
  │       normalizeExchangeOrderStatus
  └─ balance-state/order-scoped-balance-query.service.ts
        ← getAvailableBalancesForPair / resolveOrderScopedInventoryRatio
```

每个 Phase 结束必须：

1. `bun run --cwd server build` 通过
2. 已有 `strategy.service.spec.ts / strategy-runtime-architecture.spec.ts / strategy-fill-progress.spec.ts / strategy.balance-cache.spec.ts` 等测试通过
3. 新增服务必须配 `*.spec.ts`
4. `strategy.module.ts` providers / exports 同步更新

---

## 6. 关键设计细节

### 6.1 Controller 反转后的接口

```ts
// config/strategy-controller.types.ts（扩展现有）
export interface StrategyTickContext {
  session: StrategyRuntimeSession;
  strategy: StrategyInstance;
  params: StrategyParams;
  ts: string;
  // 通过 ctx 提供 controller 所需的"读路径"快照，
  // 写路径（下单 / ledger 变更）仍由 intent worker 完成
}

export interface StrategyController {
  readonly type: StrategyType;
  tick(ctx: StrategyTickContext): Promise<ExecutorAction[]>;
  onActionsPublished?(
    ctx: StrategyTickContext,
    actions: ExecutorAction[],
  ): Promise<void>;
}
```

`StrategyService.runSession()` 只做：

```ts
const controller = registry.get(strategy.type);
const actions = await controller.tick(ctx);
if (actions.length > 0) {
  await dispatcher.publish(ctx, actions);
  await controller.onActionsPublished?.(ctx, actions);
}
```

### 6.2 三层不可逆约束（每个 Phase 都必须守住）

- Controller / Planner **永不** 调用 exchange client
- Controller / Planner **永不** 写 ledger
- 余额读取 **必须** 经 `BalanceStateCacheService` 或新 `OrderScopedBalanceQueryService`
- `publishIntents` 经 IntentStore；`IntentWorker` 持有 reservation 与下单
- 结算 / fee 落账经 `FillSettlementService`，永远 `orderId + asset` 维度，永远幂等

### 6.3 命名约定

- Service：`*-service.ts`，`@Injectable()`，承载状态或外部依赖
- 纯函数模块：直接 `*.ts`，无 `@Injectable()`，便于单测
- 单测：与源码同目录，`*.spec.ts`

---

## 7. 体量目标

| 文件 | 目标行数 |
|---|---|
| `strategy.service.ts` | **600 – 800** |
| 每个 controller | 300 – 700 |
| `dual-account/dual-account-planner.service.ts` | ~1,500（算法密集，可接受） |
| `dual-account/dual-account-rebalance.service.ts` | ~500 |
| `pmm/adaptive-pmm-state.service.ts` | 500 – 700 |
| `quote/quote-planner.service.ts` | ~400 |
| `runtime/strategy-session-registry.service.ts` | ~500 |
| `runtime/strategy-watcher-manager.service.ts` | ~250 |
| `trackers/tracked-order-shutdown.service.ts` | ~500 |
| `risk/kill-switch.service.ts` | ~150 |
| `balance-state/order-scoped-balance-query.service.ts` | ~250 |

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| Controller 反转破坏 controller ↔ service 的循环依赖 | Phase 2 严格按"算法整块搬迁 + 同步删除原方法"操作，每搬一个 controller 跑一遍测试 |
| Dual-account planner 体积过大 | 接受 ~1,500 行；内部按 private 区块分节，不要为了拆而拆 |
| `BalanceStateRefreshService` / `OrderBookIngestionService` / `UserStreamIngestionService` 注入散点 | Phase 4 的 `WatcherManager` 集中持有这些依赖 |
| 启动恢复方法移入 recovery 后产生循环依赖（recovery 需调 session registry） | 反转方向：`SessionRegistry` 提供 `upsert(sessionInit)`，`RecoveryService` 在恢复完成后调用 `SessionRegistry.upsert(...)`，而不是 registry 调 recovery |
| 测试覆盖回退 | 每个新服务必须带 `*.spec.ts`；现有 spec 全程绿灯 |

---

## 9. 不做的事（YAGNI）

- 不引入新的 DI token / abstract class / interface 中间层
- 不为"未来可能的 controller"预留 plugin 机制
- 不抽取 controller 共享基类（除非两个 controller 出现 ≥ 30 行真重复）
- 不写兼容旧路径的 shim；旧方法直接删除
- 不动 `modules/market-making/strategy/` 之外的目录结构（仅在 `trackers/ / risk/ / balance-state/` 各加 1 个文件）

---

## 10. 进度追踪

每完成一个 Phase，在 `docs/plans/progress.md` 追加一行：

```
2026-MM-DD  strategy-service-refactor  Phase N done — <一句话总结搬走了什么 + 行数变化>
```

并在 `docs/architecture/server/module-map.md` 同步更新 `strategy/` 子树结构。

### 2026-05-29 完成状态

- Phase 1–4 complete: settlement, recovery, intent storage, observation, controller action building, quote planning, adaptive PMM state, dual-account planning/config, runtime session/watchers, tracked-order shutdown, risk kill-switch, and order-scoped balance reads now live in owning services/controllers.
- `StrategyService` is a coordinator/facade again: Nest hooks, public start/stop/status methods, session tick dispatch, intent publish dispatch, and narrow test-facing compatibility hooks remain.
- Final size: `server/src/modules/market-making/strategy/strategy.service.ts` is 785 lines.

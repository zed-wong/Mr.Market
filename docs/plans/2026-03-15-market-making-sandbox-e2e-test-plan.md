# CCXT Sandbox 做市核心流程 E2E 测试计划

## 概述

本计划实现基于 CCXT 交易所测试网的完整做市核心流程 E2E 测试。测试从交易所账户准备开始，涵盖策略启动、订单执行、真实成交、fill 路由、直至策略停止的完整流程。

**关键约束**：
- 不涉及 Mixin 端流程（单独测试）
- 仅测试交易所端做市逻辑
- 使用 CCXT Sandbox/Testnet 环境
- 需要真实成交来验证 fill routing

## 目标

1. 验证策略可以成功启动并连接到交易所
2. 验证订单可以正确下单、挂在市场
3. 验证真实成交后 fill 可以正确路由
4. 验证策略可以正确停止
5. 验证资金可以正确追踪

## 核心流程覆盖

```
┌─────────────────────────────────────────────────────────────┐
│  交易所端做市核心流程                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 账户准备                                               │
│     ├── 充值测试资金到交易所 sandbox                        │
│     └── 验证余额                                            │
│                                                             │
│  2. 策略启动                                               │
│     ├── 创建做市订单 (market making order)                 │
│     ├── 加载策略配置                                        │
│     └── 注册到 tick 调度器                                 │
│                                                             │
│  3. 订单执行                                               │
│     ├── tick 触发策略计算                                   │
│     ├── 生成下单/撤单 intent                                │
│     ├── 执行 intent (调用交易所 API)                        │
│     └── 验证订单状态                                        │
│                                                             │
│  4. 成交确认 (Fill)                                        │
│     ├── 在交易所端以市价成交                                │
│     ├── 接收 fill 事件                                      │
│     ├── fill 路由到正确订单                                 │
│     └── 更新余额                                            │
│                                                             │
│  5. 策略停止                                               │
│     ├── 触发停止                                            │
│     ├── 撤掉所有挂单                                        │
│     └── 验证状态正确                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 测试环境要求

### 交易所选择

优先使用支持 sandbox 的交易所（按稳定性排序）：

1. **OKX** - 推荐首选
2. **Binance** - testnet
3. **Gate** - testnet

### 凭证配置

```bash
# 交易所 sandbox 凭证
CCXT_SANDBOX_EXCHANGE=okx
CCXT_SANDBOX_API_KEY=xxx
CCXT_SANDBOX_SECRET=xxx

# 测试参数
CCXT_SANDBOX_SYMBOL=BTC/USDT
CCXT_SANDBOX_QUOTE_BALANCE=1000    # 充值测试 USDT 数量
CCXT_SANDBOX_BASE_BALANCE=0.1      # 充值测试 BTC 数量
```

## 测试用例设计

### TC-001: 策略启动与订单执行

**前置条件**：
- 交易所 sandbox 账户有足够测试资金
- 策略定义已配置
- 策略快照 (`strategySnapshot`) 已保存

**步骤**：
1. 记录初始余额 (ledger)
2. 调用 `start_mm` 启动做市
3. 等待 tick 执行 (至少 1-2 个 tick 周期)
4. 验证限价单已挂在市场
5. 验证 `strategy_order_intent` 已记录

**预期结果**：

| 验证项 | 检查内容 |
|--------|----------|
| 订单状态 | `MarketMakingOrder.state = 'running'` |
| 限价单存在 | 交易所返回该订单状态为 `open` |
| 策略生效 | `ExecutorRegistry` 中存在对应的 `ExchangePairExecutor` |
| Tick 调度 | 策略已注册到 `ClockTickCoordinator` |
| Intent 生成 | `strategy_order_intent` 表中有新记录 |
| 资金锁定 | `BalanceLedgerService` 显示资金已锁定 |
| Exchange 映射 | `ExchangeOrderMapping` 已记录订单映射 |

**确保策略生效的关键验证**：
- 策略状态为 `running` 且非暂停
- executor 接收到了 tick 事件
- 策略 controller 产生了 action (下单/撤单)
- action 被写入 intent 表
- intent 被 worker 执行
- 订单实际出现在交易所

### TC-002: Fill 路由

**前置条件**：
- TC-001 已完成，订单已挂出

**步骤**：
1. 在交易所端用市价单成交
2. 等待 fill 事件
3. 查询 fill 路由结果

**预期结果**：
- fill 正确路由到对应订单
- `ExchangeOrderMapping` 已记录
- 余额已更新

### TC-003: 策略停止

**前置条件**：
- TC-002 已完成

**步骤**：
1. 调用 `stop_mm` 停止做市
2. 等待撤单完成
3. 验证所有订单已取消

**预期结果**：
- 订单状态为 `stopped`
- 无挂单残留
- 资金已释放

## 技术架构

### 测试结构

```
server/
└── test/
    └── e2e/
        └── market-making/
            ├── market-making.e2e-spec.ts    # 主测试文件
            └── sandbox-setup.helper.ts      # 测试环境准备
```

### 依赖服务

测试需要模拟/接入的服务：

| 服务 | 处理方式 |
|------|----------|
| ExchangeInitService | Mock，返回 sandbox exchange |
| ExchangeConnectorAdapterService | 真实调用 |
| BalanceLedgerService | 真实调用 |
| TickCoordinatorService | 使用测试时钟 |
| FillRoutingService | 真实调用 |
| PrivateStreamTrackerService | 使用模拟 fill |

## 实施步骤

### Phase 1: 测试基础设施

1. 创建 `test/e2e/market-making/` 目录结构
2. 添加 sandbox 账户充值 helper
3. 添加测试数据清理机制

### Phase 2: 核心流程测试

1. 实现 TC-001: 策略启动与订单执行
2. 实现 TC-002: Fill 路由
3. 实现 TC-003: 策略停止

### Phase 3: 验证与文档

1. 运行完整 E2E 测试
2. 更新测试文档

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Testnet 不稳定 | 使用多个交易所作为备选 |
| 成交价格波动 | 使用足够远离市价的限价单 |
| 测试资金不足 | 自动检查余额，不足则跳过 |
| 测试顺序依赖 | 每个 test 独立准备数据 |

## 验收标准

- [ ] 策略可以成功启动
- [ ] 订单状态为 `running`
- [ ] 策略已注册到 tick 调度器
- [ ] Executor 正在接收 tick 事件
- [ ] Intent 已被生成并写入
- [ ] 限价单存在于交易所
- [ ] Fill 可以正确路由 (TC-002)
- [ ] 策略可以正确停止 (TC-003)
- [ ] 测试数据可以清理

---

**状态**: 规划中
**创建日期**: 2026-03-15

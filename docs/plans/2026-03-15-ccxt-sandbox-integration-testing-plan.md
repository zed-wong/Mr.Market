# CCXT Sandbox 集成测试与 Execution Engine 验证计划

## 概述

本计划实现 Mr.Market 做市系统的 Execution Engine 与 CCXT 交易所 testnet/sandbox 环境的集成测试能力。通过连接真实交易所的测试网络，无需真实资金即可验证做市核心流程的正确性。

## 背景与目标

### 当前状态

- 项目已实现 36 个单元测试文件，使用 Jest mock 模拟交易所
- `ExchangeInitService` 支持多个交易所（OKX, Binance, Alpaca, Gate, MEXC 等）
- 缺乏与真实交易所 API 的集成测试

### 目标

1. **Phase 1**: 建立 CCXT testnet/sandbox 基础设施
2. **Phase 2**: 实现 Execution Engine 核心集成测试
3. **Phase 3**: 扩展做市流程验证

## 方案详情

### Phase 1: CCXT Sandbox 基础设施

#### 1.1 配置支持

在 `ExchangeInitService` 中添加 testnet 模式：

```typescript
// 新增配置项
interface ExchangeConfig {
  name: string;
  accounts: Array<{
    label: string;
    apiKey: string;
    secret: string;
  }>;
  class: any;
  testnet?: boolean;  // 新增
}
```

环境变量：
```bash
# .env 配置
EXCHANGE_TESTNET=true
OKX_TESTNET_API_KEY=xxx
OKX_TESTNET_SECRET=xxx
BINANCE_TESTNET_API_KEY=xxx
BINANCE_TESTNET_SECRET=xxx
```

#### 1.2 支持的交易所

| 交易所 | 参数 | 测试网络 |
|--------|------|----------|
| Binance | `testnet: true` | binance-testnet |
| OKX | `testnet: true` | okx testnet |
| Gate | `testnet: true` | gate testnet |
| Bybit | `testnet: true` | bybit testnet |
| KuCoin | `testnet: true` | kucoin testnet |
| Alpaca | `paper: true` | alpaca paper trading |

#### 1.3 测试基类

创建集成测试基类 `test/helpers/sandbox-exchange.helper.ts`：

```typescript
// 提供测试用的交易所实例和清理函数
class SandboxExchangeHelper {
  async setupExchange(name: string): Promise<ccxt.Exchange>
  async cleanup(): Promise<void>
  async getTestnetBalance(): Promise<Record<string, number>>
}
```

### Phase 2: Execution Engine 集成测试

#### 2.1 ExchangeConnectorAdapter 集成测试

测试文件：`server/src/modules/market-making/execution/exchange-connector-adapter.integration.spec.ts`

```typescript
describe('ExchangeConnectorAdapterService (Integration)', () => {
  // 订单生命周期测试
  it('places, cancels, and fetches limit orders', async () => {
    // 1. 下单
    // 2. 验证订单状态
    // 3. 取消订单
    // 4. 验证取消成功
  });

  // 订单簿获取测试
  it('fetches order book successfully', async () => {
    // 获取 BTC/USDT 订单簿
  });

  // 限流验证
  it('respects rate limiting between requests', async () => {
    // 验证请求间隔
  });
});
```

#### 2.2 Tick → Intent → Exchange 执行流

测试文件：`server/src/modules/market-making/strategy/execution/execution-flow.integration.spec.ts`

验证完整流程：
1. Tick 触发策略计算
2. 生成 Intents（下单/撤单）
3. Intent Worker 执行
4. ExchangeConnectorAdapter 调用真实 API
5. 验证订单状态更新

#### 2.3 Fill Routing 集成

测试文件：`server/src/modules/market-making/execution/fill-routing.integration.spec.ts`

验证：
1. 使用真实 `clientOrderId` 格式 `{orderId}:{seq}`
2. Fill 事件路由到正确的 session
3. ExchangeOrderMapping fallback 工作正常

### Phase 3: 做市核心流程验证

#### 3.1 多订单并发

验证同一 `exchange:pair` 上多个订单的调度和执行。

#### 3.2 暂停/中止/恢复

测试 `PauseWithdrawOrchestratorService` 的完整流程：
1. `stopStrategyForUser`
2. `cancelUntilDrained`
3. `unlockFunds` → `debitWithdrawal`
4. 失败 rollback

#### 3.3 资金余额追踪

验证 `BalanceLedgerService` 与真实交易所余额的一致性。

## 测试分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  单元测试 (Jest Mock)                                       │
│  - 快速执行、无外部依赖                                       │
│  - 验证业务逻辑正确性                                         │
│  - 现有 36 个 spec 文件                                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  集成测试 (CCXT Testnet)                                    │
│  - 真实 API 调用                                            │
│  - 验证与交易所通信                                          │
│  - 新增 3-5 个 integration spec 文件                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  E2E 测试 (可选)                                            │
│  - 完整做市生命周期                                          │
│  - 需要 testnet 资金                                         │
└─────────────────────────────────────────────────────────────┘
```

## 实施步骤

### Step 1: 基础设施

- [ ] 在 `ExchangeInitService` 添加 testnet 配置支持
- [ ] 在 `configuration.ts` 添加 `exchange.testnet` 配置项
- [ ] 创建测试环境变量模板 `.env.testnet.example`
- [ ] 创建 `SandboxExchangeHelper` 测试基类

### Step 2: Connector 集成测试

- [ ] 创建 `exchange-connector-adapter.integration.spec.ts`
- [ ] 测试订单生命周期（place → fetch → cancel）
- [ ] 测试限流机制
- [ ] 添加多交易所切换测试

### Phase 3: Execution Flow 测试

- [ ] 创建 `execution-flow.integration.spec.ts`
- [ ] 测试 tick → intent → exchange 完整流程
- [ ] 测试 fill routing 集成

### Phase 4: 核心流程验证

- [ ] 测试多订单并发
- [ ] 测试暂停/中止/恢复
- [ ] 测试资金余额追踪
- [ ] 更新 `docs/tests/MARKET_MAKING.md`

## 修改的文件

| 文件 | 变更 |
|------|------|
| `server/src/modules/infrastructure/exchange-init/exchange-init.service.ts` | 添加 testnet 支持 |
| `server/src/config/configuration.ts` | 添加 testnet 配置项 |
| `server/.env.testnet.example` | 新增测试网配置模板 |
| `server/test/helpers/sandbox-exchange.helper.ts` | 新增测试基类 |
| `server/src/modules/market-making/execution/exchange-connector-adapter.integration.spec.ts` | 新增集成测试 |
| `server/src/modules/market-making/strategy/execution/execution-flow.integration.spec.ts` | 新增集成测试 |
| `server/src/modules/market-making/execution/fill-routing.integration.spec.ts` | 新增集成测试 |
| `docs/tests/MARKET_MAKING.md` | 更新测试文档 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Testnet API 不稳定 | 使用多个交易所，降级策略 |
| 测试网余额耗尽 | 自动化余额检查 + 提醒 |
| 网络延迟导致测试超时 | 调整 Jest 超时��置 |
| 交易所 API 变更 | 依赖 CCXT 版本锁定 |

## 验收标准

### Phase 1 完成

- [ ] 可以通过环境变量启用 testnet 模式
- [ ] 至少一个交易所（OKX/Binance）可以连接 testnet

### Phase 2 完成

- [ ] `ExchangeConnectorAdapter` 集成测试通过
- [ ] 订单生命周期在 testnet 上验证通过

### Phase 3 完成

- [ ] Tick → Intent → Exchange 流程验证通过
- [ ] Fill routing 在真实环境中工作正常

---

**创建日期**: 2026-03-15
**状态**: 规划中
**优先级**: 高

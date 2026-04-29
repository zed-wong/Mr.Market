# DEX Strategy Architecture: First-Class DEX Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Mr.Market's strategy engine to support DEX (AMM/CLMM) as a first-class execution venue, from admin-direct order creation through runtime LP lifecycle management.

**Architecture:** Extend the existing intent-driven execution pipeline with new DEX intent types, add LP position lifecycle management, introduce EVM execution accounts, and branch admin-direct by venue type — reusing the Controller → Intent → Execution pattern rather than creating a parallel system.

**Tech Stack:** NestJS (backend), SvelteKit + daisyui (frontend), ethers.js (on-chain interactions), TypeORM (entities), bignumber.js (calculations)

---

## Context & Problem

The system currently treats DEX as a narrow off-ramp for volume (wash trading) strategies only. The `EXECUTE_AMM_SWAP` intent type exists but is fire-and-forget: execute a swap, record the tx hash, done. There is no concept of LP position lifecycle, no EVM wallet account management, and no admin-direct creation path for DEX strategies.

This plan addresses three interconnected problems from the existing `2026-04-19-admin-direct-pancakeswap-market-making-plan.md`:

1. **Venue model** is exchange-only → DEX venues are not first-class
2. **Account model** is API-key-only → EVM wallets are not first-class execution accounts  
3. **Strategy model** lacks DEX LP lifecycle → No position management across ticks

Additionally, this plan adds a fourth problem the original plan didn't address:

4. **Intent model** lacks LP-specific intent types → Cannot express "open position", "close position", "rebalance", "collect fees"

## Design Decisions

### D1: Extend existing pipeline, don't create parallel system

The Controller → ExecutorAction → Intent → Execution pipeline works. For DEX, we extend it with new intent types and a new lifecycle-aware controller, not a separate "LP Executor" class à la Hummingbot.

**Rationale:** Mr.Market's ExchangePairExecutor is a scheduler, not a task unit. Adding a Hummingbot-style task executor would create two parallel architectures. Instead, the LP lifecycle state lives in the strategy parameters (like dual-account cycle state already does) and the controller's `decideActions()` produces LP intents per tick.

### D2: LP position state lives in StrategyInstance.parameters

Hummingbot's LPExecutor is a stateful task with active → closed lifecycle. In Mr.Market, the equivalent is: the strategy session holds position state in `parameters` (like `DualAccountActiveCycleState`), and on each tick, the controller decides whether to add liquidity, remove liquidity, rebalance, or collect fees.

**Rationale:** Reuses the existing tick-driven model. The controller is already stateless between ticks — state is persisted in the session's `parameters` JSON. This is how `dualAccountVolume` tracks `activeCycle`; DEX LP strategies will track `lpPositionState` the same way.

### D3: New intent types for LP operations

Add `ADD_LIQUIDITY`, `REMOVE_LIQUIDITY`, and `COLLECT_FEES` intent types alongside the existing `EXECUTE_AMM_SWAP`. These flow through the same IntentStore → Execution pipeline.

### D4: ExecutionAccount replaces APIKeysConfig as the generalized identity model

Create a new `ExecutionAccount` entity that covers both CEX API keys and EVM wallets. The existing `APIKeysConfig` stays for backward compatibility but new flows use `ExecutionAccount`.

### D5: Admin-direct branches by venue type early

`directStart()` splits into `directStartCex()` and `directStartDex()` after a shared preamble (strategy definition lookup, basic validation). This avoids a monolithic method with nested if/else.

---

## Phase Overview

| Phase | Scope | Key Deliverable |
|---|---|---|
| **1** | EVM Execution Account | New entity, CRUD API, encrypted key storage, admin UI |
| **2** | DEX Intent Types & LP Lifecycle | New intent types, LP position state, LP controller |
| **3** | Admin-Direct DEX Branch | Venue toggle, `directStartDex()`, nullable DEX columns on MarketMakingOrder |
| **4** | DEX Preflight & Validation | EVM account gas check, pool existence check, chain support check |
| **5** | Frontend: DEX Order Creation | CreateOrderModal venue toggle, EVM account picker, DEX config forms |

Each phase is independently deployable. Phase 2 and 3 can be developed in parallel. Phase 4 and 5 depend on Phase 1 and 3 respectively.

---

## Phase 1: EVM Execution Account

**Goal:** Make EVM private-key-backed accounts first-class in the account management layer.

### Task 1.1: Create ExecutionAccount Entity

**Files:**
- Create: `server/src/common/entities/market-making/execution-account.entity.ts`
- Modify: `server/src/common/entities/market-making/market-making.module-entity.ts`

**Step 1: Write the entity**

```typescript
// server/src/common/entities/market-making/execution-account.entity.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ExecutionAccountType = 'cex_api_key' | 'evm_wallet';

@Entity('execution_accounts')
export class ExecutionAccount {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  clientId: string;

  @Column({ type: 'varchar', length: 20 })
  accountType: ExecutionAccountType;

  @Column({ type: 'varchar', nullable: true })
  label: string;

  // --- CEX API Key fields (accountType = 'cex_api_key') ---

  @Column({ type: 'varchar', nullable: true })
  exchangeName: string;

  @Column({ type: 'varchar', nullable: true })
  apiKey: string;

  @Column({ type: 'varchar', nullable: true })
  apiSecret: string;

  // --- EVM Wallet fields (accountType = 'evm_wallet') ---

  @Column({ type: 'simple-json', nullable: true })
  supportedChainIds: number[];

  @Column({ type: 'varchar', nullable: true })
  walletAddress: string;

  @Column({ type: 'varchar', nullable: true })
  encryptedPrivateKey: string;

  @Column({ type: 'varchar', nullable: true })
  custodyMode: 'operator_managed' | 'user_imported';

  // --- Validation ---

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  validationStatus: 'pending' | 'valid' | 'invalid';

  @Column({ type: 'varchar', nullable: true })
  validationError: string;

  @Column({ type: 'timestamptz', nullable: true })
  validatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Step 2: Register entity in module**

Add `ExecutionAccount` to the TypeORM entity list in `market-making.module-entity.ts`.

**Step 3: Run type check**

Run: `bun run typecheck`
Expected: Pass

**Step 4: Commit**

```
feat: add ExecutionAccount entity with CEX and EVM account types
```

---

### Task 1.2: ExecutionAccount CRUD Service

**Files:**
- Create: `server/src/modules/admin/execution-accounts/execution-accounts.module.ts`
- Create: `server/src/modules/admin/execution-accounts/execution-accounts.service.ts`
- Create: `server/src/modules/admin/execution-accounts/execution-accounts.controller.ts`

**Step 1: Create the module with CRUD service**

The service should support:

- `createCexAccount(userId, clientId, dto)` — creates `cex_api_key` type, validates API key against exchange
- `createEvmAccount(userId, clientId, dto)` — creates `evm_wallet` type, encrypts private key, derives address, validates gas balance on specified chains
- `listAccounts(userId, clientId)` — returns all accounts for a user
- `getAccount(userId, accountId)` — returns single account (never returns decrypted private key)
- `deleteAccount(userId, accountId)` — soft delete
- `validateEvmAccount(accountId, chainId)` — checks gas balance, wallet address match, chain support

**Step 2: Create the controller with REST endpoints**

```
POST   /admin/execution-accounts          — create account
GET    /admin/execution-accounts          — list accounts
GET    /admin/execution-accounts/:id      — get account
DELETE /admin/execution-accounts/:id      — delete account
POST   /admin/execution-accounts/:id/validate — validate account
```

**Step 3: Write tests**

Test CRUD for both account types, ensuring:
- CEX accounts validate against exchange
- EVM accounts encrypt private key, never return it in API responses
- EVM accounts derive wallet address from private key

**Step 4: Commit**

```
feat: add ExecutionAccount CRUD service and API endpoints
```

---

### Task 1.3: Extend Web3Service for Multi-Wallet

**Files:**
- Modify: `server/src/modules/web3/web3.service.ts`

**Step 1: Add `getSignerForAccount()` method**

```typescript
async getSignerForAccount(accountId: string, chainId: number): Promise<Wallet> {
  // 1. Load ExecutionAccount from DB
  // 2. Decrypt private key
  // 3. Check chainId is in supportedChainIds
  // 4. Create/cached Wallet for (accountId, chainId)
  // 5. Return signer
}
```

Key design:
- Signers are cached per `(accountId, chainId)` — same pattern as existing `getSigner()`
- Private key decryption uses a server-level encryption key (env `ENCRYPTION_KEY`)
- Throws if `chainId` not in account's `supportedChainIds`
- Backwards compatible: existing `getSigner(chainId)` still works for system wallet

**Step 2: Add `getOperatorAddress()` overload**

Current `getOperatorAddress()` returns the system signer's address. Add `getOperatorAddress(chainId, accountId?)` that can also return an account-specific address.

**Step 3: Write tests**

- Test signer creation from EVM account
- Test signer caching per (accountId, chainId)
- Test chain ID validation
- Test that system wallet still works via `getSigner()`

**Step 4: Commit**

```
feat: add multi-wallet signer support to Web3Service
```

---

### Task 1.4: Frontend — Execution Account Management

**Files:**
- Create: `interface/src/lib/components/admin/execution-accounts/ExecutionAccountList.svelte`
- Create: `interface/src/lib/components/admin/execution-accounts/EvmAccountForm.svelte`
- Create: `interface/src/lib/components/admin/execution-accounts/CexAccountForm.svelte`
- Create: `interface/src/lib/helpers/admin/execution-accounts.ts`
- Modify: `interface/src/routes/(bottomNav)/admin/+page.svelte` — add execution accounts section

**Step 1: Create API helpers**

```typescript
// interface/src/lib/helpers/admin/execution-accounts.ts
// POST /admin/execution-accounts
// GET /admin/execution-accounts
// GET /admin/execution-accounts/:id
// DELETE /admin/execution-accounts/:id
// POST /admin/execution-accounts/:id/validate
```

**Step 2: Create account list component**

Shows both CEX API keys and EVM wallets in a unified list with type badge, actions (validate, delete), and status indicators.

**Step 3: Create EVM account form**

Fields: label, supported chains (multi-select from known chains), private key input (masked), custody mode selector.

**Step 4: Create CEX account form (migrate from existing)**

This is a migration of the existing API key creation form to use the unified `ExecutionAccount` model behind the scenes. The form looks identical to the user but creates `cex_api_key` type ExecutionAccount.

**Step 5: Commit**

```
feat: add execution account management UI (CEX + EVM)
```

---

## Phase 2: DEX Intent Types & LP Lifecycle

**Goal:** Extend the strategy engine with LP-specific intent types and a lifecycle-aware LP strategy controller.

### Task 2.1: Add LP Intent Types

**Files:**
- Modify: `server/src/modules/market-making/strategy/config/strategy-intent.types.ts`
- Modify: `server/src/modules/market-making/strategy/config/executor-action.types.ts`
- Modify: `server/src/common/entities/market-making/strategy-order-intent.entity.ts` (if needed for column changes)

**Step 1: Extend `StrategyIntentType`**

```typescript
export type StrategyIntentType =
  | 'CREATE_LIMIT_ORDER'
  | 'CANCEL_ORDER'
  | 'REPLACE_ORDER'
  | 'EXECUTE_AMM_SWAP'
  | 'ADD_LIQUIDITY'       // NEW: open or add to LP position
  | 'REMOVE_LIQUIDITY'    // NEW: close or withdraw from LP position
  | 'COLLECT_FEES'        // NEW: claim accumulated LP fees
  | 'STOP_CONTROLLER'
  | 'STOP_EXECUTOR';
```

**Step 2: Define LP-specific metadata types**

```typescript
export type LpPositionState = {
  positionId: string;          // on-chain NFT ID or internal tracking ID
  dexId: string;
  chainId: number;
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  feeTier: number;
  lowerTick: number;
  upperTick: number;
  liquidity: string;          // BigNumber as string
  entryPrice: string;
  currentPrice: string;
  uncollectedFees: { token0: string; token1: string };
  status: 'active' | 'out_of_range' | 'closed';
  openedAt: string;
  lastRebalancedAt: string | null;
};

export type AddLiquidityMetadata = {
  dexId: string;
  chainId: number;
  poolAddress: string;
  token0: string;
  token1: string;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
  deadline: number;
  recipient: string;
  evmAccountId: string;
};

export type RemoveLiquidityMetadata = {
  dexId: string;
  chainId: number;
  positionId: string;
  liquidity: string;
  amount0Min: string;
  amount1Min: string;
  deadline: number;
  evmAccountId: string;
};

export type CollectFeesMetadata = {
  dexId: string;
  chainId: number;
  positionId: string;
  recipient: string;
  deadline: number;
  evmAccountId: string;
};
```

**Step 3: Verify entity migration**

Ensure `StrategyOrderIntentEntity.type` column can store the new intent types. Since it's likely a `varchar` column, no migration needed — but add a DB migration if the column has a CHECK constraint.

**Step 4: Commit**

```
feat: add ADD_LIQUIDITY, REMOVE_LIQUIDITY, COLLECT_FEES intent types with LP metadata
```

---

### Task 2.2: Add LP Strategy Intent Execution

**Files:**
- Modify: `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
- Create: `server/src/modules/market-making/strategy/dex/lp-execution.service.ts`

**Step 1: Create `LpExecutionService`**

This service handles on-chain LP operations, mirroring `DexVolumeStrategyService` but for LP:

```typescript
export class LpExecutionService {
  async addLiquidity(req: AddLiquidityRequest): Promise<AddLiquidityResult>;
  async removeLiquidity(req: RemoveLiquidityRequest): Promise<RemoveLiquidityResult>;
  async collectFees(req: CollectFeesRequest): Promise<CollectFeesResult>;
  async getPositionInfo(req: PositionInfoRequest): Promise<LpPositionInfo>;
  async isPositionInRange(req: PositionInfoRequest): Promise<boolean>;
}
```

Each method:
1. Gets DEX adapter from `DexAdapterRegistry`
2. Gets signer from `Web3Service.getSignerForAccount(evmAccountId, chainId)`
3. Validates chain support
4. Calls the appropriate on-chain method (mint, burn, collect)
5. Returns on-chain result (txHash, positionId, amounts)

**Step 2: Extend DexAdapter interface**

```typescript
// server/src/modules/defi/adapters/dex-adapter.ts
export interface DexAdapter {
  // ... existing methods ...

  // LP Position Management
  mintPosition(params: MintPositionParams): Promise<MintPositionResult>;
  burnPosition(params: BurnPositionParams): Promise<BurnPositionResult>;
  collectFees(params: CollectFeesParams): Promise<CollectFeesResult>;
  getPositionInfo(params: PositionInfoParams): Promise<PositionInfoResult>;
}
```

**Step 3: Implement in PancakeSwap V3 adapter**

Add LP methods to `pancakeV3.adapter.ts`:
- `mintPosition` — NonfungiblePositionManager.mint()
- `burnPosition` — NonfungiblePositionManager.burn()
- `collectFees` — NonfungiblePositionManager.collect()
- `getPositionInfo` — NonfungiblePositionManager.positions()

**Step 4: Implement in Uniswap V3 adapter**

Same methods using Uniswap V3's NonfungiblePositionManager.

**Step 5: Wire into `StrategyIntentExecutionService.consumeIntent()`**

Add three new branches:

```typescript
case 'ADD_LIQUIDITY':
  result = await this.lpExecutionService.addLiquidity(metadata, evmAccountId);
  break;
case 'REMOVE_LIQUIDITY':
  result = await this.lpExecutionService.removeLiquidity(metadata, evmAccountId);
  break;
case 'COLLECT_FEES':
  result = await this.lpExecutionService.collectFees(metadata, evmAccountId);
  break;
```

**Step 6: Write tests**

Unit tests for:
- `LpExecutionService.addLiquidity()` — mocked adapter, validates params
- `LpExecutionService.removeLiquidity()` — validates position exist
- `LpExecutionService.collectFees()` — validates position exist
- Intent execution routing for the 3 new intent types

**Step 7: Commit**

```
feat: add LP execution service with mint/burn/collect on-chain operations
```

---

### Task 2.3: LP Strategy Controller

**Files:**
- Create: `server/src/modules/market-making/strategy/controllers/lp-strategy.controller.ts`
- Create: `server/src/modules/market-making/strategy/dex/lp-strategy.params.types.ts`
- Modify: `server/src/modules/market-making/strategy/config/strategy-controller.registry.ts`
- Modify: `server/src/modules/market-making/strategy/config/strategy-controller.types.ts`

**Step 1: Define LP strategy params**

```typescript
export type LpStrategyParams = {
  strategyType: 'liquidityProvision';
  executionVenue: 'dex';
  dexId: string;
  chainId: number;
  poolAddress: string;
  token0: string;
  token1: string;
  feeTier: number;
  evmAccountId: string;
  widthPercent: number;           // price range width as % of current price
  rebalanceThreshold: number;      // % price move that triggers rebalance
  rebalanceCooldownMs: number;     // minimum ms between rebalances
  totalAmountQuote: string;        // total position size in quote token
  slippageBps: number;
  // Runtime state (persisted in parameters JSON)
  lpPositionState?: LpPositionState | null;
  pendingRebalance?: boolean;
  lastRebalanceAt?: string;
};
```

**Step 2: Implement `LpStrategyController`**

The controller implements `StrategyController` with these behaviors:

**`decideActions()` logic per tick:**

```
1. If no lpPositionState exists:
   → Return [ADD_LIQUIDITY intent] with current price tick range

2. If lpPositionState.status === 'active':
   → Check if current price is still within [lowerTick, upperTick]
   → If in range: return [] (no action this tick)
   → If out of range:
     → Mark pendingRebalance = true
     → Return [REMOVE_LIQUIDITY intent, then ADD_LIQUIDITY intent]

3. If lpPositionState.status === 'out_of_range':
   → Return [REMOVE_LIQUIDITY, ADD_LIQUIDITY] rebalance intents

4. Periodically (every N ticks):
   → Return [COLLECT_FEES] if uncollected fees > threshold
```

**`onActionsPublished()`**: Update runtime counters (last rebalance time, etc.)

**`getCadenceMs()`**: Returns configurable tick interval (default: 30s for LP position monitoring)

**Step 3: Register in StrategyControllerRegistry**

```typescript
// Add 'liquidityProvision' to StrategyType union
// Map 'liquidityProvision' -> LpStrategyController in registry
```

**Step 4: Add strategy definition seed**

Create DB seed for `liquidityProvision` strategy definition with:
- `controllerType: 'liquidityProvision'`
- `configSchema` with all LP params + JSON schema validation
- `defaultConfig` with sensible defaults
- `launchSurfaces: ['admin_direct_mm']`
- `directExecutionMode: 'single_account'` (EVM wallet account)

**Step 5: Write tests**

- Controller returns ADD_LIQUIDITY when no position exists
- Controller returns empty when position is in range
- Controller returns REMOVE + ADD rebalance when position is out of range
- Controller returns COLLECT_FEES when uncollected fees exceed threshold
- Controller respects rebalanceCooldownMs

**Step 6: Commit**

```
feat: add LP strategy controller with rebalance lifecycle
```

---

### Task 2.4: LP Position State Persistence

**Files:**
- Modify: `server/src/modules/market-making/strategy/strategy.service.ts` — add LP position state update hooks

**Step 1: Update LP position state after intent execution**

After a successful `ADD_LIQUIDITY` execution:
1. Parse on-chain result (positionId, liquidity, tickLower, tickUpper)
2. Update `strategyInstance.parameters.lpPositionState` with the new position
3. Persist via `StrategyInstance.update()`

After `REMOVE_LIQUIDITY`:
1. Set `lpPositionState.status = 'closed'`
2. Clear position-specific fields

After `COLLECT_FEES`:
1. Reset `lpPositionState.uncollectedFees` to zero

**Step 2: Add position state to execution history**

Extend `StrategyExecutionHistory` or `StrategyOrderIntentEntity.metadata` to store LP-specific execution results (positionId, txHash, liquidity amounts).

**Step 3: Commit**

```
feat: persist LP position state in strategy parameters after intent execution
```

---

## Phase 3: Admin-Direct DEX Branch

**Goal:** Allow direct-order creation to target DEX venues using EVM execution accounts.

### Task 3.1: Nullable DEX Columns on MarketMakingOrder

**Files:**
- Modify: `server/src/common/entities/orders/user-orders.entity.ts`
- Create: DB migration

**Step 1: Add nullable DEX columns**

```typescript
// On MarketMakingOrder entity:
@Column({ type: 'varchar', nullable: true })
executionVenue: 'cex' | 'dex';

@Column({ type: 'varchar', nullable: true })
evmAccountId: string;

@Column({ type: 'varchar', nullable: true })
dexId: string;

@Column({ type: 'integer', nullable: true })
chainId: number;

@Column({ type: 'varchar', nullable: true })
token0: string;

@Column({ type: 'varchar', nullable: true })
token1: string;

@Column({ type: 'integer', nullable: true })
feeTier: number;
```

These are nullable so CEX orders don't need them. CEX orders set `executionVenue: 'cex'` and leave DEX columns null. DEX orders set `executionVenue: 'dex'` and leave `apiKeyId`/`exchangeName` conceptually unused (or set exchangeName to the DEX id for compatibility).

**Step 2: Create DB migration**

Generate TypeORM migration for the new columns.

**Step 3: Run migration**

Run: `bun run migration:run`
Expected: Migration succeeds

**Step 4: Commit**

```
feat: add nullable DEX columns to MarketMakingOrder entity
```

---

### Task 3.2: Split directStart into CEX and DEX branches

**Files:**
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.service.ts`
- Modify: `server/src/modules/admin/market-making/admin-direct-mm.dto.ts`

**Step 1: Extend DTO**

```typescript
export class DirectStartDexMarketMakingDto {
  strategyDefinitionId: string;
  executionVenue: 'dex';
  dexId: string;
  chainId: number;
  poolAddress?: string;
  token0: string;
  token1: string;
  feeTier: number;
  evmAccountId: string;
  configOverrides?: Record<string, unknown>;
}

export type DirectStartMarketMakingDto =
  | DirectStartCexMarketMakingDto   // existing DTO (exchangeName, pair, apiKeyId, etc.)
  | DirectStartDexMarketMakingDto;
```

**Step 2: Create `directStartDex()` method**

```typescript
async directStartDex(dto: DirectStartDexMarketMakingDto): Promise<MarketMakingOrder> {
  // 1. Load strategy definition, validate it supports DEX venue
  // 2. Resolve EVM execution account
  // 3. Validate EVM account (chain support, gas balance)
  // 4. Resolve config via StrategyConfigResolverService (DEX branch)
  // 5. Apply DEX runtime fields (dexId, chainId, token0, token1, etc.)
  // 6. Create MarketMakingOrder with DEX columns populated
  // 7. Start the order via MarketMakingRuntimeService
}
```

**Step 3: Route in controller**

```typescript
@Post('direct-start')
async directStart(@Body() dto: DirectStartMarketMakingDto) {
  if (dto.executionVenue === 'dex' || isDexDto(dto)) {
    return this.service.directStartDex(dto as DirectStartDexMarketMakingDto);
  }
  return this.service.directStartCex(dto as DirectStartCexMarketMakingDto);
}
```

**Step 4: Write tests**

- CEX direct-start still works (regression)
- DEX direct-start with valid EVM account creates order with DEX columns
- DEX direct-start with missing EVM account fails validation
- DEX direct-start with unsupported chain fails validation

**Step 5: Commit**

```
feat: split admin-direct into CEX and DEX creation branches
```

---

### Task 3.3: Strategy Config Resolver — DEX Branch

**Files:**
- Modify: `server/src/modules/market-making/strategy/dex/strategy-config-resolver.service.ts`

**Step 1: Add DEX config resolution path**

The existing resolver handles `volume` strategy with `amm_dex` category. Extend it to also handle `liquidityProvision` strategy:

```typescript
// In resolveForOrderSnapshot():
if (executionCategory === 'amm_dex') {
  // existing volume DEX resolution
  resolved.executionCategory = 'amm_dex';
  resolved.executionVenue = 'dex';
  // ... DEX field merging
}

if (strategyType === 'liquidityProvision') {
  // LP strategy resolution
  resolved.executionVenue = 'dex';
  resolved.dexId = config.dexId;
  resolved.chainId = config.chainId;
  resolved.token0 = config.token0;
  resolved.token1 = config.token1;
  resolved.feeTier = config.feeTier;
  resolved.evmAccountId = config.evmAccountId;
}
```

**Step 2: Commit**

```
feat: add LP strategy config resolution path to StrategyConfigResolverService
```

---

## Phase 4: DEX Preflight & Validation

**Goal:** Runtime readiness checks for EVM accounts and DEX venues.

### Task 4.1: EVM Account Validation Service

**Files:**
- Create: `server/src/modules/admin/execution-accounts/evm-account-validation.service.ts`

**Step 1: Implement validation checks**

```typescript
export class EvmAccountValidationService {
  async validateAccountForDex(accountId: string, dexId: string, chainId: number): Promise<ValidationResult> {
    const account = await this.getAccount(accountId);

    // 1. Private key present and decryptable
    // 2. Derived address matches stored walletAddress
    // 3. chainId in account.supportedChainIds
    // 4. DEX adapter supports this chainId
    // 5. Gas balance > minimum threshold (configurable per chain, e.g. 0.01 ETH for Ethereum, 0.005 BNB for BSC)
    // 6. Pool exists: adapter.getPool(token0, token1, feeTier) returns valid address
    // 7. Token balances > 0 for at least one of token0/token1

    return { valid: true, checks: [...] };
  }
}
```

**Step 2: Integrate into `directStartDex()`**

Call `evmAccountValidationService.validateAccountForDex()` before creating the order. If validation fails, return a clear error with which checks failed.

**Step 3: Commit**

```
feat: add EVM account validation service for DEX preflight checks
```

---

### Task 4.2: DEX Strategy Runtime Preflight

**Files:**
- Create: `server/src/modules/market-making/strategy/dex/dex-preflight.service.ts`

**Step 1: Implement DEX-specific preflight checks**

Replaces CEX-style `runSingleAccountPreCheck()` for DEX orders:

```typescript
export class DexPreflightService {
  async runPreflight(params: DexPreflightParams): Promise<PreflightResult> {
    // 1. EVM account validation (delegates to EvmAccountValidationService)
    // 2. Pool existence check
    // 3. Token allowance check (has the token been approved for the router?)
    // 4. Gas estimation for the planned transaction
    // 5. Slippage tolerance check

    return { canProceed: true, warnings: [], checks: [...] };
  }
}
```

**Step 2: Integrate into `directStartDex()` flow**

After account validation, run `DexPreflightService.runPreflight()` before order creation.

**Step 3: Commit**

```
feat: add DEX strategy runtime preflight validation
```

---

## Phase 5: Frontend — DEX Order Creation

**Goal:** Admin can create DEX market-making orders through the same CreateOrderModal UI.

### Task 5.1: Venue Toggle in CreateOrderModal

**Files:**
- Modify: `interface/src/lib/components/market-making/direct/CreateOrderModal.svelte`

**Step 1: Add venue toggle**

At the top of CreateOrderModal, add a toggle between "CEX" and "DEX" venue types. When toggled:
- CEX: shows existing exchange selector + API key selector + pair input
- DEX: shows DEX selector + chain selector + EVM account selector + token pair inputs + fee tier + slippage

**Step 2: Conditional form fields**

```svelte
{#if venueType === 'cex'}
  <!-- existing CEX form: exchange, apiKey, pair -->
{:else if venueType === 'dex'}
  <!-- DEX form: dexId, chainId, evmAccountId, token0, token1, feeTier, slippageBps -->
{/if}
```

**Step 3: Dynamic strategy definition filtering**

When DEX is selected, filter strategy definitions to only show DEX-compatible strategies (`volume` with `amm_dex` + `liquidityProvision`). When CEX, show CEX-compatible strategies.

**Step 4: Commit**

```
feat: add venue toggle (CEX/DEX) to CreateOrderModal
```

---

### Task 5.2: EVM Account Picker Component

**Files:**
- Create: `interface/src/lib/components/admin/execution-accounts/EvmAccountPicker.svelte`
- Modify: `interface/src/lib/types/hufi/admin-direct-market-making.ts`

**Step 1: Create EVM account picker**

A select/dropdown that:
- Fetches EVM execution accounts from `/admin/execution-accounts?type=evm_wallet`
- Shows: label, wallet address (truncated), supported chains
- Filters by selected chainId (only show accounts that support the selected chain)
- Shows validation status badge (pending/valid/invalid)
- Has "Add New Account" button that opens the EVM account form

**Step 2: Update DirectStartPayload type**

```typescript
export type DirectStartPayload =
  | { executionVenue: 'cex'; exchangeName: string; pair: string; strategyDefinitionId: string; apiKeyId: string }
  | { executionVenue: 'cex'; exchangeName: string; pair: string; strategyDefinitionId: string; makerApiKeyId: string; takerApiKeyId: string }
  | { executionVenue: 'dex'; strategyDefinitionId: string; dexId: string; chainId: number; token0: string; token1: string; feeTier: number; evmAccountId: string };
```

**Step 3: Commit**

```
feat: add EVM account picker component for DEX order creation
```

---

### Task 5.3: DEX Config Form

**Files:**
- Create: `interface/src/lib/components/market-making/direct/DexConfigForm.svelte`

**Step 1: Create DEX-specific config form**

Fields:
- DEX selector: dropdown of supported DEXes (PancakeSwap V3, Uniswap V3)
- Chain selector: dropdown filtered by selected DEX's supported chains
- Token 0: text input (contract address) with validation
- Token 1: text input (contract address) with validation
- Fee tier: dropdown (100, 500, 2500, 10000 for Uniswap V3 style)
- Slippage (bps): number input, default 50
- Pool address: auto-resolved from (token0, token1, feeTier) or manual input
- Position width %: number input for LP strategy, default 10%

Auto-resolution:
- When token0, token1, and feeTier are set, call `adapter.getPool()` to resolve pool address
- Show "Pool found" / "Pool not found" status

**Step 2: Commit**

```
feat: add DEX configuration form with pool resolution
```

---

### Task 5.4: LP Strategy Config Template

**Files:**
- Modify: `interface/src/lib/helpers/admin/settings/strategies/configTemplates.ts`

**Step 1: Add `liquidityProvision` template**

```typescript
export const liquidityProvisionTemplate = {
  strategyType: 'liquidityProvision',
  name: 'LP Position Manager',
  description: 'Manage concentrated liquidity positions on AMM/CLMM DEXes',
  directExecutionMode: 'single_account',
  executionVenue: 'dex',
  configSchema: {
    type: 'object',
    properties: {
      dexId: { type: 'string', enum: ['pancakeV3', 'uniswapV3'] },
      chainId: { type: 'number' },
      token0: { type: 'string', description: 'Token 0 contract address' },
      token1: { type: 'string', description: 'Token 1 contract address' },
      feeTier: { type: 'number', enum: [100, 500, 2500, 10000] },
      widthPercent: { type: 'number', default: 10, description: 'Position width as % of current price' },
      rebalanceThreshold: { type: 'number', default: 5, description: 'Price move % that triggers rebalance' },
      rebalanceCooldownMs: { type: 'number', default: 300000, description: 'Minimum ms between rebalances' },
      totalAmountQuote: { type: 'string', default: '0', description: 'Total position size in quote token' },
      slippageBps: { type: 'number', default: 50 },
    },
    required: ['dexId', 'chainId', 'token0', 'token1', 'feeTier'],
  },
  defaultConfig: {
    widthPercent: 10,
    rebalanceThreshold: 5,
    rebalanceCooldownMs: 300000,
    slippageBps: 50,
  },
};
```

**Step 2: Commit**

```
feat: add LP strategy config template for admin-direct creation
```

---

## Architecture Summary

### New Types Added

| Type | File | Purpose |
|---|---|---|
| `ExecutionAccount` | `execution-account.entity.ts` | Unified CEX + EVM account entity |
| `ExecutionAccountType` | `execution-account.entity.ts` | `'cex_api_key' \| 'evm_wallet'` |
| `ADD_LIQUIDITY / REMOVE_LIQUIDITY / COLLECT_FEES` | `strategy-intent.types.ts` | New LP intent types |
| `LpPositionState` | `strategy-intent.types.ts` | LP position lifecycle state tracker |
| `AddLiquidityMetadata / RemoveLiquidityMetadata / CollectFeesMetadata` | `strategy-intent.types.ts` | LP intent metadata shapes |
| `LpStrategyParams` | `lp-strategy.params.types.ts` | LP strategy configuration + runtime state |
| `DirectStartDexMarketMakingDto` | `admin-direct-mm.dto.ts` | DEX direct-start request payload |

### New Files

| File | Purpose |
|---|---|
| `execution-account.entity.ts` | ExecutionAccount entity |
| `execution-accounts.service.ts` | CRUD + validation for execution accounts |
| `execution-accounts.controller.ts` | REST API for execution accounts |
| `evm-account-validation.service.ts` | EVM account readiness checks |
| `lp-execution.service.ts` | On-chain LP operation execution (mint/burn/collect) |
| `lp-strategy.controller.ts` | LP rebalance lifecycle decision logic |
| `lp-strategy.params.types.ts` | LP strategy parameter types |
| `dex-preflight.service.ts` | DEX-specific preflight validation |
| `EvmAccountPicker.svelte` | EVM wallet account selection UI |
| `DexConfigForm.svelte` | DEX configuration form |
| `ExecutionAccountList.svelte` | Account management list UI |
| `EvmAccountForm.svelte` | EVM account creation form |

### Modified Files

| File | Change |
|---|---|
| `strategy-intent.types.ts` | Add 3 new intent types + LP metadata types |
| `executor-action.types.ts` | Add matching action types |
| `strategy-order-intent.entity.ts` | Possibly add index on `type` column for LP intent queries |
| `strategy-controller.types.ts` | Add `'liquidityProvision'` to StrategyType union |
| `strategy-controller.registry.ts` | Register LpStrategyController |
| `strategy-params.types.ts` | Add LpStrategyParams |
| `strategy-execution-category.ts` | No change needed (amm_dex already exists) |
| `strategy-intent-execution.service.ts` | Add 3 new intent execution branches |
| `strategy.service.ts` | Add LP position state update hooks |
| `web3.service.ts` | Add `getSignerForAccount()` for multi-wallet |
| `dex-adapter.ts` | Add LP interface methods (mint, burn, collect, positionInfo) |
| `pancakeV3.adapter.ts` | Implement LP methods |
| `uniswapV3.adapter.ts` | Implement LP methods |
| `admin-direct-mm.service.ts` | Add `directStartDex()` branch |
| `admin-direct-mm.dto.ts` | Add DirectStartDexMarketMakingDto |
| `user-orders.entity.ts` | Add nullable DEX columns |
| `strategy-config-resolver.service.ts` | Add LP strategy config resolution |
| `CreateOrderModal.svelte` | Venue toggle (CEX/DEX), conditional fields |
| `configTemplates.ts` | Add liquidityProvision template |
| `admin-direct-market-making.ts` (frontend types) | Add DEX payload variant |

### Data Flow: DEX LP Order Lifecycle

```
Admin creates DEX order (CreateOrderModal, venue=DEX)
  → POST /admin/market-making/direct-start (DirectStartDexMarketMakingDto)
  → AdminDirectMarketMakingService.directStartDex()
    → Validate EVM account (EvmAccountValidationService)
    → Resolve config (StrategyConfigResolverService, LP branch)
    → Create MarketMakingOrder (with DEX columns)
    → MarketMakingRuntimeService.startOrder()
      → Volume/LP StrategyController.start()
        → Create ExchangePairExecutor session (or DEX executor if venue=DEX)
        → Controller.tick()
          → If no position: ADD_LIQUIDITY intent
          → If position in range: no action
          → If position out of range: REMOVE_LIQUIDITY + ADD_LIQUIDITY
          → If fees > threshold: COLLECT_FEES
        → ExecutorOrchestratorService.dispatchActions()
          → StrategyIntentStoreService.upsertIntent()
          → StrategyIntentExecutionService.consumeIntent()
            → LpExecutionService.addLiquidity() / removeLiquidity() / collectFees()
              → DexAdapter.mintPosition() / burnPosition() / collectFees()
              → On-chain transaction
            → Update StrategyInstance.parameters.lpPositionState
```

---

## Testing Strategy

### Unit Tests (per phase)

| Phase | Tests | Count |
|---|---|---|
| 1 | ExecutionAccount CRUD, Web3Service multi-wallet, API endpoints | ~12 |
| 2 | LP intent types, LpExecutionService mocked adapters, LpStrategyController lifecycle | ~15 |
| 3 | directStartDex flow, CEX regression, MarketMakingOrder DEX columns | ~10 |
| 4 | EVM account validation, pool existence checks, gas balance checks | ~8 |
| 5 | Venue toggle rendering, payload construction, EVM picker filtering | ~8 |
| **Total** | | **~53** |

### Integration Tests

1. **CEX regression**: Create a CEX order via admin-direct, verify all existing flows still work
2. **DEX E2E**: Create a DEX LP order via admin-direct, verify intent creation, execution, and position state persistence

### Manual Testing

1. PancakeSwap V3 on BSC testnet — create LP position, verify rebalance on price movement
2. EVM account creation, key encryption, address derivation verification
3. Admin UI: CEX ↔ DEX venue toggle, all form fields render correctly

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| NonfungiblePositionManager ABI differences between Uniswap V3 and PancakeSwap V3 | Adapter interface abstracts this; test both implementations |
| Private key handling security | Encrypted at rest, never returned in API, server-level encryption key |
| Gas price volatility affecting LP transaction costs | Preflight gas estimation with configurable minimum thresholds |
| Position state lost on server restart | Persisted in StrategyInstance.parameters (DB-backed) |
| Concurrent rebalance intents for the same position | Intent deduplication in consumeIntent() — check for pending intents on same positionId |
| Frontend complexity of dual venue forms | Shared preamble in CreateOrderModal, only branch for venue-specific fields |

---

## Success Criteria

This plan is successful when:

1. An admin can create a PancakeSwap V3 LP order through admin-direct, selecting an EVM wallet as the execution account
2. The LP strategy controller monitors position health and produces rebalance intents when price moves out of range
3. Position state persists across ticks and server restarts
4. CEX order creation flows are completely unaffected by the DEX additions
5. A second DEX (e.g., Uniswap V3) can be added by implementing the adapter interface without touching the strategy or admin flow
6. The `liquidityProvision` strategy works end-to-end: open → monitor → rebalance → collect fees → close
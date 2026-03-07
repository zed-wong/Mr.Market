# Move DeFi Into Modules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move DeFi code from `server/src/defi` into a standalone Nest module at `server/src/modules/defi` without behavior changes, and update all imports/tests/docs.

**Architecture:** Introduce `DefiModule` that provides/exports `DexAdapterRegistry` and concrete adapters. Relocate existing DeFi code under `server/src/modules/defi/**` preserving subfolders (`adapters/`, `utils/`). Update all import sites from `src/defi/*` to `src/modules/defi/*`. Keep strategy DEX code consuming the same public APIs.

**Tech Stack:** NestJS, TypeScript, Jest, bun.

---

### Task 0: Preflight Inventory + Baseline

**Files:**
- Inspect: `server/src/defi/**`
- Inspect: `server/src/modules/market-making/strategy/dex/dex.module.ts`
- Inspect: `server/src/modules/market-making/strategy/dex/dex-volume.strategy.service.ts`

**Step 1: Locate all current DeFi imports**

Run:
```bash
cd server && rg "'src/defi/" src -n
```
Expected: a finite list of import sites to update.

**Step 2: Confirm no existing Defi module**

Run:
```bash
cd server && rg "DefiModule|modules/defi" src -n
```
Expected: no matches.

**Step 3: Baseline tests (proof before moving)**

Run:
```bash
cd server && bun run test -- src/modules/market-making/strategy/dex
```
Expected: PASS.

**Step 4: Commit checkpoint (optional but recommended for bisectability)**

Run:
```bash
git add -A
git commit -m "chore: baseline before moving defi module"
```

---

### Task 1: Create `DefiModule`

**Files:**
- Create: `server/src/modules/defi/defi.module.ts`

**Step 1: Write a minimal module definition**

Create `server/src/modules/defi/defi.module.ts`:
```ts
import { Module } from '@nestjs/common';

import { DexAdapterRegistry } from './adapter-registry';
import { PancakeV3Adapter } from './adapters/pancakeV3.adapter';
import { UniswapV3Adapter } from './adapters/uniswapV3.adapter';

@Module({
  providers: [DexAdapterRegistry, UniswapV3Adapter, PancakeV3Adapter],
  exports: [DexAdapterRegistry, UniswapV3Adapter, PancakeV3Adapter],
})
export class DefiModule {}
```

**Step 2: Build to confirm module compiles**

Run:
```bash
cd server && bun run build
```
Expected: exit 0.

**Step 3: Commit**

Run:
```bash
git add server/src/modules/defi/defi.module.ts
git commit -m "feat: add standalone defi module"
```

---

### Task 2: Move Source Files Under `server/src/modules/defi/**`

**Files:**
- Move:
  - `server/src/defi/adapter-registry.ts` -> `server/src/modules/defi/adapter-registry.ts`
  - `server/src/defi/abis.ts` -> `server/src/modules/defi/abis.ts`
  - `server/src/defi/addresses.ts` -> `server/src/modules/defi/addresses.ts`
  - `server/src/defi/adapters/*` -> `server/src/modules/defi/adapters/*`
  - `server/src/defi/utils/*` -> `server/src/modules/defi/utils/*`

**Step 1: Move files (keep folder names the same)**

Perform git mv for all files.

**Step 2: Fix internal relative imports inside moved files**

Examples to verify:
- `server/src/modules/defi/utils/erc20.ts` should still import `../abis`.
- `server/src/modules/defi/adapter-registry.ts` should still import `./adapters/*`.

**Step 3: Run build**

Run:
```bash
cd server && bun run build
```
Expected: exit 0.

**Step 4: Commit**

Run:
```bash
git add -A
git commit -m "refactor: move defi sources under modules/defi"
```

---

### Task 3: Update All Import Sites

**Files:**
- Modify any matches from search (currently known):
  - `server/src/modules/market-making/strategy/dex/dex.module.ts`
  - `server/src/modules/market-making/strategy/dex/dex-volume.strategy.service.ts`
  - `server/src/modules/market-making/strategy/dex/dex-volume.strategy.service.spec.ts`

**Step 1: Update path imports**

Replace:
- `src/defi/adapter-registry` -> `src/modules/defi/adapter-registry`
- `src/defi/adapters/...` -> `src/modules/defi/adapters/...`
- `src/defi/utils/...` -> `src/modules/defi/utils/...`

**Step 2: Update Jest mocks (if present)**

Example pattern:
- `jest.mock('src/defi/utils/erc20', ...)` -> `jest.mock('src/modules/defi/utils/erc20', ...)`

**Step 3: Wire `DefiModule` where adapters/registry are used**

In `server/src/modules/market-making/strategy/dex/dex.module.ts`:
- Import `DefiModule` from `src/modules/defi/defi.module`.
- Add `DefiModule` to `imports`.
- Avoid duplicating providers already exported by `DefiModule`.

**Step 4: Run targeted tests (proof imports are correct)**

Run:
```bash
cd server && bun run test -- src/modules/market-making/strategy/dex
```
Expected: PASS.

**Step 5: Commit**

Run:
```bash
git add server/src/modules/market-making/strategy/dex
git commit -m "refactor: update dex strategy to use modules/defi imports"
```

---

### Task 4: Repo-Wide Cleanup and Verification

**Step 1: Ensure no `src/defi/*` imports remain**

Run:
```bash
cd server && rg "'src/defi/" src -n
```
Expected: no matches.

**Step 2: Update docs (if any mention `server/src/defi` or `src/defi`)**

Run:
```bash
rg "server/src/defi|src/defi" docs -n
```
Expected: update matches to `server/src/modules/defi` / `src/modules/defi`.

**Step 3: Full verification**

Run:
```bash
cd server && bun run test
cd server && bun run build
```
Expected: tests PASS; build exit 0.

**Step 4: Final commit (if any uncommitted edits remain)**

Run:
```bash
git status --short
git add -A
git commit -m "refactor: relocate defi to standalone modules package"
```

---

## Notes / Non-Goals

- This is a structure change only; do not change runtime behavior.
- Do not add new dependencies.
- Keep `DexAdapterRegistry` public API stable for current consumers.

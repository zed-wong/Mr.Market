# Ledger Order ID / User Order ID Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate ledger balance identity from user-facing order identity so dual-account maker/taker ledger scopes can be aggregated correctly by Performance, order detail, fill history, and reconciliation.

**Architecture:** Keep the existing ledger invariant that balances are scoped by `ledgerOrderId + assetId`. Treat current ledger/balance `orderId` columns as legacy storage for `ledgerOrderId`, add `userOrderId` as the user-facing aggregation key, and propagate `accountLabel` explicitly. Do not rename database columns in the first pass unless a task explicitly says so.

**Tech Stack:** NestJS, TypeORM, bignumber.js, existing market-making ledger/reservation/execution modules.

---

## How To Run Tests

The backend test runner is **Jest**, not Bun's native runner. `bun test ...` invokes Bun's own runner, which ignores `jest.config.js` and the `src/*` path aliases, so it will not work for this codebase.

- Unit tests (default config), from repo root:
  - Single file/dir: `cd server && bunx jest <path-relative-to-server>`
  - Full suite: `cd server && bun run test`
- System tests (separate config in `test/config/jest.system.config.js`):
  - `cd server && bun run test:system -- --testPathPattern='<pattern>'`

All `cd server && bunx jest <path>` commands in this plan use paths relative to `server/`.

---

## Architectural Decision: column naming and code-level compatibility

This plan intentionally makes two different choices for storage vs. code contracts, to satisfy AGENTS.md ("keep the architecture 100% perfect at present, don't do compatibility unless mentioned") while keeping the change small (KISS/YAGNI):

1. **Database column `orderId` stays as-is** in `ledger_entry`, `market_making_order_balance`, `tracked_order`, and `exchange_order_mapping`. It is the balance key (`orderId + assetId`) and is read in many query sites; renaming the physical column is high-risk churn with no behavioral benefit. The column semantically stores `ledgerOrderId`. This is a naming convention, not a compatibility shim, so it does not violate the no-compatibility rule. Entities document this in a comment.

2. **No code-level compatibility fields.** New service contracts and return types must NOT expose a redundant `orderId` alongside `ledgerOrderId`. `FillRouteResolution` is changed to return `ledgerOrderId` / `userOrderId` / `accountLabel` only (Task 5), and its consumer `user-stream-tracker.service.ts` is updated to read `ledgerOrderId`. There is no temporary `orderId` passthrough.

If the team later decides to rename the physical column, that is a separate, self-contained migration and is explicitly out of scope here.

---

## Vocabulary

Use these names in new service contracts and tests:

| Name | Meaning | Example | Primary owners |
|---|---|---|---|
| `userOrderId` | User/product order identity. Performance, UI, rewards, withdrawals, order detail, and user-facing history aggregate by this. | `mm-order-123` | user orders, performance, UI/API DTOs |
| `ledgerOrderId` | Ledger balance bucket identity. Current database `orderId` columns in ledger/balance tables semantically mean this. | `mm-order-123:maker` | ledger, balance, reservation, reconciliation balance checks |
| `accountLabel` | Execution account label under the user order. | `maker`, `taker`, `default` | strategy execution, exchange routing, reconciliation reports |
| `exchangeOrderId` | Exchange-side order id returned by Binance/MEXC/etc. | `987654321` | exchange tracking, cancel/fetch/fill matching |
| `clientOrderId` | Client order id submitted to the exchange. | 20-char hash from `buildSubmittedClientOrderId` | mapping, fill routing, idempotency |

Rules:

- New code must not pass a naked `orderId` across service boundaries when both `userOrderId` and `ledgerOrderId` are possible.
- Ledger/balance storage may keep the existing `orderId` column in phase 1, but code must treat it as `ledgerOrderId`.
- `ledgerOrderId` remains the balance key with `assetId`.
- `userOrderId` is the aggregation key for user-facing reads.
- Dual-account suffix parsing must be centralized. No scattered `split(':')`.

---

## File Structure

### New helper

- Create `server/src/common/helpers/ledger-order-scope.ts`
  - Owns construction and resolution of `userOrderId`, `ledgerOrderId`, and `accountLabel`.
  - Only recognizes explicit dual-account suffixes: `maker`, `taker`.
  - Does not split arbitrary colon-containing IDs.

- Create `server/src/common/helpers/ledger-order-scope.spec.ts`
  - Unit tests for ordinary orders, dual-account orders, default account behavior, and non-dual colon IDs.

### Entities and migrations

- Modify `server/src/common/entities/ledger/ledger-entry.entity.ts`
  - Add `userOrderId` and `accountLabel` columns.
  - Keep `orderId` as stored `ledgerOrderId` for now.

- Modify `server/src/common/entities/ledger/market-making-order-balance.entity.ts`
  - Add `userOrderId` and `accountLabel` columns.
  - Keep primary key as `orderId + assetId`.

- Modify `server/src/common/entities/market-making/tracked-order.entity.ts`
  - Add `userOrderId` column.
  - Existing `orderId` becomes stored `ledgerOrderId` semantically.

- Modify `server/src/common/entities/market-making/exchange-order-mapping.entity.ts`
  - Add `userOrderId`, `accountLabel`, and `exchange` columns.
  - Existing `orderId` becomes stored `ledgerOrderId` semantically.

- Create a migration under `server/src/database/migrations/`
  - Adds new columns.
  - Backfills `userOrderId` and `accountLabel` from existing `orderId` only when the suffix is exactly `:maker` or `:taker`.
  - Defaults normal records to `userOrderId = orderId`, `accountLabel = 'default'` or existing account label where present.

### Services

- Modify `server/src/modules/market-making/ledger/balance-ledger.service.ts`
  - Add `userOrderId` and `accountLabel` to mutation commands.
  - Persist them on ledger entries and order balances.
  - Add read helpers by `userOrderId` for Performance/order detail.

- Modify `server/src/modules/market-making/ledger/order-reservation.service.ts`
  - Rename command field at service boundary to `ledgerOrderId` where practical.
  - Add `userOrderId` and `accountLabel`.
  - Keep reservation pause/release key on `ledgerOrderId + assetId`.

- Modify `server/src/modules/market-making/execution/exchange-order-mapping.service.ts`
  - Store and return `userOrderId`, `ledgerOrderId`, `accountLabel`, and `exchange`.

- Modify `server/src/modules/market-making/execution/fill-routing.service.ts`
  - Return both `ledgerOrderId` and `userOrderId`.
  - Drop the old `orderId` field from `FillRouteResolution`; callers must read `ledgerOrderId`. Update the consumer `server/src/modules/market-making/trackers/user-stream-tracker.service.ts` (reads `resolution.orderId` at multiple sites) to use `resolution.ledgerOrderId`.

- Modify `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`
  - Propagate `userOrderId` through tracked order upserts and queries.

- Modify `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
  - Replace scattered `baseOrderId:accountLabel` construction with helper calls.
  - Maker/taker ledger scopes remain separate.
  - Both maker and taker legs share the same `userOrderId`.

- Modify `server/src/modules/market-making/strategy/settlement/fill-settlement.service.ts`
  - Settle fills into `ledgerOrderId + assetId`.
  - Attribute fills to `userOrderId`.

- Modify Performance/order detail/reconciliation read paths after locating exact files with targeted search.
  - Performance reads by `userOrderId`.
  - Reconciliation balance comparisons stay by `ledgerOrderId + assetId`, but reports include `userOrderId`, `ledgerOrderId`, and `accountLabel`.

### Tests

- Modify existing ledger tests:
  - `server/src/modules/market-making/ledger/balance-ledger.service.spec.ts`
  - `server/src/modules/market-making/ledger/order-reservation.service.spec.ts`

- Modify existing execution/fill tests:
  - `server/src/modules/market-making/execution/fill-routing.service.spec.ts`
  - `server/src/modules/market-making/execution/exchange-order-mapping.service.spec.ts`
  - `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.spec.ts`

- Modify existing tracker/performance/reconciliation tests after locating affected query code:
  - `server/src/modules/market-making/trackers/exchange-order-tracker.service.spec.ts`
  - `server/src/modules/market-making/performance/performance.service.spec.ts`
  - `server/src/modules/market-making/reconciliation/reconciliation.service.spec.ts`

---

## Task 1: Add centralized ledger order scope helper

**Files:**

- Create: `server/src/common/helpers/ledger-order-scope.ts`
- Create: `server/src/common/helpers/ledger-order-scope.spec.ts`

- [ ] **Step 1: Write failing helper tests**

Create `server/src/common/helpers/ledger-order-scope.spec.ts`:

```ts
import {
  buildDualAccountLedgerOrderId,
  normalizeAccountLabel,
  resolveLedgerOrderScope,
} from './ledger-order-scope';

describe('ledger order scope helpers', () => {
  it('treats a normal order as both userOrderId and ledgerOrderId', () => {
    expect(resolveLedgerOrderScope({ ledgerOrderId: 'order-1' })).toEqual({
      userOrderId: 'order-1',
      ledgerOrderId: 'order-1',
      accountLabel: 'default',
    });
  });

  it('resolves maker ledger order id to the root user order', () => {
    expect(resolveLedgerOrderScope({ ledgerOrderId: 'order-1:maker' })).toEqual({
      userOrderId: 'order-1',
      ledgerOrderId: 'order-1:maker',
      accountLabel: 'maker',
    });
  });

  it('resolves taker ledger order id to the root user order', () => {
    expect(resolveLedgerOrderScope({ ledgerOrderId: 'order-1:taker' })).toEqual({
      userOrderId: 'order-1',
      ledgerOrderId: 'order-1:taker',
      accountLabel: 'taker',
    });
  });

  it('does not split non-dual-account colon ids', () => {
    expect(resolveLedgerOrderScope({ ledgerOrderId: 'campaign:order-1' })).toEqual({
      userOrderId: 'campaign:order-1',
      ledgerOrderId: 'campaign:order-1',
      accountLabel: 'default',
    });
  });

  it('prefers explicit userOrderId over parsing', () => {
    expect(
      resolveLedgerOrderScope({
        userOrderId: 'explicit-root',
        ledgerOrderId: 'order-1:maker',
        accountLabel: 'maker',
      }),
    ).toEqual({
      userOrderId: 'explicit-root',
      ledgerOrderId: 'order-1:maker',
      accountLabel: 'maker',
    });
  });

  it('normalizes blank account labels to default', () => {
    expect(normalizeAccountLabel(undefined)).toBe('default');
    expect(normalizeAccountLabel(null)).toBe('default');
    expect(normalizeAccountLabel('')).toBe('default');
    expect(normalizeAccountLabel(' maker ')).toBe('maker');
  });

  it('builds dual-account ledger order ids through one helper', () => {
    expect(
      buildDualAccountLedgerOrderId({
        userOrderId: 'order-1',
        accountLabel: 'maker',
      }),
    ).toBe('order-1:maker');
  });
});
```

- [ ] **Step 2: Run helper test and verify it fails**

Run:

```bash
cd server && bunx jest src/common/helpers/ledger-order-scope.spec.ts
```

Expected: FAIL because `ledger-order-scope.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `server/src/common/helpers/ledger-order-scope.ts`:

```ts
export type LedgerOrderScope = {
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel: string;
};

const DUAL_ACCOUNT_LABELS = new Set(['maker', 'taker']);

export function normalizeAccountLabel(
  accountLabel?: string | null,
): string {
  const normalized = String(accountLabel || '').trim();

  return normalized || 'default';
}

export function buildDualAccountLedgerOrderId(params: {
  userOrderId: string;
  accountLabel: string;
}): string {
  const userOrderId = params.userOrderId.trim();
  const accountLabel = normalizeAccountLabel(params.accountLabel);

  if (!userOrderId) {
    throw new Error('userOrderId must be non-empty');
  }
  if (!DUAL_ACCOUNT_LABELS.has(accountLabel)) {
    throw new Error('dual-account ledger order id requires maker or taker');
  }

  return `${userOrderId}:${accountLabel}`;
}

export function resolveLedgerOrderScope(params: {
  ledgerOrderId: string;
  userOrderId?: string | null;
  accountLabel?: string | null;
}): LedgerOrderScope {
  const ledgerOrderId = params.ledgerOrderId.trim();

  if (!ledgerOrderId) {
    throw new Error('ledgerOrderId must be non-empty');
  }

  const explicitAccountLabel = normalizeAccountLabel(params.accountLabel);
  const explicitUserOrderId = String(params.userOrderId || '').trim();

  if (explicitUserOrderId) {
    return {
      userOrderId: explicitUserOrderId,
      ledgerOrderId,
      accountLabel: explicitAccountLabel,
    };
  }

  const separatorIndex = ledgerOrderId.lastIndexOf(':');

  if (separatorIndex > 0) {
    const possibleUserOrderId = ledgerOrderId.slice(0, separatorIndex);
    const possibleAccountLabel = ledgerOrderId.slice(separatorIndex + 1);

    if (DUAL_ACCOUNT_LABELS.has(possibleAccountLabel)) {
      return {
        userOrderId: possibleUserOrderId,
        ledgerOrderId,
        accountLabel: possibleAccountLabel,
      };
    }
  }

  return {
    userOrderId: ledgerOrderId,
    ledgerOrderId,
    accountLabel: explicitAccountLabel,
  };
}
```

- [ ] **Step 4: Verify helper test passes**

Run:

```bash
cd server && bunx jest src/common/helpers/ledger-order-scope.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper**

```bash
git add server/src/common/helpers/ledger-order-scope.ts server/src/common/helpers/ledger-order-scope.spec.ts
git commit -m "feat: add ledger order scope helper"
```

---

## Task 2: Add persistent user order attribution fields

**Files:**

- Modify: `server/src/common/entities/ledger/ledger-entry.entity.ts`
- Modify: `server/src/common/entities/ledger/market-making-order-balance.entity.ts`
- Modify: `server/src/common/entities/market-making/tracked-order.entity.ts`
- Modify: `server/src/common/entities/market-making/exchange-order-mapping.entity.ts`
- Create: `server/src/database/migrations/<timestamp>-AddLedgerUserOrderAttribution.ts`

- [ ] **Step 1: Update entities**

Add these columns to `LedgerEntry` after `orderId`:

```ts
  @Column()
  @Index()
  userOrderId: string;

  @Column({ default: 'default' })
  @Index()
  accountLabel: string;
```

Add these columns to `MarketMakingOrderBalance` after `orderId`:

```ts
  @Column()
  @Index()
  userOrderId: string;

  @Column({ default: 'default' })
  @Index()
  accountLabel: string;
```

Add this column to `TrackedOrderEntity` after `orderId`:

```ts
  @Column()
  @Index()
  userOrderId: string;
```

Add these columns to `ExchangeOrderMapping` after `orderId`:

```ts
  @Column()
  @Index('IDX_exchange_order_mapping_user_order_id')
  userOrderId: string;

  @Column({ default: 'default' })
  @Index('IDX_exchange_order_mapping_account_label')
  accountLabel: string;

  @Column({ nullable: true })
  @Index('IDX_exchange_order_mapping_exchange')
  exchange?: string | null;
```

- [ ] **Step 2: Add migration**

Create a TypeORM migration. Use the next timestamp in `server/src/database/migrations/`, not the placeholder name.

Migration behavior:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLedgerUserOrderAttribution1780900000000
  implements MigrationInterface
{
  name = 'AddLedgerUserOrderAttribution1780900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ADD "accountLabel" character varying NOT NULL DEFAULT 'default'`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ADD "accountLabel" character varying NOT NULL DEFAULT 'default'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tracked_order" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ADD "userOrderId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ADD "accountLabel" character varying NOT NULL DEFAULT 'default'`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ADD "exchange" character varying`,
    );

    await queryRunner.query(`
      UPDATE "ledger_entry"
      SET
        "userOrderId" = CASE
          WHEN "orderId" LIKE '%:maker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
          WHEN "orderId" LIKE '%:taker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
          ELSE "orderId"
        END,
        "accountLabel" = CASE
          WHEN "orderId" LIKE '%:maker' THEN 'maker'
          WHEN "orderId" LIKE '%:taker' THEN 'taker'
          ELSE 'default'
        END
    `);

    await queryRunner.query(`
      UPDATE "market_making_order_balance"
      SET
        "userOrderId" = CASE
          WHEN "orderId" LIKE '%:maker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
          WHEN "orderId" LIKE '%:taker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
          ELSE "orderId"
        END,
        "accountLabel" = CASE
          WHEN "orderId" LIKE '%:maker' THEN 'maker'
          WHEN "orderId" LIKE '%:taker' THEN 'taker'
          ELSE 'default'
        END
    `);

    await queryRunner.query(`
      UPDATE "tracked_order"
      SET "userOrderId" = CASE
        WHEN "orderId" LIKE '%:maker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
        WHEN "orderId" LIKE '%:taker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
        ELSE "orderId"
      END
    `);

    await queryRunner.query(`
      UPDATE "exchange_order_mapping"
      SET
        "userOrderId" = CASE
          WHEN "orderId" LIKE '%:maker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
          WHEN "orderId" LIKE '%:taker' THEN substring("orderId" from 1 for char_length("orderId") - 6)
          ELSE "orderId"
        END,
        "accountLabel" = CASE
          WHEN "orderId" LIKE '%:maker' THEN 'maker'
          WHEN "orderId" LIKE '%:taker' THEN 'taker'
          ELSE 'default'
        END
    `);

    await queryRunner.query(
      `ALTER TABLE "ledger_entry" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "market_making_order_balance" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tracked_order" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_order_mapping" ALTER COLUMN "userOrderId" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "exchange_order_mapping" DROP COLUMN "exchange"`);
    await queryRunner.query(`ALTER TABLE "exchange_order_mapping" DROP COLUMN "accountLabel"`);
    await queryRunner.query(`ALTER TABLE "exchange_order_mapping" DROP COLUMN "userOrderId"`);
    await queryRunner.query(`ALTER TABLE "tracked_order" DROP COLUMN "userOrderId"`);
    await queryRunner.query(`ALTER TABLE "market_making_order_balance" DROP COLUMN "accountLabel"`);
    await queryRunner.query(`ALTER TABLE "market_making_order_balance" DROP COLUMN "userOrderId"`);
    await queryRunner.query(`ALTER TABLE "ledger_entry" DROP COLUMN "accountLabel"`);
    await queryRunner.query(`ALTER TABLE "ledger_entry" DROP COLUMN "userOrderId"`);
  }
}
```

The production database is PostgreSQL, so the SQL above targets Postgres. Use the next timestamp greater than the current latest migration (`1780800000000-BackfillPureMarketMakingDefinition.ts`) — e.g. `1780900000000`.

- [ ] **Step 3: Add a migration spec**

The unit test suite uses hand-rolled in-memory repositories, so it never runs migrations. Migration correctness must be verified by a dedicated spec, following the existing pattern in `server/src/database/migrations/1780800000000-BackfillPureMarketMakingDefinition.spec.ts`.

Create `server/src/database/migrations/<timestamp>-AddLedgerUserOrderAttribution.spec.ts` that:

- Spins up an in-memory PG-compatible `DataSource` (or the same harness the existing migration specs use), seeds rows with `orderId` values `order-1`, `order-1:maker`, `order-1:taker`, and a non-dual colon id `campaign:order-9`.
- Runs `up()`.
- Asserts backfill: `order-1` → `userOrderId='order-1', accountLabel='default'`; `order-1:maker` → `userOrderId='order-1', accountLabel='maker'`; `order-1:taker` → `userOrderId='order-1', accountLabel='taker'`; `campaign:order-9` → `userOrderId='campaign:order-9', accountLabel='default'` (the `:order-9` suffix is NOT a dual-account label, so it must not be split).
- Runs `down()` and asserts the new columns are gone.

If the existing migration-spec harness cannot run raw Postgres `substring(... from ... for ...)` SQL, mirror whatever dialect those specs already use and keep the backfill semantics identical.

- [ ] **Step 4: Run the migration spec**

```bash
cd server && bunx jest src/database/migrations/<timestamp>-AddLedgerUserOrderAttribution.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit entity/migration scaffold**

```bash
git add server/src/common/entities/ledger/ledger-entry.entity.ts \
  server/src/common/entities/ledger/market-making-order-balance.entity.ts \
  server/src/common/entities/market-making/tracked-order.entity.ts \
  server/src/common/entities/market-making/exchange-order-mapping.entity.ts \
  server/src/database/migrations/*AddLedgerUserOrderAttribution*
git commit -m "feat: add user order attribution fields"
```

---

## Task 3: Persist userOrderId/accountLabel in ledger mutations

**Files:**

- Modify: `server/src/modules/market-making/ledger/balance-ledger.service.ts`
- Modify: `server/src/modules/market-making/ledger/balance-ledger.service.spec.ts`

- [ ] **Step 1: Extend the in-memory mock repositories to filter by `userOrderId`**

`balance-ledger.service.spec.ts` builds hand-rolled repos in `createInMemoryRepos()`. Their `find({ where })` only filters on `orderId`/`userId`/`assetId` and **silently ignores** any `userOrderId` key (returning every row). The new read helpers (`findEntriesByUserOrderId`, `findBalancesByUserOrderId`) and the Task 4/Task 9 assertions depend on real `userOrderId` filtering, so the mocks must be updated first or tests give false positives.

In `createInMemoryRepos()`, add `userOrderId` (and `accountLabel` if asserted) to the `find` predicates of both `ledgerEntryRepository` and `balanceReadModelRepository`:

```ts
find: jest.fn(async ({ where }: any = {}) =>
  entries.filter(
    (item) =>
      (!where?.orderId || item.orderId === where.orderId) &&
      (!where?.userOrderId || item.userOrderId === where.userOrderId) &&
      (!where?.userId || item.userId === where.userId) &&
      (!where?.assetId || item.assetId === where.assetId),
  ),
),
```

Apply the same `userOrderId` guard to the balance repo's `find`. Any other spec files that re-implement these mock repos (e.g. reservation, performance, reconciliation specs) need the same change — grep for `createInMemoryRepos`/inline repo mocks before writing their tests.

- [ ] **Step 2: Write failing ledger test**

Add a test in `balance-ledger.service.spec.ts` near existing mutation tests. Note the injected repo names from `createInMemoryRepos()`: `ledgerEntryRepository` and `balanceReadModelRepository`.

```ts
it('stores user order attribution while keeping orderId as ledgerOrderId', async () => {
  const repos = createInMemoryRepos();
  const service = new BalanceLedgerService(
    repos.ledgerEntryRepository as any,
    repos.balanceReadModelRepository as any,
  );

  await service.lockFunds({
    orderId: 'order-1:maker',
    userOrderId: 'order-1',
    accountLabel: 'maker',
    userId: 'user-1',
    assetId: 'USDT',
    amount: '10',
    idempotencyKey: 'reserve:intent-1',
  });

  const entries = await repos.ledgerEntryRepository.find({
    where: { userOrderId: 'order-1' },
  });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    orderId: 'order-1:maker',
    userOrderId: 'order-1',
    accountLabel: 'maker',
    assetId: 'USDT',
  });

  const balance = await repos.balanceReadModelRepository.findOneBy({
    orderId: 'order-1:maker',
    assetId: 'USDT',
  });
  expect(balance).toMatchObject({
    orderId: 'order-1:maker',
    userOrderId: 'order-1',
    accountLabel: 'maker',
    assetId: 'USDT',
  });
});
```

- [ ] **Step 3: Run ledger test and verify it fails**

Run:

```bash
cd server && bunx jest src/modules/market-making/ledger/balance-ledger.service.spec.ts
```

Expected: FAIL because `BalanceLedgerCommand` lacks `userOrderId`/`accountLabel`, or entries are not persisted.

- [ ] **Step 4: Update BalanceLedgerCommand and persistence**

In `balance-ledger.service.ts`, update the command type:

```ts
type BalanceLedgerCommand = {
  orderId: string;
  userOrderId?: string;
  accountLabel?: string;
  userId: string;
  assetId: string;
  amount: string;
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  reversalOf?: string;
};
```

Import helper:

```ts
import { resolveLedgerOrderScope } from 'src/common/helpers/ledger-order-scope';
```

Inside mutation creation, derive scope once:

```ts
const scope = resolveLedgerOrderScope({
  ledgerOrderId: command.orderId,
  userOrderId: command.userOrderId,
  accountLabel: command.accountLabel,
});
```

When creating `LedgerEntry`, set:

```ts
orderId: scope.ledgerOrderId,
userOrderId: scope.userOrderId,
accountLabel: scope.accountLabel,
```

When creating/updating `MarketMakingOrderBalance`, set:

```ts
orderId: scope.ledgerOrderId,
userOrderId: scope.userOrderId,
accountLabel: scope.accountLabel,
```

Do not change balance lookup keys yet. They remain `orderId + assetId`, where `orderId` is semantically `ledgerOrderId`.

**Idempotency invariant — do NOT touch the content hash.** `buildIdempotencyContentHash` hashes `orderId` (= `ledgerOrderId`), `userId`, `assetId`, `amount`, `type`, `refType`, `refId`, `reversalOf`. It must **not** include `userOrderId` or `accountLabel`. These are derived from `orderId`, so they add no new identity; adding them would change every content hash and trigger false `ledger.idempotency_conflict` errors on replay of existing keys. Leave `buildIdempotencyContentHash` and `assertIdempotencyPayloadMatches` unchanged.

- [ ] **Step 5: Add idempotency-hash regression test**

In `balance-ledger.service.spec.ts`, add a test that pins the hash behavior so a future change can't silently break it:

```ts
it('keeps the idempotency content hash stable when userOrderId/accountLabel are supplied', async () => {
  const repos = createInMemoryRepos();
  const service = new BalanceLedgerService(
    repos.ledgerEntryRepository as any,
    repos.balanceReadModelRepository as any,
  );

  // Same ledger identity (orderId/userId/assetId/amount/type), once without and
  // once with attribution metadata, under the SAME idempotency key.
  await service.lockFunds({
    orderId: 'order-1:maker',
    userId: 'user-1',
    assetId: 'USDT',
    amount: '10',
    idempotencyKey: 'reserve:intent-1',
  });

  // Replaying the same key WITH userOrderId/accountLabel must NOT raise
  // "duplicate idempotency key has different ledger payload".
  await expect(
    service.lockFunds({
      orderId: 'order-1:maker',
      userOrderId: 'order-1',
      accountLabel: 'maker',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '10',
      idempotencyKey: 'reserve:intent-1',
    }),
  ).resolves.toBeDefined();
});
```

- [ ] **Step 6: Add user-order read helpers**

Add methods:

```ts
async findEntriesByUserOrderId(userOrderId: string): Promise<LedgerEntry[]> {
  return await this.ledgerEntryRepository.find({
    where: { userOrderId },
    order: { createdAt: 'ASC', entryId: 'ASC' },
  });
}

async findBalancesByUserOrderId(
  userOrderId: string,
): Promise<MarketMakingOrderBalance[]> {
  return await this.orderBalanceRepository.find({
    where: { userOrderId },
    order: { orderId: 'ASC', assetId: 'ASC' },
  });
}
```

- [ ] **Step 7: Verify ledger tests pass**

Run:

```bash
cd server && bunx jest src/modules/market-making/ledger/balance-ledger.service.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit ledger persistence**

```bash
git add server/src/modules/market-making/ledger/balance-ledger.service.ts \
  server/src/modules/market-making/ledger/balance-ledger.service.spec.ts
git commit -m "feat: persist user order attribution in ledger"
```

---

## Task 4: Propagate userOrderId through reservations

**Files:**

- Modify: `server/src/modules/market-making/ledger/order-reservation.service.ts`
- Modify: `server/src/modules/market-making/ledger/order-reservation.service.spec.ts`

- [ ] **Step 1: Write failing reservation test**

Add a test proving maker/taker stay ledger-isolated but share user attribution:

```ts
it('reserves dual-account scopes separately while sharing userOrderId', async () => {
  await service.reserveForLimitOrder({
    orderId: 'order-1:maker',
    userOrderId: 'order-1',
    accountLabel: 'maker',
    userId: 'user-1',
    intentId: 'maker-intent',
    pair: 'BTC/USDT',
    side: 'buy',
    price: '100',
    qty: '1',
  });

  await service.reserveForLimitOrder({
    orderId: 'order-1:taker',
    userOrderId: 'order-1',
    accountLabel: 'taker',
    userId: 'user-1',
    intentId: 'taker-intent',
    pair: 'BTC/USDT',
    side: 'sell',
    price: '100',
    qty: '1',
  });

  const balances = await balanceLedgerService.findBalancesByUserOrderId('order-1');
  expect(balances.map((balance) => balance.orderId).sort()).toEqual([
    'order-1:maker',
    'order-1:taker',
  ]);
  expect(new Set(balances.map((balance) => balance.userOrderId))).toEqual(
    new Set(['order-1']),
  );
});
```

- [ ] **Step 2: Run reservation test and verify it fails**

Run:

```bash
cd server && bunx jest src/modules/market-making/ledger/order-reservation.service.spec.ts
```

Expected: FAIL because reservation command does not accept/pass attribution.

- [ ] **Step 3: Extend reservation command**

Update `LimitOrderReservationCommand`:

```ts
type LimitOrderReservationCommand = {
  orderId: string;
  userOrderId?: string;
  accountLabel?: string;
  userId: string;
  intentId: string;
  pair: string;
  side: 'buy' | 'sell';
  price: string;
  qty: string;
};
```

In every `balanceLedgerService.lockFunds` / `unlockFunds` call, pass:

```ts
userOrderId: command.userOrderId,
accountLabel: command.accountLabel,
```

Keep `orderId: command.orderId` unchanged, because that value is the `ledgerOrderId` storage key.

- [ ] **Step 4: Verify reservation tests pass**

Run:

```bash
cd server && bunx jest src/modules/market-making/ledger/order-reservation.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit reservation propagation**

```bash
git add server/src/modules/market-making/ledger/order-reservation.service.ts \
  server/src/modules/market-making/ledger/order-reservation.service.spec.ts
git commit -m "feat: propagate user order attribution through reservations"
```

---

## Task 5: Store attribution in exchange order mappings and fill routing

**Files:**

- Modify: `server/src/modules/market-making/execution/exchange-order-mapping.service.ts`
- Modify: `server/src/modules/market-making/execution/exchange-order-mapping.service.spec.ts`
- Modify: `server/src/modules/market-making/execution/fill-routing.service.ts`
- Modify: `server/src/modules/market-making/execution/fill-routing.service.spec.ts`
- Modify: `server/src/modules/market-making/trackers/user-stream-tracker.service.ts` (consumer of `FillRouteResolution`)
- Modify: `server/src/modules/market-making/trackers/user-stream-tracker.service.spec.ts` (mocks `resolveOrderForFill` ~15 times returning `{ orderId }`; must return `{ ledgerOrderId, userOrderId, accountLabel }`)

**`exchangeOrderId` is not globally unique.** The `exchange_order_mapping.exchangeOrderId` index is non-unique, so the same numeric id from two exchanges can collide. Since this task adds the `exchange` column, also scope the exchange-id lookup by `exchange` to prevent cross-exchange fill mis-attribution. Add `exchange` as an *input* to `resolveOrderForFill`. Do NOT add `accountLabel` as an input — it is a derived *output* of resolution.

- [ ] **Step 1: Write failing mapping test**

In `exchange-order-mapping.service.spec.ts`, add:

```ts
it('stores userOrderId and accountLabel for a mapped exchange order', async () => {
  const mapping = await service.createMapping({
    orderId: 'order-1:taker',
    userOrderId: 'order-1',
    accountLabel: 'taker',
    exchange: 'binance',
    exchangeOrderId: 'exchange-1',
    clientOrderId: 'client-1',
  });

  expect(mapping).toMatchObject({
    orderId: 'order-1:taker',
    userOrderId: 'order-1',
    accountLabel: 'taker',
    exchange: 'binance',
    exchangeOrderId: 'exchange-1',
    clientOrderId: 'client-1',
  });
});
```

- [ ] **Step 2: Write failing fill routing test**

In `fill-routing.service.spec.ts`, add:

```ts
it('returns both ledger order and user order from client order mapping', async () => {
  await mappingService.createMapping({
    orderId: 'order-1:taker',
    userOrderId: 'order-1',
    accountLabel: 'taker',
    exchange: 'binance',
    exchangeOrderId: 'exchange-1',
    clientOrderId: 'client-1',
  });

  await expect(
    service.resolveOrderForFill({
      clientOrderId: 'client-1',
      exchangeOrderId: 'exchange-1',
    }),
  ).resolves.toMatchObject({
    ledgerOrderId: 'order-1:taker',
    userOrderId: 'order-1',
    accountLabel: 'taker',
    source: 'mapping',
  });
});
```

Note: `FillRouteResolution` no longer has an `orderId` field (see Step 5), so the assertion must not reference it.

- [ ] **Step 3: Run mapping/fill tests and verify failure**

Run:

```bash
cd server && bunx jest src/modules/market-making/execution/exchange-order-mapping.service.spec.ts \
  src/modules/market-making/execution/fill-routing.service.spec.ts
```

Expected: FAIL because service signatures and return types lack attribution.

- [ ] **Step 4: Update mapping service signatures**

Update `reserveMapping` params:

```ts
async reserveMapping(params: {
  orderId: string;
  userOrderId?: string;
  accountLabel?: string;
  exchange?: string;
  clientOrderId: string;
}): Promise<ExchangeOrderMapping>
```

Update `createMapping` params:

```ts
async createMapping(params: {
  orderId: string;
  userOrderId?: string;
  accountLabel?: string;
  exchange?: string;
  exchangeOrderId: string;
  clientOrderId: string;
}): Promise<ExchangeOrderMapping>
```

Use `resolveLedgerOrderScope` before save:

```ts
const scope = resolveLedgerOrderScope({
  ledgerOrderId: params.orderId,
  userOrderId: params.userOrderId,
  accountLabel: params.accountLabel,
});
```

Persist:

```ts
orderId: scope.ledgerOrderId,
userOrderId: scope.userOrderId,
accountLabel: scope.accountLabel,
exchange: params.exchange || null,
```

Add an exchange-scoped lookup (the existing `findByExchangeOrderId` matches on `exchangeOrderId` alone, which is not unique across exchanges):

```ts
async findByExchangeOrder(params: {
  exchange?: string | null;
  exchangeOrderId: string;
}): Promise<ExchangeOrderMapping | null> {
  return await this.exchangeOrderMappingRepository.findOneBy(
    params.exchange
      ? { exchange: params.exchange, exchangeOrderId: params.exchangeOrderId }
      : { exchangeOrderId: params.exchangeOrderId },
  );
}
```

Keep the old `findByExchangeOrderId` only if other callers still use it; otherwise migrate them to `findByExchangeOrder`.

- [ ] **Step 5: Update fill routing return type and scope by exchange**

Add `exchange` as an input to `resolveOrderForFill` and pass it to the exchange-id lookup:

```ts
async resolveOrderForFill(params: {
  clientOrderId?: string | null;
  exchangeOrderId?: string | null;
  exchange?: string | null;
}): Promise<FillRouteResolution | null>
```

In `resolveOrderFromExchangeOrderId`, call `findByExchangeOrder({ exchange, exchangeOrderId })`. Then update the consumer (`user-stream-tracker.service.ts`, Step 6) to pass the fill's `exchange`.

Replace `FillRouteResolution` with attribution fields and **no** legacy `orderId` field:

```ts
export type FillRouteResolution =
  | {
      ledgerOrderId: string;
      userOrderId: string;
      accountLabel: string;
      seq: number;
      source: 'clientOrderId';
    }
  | {
      ledgerOrderId: string;
      userOrderId: string;
      accountLabel: string;
      source: 'mapping' | 'exchangeOrderMapping';
    };
```

For mapping results (`source: 'mapping' | 'exchangeOrderMapping'`), return:

```ts
ledgerOrderId: mapping.orderId,
userOrderId: mapping.userOrderId,
accountLabel: mapping.accountLabel,
```

For the legacy `parseClientOrderId` fallback, derive the scope with the helper:

```ts
const scope = resolveLedgerOrderScope({ ledgerOrderId: parsed.orderId });
```

Note: `parseClientOrderId` (`server/src/common/helpers/client-order-id.ts`) only accepts the `orderId:seq` form and rejects any `orderId` containing `:` (see `buildClientOrderId`). So `parsed.orderId` is always colon-free and this path always resolves to `accountLabel: 'default'`. Dual-account (maker/taker) fills are never routed through this legacy path — they use the hashed `buildSubmittedClientOrderId` + exchange-order-mapping path, which is why the mapping must persist `userOrderId`/`accountLabel`. Do not add suffix-parsing here.

- [ ] **Step 6: Update fill routing consumer and its spec**

Update `server/src/modules/market-making/trackers/user-stream-tracker.service.ts`:

- It reads `resolution.orderId` (around lines 254-255, 267, 281, 339, 351). Replace those with `resolution.ledgerOrderId` so fills still attribute to the ledger balance bucket. `userOrderId`/`accountLabel` are available on the resolution for logging/attribution if needed.
- Pass the fill's `exchange` into the `resolveOrderForFill({ ..., exchange })` call so the exchange-scoped lookup works.

Update `user-stream-tracker.service.spec.ts`: every `resolveOrderForFill` mock currently returns `{ orderId: ... }`; change those return values to `{ ledgerOrderId, userOrderId, accountLabel, source }`. Also update `fill-routing.service.spec.ts` existing tests that assert the old `{ orderId, source }` shape.

- [ ] **Step 7: Verify mapping/fill tests pass**

Run:

```bash
cd server && bunx jest src/modules/market-making/execution/exchange-order-mapping.service.spec.ts \
  src/modules/market-making/execution/fill-routing.service.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit mapping/fill routing**

```bash
git add server/src/modules/market-making/execution/exchange-order-mapping.service.ts \
  server/src/modules/market-making/execution/exchange-order-mapping.service.spec.ts \
  server/src/modules/market-making/execution/fill-routing.service.ts \
  server/src/modules/market-making/execution/fill-routing.service.spec.ts \
  server/src/modules/market-making/trackers/user-stream-tracker.service.ts \
  server/src/modules/market-making/trackers/user-stream-tracker.service.spec.ts
git commit -m "feat: route fills with user order attribution"
```

---

## Task 6: Replace dual-account string construction in strategy execution

**Files:**

- Modify: `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`
- Modify: `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.spec.ts`

- [ ] **Step 1: Write failing execution test**

Update or add a test around inline taker creation:

```ts
it('creates inline taker with separate ledgerOrderId and shared userOrderId', async () => {
  await service.consumeIntent({
    type: 'CREATE_LIMIT_ORDER',
    intentId: 'maker-intent',
    runtimeInstanceKey: 'runtime-1',
    strategyKey: 'strategy-1',
    userId: 'user-1',
    clientId: 'order-1',
    exchange: 'binance',
    accountLabel: 'maker',
    pair: 'BTC/USDT',
    side: 'buy',
    price: '100',
    qty: '1',
    postOnly: true,
    metadata: {
      orderId: 'order-1:maker',
      userOrderId: 'order-1',
      baseOrderId: 'order-1',
      role: 'maker',
      takerAccountLabel: 'taker',
    },
    createdAt: '2026-06-11T00:00:00.000Z',
    status: 'NEW',
  });

  expect(orderReservationService.reserveForLimitOrder).toHaveBeenCalledWith(
    expect.objectContaining({
      orderId: 'order-1:maker',
      userOrderId: 'order-1',
      accountLabel: 'maker',
    }),
  );

  expect(orderReservationService.reserveForLimitOrder).toHaveBeenCalledWith(
    expect.objectContaining({
      orderId: 'order-1:taker',
      userOrderId: 'order-1',
      accountLabel: 'taker',
    }),
  );
});
```

Adjust mocks to match existing test setup. The point is to assert both legs share `userOrderId` while using different ledger `orderId` values.

- [ ] **Step 2: Run execution test and verify failure**

Run:

```bash
cd server && bunx jest src/modules/market-making/strategy/execution/strategy-intent-execution.service.spec.ts
```

Expected: FAIL because execution does not pass `userOrderId` consistently.

- [ ] **Step 3: Add local scope resolver methods**

Import helper:

```ts
import {
  buildDualAccountLedgerOrderId,
  resolveLedgerOrderScope,
} from 'src/common/helpers/ledger-order-scope';
```

Replace `resolveOrderIdForClientOrderId` with a clearer method while keeping call sites minimal:

```ts
private resolveIntentOrderScope(intent: StrategyOrderIntent) {
  const metadata =
    intent.metadata && typeof intent.metadata === 'object'
      ? (intent.metadata as Record<string, unknown>)
      : {};
  const ledgerOrderId =
    typeof metadata.orderId === 'string' ? metadata.orderId : intent.clientId;
  const userOrderId =
    typeof metadata.userOrderId === 'string' ? metadata.userOrderId : undefined;

  return resolveLedgerOrderScope({
    ledgerOrderId,
    userOrderId,
    accountLabel: intent.accountLabel,
  });
}
```

Callers that currently use `resolveOrderIdForClientOrderId(intent)` should use:

```ts
const scope = this.resolveIntentOrderScope(intent);
const orderId = scope.ledgerOrderId;
```

When passing to reservation/mapping/tracker, include:

```ts
userOrderId: scope.userOrderId,
accountLabel: scope.accountLabel,
```

- [ ] **Step 4: Replace inline taker ledger id construction**

In `buildImmediateDualAccountTakerIntent`, replace direct template construction with:

```ts
const makerScope = this.resolveIntentOrderScope(intent);
const takerLedgerOrderId = buildDualAccountLedgerOrderId({
  userOrderId: makerScope.userOrderId,
  accountLabel: takerAccountLabel,
});
```

Set taker metadata:

```ts
metadata: {
  ...metadata,
  role: 'taker',
  orderId: takerLedgerOrderId,
  userOrderId: makerScope.userOrderId,
  makerOrderId: makerExchangeOrderId,
  makerIntentId: intent.intentId,
  trigger: 'maker_ack',
  triggerFillQty: takerQty.toFixed(),
}
```

In `assertImmediateDualAccountTakerReservationAvailable`, use helper instead of raw `${baseOrderId}:${takerAccountLabel}`:

```ts
const makerScope = this.resolveIntentOrderScope(intent);
const takerLedgerOrderId = buildDualAccountLedgerOrderId({
  userOrderId: makerScope.userOrderId,
  accountLabel: takerAccountLabel,
});
```

Pass:

```ts
orderId: takerLedgerOrderId,
userOrderId: makerScope.userOrderId,
accountLabel: takerAccountLabel,
```

- [ ] **Step 5: Verify execution tests pass**

Run:

```bash
cd server && bunx jest src/modules/market-making/strategy/execution/strategy-intent-execution.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit execution propagation**

```bash
git add server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts \
  server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.spec.ts
git commit -m "feat: separate ledger and user order ids in execution"
```

---

## Task 7: Add userOrderId to tracked orders

**Files:**

- Modify: `server/src/modules/market-making/trackers/exchange-order-tracker.service.ts`
- Modify: `server/src/modules/market-making/trackers/exchange-order-tracker.service.spec.ts`
- Modify call sites in `server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts`

- [ ] **Step 1: Write failing tracker test**

Add a test in `exchange-order-tracker.service.spec.ts`:

```ts
it('persists userOrderId on tracked orders', async () => {
  service.upsertOrder({
    orderId: 'order-1:maker',
    userOrderId: 'order-1',
    strategyKey: 'strategy-1',
    exchange: 'binance',
    accountLabel: 'maker',
    pair: 'BTC/USDT',
    exchangeOrderId: 'exchange-1',
    clientOrderId: 'client-1',
    role: 'maker',
    side: 'buy',
    price: '100',
    qty: '1',
    status: 'open',
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  });

  expect(service.getTrackedOrders('strategy-1')[0]).toMatchObject({
    orderId: 'order-1:maker',
    userOrderId: 'order-1',
    accountLabel: 'maker',
  });
});
```

- [ ] **Step 2: Run tracker test and verify failure**

Run:

```bash
cd server && bunx jest src/modules/market-making/trackers/exchange-order-tracker.service.spec.ts
```

Expected: FAIL because tracked order types lack `userOrderId`.

- [ ] **Step 3: Update tracker types and persistence**

Add `userOrderId: string` to the tracked order type. When upserting, derive with `resolveLedgerOrderScope` if caller does not pass it:

```ts
const scope = resolveLedgerOrderScope({
  ledgerOrderId: order.orderId,
  userOrderId: order.userOrderId,
  accountLabel: order.accountLabel,
});
```

Persist:

```ts
orderId: scope.ledgerOrderId,
userOrderId: scope.userOrderId,
accountLabel: scope.accountLabel,
```

- [ ] **Step 4: Update execution tracked-order upserts**

Where execution calls `exchangeOrderTrackerService.upsertOrder`, pass `userOrderId` from `resolveIntentOrderScope(intent)`.

- [ ] **Step 5: Verify tracker and execution tests pass**

Run:

```bash
cd server && bunx jest src/modules/market-making/trackers/exchange-order-tracker.service.spec.ts \
  src/modules/market-making/strategy/execution/strategy-intent-execution.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit tracked order attribution**

```bash
git add server/src/modules/market-making/trackers/exchange-order-tracker.service.ts \
  server/src/modules/market-making/trackers/exchange-order-tracker.service.spec.ts \
  server/src/modules/market-making/strategy/execution/strategy-intent-execution.service.ts
git commit -m "feat: track exchange orders by user order id"
```

---

## Task 8: Attribute settled fills by ledgerOrderId/userOrderId

This task was missing from the original plan even though the File Structure lists `fill-settlement.service.ts`. Settlement is the actual fill-attribution point, and it currently builds dual-account ledger ids inline with `${baseOrderId}:${accountLabel}` in **two** places (`buildFillSettlementFailureContext`/pause path around line 309 and `settleFillForSession` around line 338). Those scattered constructions must move to the helper, or the Task 11 invariant will flag them.

**Files:**

- Modify: `server/src/modules/market-making/strategy/settlement/fill-settlement.service.ts`
- Modify: `server/src/modules/market-making/strategy/settlement/fill-settlement.service.spec.ts`

- [ ] **Step 1: Write failing settlement test**

In `fill-settlement.service.spec.ts`, add a test that a maker-account fill settles into the maker ledger scope and (because the ledger auto-derives scope from `orderId`) the resulting ledger entries carry `userOrderId = baseOrderId`:

```ts
it('settles a maker-account fill into the maker ledger scope sharing the user order', async () => {
  // session.marketMakingOrderId (or clientId) = 'order-1', fill.accountLabel = 'maker'
  await service.settleFillForSession(session, { ...fill, accountLabel: 'maker' });

  expect(balanceLedgerService.adjust).toHaveBeenCalledWith(
    expect.objectContaining({ orderId: 'order-1:maker' }),
  );
});
```

Match the test to the existing spec's session/fill builders and `balanceLedgerService` mock. The required assertion: the `accountLabel='maker'` fill is attributed to ledger order `order-1:maker`, and an `accountLabel='taker'` fill (in a sibling test or the same one) is attributed to `order-1:taker` — both built via the helper, not inline templates.

- [ ] **Step 2: Run settlement test and verify it fails**

```bash
cd server && bunx jest src/modules/market-making/strategy/settlement/fill-settlement.service.spec.ts
```

Expected: PASS already if behavior is identical (the refactor is behavior-preserving). If you also assert the helper is used (e.g. via a guard in Task 11), it fails until Step 3. The real goal of Step 1 is a regression guard before refactoring.

- [ ] **Step 3: Replace inline construction with the helper**

Import:

```ts
import { buildDualAccountLedgerOrderId } from 'src/common/helpers/ledger-order-scope';
```

Replace both occurrences of:

```ts
const orderId = accountLabel
  ? `${baseOrderId}:${accountLabel}`
  : baseOrderId;
```

with:

```ts
const orderId =
  accountLabel === 'maker' || accountLabel === 'taker'
    ? buildDualAccountLedgerOrderId({ userOrderId: baseOrderId, accountLabel })
    : baseOrderId;
```

Do not pass `userOrderId`/`accountLabel` into the `balanceLedgerService.adjust`/`debitFee` commands unless needed — the ledger derives them from `orderId` via `resolveLedgerOrderScope` (Task 3). Keep settlement commands minimal (KISS). This keeps the idempotency content hash unchanged (Task 3 invariant).

- [ ] **Step 4: Verify settlement tests pass**

```bash
cd server && bunx jest src/modules/market-making/strategy/settlement/fill-settlement.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit settlement attribution**

```bash
git add server/src/modules/market-making/strategy/settlement/fill-settlement.service.ts \
  server/src/modules/market-making/strategy/settlement/fill-settlement.service.spec.ts
git commit -m "refactor: centralize dual-account ledger id in fill settlement"
```

---

## Task 9: Update Performance and order-detail reads to aggregate by userOrderId

**Files:**

- Locate with: `rg -n "findByOrderId|getBalance\(|orderId.*performance|Performance" server/src/modules/market-making server/src/modules/admin`
- Expected modify: `server/src/modules/market-making/performance/performance.service.ts`
- Do NOT modify `OrderPerformanceDto` — the only required behavioral change is reading ledger entries by `userOrderId` instead of `orderId`. The existing `summary` shape and all consumers (`web3-market-making.service.ts`/`.controller.ts`, frontend) stay unchanged.
- Expected modify: `server/src/modules/market-making/user-orders/*`
- Expected modify tests: `server/src/modules/market-making/performance/performance.service.spec.ts`

- [ ] **Step 1: Locate current Performance query paths**

Run:

```bash
rg -n "findByOrderId|getBalance\(|orderId.*performance|Performance" server/src/modules/market-making server/src/modules/admin
```

Expected: identify exact methods that read ledger/tracked orders/balances by user-facing order id.

- [ ] **Step 2: Write failing Performance aggregation test**

In the relevant Performance test file, create a test with two ledger scopes:

```ts
it('aggregates dual-account ledger scopes by userOrderId', async () => {
  await balanceLedgerService.lockFunds({
    orderId: 'order-1:maker',
    userOrderId: 'order-1',
    accountLabel: 'maker',
    userId: 'user-1',
    assetId: 'USDT',
    amount: '10',
    idempotencyKey: 'reserve:maker',
  });
  await balanceLedgerService.lockFunds({
    orderId: 'order-1:taker',
    userOrderId: 'order-1',
    accountLabel: 'taker',
    userId: 'user-1',
    assetId: 'USDT',
    amount: '5',
    idempotencyKey: 'reserve:taker',
  });

  const findSpy = jest.spyOn(balanceLedgerService, 'findEntriesByUserOrderId');

  const performance = await service.getOrderPerformance('order-1');

  // Reads aggregate by userOrderId, not by ledger orderId.
  expect(findSpy).toHaveBeenCalledWith('order-1');
  // The summary reflects fills from BOTH maker and taker ledger scopes.
  expect(Number(performance.summary.fillCount)).toBeGreaterThan(0);
});
```

**Do NOT add `orderId`/`ledgerScopes` to `OrderPerformanceDto`.** The DTO already exposes `summary` (`realizedPnlQuote`, `netPnlQuote`, `fillCount`, ...); the only required change is that those aggregates now include both maker and taker ledger scopes because the service reads by `userOrderId`. The assertion proves aggregation via (a) the `findEntriesByUserOrderId('order-1')` call and (b) a non-empty aggregated summary. Seed `fill_settle` entries (not just `lockFunds`) under both ledger scopes if the summary assertion needs real fills. Keep the DTO shape unchanged (KISS).

- [ ] **Step 3: Run Performance test and verify failure**

Run the exact test file found in Step 1:

```bash
cd server && bunx jest src/modules/market-making/performance/performance.service.spec.ts
```

Expected: FAIL because query uses ledger `orderId` rather than `userOrderId`.

- [ ] **Step 4: Change reads to userOrderId**

In `performance.service.ts`, `getOrderPerformance(orderId)` receives the **user-facing** order id (the web3 controller/service passes the user's order id; see `server/src/modules/web3/market-making/web3-market-making.service.ts`). So the incoming `orderId` parameter IS the `userOrderId`. Keep the `marketMakingOrderRepository.findOne({ where: { orderId } })` lookup unchanged (that table is keyed by the user order's own id), but treat `orderId` as `userOrderId` for ledger aggregation. Optionally rename the parameter to `userOrderId` for clarity.

Replace user-facing ledger reads:

```ts
await balanceLedgerService.findByOrderId(orderId)
```

with (where `userOrderId` is the incoming parameter):

```ts
await balanceLedgerService.findEntriesByUserOrderId(userOrderId)
```

If the service also reads balances, replace user-facing balance reads with:

```ts
await balanceLedgerService.findBalancesByUserOrderId(userOrderId)
```

**Do not change `OrderPerformanceDto`.** The existing `summary` aggregation is computed from the entries returned by the read above; switching the read from `findByOrderId` to `findEntriesByUserOrderId` is sufficient to make a dual-account order's maker + taker fills aggregate into one summary. Do not introduce a `ledgerScopes` field or expose `order-1:maker` as a top-level id.

- [ ] **Step 5: Verify Performance tests pass**

Run:

```bash
cd server && bunx jest src/modules/market-making/performance/performance.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Performance read fix**

```bash
git add server/src/modules/market-making/performance/performance.service.ts \
  server/src/modules/market-making/performance/performance.service.spec.ts
git commit -m "fix: aggregate performance by user order id"
```

---

## Task 10: Update reconciliation reports without changing balance comparison key

**Files:**

- Modify: `server/src/modules/market-making/reconciliation/reconciliation.service.ts`
- Modify: `server/src/modules/market-making/reconciliation/reconciliation.service.spec.ts`

- [ ] **Step 1: Write failing reconciliation report test**

Add a test that creates a mismatch on `order-1:taker` and expects the report to include both IDs:

```ts
it('reports mismatches with userOrderId, ledgerOrderId, and accountLabel', async () => {
  const report = await service.reconcileOrderBalance({
    orderId: 'order-1:taker',
    userOrderId: 'order-1',
    accountLabel: 'taker',
    assetId: 'USDT',
  });

  expect(report).toMatchObject({
    userOrderId: 'order-1',
    ledgerOrderId: 'order-1:taker',
    accountLabel: 'taker',
    assetId: 'USDT',
  });
});
```

Adjust method name to the actual reconciliation API. The required behavior is report clarity, not a changed balance key.

- [ ] **Step 2: Run reconciliation test and verify failure**

Run:

```bash
cd server && bunx jest src/modules/market-making/reconciliation/reconciliation.service.spec.ts
```

Expected: FAIL because report lacks one or more attribution fields.

- [ ] **Step 3: Add report fields**

Where reconciliation rebuilds/checks balances, keep:

```ts
rebuildOrderBalance(ledgerOrderId, assetId)
```

But report shape must include:

```ts
{
  userOrderId: balance.userOrderId,
  ledgerOrderId: balance.orderId,
  accountLabel: balance.accountLabel,
  assetId: balance.assetId,
}
```

- [ ] **Step 4: Verify reconciliation tests pass**

Run:

```bash
cd server && bunx jest src/modules/market-making/reconciliation/reconciliation.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit reconciliation report fix**

```bash
git add server/src/modules/market-making/reconciliation/reconciliation.service.ts \
  server/src/modules/market-making/reconciliation/reconciliation.service.spec.ts
git commit -m "fix: report reconciliation by user and ledger order ids"
```

---

## Task 11: Update docs and guard against naked orderId usage

**Files:**

- Modify: `docs/architecture/server/business-flows.md`
- Modify: `docs/architecture/market-making-flow.md`
- Modify: `docs/plans/progress.md`
- Optional modify: `server/src/modules/market-making/strategy/efficient-dual-account-architecture-invariants.spec.ts`

- [ ] **Step 1: Document vocabulary**

Add a section to architecture docs:

```md
## Order Identity Vocabulary

- `userOrderId`: user-facing market-making order id. User-facing Performance, order details, rewards, withdrawals, and fill history aggregate by this id.
- `ledgerOrderId`: ledger balance bucket id. Ledger entries and market-making balances remain scoped by `ledgerOrderId + assetId`.
- `exchangeOrderId`: exchange-side order id used for cancel/fetch/fill matching.

The current ledger/balance database column named `orderId` stores `ledgerOrderId`. New service contracts should prefer explicit `userOrderId` and `ledgerOrderId` names.
```

- [ ] **Step 2: Add invariant test if existing architecture invariant file fits**

In `efficient-dual-account-architecture-invariants.spec.ts`, add a static or behavioral test that fails if direct `${baseOrderId}:${accountLabel}` construction reappears outside the helper:

```ts
it('centralizes dual-account ledger order id construction', () => {
  const executionSource = readFileSync(
    join(__dirname, 'execution/strategy-intent-execution.service.ts'),
    'utf8',
  );
  const settlementSource = readFileSync(
    join(__dirname, 'settlement/fill-settlement.service.ts'),
    'utf8',
  );

  // No inline `:accountLabel` template construction anywhere in the pipeline.
  expect(executionSource).not.toContain('${baseOrderId}:${takerAccountLabel}');
  expect(executionSource).toContain('buildDualAccountLedgerOrderId');
  expect(settlementSource).not.toContain('`${baseOrderId}:${accountLabel}`');
  expect(settlementSource).toContain('buildDualAccountLedgerOrderId');
});
```

Use the actual paths from the invariant spec location. The settlement check guards the two constructions removed in Task 8.

- [ ] **Step 3: Update progress doc**

Add one line to `docs/plans/progress.md`:

```md
- Planned: separate user-facing order identity (`userOrderId`) from ledger balance identity (`ledgerOrderId`) so dual-account maker/taker ledger scopes aggregate correctly in Performance and reports.
```

- [ ] **Step 4: Run docs-adjacent and invariant tests**

Run:

```bash
cd server && bunx jest src/modules/market-making/strategy/efficient-dual-account-architecture-invariants.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit docs and invariant**

```bash
git add docs/architecture/server/business-flows.md \
  docs/architecture/market-making-flow.md \
  docs/plans/progress.md \
  server/src/modules/market-making/strategy/efficient-dual-account-architecture-invariants.spec.ts
git commit -m "docs: define user and ledger order identity"
```

---

## Task 12: Run integration verification

**Files:**

- No source changes unless tests reveal a real bug.

- [ ] **Step 1: Run targeted market-making test group**

Run:

```bash
cd server && bunx jest src/modules/market-making/ledger \
  src/modules/market-making/execution \
  src/modules/market-making/trackers \
  src/modules/market-making/strategy/execution \
  src/modules/market-making/strategy/settlement \
  src/modules/market-making/performance \
  src/modules/market-making/reconciliation
```

Expected: PASS.

- [ ] **Step 2: Run relevant system tests**

Run:

```bash
cd server && bun run test:system -- --testPathPattern='market-making/(intent-engine|execution|reconciliation)'
```

System tests use a separate config (`test/config/jest.system.config.js`), so they must be run through `bun run test:system`, not the default jest config.

Expected: PASS.

- [ ] **Step 3: Full backend unit suite**

Run the project's backend unit suite (default jest config):

```bash
cd server && bun run test
```

Expected: PASS, or report unrelated pre-existing failures with exact output.

- [ ] **Step 4: Final commit if fixes were needed**

If Step 1-3 required code fixes:

```bash
git add <changed-files>
git commit -m "fix: complete ledger order attribution integration"
```

---

## Final Acceptance Criteria

- Ledger and balance storage still use the existing balance key: current `orderId` column, semantically `ledgerOrderId`, plus `assetId`.
- Dual-account maker/taker balances remain isolated:
  - `order-1:maker + assetId`
  - `order-1:taker + assetId`
- Both scopes share `userOrderId = order-1`.
- Performance and order detail reads aggregate by `userOrderId`, not ledger `orderId`.
- Fill routing returns `ledgerOrderId`, `userOrderId`, and `accountLabel`.
- Reconciliation still compares ledger scopes, but reports include all three: `userOrderId`, `ledgerOrderId`, `accountLabel`.
- New code does not introduce scattered `baseOrderId:accountLabel` or arbitrary `split(':')` logic.

---

## Self-Review

Spec coverage:

- Keeps ledger `orderId + assetId` balance invariant: covered by Tasks 3, 4, 10.
- Separates dual-account maker/taker suffix from user-facing reads: covered by Tasks 1, 5, 6, 8, 9.
- Attributes settled fills by ledger/user order id: covered by Task 8.
- Fixes Performance aggregation: covered by Task 9.
- Reduces naming confusion between user order, ledger order, and exchange order: covered by vocabulary, helper, docs, Tasks 1 and 11.
- Avoids scattered string parsing: covered by Task 1, the Task 8 settlement refactor, and the Task 11 invariant.

Verification fidelity:

- Migration backfill is verified by a dedicated migration spec (Task 2), because the unit suite uses mock repos and never runs migrations.
- Mock repositories are updated to actually filter by `userOrderId` (Task 3, Step 1) before any aggregation assertions, so `findEntriesByUserOrderId`/`findBalancesByUserOrderId` tests can't pass by returning everything.
- All test commands use the project's Jest runner (`bunx jest` / `bun run test` / `bun run test:system`), not Bun's native `bun test`.

Placeholder scan:

- No implementation task says “TBD” or “implement later”.
- Performance/order-detail exact files require discovery because current query ownership should be verified before editing. The plan includes the exact command and expected target area.

Type consistency:

- `userOrderId`, `ledgerOrderId`, `accountLabel`, `exchangeOrderId`, and `clientOrderId` are used consistently.
- Existing DB `orderId` column remains the storage for `ledgerOrderId` as a documented naming convention (see Architectural Decision). A physical column rename is explicitly out of scope; no compatibility shims are introduced in code (see Task 5).

# Market Making Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement multi-tenant market making execution so one Mr.Market instance can run and control multiple users' market-making orders (track, pause/resume, withdraw, campaign handling) safely.

**Architecture:** Use a DB-persisted order lifecycle state machine and treat Bull jobs as idempotent transition attempts. Add per-order execution leasing to prevent overlapping loops, align API/state contracts between server and interface, and make campaign integration deterministic (HuFi best-effort + local tracking required).

**Tech Stack:** NestJS, Bull, TypeORM (SQLite), Jest, SvelteKit, bignumber.js.

---

## Scope Anchors (Current Reality)

- Queue lifecycle exists in `server/src/modules/market-making/user-orders/market-making.processor.ts` with jobs: `process_market_making_snapshots`, `check_payment_complete`, `withdraw_to_exchange`, `join_campaign`, `start_mm`, `execute_mm_cycle`.
- `withdraw_to_exchange` is currently disabled and refunds/fails instead of withdrawing.
- Interface and server contract mismatches exist:
  - Interface calls non-existing/legacy endpoints in `interface/src/lib/helpers/mrm/strategy.ts`.
  - UI checks non-canonical states in `interface/src/routes/(secondary)/(market_making)/market-making/orders/[id]/+page.svelte`.
- Canonical server lifecycle states live in `server/src/common/types/orders/states.ts`.

---

### Task 1: Lock Canonical Lifecycle Contract

**Files:**
- Modify: `server/src/common/types/orders/states.ts`
- Modify: `interface/src/lib/types/hufi/market_making.ts`
- Test: `server/src/modules/market-making/strategy/strategy.controller.spec.ts`

**Step 1: Write failing test for endpoint/state contract drift**

```ts
it('exposes market making stop endpoint compatible with client usage', async () => {
  // assert route compatibility and response status
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && bun run test -- strategy.controller.spec.ts`
Expected: FAIL due to route mismatch.

**Step 3: Define canonical lifecycle union used by server and interface**

```ts
export type MarketMakingLifecycleState =
  | 'payment_pending'
  | 'payment_incomplete'
  | 'payment_complete'
  | 'withdrawing'
  | 'withdrawal_confirmed'
  | 'deposit_confirming'
  | 'deposit_confirmed'
  | 'joining_campaign'
  | 'campaign_joined'
  | 'created'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'failed'
  | 'refunded'
  | 'deleted';
```

**Step 4: Run tests and type checks**

Run: `cd server && bun run test -- strategy.controller.spec.ts && cd ../interface && bun run check`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/common/types/orders/states.ts interface/src/lib/types/hufi/market_making.ts server/src/modules/market-making/strategy/strategy.controller.spec.ts
git commit -m "fix: align market making lifecycle contract across server and interface"
```

---

### Task 2: Align Interface API Calls to Existing Server Endpoints

**Files:**
- Modify: `interface/src/lib/helpers/mrm/strategy.ts`
- Modify: `interface/src/routes/(secondary)/(market_making)/market-making/orders/[id]/+page.svelte`
- Test: `interface/src/lib/helpers/mrm/strategy.test.ts` (create if missing)

**Step 1: Write failing helper test for endpoint URLs**

```ts
it('uses /user-orders/payment-state/market-making/:orderId endpoint', () => {
  // assert built URL matches server controller route
});
```

**Step 2: Run unit test to verify it fails**

Run: `cd interface && bun run test:unit -- strategy.test.ts`
Expected: FAIL due to stale `/strategy/...` paths.

**Step 3: Implement minimal URL alignment**

```ts
// example mapping
`${MRM_BACKEND_URL}/user-orders/payment-state/market-making/${orderId}`;
`${MRM_BACKEND_URL}/user-orders/market-making/all?userId=${userId}`;
`${MRM_BACKEND_URL}/strategy/stop-marketmaking?userId=${userId}&clientId=${clientId}`;
```

**Step 4: Run unit tests and type check**

Run: `cd interface && bun run test:unit && bun run check`
Expected: PASS.

**Step 5: Commit**

```bash
git add interface/src/lib/helpers/mrm/strategy.ts interface/src/routes/(secondary)/(market_making)/market-making/orders/[id]/+page.svelte interface/src/lib/helpers/mrm/strategy.test.ts
git commit -m "fix: align market making client API paths with server routes"
```

---

### Task 3: Add Lifecycle Event Audit Trail

**Files:**
- Create: `server/src/common/entities/market-making-order-lifecycle-event.entity.ts`
- Create: `server/src/database/migrations/YYYYMMDDHHMMSS-AddMarketMakingLifecycleEvents.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/src/modules/market-making/user-orders/market-making.processor.ts`
- Test: `server/src/modules/market-making/user-orders/market-making.processor.spec.ts` (create)

**Step 1: Write failing processor test for transition event recording**

```ts
it('records lifecycle event on transition to running', async () => {
  // arrange start_mm, assert event row inserted
});
```

**Step 2: Run test to verify fail**

Run: `cd server && bun run test -- market-making.processor.spec.ts`
Expected: FAIL (entity/table missing).

**Step 3: Implement entity and minimal processor write**

```ts
@Entity('market_making_order_lifecycle_event')
export class MarketMakingOrderLifecycleEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() orderId: string;
  @Column() fromState: string;
  @Column() toState: string;
  @Column() jobName: string;
  @Column() createdAt: string;
}
```

**Step 4: Run tests and migration dry run**

Run: `cd server && bun run test -- market-making.processor.spec.ts && bun run migration:show`
Expected: PASS test, migration listed.

**Step 5: Commit**

```bash
git add server/src/common/entities/market-making-order-lifecycle-event.entity.ts server/src/database/migrations/* server/src/app.module.ts server/src/modules/market-making/user-orders/market-making.processor.ts server/src/modules/market-making/user-orders/market-making.processor.spec.ts
git commit -m "feat: add market making lifecycle event audit log"
```

---

### Task 4: Prevent Overlapping `execute_mm_cycle` Runs

**Files:**
- Modify: `server/src/common/entities/user-orders.entity.ts`
- Create: `server/src/database/migrations/YYYYMMDDHHMMSS-AddMMExecutionLeaseFields.ts`
- Modify: `server/src/modules/market-making/user-orders/market-making.processor.ts`
- Test: `server/src/modules/market-making/user-orders/market-making.processor.spec.ts`

**Step 1: Write failing test for duplicate cycle execution**

```ts
it('executes at most one cycle per order when duplicate jobs arrive', async () => {
  // enqueue two execute_mm_cycle jobs for same order
  // expect strategyService.executeMMCycle called once
});
```

**Step 2: Run test to verify fail**

Run: `cd server && bun run test -- market-making.processor.spec.ts`
Expected: FAIL (both jobs execute today).

**Step 3: Add per-order lease and guarded acquire/release**

```ts
// MarketMakingOrder
@Column({ nullable: true }) cycleLeaseUntil?: string;
@Column({ nullable: true }) cycleLeaseToken?: string;
```

**Step 4: Re-run tests**

Run: `cd server && bun run test -- market-making.processor.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/common/entities/user-orders.entity.ts server/src/database/migrations/* server/src/modules/market-making/user-orders/market-making.processor.ts server/src/modules/market-making/user-orders/market-making.processor.spec.ts
git commit -m "feat: add per-order execution lease for mm cycle deduplication"
```

---

### Task 5: Add Explicit Pause/Resume/Stop Order Controls

**Files:**
- Modify: `server/src/modules/market-making/user-orders/user-orders.controller.ts`
- Modify: `server/src/modules/market-making/user-orders/user-orders.service.ts`
- Modify: `server/src/modules/market-making/user-orders/market-making.processor.ts`
- Test: `server/src/modules/market-making/user-orders/user-orders.service.spec.ts`

**Step 1: Write failing tests for control commands**

```ts
it('pauses running order and enqueues stop job', async () => {});
it('resumes paused order and enqueues start job', async () => {});
it('stops active order and sets stopped state', async () => {});
```

**Step 2: Run tests to verify fail**

Run: `cd server && bun run test -- user-orders.service.spec.ts`
Expected: FAIL (API commands missing).

**Step 3: Implement control endpoints with queue-backed commands**

```ts
@Post('/market-making/:orderId/pause')
@Post('/market-making/:orderId/resume')
@Post('/market-making/:orderId/stop')
```

**Step 4: Re-run tests**

Run: `cd server && bun run test -- user-orders.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/modules/market-making/user-orders/user-orders.controller.ts server/src/modules/market-making/user-orders/user-orders.service.ts server/src/modules/market-making/user-orders/market-making.processor.ts server/src/modules/market-making/user-orders/user-orders.service.spec.ts
git commit -m "feat: add market making pause resume and stop order controls"
```

---

### Task 6: Make Campaign Joining Idempotent Per Order

**Files:**
- Modify: `server/src/modules/market-making/local-campaign/local-campaign.service.ts`
- Modify: `server/src/common/entities/campaign-participation.entity.ts`
- Create: `server/src/database/migrations/YYYYMMDDHHMMSS-AddCampaignParticipationUniqueConstraint.ts`
- Modify: `server/src/modules/market-making/user-orders/market-making.processor.ts`
- Test: `server/src/modules/market-making/user-orders/market-making.processor.spec.ts`

**Step 1: Write failing test for duplicate `join_campaign` retries**

```ts
it('creates one local campaign participation per order despite retries', async () => {
  // run handler twice and assert single participation
});
```

**Step 2: Run test to verify fail**

Run: `cd server && bun run test -- market-making.processor.spec.ts`
Expected: FAIL (duplicate rows possible today).

**Step 3: Implement find-or-create + unique constraint**

```ts
// unique key suggestion
UNIQUE(campaignId, userId, orderId)
```

**Step 4: Re-run tests**

Run: `cd server && bun run test -- market-making.processor.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/modules/market-making/local-campaign/local-campaign.service.ts server/src/common/entities/campaign-participation.entity.ts server/src/database/migrations/* server/src/modules/market-making/user-orders/market-making.processor.ts
git commit -m "fix: make campaign join idempotent per order"
```

---

### Task 7: Re-enable `withdraw_to_exchange` Behind a Feature Flag

**Files:**
- Modify: `server/src/modules/market-making/user-orders/market-making.processor.ts`
- Modify: `server/src/config/configuration.ts`
- Test: `server/src/modules/market-making/user-orders/market-making.processor.spec.ts`
- Doc: `docs/MARKET_MAKING_FLOW.md`

**Step 1: Write failing test for withdrawal queueing when enabled**

```ts
it('queues withdraw_to_exchange when MM_WITHDRAW_TO_EXCHANGE_ENABLED is true', async () => {
  // from payment_complete handler
});
```

**Step 2: Run test to verify fail**

Run: `cd server && bun run test -- market-making.processor.spec.ts`
Expected: FAIL (queueing commented out today).

**Step 3: Implement guarded queueing and tx-id persistence hooks**

```ts
if (this.configService.get('strategy.mm_withdraw_to_exchange_enabled') === 'true') {
  await (job.queue as any).add('withdraw_to_exchange', { orderId, marketMakingPairId }, { jobId: `withdraw_${orderId}` });
}
```

**Step 4: Re-run tests and smoke test payment path**

Run: `cd server && bun run test -- market-making.processor.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/modules/market-making/user-orders/market-making.processor.ts server/src/config/configuration.ts server/src/modules/market-making/user-orders/market-making.processor.spec.ts docs/MARKET_MAKING_FLOW.md
git commit -m "feat: gate withdraw-to-exchange in market making lifecycle"
```

---

### Task 8: Add End-to-End Lifecycle Verification Tests

**Files:**
- Create: `server/src/modules/market-making/user-orders/market-making.lifecycle.spec.ts`
- Modify: `server/src/modules/market-making/user-orders/user-orders.service.spec.ts`
- Modify: `interface/src/routes/(secondary)/(market_making)/market-making/orders/[id]/+page.svelte` (if UI-state assertions needed)

**Step 1: Write failing lifecycle integration tests**

```ts
it('transitions payment_complete -> campaign_joined -> running', async () => {});
it('pause then resume does not spawn duplicate cycle jobs', async () => {});
it('retrying join_campaign remains idempotent', async () => {});
```

**Step 2: Run tests to verify fail**

Run: `cd server && bun run test -- market-making.lifecycle.spec.ts`
Expected: FAIL before full implementation.

**Step 3: Implement minimal fixes required by tests**

```ts
// tighten guarded transitions and queue jobIds where missing
```

**Step 4: Run full checks**

Run: `cd server && bun run test && bun run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/modules/market-making/user-orders/market-making.lifecycle.spec.ts server/src/modules/market-making/user-orders/* interface/src/routes/(secondary)/(market_making)/market-making/orders/[id]/+page.svelte
git commit -m "test: add lifecycle coverage for multi-tenant market making execution"
```

---

## Acceptance Criteria

- A single order cannot run overlapping `execute_mm_cycle` jobs.
- Pause/resume/stop controls exist at order level and are queue-driven.
- Interface helper endpoints map to server routes with no stale `/strategy/market_making/...` usage.
- `join_campaign` retries are idempotent and do not duplicate local participation.
- `withdraw_to_exchange` is feature-flagged and test-covered.
- Lifecycle transitions are observable via persisted event records.

## Risk Notes

- If one exchange account is shared for many users, `StrategyService` cancel behavior (`fetchOpenOrders(pair)` then cancel all) can interfere across orders. Keep this as a hard invariant in implementation review: either enforce one active order per `(exchange, pair, account)` scope or change strategy order ownership filtering.
- Refunds after actual exchange withdrawal are not safe; once withdrawals are enabled, failure handling should move to reconciliation flow, not unconditional refund.

## Verification Commands

- `cd server && bun run test`
- `cd server && bun run lint`
- `cd interface && bun run check`

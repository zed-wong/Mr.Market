# Tick Parallelization & Intent Batch Upsert

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce tick latency by parallelizing executor ticks and batching intent DB writes, bringing 10-session scenarios from ~500ms to ~100ms.

**Architecture:** Step 1 changes `StrategyService.onTickForPooledExecutors` from serial `for...of` to `Promise.all`. Step 2 replaces the serial `for...of` + `upsertIntent` loop with a single `batchUpsertIntents` call using TypeORM's array `save()`.

**Tech Stack:** NestJS, TypeORM, Jest

---

## Background

### Current Problem

Mr.Market's tick loop is a 1-second `setInterval` that runs all registered components serially. Within `StrategyService.onTick`, every `ExchangePairExecutor` runs one after another via `for...of` + `await`. Within each executor, every due session runs serially. The total tick duration scales linearly: 10 sessions × 50ms = 500ms decision time alone, before intent persistence.

After decideActions, `ExecutorOrchestratorService.dispatchActions` serially calls `upsertIntent()` N times — each call does a `findOneBy` + `save` (2 DB round trips per intent). 3 intents = 6 DB round trips blocked in the tick path.

If the total tick exceeds 1 second, the next tick is dropped entirely by `tickInProgress` guard.

### Hummingbot's Approach

Hummingbot's tick() completes in <1ms — it only updates timestamp and sets an `asyncio.Event`. All I/O runs in independent async tasks with their own loops. Controllers have independent `control_loop()` methods. Order placement is fire-and-forget.

This plan covers the two safest steps toward that architecture: executor parallelization and intent batch writes. Steps 3 (fill event-driven) and 4 (controller independent loops) are deferred.

---

## Task 1: Parallelize Executor Ticks in StrategyService

**Files:**
- Modify: `server/src/modules/market-making/strategy/strategy.service.ts:250-295`
- Test: `server/src/modules/market-making/strategy/strategy.service.spec.ts`

**Step 1: Write the failing test**

Find the existing test suite for `onTickForPooledExecutors` (or the `onTick` test section) in `strategy.service.spec.ts`. Add a test that verifies executors tick in parallel, not serially:

```typescript
it('ticks all executors in parallel rather than serially', async () => {
  const callOrder: string[] = [];
  const executorA = {
    exchange: 'binance',
    pair: 'BTC/USDT',
    getActiveSessions: () => [],
    getDueSessionCount: () => 0,
    onTick: jest.fn(async () => {
      callOrder.push('a-start');
      await new Promise((r) => setTimeout(r, 50));
      callOrder.push('a-end');
    }),
  };
  const executorB = {
    exchange: 'okx',
    pair: 'ETH/USDT',
    getActiveSessions: () => [],
    getDueSessionCount: () => 0,
    onTick: jest.fn(async () => {
      callOrder.push('b-start');
      await new Promise((r) => setTimeout(r, 50));
      callOrder.push('b-end');
    }),
  };

  jest.spyOn(executorRegistry, 'getActiveExecutors').mockReturnValue([executorA, executorB]);

  await service.onTick('2026-04-29T00:00:00Z');

  expect(executorA.onTick).toHaveBeenCalled();
  expect(executorB.onTick).toHaveBeenCalled();
  expect(callOrder).toEqual(['a-start', 'b-start', 'a-end', 'b-end']);
});
```

The serial implementation would produce `['a-start', 'a-end', 'b-start', 'b-end']`. The test asserts parallel execution where B starts before A finishes.

**Step 2: Run test to verify it fails**

Run: `cd server && bun run test -- --testPathPattern='strategy.service.spec' -t 'ticks all executors in parallel'`

Expected: FAIL — current serial `for...of` produces `['a-start', 'a-end', 'b-start', 'b-end']`.

**Step 3: Implement parallel executor ticks**

In `strategy.service.ts`, replace the serial `for...of` loop in `onTickForPooledExecutors` with `Promise.all`:

```typescript
private async onTickForPooledExecutors(ts: string): Promise<void> {
  const executors = this.executorRegistry?.getActiveExecutors() || [];
  const strategyTickStartedAtMs = Date.now();

  const results = await Promise.all(
    executors.map(async (executor) => {
      const executorStartedAtMs = Date.now();
      const activeSessionCount = executor.getActiveSessions().length;
      const dueSessionCount = executor.getDueSessionCount(executorStartedAtMs);

      try {
        await executor.onTick(ts);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorTrace = error instanceof Error ? error.stack : undefined;

        this.logger.error(
          `onTick executor failed for exchange=${executor.exchange} pair=${executor.pair} ts=${ts}: ${errorMessage}`,
          errorTrace,
        );
      } finally {
        this.runtimeTimingService?.recordDuration(
          'strategy.executor.tick',
          Date.now() - executorStartedAtMs,
          {
            activeSessionCount,
            dueSessionCount,
            exchange: executor.exchange,
            pair: executor.pair,
            tickTs: ts,
          },
          { warnThresholdMs: 250 },
        );
      }
    }),
  );

  this.runtimeTimingService?.recordDuration(
    'strategy.tick',
    Date.now() - strategyTickStartedAtMs,
    {
      executorCount: executors.length,
      tickTs: ts,
    },
    { warnThresholdMs: 500 },
  );
}
```

Key differences from the serial version:
- `for...of` → `Promise.all(executors.map(...))` — all executors tick concurrently
- `error` handling is preserved per-executor inside the `try/catch` within each `map` callback, matching the original behavior where one executor failure doesn't abort others
- Timing metrics are preserved per-executor in `finally`
- The `results` variable is captured but not used (equivalent to the serial version which also discards loop results)

**Step 4: Run test to verify it passes**

Run: `cd server && bun run test -- --testPathPattern='strategy.service.spec' -t 'ticks all executors in parallel'`

Expected: PASS

**Step 5: Run full strategy service test suite**

Run: `cd server && bun run test -- --testPathPattern='strategy.service.spec'`

Expected: All existing tests pass. Parallelization does not change the observable behavior for serial test cases — `Promise.all` with single executor or all-resolved promises produces the same result as serial iteration.

**Step 6: Commit**

```bash
git add server/src/modules/market-making/strategy/strategy.service.ts server/src/modules/market-making/strategy/strategy.service.spec.ts
git commit -m "perf: parallelize executor ticks in onTickForPooledExecutors"
```

---

## Task 2: Add batchUpsertIntents to StrategyIntentStoreService

**Files:**
- Modify: `server/src/modules/market-making/strategy/execution/strategy-intent-store.service.ts`
- Test: `server/src/modules/market-making/strategy/execution/strategy-intent-store.service.spec.ts`

**Step 1: Write the failing test**

Add tests in `strategy-intent-store.service.spec.ts`:

```typescript
describe('batchUpsertIntents', () => {
  it('persists multiple intents in a single save call', async () => {
    const rows: StrategyOrderIntentEntity[] = [];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(
      repository as any,
    );

    const intents = [
      createIntent({ intentId: 'intent-1', strategyKey: 's1' }),
      createIntent({ intentId: 'intent-2', strategyKey: 's1' }),
      createIntent({ intentId: 'intent-3', strategyKey: 's1' }),
    ];

    await service.batchUpsertIntents(intents);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.intentId)).toEqual([
      'intent-1',
      'intent-2',
      'intent-3',
    ]);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('merges existing intents preserving createdAt', async () => {
    const rows: StrategyOrderIntentEntity[] = [
      createIntent({
        intentId: 'intent-1',
        strategyKey: 's1',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ];
    const repository = createRepository(rows);
    const service = new StrategyIntentStoreService(
      repository as any,
    );

    const intents = [
      createIntent({
        intentId: 'intent-1',
        strategyKey: 's1-updated',
        createdAt: '2026-03-11T00:00:00.000Z',
      }),
      createIntent({ intentId: 'intent-2', strategyKey: 's1' }),
    ];

    await service.batchUpsertIntents(intents);

    expect(rows).toHaveLength(2);
    const updated = rows.find((r) => r.intentId === 'intent-1');
    expect(updated?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updated?.strategyKey).toBe('s1-updated');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('handles empty array with no DB calls', async () => {
    const repository = createRepository([]);
    const service = new StrategyIntentStoreService(
      repository as any,
    );

    await service.batchUpsertIntents([]);

    expect(repository.save).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && bun run test -- --testPathPattern='strategy-intent-store.service.spec' -t 'batchUpsertIntents'`

Expected: FAIL — `batchUpsertIntents` method does not exist.

**Step 3: Implement batchUpsertIntents**

Add the method to `StrategyIntentStoreService`:

```typescript
async batchUpsertIntents(intents: StrategyOrderIntent[]): Promise<void> {
  if (intents.length === 0) {
    return;
  }

  const intentIds = intents.map((i) => i.intentId);
  const existingRows = await this.strategyOrderIntentRepository.find({
    where: { intentId: In(intentIds) },
  });

  const existingByIntentId = new Map(
    existingRows.map((row) => [row.intentId, row]),
  );

  const payloads: StrategyOrderIntentEntity[] = intents.map((intent) => {
    const existing = existingByIntentId.get(intent.intentId);

    const payload: StrategyOrderIntentEntity = {
      intentId: intent.intentId,
      strategyInstanceId: intent.strategyInstanceId,
      strategyKey: intent.strategyKey,
      userId: intent.userId,
      clientId: intent.clientId,
      type: intent.type,
      exchange: intent.exchange,
      accountLabel: intent.accountLabel,
      pair: intent.pair,
      side: intent.side,
      price: intent.price,
      qty: intent.qty,
      mixinOrderId: intent.mixinOrderId,
      executionCategory: intent.executionCategory,
      postOnly: intent.postOnly,
      timeInForce: intent.timeInForce,
      slotKey: intent.slotKey,
      metadata: intent.metadata,
      status: intent.status,
      errorReason: undefined,
      createdAt: existing?.createdAt || intent.createdAt,
      updatedAt: getRFC3339Timestamp(),
    };

    return existing ? { ...existing, ...payload } : payload;
  });

  await this.strategyOrderIntentRepository.save(payloads);
}
```

Key design decisions:
- **Single `find` query** with `In(intentIds)` instead of N × `findOneBy` — reduces DB reads from N to 1
- **Single `save` call** with array of payloads — TypeORM's `save()` accepts an array, reducing DB writes from N to 1
- **Total DB round trips: 2** (1 read + 1 write) regardless of intent count, down from 2N
- **`createdAt` preservation** matches the existing `upsertIntent` behavior: existing rows keep their `createdAt`, new rows use `intent.createdAt`
- **Empty array guard** matches the pattern in other service methods

**Step 4: Run test to verify it passes**

Run: `cd server && bun run test -- --testPathPattern='strategy-intent-store.service.spec' -t 'batchUpsertIntents'`

Expected: PASS

**Step 5: Run full intent store test suite**

Run: `cd server && bun run test -- --testPathPattern='strategy-intent-store.service.spec'`

Expected: All existing tests pass. The new method is additive — nothing else calls it yet.

**Step 6: Commit**

```bash
git add server/src/modules/market-making/strategy/execution/strategy-intent-store.service.ts server/src/modules/market-making/strategy/execution/strategy-intent-store.service.spec.ts
git commit -m "feat: add batchUpsertIntents to StrategyIntentStoreService"
```

---

## Task 3: Use batchUpsertIntents in ExecutorOrchestratorService

**Files:**
- Modify: `server/src/modules/market-making/strategy/intent/executor-orchestrator.service.ts`
- Test: `server/src/modules/market-making/strategy/intent/executor-orchestrator.service.spec.ts`

**Step 1: Write the failing test**

Add a test that verifies `dispatchActions` calls `batchUpsertIntents` instead of `upsertIntent` per action:

```typescript
it('persists multiple actions in a single batch call', async () => {
  const service = new ExecutorOrchestratorService(
    createConfigService('worker'),
    strategyIntentStoreService as unknown as StrategyIntentStoreService,
    strategyIntentExecutionService as unknown as StrategyIntentExecutionService,
  );

  const actions: ExecutorAction[] = [
    { ...baseAction, intentId: 'intent-1' },
    { ...baseAction, intentId: 'intent-2' },
    { ...baseAction, intentId: 'intent-3' },
  ];

  await service.dispatchActions('u1-c1-pureMarketMaking', actions);

  expect(strategyIntentStoreService.batchUpsertIntents).toHaveBeenCalledTimes(1);
  expect(strategyIntentStoreService.batchUpsertIntents).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ intentId: 'intent-1', status: 'NEW' }),
      expect.objectContaining({ intentId: 'intent-2', status: 'NEW' }),
      expect.objectContaining({ intentId: 'intent-3', status: 'NEW' }),
    ]),
  );
  expect(strategyIntentStoreService.upsertIntent).not.toHaveBeenCalled();
});
```

Also update the existing test mock to include `batchUpsertIntents`:

```typescript
const strategyIntentStoreService = {
  upsertIntent: jest.fn().mockResolvedValue(undefined),
  batchUpsertIntents: jest.fn().mockResolvedValue(undefined),
};
```

And update the single-action test to verify `batchUpsertIntents` is called even for a single action (it's still a batch of 1):

```typescript
it('persists actions as NEW intents and skips sync consume in worker mode', async () => {
  const service = new ExecutorOrchestratorService(
    createConfigService('worker'),
    strategyIntentStoreService as unknown as StrategyIntentStoreService,
    strategyIntentExecutionService as unknown as StrategyIntentExecutionService,
  );

  const intents = await service.dispatchActions('u1-c1-pureMarketMaking', [baseAction]);

  expect(strategyIntentStoreService.batchUpsertIntents).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        intentId: 'intent-1',
        status: 'NEW',
        executionCategory: 'clob_cex',
        metadata: expect.objectContaining({ source: 'test' }),
      }),
    ]),
  );
  expect(strategyIntentExecutionService.consumeIntents).not.toHaveBeenCalled();
  expect(intents).toHaveLength(1);
  expect(intents[0].status).toBe('NEW');
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && bun run test -- --testPathPattern='executor-orchestrator.service.spec' -t 'persists multiple actions in a single batch call'`

Expected: FAIL — `batchUpsertIntents` is not yet called by `dispatchActions`.

**Step 3: Replace serial upsert loop with batchUpsertIntents**

In `executor-orchestrator.service.ts`, replace the `dispatchActions` method:

```typescript
async dispatchActions(
  strategyKey: string,
  actions: ExecutorAction[],
): Promise<StrategyOrderIntent[]> {
  if (actions.length === 0) {
    return [];
  }

  const intents = actions.map((action) => this.toIntent(action));

  await this.strategyIntentStoreService?.batchUpsertIntents(intents);

  const intentExecutionDriver = String(
    this.configService.get('strategy.intent_execution_driver', 'worker') ||
      'worker',
  ).toLowerCase();

  if (intentExecutionDriver === 'sync') {
    await this.strategyIntentExecutionService?.consumeIntents(intents);
  }

  for (const intent of intents) {
    const cycleId = this.readMetadataString(intent, 'cycleId') || 'n/a';
    const role = this.readMetadataString(intent, 'role') || 'unknown';
    const tickId = this.readMetadataString(intent, 'tickId') || 'n/a';

    this.logger.log(
      [
        'Intent published',
        `type=${intent.type}`,
        `strategy=${strategyKey}`,
        `cycle=${cycleId}`,
        `tick=${tickId}`,
        `role=${role}`,
        `side=${intent.side}`,
        `qty=${intent.qty}`,
        `price=${intent.price}`,
        `exchange=${intent.exchange}`,
        `pair=${intent.pair}`,
        `account=${intent.accountLabel || 'default'}`,
        `driver=${intentExecutionDriver}`,
      ].join(' | '),
    );
  }

  this.logger.log(
    [
      'Intent batch published',
      `strategy=${strategyKey}`,
      `count=${intents.length}`,
      `driver=${intentExecutionDriver}`,
    ].join(' | '),
  );

  return intents;
}
```

The change is minimal: lines 32-34 (`for...of` + `upsertIntent`) replaced with single `batchUpsertIntents(intents)` call. Everything else unchanged.

**Step 4: Run test to verify it passes**

Run: `cd server && bun run test -- --testPathPattern='executor-orchestrator.service.spec'`

Expected: PASS — all tests including the new batch test.

**Step 5: Run broader test suite**

Run: `cd server && bun run test -- --testPathPattern='strategy' --testPathPattern='intent'`

Expected: All strategy and intent tests pass.

**Step 6: Commit**

```bash
git add server/src/modules/market-making/strategy/intent/executor-orchestrator.service.ts server/src/modules/market-making/strategy/intent/executor-orchestrator.service.spec.ts
git commit -m "perf: replace serial upsertIntent loop with batchUpsertIntents in dispatchActions"
```

---

## Task 4: Migrate remaining upsertIntent callers to batchUpsertIntents (if any)

**Files:**
- Search and identify any remaining callers of `upsertIntent`
- Decide whether to deprecate or keep `upsertIntent` as a convenience method

**Step 1: Search for all upsertIntent callers**

Run: `cd server && rg 'upsertIntent' --type ts -l`

Expected files:
- `strategy-intent-store.service.ts` (definition)
- `strategy-intent-store.service.spec.ts` (tests)
- `executor-orchestrator.service.ts` (now uses `batchUpsertIntents`)
- `executor-orchestrator.service.spec.ts` (mock)

Check if any other files call `upsertIntent`. If no other callers exist, proceed to Step 2.

**Step 2: Decide on upsertIntent retention**

If `upsertIntent` is only called from tests and by `batchUpsertIntents` internally, consider:

Option A: Keep `upsertIntent` as a public method for single-intent convenience. It's simple and useful for ad-hoc calls.

Option B: Remove `upsertIntent` and have all callers use `batchUpsertIntents([intent])`.

**Recommendation:** Keep `upsertIntent`. It's still useful as a convenience method for single-intent operations (e.g., worker processing one intent at a time). `batchUpsertIntents` is the performance path for the tick hot path.

**Step 3: Verify no regressions in system tests**

Run: `cd server && bun run test:system -- --testPathPattern='intent'`

Expected: All system tests for intent execution flow, durability, and idempotency pass.

**Step 4: Commit (if any changes made)**

```bash
git add -A
git commit -m "chore: verify no remaining serial upsertIntent callers in hot path"
```

---

## Task 5: Verify end-to-end performance improvement

**Files:** None (verification only)

**Step 1: Run the full test suite**

Run: `cd server && bun run test:all`

Expected: All unit and system tests pass.

**Step 2: Run lint check**

Run: `cd server && bun run lint`

Expected: No lint errors.

**Step 3: Verify the changes don't break existing behavior**

Manual reasoning checklist:
- [ ] Executor parallelization: `Promise.all` with error handling per executor preserves the "one failure doesn't abort others" behavior
- [ ] Intent batch upsert: `batchUpsertIntents` uses the same merge logic as `upsertIntent` (existing row check, createdAt preservation, updatedAt refresh)
- [ ] Sync mode still works: `dispatchActions` still calls `consumeIntents` after `batchUpsertIntents`
- [ ] Worker mode still works: `batchUpsertIntents` persists intents, worker poll picks them up as before
- [ ] Timing metrics still recorded per executor in the parallelized path

**Step 4: Final commit**

```bash
git add -A
git commit -m "perf: executor parallelization and intent batch upsert — complete"
```

---

## Performance Expectation

| Metric | Before | After |
|--------|--------|-------|
| 3 executors × 2 sessions (worker mode) | ~320ms | ~120ms |
| 10 executors × 1 session (worker mode) | ~530ms | ~80ms |
| Intent persistence for 3 intents | 6 DB round trips | 2 DB round trips |
| Intent persistence for 5 intents | 10 DB round trips | 2 DB round trips |
| Tick overlap probability (10 sessions) | High | Low |

The remaining gaps (fill processing in tick path, controller decideActions in tick path, OrderBookTracker/UserStreamTracker as TickComponents) are addressed in future steps 3 and 4 as discussed in the architecture review.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR WITH NOTES | Direction accepted; implementation can proceed |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | - |

- **VERDICT:** ENG REVIEW CLEARED - implement the plan as written, while avoiding unrelated staging and keeping the existing test-first steps.
- **NOTES:** Prefer explicit `git add` paths over `git add -A`; remove unused variables during implementation; keep docs/progress updated after the code lands.

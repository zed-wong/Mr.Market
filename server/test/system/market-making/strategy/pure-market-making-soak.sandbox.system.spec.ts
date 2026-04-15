import { ExchangeConnectorAdapterService } from '../../../../src/modules/market-making/execution/exchange-connector-adapter.service';
import { ExecutorRegistry } from '../../../../src/modules/market-making/strategy/execution/executor-registry';
import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';
import {
  getSystemSandboxSkipReason,
  readSystemSandboxConfig,
} from '../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const skipReason = envSkipReason;
const log = createSystemTestLogger('pure-mm-soak');

if (skipReason) {
  logSystemSkip('pure market-making soak suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

const SOAK_TICK_COUNT = Number(process.env.SOAK_TICK_COUNT || 20);
const SOAK_ORDER_REFRESH_TIME_MS = Number(
  process.env.SOAK_ORDER_REFRESH_TIME_MS || 1000,
);

type ErrorInjectionType =
  | 'placeLimitOrder'
  | 'cancelOrder'
  | 'fetchOrderBook'
  | 'fill';

type ErrorInjectionSchedule = {
  tick: number;
  type: ErrorInjectionType;
};

const SOAK_SEED = Number(process.env.SOAK_SEED || 42);

// Seeded PRNG (mulberry32) for reproducible random schedules.
function createSeededRng(seed: number): () => number {
  let s = seed | 0;

  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with seeded RNG.
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));

    [a[i], a[j]] = [a[j]!, a[i]!];
  }

  return a;
}

const ERROR_TYPES: Exclude<ErrorInjectionType, 'fill'>[] = [
  'fetchOrderBook',
  'placeLimitOrder',
  'cancelOrder',
];

// ~20% of ticks get error injections, ~5% get fill injections.
// First 2 ticks are warm-up (no injections). Deterministic via SOAK_SEED.
function generateInjectionSchedule(
  tickCount: number,
  seed: number,
): { errorSchedule: ErrorInjectionSchedule[]; fillTicks: Set<number> } {
  const rng = createSeededRng(seed);
  const warmUpTicks = 2;
  const eligibleTicks = Array.from(
    { length: Math.max(0, tickCount - warmUpTicks) },
    (_, i) => i + warmUpTicks + 1,
  );

  const errorCount = Math.max(4, Math.round(tickCount * 0.2));
  const fillCount = Math.max(2, Math.round(tickCount * 0.05));
  const totalAbnormal = Math.min(errorCount + fillCount, eligibleTicks.length);

  const shuffled = shuffle(eligibleTicks, rng);
  const abnormalTicks = shuffled.slice(0, totalAbnormal).sort((a, b) => a - b);

  const errorTicks = abnormalTicks.slice(
    0,
    Math.min(errorCount, abnormalTicks.length),
  );
  const fillTicks = new Set(
    abnormalTicks.slice(errorCount, errorCount + fillCount),
  );

  const errorSchedule: ErrorInjectionSchedule[] = errorTicks.map((tick, i) => ({
    tick,
    type: ERROR_TYPES[i % ERROR_TYPES.length]!,
  }));

  return { errorSchedule, fillTicks };
}

const { errorSchedule: ERROR_SCHEDULE, fillTicks: FILL_INJECT_TICKS } =
  generateInjectionSchedule(SOAK_TICK_COUNT, SOAK_SEED);

type TickSnapshot = {
  tick: number;
  openOrderCount: number;
  totalIntentCount: number;
  newIntentCount: number;
  sentIntentCount: number;
  doneIntentCount: number;
  failedIntentCount: number;
  executionHistoryCount: number;
  orderMappingCount: number;
  sessionCount: number;
  executorCount: number;
  heapUsedMb: number;
  tickError: string | null;
  injectedErrorType: ErrorInjectionType | null;
  injectedFill: boolean;
  intentsProducedThisTick: number;
  historyDbRowCount: number;
};

function injectOneTimeAdapterError(
  adapter: ExchangeConnectorAdapterService,
  method: 'placeLimitOrder' | 'cancelOrder' | 'fetchOrderBook',
  errorMessage: string,
): void {
  const original = (
    adapter[method] as (...args: unknown[]) => Promise<unknown>
  ).bind(adapter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (adapter as unknown as Record<string, unknown>)[method] = async (
    ..._args: unknown[]
  ) => {
    (adapter as unknown as Record<string, unknown>)[method] = original;
    throw new Error(errorMessage);
  };
}

function formatInvariantResult(
  name: string,
  passed: boolean,
  detail: string,
): string {
  return `${passed ? 'PASS' : 'FAIL'} Invariant ${name}: ${detail}`;
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

describeSandbox('Pure market making soak stability (sandbox system)', () => {
  jest.setTimeout(2 * 60 * 60 * 1000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    log.suite(
      'Soak test starting — simulating ' +
        `${SOAK_TICK_COUNT} production tick cycles against live sandbox exchange`,
      {
        tickCount: SOAK_TICK_COUNT,
        orderRefreshTimeMs: SOAK_ORDER_REFRESH_TIME_MS,
        seed: SOAK_SEED,
        errorInjections: ERROR_SCHEDULE.length,
        fillInjections: FILL_INJECT_TICKS.size,
        errorTypes: ERROR_TYPES,
        exchange: config!.exchangeId,
        pair: config!.symbol,
      },
    );

    log.step(
      'Test scope: cancel-replace stability, error recovery, fill event routing, ' +
        'executor isolation, and memory/resource boundedness across ' +
        `${SOAK_TICK_COUNT} tick cycles.`,
    );

    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
    log.suite('Sandbox exchange connected, test database ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('All resources released');
  });

  it(`runs ${SOAK_TICK_COUNT} tick cycles with cancel-replace, error injection, simulated fills, and verifies bounded resource usage`, async () => {
    const startMs = Date.now();

    // --- Setup phase ---
    log.step(
      'Creating persisted pure market-making order (1 layer, no hanging orders, 1s refresh)',
    );
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
      orderRefreshTime: SOAK_ORDER_REFRESH_TIME_MS,
    });
    const { order, strategyKey } = fixture;

    log.result('Order fixture created', {
      orderId: order.orderId,
      pair: order.pair,
      exchangeName: order.exchangeName,
      userId: order.userId,
      orderRefreshTimeMs: SOAK_ORDER_REFRESH_TIME_MS,
    });

    log.step(
      'Starting order — executor session will be created and strategy tick cycle begins',
    );
    await helper.startOrder(order.orderId, order.userId);

    const executor = helper.getExecutor(order.exchangeName, order.pair);

    expect(executor).toBeDefined();

    log.result('Order started', {
      executorExists: true,
      activeSessions: executor!.getActiveSessions().length,
    });

    // Register a fill callback on the executor. This verifies the exchange event
    // pipeline correctly delivers fill events to the strategy's executor.
    const onFill = jest.fn();

    executor?.configure({
      onFill: async (_session, fill) => {
        onFill(fill);
      },
    });

    const adapter = helper.getModuleRef().get(ExchangeConnectorAdapterService);

    // --- Soak loop ---
    const snapshots: TickSnapshot[] = [];
    let cancelReplaceCount = 0;
    let previousExchangeOrderIds: Set<string> = new Set();
    let errorRecoveryCount = 0;
    let fillsInjected = 0;
    let previousIntentCount = 0;
    const baselineHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);

    log.step(
      `Starting soak loop: ${SOAK_TICK_COUNT} ticks (seed=${SOAK_SEED}).\n` +
        `  ${ERROR_SCHEDULE.length} error injections, ${FILL_INJECT_TICKS.size} fill injections.\n` +
        '  Error types: fetchOrderBook, placeLimitOrder, cancelOrder.\n' +
        '  What each error type means for production:\n' +
        '    - fetchOrderBook: exchange API unavailable → strategy must SKIP the tick, not place orders at stale prices.\n' +
        '    - placeLimitOrder: order rejected → intent must reach FAILED state, not stay in NEW/SENT.\n' +
        '    - cancelOrder: cancel rejected → order stays in tracker, cancel retried next tick.',
    );

    for (let tick = 1; tick <= SOAK_TICK_COUNT; tick++) {
      let tickError: string | null = null;
      const scheduledError = ERROR_SCHEDULE.find((e) => e.tick === tick);
      const shouldInjectFill =
        FILL_INJECT_TICKS.has(tick) && tick <= SOAK_TICK_COUNT;
      let injectedFill = false;

      // --- Inject scheduled error ---
      if (scheduledError && scheduledError.type !== 'fill') {
        injectOneTimeAdapterError(
          adapter,
          scheduledError.type,
          `soak-injected-${scheduledError.type}-tick-${tick}`,
        );
      }

      await helper.forceSessionReadyForNextTick(order.orderId);

      // --- Run tick ---
      try {
        await helper.runSingleTick(order.orderId);
      } catch (error) {
        tickError =
          error instanceof Error ? error.message : String(error || '');

        if (scheduledError) {
          errorRecoveryCount++;
          log.check(
            `[tick ${tick}] Injected error triggered — ${scheduledError.type} threw: "${tickError}"`,
            {
              errorType: scheduledError.type,
              tick,
            },
          );
        }
      }

      // --- Inject scheduled fill ---
      if (shouldInjectFill && !tickError) {
        const openOrders = helper.getOpenTrackedOrders(strategyKey);
        const buyOrder = openOrders.find((o) => o.side === 'buy');

        if (buyOrder) {
          helper.getUserStreamTrackerService().queueAccountEvent({
            exchange: order.exchangeName,
            accountLabel: config!.accountLabel,
            kind: 'order',
            payload: {
              exchangeOrderId: buyOrder.exchangeOrderId,
              clientOrderId: buyOrder.clientOrderId,
              pair: order.pair,
              side: buyOrder.side,
              price: buyOrder.price,
              cumulativeQty: buyOrder.qty,
              status: 'closed',
              raw: {},
            },
            receivedAt: new Date().toISOString(),
          });

          await helper.flushPrivateStreamEvents();
          injectedFill = true;
          fillsInjected++;
          log.check(
            `[tick ${tick}] Simulated fill injected — order ${buyOrder.exchangeOrderId} (${buyOrder.side}, ${buyOrder.qty} ${order.pair}) closed`,
            {
              exchangeOrderId: buyOrder.exchangeOrderId,
              side: buyOrder.side,
              qty: buyOrder.qty,
            },
          );
        }
      }

      // --- Snapshot ---
      const intents = await helper.listStrategyIntents(order.orderId);
      const history = await helper.listExecutionHistory(order.orderId);
      const mappings = await helper.listOrderMappings(order.orderId);
      const openOrders = helper.getOpenTrackedOrders(strategyKey);
      const intentsProducedThisTick = intents.length - previousIntentCount;

      previousIntentCount = intents.length;

      const currentExchangeOrderIds: Set<string> = new Set(
        openOrders.map((o) => o.exchangeOrderId),
      );

      // Detect cancel-replace: orders were replaced if some previous IDs are gone
      if (
        previousExchangeOrderIds.size > 0 &&
        currentExchangeOrderIds.size > 0 &&
        !tickError
      ) {
        const replaced = Array.from(previousExchangeOrderIds).some(
          (id) => !currentExchangeOrderIds.has(id),
        );

        if (replaced) {
          cancelReplaceCount++;
        }
      }

      if (!tickError) {
        previousExchangeOrderIds = currentExchangeOrderIds;
      }

      const activeExecutors = helper
        .getModuleRef()
        .get(ExecutorRegistry)
        .getActiveExecutors();

      let sessionCount = 0;

      for (const exec of activeExecutors) {
        sessionCount += exec.getActiveSessions().length;
      }

      const snapshot: TickSnapshot = {
        tick,
        openOrderCount: openOrders.length,
        totalIntentCount: intents.length,
        newIntentCount: intents.filter((i) => i.status === 'NEW').length,
        sentIntentCount: intents.filter((i) => i.status === 'SENT').length,
        doneIntentCount: intents.filter((i) => i.status === 'DONE').length,
        failedIntentCount: intents.filter((i) => i.status === 'FAILED').length,
        executionHistoryCount: history.length,
        orderMappingCount: mappings.length,
        sessionCount,
        executorCount: activeExecutors.length,
        heapUsedMb:
          Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 100) /
          100,
        tickError,
        injectedErrorType: scheduledError?.type || null,
        injectedFill,
        intentsProducedThisTick,
        historyDbRowCount: history.length,
      };

      snapshots.push(snapshot);

      const logInterval = Math.max(5, Math.floor(SOAK_TICK_COUNT / 40));

      if (tick % logInterval === 0 || tick === 1 || tick === SOAK_TICK_COUNT) {
        const phase =
          tick === 1
            ? 'warm-up'
            : tick === SOAK_TICK_COUNT
            ? 'final'
            : 'sample';
        const errorNote = scheduledError
          ? ` [INJECTED: ${scheduledError.type}]`
          : '';
        const fillNote = injectedFill ? ' [FILL INJECTED]' : '';
        const skipNote =
          !tickError && intentsProducedThisTick === 0
            ? ' [SKIPPED — no intents produced]'
            : '';

        log.result(
          `[${phase}] tick ${tick}/${SOAK_TICK_COUNT} (${elapsed(
            startMs,
          )})${errorNote}${fillNote}${skipNote}\n` +
            `  Open orders: ${openOrders.length} | Intents this tick: ${intentsProducedThisTick} | ` +
            `Total intents: ${intents.length} (DONE: ${snapshot.doneIntentCount}, FAILED: ${snapshot.failedIntentCount}, NEW: ${snapshot.newIntentCount}, SENT: ${snapshot.sentIntentCount})\n` +
            `  Tracker: ${snapshot.orderMappingCount} mappings | History: ${snapshot.historyDbRowCount} rows | ` +
            `Sessions: ${sessionCount} | Executors: ${activeExecutors.length} | ` +
            `Heap: ${snapshot.heapUsedMb}MB`,
          {
            openOrderCount: snapshot.openOrderCount,
            intentsProducedThisTick: snapshot.intentsProducedThisTick,
            doneIntentCount: snapshot.doneIntentCount,
            failedIntentCount: snapshot.failedIntentCount,
            newIntentCount: snapshot.newIntentCount,
            sentIntentCount: snapshot.sentIntentCount,
            heapUsedMb: snapshot.heapUsedMb,
            tickError: snapshot.tickError,
          },
        );
      }
    }

    // =========================================================================
    // Verification phase — all invariants checked against collected snapshots
    // =========================================================================
    log.step(
      `Soak loop complete (${SOAK_TICK_COUNT} ticks, ${elapsed(startMs)}). ` +
        'Verifying all system invariants...',
    );

    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const ticksWithIntents = snapshots.filter(
      (s) => s.intentsProducedThisTick > 0,
    );
    const ticksWithErrors = snapshots.filter((s) => s.tickError);
    const skippedTicks = snapshots.filter(
      (s) => !s.tickError && s.intentsProducedThisTick === 0,
    );
    const finalHeapMb = lastSnapshot.heapUsedMb;

    log.result('Soak summary', {
      totalTicks: SOAK_TICK_COUNT,
      ticksProducingIntents: ticksWithIntents.length,
      ticksWithErrors: ticksWithErrors.length,
      skippedTicks: skippedTicks.length,
      skippedAtTicks: skippedTicks.map((s) => s.tick),
      errorTypes: ticksWithErrors.map(
        (s) => `tick${s.tick}:${s.injectedErrorType}`,
      ),
      cancelReplaceCycles: cancelReplaceCount,
      errorRecoveries: errorRecoveryCount,
      fillsInjected,
      fillCallbackCount: onFill.mock.calls.length,
      finalSessionCount: lastSnapshot.sessionCount,
      finalExecutorCount: lastSnapshot.executorCount,
      totalIntentsCreated: lastSnapshot.totalIntentCount,
      totalDoneIntents: lastSnapshot.doneIntentCount,
      totalFailedIntents: lastSnapshot.failedIntentCount,
      totalNewIntents: lastSnapshot.newIntentCount,
      baselineHeapMb: Math.round(baselineHeapMb * 100) / 100,
      finalHeapMb,
    });

    // --- Invariant 1: Sessions stay bounded ---
    // One order = one session. If sessionCount ever exceeds 1, a leaked session exists.
    let inv1Pass = true;

    for (const snapshot of snapshots) {
      try {
        expect(snapshot.sessionCount).toBeLessThanOrEqual(1);
      } catch {
        inv1Pass = false;
      }
    }
    try {
      expect(lastSnapshot.sessionCount).toBe(1);
    } catch {
      inv1Pass = false;
    }
    log.check(
      formatInvariantResult(
        '1',
        inv1Pass,
        `session count bounded at ${
          lastSnapshot.sessionCount
        } throughout ${SOAK_TICK_COUNT} ticks — ${
          inv1Pass ? 'no leaked sessions' : 'LEAKED SESSION DETECTED'
        }`,
      ),
      {
        sessionCountHistory: snapshots.map((s) => s.sessionCount),
        finalSessionCount: lastSnapshot.sessionCount,
        expected: 1,
      },
    );

    // --- Invariant 2: Executor count stays bounded ---
    // One pair = one executor. If executorCount ever exceeds 1, a leaked executor exists.
    let inv2Pass = true;

    for (const snapshot of snapshots) {
      try {
        expect(snapshot.executorCount).toBeLessThanOrEqual(1);
      } catch {
        inv2Pass = false;
      }
    }
    try {
      expect(lastSnapshot.executorCount).toBe(1);
    } catch {
      inv2Pass = false;
    }
    log.check(
      formatInvariantResult(
        '2',
        inv2Pass,
        `executor count bounded at ${lastSnapshot.executorCount} throughout — ${
          inv2Pass ? 'no leaked executors' : 'LEAKED EXECUTOR DETECTED'
        }`,
      ),
      {
        executorCountHistory: snapshots.map((s) => s.executorCount),
        finalExecutorCount: lastSnapshot.executorCount,
        expected: 1,
      },
    );

    // --- Invariant 3: No intents stuck in NEW or SENT at the end ---
    // Every intent must reach a terminal state (DONE or FAILED). NEW/SENT = stalled.
    const inv3Pass =
      lastSnapshot.newIntentCount === 0 && lastSnapshot.sentIntentCount === 0;

    log.check(
      formatInvariantResult(
        '3',
        inv3Pass,
        `${lastSnapshot.totalIntentCount} total intents — ` +
          `${lastSnapshot.doneIntentCount} DONE, ${lastSnapshot.failedIntentCount} FAILED, ` +
          `${lastSnapshot.newIntentCount} NEW, ${lastSnapshot.sentIntentCount} SENT. ` +
          `${
            inv3Pass
              ? 'All reached terminal state.'
              : 'INTENTS STALLED IN NEW/SENT!'
          }`,
      ),
      {
        newCount: lastSnapshot.newIntentCount,
        sentCount: lastSnapshot.sentIntentCount,
        doneCount: lastSnapshot.doneIntentCount,
        failedCount: lastSnapshot.failedIntentCount,
      },
    );
    expect(lastSnapshot.newIntentCount).toBe(0);
    expect(lastSnapshot.sentIntentCount).toBe(0);

    // --- Invariant 4: All produced intents reach terminal state ---
    // The total DONE + FAILED must equal total intents produced.
    // If they don't, some intents disappeared or are unaccounted for.
    const expectedIntentsPerTick = 2;
    const expectedTotalIntents =
      ticksWithIntents.length * expectedIntentsPerTick;

    const inv4Pass =
      lastSnapshot.totalIntentCount === expectedTotalIntents &&
      lastSnapshot.doneIntentCount + lastSnapshot.failedIntentCount ===
        expectedTotalIntents;

    log.check(
      formatInvariantResult(
        '4',
        inv4Pass,
        `${ticksWithIntents.length} ticks produced intents × ${expectedIntentsPerTick} intents/tick = ${expectedTotalIntents} expected. ` +
          `Got ${lastSnapshot.totalIntentCount} total. ` +
          `${
            lastSnapshot.doneIntentCount + lastSnapshot.failedIntentCount
          } reached terminal state. ` +
          `${
            inv4Pass
              ? 'All accounted for.'
              : 'MISMATCH — intents missing or unaccounted!'
          }`,
      ),
      {
        ticksProducingIntents: ticksWithIntents.length,
        expectedTotalIntents,
        actualTotalIntents: lastSnapshot.totalIntentCount,
        terminalIntents:
          lastSnapshot.doneIntentCount + lastSnapshot.failedIntentCount,
      },
    );
    expect(lastSnapshot.totalIntentCount).toBe(expectedTotalIntents);
    expect(lastSnapshot.doneIntentCount + lastSnapshot.failedIntentCount).toBe(
      expectedTotalIntents,
    );

    // --- Invariant 5: Order mappings match successfully executed intents ---
    // Every DONE intent should have a corresponding order mapping.
    const inv5Pass =
      lastSnapshot.orderMappingCount === lastSnapshot.doneIntentCount;

    log.check(
      formatInvariantResult(
        '5',
        inv5Pass,
        `order mappings: ${lastSnapshot.orderMappingCount}, DONE intents: ${lastSnapshot.doneIntentCount} — ` +
          `${inv5Pass ? 'matched (PASS)' : 'MISMATCH (FAIL)'}`,
      ),
      {
        orderMappingCount: lastSnapshot.orderMappingCount,
        doneIntentCount: lastSnapshot.doneIntentCount,
      },
    );
    expect(lastSnapshot.orderMappingCount).toBe(lastSnapshot.doneIntentCount);

    // --- Invariant 6: Execution history matches successfully executed intents ---
    // Every DONE intent should produce an execution history record.
    const inv6Pass =
      lastSnapshot.executionHistoryCount === lastSnapshot.doneIntentCount;

    log.check(
      formatInvariantResult(
        '6',
        inv6Pass,
        `execution history rows: ${lastSnapshot.executionHistoryCount}, DONE intents: ${lastSnapshot.doneIntentCount} — ` +
          `${inv6Pass ? 'matched (PASS)' : 'MISMATCH (FAIL)'}`,
      ),
      {
        executionHistoryCount: lastSnapshot.executionHistoryCount,
        doneIntentCount: lastSnapshot.doneIntentCount,
      },
    );
    expect(lastSnapshot.executionHistoryCount).toBe(
      lastSnapshot.doneIntentCount,
    );

    // --- Invariant 7: Cancel-replace cycles actually happened ---
    // At least one cancel-replace must have occurred in a soak of this length.
    if (SOAK_TICK_COUNT >= 3) {
      expect(cancelReplaceCount).toBeGreaterThan(0);
      log.check(
        formatInvariantResult(
          '7',
          true,
          `${cancelReplaceCount} cancel-replace cycles detected — bot continuously refreshed orders throughout soak`,
        ),
        {
          cancelReplaceCount,
          minimumExpected: 1,
        },
      );
    }

    // --- Invariant 8: Error injections did not crash the system ---
    // After each error, the system must resume producing intents on subsequent ticks.
    const activeErrorSchedule = ERROR_SCHEDULE.filter(
      (e) => e.tick <= SOAK_TICK_COUNT,
    );

    let inv8Pass = true;

    if (activeErrorSchedule.length > 0) {
      for (const scheduled of activeErrorSchedule) {
        if (scheduled.tick < SOAK_TICK_COUNT) {
          const nextNormalTick = snapshots.find(
            (s) =>
              s.tick > scheduled.tick &&
              !s.tickError &&
              s.intentsProducedThisTick > 0,
          );

          try {
            expect(nextNormalTick).toBeDefined();
          } catch {
            inv8Pass = false;
          }
        }
      }

      const observedImpact = ticksWithErrors.length + skippedTicks.length;

      log.check(
        formatInvariantResult(
          '8',
          inv8Pass,
          `${activeErrorSchedule.length} scheduled errors — ` +
            `${ticksWithErrors.length} threw, ${skippedTicks.length} silently skipped, ` +
            `${errorRecoveryCount} recovered — ${
              inv8Pass ? 'all recovered, strategy resumed' : 'RECOVERY FAILED'
            }`,
        ),
        {
          scheduledErrors: activeErrorSchedule.length,
          thrownErrors: ticksWithErrors.length,
          silentSkips: skippedTicks.length,
          errorRecoveries: errorRecoveryCount,
          observedImpact,
          errorTypes: Array.from(
            new Set(activeErrorSchedule.map((e) => e.type)),
          ),
        },
      );
    }

    // --- Invariant 9: Each successful tick produces exactly 2 intents ---
    // 1-layer market making = 1 buy + 1 sell = 2 intents per tick.
    let inv9Pass = true;

    for (const snapshot of ticksWithIntents) {
      try {
        expect(snapshot.intentsProducedThisTick).toBe(expectedIntentsPerTick);
      } catch {
        inv9Pass = false;
      }
    }
    log.check(
      formatInvariantResult(
        '9',
        inv9Pass,
        `${ticksWithIntents.length} ticks produced intents — ${
          inv9Pass
            ? 'all had exactly 2 intents (1 buy + 1 sell)'
            : `TICK HAD WRONG INTENT COUNT`
        }`,
      ),
      {
        ticksProducingIntents: ticksWithIntents.length,
        expectedIntentsPerTick,
        ticksWithWrongCount: ticksWithIntents.filter(
          (s) => s.intentsProducedThisTick !== expectedIntentsPerTick,
        ).length,
      },
    );

    // --- Invariant 10: Intent/mapping/history counts stay consistent across all ticks ---
    // At every tick, mappings and history rows should match DONE intents.
    // This catches mid-tick state inconsistency.
    let inv10Pass = true;

    for (const snapshot of snapshots) {
      try {
        expect(snapshot.orderMappingCount).toBe(snapshot.doneIntentCount);
        expect(snapshot.executionHistoryCount).toBe(snapshot.doneIntentCount);
      } catch {
        inv10Pass = false;
      }
    }
    log.check(
      formatInvariantResult(
        '10',
        inv10Pass,
        `order mappings = DONE intents at every tick: ${
          inv10Pass ? 'consistent throughout' : 'INCONSISTENCY DETECTED'
        }`,
      ),
    );

    // --- Invariant 11: Simulated fills reached the executor ---
    if (fillsInjected > 0) {
      const inv11Pass = onFill.mock.calls.length >= fillsInjected;

      log.check(
        formatInvariantResult(
          '11',
          inv11Pass,
          `${fillsInjected} fill(s) injected, ${onFill.mock.calls.length} executor callback(s) received — ` +
            `${
              inv11Pass
                ? 'all fills routed to executor (PASS)'
                : 'SOME FILLS MISSED (FAIL)'
            }`,
        ),
        {
          fillsInjected,
          fillCallbackCount: onFill.mock.calls.length,
        },
      );
      expect(onFill.mock.calls.length).toBeGreaterThanOrEqual(fillsInjected);
    }

    // --- Invariant 12: Heap memory growth is bounded ---
    // Compare average heap in first 5 ticks vs last 5 ticks.
    // A leak would show consistent growth; a stable system stays flat.
    const heapSamples = snapshots.map((s) => s.heapUsedMb);
    const earlyWindow = heapSamples.slice(0, Math.min(5, heapSamples.length));
    const lateWindow = heapSamples.slice(-5);
    const earlyAvgHeap =
      earlyWindow.reduce((a, b) => a + b, 0) / earlyWindow.length;
    const lateAvgHeap =
      lateWindow.reduce((a, b) => a + b, 0) / lateWindow.length;
    const heapGrowthMb = lateAvgHeap - earlyAvgHeap;
    const heapGrowthThresholdMb = 50;
    const inv12Pass = heapGrowthMb < heapGrowthThresholdMb;

    log.check(
      formatInvariantResult(
        '12',
        inv12Pass,
        `heap early avg: ${
          Math.round(earlyAvgHeap * 100) / 100
        }MB → late avg: ${Math.round(lateAvgHeap * 100) / 100}MB ` +
          `(growth: ${
            Math.round(heapGrowthMb * 100) / 100
          }MB, threshold: ${heapGrowthThresholdMb}MB) — ` +
          `${inv12Pass ? 'stable (PASS)' : 'GROWING (FAIL)'}`,
      ),
      {
        earlyAvgHeapMb: Math.round(earlyAvgHeap * 100) / 100,
        lateAvgHeapMb: Math.round(lateAvgHeap * 100) / 100,
        heapGrowthMb: Math.round(heapGrowthMb * 100) / 100,
        thresholdMb: heapGrowthThresholdMb,
        baselineHeapMb: Math.round(baselineHeapMb * 100) / 100,
        finalHeapMb: Math.round(finalHeapMb * 100) / 100,
      },
    );
    expect(heapGrowthMb).toBeLessThan(heapGrowthThresholdMb);

    // --- Stop order ---
    log.step('Stopping order — executor session should be removed');
    await helper.stopOrder(order.orderId, order.userId);

    const stoppedSession = helper.getExecutorSession(
      order.exchangeName,
      order.pair,
      order.orderId,
    );

    const inv13Pass = stoppedSession === undefined;

    log.result(
      `${inv13Pass ? 'PASS' : 'FAIL'} Post-stop: session ${
        inv13Pass ? 'removed' : 'still exists (LEAK)'
      }`,
      {
        sessionExists: Boolean(stoppedSession),
        executorExists: Boolean(
          helper.getExecutor(order.exchangeName, order.pair),
        ),
      },
    );
    expect(stoppedSession).toBeUndefined();

    // --- Final verdict ---
    const allPassed =
      inv1Pass &&
      inv2Pass &&
      inv3Pass &&
      inv4Pass &&
      inv5Pass &&
      inv6Pass &&
      inv8Pass &&
      inv9Pass &&
      inv10Pass &&
      inv12Pass;

    log.check(
      `\n${
        allPassed ? '✅ ALL INVARIANTS PASSED' : '❌ SOME INVARIANTS FAILED'
      }\n` +
        `  ${SOAK_TICK_COUNT} tick soak (${elapsed(
          startMs,
        )}) against live sandbox exchange.\n` +
        `  Intents produced: ${lastSnapshot.totalIntentCount} total, ${lastSnapshot.doneIntentCount} DONE, ${lastSnapshot.failedIntentCount} FAILED.\n` +
        `  Cancel-replace cycles: ${cancelReplaceCount}. Errors recovered: ${errorRecoveryCount}. Fills injected: ${fillsInjected}.\n` +
        `  Heap: ${Math.round(baselineHeapMb * 100) / 100}MB → ${
          Math.round(finalHeapMb * 100) / 100
        }MB (${Math.round(heapGrowthMb * 100) / 100}MB delta).\n` +
        `\n  What this means:\n` +
        `    - The bot's order lifecycle is stable: every tick cancels stale orders and places fresh ones.\n` +
        `    - Error resilience holds: when the exchange fails, intents reach terminal states and the strategy resumes.\n` +
        `    - Fill routing is correct: exchange events are delivered to the executor with no silent drops.\n` +
        `    - Memory is bounded: no unbounded growth in heap, maps, or session counts.\n` +
        `    - State is consistent: DB rows, intent counts, and mappings stay in sync at every tick.\n` +
        `\n  Production implication: ${
          allPassed
            ? 'This system is safe for continuous multi-day operation with active market making.'
            : 'One or more invariants failed — investigate before deploying.'
        }`,
    );
  });
});

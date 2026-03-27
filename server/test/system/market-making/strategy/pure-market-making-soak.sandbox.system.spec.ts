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

const ERROR_SCHEDULE: ErrorInjectionSchedule[] = [
  { tick: 3, type: 'fetchOrderBook' },
  { tick: 5, type: 'placeLimitOrder' },
  { tick: 9, type: 'cancelOrder' },
  { tick: 12, type: 'placeLimitOrder' },
];

const FILL_INJECT_TICKS = new Set([7, 14]);

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
};

function injectOneTimeAdapterError(
  adapter: ExchangeConnectorAdapterService,
  method: 'placeLimitOrder' | 'cancelOrder' | 'fetchOrderBook',
  errorMessage: string,
): void {
  const original = (
    adapter[method] as (...args: unknown[]) => Promise<unknown>
  ).bind(adapter);

  (adapter as unknown as Record<string, unknown>)[method] = async (
    ...args: unknown[]
  ) => {
    (adapter as unknown as Record<string, unknown>)[method] = original;
    throw new Error(errorMessage);
  };
}

describeSandbox('Pure market making soak stability (sandbox system)', () => {
  jest.setTimeout(600000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    log.suite('initializing helper', {
      tickCount: SOAK_TICK_COUNT,
      orderRefreshTimeMs: SOAK_ORDER_REFRESH_TIME_MS,
      errorSchedule: ERROR_SCHEDULE,
      fillInjectTicks: [...FILL_INJECT_TICKS],
    });
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it(`runs ${SOAK_TICK_COUNT} tick cycles with cancel-replace, error injection, simulated fills, and verifies bounded resource usage`, async () => {
    log.step('creating persisted order fixture');
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
      orderRefreshTime: SOAK_ORDER_REFRESH_TIME_MS,
    });
    const { order, strategyKey } = fixture;

    log.result('soak fixture created', {
      orderId: order.orderId,
      pair: order.pair,
      exchangeName: order.exchangeName,
      orderRefreshTime: SOAK_ORDER_REFRESH_TIME_MS,
    });

    log.step('starting order');
    await helper.startOrder(order.orderId, order.userId);

    const executor = helper.getExecutor(order.exchangeName, order.pair);

    expect(executor).toBeDefined();

    const onFill = jest.fn();

    executor?.configure({
      onFill: async (_session, fill) => {
        onFill(fill);
      },
    });

    const adapter = helper
      .getModuleRef()
      .get(ExchangeConnectorAdapterService);

    const snapshots: TickSnapshot[] = [];
    let cancelReplaceCount = 0;
    let previousExchangeOrderIds: Set<string> = new Set();
    let errorRecoveryCount = 0;
    let fillsInjected = 0;
    let previousIntentCount = 0;
    const baselineHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);

    for (let tick = 1; tick <= SOAK_TICK_COUNT; tick++) {
      let tickError: string | null = null;
      const scheduledError = ERROR_SCHEDULE.find((e) => e.tick === tick);
      const shouldInjectFill =
        FILL_INJECT_TICKS.has(tick) && tick <= SOAK_TICK_COUNT;
      let injectedFill = false;

      if (scheduledError && scheduledError.type !== 'fill') {
        injectOneTimeAdapterError(
          adapter,
          scheduledError.type,
          `soak-injected-${scheduledError.type}-tick-${tick}`,
        );
      }

      await helper.forceSessionReadyForNextTick(order.orderId);

      try {
        await helper.runSingleTick(order.orderId);
      } catch (error) {
        tickError =
          error instanceof Error ? error.message : String(error || '');

        if (scheduledError) {
          errorRecoveryCount++;
          log.check(`injected ${scheduledError.type} error at tick ${tick}`, {
            error: tickError,
          });
        }
      }

      if (shouldInjectFill && !tickError) {
        const openOrders = helper.getOpenTrackedOrders(strategyKey);
        const buyOrder = openOrders.find((o) => o.side === 'buy');

        if (buyOrder) {
          helper.getPrivateStreamTrackerService().queueAccountEvent({
            exchange: order.exchangeName,
            accountLabel: config!.accountLabel,
            eventType: 'watch_orders',
            payload: {
              id: buyOrder.exchangeOrderId,
              clientOrderId: buyOrder.clientOrderId,
              symbol: order.pair,
              side: buyOrder.side,
              price: buyOrder.price,
              filled: buyOrder.qty,
              amount: buyOrder.qty,
              status: 'closed',
            },
            receivedAt: new Date().toISOString(),
          });

          await helper.flushPrivateStreamEvents();
          injectedFill = true;
          fillsInjected++;
          log.check(`injected fill at tick ${tick}`, {
            exchangeOrderId: buyOrder.exchangeOrderId,
            side: buyOrder.side,
            qty: buyOrder.qty,
          });
        }
      }

      const intents = await helper.listStrategyIntents(order.orderId);
      const history = await helper.listExecutionHistory(order.orderId);
      const mappings = await helper.listOrderMappings(order.orderId);
      const openOrders = helper.getOpenTrackedOrders(strategyKey);
      const intentsProducedThisTick =
        intents.length - previousIntentCount;

      previousIntentCount = intents.length;

      const currentExchangeOrderIds = new Set(
        openOrders.map((o) => o.exchangeOrderId),
      );

      if (
        previousExchangeOrderIds.size > 0 &&
        currentExchangeOrderIds.size > 0 &&
        !tickError
      ) {
        const replaced = [...previousExchangeOrderIds].some(
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
          Math.round(
            (process.memoryUsage().heapUsed / (1024 * 1024)) * 100,
          ) / 100,
        tickError,
        injectedErrorType: scheduledError?.type || null,
        injectedFill,
        intentsProducedThisTick,
      };

      snapshots.push(snapshot);

      if (tick % 5 === 0 || tick === 1 || tick === SOAK_TICK_COUNT) {
        log.result(`tick ${tick}/${SOAK_TICK_COUNT}`, snapshot);
      }
    }

    log.step('soak loop complete, verifying invariants');

    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const ticksWithIntents = snapshots.filter(
      (s) => s.intentsProducedThisTick > 0,
    );
    const ticksWithErrors = snapshots.filter((s) => s.tickError);
    const skippedTicks = snapshots.filter(
      (s) => !s.tickError && s.intentsProducedThisTick === 0,
    );
    const finalHeapMb = lastSnapshot.heapUsedMb;

    log.result('soak summary', {
      totalTicks: SOAK_TICK_COUNT,
      ticksWithIntents: ticksWithIntents.length,
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

    // --- Invariant 1: Sessions stay bounded (exactly 1 for our single order) ---
    for (const snapshot of snapshots) {
      expect(snapshot.sessionCount).toBeLessThanOrEqual(1);
    }
    expect(lastSnapshot.sessionCount).toBe(1);

    // --- Invariant 2: Executor count stays bounded (exactly 1 for single pair) ---
    for (const snapshot of snapshots) {
      expect(snapshot.executorCount).toBeLessThanOrEqual(1);
    }
    expect(lastSnapshot.executorCount).toBe(1);

    // --- Invariant 3: No intents stuck in NEW or SENT at the end ---
    expect(lastSnapshot.newIntentCount).toBe(0);
    expect(lastSnapshot.sentIntentCount).toBe(0);

    // --- Invariant 4: All produced intents reach terminal state ---
    const expectedIntentsPerTick = 2;
    const expectedTotalIntents =
      ticksWithIntents.length * expectedIntentsPerTick;

    expect(lastSnapshot.totalIntentCount).toBe(expectedTotalIntents);
    expect(
      lastSnapshot.doneIntentCount + lastSnapshot.failedIntentCount,
    ).toBe(expectedTotalIntents);

    // --- Invariant 5: Order mappings match successfully executed intents ---
    expect(lastSnapshot.orderMappingCount).toBe(lastSnapshot.doneIntentCount);

    // --- Invariant 6: Execution history matches successfully executed intents ---
    expect(lastSnapshot.executionHistoryCount).toBe(
      lastSnapshot.doneIntentCount,
    );

    // --- Invariant 7: Cancel-replace cycles actually happened ---
    if (SOAK_TICK_COUNT >= 3) {
      expect(cancelReplaceCount).toBeGreaterThan(0);
      log.check('cancel-replace cycles verified', {
        cancelReplaceCount,
        minimumExpected: 1,
      });
    }

    // --- Invariant 8: Error injections did not crash the system, and it recovered ---
    // Some errors (fetchOrderBook) cause the strategy to silently skip a cycle.
    // Others (placeLimitOrder, cancelOrder) are caught by the executor error
    // handler and the tick completes normally. Both are valid production behavior.
    // The key assertion: every tick after an error injection still produces intents.
    const activeErrorSchedule = ERROR_SCHEDULE.filter(
      (e) => e.tick <= SOAK_TICK_COUNT,
    );

    if (activeErrorSchedule.length > 0) {
      for (const scheduled of activeErrorSchedule) {
        if (scheduled.tick < SOAK_TICK_COUNT) {
          const nextNormalTick = snapshots.find(
            (s) =>
              s.tick > scheduled.tick &&
              !s.tickError &&
              s.intentsProducedThisTick > 0,
          );

          expect(nextNormalTick).toBeDefined();
        }
      }

      const observedImpact = ticksWithErrors.length + skippedTicks.length;

      log.check('error injection resilience verified', {
        scheduled: activeErrorSchedule.length,
        thrownErrors: ticksWithErrors.length,
        silentSkips: skippedTicks.length,
        observedImpact,
        errorTypes: [
          ...new Set(activeErrorSchedule.map((e) => e.type)),
        ],
      });
    }

    // --- Invariant 9: Each successful tick produces exactly 2 intents (1-layer) ---
    for (const snapshot of ticksWithIntents) {
      expect(snapshot.intentsProducedThisTick).toBe(expectedIntentsPerTick);
    }

    // --- Invariant 10: Intent/mapping/history counts stay consistent across all ticks ---
    for (const snapshot of snapshots) {
      expect(snapshot.orderMappingCount).toBe(snapshot.doneIntentCount);
      expect(snapshot.executionHistoryCount).toBe(snapshot.doneIntentCount);
    }

    // --- Invariant 11: Simulated fills were received by the executor ---
    if (fillsInjected > 0) {
      expect(onFill.mock.calls.length).toBeGreaterThanOrEqual(fillsInjected);
      log.check('simulated fills received', {
        fillsInjected,
        fillCallbackCount: onFill.mock.calls.length,
      });
    }

    // --- Invariant 12: Heap memory does not grow unboundedly ---
    const heapSamples = snapshots.map((s) => s.heapUsedMb);
    const earlyWindow = heapSamples.slice(0, 5);
    const lateWindow = heapSamples.slice(-5);
    const earlyAvgHeap =
      earlyWindow.reduce((a, b) => a + b, 0) / earlyWindow.length;
    const lateAvgHeap =
      lateWindow.reduce((a, b) => a + b, 0) / lateWindow.length;
    const heapGrowthMb = lateAvgHeap - earlyAvgHeap;
    const heapGrowthThresholdMb = 50;

    log.check('heap memory trend', {
      earlyAvgHeapMb: Math.round(earlyAvgHeap * 100) / 100,
      lateAvgHeapMb: Math.round(lateAvgHeap * 100) / 100,
      heapGrowthMb: Math.round(heapGrowthMb * 100) / 100,
      thresholdMb: heapGrowthThresholdMb,
    });

    expect(heapGrowthMb).toBeLessThan(heapGrowthThresholdMb);

    log.step('stopping order');
    await helper.stopOrder(order.orderId, order.userId);

    const stoppedSession = helper.getExecutorSession(
      order.exchangeName,
      order.pair,
      order.orderId,
    );

    log.result('post-stop state', {
      sessionExists: Boolean(stoppedSession),
      executorExists: Boolean(
        helper.getExecutor(order.exchangeName, order.pair),
      ),
    });

    expect(stoppedSession).toBeUndefined();
  });
});

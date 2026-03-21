import { MarketMakingRuntimeHelper } from '../../helpers/market-making-runtime.helper';
import { getSystemSandboxSkipReason } from '../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';

const skipReason = getSystemSandboxSkipReason();
const log = createSystemTestLogger('market-making-runtime-control');

if (skipReason) {
  logSystemSkip('market-making runtime control suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox(
  'MarketMakingOrderProcessor runtime control parity (system)',
  () => {
    jest.setTimeout(240000);

    let helper: MarketMakingRuntimeHelper;

    beforeAll(async () => {
      log.suite('initializing helper');
      helper = new MarketMakingRuntimeHelper();
      await helper.init();
      log.suite('helper ready');
    });

    afterAll(async () => {
      await helper?.close();
      log.suite('helper closed');
    });

    it('starts and stops a persisted pure market-making order through the real runtime path', async () => {
      log.step('creating persisted order fixture');
      const fixture = await helper.createPersistedPureMarketMakingOrder();
      const { order, strategyDefinition, strategyKey } = fixture;
      const processor = helper.getProcessor();

      log.result('fixture created', {
        orderId: order.orderId,
        userId: order.userId,
        pair: order.pair,
        exchangeName: order.exchangeName,
      });

      log.step('fetching exchange ticker');
      const ticker = await helper.fetchExchangeTicker(order.pair);

      log.check('ticker fetched', {
        pair: order.pair,
        last: ticker?.last,
      });

      expect(Number(ticker?.last || 0)).toBeGreaterThan(0);

      log.step('starting market-making order');
      await processor.handleStartMM({
        data: {
          userId: order.userId,
          orderId: order.orderId,
        },
      } as any);

      const runningOrder = await helper.findOrder(order.orderId);
      const runningSession = helper.getExecutorSession(
        order.exchangeName,
        order.pair,
        order.orderId,
      );
      const runningStrategyInstance = await helper.findStrategyInstance(
        order.orderId,
      );

      log.result('runtime started', {
        orderState: runningOrder?.state,
        hasSession: Boolean(runningSession),
        strategyInstanceStatus: runningStrategyInstance?.status,
      });

      expect(runningOrder?.state).toBe('running');
      expect(runningSession).toMatchObject({
        clientId: order.orderId,
        exchange: order.exchangeName,
        marketMakingOrderId: order.orderId,
        orderId: order.orderId,
        pair: order.pair,
        strategyType: 'pureMarketMaking',
        userId: order.userId,
      });
      expect(runningStrategyInstance).toMatchObject({
        clientId: order.orderId,
        definitionId: strategyDefinition.id,
        marketMakingOrderId: order.orderId,
        status: 'running',
        strategyType: 'pureMarketMaking',
        userId: order.userId,
      });

      log.step('stopping market-making order');
      await processor.handleStopMM({
        data: {
          userId: order.userId,
          orderId: order.orderId,
        },
      } as any);

      const stoppedOrder = await helper.findOrder(order.orderId);
      const stoppedStrategyInstance = await helper.findStrategyInstance(
        order.orderId,
      );
      const intents = await helper.listStrategyIntents();

      log.result('runtime stopped', {
        orderState: stoppedOrder?.state,
        hasExecutor: Boolean(
          helper.getExecutor(order.exchangeName, order.pair),
        ),
        strategyInstanceStatus: stoppedStrategyInstance?.status,
        intentCount: intents.length,
      });

      expect(stoppedOrder?.state).toBe('stopped');
      expect(
        helper.getExecutor(order.exchangeName, order.pair),
      ).toBeUndefined();
      expect(stoppedStrategyInstance?.status).toBe('stopped');
      expect(
        intents.some(
          (intent) =>
            intent.clientId === order.orderId &&
            intent.status === 'NEW' &&
            intent.strategyKey === strategyKey &&
            intent.type === 'STOP_CONTROLLER',
        ),
      ).toBe(true);
      expect(await helper.countExecutionHistory()).toBe(0);
    });
  },
);

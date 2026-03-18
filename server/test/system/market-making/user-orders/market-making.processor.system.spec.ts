import { MarketMakingRuntimeHelper } from '../../helpers/market-making-runtime.helper';
import { getSystemSandboxSkipReason } from '../../helpers/sandbox-system.helper';

const skipReason = getSystemSandboxSkipReason();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(
    `[system] Skipping market-making runtime control suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox(
  'MarketMakingOrderProcessor runtime control parity (system)',
  () => {
    jest.setTimeout(240000);

    let helper: MarketMakingRuntimeHelper;

    beforeAll(async () => {
      helper = new MarketMakingRuntimeHelper();
      await helper.init();
    });

    afterAll(async () => {
      await helper?.close();
    });

    it('starts and stops a persisted pure market-making order through the real runtime path', async () => {
      const fixture = await helper.createPersistedPureMarketMakingOrder();
      const { order, strategyDefinition, strategyKey } = fixture;
      const processor = helper.getProcessor();
      const ticker = await helper.fetchExchangeTicker(order.pair);

      expect(Number(ticker?.last || 0)).toBeGreaterThan(0);

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

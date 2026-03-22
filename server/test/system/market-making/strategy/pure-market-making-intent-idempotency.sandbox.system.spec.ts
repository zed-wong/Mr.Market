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
const log = createSystemTestLogger('pure-mm-intent-idempotency-sandbox');

if (skipReason) {
  logSystemSkip(
    'pure market-making intent idempotency sandbox suite',
    skipReason,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox(
  'Pure market making intent idempotency parity (sandbox system)',
  () => {
    jest.setTimeout(240000);

    let helper: MarketMakingSingleTickHelper;

    beforeAll(async () => {
      log.suite('initializing helper');
      helper = new MarketMakingSingleTickHelper(config!);
      await helper.init();
      log.suite('helper ready');
    });

    afterAll(async () => {
      await helper?.close();
      log.suite('helper closed');
    });

    it('does not duplicate persistence side effects when the same stored intent is consumed twice', async () => {
      log.step('creating persisted order fixture');
      const fixture = await helper.createPersistedPureMarketMakingOrder({
        hangingOrdersEnabled: false,
        numberOfLayers: 1,
      });
      const { order } = fixture;

      log.step('starting order and generating initial intents');
      await helper.startOrder(order.orderId, order.userId);
      await helper.runSingleTick(order.orderId);

      const initialIntents = await helper.listStrategyIntents(order.orderId);
      const targetIntentId = initialIntents[0]?.intentId;

      expect(targetIntentId).toBeDefined();

      const baselineHistory = await helper.listExecutionHistory(order.orderId);
      const baselineMappings = await helper.listOrderMappings(order.orderId);

      log.step('re-consuming the same stored intent twice');
      await helper.consumeStoredIntents([targetIntentId!, targetIntentId!]);

      const intentsAfterDuplicateConsume = await helper.listStrategyIntents(
        order.orderId,
      );
      const historyAfterDuplicateConsume = await helper.listExecutionHistory(
        order.orderId,
      );
      const mappingsAfterDuplicateConsume = await helper.listOrderMappings(
        order.orderId,
      );

      log.result('idempotency results', {
        orderId: order.orderId,
        targetIntentId,
        intentStatuses: intentsAfterDuplicateConsume.map((intent) => ({
          intentId: intent.intentId,
          status: intent.status,
        })),
        baselineHistoryCount: baselineHistory.length,
        baselineMappingCount: baselineMappings.length,
        finalHistoryCount: historyAfterDuplicateConsume.length,
        finalMappingCount: mappingsAfterDuplicateConsume.length,
      });

      expect(intentsAfterDuplicateConsume).toHaveLength(2);
      expect(
        intentsAfterDuplicateConsume.every(
          (intent) => intent.status === 'DONE',
        ),
      ).toBe(true);
      expect(historyAfterDuplicateConsume).toHaveLength(baselineHistory.length);
      expect(mappingsAfterDuplicateConsume).toHaveLength(
        baselineMappings.length,
      );
    });
  },
);

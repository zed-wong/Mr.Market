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
const log = createSystemTestLogger('pure-mm-intent-lifecycle-sandbox');

if (skipReason) {
  logSystemSkip(
    'pure market-making intent lifecycle sandbox suite',
    skipReason,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox(
  'Pure market making intent lifecycle parity (sandbox system)',
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

    it('creates intents and finishes NEW -> DONE with persisted mappings and history through real sandbox execution', async () => {
      log.step('creating persisted order fixture');
      const fixture = await helper.createPersistedPureMarketMakingOrder({
        hangingOrdersEnabled: false,
        numberOfLayers: 1,
      });
      const { order } = fixture;

      log.step('starting order');
      await helper.startOrder(order.orderId, order.userId);

      const intentsBeforeTick = await helper.listStrategyIntents(order.orderId);

      expect(intentsBeforeTick).toHaveLength(0);

      log.step('running one eligible tick');
      await helper.runSingleTick(order.orderId);

      const intents = await helper.listStrategyIntents(order.orderId);
      const history = await helper.listExecutionHistory(order.orderId);
      const mappings = await helper.listOrderMappings(order.orderId);

      log.result('sandbox intent lifecycle artifacts', {
        orderId: order.orderId,
        intentStatuses: intents.map((intent) => intent.status),
        historyCount: history.length,
        mappingCount: mappings.length,
      });

      expect(intents).toHaveLength(2);
      expect(intents.every((intent) => intent.status === 'DONE')).toBe(true);
      expect(history).toHaveLength(2);
      expect(mappings).toHaveLength(2);
    });
  },
);

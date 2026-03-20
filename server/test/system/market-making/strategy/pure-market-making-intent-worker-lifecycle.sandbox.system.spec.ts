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
const log = createSystemTestLogger('pure-mm-worker-lifecycle-sandbox');

if (skipReason) {
  logSystemSkip(
    'pure market-making worker lifecycle sandbox suite',
    skipReason,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox(
  'Pure market making worker lifecycle parity (sandbox system)',
  () => {
    jest.setTimeout(240000);

    let helper: MarketMakingSingleTickHelper;

    beforeAll(async () => {
      log.suite('initializing helper');
      helper = new MarketMakingSingleTickHelper(config!, {
        intentExecutionDriver: 'worker',
        intentWorkerPollIntervalMs: 10,
      });
      await helper.init();
      log.suite('helper ready');
    });

    afterAll(async () => {
      await helper?.close();
      log.suite('helper closed');
    });

    it('persists NEW intents on tick, then lets the worker poll and execute them through the real sandbox path', async () => {
      log.step('creating persisted order fixture');
      const fixture = await helper.createPersistedPureMarketMakingOrder({
        hangingOrdersEnabled: false,
        numberOfLayers: 1,
      });
      const { order } = fixture;

      log.step('starting order');
      await helper.startOrder(order.orderId, order.userId);

      log.step('running one eligible tick before worker startup');
      await helper.runSingleTick(order.orderId);

      const newIntents = await helper.waitForIntentStatuses(order.orderId, [
        'NEW',
        'NEW',
      ]);

      log.result('new intents persisted before worker execution', {
        orderId: order.orderId,
        statuses: newIntents.map((intent) => intent.status),
      });

      expect(newIntents).toHaveLength(2);
      expect(newIntents.every((intent) => intent.status === 'NEW')).toBe(true);
      expect(await helper.listOrderMappings(order.orderId)).toHaveLength(0);
      expect(await helper.listExecutionHistory(order.orderId)).toHaveLength(0);

      log.step('starting worker polling');
      await helper.startWorker();

      const doneIntents = await helper.waitForIntentStatuses(order.orderId, [
        'DONE',
        'DONE',
      ]);
      const mappings = await helper.listOrderMappings(order.orderId);
      const history = await helper.listExecutionHistory(order.orderId);

      log.result('worker completed sandbox execution', {
        orderId: order.orderId,
        statuses: doneIntents.map((intent) => intent.status),
        mappingCount: mappings.length,
        historyCount: history.length,
      });

      expect(doneIntents).toHaveLength(2);
      expect(doneIntents.every((intent) => intent.status === 'DONE')).toBe(
        true,
      );
      expect(mappings).toHaveLength(2);
      expect(history).toHaveLength(2);
    });
  },
);

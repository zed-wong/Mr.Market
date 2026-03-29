import { MarketMakingIntentLifecycleHelper } from '../../helpers/market-making-intent-lifecycle.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('intent-idempotency');

describe('Intent idempotency (mock system)', () => {
  jest.setTimeout(30000);

  let helper: MarketMakingIntentLifecycleHelper;

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingIntentLifecycleHelper();
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('executes the same persisted intent only once when consumed twice', async () => {
    log.step('publishing one pure market making cycle');
    const strategyKey = await helper.publishPureMarketMakingCycle({
      clientId: 'system-order-idempotency-1',
    });
    const newIntents = await helper.waitForIntentStatuses(strategyKey, [
      'NEW',
      'NEW',
    ]);
    const targetIntentId = newIntents[0]?.intentId;

    expect(targetIntentId).toBeDefined();

    log.step('consuming the same stored intent twice through the real execution service');
    const consumePromise = helper.consumeStoredIntents([
      targetIntentId!,
      targetIntentId!,
    ]);
    const pendingPlacements = await helper.waitForPendingPlacements(1);

    log.result('single execution attempt observed', {
      targetIntentId,
      pendingPlacements,
    });

    expect(pendingPlacements).toHaveLength(1);

    helper.releaseNextPlacement();
    await consumePromise;

    const intents = await helper.listStrategyIntents(strategyKey);
    const history = await helper.listExecutionHistory();
    const mappings = await helper.listOrderMappings();

    log.result('duplicate consume settled', {
      statuses: intents.map((intent) => ({
        intentId: intent.intentId,
        status: intent.status,
      })),
      historyCount: history.length,
      mappingCount: mappings.length,
    });

    expect(intents[0]?.status).toBe('DONE');
    expect(intents[1]?.status).toBe('NEW');
    expect(history).toHaveLength(1);
    expect(mappings).toHaveLength(1);
  });
});

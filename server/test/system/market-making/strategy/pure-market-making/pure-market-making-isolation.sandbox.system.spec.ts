import { MarketMakingSingleTickHelper } from '../../../helpers/market-making-single-tick.helper';
import {
  getSystemSandboxSkipReason,
  readSystemSandboxConfig,
} from '../../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../../helpers/system-test-log.helper';

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const skipReason = envSkipReason;
const log = createSystemTestLogger('pure-mm-isolation');

if (skipReason) {
  logSystemSkip('pure market making isolation suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Pure market making isolation parity (sandbox system)', () => {
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

  it('keeps executor sessions isolated across two pairs on the same exchange', async () => {
    const primaryPair = config!.symbol;
    const secondaryPair = primaryPair.startsWith('BTC/')
      ? primaryPair.replace('BTC/', 'ETH/')
      : `ETH/${primaryPair.split('/')[1] || 'USDT'}`;

    const first = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
      pair: primaryPair,
    });
    const second = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
      pair: secondaryPair,
    });

    await helper.startOrder(first.order.orderId, first.order.userId);
    await helper.startOrder(second.order.orderId, second.order.userId);

    const firstSession = helper.getExecutorSession(
      first.order.exchangeName,
      first.order.pair,
      first.order.orderId,
    );
    const secondSession = helper.getExecutorSession(
      second.order.exchangeName,
      second.order.pair,
      second.order.orderId,
    );

    expect(firstSession).toBeDefined();
    expect(secondSession).toBeDefined();
    expect(first.order.pair).not.toBe(second.order.pair);

    log.step('running tick for first pair only');
    await helper.runSingleTick(first.order.orderId);

    const firstIntents = await helper.listStrategyIntents(first.order.orderId);
    const secondIntents = await helper.listStrategyIntents(
      second.order.orderId,
    );

    log.result('multi-pair isolation verified', {
      firstPair: first.order.pair,
      secondPair: second.order.pair,
      firstIntentCount: firstIntents.length,
      secondIntentCount: secondIntents.length,
    });

    expect(firstIntents.length).toBeGreaterThan(0);
    expect(secondIntents).toHaveLength(0);
  });
});

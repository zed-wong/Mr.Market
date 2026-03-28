import { MarketMakingPaymentHelper } from '../../../helpers/market-making-payment.helper';
import { createSystemTestLogger } from '../../../helpers/system-test-log.helper';

let helper: MarketMakingPaymentHelper;
const log = createSystemTestLogger('pure-mm-config');

describe('Pure market making config validation parity (mock system)', () => {
  jest.setTimeout(240000);

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingPaymentHelper();
    await helper.init();
    log.suite('helper ready');
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('rejects config overrides that attempt to override system-managed fields', async () => {
    log.step('creating intent with invalid config override');

    await expect(
      helper.createIntent({
        configOverrides: {
          userId: 'malicious-user',
        },
      }),
    ).rejects.toThrow('configOverrides cannot override system field: userId');
  });
});

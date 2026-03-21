import { MarketMakingPaymentHelper } from '../../helpers/market-making-payment.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('market-making-queue-contract');

describe('MarketMakingOrderProcessor queue contract parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingPaymentHelper;

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

  it('queues check_payment_complete with the expected job contract after snapshot intake', async () => {
    const fixture = await helper.createIntent();

    log.step('ingesting first snapshot to trigger queued payment check');
    await helper.ingestSnapshot({
      snapshotId: `snapshot-${Date.now().toString(36)}`,
      assetId: 'asset-base',
      amount: '0.01',
      userId: fixture.userId,
      memo: fixture.memo,
    });

    const queuedJob = await helper.getQueuedMarketMakingJob(
      `check_payment_${fixture.orderId}`,
    );

    log.result('queued payment job captured', queuedJob);

    expect(queuedJob).toMatchObject({
      id: `check_payment_${fixture.orderId}`,
      name: 'check_payment_complete',
      data: {
        orderId: fixture.orderId,
        marketMakingPairId: fixture.marketMakingPairId,
      },
      opts: {
        jobId: `check_payment_${fixture.orderId}`,
        delay: 5000,
        attempts: 60,
        backoff: { type: 'fixed', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  });
});

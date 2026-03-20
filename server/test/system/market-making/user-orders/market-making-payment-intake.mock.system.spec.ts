import { MarketMakingPaymentHelper } from '../../helpers/market-making-payment.helper';
import { createSystemTestLogger } from '../../helpers/system-test-log.helper';

const log = createSystemTestLogger('market-making-payment-intake');

describe('Market making payment intake parity (system)', () => {
  jest.setTimeout(120000);

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

  it('creates an order intent through the real service and reaches payment_complete through snapshot intake', async () => {
    log.step('creating market-making intent');
    const fixture = await helper.createIntent({
      configOverrides: {
        bidSpread: 0.002,
        orderRefreshTime: 20000,
      },
    });
    log.result('intent created', {
      orderId: fixture.orderId,
      userId: fixture.userId,
      strategyDefinitionId: fixture.strategyDefinitionId,
    });

    log.step('ingesting base snapshot');
    await helper.ingestSnapshot({
      snapshotId: 'snapshot-base-1',
      assetId: 'asset-base',
      amount: '10',
      userId: fixture.userId,
      memo: fixture.memo,
    });

    const pendingPayment = await helper.findPaymentState(fixture.orderId);
    log.check('payment state after base snapshot', {
      orderId: fixture.orderId,
      state: pendingPayment?.state,
      baseAssetAmount: pendingPayment?.baseAssetAmount,
      quoteAssetAmount: pendingPayment?.quoteAssetAmount,
    });
    expect(pendingPayment).toMatchObject({
      orderId: fixture.orderId,
      userId: fixture.userId,
      state: 'payment_pending',
      baseAssetAmount: '10',
      quoteAssetAmount: '0',
    });

    log.step('ingesting quote snapshot');
    await helper.ingestSnapshot({
      snapshotId: 'snapshot-quote-1',
      assetId: 'asset-quote',
      amount: '200',
      userId: fixture.userId,
      memo: fixture.memo,
    });

    log.step('running queued payment completion check');
    await helper.runQueuedPaymentCheck(fixture.orderId);

    const completedPayment = await helper.findPaymentState(fixture.orderId);
    const order = await helper.findOrder(fixture.orderId);
    const intent = await helper.findIntent(fixture.orderId);
    const baseBalance = await helper.getBalance(fixture.userId, 'asset-base');
    const quoteBalance = await helper.getBalance(fixture.userId, 'asset-quote');
    log.result('payment completion artifacts collected', {
      orderState: order?.state,
      paymentState: completedPayment?.state,
      intentState: intent?.state,
      baseBalance: baseBalance?.available,
      quoteBalance: quoteBalance?.available,
    });

    expect(completedPayment).toMatchObject({
      orderId: fixture.orderId,
      userId: fixture.userId,
      state: 'payment_complete',
      baseAssetAmount: '10',
      quoteAssetAmount: '200',
    });
    expect(order).toMatchObject({
      orderId: fixture.orderId,
      userId: fixture.userId,
      pair: 'BTC/USDT',
      exchangeName: 'binance',
      state: 'payment_complete',
      strategyDefinitionId: fixture.strategyDefinitionId,
      strategySnapshot: expect.objectContaining({
        controllerType: 'pureMarketMaking',
        resolvedConfig: expect.objectContaining({
          userId: fixture.userId,
          clientId: fixture.orderId,
          marketMakingOrderId: fixture.orderId,
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.002,
          orderRefreshTime: 20000,
        }),
      }),
    });
    expect(intent).toMatchObject({
      orderId: fixture.orderId,
      state: 'completed',
    });
    expect(baseBalance.available).toBe('10');
    expect(quoteBalance.available).toBe('200');

    log.step('starting order through runtime handoff');
    await helper.startOrder(fixture.orderId, fixture.userId);
    log.check('strategy dispatch called', {
      orderId: fixture.orderId,
      userId: fixture.userId,
    });

    expect(
      helper.getStrategyServiceStub().executePureMarketMakingStrategy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: fixture.userId,
        clientId: fixture.orderId,
        marketMakingOrderId: fixture.orderId,
        pair: 'BTC/USDT',
        exchangeName: 'binance',
      }),
    );
  });
});

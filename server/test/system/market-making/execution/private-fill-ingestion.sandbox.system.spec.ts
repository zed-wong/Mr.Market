import BigNumber from 'bignumber.js';
import type * as ccxt from 'ccxt';

import { MarketMakingSingleTickHelper } from '../../helpers/market-making-single-tick.helper';
import { pollUntil } from '../../helpers/sandbox-system.helper';
import {
  getSystemSandboxSkipReason,
  hasSecondarySystemSandboxAccount,
  readSystemSandboxConfig,
} from '../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';

const envSkipReason = getSystemSandboxSkipReason();
const config = envSkipReason ? null : readSystemSandboxConfig();
const skipReason = envSkipReason;
const log = createSystemTestLogger('private-fill-ingestion');

if (skipReason) {
  logSystemSkip('private-fill ingestion suite', skipReason);
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Private fill ingestion parity (system)', () => {
  jest.setTimeout(240000);

  let helper: MarketMakingSingleTickHelper;

  beforeAll(async () => {
    log.suite('initializing helper');
    helper = new MarketMakingSingleTickHelper(config!);
    await helper.init();
    log.suite('helper ready', {
      exchangeId: config?.exchangeId,
      accountLabel: config?.accountLabel,
      account2Label: config?.account2Label,
    });
  });

  afterAll(async () => {
    await helper?.close();
    log.suite('helper closed');
  });

  it('starts a real watchOrders loop, routes a deterministic private-stream fill to the pooled executor, and stops the watcher on stop_mm', async () => {
    log.step('creating deterministic fill fixture');
    const fixture = await helper.createPersistedPureMarketMakingOrder({
      hangingOrdersEnabled: false,
      numberOfLayers: 1,
    });
    const { order, strategyKey } = fixture;
    const onFill = jest.fn();

    log.result('fixture created', {
      orderId: order.orderId,
      pair: order.pair,
      exchangeName: order.exchangeName,
    });

    log.step('starting order');
    await helper.startOrder(order.orderId, order.userId);

    log.step('waiting for watchOrders subscription');
    await pollUntil(
      async () =>
        helper.getPrivateStreamIngestionService().isWatching({
          exchange: order.exchangeName,
          accountLabel: config!.accountLabel,
          symbol: order.pair,
        }),
      async (isWatching) => isWatching === true,
      {
        description: 'private order watcher to start',
        intervalMs: 250,
      },
    );
    log.check('watchOrders active', {
      exchange: order.exchangeName,
      pair: order.pair,
      accountLabel: config!.accountLabel,
    });

    const executor = helper.getExecutor(order.exchangeName, order.pair);

    expect(executor).toBeDefined();

    executor?.configure({
      onFill: async (_session, fill) => {
        onFill(fill);
      },
    });

    log.step('running single tick to create tracked orders');
    await helper.runSingleTick(order.orderId);

    const trackedOrder = helper
      .getOpenTrackedOrders(strategyKey)
      .find((candidate) => candidate.side === 'buy');

    expect(trackedOrder).toBeDefined();
    log.result('tracked order selected', {
      exchangeOrderId: trackedOrder?.exchangeOrderId,
      clientOrderId: trackedOrder?.clientOrderId,
      side: trackedOrder?.side,
      price: trackedOrder?.price,
      qty: trackedOrder?.qty,
    });

    log.step('queueing deterministic private-stream fill event');
    helper.getPrivateStreamTrackerService().queueAccountEvent({
      exchange: order.exchangeName,
      accountLabel: config!.accountLabel,
      eventType: 'watch_orders',
      payload: {
        id: trackedOrder?.exchangeOrderId,
        clientOrderId: trackedOrder?.clientOrderId,
        symbol: order.pair,
        side: trackedOrder?.side,
        price: trackedOrder?.price,
        filled: trackedOrder?.qty,
        amount: trackedOrder?.qty,
        status: 'closed',
      },
      receivedAt: new Date().toISOString(),
    });

    log.step('flushing private-stream events until executor receives fill');
    await pollUntil(
      async () => {
        await helper.flushPrivateStreamEvents();

        return onFill.mock.calls.length;
      },
      async (callCount) => callCount > 0,
      {
        description: 'live private-stream fill to route to the executor',
        intervalMs: 1000,
        timeoutMs: 60000,
      },
    );
    log.check('executor received deterministic fill', {
      fillCallbackCount: onFill.mock.calls.length,
      exchangeOrderId: trackedOrder?.exchangeOrderId,
    });

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: trackedOrder?.exchangeOrderId,
      }),
    );

    log.step('stopping order and waiting for watcher shutdown');
    await helper.stopOrder(order.orderId, order.userId);

    await pollUntil(
      async () =>
        helper.getPrivateStreamIngestionService().isWatching({
          exchange: order.exchangeName,
          accountLabel: config!.accountLabel,
          symbol: order.pair,
        }),
      async (isWatching) => isWatching === false,
      {
        description: 'private order watcher to stop',
        intervalMs: 250,
      },
    );
    log.result('watchOrders stopped', {
      exchange: order.exchangeName,
      pair: order.pair,
      accountLabel: config!.accountLabel,
    });
  });

  const itLiveFill =
    config && hasSecondarySystemSandboxAccount(config) ? it : it.skip;

  itLiveFill(
    'routes a real live fill event through watchOrders when a second sandbox account is configured',
    async () => {
      log.step('creating live-fill fixture');
      const fixture = await helper.createPersistedPureMarketMakingOrder({
        askSpread: 0.00001,
        bidSpread: 0.00001,
        hangingOrdersEnabled: false,
        numberOfLayers: 1,
      });
      const { order, strategyKey } = fixture;
      const onFill = jest.fn();

      log.result('live-fill fixture created', {
        orderId: order.orderId,
        pair: order.pair,
        exchangeName: order.exchangeName,
        accountLabel: config!.accountLabel,
        counterpartyAccountLabel: config!.account2Label,
      });

      log.step('starting order');
      await helper.startOrder(order.orderId, order.userId);

      const executor = helper.getExecutor(order.exchangeName, order.pair);

      expect(executor).toBeDefined();

      executor?.configure({
        onFill: async (_session, fill) => {
          onFill(fill);
        },
      });

      log.step('running single tick to place live sandbox orders');
      await helper.runSingleTick(order.orderId);

      const counterExchange = helper.getExchangeForAccount(
        config!.account2Label,
      );
      const counterBalance = await counterExchange.fetchBalance();
      const primaryOrderBook = await helper
        .getExchange()
        .fetchOrderBook(order.pair);
      const [baseAsset, quoteAsset] = order.pair.split('/');
      const trackedOrders = helper.getOpenTrackedOrders(strategyKey);
      const buyOrder = trackedOrders.find(
        (candidate) => candidate.side === 'buy',
      );
      const sellOrder = trackedOrders.find(
        (candidate) => candidate.side === 'sell',
      );
      const baseFree = new BigNumber(counterBalance?.free?.[baseAsset] || '0');
      const quoteFree = new BigNumber(
        counterBalance?.free?.[quoteAsset] || '0',
      );
      const canSellBase =
        buyOrder && baseFree.gte(new BigNumber(buyOrder.qty).times('1.01'));
      const canBuyQuote =
        sellOrder &&
        quoteFree.gte(
          new BigNumber(sellOrder.qty).times(sellOrder.price).times('1.01'),
        );
      const bestBid = new BigNumber(primaryOrderBook?.bids?.[0]?.[0] || '0');
      const bestAsk = new BigNumber(primaryOrderBook?.asks?.[0]?.[0] || '0');
      const buyDistance = buyOrder
        ? bestBid.minus(buyOrder.price).abs()
        : new BigNumber('1e18');
      const sellDistance = sellOrder
        ? new BigNumber(sellOrder.price).minus(bestAsk).abs()
        : new BigNumber('1e18');
      const chooseBuyOrder =
        Boolean(canSellBase) && (!canBuyQuote || buyDistance.lte(sellDistance));
      const trackedOrder = chooseBuyOrder
        ? buyOrder
        : canBuyQuote
        ? sellOrder
        : canSellBase
        ? buyOrder
        : undefined;

      expect(trackedOrder).toBeDefined();
      log.result('counterparty decision made', {
        trackedSide: trackedOrder?.side,
        counterSide: trackedOrder?.side === 'buy' ? 'sell' : 'buy',
        baseFree: baseFree.toFixed(),
        quoteFree: quoteFree.toFixed(),
        buyDistance: buyDistance.toFixed(),
        sellDistance: sellDistance.toFixed(),
      });

      const counterSide = trackedOrder?.side === 'buy' ? 'sell' : 'buy';
      const counterQty = parseFloat(trackedOrder?.qty || '0');

      let counterOrderId: string | undefined;

      if (
        typeof counterExchange.createMarketOrder === 'function' ||
        counterExchange.has?.createMarketOrder
      ) {
        const counterOrder = await counterExchange.createOrder(
          order.pair,
          'market',
          counterSide,
          counterQty,
          undefined,
        );

        counterOrderId = String(counterOrder?.id || '');
        log.step('submitted market counter order', {
          counterOrderId,
          side: counterSide,
          qty: counterQty,
        });
      } else {
        const crossedPrice = new BigNumber(trackedOrder!.price).times(
          trackedOrder?.side === 'buy' ? '0.98' : '1.02',
        );
        const counterPrice =
          typeof counterExchange.priceToPrecision === 'function'
            ? parseFloat(
                counterExchange.priceToPrecision(
                  order.pair,
                  crossedPrice.toNumber(),
                ),
              )
            : crossedPrice.toNumber();

        const counterOrder = await counterExchange.createOrder(
          order.pair,
          'limit',
          counterSide,
          counterQty,
          counterPrice,
        );

        counterOrderId = String(counterOrder?.id || '');
        log.step('submitted crossed limit counter order', {
          counterOrderId,
          side: counterSide,
          qty: counterQty,
          price: counterPrice,
        });
      }

      let filledTargetOrder: ccxt.Order | undefined;

      try {
        log.step('waiting for tracked order to become filled on exchange');
        filledTargetOrder = await pollUntil(
          async () =>
            await helper.fetchExchangeOrder(
              trackedOrder!.exchangeOrderId,
              order.pair,
            ),
          async (exchangeOrder) => {
            const status = String(exchangeOrder?.status || '').toLowerCase();

            return status === 'closed' || status === 'filled';
          },
          {
            description:
              'tracked sandbox order to fill from the second account',
            intervalMs: 1000,
            timeoutMs: 60000,
          },
        );
        log.result('tracked order filled on exchange', {
          exchangeOrderId: filledTargetOrder?.id,
          status: filledTargetOrder?.status,
          filled: filledTargetOrder?.filled,
        });
      } catch {
        const targetOrder = await helper.fetchExchangeOrder(
          trackedOrder!.exchangeOrderId,
          order.pair,
        );
        const counterOrder = counterOrderId
          ? await counterExchange.fetchOrder(counterOrderId, order.pair)
          : undefined;

        throw new Error(
          `Live fill did not happen. targetStatus=${String(
            targetOrder?.status || '',
          )} targetFilled=${String(
            targetOrder?.filled || '',
          )} counterStatus=${String(
            counterOrder?.status || '',
          )} counterFilled=${String(
            counterOrder?.filled || '',
          )} trackedSide=${String(
            trackedOrder?.side || '',
          )} counterSide=${String(counterSide || '')}`,
        );
      }

      log.step(
        'flushing private-stream events until live fill callback arrives',
      );
      await pollUntil(
        async () => {
          await helper.flushPrivateStreamEvents();

          return onFill.mock.calls.length;
        },
        async (callCount) => callCount > 0,
        {
          description: 'real live private-stream fill to route to the executor',
          intervalMs: 1000,
          timeoutMs: 60000,
        },
      );
      log.check('executor received live fill', {
        fillCallbackCount: onFill.mock.calls.length,
        targetExchangeOrderId: trackedOrder?.exchangeOrderId,
      });

      expect(onFill).toHaveBeenCalledWith(
        expect.objectContaining({
          exchangeOrderId: trackedOrder?.exchangeOrderId,
        }),
      );

      log.step('stopping live-fill fixture order');
      await helper.stopOrder(order.orderId, order.userId);
      log.result('live-fill scenario complete', {
        orderId: order.orderId,
        counterOrderId,
      });
    },
  );
});

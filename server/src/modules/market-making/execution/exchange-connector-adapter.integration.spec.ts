/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import {
  getSandboxIntegrationSkipReason,
  pollUntil,
  SandboxExchangeHelper,
} from '../../../../test/helpers/sandbox-exchange.helper';
import { buildClientOrderId } from '../../../common/helpers/client-order-id';
import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { ExchangeConnectorAdapterService } from './exchange-connector-adapter.service';

const skipReason = getSandboxIntegrationSkipReason();

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(
    `[integration] Skipping ExchangeConnectorAdapterService sandbox suite: ${skipReason}`,
  );
}

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('ExchangeConnectorAdapterService (integration)', () => {
  jest.setTimeout(240000);

  let helper: SandboxExchangeHelper;
  let moduleRef: TestingModule;
  let service: ExchangeConnectorAdapterService;

  beforeAll(async () => {
    helper = new SandboxExchangeHelper();

    const exchange = await helper.init();
    const config = helper.getConfig();

    moduleRef = await Test.createTestingModule({
      providers: [
        ExchangeConnectorAdapterService,
        {
          provide: ExchangeInitService,
          useValue: {
            getExchange: jest.fn().mockReturnValue(exchange),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: number) => {
              if (key === 'strategy.exchange_min_request_interval_ms') {
                return config.minRequestIntervalMs;
              }

              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ExchangeConnectorAdapterService);
  });

  afterAll(async () => {
    await helper?.close();
    await moduleRef?.close();
  });

  it('places, fetches, lists, and cancels a real sandbox limit order', async () => {
    const config = helper.getConfig();
    const orderBook = await service.fetchOrderBook(
      config.exchangeId,
      config.symbol,
    );

    expect(Array.isArray(orderBook.bids)).toBe(true);
    expect(Array.isArray(orderBook.asks)).toBe(true);

    const clientOrderId = buildClientOrderId(
      `adapter-integration-${Date.now()}`,
      0,
    );
    const createdOrder = await helper.placeSafeCleanupAwareLimitOrder({
      side: 'buy',
      symbol: config.symbol,
      clientOrderId,
    });

    expect(createdOrder.id).toBeDefined();

    const fetchedOrder = await pollUntil(
      async () =>
        await service.fetchOrder(
          config.exchangeId,
          config.symbol,
          String(createdOrder.id),
        ),
      async (order) => String(order?.id || '') === String(createdOrder.id),
      {
        description: `sandbox order ${createdOrder.id} to be fetchable`,
      },
    );

    expect(String(fetchedOrder.id)).toBe(String(createdOrder.id));

    const openOrders = await pollUntil(
      async () =>
        await service.fetchOpenOrders(config.exchangeId, config.symbol),
      async (orders) =>
        orders.some((order) => String(order?.id) === String(createdOrder.id)),
      {
        description: `sandbox order ${createdOrder.id} to appear in open orders`,
      },
    );

    expect(
      openOrders.some((order) => String(order?.id) === String(createdOrder.id)),
    ).toBe(true);

    await service.cancelOrder(
      config.exchangeId,
      config.symbol,
      String(createdOrder.id),
    );

    const canceledState = await pollUntil(
      async () => {
        const orderResult = await Promise.allSettled([
          service.fetchOrder(
            config.exchangeId,
            config.symbol,
            String(createdOrder.id),
          ),
          service.fetchOpenOrders(config.exchangeId, config.symbol),
        ]);

        return {
          fetchedOrder:
            orderResult[0].status === 'fulfilled' ? orderResult[0].value : null,
          openOrders:
            orderResult[1].status === 'fulfilled' ? orderResult[1].value : [],
        };
      },
      async ({ fetchedOrder, openOrders }) => {
        const status = String(fetchedOrder?.status || '').toLowerCase();
        const stillOpen = openOrders.some(
          (order) => String(order?.id) === String(createdOrder.id),
        );

        return (
          status === 'canceled' ||
          status === 'cancelled' ||
          (!stillOpen && status !== 'open')
        );
      },
      {
        description: `sandbox order ${createdOrder.id} to cancel`,
      },
    );

    expect(
      canceledState.openOrders.some(
        (order) => String(order?.id) === String(createdOrder.id),
      ),
    ).toBe(false);
  });
});

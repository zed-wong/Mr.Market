/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import {
  buildSandboxClientOrderId,
  getSandboxIntegrationSkipReason,
  pollUntil,
  SandboxExchangeHelper,
} from '../../../../test/helpers/sandbox-exchange.helper';
import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { ExchangeConnectorAdapterService } from './exchange-connector-adapter.service';

const skipReason = getSandboxIntegrationSkipReason();

const LOG_PREFIX = '│';
// eslint-disable-next-line no-console
const log = (msg: string) => console.log(`  ${LOG_PREFIX} ${msg}`);

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Sandbox order REST lifecycle (integration)', () => {
  jest.setTimeout(240000);

  let helper: SandboxExchangeHelper;
  let moduleRef: TestingModule;
  let service: ExchangeConnectorAdapterService;

  beforeAll(async () => {
    log('🔌 Init exchange...');
    helper = new SandboxExchangeHelper();
    const exchange = await helper.init();
    const config = helper.getConfig();
    log(`✓ ${config.exchangeId} | ${config.symbol}`);

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
    log('✓ Ready');
  });

  afterAll(async () => {
    await helper?.close();
    await moduleRef?.close();
    log('✓ Done\n');
  });

  it('places, fetches, lists, and cancels a real sandbox limit order through the adapter', async () => {
    const config = helper.getConfig();

    log('📖 Fetch order book...');
    const orderBook = await service.fetchOrderBook(
      config.exchangeId,
      config.symbol,
    );
    log(`   ${orderBook.bids.length} bids / ${orderBook.asks.length} asks`);
    log(`   best: ${orderBook.bids[0]?.[0]} / ${orderBook.asks[0]?.[0]}`);

    expect(Array.isArray(orderBook.bids)).toBe(true);
    expect(Array.isArray(orderBook.asks)).toBe(true);

    const clientOrderId = buildSandboxClientOrderId('adapter');
    log('📝 Create buy order...');
    const createdOrder = await helper.placeSafeCleanupAwareLimitOrder({
      side: 'buy',
      symbol: config.symbol,
      clientOrderId,
    });
    log(`   id=${createdOrder.id} | ${createdOrder.amount}@${createdOrder.price}`);

    expect(createdOrder.id).toBeDefined();

    log('🔍 Fetch order...');
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
    log(`   ✓ id=${fetchedOrder.id} status=${fetchedOrder.status}`);

    expect(String(fetchedOrder.id)).toBe(String(createdOrder.id));

    log('📋 Fetch open orders...');
    const openOrders = await pollUntil(
      async () =>
        await service.fetchOpenOrders(config.exchangeId, config.symbol),
      async (orders) =>
        orders.some((order) => String(order?.id) === String(createdOrder.id)),
      {
        description: `sandbox order ${createdOrder.id} to appear in open orders`,
      },
    );
    log(`   ✓ ${openOrders.length} orders, ours in list`);

    expect(
      openOrders.some((order) => String(order?.id) === String(createdOrder.id)),
    ).toBe(true);

    log('❌ Cancel order...');
    await service.cancelOrder(
      config.exchangeId,
      config.symbol,
      String(createdOrder.id),
    );

    log('🔄 Verify cancellation...');
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
    const finalStatus = String(
      canceledState.fetchedOrder?.status || 'unknown',
    ).toLowerCase();
    log(`   ✓ status=${finalStatus}, removed from list`);

    expect(
      canceledState.openOrders.some(
        (order) => String(order?.id) === String(createdOrder.id),
      ),
    ).toBe(false);

    log('✅ Passed');
  });
});

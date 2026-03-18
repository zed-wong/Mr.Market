/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';

import {
  buildSafeSandboxLimitOrderRequest,
  buildSandboxClientOrderId,
  getSandboxIntegrationSkipReason,
  pollUntil,
  readSandboxExchangeTestConfig,
} from '../../helpers/sandbox-exchange.helper';
import { ExchangeInitService } from '../../../../src/modules/infrastructure/exchange-init/exchange-init.service';
import { ExchangeConnectorAdapterService } from '../../../../src/modules/market-making/execution/exchange-connector-adapter.service';

const skipReason = getSandboxIntegrationSkipReason();

const LOG_PREFIX = '|';
// eslint-disable-next-line no-console
const log = (msg: string) => console.log(`  ${LOG_PREFIX} ${msg}`);

const describeSandbox = skipReason ? describe.skip : describe;

describeSandbox('Sandbox order REST lifecycle (system)', () => {
  jest.setTimeout(240000);

  const exchangeApiKeyServiceMock = {
    readDecryptedAPIKeys: jest.fn().mockResolvedValue([]),
    readSupportedExchanges: jest.fn().mockResolvedValue([]),
    seedApiKeysFromEnv: jest.fn().mockResolvedValue(0),
  };

  const cacheManagerMock = {
    get: jest.fn(),
    set: jest.fn(),
  };

  let config: ReturnType<typeof readSandboxExchangeTestConfig>;
  let moduleRef: TestingModule;
  let exchangeInitService: ExchangeInitService;
  let service: ExchangeConnectorAdapterService;
  let exchange: any;
  const createdOrderIds: string[] = [];

  function supportsCapability(capability: string): boolean {
    if (typeof exchange?.[capability] !== 'function') {
      return false;
    }

    return exchange?.has?.[capability] !== false;
  }

  async function cancelCreatedOrders(): Promise<void> {
    if (!exchange) {
      return;
    }

    for (const exchangeOrderId of [...createdOrderIds].reverse()) {
      try {
        if (supportsCapability('fetchOrder')) {
          const order = await exchange.fetchOrder(
            exchangeOrderId,
            config.symbol,
          );
          const status = String(order?.status || '').toLowerCase();

          if (
            status === 'canceled' ||
            status === 'cancelled' ||
            status === 'closed'
          ) {
            continue;
          }
        }

        await exchange.cancelOrder(exchangeOrderId, config.symbol);
      } catch (error) {
        if (isIgnorableCleanupError(error)) {
          continue;
        }

        throw error;
      }
    }
  }

  beforeAll(async () => {
    config = readSandboxExchangeTestConfig();
    log('Init exchange through ExchangeInitService...');

    moduleRef = await Test.createTestingModule({
      providers: [
        ExchangeInitService,
        ExchangeConnectorAdapterService,
        {
          provide: CACHE_MANAGER,
          useValue: cacheManagerMock,
        },
        {
          provide: ExchangeApiKeyService,
          useValue: exchangeApiKeyServiceMock,
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

    exchangeInitService = moduleRef.get(ExchangeInitService);
    service = moduleRef.get(ExchangeConnectorAdapterService);

    exchange = await pollUntil(
      async () => {
        try {
          return exchangeInitService.getExchange(
            config.exchangeId,
            config.accountLabel,
          );
        } catch {
          return null;
        }
      },
      async (resolvedExchange) => Boolean(resolvedExchange),
      {
        description: `sandbox exchange ${config.exchangeId} to initialize`,
      },
    );

    expect(exchangeInitService.getExchange(config.exchangeId)).toBe(exchange);

    log(
      `${config.exchangeId} | ${config.symbol} | label=${config.accountLabel}`,
    );
    log('Ready');
  });

  afterAll(async () => {
    await cancelCreatedOrders();
    if (exchange && typeof exchange.close === 'function') {
      await exchange.close();
    }
    await moduleRef?.close();
    log('Done\n');
  });

  it('places, fetches, lists, and cancels a real sandbox limit order through the adapter', async () => {
    log('Fetch order book...');
    const orderBook = await service.fetchOrderBook(
      config.exchangeId,
      config.symbol,
    );

    log(`   ${orderBook.bids.length} bids / ${orderBook.asks.length} asks`);
    log(`   best: ${orderBook.bids[0]?.[0]} / ${orderBook.asks[0]?.[0]}`);

    expect(Array.isArray(orderBook.bids)).toBe(true);
    expect(Array.isArray(orderBook.asks)).toBe(true);

    const clientOrderId = buildSandboxClientOrderId('adapter');
    const supportsFetchOrder = supportsCapability('fetchOrder');
    const supportsFetchOpenOrders = supportsCapability('fetchOpenOrders');
    const orderRequest = await buildSafeSandboxLimitOrderRequest(exchange, {
      side: 'buy',
      symbol: config.symbol,
    });

    log('Create buy order...');
    const createdOrder = await service.placeLimitOrder(
      config.exchangeId,
      config.symbol,
      'buy',
      orderRequest.amount,
      orderRequest.price,
      clientOrderId,
    );

    createdOrderIds.push(String(createdOrder.id));

    log(
      `   id=${createdOrder.id} | ${createdOrder.amount}@${createdOrder.price}`,
    );

    expect(createdOrder.id).toBeDefined();

    if (supportsFetchOrder) {
      log('Fetch order...');
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

      log(`   id=${fetchedOrder.id} status=${fetchedOrder.status}`);

      expect(String(fetchedOrder.id)).toBe(String(createdOrder.id));
    } else {
      log('Fetch order skipped: exchange does not support fetchOrder()');
    }

    if (supportsFetchOpenOrders) {
      log('Fetch open orders...');
      const openOrders = await pollUntil(
        async () =>
          await service.fetchOpenOrders(config.exchangeId, config.symbol),
        async (orders) =>
          orders.some((order) => String(order?.id) === String(createdOrder.id)),
        {
          description: `sandbox order ${createdOrder.id} to appear in open orders`,
        },
      );

      log(`   ${openOrders.length} orders, ours in list`);

      expect(
        openOrders.some(
          (order) => String(order?.id) === String(createdOrder.id),
        ),
      ).toBe(true);
    } else {
      log(
        'Fetch open orders skipped: exchange does not support fetchOpenOrders()',
      );
    }

    log('Cancel order...');
    const cancelResult = await service.cancelOrder(
      config.exchangeId,
      config.symbol,
      String(createdOrder.id),
    );

    if (supportsFetchOrder || supportsFetchOpenOrders) {
      log('Verify cancellation...');
      const canceledState = await pollUntil(
        async () => {
          const orderResult = await Promise.allSettled([
            supportsFetchOrder
              ? service.fetchOrder(
                  config.exchangeId,
                  config.symbol,
                  String(createdOrder.id),
                )
              : Promise.resolve(null),
            supportsFetchOpenOrders
              ? service.fetchOpenOrders(config.exchangeId, config.symbol)
              : Promise.resolve([]),
          ]);

          return {
            fetchedOrder:
              orderResult[0].status === 'fulfilled'
                ? orderResult[0].value
                : null,
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
            (!supportsFetchOrder ||
              status === 'canceled' ||
              status === 'cancelled' ||
              status === 'closed') &&
            (!supportsFetchOpenOrders || !stillOpen)
          );
        },
        {
          description: `sandbox order ${createdOrder.id} to cancel cleanly`,
        },
      );

      log(
        `   status=${
          canceledState.fetchedOrder?.status || cancelResult?.status || 'n/a'
        }`,
      );
      expect(
        canceledState.openOrders.some(
          (order) => String(order?.id) === String(createdOrder.id),
        ),
      ).toBe(false);
    }

    expect(cancelResult).toBeDefined();
  });
});

function isIgnorableCleanupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');

  return (
    /order.*not found/i.test(message) ||
    /unknown order/i.test(message) ||
    /already closed/i.test(message) ||
    /already cancelled/i.test(message) ||
    /already canceled/i.test(message)
  );
}

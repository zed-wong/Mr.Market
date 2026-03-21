/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';

import { ExchangeInitService } from '../../../../src/modules/infrastructure/exchange-init/exchange-init.service';
import { ExchangeConnectorAdapterService } from '../../../../src/modules/market-making/execution/exchange-connector-adapter.service';
import {
  buildSafeSandboxLimitOrderRequest,
  buildSandboxClientOrderId,
} from '../../helpers/sandbox-exchange.helper';
import {
  getSystemSandboxSkipReason,
  pollUntil,
  readSystemSandboxConfig,
  waitForInitializedExchange,
} from '../../helpers/sandbox-system.helper';
import {
  createSystemTestLogger,
  logSystemSkip,
} from '../../helpers/system-test-log.helper';

const skipReason = getSystemSandboxSkipReason();
const log = createSystemTestLogger('sandbox-order-lifecycle');

if (skipReason) {
  logSystemSkip('sandbox order REST lifecycle suite', skipReason);
}

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

  let config: ReturnType<typeof readSystemSandboxConfig>;
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
    config = readSystemSandboxConfig();
    log.suite('initializing exchange through ExchangeInitService');

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

    exchange = await waitForInitializedExchange(
      exchangeInitService,
      config.exchangeId,
      config.accountLabel,
    );

    expect(exchangeInitService.getExchange(config.exchangeId)).toBe(exchange);

    log.result('exchange ready', {
      exchangeId: config.exchangeId,
      symbol: config.symbol,
      accountLabel: config.accountLabel,
    });
  });

  afterAll(async () => {
    await cancelCreatedOrders();
    if (exchange && typeof exchange.close === 'function') {
      await exchange.close();
    }
    await moduleRef?.close();
    log.suite('cleanup complete');
  });

  it('places, fetches, lists, and cancels a real sandbox limit order through the adapter', async () => {
    log.step('fetching order book');
    const orderBook = await service.fetchOrderBook(
      config.exchangeId,
      config.symbol,
    );

    log.result('order book fetched', {
      bidLevels: orderBook.bids.length,
      askLevels: orderBook.asks.length,
      bestBid: orderBook.bids[0]?.[0],
      bestAsk: orderBook.asks[0]?.[0],
    });

    expect(Array.isArray(orderBook.bids)).toBe(true);
    expect(Array.isArray(orderBook.asks)).toBe(true);

    const clientOrderId = buildSandboxClientOrderId('adapter');
    const supportsFetchOrder = supportsCapability('fetchOrder');
    const supportsFetchOpenOrders = supportsCapability('fetchOpenOrders');
    const orderRequest = await buildSafeSandboxLimitOrderRequest(exchange, {
      side: 'buy',
      symbol: config.symbol,
    });

    log.step('creating buy order');
    const createdOrder = await service.placeLimitOrder(
      config.exchangeId,
      config.symbol,
      'buy',
      orderRequest.amount,
      orderRequest.price,
      clientOrderId,
    );

    createdOrderIds.push(String(createdOrder.id));

    log.result('order created', {
      exchangeOrderId: createdOrder.id,
      amount: createdOrder.amount,
      price: createdOrder.price,
      clientOrderId,
    });

    expect(createdOrder.id).toBeDefined();

    if (supportsFetchOrder) {
      log.step('fetching created order');
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

      log.result('fetchOrder returned created order', {
        exchangeOrderId: fetchedOrder.id,
        status: fetchedOrder.status,
      });

      expect(String(fetchedOrder.id)).toBe(String(createdOrder.id));
    } else {
      log.check('fetchOrder skipped', {
        reason: 'exchange does not support fetchOrder()',
      });
    }

    if (supportsFetchOpenOrders) {
      log.step('fetching open orders');
      const openOrders = await pollUntil(
        async () =>
          await service.fetchOpenOrders(config.exchangeId, config.symbol),
        async (orders) =>
          orders.some((order) => String(order?.id) === String(createdOrder.id)),
        {
          description: `sandbox order ${createdOrder.id} to appear in open orders`,
        },
      );

      log.result('open orders fetched', {
        openOrderCount: openOrders.length,
        containsCreatedOrder: true,
      });

      expect(
        openOrders.some(
          (order) => String(order?.id) === String(createdOrder.id),
        ),
      ).toBe(true);
    } else {
      log.check('fetchOpenOrders skipped', {
        reason: 'exchange does not support fetchOpenOrders()',
      });
    }

    log.step('cancelling order');
    const cancelResult = await service.cancelOrder(
      config.exchangeId,
      config.symbol,
      String(createdOrder.id),
    );

    log.result('cancel request returned', {
      exchangeOrderId: createdOrder.id,
      status: cancelResult?.status,
    });

    if (supportsFetchOrder || supportsFetchOpenOrders) {
      log.step('verifying cancellation');
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

      log.result('cancellation verified', {
        exchangeOrderId: createdOrder.id,
        status:
          canceledState.fetchedOrder?.status || cancelResult?.status || 'n/a',
        openOrderCount: canceledState.openOrders.length,
      });
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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import type { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { ExchangeOrderMappingService } from 'src/modules/market-making/execution/exchange-order-mapping.service';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { PureMarketMakingStrategyController } from 'src/modules/market-making/strategy/controllers/pure-market-making-strategy.controller';
import { StrategyMarketDataProviderService } from 'src/modules/market-making/strategy/data/strategy-market-data-provider.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { QuoteExecutorManagerService } from 'src/modules/market-making/strategy/intent/quote-executor-manager.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from 'src/modules/market-making/trackers/exchange-order-tracker.service';

type InMemoryStrategyRepo = {
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
};

function createStrategyRepo(
  seeded: StrategyInstance[] = [],
): InMemoryStrategyRepo & { state: StrategyInstance[] } {
  const state = [...seeded];

  return {
    state,
    create: jest.fn((input) => input),
    find: jest.fn(async ({ where } = {} as any) => {
      if (!where) {
        return [...state];
      }

      return state.filter((item) =>
        Object.entries(where).every(([key, value]) => (item as any)[key] === value),
      );
    }),
    findOne: jest.fn(async ({ where } = {} as any) => {
      return (
        state.find((item) =>
          Object.entries(where || {}).every(
            ([key, value]) => (item as any)[key] === value,
          ),
        ) || null
      );
    }),
    save: jest.fn(async (input) => {
      state.push(input as StrategyInstance);

      return input;
    }),
    update: jest.fn(async (criteria, patch) => {
      for (const item of state) {
        if (
          Object.entries(criteria || {}).every(
            ([key, value]) => (item as any)[key] === value,
          )
        ) {
          Object.assign(item, patch);
        }
      }
    }),
  };
}

function createPureMmParams(orderId: string) {
  return {
    userId: 'system-user',
    clientId: orderId,
    marketMakingOrderId: orderId,
    pair: 'BTC/USDT',
    exchangeName: 'binance',
    bidSpread: 0.01,
    askSpread: 0.01,
    orderAmount: 1,
    orderRefreshTime: 1000,
    numberOfLayers: 1,
    priceSourceType: PriceSourceType.MID_PRICE,
    amountChangePerLayer: 0,
    amountChangeType: 'fixed' as const,
    hangingOrdersEnabled: true,
  };
}

describe('Pure market making safety gaps (mock system)', () => {
  let strategyRepo: ReturnType<typeof createStrategyRepo>;
  let exchangeOrderTrackerService: ExchangeOrderTrackerService;
  let executorRegistry: ExecutorRegistry;
  let strategyService: StrategyService;
  let exchangeConnectorAdapterService: {
    cancelOrder: jest.Mock;
    fetchBalance: jest.Mock;
    fetchOpenOrders: jest.Mock;
    fetchOrder: jest.Mock;
    loadTradingRules: jest.Mock;
  };
  let exchangeOrderMappingService: {
    findByClientOrderId: jest.Mock;
    findByExchangeOrderId: jest.Mock;
  };
  let strategyIntentStoreService: {
    cancelPendingIntents: jest.Mock;
  };
  let executorOrchestratorService: {
    dispatchActions: jest.Mock;
  };
  let strategyMarketDataProviderService: {
    getReferencePrice: jest.Mock;
  };

  beforeEach(() => {
    strategyRepo = createStrategyRepo();
    exchangeConnectorAdapterService = {
      cancelOrder: jest.fn().mockResolvedValue({ status: 'cancelled' }),
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 10, USDT: 100000 },
      }),
      fetchOpenOrders: jest.fn().mockResolvedValue([]),
      fetchOrder: jest.fn().mockResolvedValue(null),
      loadTradingRules: jest.fn().mockResolvedValue({
        amountMin: 0.001,
        amountStep: 0.001,
        costMin: 10,
        priceStep: 0.01,
        makerFee: 0.001,
      }),
    };
    exchangeOrderMappingService = {
      findByClientOrderId: jest.fn().mockResolvedValue(null),
      findByExchangeOrderId: jest.fn().mockResolvedValue(null),
    };
    strategyIntentStoreService = {
      cancelPendingIntents: jest.fn().mockResolvedValue(0),
    };
    executorOrchestratorService = {
      dispatchActions: jest.fn(async (_strategyKey: string, actions: any[]) =>
        actions.map((action) => ({
          ...action,
          status: action.status || 'NEW',
        })),
      ),
    };
    strategyMarketDataProviderService = {
      getReferencePrice: jest.fn().mockResolvedValue(100),
    };
    executorRegistry = new ExecutorRegistry();
    exchangeOrderTrackerService = new ExchangeOrderTrackerService();

    strategyService = new StrategyService(
      {
        getExchange: jest.fn().mockReturnValue({
          id: 'binance',
          fetchTicker: jest.fn().mockResolvedValue({ last: 100 }),
          markets: {
            'BTC/USDT': {
              maker: 0.001,
            },
          },
        }),
      } as any,
      strategyRepo as any,
      undefined,
      new QuoteExecutorManagerService(),
      exchangeOrderTrackerService,
      {
        getController: jest.fn((type: string) =>
          type === 'pureMarketMaking'
            ? new PureMarketMakingStrategyController()
            : undefined,
        ),
        listControllerTypes: jest.fn().mockReturnValue(['pureMarketMaking']),
      } as any,
      executorOrchestratorService as any,
      strategyMarketDataProviderService as unknown as StrategyMarketDataProviderService,
      executorRegistry,
      strategyIntentStoreService as any,
      undefined,
      undefined,
      { adjust: jest.fn().mockResolvedValue(undefined) } as unknown as BalanceLedgerService,
      exchangeConnectorAdapterService as any,
      exchangeOrderMappingService as unknown as ExchangeOrderMappingService,
    );
  });

  it('restores active quotes on startup, cancels orphan exchange orders, and avoids duplicate quotes on the next tick', async () => {
    const params = createPureMmParams('order-1');
    const strategy: StrategyInstance = {
      id: 1,
      strategyKey: 'order-1-pureMarketMaking',
      userId: params.userId,
      clientId: params.clientId,
      marketMakingOrderId: params.marketMakingOrderId,
      strategyType: 'pureMarketMaking',
      parameters: params,
      status: 'running',
      startPrice: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      contributions: [],
    };

    strategyRepo.state.push(strategy);
    const trackedBuy: TrackedOrder = {
      orderId: 'order-1',
      strategyKey: strategy.strategyKey,
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-buy',
      clientOrderId: 'mm-buy',
      side: 'buy',
      price: '99',
      qty: '1',
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    };
    const trackedSell: TrackedOrder = {
      ...trackedBuy,
      exchangeOrderId: 'ex-sell',
      clientOrderId: 'mm-sell',
      side: 'sell',
      price: '101',
    };

    exchangeOrderTrackerService.upsertOrder(trackedBuy);
    exchangeOrderTrackerService.upsertOrder(trackedSell);
    exchangeConnectorAdapterService.fetchOpenOrders.mockResolvedValue([
      {
        id: 'ex-buy',
        clientOrderId: 'mm-buy',
        status: 'open',
        side: 'buy',
        price: '99',
        amount: '1',
        filled: '0',
      },
      {
        id: 'ex-sell',
        clientOrderId: 'mm-sell',
        status: 'open',
        side: 'sell',
        price: '101',
        amount: '1',
        filled: '0',
      },
      {
        id: 'ex-orphan',
        clientOrderId: 'mm-orphan',
        status: 'open',
        side: 'sell',
        price: '102',
        amount: '1',
        filled: '0',
      },
    ]);
    exchangeOrderMappingService.findByClientOrderId.mockImplementation(
      async (clientOrderId: string) =>
        clientOrderId === 'mm-orphan' ? { orderId: 'order-1' } : null,
    );

    await strategyService.start();

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');

    expect(executor).toBeDefined();
    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-orphan',
    );

    executorOrchestratorService.dispatchActions.mockClear();
    await executor!.onTick(getRFC3339Timestamp());

    expect(executorOrchestratorService.dispatchActions).not.toHaveBeenCalled();
    expect(
      exchangeOrderTrackerService.getOpenOrders(strategy.strategyKey),
    ).toHaveLength(2);
  });

  it('cancels tracked exchange orders during shutdown and clears active executors', async () => {
    const params = createPureMmParams('order-2');

    await strategyService.executePureMarketMakingStrategy(params);
    exchangeOrderTrackerService.upsertOrder({
      orderId: 'order-2',
      strategyKey: 'order-2-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-2',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });

    await strategyService.onApplicationShutdown('SIGTERM');

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-2',
    );
    expect(
      executorRegistry.getExecutor('binance', 'BTC/USDT'),
    ).toBeUndefined();
  });

  it('pauses ticks while disconnected and resumes once connector health is restored', async () => {
    const params = {
      ...createPureMmParams('order-3'),
      hangingOrdersEnabled: false,
    };

    await strategyService.executePureMarketMakingStrategy(params);

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT');

    (strategyService as any).setConnectorHealthStatus('binance', 'DISCONNECTED');
    await executor!.onTick(getRFC3339Timestamp());

    expect(executorOrchestratorService.dispatchActions).not.toHaveBeenCalled();

    (strategyService as any).setConnectorHealthStatus('binance', 'CONNECTED');
    executor.getSession('order-3')!.nextRunAtMs = Date.now();
    await executor!.onTick(getRFC3339Timestamp());

    expect(executorOrchestratorService.dispatchActions).toHaveBeenCalled();
  });

  it('triggers the kill switch through the runtime tick and cancels managed orders', async () => {
    const params = {
      ...createPureMmParams('order-4'),
      killSwitchThreshold: 10,
    };

    await strategyService.executePureMarketMakingStrategy(params);
    exchangeOrderTrackerService.upsertOrder({
      orderId: 'order-4',
      strategyKey: 'order-4-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-4',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'open',
      createdAt: getRFC3339Timestamp(),
      updatedAt: getRFC3339Timestamp(),
    });

    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT')!;
    const session = executor.getSession('order-4')!;

    session.realizedPnlQuote = -20;
    session.tradedQuoteVolume = 100;

    await executor.onTick(getRFC3339Timestamp());

    expect(strategyRepo.update).toHaveBeenCalledWith(
      { strategyKey: 'order-4-pureMarketMaking' },
      expect.objectContaining({ status: 'stopped' }),
    );
    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-4',
    );
  });
});

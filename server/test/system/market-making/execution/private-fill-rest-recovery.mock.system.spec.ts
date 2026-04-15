/* eslint-disable @typescript-eslint/no-explicit-any */
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ExchangeOrderMappingService } from 'src/modules/market-making/execution/exchange-order-mapping.service';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import { StrategyIntentStoreService } from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { ExecutorOrchestratorService } from 'src/modules/market-making/strategy/intent/executor-orchestrator.service';
import { QuoteExecutorManagerService } from 'src/modules/market-making/strategy/intent/quote-executor-manager.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import {
  ExchangeOrderTrackerService,
  TrackedOrder,
} from 'src/modules/market-making/trackers/exchange-order-tracker.service';

function createParams(orderId: string) {
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
    filledOrderDelay: 5000,
  };
}

describe('Private fill REST recovery parity (mock system)', () => {
  let balanceLedgerService: {
    adjust: jest.Mock;
  };
  let exchangeConnectorAdapterService: {
    fetchOrder: jest.Mock;
  };
  let exchangeOrderTrackerService: ExchangeOrderTrackerService;
  let executorRegistry: ExecutorRegistry;
  let strategyService: StrategyService;

  beforeEach(async () => {
    balanceLedgerService = {
      adjust: jest.fn().mockResolvedValue(undefined),
    };
    exchangeConnectorAdapterService = {
      fetchOrder: jest.fn(),
    };
    executorRegistry = new ExecutorRegistry();
    exchangeOrderTrackerService = new ExchangeOrderTrackerService(
      undefined as any,
      exchangeConnectorAdapterService as any,
      executorRegistry,
    );

    strategyService = new StrategyService(
      {
        getExchange: jest.fn().mockReturnValue({
          id: 'binance',
          markets: { 'BTC/USDT': { maker: 0.001 } },
          fetchTicker: jest.fn().mockResolvedValue({ last: 100 }),
        }),
      } as any,
      {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
        create: jest.fn((input) => input),
        update: jest.fn(),
      } as any,
      undefined,
      undefined,
      new QuoteExecutorManagerService(),
      exchangeOrderTrackerService,
      {
        getController: jest.fn().mockReturnValue(undefined),
        listControllerTypes: jest.fn().mockReturnValue([]),
      } as any,
      {
        dispatchActions: jest.fn(),
      } as unknown as ExecutorOrchestratorService,
      undefined as any,
      executorRegistry,
      {
        cancelPendingIntents: jest.fn(),
      } as unknown as StrategyIntentStoreService,
      undefined,
      undefined,
      undefined,
      undefined,
      balanceLedgerService as unknown as BalanceLedgerService,
      exchangeConnectorAdapterService as any,
      {
        findByClientOrderId: jest.fn().mockResolvedValue(null),
        findByExchangeOrderId: jest.fn().mockResolvedValue(null),
      } as unknown as ExchangeOrderMappingService,
    );

    await (strategyService as any).upsertSession(
      'order-1-pureMarketMaking',
      'pureMarketMaking',
      'system-user',
      'order-1',
      1000,
      createParams('order-1'),
      'order-1',
    );
  });

  function seedTrackedOrder(cumulativeFilledQty = '0'): TrackedOrder {
    const trackedOrder: TrackedOrder = {
      orderId: 'order-1',
      strategyKey: 'order-1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'mm-1',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty,
      status: cumulativeFilledQty === '0' ? 'open' : 'partially_filled',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    };

    exchangeOrderTrackerService.upsertOrder(trackedOrder);

    return trackedOrder;
  }

  it('recovers a missed WebSocket fill via REST reconciliation and updates the fill ledger path', async () => {
    seedTrackedOrder('0');
    exchangeConnectorAdapterService.fetchOrder.mockResolvedValue({
      id: 'ex-1',
      status: 'partially_filled',
      filled: '0.5',
    });

    await exchangeOrderTrackerService.onTick('2026-04-09T00:00:01.000Z');

    const trackedOrder = exchangeOrderTrackerService.getByExchangeOrderId(
      'binance',
      'ex-1',
    );
    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT')!;
    const session = executor.getSession('order-1')!;

    expect(balanceLedgerService.adjust).toHaveBeenCalledTimes(2);
    expect(trackedOrder?.cumulativeFilledQty).toBe('0.5');
    expect(session.lastFillTimestamp).toBeDefined();
  });

  it('deduplicates REST reconciliation when WebSocket already advanced the cumulative fill', async () => {
    const trackedOrder = seedTrackedOrder('0');
    const executor = executorRegistry.getExecutor('binance', 'BTC/USDT')!;

    await executor.onFill({
      orderId: 'order-1',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'mm-1',
      side: 'buy',
      price: '100',
      qty: '0.5',
      cumulativeQty: '0.5',
      receivedAt: '2026-04-09T00:00:01.000Z',
    });
    exchangeOrderTrackerService.upsertOrder({
      ...trackedOrder,
      cumulativeFilledQty: '0.5',
      status: 'partially_filled',
      updatedAt: '2026-04-09T00:00:01.000Z',
    });
    balanceLedgerService.adjust.mockClear();
    exchangeConnectorAdapterService.fetchOrder.mockResolvedValue({
      id: 'ex-1',
      status: 'partially_filled',
      filled: '0.5',
    });

    await exchangeOrderTrackerService.onTick('2026-04-09T00:00:02.000Z');

    expect(balanceLedgerService.adjust).not.toHaveBeenCalled();
  });
});

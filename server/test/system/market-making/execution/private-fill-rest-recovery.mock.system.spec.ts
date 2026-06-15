/* eslint-disable @typescript-eslint/no-explicit-any */
import BigNumber from 'bignumber.js';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
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
    debitFee: jest.Mock;
  };
  let exchangeConnectorAdapterService: {
    fetchOrder: jest.Mock;
  };
  let exchangeOrderTrackerService: ExchangeOrderTrackerService;
  let executorRegistry: ExecutorRegistry;
  const settledCumulativeByOrder = new Map<string, BigNumber>();

  beforeEach(async () => {
    balanceLedgerService = {
      adjust: jest.fn().mockResolvedValue(undefined),
      debitFee: jest.fn().mockResolvedValue(undefined),
    };
    exchangeConnectorAdapterService = {
      fetchOrder: jest.fn(),
    };
    executorRegistry = new ExecutorRegistry();
    settledCumulativeByOrder.clear();
    exchangeOrderTrackerService = new ExchangeOrderTrackerService(
      exchangeConnectorAdapterService as any,
      executorRegistry,
    );
    await executorRegistry
      .getOrCreateExecutor('binance', 'BTC/USDT', {
        onFill: async (session, fill) => {
          const cumulative = new BigNumber(fill.cumulativeQty || fill.qty || 0);
          const key = fill.exchangeOrderId || fill.clientOrderId || '';
          const previous = settledCumulativeByOrder.get(key) || new BigNumber(0);

          if (key && cumulative.lte(previous)) {
            return;
          }

          if (key) {
            settledCumulativeByOrder.set(key, cumulative);
          }

          session.lastFillTimestamp = Date.parse(
            fill.receivedAt || new Date().toISOString(),
          );
          await balanceLedgerService.adjust();
          await balanceLedgerService.adjust();
        },
      })
      .addOrder('order-1', 'system-user', {
        strategyKey: 'order-1-pureMarketMaking',
        strategyType: 'pureMarketMaking',
        clientId: 'order-1',
        cadenceMs: 1000,
        params: createParams('order-1'),
        marketMakingOrderId: 'order-1',
      });
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

    await exchangeOrderTrackerService.pollDueOrders('2026-04-09T00:00:01.000Z');

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

    await exchangeOrderTrackerService.pollDueOrders('2026-04-09T00:00:02.000Z');

    expect(balanceLedgerService.adjust).not.toHaveBeenCalled();
  });
});

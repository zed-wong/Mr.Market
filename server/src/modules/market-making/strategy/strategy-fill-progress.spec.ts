import { FillSettlementService } from './settlement/fill-settlement.service';

describe('StrategyService fill progress normalization', () => {
  const service = new FillSettlementService();

  it('converts cumulative fill events into unsettled deltas', () => {
    const result = (service as any).buildIncrementalSettlementFill(
      {
        exchange: 'mexc',
        accountLabel: '2',
        exchangeOrderId: 'ex-1',
        orderId: 'order-1',
        strategyKey: 'strategy-1',
        pair: 'XIN/USDT',
        side: 'sell',
        price: '56',
        qty: '0.1',
        cumulativeFilledQty: '0.05',
        settledFilledQty: '0.031',
        status: 'partially_filled',
        createdAt: '2026-05-28T10:00:00.000Z',
        updatedAt: '2026-05-28T10:00:01.000Z',
      },
      {
        exchangeOrderId: 'ex-1',
        side: 'sell',
        price: '56',
        qty: '0.05',
        cumulativeQty: '0.05',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        qty: '0.019',
        cumulativeQty: '0.05',
      }),
    );
  });

  it('ignores repeated fill events at or below settled progress', () => {
    const result = (service as any).buildIncrementalSettlementFill(
      {
        exchange: 'mexc',
        exchangeOrderId: 'ex-1',
        orderId: 'order-1',
        strategyKey: 'strategy-1',
        pair: 'XIN/USDT',
        side: 'sell',
        price: '56',
        qty: '0.1',
        cumulativeFilledQty: '0.031',
        settledFilledQty: '0.031',
        status: 'filled',
        createdAt: '2026-05-28T10:00:00.000Z',
        updatedAt: '2026-05-28T10:00:01.000Z',
      },
      {
        exchangeOrderId: 'ex-1',
        side: 'sell',
        price: '56',
        qty: '0.031',
        cumulativeQty: '0.031',
      },
    );

    expect(result).toBeNull();
  });

  it('caps fabricated cumulative progress to the tracked exchange cumulative', () => {
    const result = (service as any).buildIncrementalSettlementFill(
      {
        exchange: 'mexc',
        exchangeOrderId: 'ex-1',
        orderId: 'order-1',
        strategyKey: 'strategy-1',
        pair: 'XIN/USDT',
        side: 'sell',
        price: '56.14',
        qty: '0.1',
        cumulativeFilledQty: '0.031',
        settledFilledQty: '0',
        status: 'filled',
        createdAt: '2026-05-28T10:00:00.000Z',
        updatedAt: '2026-05-28T10:00:01.000Z',
      },
      {
        exchangeOrderId: 'ex-1',
        side: 'sell',
        price: '56.14',
        qty: '0.031',
        cumulativeQty: '0.062',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        qty: '0.031',
        cumulativeQty: '0.031',
      }),
    );
  });
});

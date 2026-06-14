import { NotFoundException } from '@nestjs/common';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';

import { PerformanceService } from './performance.service';

const createRepository = <T extends object>(rows: T[] = []) => ({
  create: jest.fn((row: Partial<T>) => row as T),
  save: jest.fn(async (row: T) => row),
  find: jest.fn(async () => rows),
  findOne: jest.fn(async (options?: { where?: Partial<T> }) => {
    const where = options?.where || {};

    return (
      rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      ) || null
    );
  }),
});

const createOrder = (
  overrides: Partial<MarketMakingOrder> = {},
): MarketMakingOrder =>
  ({
    orderId: 'order-1',
    userId: 'user-1',
    pair: 'BTC/USDT',
    exchangeName: 'binance',
    source: 'payment_flow',
    bidSpread: '0.01',
    askSpread: '0.01',
    orderAmount: '1',
    orderRefreshTime: '60',
    numberOfLayers: '1',
    priceSourceType: 'exchange' as never,
    amountChangePerLayer: '0',
    amountChangeType: 'fixed',
    ceilingPrice: '',
    floorPrice: '',
    state: 'running',
    createdAt: '2026-05-31T00:00:00.000Z',
    rewardAddress: '',
    ...overrides,
  } as MarketMakingOrder);

const entry = (overrides: Partial<LedgerEntry>): LedgerEntry =>
  ({
    entryId: overrides.entryId || 'entry',
    orderId: 'order-1',
    userId: 'user-1',
    assetId: 'USDT',
    amount: '0',
    type: 'fill_settle',
    idempotencyKey: 'key',
    idempotencyContentHash: 'hash',
    createdAt: '2026-05-31T00:00:00.000Z',
    ...overrides,
  } as LedgerEntry);

const fill = (
  id: string,
  side: 'buy' | 'sell',
  qty: string,
  price: string,
  createdAt: string,
  fee?: { assetId: string; amount: string },
): LedgerEntry[] => {
  const baseDelta = side === 'buy' ? qty : `-${qty}`;
  const quoteAmount = String(Number(qty) * Number(price));
  const quoteDelta = side === 'buy' ? `-${quoteAmount}` : quoteAmount;
  const key = `mm-fill:strategy-1:exchange-order:${side}:${id}`;
  const entries = [
    entry({
      entryId: `${id}-base`,
      assetId: 'BTC',
      amount: baseDelta,
      idempotencyKey: `${key}:base`,
      createdAt,
    }),
    entry({
      entryId: `${id}-quote`,
      assetId: 'USDT',
      amount: quoteDelta,
      idempotencyKey: `${key}:quote`,
      createdAt,
    }),
  ];

  if (fee) {
    entries.push(
      entry({
        entryId: `${id}-fee`,
        assetId: fee.assetId,
        amount: `-${fee.amount}`,
        type: 'fee_debit',
        idempotencyKey: `${key}:fee:${fee.assetId}`,
        createdAt,
      }),
    );
  }

  return entries;
};

const buildService = (
  entries: LedgerEntry[],
  order: MarketMakingOrder | null = createOrder(),
) => {
  const sortedEntries = [...entries].sort((a, b) => {
    const createdAt = a.createdAt.localeCompare(b.createdAt);

    if (createdAt !== 0) {
      return createdAt;
    }

    return a.entryId.localeCompare(b.entryId);
  });
  const balanceLedgerService = {
    findByOrderId: jest.fn(async () => sortedEntries),
    findEntriesByUserOrderId: jest.fn(async () => sortedEntries),
  };
  const service = new PerformanceService(
    createRepository([]) as never,
    createRepository(order ? [order] : []) as never,
    balanceLedgerService as never,
  );

  return { service, balanceLedgerService };
};

describe('PerformanceService order performance', () => {
  it('replays average-cost realized PnL and quote fees', async () => {
    const { service } = buildService([
      ...fill('1', 'buy', '1', '100', '2026-05-31T00:00:00.000Z'),
      ...fill('2', 'sell', '1', '110', '2026-05-31T00:01:00.000Z', {
        assetId: 'USDT',
        amount: '1',
      }),
    ]);

    const result = await service.getOrderPerformance('order-1');

    expect(result.summary.realizedPnlQuote).toBe('10');
    expect(result.summary.feesQuote).toBe('1');
    expect(result.summary.netPnlQuote).toBe('9');
    expect(result.summary.tradedQuoteVolume).toBe('210');
    expect(result.summary.fillCount).toBe(2);
    expect(result.summary.inventoryBaseQty).toBe('0');
    expect(result.summary.inventoryCostQuote).toBe('0');
    expect(result.summary.inventoryAverageCostQuote).toBeNull();
    expect(result.series.at(-1)).toMatchObject({ realized: '10', net: '9' });
  });

  it('handles partial closes using existing session PnL semantics', async () => {
    const { service } = buildService([
      ...fill('1', 'buy', '2', '100', '2026-05-31T00:00:00.000Z'),
      ...fill('2', 'sell', '1', '110', '2026-05-31T00:01:00.000Z'),
    ]);

    const result = await service.getOrderPerformance('order-1');

    expect(result.summary.realizedPnlQuote).toBe('10');
    expect(result.summary.inventoryBaseQty).toBe('1');
    expect(result.summary.inventoryCostQuote).toBe('100');
    expect(result.summary.inventoryAverageCostQuote).toBe('100');
    expect(result.series.at(-1)?.realized).toBe('10');
  });

  it('converts base fees at the fill price', async () => {
    const { service } = buildService([
      ...fill('1', 'buy', '1', '100', '2026-05-31T00:00:00.000Z', {
        assetId: 'BTC',
        amount: '0.01',
      }),
    ]);

    const result = await service.getOrderPerformance('order-1');

    expect(result.summary.feesQuote).toBe('1');
    expect(result.summary.netPnlQuote).toBe('-1');
  });

  it('returns third-asset fees separately and excludes them from quote net', async () => {
    const { service } = buildService([
      ...fill('1', 'buy', '1', '100', '2026-05-31T00:00:00.000Z', {
        assetId: 'BNB',
        amount: '0.2',
      }),
    ]);

    const result = await service.getOrderPerformance('order-1');

    expect(result.summary.feesQuote).toBe('0');
    expect(result.summary.netPnlQuote).toBe('0');
    expect(result.summary.otherFees).toEqual([
      { assetId: 'BNB', amount: '0.2' },
    ]);
  });

  it('uses entryId as a deterministic tie-breaker for same timestamp fills', async () => {
    const { service } = buildService([
      ...fill('2', 'sell', '1', '110', '2026-05-31T00:00:00.000Z'),
      ...fill('1', 'buy', '1', '100', '2026-05-31T00:00:00.000Z'),
    ]);

    const result = await service.getOrderPerformance('order-1');

    expect(result.summary.realizedPnlQuote).toBe('10');
  });

  it('aggregates ledger entries by user order id across dual-account scopes', async () => {
    const { service, balanceLedgerService } = buildService([
      ...fill('1', 'buy', '1', '100', '2026-05-31T00:00:00.000Z').map(
        (ledgerEntry) =>
          entry({
            ...ledgerEntry,
            orderId: 'order-1:maker',
            userOrderId: 'order-1',
            accountLabel: 'maker',
          }),
      ),
      ...fill('2', 'sell', '1', '110', '2026-05-31T00:01:00.000Z').map(
        (ledgerEntry) =>
          entry({
            ...ledgerEntry,
            orderId: 'order-1:taker',
            userOrderId: 'order-1',
            accountLabel: 'taker',
          }),
      ),
    ]);

    const result = await service.getOrderPerformance('order-1');

    expect(balanceLedgerService.findEntriesByUserOrderId).toHaveBeenCalledWith(
      'order-1',
    );
    expect(balanceLedgerService.findByOrderId).not.toHaveBeenCalled();
    expect(result.summary.realizedPnlQuote).toBe('10');
    expect(result.summary.fillCount).toBe(2);
  });

  it('returns zero performance for orders without fill ledger entries', async () => {
    const { service } = buildService([]);

    const result = await service.getOrderPerformance('order-1');

    expect(result.series).toEqual([]);
    expect(result.summary).toMatchObject({
      realizedPnlQuote: '0',
      feesQuote: '0',
      netPnlQuote: '0',
      tradedQuoteVolume: '0',
      effectiveSpreadBps: null,
      fillCount: 0,
      otherFees: [],
    });
  });

  it('reports stored realized PnL reconciliation', async () => {
    const { service } = buildService(
      [
        ...fill('1', 'buy', '1', '100', '2026-05-31T00:00:00.000Z'),
        ...fill('2', 'sell', '1', '110', '2026-05-31T00:01:00.000Z'),
      ],
      createOrder({
        strategySnapshot: {
          strategyDefinitionId: 'strategy-1',
          definitionKey: 'pure-mm',
          definitionName: 'Pure MM',
          controllerType: 'pureMarketMaking',
          resolvedAt: '2026-05-31T00:02:00.000Z',
          resolvedConfig: { realizedPnlQuote: '10' },
        },
      }),
    );

    const result = await service.getOrderPerformance('order-1');

    expect(result.reconciliation).toEqual({
      realizedPnlMatchesStored: true,
      storedRealizedPnlQuote: '10',
    });
  });

  it('throws when the order does not exist', async () => {
    const { service } = buildService([], null);

    await expect(service.getOrderPerformance('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});

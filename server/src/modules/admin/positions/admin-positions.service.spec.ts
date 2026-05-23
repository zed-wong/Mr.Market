import { BadRequestException } from '@nestjs/common';

import { AdminPositionsService } from './admin-positions.service';

const ts = (minute: number) =>
  `2026-05-23T00:${String(minute).padStart(2, '0')}:00.000Z`;

function createQueryBuilder(
  rows: Array<Record<string, any>>,
  total = rows.length,
) {
  const builder = {
    clauses: [] as Array<{ sql: string; params?: Record<string, unknown> }>,
    orderBys: [] as Array<{ field: string; direction: 'ASC' | 'DESC' }>,
    takeValue: undefined as number | undefined,
    skipValue: undefined as number | undefined,
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
      builder.clauses.push({ sql, params });
      return builder;
    }),
    orderBy: jest.fn((field: string, direction: 'ASC' | 'DESC') => {
      builder.orderBys.push({ field, direction });
      return builder;
    }),
    addOrderBy: jest.fn((field: string, direction: 'ASC' | 'DESC') => {
      builder.orderBys.push({ field, direction });
      return builder;
    }),
    take: jest.fn((value: number) => {
      builder.takeValue = value;
      return builder;
    }),
    skip: jest.fn((value: number) => {
      builder.skipValue = value;
      return builder;
    }),
    getManyAndCount: jest.fn(async () => [rows, total]),
  };

  return builder;
}

describe('AdminPositionsService', () => {
  function buildService(
    rows: Array<Record<string, any>> = [
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'btc',
        available: '0.25',
        locked: '0.75',
        total: '1',
        initialDeposit: '1.5',
        realizedDelta: '-0.5',
        feePaid: '0.01',
        updatedAt: ts(4),
      },
    ],
    total = rows.length,
  ) {
    const queryBuilder = createQueryBuilder(rows, total);
    const balances = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const trackedOrders = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => [
          {
            orderId: 'order-1',
            strategyKey: 'strategy-btc',
            exchange: 'binance',
            accountLabel: 'maker',
            pair: 'BTC/USDT',
            status: 'open',
            updatedAt: ts(5),
          },
        ]),
      })),
      find: jest.fn(async () => [
        {
          orderId: 'order-1',
          strategyKey: 'strategy-btc',
          exchange: 'binance',
          accountLabel: 'maker',
          pair: 'BTC/USDT',
          status: 'open',
          updatedAt: ts(5),
        },
      ]),
    };
    const strategies = {
      find: jest.fn(async () => [
        {
          strategyKey: 'strategy-btc',
          strategyType: 'pmm',
          marketMakingOrderId: 'order-1',
          status: 'running',
          updatedAt: ts(6),
        },
      ]),
    };

    return {
      service: new AdminPositionsService(
        balances as any,
        trackedOrders as any,
        strategies as any,
      ),
      balances,
      trackedOrders,
      strategies,
      queryBuilder,
    };
  }

  it('returns bounded order-scoped balances with unavailable PnL metrics', async () => {
    const { service, queryBuilder, trackedOrders } = buildService(undefined, 36);

    const result = await service.listPositions({});

    expect(queryBuilder.take).toHaveBeenCalledWith(25);
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'order-1:btc',
      orderId: 'order-1',
      asset: 'btc',
      assetId: 'btc',
      exchange: 'binance',
      accountLabel: 'maker',
      pair: 'BTC/USDT',
      strategyKey: 'strategy-btc',
      strategyType: 'pmm',
      strategyStatus: 'running',
      available: '0.25',
      locked: '0.75',
      total: '1',
      initialDeposit: '1.5',
      realizedDelta: '-0.5',
      feePaid: '0.01',
      avgCost: null,
      realizedPnl: null,
      unrealizedPnl: null,
      markPrice: null,
      portfolioPercent: null,
      pnl: {
        averageCost: null,
        realized: null,
        unrealized: null,
        markPrice: null,
        portfolioPercent: null,
      },
      dataSources: ['ledger_order_balance'],
    });
    expect(result.items[0].pnl.unavailableReason).toContain('unavailable');
    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 25,
      total: 36,
      totalPages: 2,
      hasNext: true,
      hasPrevious: false,
    });
    expect(JSON.stringify(result)).not.toContain('user-1');
    expect(trackedOrders.find).toHaveBeenCalledTimes(1);
  });

  it('applies asset, exchange, query, limit, and page filters safely', async () => {
    const { service, queryBuilder } = buildService();

    await service.listPositions({
      asset: 'BTC',
      exchange: 'binance',
      query: 'order_%',
      limit: '50',
      page: '2',
    });

    expect(queryBuilder.take).toHaveBeenCalledWith(50);
    expect(queryBuilder.skip).toHaveBeenCalledWith(50);
    expect(queryBuilder.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { asset: 'btc' } }),
        expect.objectContaining({ params: { orderIds: ['order-1'] } }),
        expect.objectContaining({ params: { query: '%order\\_\\%%' } }),
      ]),
    );
  });

  it('clamps excessive limits to the maximum bound', async () => {
    const { service, queryBuilder } = buildService();

    const result = await service.listPositions({ limit: '10000' });

    expect(queryBuilder.take).toHaveBeenCalledWith(100);
    expect(result.pagination.limit).toBe(100);
    expect(result.limits.maxLimit).toBe(100);
  });

  it.each([
    ['limit', { limit: 'zero' }],
    ['page', { page: '0' }],
    ['query', { query: 'x'.repeat(101) }],
    ['asset', { asset: 'x'.repeat(65) }],
    ['exchange', { exchange: '../binance' }],
  ])(
    'rejects invalid %s filters without querying balances',
    async (_label, query) => {
      const { service, queryBuilder } = buildService();

      await expect(service.listPositions(query)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
    },
  );

  it('returns an empty bounded page when an exchange has no tracked orders', async () => {
    const { service, queryBuilder, trackedOrders } = buildService();
    trackedOrders.createQueryBuilder.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    });

    const result = await service.listPositions({ exchange: 'kraken' });

    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
  });
});

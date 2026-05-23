import { BadRequestException } from '@nestjs/common';

import { AdminOrdersService } from './admin-orders.service';

const ts = (minute: number) =>
  `2026-05-23T00:${String(minute).padStart(2, '0')}:00.000Z`;

function createQueryBuilder(rows: Array<Record<string, any>>, total = rows.length) {
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

describe('AdminOrdersService', () => {
  function buildService(
    rows: Array<Record<string, any>> = [
      {
        trackingKey: 'track-1',
        orderId: 'order-1',
        strategyKey: 'strategy-btc',
        exchange: 'binance',
        accountLabel: 'maker',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-1',
        clientOrderId: 'client-1',
        slotKey: 'slot-a',
        role: 'maker',
        side: 'buy',
        price: '10',
        qty: '2',
        cumulativeFilledQty: '0.5',
        status: 'open',
        createdAt: ts(1),
        updatedAt: ts(2),
      },
    ],
    total = rows.length,
  ) {
    const queryBuilder = createQueryBuilder(rows, total);
    const trackedOrders = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const executions = {
      find: jest.fn(async () => [
        {
          id: 'exec-1',
          orderId: 'order-1',
          side: 'buy',
          amount: '0.5',
          price: '10',
          status: 'settled',
          strategyType: 'market-making',
          executedAt: ts(3),
          metadata: { private: 'must-not-leak' },
        },
      ]),
    };

    return {
      service: new AdminOrdersService(trackedOrders as any, executions as any),
      trackedOrders,
      executions,
      queryBuilder,
    };
  }

  it('returns bounded paginated tracked orders with execution summaries', async () => {
    const { service, queryBuilder, executions } = buildService(undefined, 52);

    const result = await service.listOrders({});

    expect(queryBuilder.take).toHaveBeenCalledWith(25);
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      orderId: 'order-1',
      trackingKey: 'track-1',
      symbol: 'BTC/USDT',
      pair: 'BTC/USDT',
      side: 'buy',
      type: 'maker',
      quantity: '2',
      filledQuantity: '0.5',
      price: '10',
      status: 'open',
      exchange: 'binance',
      strategyKey: 'strategy-btc',
      fillPercent: '25',
      executions: {
        count: 1,
        lastExecutedAt: ts(3),
        statuses: ['settled'],
        strategyTypes: ['market-making'],
      },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 25,
      total: 52,
      totalPages: 3,
      hasNext: true,
      hasPrevious: false,
    });
    expect(executions.find).toHaveBeenCalledTimes(1);
  });

  it('applies whitelisted status, side, query, limit, and page filters safely', async () => {
    const { service, queryBuilder } = buildService();

    await service.listOrders({
      status: 'open',
      side: 'buy',
      query: 'BTC_%',
      limit: '50',
      page: '2',
    });

    expect(queryBuilder.take).toHaveBeenCalledWith(50);
    expect(queryBuilder.skip).toHaveBeenCalledWith(50);
    expect(queryBuilder.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { status: 'open' } }),
        expect.objectContaining({ params: { side: 'buy' } }),
        expect.objectContaining({ params: { query: '%btc\\_\\%%' } }),
      ]),
    );
  });

  it('clamps excessive limits to the maximum bound', async () => {
    const { service, queryBuilder } = buildService();

    const result = await service.listOrders({ limit: '10000' });

    expect(queryBuilder.take).toHaveBeenCalledWith(100);
    expect(result.pagination.limit).toBe(100);
    expect(result.limits.maxLimit).toBe(100);
  });

  it.each([
    ['status', { status: 'unknown' }],
    ['side', { side: 'hold' }],
    ['limit', { limit: 'zero' }],
    ['page', { page: '0' }],
    ['query', { query: 'x'.repeat(101) }],
  ])('rejects invalid %s filters without querying orders', async (_label, query) => {
    const { service, queryBuilder } = buildService();

    await expect(service.listOrders(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
  });
});

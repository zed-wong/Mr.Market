import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { Web3MarketMakingService } from './web3-market-making.service';

const createRepository = <T extends object>(rows: T[] = []) => ({
  find: jest.fn(async (options?: { where?: Partial<T> | Partial<T>[] }) => {
    if (!options?.where) {
      return rows;
    }

    const filters = Array.isArray(options.where)
      ? options.where
      : [options.where];

    return rows.filter((row) =>
      filters.some((filter) =>
        Object.entries(filter).every(([key, value]) => {
          if (
            value &&
            typeof value === 'object' &&
            '_value' in (value as Record<string, unknown>)
          ) {
            return (value as { _value: unknown[] })._value.includes(row[key]);
          }

          return row[key] === value;
        }),
      ),
    );
  }),
  findOne: jest.fn(async (options?: { where?: Partial<T> }) => {
    const where = options?.where || {};

    return (
      rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      ) || null
    );
  }),
  findOneBy: jest.fn(async (where: Partial<T>) => {
    return (
      rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      ) || null
    );
  }),
  create: jest.fn((row: Partial<T>) => row as T),
  save: jest.fn(async (row: T) => {
    const primaryKey = ['eventId', 'orderId', 'id'].find(
      (key) => row[key] !== undefined,
    );

    if (primaryKey) {
      const index = rows.findIndex(
        (candidate) => candidate[primaryKey] === row[primaryKey],
      );

      if (index >= 0) {
        rows[index] = { ...rows[index], ...row };
      } else {
        rows.push(row);
      }
    }

    return row;
  }),
  update: jest.fn(async (where: Partial<T>, update: Partial<T>) => {
    let affected = 0;

    rows.forEach((row) => {
      const matches = Object.entries(where).every(
        ([key, value]) => row[key] === value,
      );

      if (matches) {
        Object.assign(row, update);
        affected += 1;
      }
    });

    return { affected };
  }),
  delete: jest.fn(async (where: Partial<T>) => {
    let affected = 0;

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const matches = Object.entries(where).every(
        ([key, value]) => rows[index][key] === value,
      );

      if (matches) {
        rows.splice(index, 1);
        affected += 1;
      }
    }

    return { affected };
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
    strategyDefinitionId: 'strategy-1',
    strategySnapshot: {
      strategyDefinitionId: 'strategy-1',
      definitionKey: 'pure-mm',
      definitionName: 'Pure MM',
      controllerType: 'pureMarketMaking',
      resolvedConfig: { orderAmount: '1', bidSpread: 0.001 },
      resolvedAt: '2026-05-24T00:00:00.000Z',
    },
    source: 'payment_flow',
    bidSpread: '0.001',
    askSpread: '0.001',
    orderAmount: '1',
    orderRefreshTime: '60000',
    numberOfLayers: '1',
    priceSourceType: PriceSourceType.MID_PRICE,
    amountChangePerLayer: '0',
    amountChangeType: 'fixed',
    ceilingPrice: '',
    floorPrice: '',
    state: 'created',
    createdAt: '2026-05-24T00:00:00.000Z',
    rewardAddress: '',
    ...overrides,
  } as MarketMakingOrder);

describe('Web3MarketMakingService', () => {
  const buildService = (params?: {
    orders?: MarketMakingOrder[];
    balances?: MarketMakingOrderBalance[];
    pausedReservations?: boolean;
    lifecycleEvents?: object[];
  }) => {
    const orders = params?.orders || [createOrder()];
    const balances =
      params?.balances ||
      ([
        {
          orderId: 'order-1',
          userId: 'user-1',
          assetId: 'asset-usdt',
          available: '100',
          locked: '0',
          total: '100',
          initialDeposit: '100',
          realizedDelta: '5',
          feePaid: '1',
          updatedAt: '2026-05-24T00:00:00.000Z',
        },
      ] as MarketMakingOrderBalance[]);
    const userOrdersService = {
      findMarketMakingByUserId: jest.fn(async (userId: string) =>
        orders.filter((order) => order.userId === userId),
      ),
      findOwnedMarketMakingByOrderId: jest.fn(
        async (userId: string, orderId: string) => {
          const order = orders.find(
            (candidate) =>
              candidate.userId === userId &&
              candidate.orderId === orderId &&
              candidate.source !== 'admin_direct',
          );

          if (!order) {
            throw new NotFoundException('Market making order not found');
          }

          return order;
        },
      ),
      listEnabledMarketMakingStrategies: jest.fn(async () => [
        {
          id: 'strategy-1',
          key: 'pure-mm',
          controllerType: 'pureMarketMaking',
        },
      ]),
      createMarketMakingOrderIntent: jest.fn(async () => ({
        orderId: 'intent-order',
        memo: 'memo',
        expiresAt: '2026-05-24T00:15:00.000Z',
        strategySnapshot: {
          strategyDefinitionId: 'strategy-1',
          definitionKey: 'pure-mm',
          definitionName: 'Pure MM',
          controllerType: 'pureMarketMaking',
          resolvedConfig: {
            bidSpread: 0.001,
            askSpread: 0.001,
            orderAmount: 1,
            orderRefreshTime: 60000,
            numberOfLayers: 1,
            priceSourceType: PriceSourceType.MID_PRICE,
            amountChangePerLayer: 0,
            amountChangeType: 'fixed',
          },
          resolvedAt: '2026-05-24T00:00:00.000Z',
        },
      })),
      createMarketMaking: jest.fn(async (order) => {
        orders.push(order);

        return order;
      }),
      updateMarketMakingOrderState: jest.fn(async (orderId, state) => {
        const order = orders.find((candidate) => candidate.orderId === orderId);

        if (order) {
          order.state = state;
        }
      }),
    };

    const runtime = { startOrder: jest.fn(), stopOrder: jest.fn() };
    const ledger = {
      creditDeposit: jest.fn(async (command) => {
        const balance = {
          orderId: command.orderId,
          userId: command.userId,
          assetId: command.assetId,
          available: command.amount,
          locked: '0',
          total: command.amount,
          initialDeposit: command.amount,
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-05-24T00:01:00.000Z',
        } as MarketMakingOrderBalance;
        const index = balances.findIndex(
          (row) =>
            row.orderId === command.orderId && row.assetId === command.assetId,
        );

        if (index >= 0) {
          balances[index] = balance;
        } else {
          balances.push(balance);
        }

        return { applied: true, balance };
      }),
      debitWithdrawal: jest.fn(async (command) => ({
        applied: true,
        balance: {
          orderId: command.orderId,
          userId: command.userId,
          assetId: command.assetId,
          available: '90',
          locked: '0',
          total: '90',
          initialDeposit: '100',
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-05-24T00:01:00.000Z',
        },
      })),
      isReservationPaused: jest.fn(() => Boolean(params?.pausedReservations)),
    };
    const lifecycleEvents = params?.lifecycleEvents || [];
    const lifecycleEventRepository = createRepository(lifecycleEvents);
    const service = new Web3MarketMakingService(
      createRepository(orders) as never,
      createRepository(balances) as never,
      createRepository([]) as never,
      createRepository([
        {
          id: 'pair-1',
          symbol: 'BTC/USDT',
          base_symbol: 'BTC',
          quote_symbol: 'USDT',
          base_asset_id: 'asset-btc',
          quote_asset_id: 'asset-usdt',
          exchange_id: 'binance',
          min_order_amount: '0.01',
          amount_significant_figures: '6',
          price_significant_figures: '2',
          enable: true,
        },
        {
          id: 'pair-disabled',
          symbol: 'ETH/USDT',
          enable: false,
        },
      ]) as never,
      createRepository([
        {
          id: 'strategy-1',
          key: 'pure-mm',
          name: 'Pure MM',
          controllerType: 'pureMarketMaking',
          enabled: true,
          visibility: 'public',
          defaultConfig: {},
          configSchema: {},
        },
      ]) as never,
      createRepository([]) as never,
      createRepository([]) as never,
      lifecycleEventRepository as never,
      userOrdersService as never,
      runtime as never,
      ledger as never,
    );

    return {
      service,
      userOrdersService,
      ledger,
      orders,
      runtime,
      lifecycleEvents,
      lifecycleEventRepository,
    };
  };

  it('lists only authenticated user non-admin market-making orders with balances and PnL', async () => {
    const { service } = buildService({
      orders: [
        createOrder({ orderId: 'order-1', userId: 'user-1' }),
        createOrder({
          orderId: 'admin-direct',
          userId: 'user-1',
          source: 'admin_direct',
        }),
        createOrder({ orderId: 'other-user', userId: 'user-2' }),
      ],
    });

    const result = await service.listOrders('user-1');

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      orderId: 'order-1',
      strategy: { id: 'strategy-1', name: 'Pure MM' },
      balances: [
        expect.objectContaining({
          orderId: 'order-1',
          assetId: 'asset-usdt',
          available: '100',
        }),
      ],
      performance: expect.objectContaining({
        realizedDeltaByAsset: { 'asset-usdt': '5' },
        feePaidByAsset: { 'asset-usdt': '1' },
      }),
    });
  });

  it('returns 404 for other-user or admin-direct detail requests', async () => {
    const { service } = buildService({
      orders: [
        createOrder({ orderId: 'owned', userId: 'user-1' }),
        createOrder({
          orderId: 'admin-direct',
          userId: 'user-1',
          source: 'admin_direct',
        }),
      ],
    });

    await expect(service.getOrderDetail('user-2', 'owned')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.getOrderDetail('user-1', 'admin-direct'),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns complete order detail with balances, PnL, actions, and timeline events', async () => {
    const { service } = buildService({
      orders: [createOrder({ state: 'running' })],
    });

    const result = await service.getOrderDetail('user-1', 'order-1');

    expect(result.order).toMatchObject({
      orderId: 'order-1',
      state: 'running',
      pair: 'BTC/USDT',
      strategy: { id: 'strategy-1', name: 'Pure MM' },
      specs: { pair: 'BTC/USDT', exchangeName: 'binance' },
      balances: [
        expect.objectContaining({ assetId: 'asset-usdt', total: '100' }),
      ],
      performance: expect.objectContaining({
        pnlByAsset: { 'asset-usdt': '4' },
        snapshots: [],
      }),
      validActions: expect.objectContaining({
        pause: true,
        start: false,
        resume: false,
      }),
      events: expect.arrayContaining([
        expect.objectContaining({ type: 'order_created', orderId: 'order-1' }),
      ]),
    });
  });

  it('serializes durable lifecycle events chronologically instead of synthesizing current state', async () => {
    const { service } = buildService({
      orders: [createOrder({ state: 'paused' })],
      lifecycleEvents: [
        {
          eventId: 'event-2',
          orderId: 'order-1',
          userId: 'user-1',
          type: 'order_paused',
          timestamp: '2026-05-24T00:03:00.000Z',
          fromState: 'running',
          toState: 'paused',
          refType: 'market_making_order_lifecycle',
          refId: 'order-1',
          metadata: {},
        },
        {
          eventId: 'event-1',
          orderId: 'order-1',
          userId: 'user-1',
          type: 'order_started',
          timestamp: '2026-05-24T00:02:00.000Z',
          fromState: 'created',
          toState: 'running',
          refType: 'market_making_order_lifecycle',
          refId: 'order-1',
          metadata: {},
        },
      ],
    });

    const result = await service.getOrderDetail('user-1', 'order-1');

    expect(result.order.events.map((event) => event.type)).toEqual([
      'order_started',
      'order_paused',
    ]);
    expect(result.order.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'order_state_paused' }),
      ]),
    );
  });

  it('rejects caller-supplied userId overrides during create', async () => {
    const { service, userOrdersService } = buildService();

    await expect(
      service.createOrder('user-1', {
        userId: 'user-2',
        marketMakingPairId: 'pair-1',
        strategyDefinitionId: 'strategy-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(
      userOrdersService.createMarketMakingOrderIntent,
    ).not.toHaveBeenCalled();
  });

  it('creates a persisted order and records accepted initial deposit instructions', async () => {
    const { service, userOrdersService, ledger } = buildService();

    const result = await service.createOrder('user-1', {
      marketMakingPairId: 'pair-1',
      strategyDefinitionId: 'strategy-1',
      configOverrides: { orderAmount: 1 },
      initialDeposit: { assetId: 'asset-usdt', amount: '100' },
    });

    expect(
      userOrdersService.createMarketMakingOrderIntent,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      marketMakingPairId: 'pair-1',
      strategyDefinitionId: 'strategy-1',
      configOverrides: { orderAmount: 1 },
    });
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'intent-order',
        userId: 'user-1',
        pair: 'BTC/USDT',
        state: 'created',
      }),
    );
    expect(ledger.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'intent-order',
        userId: 'user-1',
        assetId: 'asset-usdt',
        amount: '100',
      }),
    );
    expect(result).toMatchObject({
      orderId: 'intent-order',
      initialDeposit: {
        mode: 'accepted_during_create',
        acceptedDuringCreate: true,
      },
      funding: {
        depositEndpoint:
          '/api/v1/web3/market-making/orders/intent-order/deposit',
      },
      order: {
        orderId: 'intent-order',
        balances: [expect.objectContaining({ assetId: 'asset-usdt' })],
      },
    });
  });

  it('deposits only into the owned order using orderId, pair option asset id, and idempotency', async () => {
    const { service, ledger } = buildService();

    const result = await service.deposit('user-1', 'order-1', {
      assetId: 'asset-usdt',
      amount: '10',
      idempotencyKey: 'deposit-key',
    });

    expect(ledger.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'asset-usdt',
        amount: '10',
        idempotencyKey: 'web3:deposit:deposit-key',
        refType: 'web3_order_deposit',
      }),
    );
    expect(result.balance.assetId).toBe('asset-usdt');
  });

  it('rejects parsed pair symbols when asset ids differ from displayed symbols', async () => {
    const { service, ledger } = buildService();

    await expect(
      service.deposit('user-1', 'order-1', {
        assetId: 'USDT',
        amount: '10',
        idempotencyKey: 'deposit-key',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(ledger.creditDeposit).not.toHaveBeenCalled();
  });

  it('rejects excessive withdrawals without mutating the ledger', async () => {
    const { service, ledger } = buildService();

    await expect(
      service.withdraw('user-1', 'order-1', {
        assetId: 'asset-usdt',
        amount: '1000',
        idempotencyKey: 'withdraw-key',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(ledger.debitWithdrawal).not.toHaveBeenCalled();
  });

  it('starts only startable orders with funding and without reconciliation mismatch', async () => {
    const { service, userOrdersService } = buildService();

    const result = await service.start('user-1', 'order-1');

    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'running',
      null,
    );
    expect(result.order.state).toBe('running');
  });

  it('does not start runtime when lifecycle persistence fails', async () => {
    const { service, userOrdersService, runtime, orders } = buildService({
      orders: [
        createOrder({
          orderId: 'order-1',
          state: 'created',
          apiKeyId: 'api-key-1',
        }),
      ],
    });

    userOrdersService.updateMarketMakingOrderState.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.start('user-1', 'order-1')).rejects.toThrow(
      'database unavailable',
    );
    expect(runtime.startOrder).not.toHaveBeenCalled();
    expect(orders[0].state).toBe('created');
  });

  it('rolls back state and skips runtime when lifecycle event persistence fails after state update', async () => {
    const {
      service,
      lifecycleEventRepository,
      runtime,
      orders,
      lifecycleEvents,
    } = buildService({
      orders: [
        createOrder({
          orderId: 'order-1',
          state: 'created',
          apiKeyId: 'api-key-1',
        }),
      ],
    });

    lifecycleEventRepository.save.mockRejectedValueOnce(
      new Error('event store unavailable'),
    );

    await expect(service.start('user-1', 'order-1')).rejects.toThrow(
      'event store unavailable',
    );
    expect(orders[0].state).toBe('created');
    expect(lifecycleEvents).toHaveLength(0);
    expect(runtime.startOrder).not.toHaveBeenCalled();
  });

  it('compensates start runtime failures by reverting durable state and lifecycle events', async () => {
    const { service, runtime, orders, lifecycleEvents } = buildService({
      orders: [
        createOrder({
          orderId: 'order-1',
          state: 'created',
          apiKeyId: 'api-key-1',
        }),
      ],
    });

    runtime.startOrder.mockRejectedValueOnce(new Error('runtime unavailable'));

    await expect(service.start('user-1', 'order-1')).rejects.toThrow(
      'runtime unavailable',
    );
    expect(orders[0].state).toBe('created');
    expect(lifecycleEvents).toHaveLength(0);
    expect(runtime.stopOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', state: 'running' }),
      'user-1',
    );
  });

  it('compensates pause runtime failures by reverting durable state and lifecycle events', async () => {
    const { service, runtime, orders, lifecycleEvents } = buildService({
      orders: [
        createOrder({
          orderId: 'order-1',
          state: 'running',
          apiKeyId: 'api-key-1',
        }),
      ],
    });

    runtime.stopOrder.mockRejectedValueOnce(new Error('runtime still active'));

    await expect(service.pause('user-1', 'order-1')).rejects.toThrow(
      'runtime still active',
    );
    expect(orders[0].state).toBe('running');
    expect(lifecycleEvents).toHaveLength(0);
  });

  it('blocks risk-increasing start when reconciliation has paused reservations', async () => {
    const { service, userOrdersService } = buildService({
      pausedReservations: true,
    });

    await expect(service.start('user-1', 'order-1')).rejects.toThrow(
      ConflictException,
    );
    expect(
      userOrdersService.updateMarketMakingOrderState,
    ).not.toHaveBeenCalled();
  });

  it('pauses and resumes only from valid owned states', async () => {
    const { service, userOrdersService, orders } = buildService({
      orders: [createOrder({ state: 'running' })],
    });

    await expect(service.pause('user-1', 'order-1')).resolves.toMatchObject({
      order: { state: 'paused' },
    });
    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'paused',
      null,
    );

    orders[0].state = 'paused';
    await expect(service.resume('user-1', 'order-1')).resolves.toMatchObject({
      order: { state: 'running' },
    });
  });

  it('exposes enabled pair/spec options only', async () => {
    const { service } = buildService();

    const result = await service.listPairOptions();

    expect(result.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pairId: 'pair-1',
          pair: 'BTC/USDT',
          supportedDepositAssets: ['asset-usdt', 'asset-btc'],
        }),
      ]),
    );
    expect(result.options).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pairId: 'pair-disabled',
        }),
      ]),
    );
  });
});

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
  save: jest.fn(async (row: T) => row),
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
  }) as MarketMakingOrder;

describe('Web3MarketMakingService', () => {
  const buildService = (params?: {
    orders?: MarketMakingOrder[];
    balances?: MarketMakingOrderBalance[];
    pausedReservations?: boolean;
  }) => {
    const orders = params?.orders || [createOrder()];
    const balances =
      params?.balances ||
      ([
        {
          orderId: 'order-1',
          userId: 'user-1',
          assetId: 'USDT',
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
        { id: 'strategy-1', key: 'pure-mm', controllerType: 'pureMarketMaking' },
      ]),
      createMarketMakingOrderIntent: jest.fn(async () => ({
        orderId: 'intent-order',
        memo: 'memo',
        expiresAt: '2026-05-24T00:15:00.000Z',
      })),
      updateMarketMakingOrderState: jest.fn(async (orderId, state) => {
        const order = orders.find((candidate) => candidate.orderId === orderId);

        if (order) {
          order.state = state;
        }
      }),
    };
    const ledger = {
      creditDeposit: jest.fn(async (command) => ({
        applied: true,
        balance: {
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
        },
      })),
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
    const service = new Web3MarketMakingService(
      createRepository(balances) as never,
      createRepository([]) as never,
      createRepository([
        {
          id: 'pair-1',
          symbol: 'BTC/USDT',
          base_symbol: 'BTC',
          quote_symbol: 'USDT',
          base_asset_id: 'BTC',
          quote_asset_id: 'USDT',
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
          name: 'Pure MM',
          controllerType: 'pureMarketMaking',
        },
      ]) as never,
      createRepository([]) as never,
      createRepository([]) as never,
      userOrdersService as never,
      { startOrder: jest.fn(), stopOrder: jest.fn() } as never,
      ledger as never,
    );

    return { service, userOrdersService, ledger, orders };
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
          assetId: 'USDT',
          available: '100',
        }),
      ],
      performance: expect.objectContaining({
        realizedDeltaByAsset: { USDT: '5' },
        feePaidByAsset: { USDT: '1' },
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

  it('rejects caller-supplied userId overrides during create', async () => {
    const { service, userOrdersService } = buildService();

    await expect(
      service.createOrder('user-1', {
        userId: 'user-2',
        marketMakingPairId: 'pair-1',
        strategyDefinitionId: 'strategy-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(userOrdersService.createMarketMakingOrderIntent).not.toHaveBeenCalled();
  });

  it('creates an order intent with explicit separate funding instructions', async () => {
    const { service, userOrdersService } = buildService();

    const result = await service.createOrder('user-1', {
      marketMakingPairId: 'pair-1',
      strategyDefinitionId: 'strategy-1',
      configOverrides: { orderAmount: 1 },
      initialDeposit: { assetId: 'USDT', amount: '100' },
    });

    expect(userOrdersService.createMarketMakingOrderIntent).toHaveBeenCalledWith({
      userId: 'user-1',
      marketMakingPairId: 'pair-1',
      strategyDefinitionId: 'strategy-1',
      configOverrides: { orderAmount: 1 },
    });
    expect(result).toMatchObject({
      orderId: 'intent-order',
      initialDeposit: {
        mode: 'separate_deposit_required',
        acceptedDuringCreate: false,
      },
      funding: {
        depositEndpoint: '/api/v1/web3/market-making/orders/intent-order/deposit',
      },
    });
  });

  it('deposits only into the owned order using orderId, asset, and idempotency', async () => {
    const { service, ledger } = buildService();

    const result = await service.deposit('user-1', 'order-1', {
      assetId: 'USDT',
      amount: '10',
      idempotencyKey: 'deposit-key',
    });

    expect(ledger.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '10',
        idempotencyKey: 'web3:deposit:deposit-key',
        refType: 'web3_order_deposit',
      }),
    );
    expect(result.balance.assetId).toBe('USDT');
  });

  it('rejects excessive withdrawals without mutating the ledger', async () => {
    const { service, ledger } = buildService();

    await expect(
      service.withdraw('user-1', 'order-1', {
        assetId: 'USDT',
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
    );
    expect(result.order.state).toBe('running');
  });

  it('blocks risk-increasing start when reconciliation has paused reservations', async () => {
    const { service, userOrdersService } = buildService({
      pausedReservations: true,
    });

    await expect(service.start('user-1', 'order-1')).rejects.toThrow(
      ConflictException,
    );
    expect(userOrdersService.updateMarketMakingOrderState).not.toHaveBeenCalled();
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
    );

    orders[0].state = 'paused';
    await expect(service.resume('user-1', 'order-1')).resolves.toMatchObject({
      order: { state: 'running' },
    });
  });

  it('exposes enabled pair/spec options only', async () => {
    const { service } = buildService();

    const result = await service.listPairOptions();

    expect(result.options).toEqual([
      expect.objectContaining({
        pairId: 'pair-1',
        pair: 'BTC/USDT',
        supportedDepositAssets: ['BTC', 'USDT'],
      }),
    ]);
  });
});

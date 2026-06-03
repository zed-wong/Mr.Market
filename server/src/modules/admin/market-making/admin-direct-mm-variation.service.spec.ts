/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminDirectMarketMakingService } from './admin-direct-mm.service';

describe('AdminDirectMarketMakingService variation edits', () => {
  const buildStrategySnapshot = (resolvedConfig: Record<string, unknown>) => ({
    strategyDefinitionId: 'strategy-1',
    definitionKey: 'pure-market-making',
    definitionName: 'Pure Market Making',
    controllerType: 'pureMarketMaking',
    resolvedConfig,
    resolvedAt: '2026-04-01T00:00:00.000Z',
  });

  const buildService = () => {
    const marketMakingRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const strategyDefinitionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'strategy-1',
        key: 'pure-market-making',
        name: 'Pure Market Making',
        enabled: true,
        controllerType: 'pureMarketMaking',
        configSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            bidSpread: { type: 'number' },
            askSpread: { type: 'number' },
            orderAmount: { type: 'number' },
            orderRefreshTime: { type: 'number' },
            numberOfLayers: { type: 'number' },
            priceSourceType: { type: 'string' },
            amountChangePerLayer: { type: 'number' },
            amountChangeType: { type: 'string' },
            ceilingPrice: { type: 'number' },
            floorPrice: { type: 'number' },
          },
        },
      }),
    };
    const strategyConfigResolver = {
      resolveForOrderSnapshot: jest.fn(
        async (
          _strategyDefinitionId: string,
          overrides: Record<string, unknown>,
        ) => buildStrategySnapshot(overrides),
      ),
    };
    const mutationServices = {
      marketMakingRuntimeService: {
        startOrder: jest.fn(),
        stopOrder: jest.fn(),
      },
      userOrdersService: {
        updateMarketMakingOrderState: jest.fn(),
      },
      balanceLedgerService: {
        creditDeposit: jest.fn(),
        unlockFunds: jest.fn(),
      },
      orderReservationService: {
        releaseRemainingLimitOrderReservation: jest.fn(),
        recoverDanglingReservationsForOrder: jest.fn(),
      },
      exchangeOrderTrackerService: {
        getTrackedOrders: jest.fn(),
      },
      exchangeInitService: {
        getExchange: jest.fn(),
      },
    };
    const service: any = Object.create(
      AdminDirectMarketMakingService.prototype,
    );

    Object.assign(service, {
      marketMakingRepository,
      strategyDefinitionRepository,
      strategyConfigResolver,
      ...mutationServices,
    });

    return {
      service: service as AdminDirectMarketMakingService,
      marketMakingRepository,
      strategyDefinitionRepository,
      strategyConfigResolver,
      ...mutationServices,
    };
  };

  const pausedAdminDirectOrder = {
    orderId: 'order-1',
    userId: 'admin-user',
    pair: 'BTC/USDT',
    exchangeName: 'binance',
    strategyDefinitionId: 'strategy-1',
    strategySnapshot: buildStrategySnapshot({
      accountLabel: 'api-key-1',
      userId: 'admin-user',
      clientId: 'order-1',
      marketMakingOrderId: 'order-1',
      pair: 'BTC/USDT',
      symbol: 'BTC/USDT',
      exchangeName: 'binance',
      bidSpread: '0.001',
      askSpread: '0.001',
      orderAmount: '10',
      orderRefreshTime: '1000',
      numberOfLayers: '1',
      priceSourceType: 'mid_price',
      amountChangePerLayer: '0',
      amountChangeType: 'fixed',
      ceilingPrice: '0',
      floorPrice: '0',
    }),
    source: 'admin_direct',
    state: 'paused',
    apiKeyId: 'api-key-1',
  };

  it('updates only paused admin-direct variation snapshot and flattened fields', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      userOrdersService,
      balanceLedgerService,
      orderReservationService,
      exchangeOrderTrackerService,
      exchangeInitService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue(pausedAdminDirectOrder);

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: {
          bidSpread: 0.003,
          orderAmount: 12,
        },
      }),
    ).resolves.toMatchObject({
      orderId: 'order-1',
      state: 'paused',
      strategyDefinitionId: 'strategy-1',
      strategySnapshot: expect.objectContaining({
        resolvedConfig: expect.objectContaining({
          bidSpread: 0.003,
          orderAmount: 12,
          accountLabel: 'api-key-1',
          userId: 'admin-user',
          clientId: 'order-1',
          marketMakingOrderId: 'order-1',
          pair: 'BTC/USDT',
          symbol: 'BTC/USDT',
          exchangeName: 'binance',
        }),
      }),
    });
    expect(marketMakingRepository.update).toHaveBeenCalledWith(
      { orderId: 'order-1', source: 'admin_direct' },
      expect.objectContaining({
        strategyDefinitionId: 'strategy-1',
        bidSpread: '0.003',
        orderAmount: '12',
        strategySnapshot: expect.objectContaining({
          resolvedConfig: expect.objectContaining({
            bidSpread: 0.003,
            orderAmount: 12,
          }),
        }),
      }),
    );
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.stopOrder).not.toHaveBeenCalled();
    expect(
      userOrdersService.updateMarketMakingOrderState,
    ).not.toHaveBeenCalled();
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
    expect(
      orderReservationService.releaseRemainingLimitOrderReservation,
    ).not.toHaveBeenCalled();
    expect(
      orderReservationService.recoverDanglingReservationsForOrder,
    ).not.toHaveBeenCalled();
    expect(exchangeOrderTrackerService.getTrackedOrders).not.toHaveBeenCalled();
    expect(exchangeInitService.getExchange).not.toHaveBeenCalled();
  });

  it('rejects active admin-direct variation edits before validation or persistence', async () => {
    const {
      service,
      marketMakingRepository,
      strategyConfigResolver,
      marketMakingRuntimeService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      ...pausedAdminDirectOrder,
      state: 'running',
    });

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: { bidSpread: 0.003 },
      }),
    ).rejects.toThrow('Strategy variation edits require a paused order');
    expect(
      strategyConfigResolver.resolveForOrderSnapshot,
    ).not.toHaveBeenCalled();
    expect(marketMakingRepository.update).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.stopOrder).not.toHaveBeenCalled();
  });

  it('rejects non-admin-direct variation edits without updating runtime or order rows', async () => {
    const { service, marketMakingRepository, strategyConfigResolver } =
      buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      ...pausedAdminDirectOrder,
      source: 'payment_flow',
    });

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: { bidSpread: 0.003 },
      }),
    ).rejects.toThrow(
      'Strategy variation edits are only supported for admin-direct orders',
    );
    expect(
      strategyConfigResolver.resolveForOrderSnapshot,
    ).not.toHaveBeenCalled();
    expect(marketMakingRepository.update).not.toHaveBeenCalled();
  });

  it('allows paused snapshot edits when no paused runtime instance is loaded', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue(pausedAdminDirectOrder);

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: { askSpread: 0.004 },
      }),
    ).resolves.toMatchObject({
      orderId: 'order-1',
      state: 'paused',
    });
    expect(marketMakingRepository.update).toHaveBeenCalledTimes(1);
  });

  it('returns deterministic errors for missing snapshot data', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      ...pausedAdminDirectOrder,
      strategySnapshot: null,
    });

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: { bidSpread: 0.003 },
      }),
    ).rejects.toThrow(
      'Strategy snapshot resolved config is required for variation edit',
    );
    expect(marketMakingRepository.update).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminDirectMarketMakingService } from './admin-direct-mm.service';

describe('AdminDirectMarketMakingService variation edits', () => {
  const validateConfigAgainstSchema = (
    config: Record<string, unknown>,
    schema: any,
  ) => {
    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties =
      schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};

    for (const field of required) {
      if (config[field] === undefined || config[field] === null) {
        throw new Error(`Missing required config field: ${field}`);
      }
    }

    for (const [field, rule] of Object.entries<any>(properties)) {
      const value = config[field];

      if (value === undefined || value === null) {
        continue;
      }
      if (
        rule.type === 'number' &&
        typeof value !== 'number' &&
        !(
          typeof value === 'string' &&
          value.trim().length > 0 &&
          Number.isFinite(Number(value))
        )
      ) {
        throw new Error(`Config field ${field} must be number`);
      }
      if (rule.type === 'string' && typeof value !== 'string') {
        throw new Error(`Config field ${field} must be string`);
      }
      if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
        throw new Error(`Config field ${field} must be one of`);
      }
      if (rule.minimum !== undefined && Number(value) < Number(rule.minimum)) {
        throw new Error(`Config field ${field} must be >= ${rule.minimum}`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const field of Object.keys(config)) {
        if (!(field in properties)) {
          throw new Error(`Config field ${field} is not allowed`);
        }
      }
    }
  };

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
            orderAmount: { type: 'number', minimum: 1 },
            orderRefreshTime: { type: 'number' },
            numberOfLayers: { type: 'number' },
            priceSourceType: {
              type: 'string',
              enum: ['mid_price', 'last_trade'],
            },
            amountChangePerLayer: { type: 'number' },
            amountChangeType: { type: 'string' },
            ceilingPrice: { type: 'number' },
            floorPrice: { type: 'number' },
          },
        },
      }),
    };
    const strategyConfigResolver = {
      validateConfigAgainstSchema: jest.fn(validateConfigAgainstSchema),
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

  it.each([
    'pair',
    'exchangeName',
    'controllerType',
    'orderId',
    'marketMakingOrderId',
    'userId',
    'clientId',
    'symbol',
    'strategyDefinitionId',
    'apiKeyId',
    'id',
    'externalId',
  ])('rejects reserved variation payload field %s before persistence', async (field) => {
    const { service, marketMakingRepository, strategyConfigResolver } =
      buildService();

    marketMakingRepository.findOne.mockResolvedValue(pausedAdminDirectOrder);

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: { [field]: 'blocked' },
      }),
    ).rejects.toThrow('configOverrides cannot override system field');
    expect(
      strategyConfigResolver.resolveForOrderSnapshot,
    ).not.toHaveBeenCalled();
    expect(marketMakingRepository.update).not.toHaveBeenCalled();
  });

  it('returns editable metadata derived from the order-associated config schema', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue(pausedAdminDirectOrder);

    const metadata = await service.getPausedVariationMetadata('order-1');
    const keys = metadata.fields.map((field) => field.key);

    expect(metadata).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        state: 'paused',
        strategyDefinitionId: 'strategy-1',
        editable: true,
        editability: {
          editable: true,
          reason: null,
          state: 'paused',
        },
        values: expect.objectContaining({
          bidSpread: '0.001',
          askSpread: '0.001',
          orderAmount: '10',
        }),
        fields: expect.arrayContaining([
          expect.objectContaining({
            key: 'bidSpread',
            type: 'number',
            required: false,
            currentValue: '0.001',
            editable: true,
          }),
          expect.objectContaining({
            key: 'priceSourceType',
            enum: ['mid_price', 'last_trade'],
            currentValue: 'mid_price',
          }),
        ]),
      }),
    );
    expect(keys).toEqual([
      'bidSpread',
      'askSpread',
      'orderAmount',
      'orderRefreshTime',
      'numberOfLayers',
      'priceSourceType',
      'amountChangePerLayer',
      'amountChangeType',
      'ceilingPrice',
      'floorPrice',
    ]);
    expect(keys).not.toContain('pair');
    expect(keys).not.toContain('exchangeName');
    expect(keys).not.toContain('clientId');
    expect(metadata.values).not.toHaveProperty('pair');
    expect(metadata.values).not.toHaveProperty('exchangeName');
    expect(metadata.values).not.toHaveProperty('clientId');
  });

  it('returns active order metadata as non-editable without exposing reserved fields', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      ...pausedAdminDirectOrder,
      state: 'running',
    });

    const metadata = await service.getPausedVariationMetadata('order-1');

    expect(metadata.editable).toBe(false);
    expect(metadata.editability).toEqual({
      editable: false,
      reason: 'order_not_paused',
      state: 'running',
    });
    expect(metadata.values).not.toHaveProperty('pair');
  });

  it('uses the strategy definition referenced by the order snapshot', async () => {
    const { service, marketMakingRepository, strategyDefinitionRepository } =
      buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      ...pausedAdminDirectOrder,
      strategyDefinitionId: 'latest-unrelated-definition',
    });

    await service.getPausedVariationMetadata('order-1');
    await service.editPausedVariation('order-1', {
      configOverrides: { bidSpread: 0.003 },
    });

    expect(strategyDefinitionRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: 'strategy-1' },
    });
    expect(strategyDefinitionRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: 'strategy-1' },
    });
  });

  it.each([
    {
      name: 'wrong type',
      configOverrides: { bidSpread: 'not-a-number' },
      expectedError: 'Config field bidSpread must be number',
    },
    {
      name: 'invalid enum',
      configOverrides: { priceSourceType: 'oracle' },
      expectedError: 'Config field priceSourceType must be one of',
    },
    {
      name: 'out-of-range number',
      configOverrides: { orderAmount: 0 },
      expectedError: 'Config field orderAmount must be >= 1',
    },
  ])('rejects schema-invalid variation payload: $name', async (caseData) => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue(pausedAdminDirectOrder);

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: caseData.configOverrides,
      }),
    ).rejects.toThrow(caseData.expectedError);
    expect(marketMakingRepository.update).not.toHaveBeenCalled();
  });

  it('rejects missing required editable schema fields before persistence', async () => {
    const { service, marketMakingRepository, strategyDefinitionRepository } =
      buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      key: 'pure-market-making',
      name: 'Pure Market Making',
      enabled: true,
      controllerType: 'pureMarketMaking',
      configSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['bidSpread'],
        properties: {
          bidSpread: { type: 'number' },
        },
      },
    });
    marketMakingRepository.findOne.mockResolvedValue({
      ...pausedAdminDirectOrder,
      strategySnapshot: buildStrategySnapshot({}),
    });

    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: {},
      }),
    ).rejects.toThrow('Missing required config field: bidSpread');
    expect(marketMakingRepository.update).not.toHaveBeenCalled();
  });

  it('returns deterministic errors for missing resolved config, definition, or config schema', async () => {
    const { service, marketMakingRepository, strategyDefinitionRepository } =
      buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      ...pausedAdminDirectOrder,
      strategySnapshot: {
        ...pausedAdminDirectOrder.strategySnapshot,
        resolvedConfig: null,
      },
    });
    await expect(
      service.getPausedVariationMetadata('order-1'),
    ).rejects.toThrow(
      'Strategy snapshot resolved config is required for variation edit',
    );

    marketMakingRepository.findOne.mockResolvedValue(pausedAdminDirectOrder);
    strategyDefinitionRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: { bidSpread: 0.003 },
      }),
    ).rejects.toThrow('Strategy definition not found');
    expect(marketMakingRepository.update).not.toHaveBeenCalled();

    strategyDefinitionRepository.findOne.mockResolvedValueOnce({
      id: 'strategy-1',
      key: 'pure-market-making',
      name: 'Pure Market Making',
      enabled: true,
      controllerType: 'pureMarketMaking',
      configSchema: null,
    });
    await expect(
      service.editPausedVariation('order-1', {
        configOverrides: { bidSpread: 0.003 },
      }),
    ).rejects.toThrow(
      'Strategy definition config schema is required for variation edit',
    );
  });

});

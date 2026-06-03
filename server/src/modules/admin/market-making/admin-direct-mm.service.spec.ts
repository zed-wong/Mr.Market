/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AdminDirectMarketMakingService } from './admin-direct-mm.service';

describe('AdminDirectMarketMakingService', () => {
  const singleAccountLaunchConfig = {
    launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
    directExecutionMode: 'single_account',
  };
  const dualAccountLaunchConfig = {
    launchSurfaces: ['strategy_settings', 'admin_direct_mm'],
    directExecutionMode: 'dual_account',
  };
  const buildStrategySnapshot = (
    resolvedConfig: Record<string, unknown>,
    controllerType = 'pureMarketMaking',
  ) => ({
    strategyDefinitionId: 'strategy-1',
    definitionKey: 'pure-market-making',
    definitionName: 'Pure Market Making',
    controllerType,
    resolvedConfig,
    resolvedAt: '2026-04-01T00:00:00.000Z',
  });

  const buildService = () => {
    const marketMakingRepository = {
      create: jest.fn((payload) => payload),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const growdataMarketMakingPairRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const strategyDefinitionRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const campaignJoinRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => payload),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const userOrdersService = {
      createMarketMaking: jest.fn(async (payload) => payload),
      updateMarketMakingOrderState: jest.fn().mockResolvedValue(undefined),
    };
    const marketMakingRuntimeService = {
      startOrder: jest.fn().mockResolvedValue(undefined),
      stopOrder: jest.fn().mockResolvedValue(undefined),
    };
    const strategyConfigResolver = {
      getDefinitionControllerType: jest
        .fn()
        .mockReturnValue('pureMarketMaking'),
      resolveForOrderSnapshot: jest.fn().mockResolvedValue({
        controllerType: 'pureMarketMaking',
        resolvedConfig: {
          accountLabel: 'api-key-1',
          bidSpread: 0.001,
          askSpread: 0.001,
          orderAmount: 10,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: 'MID_PRICE',
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
          ceilingPrice: 0,
          floorPrice: 0,
          balanceA: '1',
          balanceB: '1000',
        },
      }),
    };
    const exchangeApiKeyService = {
      readAPIKey: jest.fn().mockImplementation(async (apiKeyId: string) => {
        if (apiKeyId === 'api-key-readonly') {
          return {
            exchange: 'binance',
            key_id: 'api-key-readonly',
            name: 'desk-readonly',
            api_key: 'api-key-readonly',
            api_secret: 'api-secret-readonly',
            permissions: 'read',
          };
        }

        if (apiKeyId === 'api-key-2') {
          return {
            exchange: 'binance',
            key_id: 'api-key-2',
            name: 'desk-2',
            api_key: 'api-key-2',
            api_secret: 'api-secret-2',
            permissions: 'read-trade',
          };
        }

        return {
          exchange: 'binance',
          key_id: 'api-key-1',
          name: 'desk-1',
          api_key: 'api-key',
          api_secret: 'api-secret',
          permissions: 'read-trade',
        };
      }),
      readDecryptedAPIKey: jest.fn().mockResolvedValue({
        exchange: 'binance',
        key_id: 'api-key-1',
        name: 'desk-1',
        api_key: 'api-key',
        api_secret: 'plain-secret',
      }),
    };
    const exchange = {
      markets: {
        'BTC/USDT': {
          maker: 0,
        },
      },
      fetchTicker: jest.fn().mockResolvedValue({
        last: 100,
      }),
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 1, USDT: 1000 },
        used: { BTC: 0.2, USDT: 0 },
        total: { BTC: 1.2, USDT: 1000 },
      }),
    };
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue(exchange),
      getCcxtExchangeMarkets: jest.fn().mockResolvedValue([
        {
          symbol: 'BTC/USDT',
          limits: { amount: { min: 0.001 } },
        },
      ]),
    };
    const executorRegistry = {
      findExecutorByOrderId: jest.fn().mockReturnValue(null),
    };
    const strategyService = {
      getLatestIntentsForStrategy: jest.fn().mockReturnValue([]),
      getStrategyInstanceKey: jest.fn().mockResolvedValue(null),
    };
    const strategyIntentStoreService = {
      getQueueState: jest.fn().mockResolvedValue({
        blockedByFailure: false,
        headIntentStatus: null,
      }),
    };
    const exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([]),
      getLiveOrders: jest.fn().mockReturnValue([]),
      getTrackedOrders: jest.fn().mockReturnValue([]),
      getFillCount: jest.fn().mockReturnValue(0),
    };
    const userStreamTrackerService = {
      getLatestEvent: jest.fn().mockReturnValue(null),
      getQueueDepth: jest.fn().mockReturnValue(0),
      getDuplicateFillSuppressionCount: jest.fn().mockReturnValue(0),
    };
    const userStreamIngestionService = {
      getActiveWatcherCount: jest.fn().mockReturnValue(0),
      getWatcherState: jest.fn().mockReturnValue({
        order: false,
        trade: false,
        balance: false,
        orderRefCount: 0,
        tradeRefCount: 0,
        balanceRefCount: 0,
      }),
    };
    const orderBookTrackerService = {
      getOrderBook: jest.fn().mockReturnValue(null),
    };
    const campaignService = {
      getCampaigns: jest.fn().mockResolvedValue([]),
      isCampaignJoined: jest.fn().mockResolvedValue(false),
      get_auth_nonce: jest.fn().mockResolvedValue('nonce'),
      authenticate_web3_user: jest.fn().mockResolvedValue('access-token'),
      getAccessToken: jest.fn().mockResolvedValue('access-token'),
      getJoinedCampaignKeys: jest.fn().mockResolvedValue(new Set()),
      joinCampaignWithAuth: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const balanceLedgerService = {
      hasDepositCredit: jest.fn().mockResolvedValue(false),
      creditDeposit: jest.fn().mockResolvedValue({ applied: true }),
      getExistingBalance: jest.fn().mockResolvedValue(null),
      unlockFunds: jest.fn().mockResolvedValue({ applied: true }),
    };
    const orderReservationService = {
      releaseRemainingLimitOrderReservation: jest
        .fn()
        .mockResolvedValue({ applied: true }),
      recoverDanglingReservationsForOrder: jest.fn().mockResolvedValue([]),
    };
    const orderBalanceRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const balanceStateCacheService = {
      getBalance: jest.fn().mockReturnValue(undefined),
      applyBalanceSnapshot: jest.fn(),
      isFresh: jest.fn().mockReturnValue(false),
      isStale: jest.fn().mockReturnValue(true),
    };
    const balanceStateRefreshService = {
      getHealthState: jest.fn().mockReturnValue('silent'),
      getLastRefreshTime: jest.fn().mockReturnValue(undefined),
    };
    const userStreamCapabilityService = {
      getCapabilities: jest.fn().mockReturnValue({
        watchOrders: true,
        watchMyTrades: true,
        watchBalance: true,
        tier: 'full',
      }),
    };

    const service = new AdminDirectMarketMakingService(
      marketMakingRepository as any,
      orderBalanceRepository as any,
      growdataMarketMakingPairRepository as any,
      strategyDefinitionRepository as any,
      campaignJoinRepository as any,
      userOrdersService as any,
      marketMakingRuntimeService as any,
      strategyConfigResolver as any,
      exchangeApiKeyService as any,
      exchangeInitService as any,
      executorRegistry as any,
      strategyService as any,
      strategyIntentStoreService as any,
      exchangeOrderTrackerService as any,
      userStreamTrackerService as any,
      orderBookTrackerService as any,
      campaignService as any,
      configService as any,
      balanceLedgerService as any,
      orderReservationService as any,
      userStreamIngestionService as any,
      balanceStateCacheService as any,
      balanceStateRefreshService as any,
      userStreamCapabilityService as any,
    );

    return {
      service,
      marketMakingRepository,
      growdataMarketMakingPairRepository,
      strategyDefinitionRepository,
      campaignJoinRepository,
      userOrdersService,
      marketMakingRuntimeService,
      strategyConfigResolver,
      exchangeApiKeyService,
      exchangeInitService,
      exchange,
      executorRegistry,
      strategyService,
      strategyIntentStoreService,
      exchangeOrderTrackerService,
      userStreamTrackerService,
      userStreamIngestionService,
      orderBookTrackerService,
      campaignService,
      configService,
      balanceLedgerService,
      orderReservationService,
      orderBalanceRepository,
      balanceStateCacheService,
      balanceStateRefreshService,
      userStreamCapabilityService,
    };
  };

  it('surfaces HuFi campaign join failure details to admin clients', async () => {
    const { service, exchangeApiKeyService, campaignService, configService } =
      buildService();

    exchangeApiKeyService.readDecryptedAPIKey.mockResolvedValue({
      exchange: 'binance',
      key_id: 'api-key-readonly',
      name: 'desk-readonly',
      api_key: 'api-key-readonly',
      api_secret: 'plain-secret',
      permissions: 'read',
    });
    configService.get.mockReturnValue(
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    );
    campaignService.joinCampaignWithAuth.mockRejectedValue(
      new Error('Invalid campaign details or already joined: campaign ended'),
    );

    await expect(
      service.joinCampaign({
        evmAddress: '0x1111111111111111111111111111111111111111',
        apiKeyId: 'api-key-readonly',
        chainId: 137,
        campaignAddress: '0x2222222222222222222222222222222222222222',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'Invalid campaign details or already joined: campaign ended',
      },
    });
  });

  const directStartDto = {
    exchangeName: 'binance',
    pair: 'BTC/USDT',
    strategyDefinitionId: 'strategy-1',
    apiKeyId: 'api-key-1',
    configOverrides: {
      bidSpread: 0.002,
    },
  };

  const dualAccountStartDto = {
    exchangeName: 'binance',
    pair: 'BTC/USDT',
    strategyDefinitionId: 'strategy-2',
    makerApiKeyId: 'api-key-1',
    takerApiKeyId: 'api-key-2',
    configOverrides: {
      baseTradeAmount: 5,
      baseIntervalTime: 10,
      numTrades: 20,
      baseIncrementPercentage: 0.2,
      pricePushRate: 0,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts a direct order and updates it to running', async () => {
    const {
      service,
      strategyDefinitionRepository,
      userOrdersService,
      marketMakingRuntimeService,
      balanceLedgerService,
      exchange,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    const result = await service.directStart(directStartDto, 'admin-user');

    expect(result).toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'admin_direct',
        apiKeyId: 'api-key-1',
        userId: 'admin-user',
        state: 'created',
      }),
    );
    expect(marketMakingRuntimeService.startOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'admin_direct',
        balanceA: '1',
        balanceB: '1000',
      }),
    );
    expect(balanceLedgerService.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'BTC',
        amount: '1',
        refType: 'admin_direct_seed',
      }),
    );
    expect(balanceLedgerService.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'USDT',
        amount: '1000',
        refType: 'admin_direct_seed',
      }),
    );
    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      result.orderId,
      'running',
    );
    expect(exchange.fetchBalance).toHaveBeenCalledTimes(1);
    expect(exchange.fetchTicker).toHaveBeenCalledTimes(1);
  });

  it('skips admin-direct ledger seed for assets that already have deposits', async () => {
    const { service, strategyDefinitionRepository, balanceLedgerService } =
      buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    balanceLedgerService.hasDepositCredit.mockImplementation(
      async (_orderId: string, assetId: string) => assetId === 'BTC',
    );

    await service.directStart(directStartDto, 'admin-user');

    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'BTC' }),
    );
    expect(balanceLedgerService.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'USDT', amount: '1000' }),
    );
  });

  it('derives admin-direct ledger allocations from exchange free balance', async () => {
    const {
      service,
      strategyDefinitionRepository,
      strategyConfigResolver,
      balanceLedgerService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'pureMarketMaking',
      resolvedConfig: {
        accountLabel: 'api-key-1',
        bidSpread: 0.001,
        askSpread: 0.001,
        orderAmount: 10,
        orderRefreshTime: 1000,
        numberOfLayers: 1,
        priceSourceType: 'MID_PRICE',
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        ceilingPrice: 0,
        floorPrice: 0,
      },
    });

    await service.directStart(directStartDto, 'admin-user');

    expect(balanceLedgerService.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'BTC', amount: '1' }),
    );
    expect(balanceLedgerService.creditDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'USDT', amount: '1000' }),
    );
  });

  it('rejects admin-direct start without available ledger seed balance', async () => {
    const {
      service,
      strategyDefinitionRepository,
      strategyConfigResolver,
      exchange,
      userOrdersService,
      marketMakingRuntimeService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'pureMarketMaking',
      resolvedConfig: {
        accountLabel: 'api-key-1',
        bidSpread: 0.001,
        askSpread: 0.001,
        orderAmount: 10,
        orderRefreshTime: 1000,
        numberOfLayers: 1,
        priceSourceType: 'MID_PRICE',
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        ceilingPrice: 0,
        floorPrice: 0,
      },
    });
    exchange.fetchBalance.mockResolvedValue({
      free: { BTC: 0, USDT: 0 },
      used: {},
      total: {},
    });

    await expect(
      service.directStart(directStartDto, 'admin-user'),
    ).rejects.toThrow(
      'Admin direct order requires available base or quote balance to seed ledger',
    );
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
  });

  it('fails direct start when the API key is missing', async () => {
    const { service, exchangeApiKeyService } = buildService();

    exchangeApiKeyService.readAPIKey.mockResolvedValue(null);

    await expect(service.directStart(directStartDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects direct start when the API key is read-only', async () => {
    const { service, strategyDefinitionRepository } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });

    await expect(
      service.directStart({
        ...directStartDto,
        apiKeyId: 'api-key-readonly',
      }),
    ).rejects.toThrow('API key must have read-trade permissions');
  });

  it('fails direct start when the strategy definition is missing', async () => {
    const { service, strategyDefinitionRepository } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue(null);

    await expect(service.directStart(directStartDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('bubbles resolver schema failures before creating the order', async () => {
    const {
      service,
      strategyDefinitionRepository,
      strategyConfigResolver,
      userOrdersService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.resolveForOrderSnapshot.mockRejectedValue(
      new Error('schema validation failed'),
    );

    await expect(service.directStart(directStartDto)).rejects.toThrow(
      'schema validation failed',
    );
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
  });

  it('rejects direct start when order amount is below the market minimum', async () => {
    const {
      service,
      strategyDefinitionRepository,
      growdataMarketMakingPairRepository,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: directStartDto.strategyDefinitionId,
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    growdataMarketMakingPairRepository.findOne.mockResolvedValue({
      exchange_id: 'binance',
      symbol: 'BTC/USDT',
      min_order_amount: '20',
    });

    await expect(
      service.directStart(directStartDto, 'admin-user'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects direct start when live market minimum blocks a stored zero minimum', async () => {
    const {
      service,
      strategyDefinitionRepository,
      growdataMarketMakingPairRepository,
      exchangeInitService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: directStartDto.strategyDefinitionId,
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    growdataMarketMakingPairRepository.findOne.mockResolvedValue({
      exchange_id: 'binance',
      symbol: 'BTC/USDT',
      min_order_amount: '0',
    });
    exchangeInitService.getCcxtExchangeMarkets.mockResolvedValue([
      {
        symbol: 'BTC/USDT',
        limits: { amount: { min: 20 } },
      },
    ]);

    await expect(
      service.directStart(directStartDto, 'admin-user'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects direct start when a live cost minimum implies a larger base amount', async () => {
    const {
      service,
      strategyDefinitionRepository,
      growdataMarketMakingPairRepository,
      exchangeInitService,
      exchange,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: directStartDto.strategyDefinitionId,
      enabled: true,
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    growdataMarketMakingPairRepository.findOne.mockResolvedValue({
      exchange_id: 'binance',
      symbol: 'BTC/USDT',
      min_order_amount: '0',
    });
    exchangeInitService.getCcxtExchangeMarkets.mockResolvedValue([
      {
        symbol: 'BTC/USDT',
        limits: { cost: { min: 1000 } },
      },
    ]);
    exchange.fetchTicker.mockResolvedValue({
      last: 50,
    });

    await expect(
      service.directStart(directStartDto, 'admin-user'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects direct start when spreads are below the effective minimum spread', async () => {
    const { service, strategyDefinitionRepository, exchange } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: directStartDto.strategyDefinitionId,
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    exchange.markets['BTC/USDT'].maker = 0.002;

    await expect(service.directStart(directStartDto)).rejects.toThrow(
      'PMM spread config will never quote',
    );
  });

  it('rejects direct start when current allocation plus active direct orders exceeds exchange free balance', async () => {
    const {
      service,
      strategyDefinitionRepository,
      marketMakingRepository,
      orderBalanceRepository,
      exchange,
      userOrdersService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
      capabilities: singleAccountLaunchConfig,
      configSchema: {},
    });
    marketMakingRepository.find.mockResolvedValue([{ orderId: 'existing-1' }]);
    orderBalanceRepository.find.mockResolvedValue([
      {
        orderId: 'existing-1',
        assetId: 'BTC',
        total: '0.6',
      },
    ]);
    exchange.fetchBalance.mockResolvedValue({
      free: { BTC: 1, USDT: 2000 },
      used: {},
      total: {},
    });

    await expect(service.directStart(directStartDto)).rejects.toThrow(
      'Account overlap',
    );
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
  });

  it('stops a direct order via the shared runtime service', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      userOrdersService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      userId: 'admin-user',
      source: 'admin_direct',
      state: 'running',
    });
    await expect(service.directStop('order-1')).resolves.toEqual({
      orderId: 'order-1',
      state: 'stopped',
    });
    expect(marketMakingRuntimeService.stopOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1' }),
      'admin-user',
    );
    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'stopped',
    );
  });

  it('does not mark a stopped order successful when reservation recovery fails', async () => {
    const {
      service,
      marketMakingRepository,
      orderReservationService,
      userOrdersService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValueOnce({
      orderId: 'order-1',
      userId: 'admin-user',
      source: 'admin_direct',
      state: 'running',
      pair: 'BTC/USDT',
    });
    orderReservationService.recoverDanglingReservationsForOrder.mockRejectedValue(
      new Error('reservation down'),
    );

    await expect(service.directStop('order-1')).rejects.toThrow(
      'reservation down',
    );
    expect(userOrdersService.updateMarketMakingOrderState).not.toHaveBeenCalled();
  });

  it('releases terminal tracked order reservations through reservation service during stop', async () => {
    const {
      service,
      marketMakingRepository,
      exchangeOrderTrackerService,
      orderReservationService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      userId: 'admin-user',
      source: 'admin_direct',
      state: 'running',
      pair: 'BTC/USDT',
      strategySnapshot: buildStrategySnapshot({}),
    });
    exchangeOrderTrackerService.getTrackedOrders = jest.fn().mockReturnValue([
      {
        orderId: 'order-1',
        strategyKey: 'pmm-order-1',
        exchange: 'binance',
        accountLabel: 'api-key-1',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-order-1',
        clientOrderId: 'client-order-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeFilledQty: '0.1',
        status: 'cancelled',
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:01.000Z',
      },
    ]);

    await service.directStop('order-1');

    expect(
      orderReservationService.releaseRemainingLimitOrderReservation,
    ).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'admin-user',
      intentId: 'client-order-1',
      releaseId: 'client-order-1',
      pair: 'BTC/USDT',
      side: 'buy',
      price: '100',
      qty: '0.5',
      filledQty: '0.1',
      reason: 'exchange_order_cancelled',
    });
  });

  it('rejects stopping a missing direct order', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue(null);

    await expect(service.directStop('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes a stopped direct order', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      state: 'stopped',
      source: 'admin_direct',
    });

    await expect(service.removeDirectOrder('order-1')).resolves.toEqual({
      orderId: 'order-1',
      state: 'removed',
    });
    expect(marketMakingRepository.update).toHaveBeenCalledWith(
      {
        orderId: 'order-1',
        source: 'admin_direct',
      },
      {
        state: 'deleted',
      },
    );
  });

  it('rejects removing a running direct order', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      state: 'running',
      source: 'admin_direct',
    });

    await expect(service.removeDirectOrder('order-1')).rejects.toThrow(
      'Only stopped or failed orders can be removed',
    );
  });

  it('starts a dual-account direct order and stores maker and taker metadata', async () => {
    const {
      service,
      strategyDefinitionRepository,
      strategyConfigResolver,
      userOrdersService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-2',
      enabled: true,
      controllerType: 'dualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'dualAccountVolume',
    );
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'dualAccountVolume',
      resolvedConfig: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseTradeAmount: 5,
        baseIntervalTime: 10,
        numTrades: 20,
        baseIncrementPercentage: 0.2,
        pricePushRate: 0,
        balanceA: '1',
        balanceB: '1000',
      },
    });

    const result = await service.directStart(dualAccountStartDto, 'admin-user');

    expect(result).toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'api-key-1',
        strategySnapshot: expect.objectContaining({
          controllerType: 'dualAccountVolume',
          resolvedConfig: expect.objectContaining({
            makerAccountLabel: 'api-key-1',
            takerAccountLabel: 'api-key-2',
            makerApiKeyId: 'api-key-1',
            takerApiKeyId: 'api-key-2',
          }),
        }),
      }),
    );
  });

  it('starts a best-capacity dual-account direct order and stores maker and taker metadata', async () => {
    const {
      service,
      marketMakingRuntimeService,
      strategyDefinitionRepository,
      strategyConfigResolver,
      userOrdersService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-best',
      enabled: true,
      controllerType: 'dualAccountBestCapacityVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'dualAccountBestCapacityVolume',
    );
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'dualAccountBestCapacityVolume',
      resolvedConfig: {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        baseTradeAmount: 5,
        baseIntervalTime: 10,
        numTrades: 20,
        baseIncrementPercentage: 0.2,
        pricePushRate: 0,
        balanceA: '1',
        balanceB: '1000',
      },
    });

    const result = await service.directStart(dualAccountStartDto, 'admin-user');

    expect(result).toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'api-key-1',
        strategySnapshot: expect.objectContaining({
          controllerType: 'dualAccountBestCapacityVolume',
          resolvedConfig: expect.objectContaining({
            symbol: 'BTC/USDT',
            pair: 'BTC/USDT',
            exchangeName: 'binance',
            makerAccountLabel: 'api-key-1',
            takerAccountLabel: 'api-key-2',
            makerApiKeyId: 'api-key-1',
            takerApiKeyId: 'api-key-2',
          }),
        }),
      }),
    );
    expect(marketMakingRuntimeService.startOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySnapshot: expect.objectContaining({
          resolvedConfig: expect.objectContaining({
            symbol: 'BTC/USDT',
            exchangeName: 'binance',
          }),
        }),
      }),
    );
  });

  it('rejects reserved config override fields before resolving dual-account config', async () => {
    const { service, strategyDefinitionRepository, strategyConfigResolver } =
      buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-2',
      enabled: true,
      controllerType: 'dualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'dualAccountVolume',
    );

    await expect(
      service.directStart(
        {
          ...dualAccountStartDto,
          configOverrides: {
            ...dualAccountStartDto.configOverrides,
            userId: 'spoofed-user',
            clientId: 'spoofed-client',
            marketMakingOrderId: 'spoofed-order',
            pair: 'ETH/USDT',
            symbol: 'ETH/USDT',
            exchangeName: 'kraken',
          },
        },
        'admin-user',
      ),
    ).rejects.toThrow('configOverrides cannot override system field: userId');

    expect(
      strategyConfigResolver.resolveForOrderSnapshot,
    ).not.toHaveBeenCalled();
  });

  it('rejects direct start when dual-account requests reuse the same api key', async () => {
    const {
      service,
      strategyDefinitionRepository,
      exchangeApiKeyService,
      strategyConfigResolver,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-2',
      enabled: true,
      controllerType: 'dualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'dualAccountVolume',
    );
    exchangeApiKeyService.readAPIKey.mockResolvedValue({
      exchange: 'binance',
      key_id: 'api-key-1',
      name: 'desk-1',
      api_key: 'api-key',
      api_secret: 'api-secret',
      permissions: 'read-trade',
    });

    await expect(
      service.directStart({
        ...dualAccountStartDto,
        takerApiKeyId: 'api-key-1',
      }),
    ).rejects.toThrow('Maker and taker API keys must be different');
  });

  it('reports active executor health in the status endpoint', async () => {
    const {
      service,
      marketMakingRepository,
      executorRegistry,
      userStreamTrackerService,
      userStreamIngestionService,
      exchangeOrderTrackerService,
      strategyService,
      orderBookTrackerService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'running',
      source: 'admin_direct',
      createdAt: '2026-04-01T00:00:00.000Z',
      apiKeyId: 'api-key-1',
      strategySnapshot: {
        resolvedConfig: {
          accountLabel: 'api-key-1',
          orderAmount: 10,
        },
      },
    });
    executorRegistry.findExecutorByOrderId.mockReturnValue({
      getSession: () => ({
        orderId: 'order-1',
        cadenceMs: 5000,
        nextRunAtMs: Date.now() + 5000,
      }),
    });
    userStreamTrackerService.getLatestEvent.mockReturnValue({
      receivedAt: '2026-04-01T00:00:02.000Z',
    });
    userStreamIngestionService.getActiveWatcherCount.mockReturnValue(3);
    userStreamIngestionService.getWatcherState.mockReturnValue({
      order: true,
      trade: true,
      balance: true,
      orderRefCount: 1,
      tradeRefCount: 1,
      balanceRefCount: 1,
    });
    userStreamTrackerService.getQueueDepth.mockReturnValue(2);
    userStreamTrackerService.getDuplicateFillSuppressionCount.mockReturnValue(
      4,
    );
    exchangeOrderTrackerService.getOpenOrders.mockReturnValue([]);
    strategyService.getLatestIntentsForStrategy.mockReturnValue([]);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[101, 1]],
    });
    executorRegistry.findExecutorByOrderId.mockReturnValue({
      getSession: () => ({
        orderId: 'order-1',
        cadenceMs: 5000,
        nextRunAtMs: Date.now() + 5000,
      }),
    });

    const result = await service.getDirectOrderStatus('order-1');

    expect(result.executorHealth).toBe('active');
    expect(result.runtimeState).toBe('active');
    expect(result.accountLabel).toBe('desk-1');
    expect(result.userStreamRuntime).toEqual({
      activeWatcherCount: 3,
      queueDepth: 2,
      duplicateFillSuppressionCount: 4,
    });
    expect(result.streamHealth).toEqual([
      expect.objectContaining({
        accountLabel: 'api-key-1',
        state: 'silent',
        order: true,
        trade: true,
        balance: true,
        lastEventAt: '2026-04-01T00:00:02.000Z',
      }),
    ]);
    expect(result.orderConfig).toEqual({
      orderAmount: '10',
      bidSpread: null,
      askSpread: null,
      numberOfLayers: null,
      baseIntervalTime: null,
      numTrades: null,
      baseIncrementPercentage: null,
      pricePushRate: null,
      postOnlySide: null,
      dynamicRoleSwitching: null,
      targetQuoteVolume: null,
      cadenceVariance: null,
      tradeAmountVariance: null,
      priceOffsetVariance: null,
      publishedCycles: null,
      completedCycles: null,
      tradedQuoteVolume: null,
      realizedPnlQuote: null,
    });
    expect(result.spread).toEqual({ bid: '100', ask: '101', absolute: '1' });
  });

  it('reports failed runtime state when the intent queue is blocked by a failed head intent', async () => {
    const {
      service,
      marketMakingRepository,
      executorRegistry,
      strategyIntentStoreService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'running',
      source: 'admin_direct',
      createdAt: '2026-04-01T00:00:00.000Z',
      strategySnapshot: buildStrategySnapshot({
        accountLabel: 'api-key-1',
      }),
    });
    executorRegistry.findExecutorByOrderId.mockReturnValue({
      getSession: () => ({
        orderId: 'order-1',
        cadenceMs: 5000,
        nextRunAtMs: Date.now() + 5000,
      }),
      getRecentErrors: () => [],
    });
    strategyIntentStoreService.getQueueState.mockResolvedValue({
      blockedByFailure: true,
      headIntentStatus: 'FAILED',
      failedHeadIntentId: 'intent-1',
      failedHeadUpdatedAt: '2026-04-01T00:00:03.000Z',
      failedHeadErrorReason: 'minimum notional',
    });

    const result = await service.getDirectOrderStatus('order-1');

    expect(result.executorHealth).toBe('active');
    expect(result.runtimeState).toBe('failed');
    expect(result.lastUpdatedAt).toBe('2026-04-01T00:00:03.000Z');
    expect(result.recentErrors).toEqual([
      {
        ts: '2026-04-01T00:00:03.000Z',
        message: 'minimum notional',
      },
    ]);
  });
});

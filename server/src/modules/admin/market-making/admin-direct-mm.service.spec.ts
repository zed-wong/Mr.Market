/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BalanceStateCacheService } from 'src/modules/market-making/balance-state/balance-state-cache.service';
import { OrderScopedBalanceQueryService } from 'src/modules/market-making/balance-state/order-scoped-balance-query.service';
import { DualAccountPlannerService } from 'src/modules/market-making/strategy/dual-account/dual-account-planner.service';
import { QuotePlannerService } from 'src/modules/market-making/strategy/quote/quote-planner.service';

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

  const buildService = (options?: {
    balanceStateCacheService?: any;
    balanceLedgerService?: any;
    dualAccountPlannerService?: any;
  }) => {
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
    const balanceLedgerService = options?.balanceLedgerService || {
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
    const balanceStateCacheService = options?.balanceStateCacheService || {
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
    const readyReadiness = {
      canStart: true,
      mode: 'balanced',
      bestFirstAction: {
        makerAccountLabel: 'api-key-1',
        takerAccountLabel: 'api-key-2',
        side: 'buy',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        quantity: '0.5',
        price: '100',
        notional: '50',
      },
      maximumCycleQty: '0.5',
      recommendedCycleQty: '0.5',
      minimumCapitalByAccountAsset: [],
      recommendedCapitalByAccountAsset: [],
      missingBalances: [],
      estimatedCycles: { count: '2', basis: 'current_available_balances' },
      estimatedVolume: {
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        baseAmount: '1',
        quoteAmount: '100',
      },
      blockingReasons: [],
    };
    const dualAccountPlannerService = options?.dualAccountPlannerService || {
      evaluateEfficientDualAccountReadiness: jest
        .fn()
        .mockResolvedValue(readyReadiness),
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
      dualAccountPlannerService as any,
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
      dualAccountPlannerService,
      readyReadiness,
    };
  };

  const buildServiceWithRealEfficientReadiness = (options?: {
    makerBalance?: Record<string, Record<string, number>>;
    takerBalance?: Record<string, Record<string, number>>;
  }) => {
    const balanceStateCacheService = new BalanceStateCacheService();
    const freshnessTimestamp = new Date().toISOString();
    const balanceLedgerService = {
      hasDepositCredit: jest.fn().mockResolvedValue(false),
      creditDeposit: jest.fn().mockResolvedValue({ applied: true }),
      getExistingBalance: jest.fn().mockResolvedValue(null),
      unlockFunds: jest.fn().mockResolvedValue({ applied: true }),
    };
    const exchangeConnector = {
      getCachedTradingRules: jest.fn().mockReturnValue({
        amountMin: 0.001,
        costMin: 10,
        makerFee: 0.001,
        takerFee: 0.001,
      }),
      loadTradingRules: jest.fn(),
      fetchOrderBook: jest.fn(),
      fetchBalance: jest.fn(),
      placeLimitOrder: jest.fn(),
      cancelOrder: jest.fn(),
      quantizeOrder: jest.fn(
        (_exchangeName: string, _pair: string, qty: string, price: string) => ({
          qty,
          price,
        }),
      ),
    };
    const marketDataProvider = {
      getTrackedOrderBookFreshness: jest.fn(() => ({ fresh: true })),
      getTrackedBestBidAsk: jest.fn(() => ({
        bestBid: '99',
        bestAsk: '101',
      })),
    };
    const intentStore = {
      createLimitOrderIntent: jest.fn(),
    };
    const orderScopedBalanceQueryService = new OrderScopedBalanceQueryService(
      balanceLedgerService as any,
      balanceStateCacheService,
    );
    const quotePlanner = new QuotePlannerService(exchangeConnector as any);
    const dualAccountPlannerService = new DualAccountPlannerService(
      exchangeConnector as any,
      orderScopedBalanceQueryService,
      marketDataProvider as any,
      undefined,
      quotePlanner,
      intentStore as any,
    );

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'api-key-1',
      options?.makerBalance || {
        free: { BTC: 0, USDT: 1000 },
        used: { BTC: 0, USDT: 0 },
        total: { BTC: 0, USDT: 1000 },
      },
      freshnessTimestamp,
      'ws',
    );
    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'api-key-2',
      options?.takerBalance || {
        free: { BTC: 1, USDT: 0 },
        used: { BTC: 0, USDT: 0 },
        total: { BTC: 1, USDT: 0 },
      },
      freshnessTimestamp,
      'ws',
    );

    return {
      ...buildService({
        balanceStateCacheService,
        balanceLedgerService,
        dualAccountPlannerService,
      }),
      balanceStateCacheService,
      balanceLedgerService,
      exchangeConnector,
      marketDataProvider,
      intentStore,
      orderScopedBalanceQueryService,
      dualAccountPlannerService,
    };
  };

  const configureEfficientDefinition = ({
    strategyDefinitionRepository,
    strategyConfigResolver,
  }: {
    strategyDefinitionRepository: { findOne: jest.Mock };
    strategyConfigResolver: {
      getDefinitionControllerType: jest.Mock;
      resolveForOrderSnapshot: jest.Mock;
    };
  }) => {
    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-efficient',
      key: 'efficient-dual-account-volume',
      name: 'Efficient Dual Account Volume',
      enabled: true,
      controllerType: 'efficientDualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'efficientDualAccountVolume',
    );
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'efficientDualAccountVolume',
      definitionKey: 'efficient-dual-account-volume',
      definitionName: 'Efficient Dual Account Volume',
      resolvedConfig: {
        symbol: 'BTC/USDT',
        maxOrderAmount: '0.5',
        interval: 30,
      },
    });
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
        message: 'Invalid campaign details or already joined: campaign ended',
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
    expect(
      userOrdersService.updateMarketMakingOrderState,
    ).not.toHaveBeenCalled();
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

  it('cancels active tracked exchange orders before removing a stopped direct order', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      exchangeOrderTrackerService,
      orderReservationService,
    } = buildService();
    const trackedOrder = {
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
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: '2026-05-23T00:00:00.000Z',
      updatedAt: '2026-05-23T00:00:01.000Z',
    };

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      userId: 'admin-user',
      state: 'stopped',
      source: 'admin_direct',
      pair: 'BTC/USDT',
      strategySnapshot: buildStrategySnapshot({}),
    });
    exchangeOrderTrackerService.getTrackedOrders.mockImplementation(() => [
      trackedOrder,
    ]);
    marketMakingRuntimeService.stopOrder.mockImplementation(async () => {
      trackedOrder.status = 'cancelled';
    });

    await expect(service.removeDirectOrder('order-1')).resolves.toEqual({
      orderId: 'order-1',
      state: 'removed',
    });
    expect(marketMakingRuntimeService.stopOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1' }),
      'admin-user',
    );
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
      filledQty: '0',
      reason: 'exchange_order_cancelled',
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

  it('does not remove a direct order when active tracked exchange orders remain after cancellation', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      exchangeOrderTrackerService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      userId: 'admin-user',
      state: 'failed',
      source: 'admin_direct',
      pair: 'BTC/USDT',
      strategySnapshot: buildStrategySnapshot({}),
    });
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([
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
        cumulativeFilledQty: '0',
        status: 'open',
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:01.000Z',
      },
    ]);

    await expect(service.removeDirectOrder('order-1')).rejects.toThrow(
      'active exchange order(s) remain after cancellation',
    );
    expect(marketMakingRuntimeService.stopOrder).toHaveBeenCalled();
    expect(marketMakingRepository.update).not.toHaveBeenCalled();
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

  it('rejects classic dual-account direct starts so new orders use the unified contract', async () => {
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

    await expect(
      service.directStart(dualAccountStartDto, 'admin-user'),
    ).rejects.toThrow(
      'Legacy dual-account strategy variants cannot be used for new direct orders',
    );
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
  });

  it('rejects best-capacity dual-account direct starts so hidden variants do not re-enter', async () => {
    const {
      service,
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

    await expect(
      service.directStart(dualAccountStartDto, 'admin-user'),
    ).rejects.toThrow(
      'Legacy dual-account strategy variants cannot be used for new direct orders',
    );
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
  });

  it('starts an efficient unified dual-account direct order with normalized contract defaults', async () => {
    const {
      service,
      marketMakingRuntimeService,
      strategyDefinitionRepository,
      strategyConfigResolver,
      userOrdersService,
      dualAccountPlannerService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-efficient',
      key: 'efficient-dual-account-volume',
      name: 'Efficient Dual Account Volume',
      enabled: true,
      controllerType: 'efficientDualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'efficientDualAccountVolume',
    );
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'efficientDualAccountVolume',
      definitionKey: 'efficient-dual-account-volume',
      definitionName: 'Efficient Dual Account Volume',
      resolvedConfig: {
        symbol: 'BTC/USDT',
        maxOrderAmount: '0.5',
        interval: 30,
        tradeAmountVariance: 0.2,
        priceOffsetVariance: 0.05,
        cycleMode: 'static',
        dynamicRoleSwitching: false,
        balanceA: '1',
        balanceB: '1000',
      },
    });

    const result = await service.directStart(
      {
        ...dualAccountStartDto,
        strategyDefinitionId: 'strategy-efficient',
        configOverrides: {
          maxOrderAmount: 0.5,
          interval: 30,
          tradeAmountVariance: 0.2,
          priceOffsetVariance: 0.05,
          cycleMode: 'static',
          dynamicRoleSwitching: false,
        },
      },
      'admin-user',
    );

    expect(result).toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySnapshot: expect.objectContaining({
          controllerType: 'efficientDualAccountVolume',
          definitionKey: 'efficient-dual-account-volume',
          resolvedConfig: expect.objectContaining({
            exchangeName: 'binance',
            symbol: 'BTC/USDT',
            pair: 'BTC/USDT',
            makerAccountLabel: 'api-key-1',
            takerAccountLabel: 'api-key-2',
            mode: 'balanced',
            cycleMode: 'alternating',
            dynamicRoleSwitching: true,
            strategyContract: 'efficientDualAccountVolume',
            tradeAmountVariance: 0.2,
            priceOffsetVariance: 0.05,
          }),
        }),
      }),
    );
    expect(marketMakingRuntimeService.startOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySnapshot: expect.objectContaining({
          controllerType: 'efficientDualAccountVolume',
        }),
      }),
    );
    expect(
      dualAccountPlannerService.evaluateEfficientDualAccountReadiness,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        makerAccountLabel: 'api-key-1',
        takerAccountLabel: 'api-key-2',
        mode: 'balanced',
        cycleMode: 'alternating',
        dynamicRoleSwitching: true,
      }),
    );
  });

  it('returns planner-backed readiness without creating execution side effects', async () => {
    const {
      service,
      strategyDefinitionRepository,
      strategyConfigResolver,
      dualAccountPlannerService,
      readyReadiness,
      userOrdersService,
      marketMakingRuntimeService,
      balanceLedgerService,
      exchange,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-efficient',
      key: 'efficient-dual-account-volume',
      name: 'Efficient Dual Account Volume',
      enabled: true,
      controllerType: 'efficientDualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'efficientDualAccountVolume',
    );
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'efficientDualAccountVolume',
      definitionKey: 'efficient-dual-account-volume',
      definitionName: 'Efficient Dual Account Volume',
      resolvedConfig: {
        symbol: 'BTC/USDT',
        maxOrderAmount: '0.5',
        interval: 30,
        cycleMode: 'static',
        dynamicRoleSwitching: false,
      },
    });

    await expect(
      service.evaluateDirectReadiness({
        ...dualAccountStartDto,
        strategyDefinitionId: 'strategy-efficient',
        configOverrides: {
          cycleMode: 'static',
          dynamicRoleSwitching: false,
        },
      }),
    ).resolves.toEqual(readyReadiness);

    expect(
      dualAccountPlannerService.evaluateEfficientDualAccountReadiness,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyContract: 'efficientDualAccountVolume',
        makerAccountLabel: 'api-key-1',
        takerAccountLabel: 'api-key-2',
        cycleMode: 'alternating',
        dynamicRoleSwitching: true,
      }),
    );
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
    expect(exchange.fetchBalance).not.toHaveBeenCalled();
    expect(exchange.fetchTicker).not.toHaveBeenCalled();
  });

  it('evaluates new efficient direct-readiness from selected-account balances before order ledger rows exist', async () => {
    const fixture = buildServiceWithRealEfficientReadiness();
    const {
      service,
      balanceLedgerService,
      exchange,
      exchangeConnector,
      intentStore,
      userOrdersService,
      marketMakingRuntimeService,
      orderReservationService,
    } = fixture;

    configureEfficientDefinition(fixture);

    await expect(
      service.evaluateDirectReadiness({
        ...dualAccountStartDto,
        strategyDefinitionId: 'strategy-efficient',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        canStart: true,
        mode: 'balanced',
        blockingReasons: [],
        missingBalances: [],
        bestFirstAction: expect.objectContaining({
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          side: 'buy',
          quantity: '0.5',
        }),
      }),
    );

    expect(balanceLedgerService.getExistingBalance).not.toHaveBeenCalled();
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
    expect(
      orderReservationService.recoverDanglingReservationsForOrder,
    ).not.toHaveBeenCalled();
    expect(exchange.fetchBalance).not.toHaveBeenCalled();
    expect(exchange.fetchTicker).not.toHaveBeenCalled();
    expect(exchangeConnector.fetchBalance).not.toHaveBeenCalled();
    expect(exchangeConnector.fetchOrderBook).not.toHaveBeenCalled();
    expect(exchangeConnector.placeLimitOrder).not.toHaveBeenCalled();
    expect(exchangeConnector.cancelOrder).not.toHaveBeenCalled();
    expect(intentStore.createLimitOrderIntent).not.toHaveBeenCalled();
  });

  it('direct-start revalidates new efficient orders from selected-account balances before seeding order ledger rows', async () => {
    const fixture = buildServiceWithRealEfficientReadiness();
    const {
      service,
      balanceLedgerService,
      userOrdersService,
      marketMakingRuntimeService,
    } = fixture;

    configureEfficientDefinition(fixture);

    await expect(
      service.directStart(
        {
          ...dualAccountStartDto,
          strategyDefinitionId: 'strategy-efficient',
        },
        'admin-user',
      ),
    ).resolves.toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });

    expect(balanceLedgerService.getExistingBalance).not.toHaveBeenCalled();
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'admin_direct',
        strategySnapshot: expect.objectContaining({
          resolvedConfig: expect.objectContaining({
            marketMakingOrderId: expect.any(String),
            makerAccountLabel: 'api-key-1',
            takerAccountLabel: 'api-key-2',
          }),
        }),
      }),
    );
    expect(balanceLedgerService.creditDeposit).toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).toHaveBeenCalled();
  });

  it('direct-start blocks unsafe efficient orders with planner balance blockers from real collaborators', async () => {
    const fixture = buildServiceWithRealEfficientReadiness({
      makerBalance: {
        free: { BTC: 0, USDT: 4 },
        used: { BTC: 0, USDT: 0 },
        total: { BTC: 0, USDT: 4 },
      },
      takerBalance: {
        free: { BTC: 0, USDT: 0 },
        used: { BTC: 0, USDT: 0 },
        total: { BTC: 0, USDT: 0 },
      },
    });
    const {
      service,
      userOrdersService,
      marketMakingRuntimeService,
      balanceLedgerService,
    } = fixture;

    configureEfficientDefinition(fixture);

    await expect(
      service.directStart(
        {
          ...dualAccountStartDto,
          strategyDefinitionId: 'strategy-efficient',
        },
        'admin-user',
      ),
    ).rejects.toThrow(
      'Planner readiness blocked start: No dual-account role/direction candidate satisfies exchange minimums with the current balances',
    );

    await expect(
      service.directStart(
        {
          ...dualAccountStartDto,
          strategyDefinitionId: 'strategy-efficient',
        },
        'admin-user',
      ),
    ).rejects.toThrow(/api-key-1 needs .* USDT/);
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
  });

  it('blocks efficient direct start when planner readiness is not startable', async () => {
    const {
      service,
      strategyDefinitionRepository,
      strategyConfigResolver,
      dualAccountPlannerService,
      userOrdersService,
      marketMakingRuntimeService,
      balanceLedgerService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-efficient',
      key: 'efficient-dual-account-volume',
      name: 'Efficient Dual Account Volume',
      enabled: true,
      controllerType: 'efficientDualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'efficientDualAccountVolume',
    );
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'efficientDualAccountVolume',
      definitionKey: 'efficient-dual-account-volume',
      definitionName: 'Efficient Dual Account Volume',
      resolvedConfig: {
        symbol: 'BTC/USDT',
        maxOrderAmount: '0.5',
        interval: 30,
      },
    });
    dualAccountPlannerService.evaluateEfficientDualAccountReadiness.mockResolvedValue(
      {
        canStart: false,
        mode: 'balanced',
        bestFirstAction: null,
        maximumCycleQty: '0',
        recommendedCycleQty: '0',
        minimumCapitalByAccountAsset: [],
        recommendedCapitalByAccountAsset: [],
        missingBalances: [
          {
            accountLabel: 'api-key-1',
            asset: 'USDT',
            availableAmount: '4',
            minimumUsefulAmount: '15',
            missingAmount: '11',
          },
        ],
        estimatedCycles: { count: '0', basis: 'current_available_balances' },
        estimatedVolume: {
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          baseAmount: '0',
          quoteAmount: '0',
        },
        blockingReasons: [
          {
            code: 'below_exchange_minimums',
            message: 'USDT balance is below the exchange minimum plus buffer',
          },
        ],
      },
    );

    await expect(
      service.directStart(
        {
          ...dualAccountStartDto,
          strategyDefinitionId: 'strategy-efficient',
        },
        'admin-user',
      ),
    ).rejects.toThrow(
      'Planner readiness blocked start: USDT balance is below the exchange minimum plus buffer; api-key-1 needs 11 USDT',
    );

    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
  });

  it('includes planner-backed readiness in efficient direct status without live exchange balance fetch', async () => {
    const {
      service,
      marketMakingRepository,
      exchange,
      dualAccountPlannerService,
      readyReadiness,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-efficient',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'stopped',
      source: 'admin_direct',
      createdAt: '2026-04-01T00:00:00.000Z',
      apiKeyId: 'api-key-1',
      strategySnapshot: buildStrategySnapshot(
        {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          pair: 'BTC/USDT',
          userId: 'admin-user',
          clientId: 'order-efficient',
          marketMakingOrderId: 'order-efficient',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          maxOrderAmount: '0.5',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
        },
        'efficientDualAccountVolume',
      ),
    });

    const result = await service.getDirectOrderStatus('order-efficient');

    expect(result.readiness).toEqual(readyReadiness);
    expect(
      dualAccountPlannerService.evaluateEfficientDualAccountReadiness,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        marketMakingOrderId: 'order-efficient',
        makerAccountLabel: 'api-key-1',
        takerAccountLabel: 'api-key-2',
      }),
    );
    expect(exchange.fetchBalance).not.toHaveBeenCalled();
  });

  it('keeps persisted efficient status readiness bound to order-scoped ledger balances', async () => {
    const fixture = buildServiceWithRealEfficientReadiness({
      makerBalance: {
        free: { BTC: 0, USDT: 0 },
        used: { BTC: 0, USDT: 0 },
        total: { BTC: 0, USDT: 0 },
      },
      takerBalance: {
        free: { BTC: 0, USDT: 0 },
        used: { BTC: 0, USDT: 0 },
        total: { BTC: 0, USDT: 0 },
      },
    });
    const { service, marketMakingRepository, balanceLedgerService, exchange } =
      fixture;

    balanceLedgerService.getExistingBalance.mockImplementation(
      async (_orderId: string, assetId: string) => {
        const amount = assetId === 'BTC' ? '1' : '1000';

        return {
          available: amount,
          total: amount,
        };
      },
    );
    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-efficient',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'stopped',
      source: 'admin_direct',
      createdAt: '2026-04-01T00:00:00.000Z',
      userId: 'admin-user',
      apiKeyId: 'api-key-1',
      strategySnapshot: buildStrategySnapshot(
        {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          pair: 'BTC/USDT',
          userId: 'admin-user',
          clientId: 'order-efficient',
          marketMakingOrderId: 'order-efficient',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          maxOrderAmount: '0.5',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
        },
        'efficientDualAccountVolume',
      ),
    });

    const result = await service.getDirectOrderStatus('order-efficient');

    expect(result.readiness).toEqual(
      expect.objectContaining({
        canStart: true,
        bestFirstAction: expect.objectContaining({
          makerAccountLabel: expect.any(String),
          takerAccountLabel: expect.any(String),
        }),
      }),
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-efficient',
      'BTC',
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-efficient',
      'USDT',
    );
    expect(exchange.fetchBalance).not.toHaveBeenCalled();
  });

  it('aggregates deterministic runtime cycle status from intents, tracked orders, and active params', async () => {
    const {
      service,
      marketMakingRepository,
      strategyService,
      exchangeOrderTrackerService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-cycle',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'running',
      source: 'admin_direct',
      createdAt: '2026-04-01T00:00:00.000Z',
      userId: 'admin-user',
      apiKeyId: 'api-key-1',
      strategySnapshot: buildStrategySnapshot(
        {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          pair: 'BTC/USDT',
          userId: 'admin-user',
          clientId: 'order-cycle',
          marketMakingOrderId: 'order-cycle',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
          activeCycle: {
            cycleId: 'cycle-runtime-1',
            tickId: '2026-04-01T00:00:01.000Z',
            orderId: 'order-cycle',
            makerSide: 'buy',
            makerAccountLabel: 'api-key-1',
            takerAccountLabel: 'api-key-2',
            price: '100',
            requestedQty: '0.5',
            makerFilledQty: '0.25',
            takerFilledQty: '0.1',
          },
        },
        'efficientDualAccountVolume',
      ),
    });
    strategyService.getLatestIntentsForStrategy.mockReturnValue([
      {
        intentId: 'maker-intent',
        strategyKey: 'strategy-cycle',
        accountLabel: 'api-key-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        status: 'DONE',
        metadata: {
          cycleId: 'cycle-runtime-1',
          cycleRole: 'maker',
          role: 'maker',
          accountLabel: 'api-key-1',
          side: 'buy',
          plannedQty: '0.5',
          plannedPrice: '100',
          filledQty: '0',
          notional: '50',
          status: 'planned',
          failureReason: null,
          linkedIntentId: 'maker-intent',
          linkedTrackedOrderId: null,
        },
      },
      {
        intentId: 'maker-intent:inline-taker',
        strategyKey: 'strategy-cycle',
        accountLabel: 'api-key-2',
        side: 'sell',
        price: '100',
        qty: '0.5',
        status: 'FAILED',
        errorReason: 'Immediate dual-account taker did not fill any quantity',
        metadata: {
          cycleId: 'cycle-runtime-1',
          cycleRole: 'taker',
          role: 'taker',
          accountLabel: 'api-key-2',
          side: 'sell',
          plannedQty: '0.5',
          plannedPrice: '100',
          filledQty: '0',
          notional: '50',
          status: 'failed',
          failureReason: 'Immediate dual-account taker did not fill any quantity',
          linkedIntentId: 'maker-intent:inline-taker',
          linkedTrackedOrderId: null,
        },
      },
    ]);
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([
      {
        orderId: 'order-cycle',
        strategyKey: 'strategy-cycle',
        exchange: 'binance',
        accountLabel: 'api-key-1',
        pair: 'BTC/USDT',
        exchangeOrderId: 'maker-order',
        role: 'maker',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeFilledQty: '0.25',
        status: 'partially_filled',
        createdAt: '2026-04-01T00:00:01.000Z',
        updatedAt: '2026-04-01T00:00:02.000Z',
      },
      {
        orderId: 'order-cycle',
        strategyKey: 'strategy-cycle',
        exchange: 'binance',
        accountLabel: 'api-key-2',
        pair: 'BTC/USDT',
        exchangeOrderId: 'taker-order',
        role: 'taker',
        side: 'sell',
        price: '100',
        qty: '0.5',
        cumulativeFilledQty: '0.1',
        status: 'failed',
        createdAt: '2026-04-01T00:00:01.000Z',
        updatedAt: '2026-04-01T00:00:03.000Z',
      },
    ]);

    const result = await service.getDirectOrderStatus('order-cycle');

    expect(result.cycles).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-runtime-1',
        aggregateStatus: 'failed',
        failureReason: 'Immediate dual-account taker did not fill any quantity',
        legs: expect.arrayContaining([
          expect.objectContaining({
            cycleRole: 'maker',
            accountLabel: 'api-key-1',
            side: 'buy',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0.25',
            notional: '50',
            status: 'partially_filled',
            failureReason: null,
            linkedIntentId: 'maker-intent',
            linkedTrackedOrderId: 'maker-order',
          }),
          expect.objectContaining({
            cycleRole: 'taker',
            accountLabel: 'api-key-2',
            side: 'sell',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0.1',
            notional: '50',
            status: 'failed',
            failureReason:
              'Immediate dual-account taker did not fill any quantity',
            linkedIntentId: 'maker-intent:inline-taker',
            linkedTrackedOrderId: 'taker-order',
          }),
        ]),
      }),
    ]);
  });

  it('rejects legacy dual-account definitions for new direct-start orders', async () => {
    const { service, strategyDefinitionRepository, strategyConfigResolver } =
      buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-legacy',
      enabled: true,
      controllerType: 'dualAccountBestCapacityVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'dualAccountBestCapacityVolume',
    );

    await expect(
      service.directStart(
        {
          ...dualAccountStartDto,
          strategyDefinitionId: 'strategy-legacy',
        },
        'admin-user',
      ),
    ).rejects.toThrow(
      'Legacy dual-account strategy variants cannot be used for new direct orders',
    );

    expect(
      strategyConfigResolver.resolveForOrderSnapshot,
    ).not.toHaveBeenCalled();
  });

  it('hides legacy dual-account variants from new direct strategy definitions', async () => {
    const { service, strategyDefinitionRepository } = buildService();

    strategyDefinitionRepository.find.mockResolvedValue([
      {
        id: 'strategy-classic',
        name: 'Dual Account Volume',
        enabled: true,
        visibility: 'admin',
        controllerType: 'dualAccountVolume',
        capabilities: dualAccountLaunchConfig,
      },
      {
        id: 'strategy-best',
        name: 'Dual Account Best Capacity Volume',
        enabled: true,
        visibility: 'admin',
        controllerType: 'dualAccountBestCapacityVolume',
        capabilities: dualAccountLaunchConfig,
      },
      {
        id: 'strategy-efficient',
        name: 'Efficient Dual Account Volume',
        enabled: true,
        visibility: 'admin',
        controllerType: 'efficientDualAccountVolume',
        capabilities: dualAccountLaunchConfig,
      },
    ]);

    await expect(service.listDirectStrategyDefinitions()).resolves.toEqual([
      expect.objectContaining({
        id: 'strategy-efficient',
        controllerType: 'efficientDualAccountVolume',
      }),
    ]);
  });

  it('rejects reserved config override fields before resolving dual-account config', async () => {
    const { service, strategyDefinitionRepository, strategyConfigResolver } =
      buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-2',
      enabled: true,
      controllerType: 'efficientDualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'efficientDualAccountVolume',
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
      controllerType: 'efficientDualAccountVolume',
      capabilities: dualAccountLaunchConfig,
      configSchema: {},
    });
    strategyConfigResolver.getDefinitionControllerType.mockReturnValue(
      'efficientDualAccountVolume',
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

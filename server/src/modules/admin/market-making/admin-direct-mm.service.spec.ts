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
    strategyInstanceRepository?: any;
    strategyOrderIntentRepository?: any;
    strategyExecutionHistoryRepository?: any;
    trackedOrderRepository?: any;
    exchangeConnectorAdapterService?: any;
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
      save: jest.fn(async (payload) => payload),
    };
    const campaignJoinRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => payload),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const strategyOrderIntentRepository =
      options?.strategyOrderIntentRepository || {
        find: jest.fn().mockResolvedValue([]),
      };
    const strategyInstanceRepository = options?.strategyInstanceRepository || {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const strategyExecutionHistoryRepository =
      options?.strategyExecutionHistoryRepository || {
        find: jest.fn().mockResolvedValue([]),
      };
    const trackedOrderRepository = options?.trackedOrderRepository || {
      find: jest.fn().mockResolvedValue([]),
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
      findByOrderId: jest.fn().mockResolvedValue([]),
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
    const exchangeConnectorAdapterService =
      options?.exchangeConnectorAdapterService || {
        loadTradingRules: jest.fn().mockResolvedValue({
          amountMin: 0.001,
          costMin: 10,
          makerFee: 0.001,
          takerFee: 0.001,
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
      dualAccountPlannerService as any,
      exchangeConnectorAdapterService as any,
      strategyInstanceRepository as any,
      strategyOrderIntentRepository as any,
      strategyExecutionHistoryRepository as any,
      trackedOrderRepository as any,
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
      exchangeConnectorAdapterService,
      readyReadiness,
      strategyInstanceRepository,
      strategyOrderIntentRepository,
      strategyExecutionHistoryRepository,
      trackedOrderRepository,
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
      findByOrderId: jest.fn().mockResolvedValue([]),
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

  it('resumes a paused direct order using persisted edited strategy parameters', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      userOrdersService,
      balanceLedgerService,
      exchange,
    } = buildService();

    const editedSnapshot = buildStrategySnapshot({
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      symbol: 'BTC/USDT',
      userId: 'admin-user',
      clientId: 'order-1',
      marketMakingOrderId: 'order-1',
      accountLabel: 'api-key-1',
      bidSpread: 0.004,
      askSpread: 0.005,
      orderAmount: 15,
      orderRefreshTime: 2500,
      numberOfLayers: 3,
      priceSourceType: 'last_trade',
      amountChangePerLayer: 0,
      amountChangeType: 'fixed',
      ceilingPrice: 0,
      floorPrice: 0,
      balanceA: '1',
      balanceB: '1000',
    });

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      userId: 'admin-user',
      source: 'admin_direct',
      state: 'paused',
      pair: 'BTC/USDT',
      exchangeName: 'binance',
      apiKeyId: 'api-key-1',
      strategyDefinitionId: 'strategy-1',
      strategySnapshot: editedSnapshot,
      balanceA: '1',
      balanceB: '1000',
    });

    await expect(service.directResume('order-1')).resolves.toEqual({
      orderId: 'order-1',
      state: 'running',
      warnings: expect.any(Array),
    });
    expect(marketMakingRuntimeService.startOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'paused',
        strategySnapshot: expect.objectContaining({
          resolvedConfig: expect.objectContaining({
            bidSpread: 0.004,
            askSpread: 0.005,
            orderAmount: 15,
            orderRefreshTime: 2500,
            numberOfLayers: 3,
            priceSourceType: 'last_trade',
            clientId: 'order-1',
            marketMakingOrderId: 'order-1',
          }),
        }),
      }),
    );
    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      'order-1',
      'running',
    );
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalledWith(
      expect.objectContaining({ refType: 'generic_balance_adjustment' }),
    );
    expect(exchange.fetchBalance).toHaveBeenCalledTimes(1);
    expect(exchange.fetchTicker).toHaveBeenCalledTimes(1);
  });

  it('allows direct resume when only stopped sibling orders exceed exchange free balance', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      orderBalanceRepository,
      exchange,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'resume-order',
      userId: 'admin-user',
      source: 'admin_direct',
      state: 'stopped',
      pair: 'BTC/USDT',
      exchangeName: 'binance',
      apiKeyId: 'api-key-1',
      strategyDefinitionId: 'strategy-1',
      strategySnapshot: buildStrategySnapshot({
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        symbol: 'BTC/USDT',
        userId: 'admin-user',
        clientId: 'resume-order',
        marketMakingOrderId: 'resume-order',
        accountLabel: 'api-key-1',
        bidSpread: 0.004,
        askSpread: 0.005,
        orderAmount: 0.1,
        orderRefreshTime: 2500,
        numberOfLayers: 1,
        priceSourceType: 'last_trade',
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        ceilingPrice: 0,
        floorPrice: 0,
        balanceA: '0.1',
        balanceB: '10',
      }),
      balanceA: '0.1',
      balanceB: '10',
    });
    marketMakingRepository.find.mockImplementation(async (query) => {
      expect((query.where.state as any)._value).toEqual([
        'running',
        'paused',
      ]);

      return [];
    });
    exchange.fetchBalance.mockResolvedValue({
      free: { BTC: 1, USDT: 15 },
      used: {},
      total: {},
    });

    await expect(service.directResume('resume-order')).resolves.toEqual({
      orderId: 'resume-order',
      state: 'running',
      warnings: expect.any(Array),
    });
    expect(orderBalanceRepository.find).not.toHaveBeenCalled();
    expect(marketMakingRuntimeService.startOrder).toHaveBeenCalled();
  });

  it('rejects direct resume when running sibling allocations exceed exchange free balance', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      orderBalanceRepository,
      exchange,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'resume-order',
      userId: 'admin-user',
      source: 'admin_direct',
      state: 'stopped',
      pair: 'BTC/USDT',
      exchangeName: 'binance',
      apiKeyId: 'api-key-1',
      strategyDefinitionId: 'strategy-1',
      strategySnapshot: buildStrategySnapshot({
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        symbol: 'BTC/USDT',
        userId: 'admin-user',
        clientId: 'resume-order',
        marketMakingOrderId: 'resume-order',
        accountLabel: 'api-key-1',
        bidSpread: 0.004,
        askSpread: 0.005,
        orderAmount: 0.1,
        orderRefreshTime: 2500,
        numberOfLayers: 1,
        priceSourceType: 'last_trade',
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        ceilingPrice: 0,
        floorPrice: 0,
        balanceA: '0.1',
        balanceB: '10',
      }),
      balanceA: '0.1',
      balanceB: '10',
    });
    marketMakingRepository.find.mockResolvedValue([
      { orderId: 'running-order' },
    ]);
    orderBalanceRepository.find.mockResolvedValue([
      {
        orderId: 'running-order',
        assetId: 'USDT',
        total: '10',
      },
    ]);
    exchange.fetchBalance.mockResolvedValue({
      free: { BTC: 1, USDT: 15 },
      used: {},
      total: {},
    });

    await expect(service.directResume('resume-order')).rejects.toThrow(
      'Account overlap',
    );
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
  });

  it('rejects direct resume with clear copy when only the current order exceeds exchange free balance', async () => {
    const {
      service,
      marketMakingRepository,
      marketMakingRuntimeService,
      exchange,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'resume-order',
      userId: 'admin-user',
      source: 'admin_direct',
      state: 'stopped',
      pair: 'BTC/USDT',
      exchangeName: 'binance',
      apiKeyId: 'api-key-1',
      strategyDefinitionId: 'strategy-1',
      strategySnapshot: buildStrategySnapshot({
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        symbol: 'BTC/USDT',
        userId: 'admin-user',
        clientId: 'resume-order',
        marketMakingOrderId: 'resume-order',
        accountLabel: 'api-key-1',
        bidSpread: 0.004,
        askSpread: 0.005,
        orderAmount: 0.1,
        orderRefreshTime: 2500,
        numberOfLayers: 1,
        priceSourceType: 'last_trade',
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        ceilingPrice: 0,
        floorPrice: 0,
        balanceA: '0.1',
        balanceB: '10.9',
      }),
      balanceA: '0.1',
      balanceB: '10.9',
    });
    marketMakingRepository.find.mockResolvedValue([]);
    exchange.fetchBalance.mockResolvedValue({
      free: { BTC: 1, USDT: '7.3674727385' },
      used: {},
      total: {},
    });

    await expect(service.directResume('resume-order')).rejects.toThrow(
      /current order allocates 10\.9 USDT.*exchange free balance is only 7\.3674727385 USDT/,
    );
    expect(marketMakingRuntimeService.startOrder).not.toHaveBeenCalled();
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

  it('removes a running direct order when its runtime executor is gone', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      state: 'running',
      source: 'admin_direct',
      strategySnapshot: buildStrategySnapshot({}),
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
    const { service, marketMakingRepository, executorRegistry } =
      buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      state: 'running',
      source: 'admin_direct',
    });
    executorRegistry.findExecutorByOrderId.mockReturnValue({
      getSession: jest.fn().mockReturnValue({
        lastTickStartedAt: new Date().toISOString(),
        cadenceMs: 1000,
      }),
    });

    await expect(service.removeDirectOrder('order-1')).rejects.toThrow(
      'Only stopped or failed orders can be removed',
    );
  });

  it('starts classic dual-account direct orders when the legacy definition is selected', async () => {
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
    ).resolves.toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySnapshot: expect.objectContaining({
          controllerType: 'dualAccountVolume',
        }),
      }),
    );
  });

  it('starts best-capacity dual-account direct orders when the legacy definition is selected', async () => {
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
    ).resolves.toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });
    expect(userOrdersService.createMarketMaking).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySnapshot: expect.objectContaining({
          controllerType: 'dualAccountBestCapacityVolume',
        }),
      }),
    );
  });

  it('starts an efficient unified dual-account direct order with normalized contract defaults', async () => {
    const {
      service,
      marketMakingRuntimeService,
      strategyDefinitionRepository,
      strategyConfigResolver,
      userOrdersService,
      exchangeConnectorAdapterService,
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
    expect(
      exchangeConnectorAdapterService.loadTradingRules,
    ).toHaveBeenCalledWith('binance', 'BTC/USDT', 'api-key-1');
    expect(
      exchangeConnectorAdapterService.loadTradingRules,
    ).toHaveBeenCalledWith('binance', 'BTC/USDT', 'api-key-2');
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
  });

  it('starts new efficient orders without planner readiness blocking creation', async () => {
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
      'order-efficient:api-key-1',
      'BTC',
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-efficient:api-key-1',
      'USDT',
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-efficient:api-key-2',
      'BTC',
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-efficient:api-key-2',
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
          failureReason:
            'Immediate dual-account taker did not fill any quantity',
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

  it('shows planned taker leg from maker metadata before inline taker is dispatched', async () => {
    const { service, marketMakingRepository, strategyService } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-planned-taker',
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
          clientId: 'order-planned-taker',
          marketMakingOrderId: 'order-planned-taker',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
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
        status: 'SENT',
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
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
        },
      },
    ]);

    const result = await service.getDirectOrderStatus('order-planned-taker');

    expect(result.cycles).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-runtime-1',
        aggregateStatus: 'pending',
        legs: [
          expect.objectContaining({
            cycleRole: 'maker',
            accountLabel: 'api-key-1',
            side: 'buy',
            plannedQty: '0.5',
            plannedPrice: '100',
          }),
          expect.objectContaining({
            cycleRole: 'taker',
            accountLabel: 'api-key-2',
            side: 'sell',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0',
            status: 'planned',
            linkedIntentId: null,
            linkedTrackedOrderId: null,
          }),
        ],
      }),
    ]);
  });

  it('derives completed cycle metrics from runtime legs for direct status', async () => {
    const {
      service,
      marketMakingRepository,
      strategyService,
      exchangeOrderTrackerService,
    } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-completed-cycle',
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
          clientId: 'order-completed-cycle',
          marketMakingOrderId: 'order-completed-cycle',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          maxOrderAmount: '0.5',
          publishedCycles: 1,
          completedCycles: 0,
          tradedQuoteVolume: '0',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
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
          takerAccountLabel: 'api-key-2',
        },
      },
      {
        intentId: 'maker-intent:inline-taker',
        strategyKey: 'strategy-cycle',
        accountLabel: 'api-key-2',
        side: 'sell',
        price: '100',
        qty: '0.5',
        status: 'DONE',
        metadata: {
          cycleId: 'cycle-runtime-1',
          cycleRole: 'taker',
          role: 'taker',
          accountLabel: 'api-key-2',
          side: 'sell',
          plannedQty: '0.5',
          plannedPrice: '100',
        },
      },
    ]);
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([
      {
        orderId: 'order-completed-cycle:api-key-1',
        strategyKey: 'strategy-cycle',
        exchange: 'binance',
        accountLabel: 'api-key-1',
        pair: 'BTC/USDT',
        exchangeOrderId: 'maker-order',
        role: 'maker',
        side: 'buy',
        price: '100',
        qty: '0.5',
        cumulativeFilledQty: '0.5',
        status: 'filled',
        createdAt: '2026-04-01T00:00:01.000Z',
        updatedAt: '2026-04-01T00:00:02.000Z',
      },
      {
        orderId: 'order-completed-cycle:api-key-2',
        strategyKey: 'strategy-cycle',
        exchange: 'binance',
        accountLabel: 'api-key-2',
        pair: 'BTC/USDT',
        exchangeOrderId: 'taker-order',
        role: 'taker',
        side: 'sell',
        price: '100',
        qty: '0.5',
        cumulativeFilledQty: '0.5',
        status: 'filled',
        createdAt: '2026-04-01T00:00:01.000Z',
        updatedAt: '2026-04-01T00:00:03.000Z',
      },
    ]);

    const result = await service.getDirectOrderStatus('order-completed-cycle');

    expect(result.orderConfig.completedCycles).toBe(1);
    expect(result.orderConfig.tradedQuoteVolume).toBe('50');
    expect(result.cycles).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-runtime-1',
        aggregateStatus: 'completed',
      }),
    ]);
  });

  it('orders unpadded runtime cycle counters numerically in direct status', async () => {
    const { service, marketMakingRepository, strategyService } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-cycle-ordering',
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
          clientId: 'order-cycle-ordering',
          marketMakingOrderId: 'order-cycle-ordering',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
        },
        'efficientDualAccountVolume',
      ),
    });
    strategyService.getLatestIntentsForStrategy.mockReturnValue([
      {
        intentId: 'cycle-10-maker',
        strategyKey: 'strategy-cycle',
        accountLabel: 'api-key-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        status: 'DONE',
        metadata: {
          cycleId:
            'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
          cycleRole: 'maker',
          accountLabel: 'api-key-1',
          side: 'buy',
          plannedQty: '0.5',
          plannedPrice: '100',
          status: 'filled',
        },
      },
      {
        intentId: 'cycle-9-maker',
        strategyKey: 'strategy-cycle',
        accountLabel: 'api-key-1',
        side: 'sell',
        price: '100',
        qty: '0.5',
        status: 'DONE',
        metadata: {
          cycleId:
            'efficient-dual-account-volume:cycle:9:2026-06-04T00:09:00.000Z',
          cycleRole: 'maker',
          accountLabel: 'api-key-1',
          side: 'sell',
          plannedQty: '0.5',
          plannedPrice: '100',
          status: 'filled',
        },
      },
    ]);

    const result = await service.getDirectOrderStatus('order-cycle-ordering');

    expect(result.cycles.map((cycle) => cycle.cycleId)).toEqual([
      'efficient-dual-account-volume:cycle:9:2026-06-04T00:09:00.000Z',
      'efficient-dual-account-volume:cycle:10:2026-06-04T00:10:00.000Z',
    ]);
  });

  it('aggregates runtime cycle status from durable intent history and tracked orders after cache loss', async () => {
    const strategyOrderIntentRepository = {
      find: jest.fn().mockResolvedValue([
        {
          intentId: 'durable-maker-intent',
          runtimeInstanceKey: 'runtime-cycle',
          strategyKey: 'durable-strategy-cycle',
          userId: 'admin-user',
          clientId: 'order-durable-cycle',
          type: 'CREATE_LIMIT_ORDER',
          exchange: 'binance',
          accountLabel: 'api-key-1',
          pair: 'BTC/USDT',
          side: 'buy',
          price: '100',
          qty: '0.5',
          mixinOrderId: 'durable-maker-order',
          postOnly: true,
          timeInForce: 'GTC',
          metadata: {
            cycleId: 'cycle-durable-1',
            cycleRole: 'maker',
            role: 'maker',
            accountLabel: 'api-key-1',
            side: 'buy',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0',
            notional: '50',
            status: 'planned',
            linkedIntentId: 'durable-maker-intent',
          },
          status: 'DONE',
          createdAt: '2026-04-01T00:00:01.000Z',
          updatedAt: '2026-04-01T00:00:02.000Z',
        },
        {
          intentId: 'durable-maker-intent:inline-taker',
          runtimeInstanceKey: 'runtime-cycle',
          strategyKey: 'durable-strategy-cycle',
          userId: 'admin-user',
          clientId: 'order-durable-cycle',
          type: 'CREATE_LIMIT_ORDER',
          exchange: 'binance',
          accountLabel: 'api-key-2',
          pair: 'BTC/USDT',
          side: 'sell',
          price: '100',
          qty: '0.5',
          mixinOrderId: 'durable-taker-order',
          postOnly: false,
          timeInForce: 'IOC',
          metadata: {
            cycleId: 'cycle-durable-1',
            cycleRole: 'taker',
            role: 'taker',
            accountLabel: 'api-key-2',
            side: 'sell',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0',
            notional: '50',
            status: 'failed',
            linkedIntentId: 'durable-maker-intent:inline-taker',
          },
          status: 'FAILED',
          createdAt: '2026-04-01T00:00:02.000Z',
          updatedAt: '2026-04-01T00:00:03.000Z',
        },
      ]),
    };
    const strategyExecutionHistoryRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'execution-taker-failure',
          userId: 'admin-user',
          clientId: 'order-durable-cycle',
          exchange: 'binance',
          pair: 'BTC/USDT',
          side: 'sell',
          amount: '0.5',
          price: '100',
          strategyType: 'efficientDualAccountVolume',
          runtimeInstanceKey: 'runtime-cycle',
          orderId: 'order-durable-cycle',
          status: 'failed',
          metadata: {
            cycleId: 'cycle-durable-1',
            cycleRole: 'taker',
            accountLabel: 'api-key-2',
            side: 'sell',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0.1',
            notional: '50',
            status: 'failed',
            failureReason: 'Immediate durable taker failed after restart',
            linkedIntentId: 'durable-maker-intent:inline-taker',
            linkedTrackedOrderId: 'durable-taker-order',
          },
          executedAt: '2026-04-01T00:00:03.000Z',
        },
      ]),
    };
    const trackedOrderRepository = {
      find: jest.fn().mockResolvedValue([
        {
          trackingKey: 'durable-maker-order',
          orderId: 'order-durable-cycle',
          strategyKey: 'durable-strategy-cycle',
          exchange: 'binance',
          accountLabel: 'api-key-1',
          pair: 'BTC/USDT',
          exchangeOrderId: 'durable-maker-order',
          clientOrderId: 'durable-maker-intent',
          role: 'maker',
          side: 'buy',
          price: '100',
          qty: '0.5',
          cumulativeFilledQty: '0.25',
          status: 'partially_filled',
          createdAt: '2026-04-01T00:00:01.000Z',
          updatedAt: '2026-04-01T00:00:04.000Z',
        },
        {
          trackingKey: 'durable-taker-order',
          orderId: 'order-durable-cycle',
          strategyKey: 'durable-strategy-cycle',
          exchange: 'binance',
          accountLabel: 'api-key-2',
          pair: 'BTC/USDT',
          exchangeOrderId: 'durable-taker-order',
          clientOrderId: 'durable-maker-intent:inline-taker',
          role: 'taker',
          side: 'sell',
          price: '100',
          qty: '0.5',
          cumulativeFilledQty: '0.1',
          status: 'failed',
          createdAt: '2026-04-01T00:00:02.000Z',
          updatedAt: '2026-04-01T00:00:04.000Z',
        },
      ]),
    };
    const {
      service,
      marketMakingRepository,
      strategyService,
      exchangeOrderTrackerService,
    } = buildService({
      strategyOrderIntentRepository,
      strategyExecutionHistoryRepository,
      trackedOrderRepository,
    });

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-durable-cycle',
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
          clientId: 'order-durable-cycle',
          marketMakingOrderId: 'order-durable-cycle',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
        },
        'efficientDualAccountVolume',
      ),
    });
    strategyService.getLatestIntentsForStrategy.mockReturnValue([]);
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([]);
    exchangeOrderTrackerService.getOpenOrders.mockReturnValue([]);

    const result = await service.getDirectOrderStatus('order-durable-cycle');

    expect(strategyOrderIntentRepository.find).toHaveBeenCalled();
    expect(strategyExecutionHistoryRepository.find).toHaveBeenCalled();
    expect(trackedOrderRepository.find).toHaveBeenCalled();
    expect(result.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ intentId: 'durable-maker-intent' }),
        expect.objectContaining({
          intentId: 'durable-maker-intent:inline-taker',
        }),
      ]),
    );
    expect(result.cycles).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-durable-1',
        aggregateStatus: 'failed',
        failureReason: 'Immediate durable taker failed after restart',
        legs: expect.arrayContaining([
          expect.objectContaining({
            cycleRole: 'maker',
            accountLabel: 'api-key-1',
            side: 'buy',
            plannedQty: '0.5',
            filledQty: '0.25',
            status: 'partially_filled',
            linkedIntentId: 'durable-maker-intent',
            linkedTrackedOrderId: 'durable-maker-order',
          }),
          expect.objectContaining({
            cycleRole: 'taker',
            accountLabel: 'api-key-2',
            side: 'sell',
            plannedQty: '0.5',
            filledQty: '0.1',
            status: 'failed',
            failureReason: 'Immediate durable taker failed after restart',
            linkedIntentId: 'durable-maker-intent:inline-taker',
            linkedTrackedOrderId: 'durable-taker-order',
          }),
        ]),
      }),
    ]);
  });

  it('uses durable intent errorReason as the cycle failure reason when metadata has no failure reason', async () => {
    const durableIntentOnlyFailureReason =
      'Durable intent-only taker failure survived restart';
    const strategyOrderIntentRepository = {
      find: jest.fn().mockResolvedValue([
        {
          intentId: 'durable-intent-only-maker',
          runtimeInstanceKey: 'runtime-intent-only-cycle',
          strategyKey: 'durable-intent-only-strategy-cycle',
          userId: 'admin-user',
          clientId: 'order-durable-intent-only-cycle',
          type: 'CREATE_LIMIT_ORDER',
          exchange: 'binance',
          accountLabel: 'api-key-1',
          pair: 'BTC/USDT',
          side: 'buy',
          price: '100',
          qty: '0.5',
          mixinOrderId: 'durable-intent-only-maker-order',
          postOnly: true,
          timeInForce: 'GTC',
          metadata: {
            cycleId: 'cycle-durable-intent-only-1',
            cycleRole: 'maker',
            role: 'maker',
            accountLabel: 'api-key-1',
            side: 'buy',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0',
            notional: '50',
            status: 'done',
            linkedIntentId: 'durable-intent-only-maker',
          },
          status: 'DONE',
          createdAt: '2026-04-01T00:00:01.000Z',
          updatedAt: '2026-04-01T00:00:02.000Z',
        },
        {
          intentId: 'durable-intent-only-maker:inline-taker',
          runtimeInstanceKey: 'runtime-intent-only-cycle',
          strategyKey: 'durable-intent-only-strategy-cycle',
          userId: 'admin-user',
          clientId: 'order-durable-intent-only-cycle',
          type: 'CREATE_LIMIT_ORDER',
          exchange: 'binance',
          accountLabel: 'api-key-2',
          pair: 'BTC/USDT',
          side: 'sell',
          price: '100',
          qty: '0.5',
          mixinOrderId: 'durable-intent-only-taker-order',
          postOnly: false,
          timeInForce: 'IOC',
          metadata: {
            cycleId: 'cycle-durable-intent-only-1',
            cycleRole: 'taker',
            role: 'taker',
            accountLabel: 'api-key-2',
            side: 'sell',
            plannedQty: '0.5',
            plannedPrice: '100',
            filledQty: '0',
            notional: '50',
            status: 'failed',
            linkedIntentId: 'durable-intent-only-maker:inline-taker',
          },
          status: 'FAILED',
          errorReason: durableIntentOnlyFailureReason,
          createdAt: '2026-04-01T00:00:02.000Z',
          updatedAt: '2026-04-01T00:00:03.000Z',
        },
      ]),
    };
    const strategyExecutionHistoryRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const trackedOrderRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const {
      service,
      marketMakingRepository,
      strategyService,
      exchangeOrderTrackerService,
    } = buildService({
      strategyOrderIntentRepository,
      strategyExecutionHistoryRepository,
      trackedOrderRepository,
    });

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-durable-intent-only-cycle',
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
          clientId: 'order-durable-intent-only-cycle',
          marketMakingOrderId: 'order-durable-intent-only-cycle',
          makerAccountLabel: 'api-key-1',
          takerAccountLabel: 'api-key-2',
          makerApiKeyId: 'api-key-1',
          takerApiKeyId: 'api-key-2',
          mode: 'balanced',
          strategyContract: 'efficientDualAccountVolume',
        },
        'efficientDualAccountVolume',
      ),
    });
    strategyService.getLatestIntentsForStrategy.mockReturnValue([]);
    exchangeOrderTrackerService.getTrackedOrders.mockReturnValue([]);
    exchangeOrderTrackerService.getOpenOrders.mockReturnValue([]);

    const result = await service.getDirectOrderStatus(
      'order-durable-intent-only-cycle',
    );

    expect(strategyOrderIntentRepository.find).toHaveBeenCalled();
    expect(strategyExecutionHistoryRepository.find).toHaveBeenCalled();
    expect(trackedOrderRepository.find).toHaveBeenCalled();
    expect(result.cycles).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-durable-intent-only-1',
        aggregateStatus: 'failed',
        failureReason: durableIntentOnlyFailureReason,
        legs: expect.arrayContaining([
          expect.objectContaining({
            cycleRole: 'maker',
            accountLabel: 'api-key-1',
            side: 'buy',
            failureReason: null,
            linkedIntentId: 'durable-intent-only-maker',
          }),
          expect.objectContaining({
            cycleRole: 'taker',
            accountLabel: 'api-key-2',
            side: 'sell',
            status: 'failed',
            failureReason: durableIntentOnlyFailureReason,
            linkedIntentId: 'durable-intent-only-maker:inline-taker',
            linkedTrackedOrderId: 'durable-intent-only-taker-order',
          }),
        ]),
      }),
    ]);
  });

  it('resolves legacy dual-account definitions for new direct-start orders', async () => {
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
      service.directStart(
        {
          ...dualAccountStartDto,
          strategyDefinitionId: 'strategy-legacy',
        },
        'admin-user',
      ),
    ).resolves.toEqual({
      orderId: expect.any(String),
      state: 'running',
      warnings: [],
    });

    expect(strategyConfigResolver.resolveForOrderSnapshot).toHaveBeenCalled();
  });

  it('lists legacy dual-account variants in direct strategy definitions', async () => {
    const { service, strategyDefinitionRepository } = buildService();

    strategyDefinitionRepository.find.mockResolvedValue([
      {
        id: 'strategy-pmm',
        name: 'Pure Market Making',
        enabled: true,
        visibility: 'public',
        controllerType: 'pureMarketMaking',
        capabilities: singleAccountLaunchConfig,
      },
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
        id: 'strategy-pmm',
        controllerType: 'pureMarketMaking',
      }),
      expect.objectContaining({
        id: 'strategy-classic',
        controllerType: 'dualAccountVolume',
      }),
      expect.objectContaining({
        id: 'strategy-best',
        controllerType: 'dualAccountBestCapacityVolume',
      }),
      expect.objectContaining({
        id: 'strategy-efficient',
        controllerType: 'efficientDualAccountVolume',
      }),
    ]);
  });

  it('backfills the efficient dual-account strategy when an existing DB only has legacy direct definitions', async () => {
    const { service, strategyDefinitionRepository } = buildService();

    strategyDefinitionRepository.find.mockResolvedValue([
      {
        id: 'strategy-pmm',
        key: 'pure_market_making',
        name: 'Pure Market Making',
        enabled: true,
        visibility: 'public',
        controllerType: 'pureMarketMaking',
        capabilities: singleAccountLaunchConfig,
      },
      {
        id: 'strategy-classic',
        key: 'dual_account_volume',
        name: 'Dual Account Volume',
        enabled: true,
        visibility: 'admin',
        controllerType: 'dualAccountVolume',
        capabilities: dualAccountLaunchConfig,
      },
    ]);
    strategyDefinitionRepository.save.mockImplementation(async (payload) => ({
      ...payload,
      id: 'strategy-efficient-backfilled',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }));

    const definitions = await service.listDirectStrategyDefinitions();

    expect(strategyDefinitionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'efficient_dual_account_volume',
        name: 'Efficient Dual Account Volume',
        controllerType: 'efficientDualAccountVolume',
        enabled: true,
        visibility: 'admin',
        capabilities: dualAccountLaunchConfig,
      }),
    );
    expect(definitions.map((definition) => definition.controllerType)).toEqual(
      expect.arrayContaining([
        'pureMarketMaking',
        'dualAccountVolume',
        'efficientDualAccountVolume',
      ]),
    );
    expect(
      definitions.find(
        (definition) =>
          definition.controllerType === 'efficientDualAccountVolume',
      ),
    ).toEqual(
      expect.objectContaining({
        id: 'strategy-efficient-backfilled',
        directOrderCompatible: true,
        directExecutionMode: 'dual_account',
      }),
    );
  });

  it('backfills pure market making when a local DB only has the efficient direct strategy', async () => {
    const { service, strategyDefinitionRepository } = buildService();

    strategyDefinitionRepository.find.mockResolvedValue([
      {
        id: 'strategy-efficient',
        key: 'efficient_dual_account_volume',
        name: 'Efficient Dual Account Volume',
        enabled: true,
        visibility: 'admin',
        controllerType: 'efficientDualAccountVolume',
        capabilities: dualAccountLaunchConfig,
      },
      {
        id: 'strategy-classic',
        key: 'dual_account_volume',
        name: 'Dual Account Volume',
        enabled: true,
        visibility: 'admin',
        controllerType: 'dualAccountVolume',
        capabilities: dualAccountLaunchConfig,
      },
    ]);
    strategyDefinitionRepository.save.mockImplementation(async (payload) => ({
      ...payload,
      id: 'strategy-pure-backfilled',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }));

    const definitions = await service.listDirectStrategyDefinitions();

    expect(strategyDefinitionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'pure_market_making',
        name: 'Pure Market Making',
        controllerType: 'pureMarketMaking',
        enabled: true,
        visibility: 'public',
        capabilities: singleAccountLaunchConfig,
      }),
    );
    expect(definitions.map((definition) => definition.controllerType)).toEqual([
      'pureMarketMaking',
      'efficientDualAccountVolume',
      'dualAccountVolume',
    ]);
    expect(
      definitions.find(
        (definition) => definition.controllerType === 'pureMarketMaking',
      ),
    ).toEqual(
      expect.objectContaining({
        id: 'strategy-pure-backfilled',
        directOrderCompatible: true,
        directExecutionMode: 'single_account',
      }),
    );
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

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { AdminDirectMarketMakingService } from './admin-direct-mm.service';

describe('AdminDirectMarketMakingService', () => {
  const buildService = () => {
    const marketMakingRepository = {
      create: jest.fn((payload) => payload),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const strategyDefinitionRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
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
          accountLabel: 'desk-1',
          bidSpread: 0.001,
          askSpread: 0.001,
          orderAmount: 10,
          orderRefreshTime: 15000,
          numberOfLayers: 1,
          priceSourceType: 'MID_PRICE',
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
          ceilingPrice: 0,
          floorPrice: 0,
        },
      }),
    };
    const exchangeApiKeyService = {
      readAPIKey: jest.fn().mockResolvedValue({
        exchange: 'binance',
        exchange_index: 'desk-1',
        api_key: 'api-key',
        api_secret: 'api-secret',
      }),
      readDecryptedAPIKey: jest.fn().mockResolvedValue({
        exchange: 'binance',
        exchange_index: 'desk-1',
        api_key: 'api-key',
        api_secret: 'plain-secret',
      }),
    };
    const exchange = {
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 1, USDT: 1000 },
        used: { BTC: 0.2, USDT: 0 },
        total: { BTC: 1.2, USDT: 1000 },
      }),
    };
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue(exchange),
    };
    const executorRegistry = {
      findExecutorByOrderId: jest.fn().mockReturnValue(null),
    };
    const strategyService = {
      getLatestIntentsForStrategy: jest.fn().mockReturnValue([]),
    };
    const exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    const privateStreamTrackerService = {
      getLatestEvent: jest.fn().mockReturnValue(null),
    };
    const orderBookTrackerService = {
      getOrderBook: jest.fn().mockReturnValue(null),
    };
    const campaignService = {
      getCampaigns: jest.fn().mockResolvedValue([]),
      isCampaignJoined: jest.fn().mockResolvedValue(false),
      joinCampaignWithAuth: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const service = new AdminDirectMarketMakingService(
      marketMakingRepository as any,
      strategyDefinitionRepository as any,
      userOrdersService as any,
      marketMakingRuntimeService as any,
      strategyConfigResolver as any,
      exchangeApiKeyService as any,
      exchangeInitService as any,
      executorRegistry as any,
      strategyService as any,
      exchangeOrderTrackerService as any,
      privateStreamTrackerService as any,
      orderBookTrackerService as any,
      campaignService as any,
      configService as any,
    );

    return {
      service,
      marketMakingRepository,
      strategyDefinitionRepository,
      userOrdersService,
      marketMakingRuntimeService,
      strategyConfigResolver,
      exchangeApiKeyService,
      exchangeInitService,
      exchange,
      executorRegistry,
      strategyService,
      exchangeOrderTrackerService,
      privateStreamTrackerService,
      orderBookTrackerService,
      campaignService,
      configService,
    };
  };

  const directStartDto = {
    exchangeName: 'binance',
    pair: 'BTC/USDT',
    strategyDefinitionId: 'strategy-1',
    apiKeyId: 'api-key-1',
    accountLabel: 'desk-1',
    configOverrides: {
      bidSpread: 0.002,
    },
  };

  const originalWeb3PrivateKey = process.env.WEB3_PRIVATE_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WEB3_PRIVATE_KEY;
  });

  afterAll(() => {
    if (originalWeb3PrivateKey === undefined) {
      delete process.env.WEB3_PRIVATE_KEY;
      return;
    }

    process.env.WEB3_PRIVATE_KEY = originalWeb3PrivateKey;
  });

  it('starts a direct order and updates it to running', async () => {
    const {
      service,
      strategyDefinitionRepository,
      userOrdersService,
      marketMakingRuntimeService,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
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
      }),
    );
    expect(userOrdersService.updateMarketMakingOrderState).toHaveBeenCalledWith(
      result.orderId,
      'running',
    );
  });

  it('fails direct start when the API key is missing', async () => {
    const { service, exchangeApiKeyService } = buildService();

    exchangeApiKeyService.readAPIKey.mockResolvedValue(null);

    await expect(service.directStart(directStartDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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
    });
    strategyConfigResolver.resolveForOrderSnapshot.mockRejectedValue(
      new Error('schema validation failed'),
    );

    await expect(service.directStart(directStartDto)).rejects.toThrow(
      'schema validation failed',
    );
    expect(userOrdersService.createMarketMaking).not.toHaveBeenCalled();
  });

  it('returns advisory balance warnings without blocking direct start', async () => {
    const {
      service,
      strategyDefinitionRepository,
      strategyConfigResolver,
      exchange,
    } = buildService();

    strategyDefinitionRepository.findOne.mockResolvedValue({
      id: 'strategy-1',
      enabled: true,
      controllerType: 'pureMarketMaking',
    });
    strategyConfigResolver.resolveForOrderSnapshot.mockResolvedValue({
      controllerType: 'pureMarketMaking',
      resolvedConfig: {
        accountLabel: 'desk-1',
        bidSpread: 0.001,
        askSpread: 0.001,
        orderAmount: 20,
        orderRefreshTime: 15000,
        numberOfLayers: 1,
        priceSourceType: 'MID_PRICE',
        amountChangePerLayer: 0,
        amountChangeType: 'fixed',
        ceilingPrice: 0,
        floorPrice: 0,
      },
    });
    exchange.fetchBalance.mockResolvedValue({
      free: { BTC: 0, USDT: 5 },
      used: {},
      total: {},
    });

    const result = await service.directStart(directStartDto);

    expect(result.state).toBe('running');
    expect(result.warnings).toEqual(['Low BTC balance', 'Low USDT balance']);
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

  it('rejects stopping a missing direct order', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue(null);

    await expect(service.directStop('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects stopping an already stopped direct order', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      state: 'stopped',
      source: 'admin_direct',
    });

    await expect(service.directStop('order-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lists only admin direct orders', async () => {
    const {
      service,
      marketMakingRepository,
      strategyDefinitionRepository,
      executorRegistry,
    } = buildService();

    marketMakingRepository.find.mockResolvedValue([
      {
        orderId: 'order-1',
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        state: 'running',
        strategyDefinitionId: 'strategy-1',
        strategySnapshot: { resolvedConfig: { accountLabel: 'desk-1' } },
        source: 'admin_direct',
        apiKeyId: 'api-key-1',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    ]);
    strategyDefinitionRepository.find.mockResolvedValue([
      { id: 'strategy-1', name: 'Desk Strategy' },
    ]);
    executorRegistry.findExecutorByOrderId.mockReturnValue({
      getSession: () => ({
        orderId: 'order-1',
        cadenceMs: 5000,
        nextRunAtMs: Date.now() + 5000,
      }),
    });

    const result = await service.listDirectOrders();

    expect(marketMakingRepository.find).toHaveBeenCalledWith({
      where: { source: 'admin_direct' },
      order: { createdAt: 'DESC' },
    });
    expect(result).toEqual([
      expect.objectContaining({
        orderId: 'order-1',
        strategyName: 'Desk Strategy',
        accountLabel: 'desk-1',
      }),
    ]);
  });

  it('returns an empty direct order list when none exist', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.find.mockResolvedValue([]);

    await expect(service.listDirectOrders()).resolves.toEqual([]);
  });

  it('reports active executor health in the status endpoint', async () => {
    const {
      service,
      marketMakingRepository,
      executorRegistry,
      privateStreamTrackerService,
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
      strategySnapshot: { resolvedConfig: { accountLabel: 'desk-1' } },
    });
    executorRegistry.findExecutorByOrderId.mockReturnValue({
      getSession: () => ({
        orderId: 'order-1',
        cadenceMs: 5000,
        nextRunAtMs: Date.now() + 5000,
      }),
    });
    privateStreamTrackerService.getLatestEvent.mockReturnValue({
      receivedAt: '2026-04-01T00:00:02.000Z',
    });
    exchangeOrderTrackerService.getOpenOrders.mockReturnValue([]);
    strategyService.getLatestIntentsForStrategy.mockReturnValue([]);
    orderBookTrackerService.getOrderBook.mockReturnValue({
      bids: [[100, 1]],
      asks: [[101, 1]],
    });

    const result = await service.getDirectOrderStatus('order-1');

    expect(result.executorHealth).toBe('active');
    expect(result.runtimeState).toBe('active');
    expect(result.spread).toEqual({ bid: '100', ask: '101', absolute: '1' });
  });

  it('reports gone executor health when the runtime session is missing', async () => {
    const { service, marketMakingRepository } = buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'running',
      source: 'admin_direct',
      createdAt: '2026-04-01T00:00:00.000Z',
      strategySnapshot: { resolvedConfig: { accountLabel: 'desk-1' } },
    });

    const result = await service.getDirectOrderStatus('order-1');

    expect(result.executorHealth).toBe('gone');
    expect(result.runtimeState).toBe('gone');
  });

  it('reports stale executor health when the last tick is too old', async () => {
    const { service, marketMakingRepository, executorRegistry } =
      buildService();

    marketMakingRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'running',
      source: 'admin_direct',
      createdAt: '2026-04-01T00:00:00.000Z',
      strategySnapshot: { resolvedConfig: { accountLabel: 'desk-1' } },
    });
    executorRegistry.findExecutorByOrderId.mockReturnValue({
      getSession: () => ({
        orderId: 'order-1',
        cadenceMs: 5000,
        nextRunAtMs: Date.now() - 30000,
      }),
    });

    const result = await service.getDirectOrderStatus('order-1');

    expect(result.executorHealth).toBe('stale');
    expect(result.runtimeState).toBe('stale');
    expect(result.stale).toBe(true);
  });

  it('lists campaigns with joined flags', async () => {
    const { service, campaignService, configService } = buildService();

    configService.get.mockImplementation((key: string) => {
      if (key === 'WEB3_PRIVATE_KEY' || key === 'web3.private_key') {
        return '0x59c6995e998f97a5a0044966f094538e0d7d4e1b3f43b4374c1c1ff717a8ba4c';
      }

      return undefined;
    });
    campaignService.getCampaigns.mockResolvedValue([
      { address: '0xabc', chain_id: 1 },
      { address: '0xdef', chain_id: 137 },
    ]);
    campaignService.isCampaignJoined
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(service.listCampaigns()).resolves.toEqual([
      { address: '0xabc', chain_id: 1, joined: true },
      { address: '0xdef', chain_id: 137, joined: false },
    ]);
  });

  it('joins campaign synchronously through HuFi proxy', async () => {
    const { service, exchangeApiKeyService, configService, campaignService } =
      buildService();

    configService.get.mockReturnValue('secret-key');
    exchangeApiKeyService.readDecryptedAPIKey.mockResolvedValue({
      exchange: 'binance',
      api_key: 'api-key',
      api_secret: 'plain-secret',
    });

    await expect(
      service.joinCampaign({
        evmAddress: '0x0000000000000000000000000000000000000001',
        apiKeyId: 'api-key-1',
        chainId: 1,
        campaignAddress: '0x0000000000000000000000000000000000000002',
      }),
    ).resolves.toEqual({
      status: 'joined',
      apiKeyId: 'api-key-1',
      campaignAddress: '0x0000000000000000000000000000000000000002',
      chainId: 1,
    });

    expect(campaignService.joinCampaignWithAuth).toHaveBeenCalledWith(
      '0x0000000000000000000000000000000000000001',
      'secret-key',
      'binance',
      'api-key',
      'plain-secret',
      1,
      '0x0000000000000000000000000000000000000002',
    );
  });

  it('defaults campaign join chain id to 137 when request chainId is invalid', async () => {
    const { service, exchangeApiKeyService, configService, campaignService } =
      buildService();

    configService.get.mockReturnValue('secret-key');
    exchangeApiKeyService.readDecryptedAPIKey.mockResolvedValue({
      exchange: 'binance',
      api_key: 'api-key',
      api_secret: 'plain-secret',
    });

    await service.joinCampaign({
      evmAddress: '0x0000000000000000000000000000000000000001',
      apiKeyId: 'api-key-1',
      chainId: 0,
      campaignAddress: '0x0000000000000000000000000000000000000002',
    });

    expect(campaignService.joinCampaignWithAuth).toHaveBeenCalledWith(
      '0x0000000000000000000000000000000000000001',
      'secret-key',
      'binance',
      'api-key',
      'plain-secret',
      137,
      '0x0000000000000000000000000000000000000002',
    );
  });

  it('fails synchronously when no signing key is configured', async () => {
    const { service, configService } = buildService();

    configService.get.mockReturnValue(undefined);

    await expect(
      service.joinCampaign({
        evmAddress: '0x0000000000000000000000000000000000000001',
        apiKeyId: 'api-key-1',
        chainId: 1,
        campaignAddress: '0x0000000000000000000000000000000000000002',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails synchronously when exchange api key is incomplete', async () => {
    const { service, exchangeApiKeyService, configService } = buildService();

    configService.get.mockReturnValue('secret-key');
    exchangeApiKeyService.readDecryptedAPIKey.mockResolvedValue({
      exchange: 'binance',
      api_key: 'api-key',
    });

    await expect(
      service.joinCampaign({
        evmAddress: '0x0000000000000000000000000000000000000001',
        apiKeyId: 'api-key-1',
        chainId: 1,
        campaignAddress: '0x0000000000000000000000000000000000000002',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns wallet status with derived address when WEB3 private key is configured', async () => {
    const { service, configService } = buildService();

    configService.get.mockImplementation((key: string) => {
      if (key === 'WEB3_PRIVATE_KEY' || key === 'web3.private_key') {
        return '0x59c6995e998f97a5a0044966f094538e0d7d4e1b3f43b4374c1c1ff717a8ba4c';
      }

      return undefined;
    });

    await expect(service.getWalletStatus()).resolves.toEqual({
      configured: true,
      address: '0x18010af8cdbc0aa92f0d3d38bbde742ef6d265ad',
    });
  });

  it('returns wallet status as not configured when WEB3 private key is missing', async () => {
    const { service, configService } = buildService();

    configService.get.mockReturnValue(undefined);

    await expect(service.getWalletStatus()).resolves.toEqual({
      configured: false,
      address: null,
    });
  });
});

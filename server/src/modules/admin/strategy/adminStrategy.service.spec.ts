import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { StrategyConfigResolverService } from '../../market-making/strategy/dex/strategy-config-resolver.service';
import { StrategyRuntimeDispatcherService } from '../../market-making/strategy/execution/strategy-runtime-dispatcher.service';
import { StrategyService } from '../../market-making/strategy/strategy.service';
import { Web3Service } from '../../web3/web3.service';
import {
  GetDepositAddressDto,
  StartStrategyInstanceDto,
  StopStrategyInstanceDto,
} from './admin-strategy.dto';
import { AdminStrategyService } from './adminStrategy.service';

describe('AdminStrategyService', () => {
  let service: AdminStrategyService;
  let web3Service: Web3Service;
  let strategyService: StrategyService;

  const startByStrategyTypeSpy = jest
    .fn()
    .mockImplementation(
      async (strategyType: string, config: Record<string, unknown>) => {
        return Promise.resolve({ strategyType, config });
      },
    );
  const stopByStrategyTypeSpy = jest
    .fn()
    .mockImplementation(
      async (strategyType: string, userId: string, clientId: string) => {
        return Promise.resolve({ strategyType, userId, clientId });
      },
    );

  const mockContributionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockMixinUserRepository = {
    findOne: jest.fn(),
  };

  const mockStrategyDefinitionRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn((payload) => payload),
  };

  const mockStrategyInstanceRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockExchangeInitService = {
    getDepositAddress: jest.fn(),
    getExchange: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AdminStrategyService,
        {
          provide: StrategyService,
          useValue: {
            startArbitrageStrategyForUser: jest.fn(),
            executePureMarketMakingStrategy: jest.fn(),
            executeVolumeStrategy: jest.fn(),
            stopStrategyForUser: jest.fn(),
            linkDefinitionToStrategyInstance: jest.fn(),
            getAllStrategies: jest.fn().mockResolvedValue([]),
            getRunningStrategies: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StrategyRuntimeDispatcherService,
          useValue: {
            toStrategyType: jest.fn((controllerType: string) => {
              if (controllerType === 'arbitrage') return 'arbitrage';
              if (controllerType === 'pureMarketMaking')
                return 'pureMarketMaking';
              if (controllerType === 'volume') return 'volume';
              throw new BadRequestException('Unsupported controllerType');
            }),
            mapStrategyTypeToController: jest.fn((strategyType: string) =>
              strategyType === 'marketMaking'
                ? 'pureMarketMaking'
                : strategyType,
            ),
            startByStrategyType: startByStrategyTypeSpy,
            stopByStrategyType: stopByStrategyTypeSpy,
          },
        },
        {
          provide: StrategyConfigResolverService,
          useValue: {
            getDefinitionControllerType: jest.fn(
              (definition) =>
                definition.controllerType || definition.controllerType,
            ),
            resolveDefinitionStartConfig: jest
              .fn()
              .mockImplementation((definition, dto) => {
                const strategyType =
                  definition.controllerType === 'arbitrage'
                    ? 'arbitrage'
                    : definition.controllerType === 'volume'
                    ? 'volume'
                    : 'pureMarketMaking';
                const marketMakingOrderId =
                  strategyType === 'pureMarketMaking'
                    ? dto.marketMakingOrderId || dto.clientId
                    : undefined;

                return {
                  strategyType,
                  mergedConfig: {
                    ...(definition.defaultConfig || {}),
                    ...(dto.config || {}),
                    userId: dto.userId,
                    clientId: marketMakingOrderId || dto.clientId,
                    ...(marketMakingOrderId ? { marketMakingOrderId } : {}),
                  },
                };
              }),
          },
        },
        {
          provide: Web3Service,
          useValue: {
            verifyTransactionDetails: jest.fn(), // Mock the method directly here
          },
        },
        {
          provide: getRepositoryToken(Contribution),
          useValue: mockContributionRepository,
        },
        {
          provide: getRepositoryToken(MixinUser),
          useValue: mockMixinUserRepository,
        },
        {
          provide: getRepositoryToken(StrategyDefinition),
          useValue: mockStrategyDefinitionRepository,
        },
        {
          provide: getRepositoryToken(StrategyInstance),
          useValue: mockStrategyInstanceRepository,
        },
        {
          provide: ExchangeInitService,
          useValue: mockExchangeInitService,
        },
      ],
    }).compile();

    service = module.get<AdminStrategyService>(AdminStrategyService);
    strategyService = module.get<StrategyService>(StrategyService);
    web3Service = module.get<Web3Service>(Web3Service);
  });

  describe('verifyContribution', () => {
    it('should confirm and update contribution if verified', async () => {
      const contribution = {
        id: '1',
        transactionHash: '0xabc',
        amount: 100,
        userId: 'user123',
        chainId: 1,
        tokenAddress: '0xabc',
        status: 'pending',
      };

      const user = { user_id: 'user123', walletAddress: '0xdef' };

      mockContributionRepository.findOne.mockResolvedValue(contribution);
      mockMixinUserRepository.findOne.mockResolvedValue(user);
      (web3Service.verifyTransactionDetails as jest.Mock).mockResolvedValue(
        true,
      );

      const result = await service.verifyContribution(contribution.id);

      expect(result).toBe(true);
      expect(mockContributionRepository.save).toHaveBeenCalledWith({
        ...contribution,
        status: 'confirmed',
      });
    });

    it('should not update contribution if verification fails', async () => {
      const contribution = {
        id: '1',
        transactionHash: '0xabc',
        amount: 100,
        userId: 'user123',
        chainId: 1,
        tokenAddress: '0xabc',
        status: 'pending',
      };

      const user = { user_id: 'user123', walletAddress: '0xdef' };

      mockContributionRepository.findOne.mockResolvedValue(contribution);
      mockMixinUserRepository.findOne.mockResolvedValue(user);
      (web3Service.verifyTransactionDetails as jest.Mock).mockResolvedValue(
        false,
      );

      const result = await service.verifyContribution(contribution.id);

      expect(result).toBe(false);
      expect(mockContributionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getDepositAddress', () => {
    it('should return the deposit address', async () => {
      const getDepositAddressDto: GetDepositAddressDto = {
        exchangeName: 'binance',
        tokenSymbol: 'USDT',
        network: 'eth',
        accountLabel: 'default',
      };

      mockExchangeInitService.getDepositAddress.mockResolvedValue('0xabc');

      const result = await service.getDepositAddress(getDepositAddressDto);

      expect(result).toBe('0xabc');
    });
  });

  describe('getSupportedNetworks', () => {
    it('should return supported networks for a token', async () => {
      const getSupportedNetworksDto = {
        exchangeName: 'binance',
        tokenSymbol: 'USDT',
        accountLabel: 'default',
      };

      const exchangeMock = {
        currencies: {
          USDT: { networks: { eth: {}, bsc: {} } },
        },
      };

      mockExchangeInitService.getExchange.mockReturnValue(exchangeMock);

      const result = await service.getSupportedNetworks(
        getSupportedNetworksDto.exchangeName,
        getSupportedNetworksDto.tokenSymbol,
        getSupportedNetworksDto.accountLabel,
      );

      expect(result).toEqual([{ network: 'eth' }, { network: 'bsc' }]);
    });
  });

  describe('getChainInfo', () => {
    it('should return chain info', async () => {
      const chainInfoMock = { name: 'Ethereum', chainId: 1 };

      jest.spyOn(service, 'getChainInfo').mockResolvedValue(chainInfoMock);

      const result = await service.getChainInfo(1);

      expect(result).toEqual(chainInfoMock);
    });
  });

  describe('getTokenSymbolByContract', () => {
    it('should return token symbol by contract address and chain ID', async () => {
      jest.spyOn(service, 'getTokenSymbolByContract').mockResolvedValue('USDT');

      const result = await service.getTokenSymbolByContract('0xabc', 1);

      expect(result).toBe('USDT');
    });
  });

  describe('startStrategyInstance', () => {
    it('starts an instance from definition with merged config', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-1',
        key: 'pure-market-making',
        name: 'Pure Market Making',
        enabled: true,
        controllerType: 'pureMarketMaking',
        defaultConfig: {
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.1,
          askSpread: 0.1,
          orderAmount: 0.01,
          orderRefreshTime: 1000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 0,
          amountChangeType: 'fixed',
        },
        configSchema: {
          type: 'object',
          required: ['pair', 'exchangeName'],
          properties: {
            pair: { type: 'string' },
            exchangeName: { type: 'string' },
          },
        },
      });

      const dto: StartStrategyInstanceDto = {
        strategyDefinitionId: 'def-1',
        userId: 'user123',
        clientId: 'client123',
        config: {
          pair: 'ETH/USDT',
        },
      };

      const result = await service.startStrategyInstance(dto);

      expect(startByStrategyTypeSpy).toHaveBeenCalledWith(
        'pureMarketMaking',
        expect.objectContaining({
          userId: 'user123',
          clientId: 'client123',
          pair: 'ETH/USDT',
        }),
      );
      expect(
        strategyService.linkDefinitionToStrategyInstance,
      ).toHaveBeenCalledWith(
        'user123',
        'client123',
        'pureMarketMaking',
        'def-1',
        'client123',
        expect.objectContaining({
          strategyDefinitionId: 'def-1',
          definitionKey: 'pure-market-making',
          definitionName: 'Pure Market Making',
          controllerType: 'pureMarketMaking',
          resolvedAt: expect.any(String),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          strategyDefinitionId: 'def-1',
          controllerType: 'pureMarketMaking',
        }),
      );
    });

    it('validates config from definition before start', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-2',
        key: 'volume',
        enabled: true,
        controllerType: 'volume',
        defaultConfig: {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          incrementPercentage: 0.1,
          intervalTime: 10,
          tradeAmount: 0.001,
          numTrades: 10,
        },
        configSchema: {
          type: 'object',
          required: ['exchangeName', 'symbol'],
          properties: {
            exchangeName: { type: 'string' },
            symbol: { type: 'string' },
          },
        },
      });

      const dto: StartStrategyInstanceDto = {
        strategyDefinitionId: 'def-2',
        userId: 'u1',
        clientId: 'c1',
      };

      const result = await service.validateStrategyInstanceConfig(dto);

      expect(result).toEqual(
        expect.objectContaining({
          valid: true,
          strategyDefinitionId: 'def-2',
          definitionKey: 'volume',
          controllerType: 'volume',
          mergedConfig: expect.objectContaining({
            userId: 'u1',
            clientId: 'c1',
            exchangeName: 'binance',
          }),
        }),
      );
    });
  });

  describe('stopStrategyInstance', () => {
    it('stops an instance from definition', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-1',
        key: 'pure-market-making',
        enabled: true,
        controllerType: 'pureMarketMaking',
      });

      const dto: StopStrategyInstanceDto = {
        strategyDefinitionId: 'def-1',
        userId: 'user123',
        clientId: 'client123',
      };

      const result = await service.stopStrategyInstance(dto);

      expect(stopByStrategyTypeSpy).toHaveBeenCalledWith(
        'pureMarketMaking',
        'user123',
        'client123',
      );
      expect(result).toEqual(
        expect.objectContaining({
          strategyDefinitionId: 'def-1',
          controllerType: 'pureMarketMaking',
        }),
      );
    });

    it('uses clientId for non-pure market-making strategies', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-2',
        key: 'volume',
        enabled: true,
        controllerType: 'volume',
      });

      const dto: StopStrategyInstanceDto = {
        strategyDefinitionId: 'def-2',
        userId: 'user123',
        clientId: 'client123',
        marketMakingOrderId: 'order123',
      };

      await service.stopStrategyInstance(dto);

      expect(stopByStrategyTypeSpy).toHaveBeenCalledWith(
        'volume',
        'user123',
        'client123',
      );
    });
  });

  describe('getStrategyInstances', () => {
    it('returns running strategy instances with definition metadata', async () => {
      (strategyService.getRunningStrategies as jest.Mock).mockResolvedValue([
        {
          id: 1,
          strategyKey: 'u-c-arbitrage',
          strategyType: 'arbitrage',
          status: 'running',
          userId: 'u',
          clientId: 'c',
          strategyDefinitionId: 'def-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      mockStrategyDefinitionRepository.find.mockResolvedValue([
        {
          id: 'def-1',
          key: 'arbitrage',
          name: 'Arbitrage',
          controllerType: 'arbitrage',
        },
      ]);

      const result = await service.getStrategyInstances(true);

      expect(result).toEqual([
        expect.objectContaining({
          strategyKey: 'u-c-arbitrage',
          definitionKey: 'arbitrage',
          definitionName: 'Arbitrage',
          controllerType: 'arbitrage',
        }),
      ]);
    });
  });

  describe('removeStrategyDefinition', () => {
    it('removes a disabled, unlinked definition', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-remove-1',
        key: 'volume',
        enabled: false,
      });
      mockStrategyInstanceRepository.findOne.mockResolvedValue(null);
      mockStrategyDefinitionRepository.delete = jest.fn().mockResolvedValue({});

      const result = await service.removeStrategyDefinition({
        strategyDefinitionId: 'def-remove-1',
      });

      expect(mockStrategyDefinitionRepository.delete).toHaveBeenCalledWith({
        id: 'def-remove-1',
      });
      expect(result).toEqual({
        message: 'Removed strategy definition volume',
        strategyDefinitionId: 'def-remove-1',
      });
    });

    it('rejects removing an enabled definition', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-remove-2',
        key: 'pure-mm',
        enabled: true,
      });

      await expect(
        service.removeStrategyDefinition({
          strategyDefinitionId: 'def-remove-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects removing a linked definition', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-remove-3',
        key: 'arbitrage',
        enabled: false,
      });
      mockStrategyInstanceRepository.findOne.mockResolvedValue({
        id: 1,
        strategyDefinitionId: 'def-remove-3',
      });

      await expect(
        service.removeStrategyDefinition({
          strategyDefinitionId: 'def-remove-3',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

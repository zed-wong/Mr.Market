import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyDefinitionVersion } from 'src/common/entities/market-making/strategy-definition-version.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { PerformanceService } from '../../market-making/performance/performance.service';
import { StrategyService } from '../../market-making/strategy/strategy.service';
import { Web3Service } from '../../web3/web3.service';
import {
  GetDepositAddressDto,
  StopStrategyInstanceDto,
  StartStrategyInstanceDto,
  StartStrategyDto,
  StopStrategyDto,
} from './admin-strategy.dto';
import { AdminStrategyService } from './adminStrategy.service';

describe('AdminStrategyService', () => {
  let service: AdminStrategyService;
  let web3Service: Web3Service;
  let strategyService: StrategyService;

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
    save: jest.fn(),
    create: jest.fn((payload) => payload),
  };

  const mockStrategyDefinitionVersionRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((payload) => payload),
  };

  const mockStrategyInstanceRepository = {
    find: jest.fn(),
    update: jest.fn(),
  };

  const mockExchangeInitService = {
    getDepositAddress: jest.fn(),
    getExchange: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
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
            getStrategyInstanceKey: jest
              .fn()
              .mockResolvedValue({ status: 'running' }),
          },
        },
        {
          provide: PerformanceService,
          useValue: {
            get: jest.fn(), // Mock the method directly here
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
          provide: getRepositoryToken(StrategyDefinitionVersion),
          useValue: mockStrategyDefinitionVersionRepository,
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

  describe('startStrategy', () => {
    it('should start an arbitrage strategy', async () => {
      const startStrategyDto: StartStrategyDto = {
        strategyType: 'arbitrage',
        arbitrageParams: {
          userId: 'user123',
          clientId: 'client123',
          pair: 'ETH/USDT',
          amountToTrade: 1.0,
          minProfitability: 0.01,
          exchangeAName: 'binance',
          exchangeBName: 'mexc',
          checkIntervalSeconds: 10,
          maxOpenOrders: 5,
        },
        checkIntervalSeconds: 10,
        maxOpenOrders: 5,
      };

      await service.startStrategy(startStrategyDto);

      expect(
        strategyService.startArbitrageStrategyForUser,
      ).toHaveBeenCalledWith(
        startStrategyDto.arbitrageParams,
        startStrategyDto.checkIntervalSeconds,
        startStrategyDto.maxOpenOrders,
      );
    });

    it('should start a market making strategy', async () => {
      const startStrategyDto: StartStrategyDto = {
        strategyType: 'marketMaking',
        marketMakingParams: {
          userId: 'user123',
          clientId: 'client123',
          pair: 'BTC/USD',
          exchangeName: 'binance',
          bidSpread: 0.1,
          askSpread: 0.1,
          orderAmount: 0.1,
          orderRefreshTime: 15000,
          numberOfLayers: 1,
          priceSourceType: PriceSourceType.MID_PRICE,
          amountChangePerLayer: 1,
          amountChangeType: 'percentage',
        },
      };

      await service.startStrategy(startStrategyDto);

      expect(
        strategyService.executePureMarketMakingStrategy,
      ).toHaveBeenCalledWith(startStrategyDto.marketMakingParams);
    });

    it('should start a volume strategy', async () => {
      const startStrategyDto: StartStrategyDto = {
        strategyType: 'volume',
        volumeParams: {
          exchangeName: 'Binance',
          symbol: 'BTCUSDT',
          incrementPercentage: 0.1,
          intervalTime: 60,
          tradeAmount: 100,
          numTrades: 5,
          userId: 'user123',
          clientId: 'client123',
          pricePushRate: 0,
          postOnlySide: 'buy',
        },
      };

      await service.startStrategy(startStrategyDto);

      expect(strategyService.executeVolumeStrategy).toHaveBeenCalledWith(
        startStrategyDto.volumeParams.exchangeName,
        startStrategyDto.volumeParams.symbol,
        startStrategyDto.volumeParams.incrementPercentage,
        startStrategyDto.volumeParams.intervalTime,
        startStrategyDto.volumeParams.tradeAmount,
        startStrategyDto.volumeParams.numTrades,
        startStrategyDto.volumeParams.userId,
        startStrategyDto.volumeParams.clientId,
        startStrategyDto.volumeParams.pricePushRate,
        startStrategyDto.volumeParams.postOnlySide,
      );
    });

    it('should throw BadRequestException for invalid strategy parameters', async () => {
      const startStrategyDto: StartStrategyDto = {
        strategyType: 'arbitrage', // No arbitrageParams provided
      };

      await expect(service.startStrategy(startStrategyDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('stopStrategy', () => {
    it('should stop a strategy', async () => {
      const stopStrategyDto: StopStrategyDto = {
        strategyType: 'arbitrage',
        userId: 'user123',
        clientId: 'client123',
      };

      await service.stopStrategy(stopStrategyDto);

      expect(strategyService.stopStrategyForUser).toHaveBeenCalledWith(
        stopStrategyDto.userId,
        stopStrategyDto.clientId,
        stopStrategyDto.strategyType,
      );
    });
  });

  describe('joinStrategy', () => {
    it('should create a contribution and save it', async () => {
      const joinData = {
        userId: 'user123',
        clientId: 'client123',
        strategyKey: 'strategyKey',
        amount: 100,
        transactionHash: '0x123',
        tokenSymbol: 'ETH',
        chainId: 1,
        tokenAddress: '0xabc',
      };

      mockMixinUserRepository.findOne.mockResolvedValue({ user_id: 'user123' });
      mockContributionRepository.create.mockReturnValue(joinData);
      mockContributionRepository.save.mockResolvedValue(joinData);

      const result = await service.joinStrategy(
        joinData.userId,
        joinData.clientId,
        joinData.strategyKey,
        joinData.amount,
        joinData.transactionHash,
        joinData.tokenSymbol,
        joinData.chainId,
        joinData.tokenAddress,
      );

      expect(result).toEqual({
        message: `User ${joinData.userId} has joined the strategy with ${joinData.amount} funds`,
      });
      expect(mockContributionRepository.save).toHaveBeenCalledWith(joinData);
    });

    it('should throw error if user does not exist', async () => {
      const joinData = {
        userId: 'user123',
        clientId: 'client123',
        strategyKey: 'strategyKey',
        amount: 100,
        transactionHash: '0x123',
        tokenSymbol: 'ETH',
        chainId: 1,
        tokenAddress: '0xabc',
      };

      mockMixinUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.joinStrategy(
          joinData.userId,
          joinData.clientId,
          joinData.strategyKey,
          joinData.amount,
          joinData.transactionHash,
          joinData.tokenSymbol,
          joinData.chainId,
          joinData.tokenAddress,
        ),
      ).rejects.toThrow(BadRequestException);
    });
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
        enabled: true,
        currentVersion: '1.0.3',
        executorType: 'pureMarketMaking',
        defaultConfig: {
          pair: 'BTC/USDT',
          exchangeName: 'binance',
          bidSpread: 0.1,
          askSpread: 0.1,
          orderAmount: 0.01,
          orderRefreshTime: 15000,
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
        definitionId: 'def-1',
        userId: 'user123',
        clientId: 'client123',
        config: {
          pair: 'ETH/USDT',
        },
      };

      const result = await service.startStrategyInstance(dto);

      expect(strategyService.executePureMarketMakingStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          clientId: 'client123',
          pair: 'ETH/USDT',
        }),
      );
      expect(strategyService.linkDefinitionToStrategyInstance).toHaveBeenCalledWith(
        'user123',
        'client123',
        'pureMarketMaking',
        'def-1',
        '1.0.3',
      );
      expect(result).toEqual(
        expect.objectContaining({
          definitionId: 'def-1',
          executorType: 'pureMarketMaking',
        }),
      );
    });

    it('validates config from definition before start', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-2',
        key: 'volume',
        enabled: true,
        executorType: 'volume',
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
        definitionId: 'def-2',
        userId: 'u1',
        clientId: 'c1',
      };

      const result = await service.validateStrategyInstanceConfig(dto);

      expect(result).toEqual(
        expect.objectContaining({
          valid: true,
          definitionId: 'def-2',
          definitionKey: 'volume',
          executorType: 'volume',
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
        executorType: 'pureMarketMaking',
      });

      const dto: StopStrategyInstanceDto = {
        definitionId: 'def-1',
        userId: 'user123',
        clientId: 'client123',
      };

      const result = await service.stopStrategyInstance(dto);

      expect(strategyService.stopStrategyForUser).toHaveBeenCalledWith(
        'user123',
        'client123',
        'pureMarketMaking',
      );
      expect(result).toEqual(
        expect.objectContaining({
          definitionId: 'def-1',
          executorType: 'pureMarketMaking',
        }),
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
          definitionId: 'def-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      mockStrategyDefinitionRepository.find.mockResolvedValue([
        {
          id: 'def-1',
          key: 'arbitrage',
          name: 'Arbitrage',
          executorType: 'arbitrage',
        },
      ]);

      const result = await service.getStrategyInstances(true);

      expect(result).toEqual([
        expect.objectContaining({
          strategyKey: 'u-c-arbitrage',
          definitionKey: 'arbitrage',
          definitionName: 'Arbitrage',
          executorType: 'arbitrage',
        }),
      ]);
    });
  });

  describe('publishStrategyDefinitionVersion', () => {
    it('publishes next patch version by default', async () => {
      mockStrategyDefinitionRepository.findOne.mockResolvedValue({
        id: 'def-1',
        key: 'arbitrage',
        currentVersion: '1.0.0',
        enabled: true,
        executorType: 'arbitrage',
        configSchema: { type: 'object' },
        defaultConfig: {},
      });
      mockStrategyDefinitionVersionRepository.findOne.mockResolvedValue(null);
      mockStrategyDefinitionRepository.save.mockImplementation(async (d) => d);

      await service.publishStrategyDefinitionVersion('def-1', {
        description: 'v1.0.1',
      });

      expect(mockStrategyDefinitionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          currentVersion: '1.0.1',
          description: 'v1.0.1',
        }),
      );
      expect(mockStrategyDefinitionVersionRepository.save).toHaveBeenCalled();
    });
  });

  describe('backfillLegacyStrategyInstanceDefinitions', () => {
    it('links legacy instances to matching definitions', async () => {
      mockStrategyInstanceRepository.find.mockResolvedValue([
        {
          id: 1,
          strategyType: 'arbitrage',
        },
        {
          id: 2,
          strategyType: 'marketMaking',
        },
      ]);
      mockStrategyDefinitionRepository.find.mockResolvedValue([
        {
          id: 'd-arb',
          executorType: 'arbitrage',
          currentVersion: '1.0.0',
        },
        {
          id: 'd-mm',
          executorType: 'pureMarketMaking',
          currentVersion: '1.0.5',
        },
      ]);

      const result = await service.backfillLegacyStrategyInstanceDefinitions();

      expect(mockStrategyInstanceRepository.update).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ updated: 2, skipped: 0 });
    });
  });
});

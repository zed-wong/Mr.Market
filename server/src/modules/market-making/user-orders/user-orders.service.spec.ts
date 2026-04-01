/* eslint-disable @typescript-eslint/no-explicit-any, unused-imports/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { MarketMakingPaymentState } from 'src/common/entities/orders/payment-state.entity';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import {
  type MarketMakingStates,
  type SimplyGrowStates,
} from 'src/common/types/orders/states';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';
import { StrategyConfigResolverService } from 'src/modules/market-making/strategy/dex/strategy-config-resolver.service';
import { Repository } from 'typeorm';

import { CustomLogger } from '../../infrastructure/logger/logger.service';
import { UserOrdersService } from './user-orders.service';

jest.mock('../../infrastructure/logger/logger.service');

describe('UserOrdersService', () => {
  let service: UserOrdersService;
  let marketMakingRepository: Repository<MarketMakingOrder>;
  let simplyGrowRepository: Repository<SimplyGrowOrder>;
  let marketMakingOrderIntentRepository: Repository<MarketMakingOrderIntent>;
  let strategyDefinitionRepository: Repository<StrategyDefinition>;
  let growdataRepository: GrowdataRepository;
  let strategyConfigResolver: StrategyConfigResolverService;
  let testingModule: TestingModule;

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        UserOrdersService,
        CustomLogger,
        {
          provide: getRepositoryToken(MarketMakingOrder),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(SimplyGrowOrder),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(MarketMakingPaymentState),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(MarketMakingOrderIntent),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(StrategyDefinition),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(StrategyExecutionHistory),
          useClass: Repository,
        },
        {
          provide: 'BullQueue_market-making',
          useValue: { add: jest.fn() },
        },
        {
          provide: GrowdataRepository,
          useValue: {
            findMarketMakingPairById: jest.fn(),
          },
        },
        {
          provide: StrategyConfigResolverService,
          useValue: {
            resolveForOrderSnapshot: jest.fn().mockResolvedValue({
              controllerType: 'pureMarketMaking',
              resolvedConfig: {},
            }),
          },
        },
      ],
    }).compile();

    service = testingModule.get<UserOrdersService>(UserOrdersService);
    marketMakingRepository = testingModule.get<Repository<MarketMakingOrder>>(
      getRepositoryToken(MarketMakingOrder),
    );
    simplyGrowRepository = testingModule.get<Repository<SimplyGrowOrder>>(
      getRepositoryToken(SimplyGrowOrder),
    );
    strategyDefinitionRepository = testingModule.get<
      Repository<StrategyDefinition>
    >(getRepositoryToken(StrategyDefinition));
    marketMakingOrderIntentRepository = testingModule.get<
      Repository<MarketMakingOrderIntent>
    >(getRepositoryToken(MarketMakingOrderIntent));
    growdataRepository =
      testingModule.get<GrowdataRepository>(GrowdataRepository);
    strategyConfigResolver = testingModule.get<StrategyConfigResolverService>(
      StrategyConfigResolverService,
    );
    jest.clearAllMocks();
  });

  describe('createSimplyGrow', () => {
    it('should successfully create a simply grow order', async () => {
      const mockSimplyGrowOrder = {
        orderId: 'sg1',
        userId: 'user1',
        version: 'v1',
        tradingType: 'typeA',
        action: 'buy',
        state: 'created' as SimplyGrowStates,
        createdAt: new Date(),
        rewardAddress: '0x0000000000000000000000000000000000000000',
        mixinAssetId: '123e4567-e89b-12d3-a456-426614174000',
        amount: 100,
      } as unknown as SimplyGrowOrder;

      jest
        .spyOn(simplyGrowRepository, 'save')
        .mockResolvedValue(mockSimplyGrowOrder);

      const result = await service.createSimplyGrow(mockSimplyGrowOrder);

      expect(result).toEqual(mockSimplyGrowOrder);
      expect(simplyGrowRepository.save).toHaveBeenCalledWith(
        mockSimplyGrowOrder,
      );
    });
  });

  describe('createMarketMaking', () => {
    it('should successfully create a market making order', async () => {
      const mockMarketMakingOrder = {
        orderId: 'mm1',
        userId: 'user1',
        pair: 'BTC/USDT',
        exchangeName: 'ExchangeA',
        bidSpread: 0.001,
        askSpread: 0.001,
        orderAmount: 0.5,
        orderRefreshTime: 60, // Seconds
        numberOfLayers: 1,
        priceSourceType: PriceSourceType.MID_PRICE,
        amountChangePerLayer: 0.1,
        amountChangeType: 'percentage' as 'fixed' | 'percentage',
        ceilingPrice: 60000,
        floorPrice: 50000,
        balanceA: 100,
        balanceB: 1000,
        state: 'created' as MarketMakingStates,
        createdAt: new Date(),
        rewardAddress: '0x0000000000000000000000000000000000000000',
      } as unknown as MarketMakingOrder;

      jest
        .spyOn(marketMakingRepository, 'save')
        .mockResolvedValue(mockMarketMakingOrder);

      const result = await service.createMarketMaking(mockMarketMakingOrder);

      expect(result).toEqual(mockMarketMakingOrder);
      expect(marketMakingRepository.save).toHaveBeenCalledWith(
        mockMarketMakingOrder,
      );
    });
  });

  describe('updateMarketMakingOrderState', () => {
    it('should update the state of a market making order', async () => {
      const orderId = 'mm1';
      const newState = 'paused' as MarketMakingStates;

      jest.spyOn(marketMakingRepository, 'update').mockResolvedValue(undefined);

      await service.updateMarketMakingOrderState(orderId, newState);
      expect(marketMakingRepository.update).toHaveBeenCalledWith(
        { orderId },
        { state: newState },
      );
    });
  });

  describe('listEnabledMarketMakingStrategies', () => {
    it('returns only enabled pure market making definitions for user selection', async () => {
      jest.spyOn(strategyDefinitionRepository, 'find').mockResolvedValueOnce([
        {
          id: 'strategy-1',
          key: 'mm-basic',
          name: 'Basic MM',
          description: 'basic strategy',
          controllerType: 'pureMarketMaking',
          defaultConfig: { bidSpread: 0.1 },
          configSchema: { type: 'object' },
        } as unknown as StrategyDefinition,
        {
          id: 'strategy-2',
          key: 'volume',
          name: 'Volume',
          description: 'non-mm strategy',
          controllerType: 'volume',
          defaultConfig: { incrementPercentage: 0.1 },
          configSchema: { type: 'object' },
        } as unknown as StrategyDefinition,
      ]);

      const result = await service.listEnabledMarketMakingStrategies();

      expect(strategyDefinitionRepository.find).toHaveBeenCalledWith({
        where: { enabled: true },
        order: { updatedAt: 'DESC' },
      });
      expect(result).toEqual([
        {
          id: 'strategy-1',
          key: 'mm-basic',
          name: 'Basic MM',
          description: 'basic strategy',
          controllerType: 'pureMarketMaking',
          defaultConfig: { bidSpread: 0.1 },
          configSchema: { type: 'object' },
        },
      ]);
    });
  });

  describe('createMarketMakingOrderIntent', () => {
    it('persists configOverrides when creating market-making intent', async () => {
      jest
        .spyOn(growdataRepository, 'findMarketMakingPairById')
        .mockResolvedValueOnce({
          enable: true,
          symbol: 'BTC/USDT',
          exchange_id: 'binance',
        } as any);
      jest
        .spyOn(strategyDefinitionRepository, 'findOne')
        .mockResolvedValueOnce({
          id: 'strategy-1',
          enabled: true,
          controllerType: 'pureMarketMaking',
        } as StrategyDefinition);
      jest
        .spyOn(marketMakingOrderIntentRepository, 'create')
        .mockImplementation((payload) => payload as any);
      const saveSpy = jest
        .spyOn(marketMakingOrderIntentRepository, 'save')
        .mockImplementation(async (payload) => payload as any);

      const result = await service.createMarketMakingOrderIntent({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        marketMakingPairId: 'pair-1',
        strategyDefinitionId: 'strategy-1',
        configOverrides: {
          bidSpread: 0.002,
          orderRefreshTime: 15000,
        },
      });

      expect(result).toEqual({
        orderId: expect.any(String),
        memo: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(
        strategyConfigResolver.resolveForOrderSnapshot,
      ).toHaveBeenCalledWith(
        'strategy-1',
        expect.objectContaining({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          pair: 'BTC/USDT',
          exchangeName: 'binance',
        }),
      );
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          marketMakingPairId: 'pair-1',
          strategyDefinitionId: 'strategy-1',
          configOverrides: {
            bidSpread: 0.002,
            orderRefreshTime: 15000,
          },
          state: 'pending',
        }),
      );
    });

    it('rejects non-object configOverrides payloads', async () => {
      await expect(
        service.createMarketMakingOrderIntent({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          marketMakingPairId: 'pair-1',
          strategyDefinitionId: 'strategy-1',
          configOverrides: [] as any,
        }),
      ).rejects.toThrow('configOverrides must be an object');
    });

    it('rejects missing userId', async () => {
      await expect(
        service.createMarketMakingOrderIntent({
          userId: '' as any,
          marketMakingPairId: 'pair-1',
          strategyDefinitionId: 'strategy-1',
        }),
      ).rejects.toThrow('userId is required');
    });

    it('rejects invalid userId format', async () => {
      await expect(
        service.createMarketMakingOrderIntent({
          userId: 'not-a-uuid',
          marketMakingPairId: 'pair-1',
          strategyDefinitionId: 'strategy-1',
        }),
      ).rejects.toThrow('userId must be a valid UUID');
    });

    it('rejects configOverrides that try to override system-managed fields', async () => {
      await expect(
        service.createMarketMakingOrderIntent({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          marketMakingPairId: 'pair-1',
          strategyDefinitionId: 'strategy-1',
          configOverrides: {
            userId: '123e4567-e89b-12d3-a456-426614174001',
          },
        }),
      ).rejects.toThrow('configOverrides cannot override system field: userId');
    });

    it('rejects schema-invalid configOverrides before persisting intent', async () => {
      const saveSpy = jest.spyOn(marketMakingOrderIntentRepository, 'save');

      jest
        .spyOn(growdataRepository, 'findMarketMakingPairById')
        .mockResolvedValueOnce({
          enable: true,
          symbol: 'BTC/USDT',
          exchange_id: 'binance',
        } as any);
      jest
        .spyOn(strategyDefinitionRepository, 'findOne')
        .mockResolvedValueOnce({
          id: 'strategy-1',
          enabled: true,
          controllerType: 'pureMarketMaking',
        } as StrategyDefinition);
      jest
        .spyOn(strategyConfigResolver, 'resolveForOrderSnapshot')
        .mockRejectedValueOnce(
          new Error('Config field orderRefreshTime must be number'),
        );

      await expect(
        service.createMarketMakingOrderIntent({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          marketMakingPairId: 'pair-1',
          strategyDefinitionId: 'strategy-1',
          configOverrides: {
            orderRefreshTime: '15000' as any,
          },
        }),
      ).rejects.toThrow('Config field orderRefreshTime must be number');

      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('rejects non-market-making strategy definitions', async () => {
      jest
        .spyOn(growdataRepository, 'findMarketMakingPairById')
        .mockResolvedValueOnce({
          enable: true,
          symbol: 'BTC/USDT',
          exchange_id: 'binance',
        } as any);
      jest
        .spyOn(strategyDefinitionRepository, 'findOne')
        .mockResolvedValueOnce({
          id: 'strategy-2',
          enabled: true,
          controllerType: 'volume',
        } as StrategyDefinition);

      await expect(
        service.createMarketMakingOrderIntent({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          marketMakingPairId: 'pair-1',
          strategyDefinitionId: 'strategy-2',
        }),
      ).rejects.toThrow(
        'strategyDefinitionId must reference a pure market making definition',
      );
    });
  });

  describe('user-facing source filters', () => {
    it('filters admin direct orders from market-making lists', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(marketMakingRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      await service.findMarketMakingByUserId('user-1');

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'order.userId = :userId',
        {
          userId: 'user-1',
        },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(order.source IS NULL OR order.source != :source)',
        { source: 'admin_direct' },
      );
    });

    it('filters admin direct orders from public detail lookups', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(undefined),
      };

      jest
        .spyOn(marketMakingRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      await service.findPublicMarketMakingByOrderId('order-1');

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'order.orderId = :orderId',
        {
          orderId: 'order-1',
        },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(order.source IS NULL OR order.source != :source)',
        { source: 'admin_direct' },
      );
    });

    it('filters admin direct orders from combined user strategy lists', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(marketMakingRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);
      jest.spyOn(simplyGrowRepository, 'findBy').mockResolvedValue([]);

      await service.findAllStrategyByUser('user-1');

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(order.source IS NULL OR order.source != :source)',
        { source: 'admin_direct' },
      );
    });
  });
});

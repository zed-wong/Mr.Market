import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArbitrageHistory } from 'src/common/entities/market-making/arbitrage-order.entity';
import { MarketMakingHistory } from 'src/common/entities/market-making/market-making-order.entity';
import { MarketMakingOrderIntent } from 'src/common/entities/market-making/market-making-order-intent.entity';
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
import { Repository } from 'typeorm';

import { CustomLogger } from '../../infrastructure/logger/logger.service';
import { StrategyService } from '../strategy/strategy.service';
import { UserOrdersService } from './user-orders.service';

jest.mock('../../infrastructure/logger/logger.service');
jest.mock('../strategy/strategy.service');

describe('UserOrdersService', () => {
  let service: UserOrdersService;
  let strategyService: StrategyService;
  let marketMakingRepository: Repository<MarketMakingOrder>;
  let simplyGrowRepository: Repository<SimplyGrowOrder>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        UserOrdersService,
        CustomLogger,
        StrategyService,
        ConfigService,
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
          provide: getRepositoryToken(MarketMakingHistory),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(ArbitrageHistory),
          useClass: Repository,
        },
        {
          provide: 'BullQueue_market-making',
          useValue: { add: jest.fn() },
        },
        {
          provide: GrowdataRepository,
          useValue: {},
        },
      ],
    }).compile();

    service = testingModule.get<UserOrdersService>(UserOrdersService);
    strategyService = testingModule.get<StrategyService>(StrategyService);
    marketMakingRepository = testingModule.get<Repository<MarketMakingOrder>>(
      getRepositoryToken(MarketMakingOrder),
    );
    simplyGrowRepository = testingModule.get<Repository<SimplyGrowOrder>>(
      getRepositoryToken(SimplyGrowOrder),
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

  it('should correctly handle both active and paused orders', async () => {
    // Mock data for running and paused orders
    const mockActiveMMOrders = [
      {
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
      },
    ] as unknown as MarketMakingOrder[];
    const mockPausedMMOrders = [
      {
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
        state: 'paused' as MarketMakingStates,
        createdAt: new Date(),
        rewardAddress: '0x0000000000000000000000000000000000000000',
      },
    ] as unknown as MarketMakingOrder[];

    jest
      .spyOn(marketMakingRepository, 'findBy')
      .mockImplementation(async (criteria: any) => {
        if (criteria.state === 'created') return mockActiveMMOrders;
        if (criteria.state === 'paused') return mockPausedMMOrders;

        return [];
      });

    const queueAddSpy = jest.spyOn(
      testingModule.get('BullQueue_market-making'),
      'add',
    );

    // Execute the method under test
    await service.updateExecutionBasedOnOrders();

    expect(queueAddSpy).toHaveBeenCalledWith('start_mm', {
      userId: 'user1',
      orderId: 'mm1',
    });
    expect(queueAddSpy).toHaveBeenCalledWith('stop_mm', {
      userId: 'user1',
      orderId: 'mm1',
    });
  });
});

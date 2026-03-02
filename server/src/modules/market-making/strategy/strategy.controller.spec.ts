import { Test, TestingModule } from '@nestjs/testing';

import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';

describe('StrategyController', () => {
  let controller: StrategyController;
  const mockStrategyService = {
    getRunningStrategies: jest.fn().mockResolvedValue([]),
    getAllStrategies: jest.fn().mockResolvedValue([]),
    getSupportedControllerTypes: jest
      .fn()
      .mockReturnValue(['arbitrage', 'pureMarketMaking', 'volume']),
    rerunStrategy: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StrategyController],
      providers: [
        {
          provide: StrategyService,
          useValue: mockStrategyService,
        },
      ],
    }).compile();

    controller = module.get<StrategyController>(StrategyController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns supported controller types', () => {
    expect(controller.getSupportedControllers()).toEqual({
      controllers: ['arbitrage', 'pureMarketMaking', 'volume'],
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';

import { AdminStrategyService } from '../../admin/strategy/adminStrategy.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { TimeIndicatorStrategyService } from './time-indicator.service';
import { TimeIndicatorStrategyDto } from './timeIndicator.dto';

const mockStrategyService = {
  // mock methods of StrategyService that are used by StrategyController
};

describe('StrategyController', () => {
  let controller: StrategyController;
  const mockTimeIndicatorStrategyService = {
    executeIndicatorStrategy: jest.fn(),
    startIndicatorStrategy: jest.fn(),
    stopIndicatorStrategy: jest.fn(),
  };
  // let adminService: AdminStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StrategyController],
      providers: [
        {
          provide: AdminStrategyService,
          useValue: {
            joinStrategy: jest.fn(),
          }, // Use the mock admin here
        },
        {
          provide: StrategyService,
          useValue: mockStrategyService, // Use the mock StrategyService here
        },
        {
          provide: TimeIndicatorStrategyService,
          useValue: mockTimeIndicatorStrategyService,
        },
      ],
    }).compile();

    controller = module.get<StrategyController>(StrategyController);
    // adminService = module.get<AdminStrategyService>(AdminStrategyService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should execute indicator strategy', async () => {
    const dto: TimeIndicatorStrategyDto = {
      userId: 'user-1',
      clientId: 'client-1',
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      timeframe: '1m',
      lookback: 100,
      emaFast: 12,
      emaSlow: 26,
      rsiPeriod: 14,
      indicatorMode: 'ema',
      orderMode: 'base',
      orderSize: 1,
      tickIntervalMs: 1000,
    };

    mockTimeIndicatorStrategyService.executeIndicatorStrategy.mockResolvedValue(
      undefined,
    );

    await controller.execute(dto);

    expect(
      mockTimeIndicatorStrategyService.executeIndicatorStrategy,
    ).toHaveBeenCalledWith(dto);
  });

  it('should start indicator strategy', async () => {
    const dto: TimeIndicatorStrategyDto = {
      userId: 'user-1',
      clientId: 'client-1',
      exchangeName: 'binance',
      symbol: 'BTC/USDT',
      timeframe: '1m',
      lookback: 100,
      emaFast: 12,
      emaSlow: 26,
      rsiPeriod: 14,
      indicatorMode: 'ema',
      orderMode: 'base',
      orderSize: 1,
      tickIntervalMs: 1000,
    };
    const expected = { message: 'Started strategy for user-1:client-1' };

    mockTimeIndicatorStrategyService.startIndicatorStrategy.mockResolvedValue(
      expected,
    );

    const result = await controller.start(dto);

    expect(
      mockTimeIndicatorStrategyService.startIndicatorStrategy,
    ).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('should stop indicator strategy', async () => {
    const dto = { userId: 'user-1', clientId: 'client-1' };
    const expected = { message: 'Stopped strategy for user-1:client-1' };

    mockTimeIndicatorStrategyService.stopIndicatorStrategy.mockResolvedValue(
      expected,
    );

    const result = await controller.stop(dto);

    expect(
      mockTimeIndicatorStrategyService.stopIndicatorStrategy,
    ).toHaveBeenCalledWith(dto.userId, dto.clientId);
    expect(result).toEqual(expected);
  });
});

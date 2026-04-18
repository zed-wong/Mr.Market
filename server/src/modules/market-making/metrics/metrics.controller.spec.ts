import { Test, TestingModule } from '@nestjs/testing';

import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

const mockMetricsService = {
  getStrategyMetrics: jest.fn(),
  getRuntimeMetrics: jest.fn(),
};

describe('MetricsController', () => {
  let controller: MetricsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
      controllers: [MetricsController],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns runtime metrics through the controller', () => {
    mockMetricsService.getRuntimeMetrics.mockReturnValue({
      stats: [],
      recent: [],
    });

    expect(controller.getRuntimeMetrics()).toEqual({
      stats: [],
      recent: [],
    });
    expect(mockMetricsService.getRuntimeMetrics).toHaveBeenCalledTimes(1);
  });
});

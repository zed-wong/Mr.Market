import { Test, TestingModule } from '@nestjs/testing';
import { getEntityManagerToken } from '@nestjs/typeorm';

import { ExchangeInitService } from '../exchange-init/exchange-init.service';
import { CustomLogger } from '../logger/logger.service';
import { HealthService } from './health.service';

const mockEntityManager = {
  // Mock methods as needed, for example:
  query: jest.fn().mockResolvedValue([]),
};

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        CustomLogger,
        {
          provide: getEntityManagerToken(),
          useValue: mockEntityManager,
        },
        {
          provide: 'BullQueue_snapshots',
          useValue: {
            getWaitingCount: jest.fn(),
            getActiveCount: jest.fn(),
            getCompletedCount: jest.fn(),
            getFailedCount: jest.fn(),
            getDelayedCount: jest.fn(),
            isPaused: jest.fn(),
            getActive: jest.fn(),
            getFailed: jest.fn(),
            getCompleted: jest.fn(),
            client: {
              get: jest.fn(),
            },
          },
        },
        {
          provide: ExchangeInitService,
          useValue: {
            getExchange: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);

    const bitfinex = {
      id: 'bitfinex',
      name: 'Bitfinex',
      fetchBalance: jest.fn(),
    } as any;
    const mexc = {
      id: 'mexc',
      name: 'MEXC Global',
      fetchBalance: jest.fn(),
    } as any;
    const binance = {
      id: 'binance',
      name: 'Binance',
      fetchBalance: jest.fn(),
    } as any;

    service['exchanges'].set('bitfinex', bitfinex);
    service['exchanges'].set('mexc', mexc);
    service['exchanges'].set('binance', binance);

    bitfinex.fetchBalance.mockRejectedValue(
      new Error('Exchange bitfinex is dead'),
    );
    mexc.fetchBalance.mockResolvedValue(undefined);
    binance.fetchBalance.mockResolvedValue({ total: 100 });

    const exchangeInitService =
      module.get<ExchangeInitService>(ExchangeInitService);

    exchangeInitService.getExchange = jest.fn((exchangeName: string) =>
      service['exchanges'].get(exchangeName),
    );
  });
  describe('getAllHealth', () => {
    it('should throw error and not handle any additional exchange if any exchange fetch fail', async () => {
      await expect(service.getAllHealth()).rejects.toThrow(
        'Exchange bitfinex is dead',
      );
    });
    it('should handle both alive and dead exchanges fetch', async () => {
      const bitfinexMock = service['exchanges'].get('bitfinex');

      bitfinexMock.fetchBalance = jest.fn().mockResolvedValue({ total: 100 });
      const allExchangesHealthResult = await service.getAllHealth();

      expect(allExchangesHealthResult).toEqual([
        { Bitfinex: 'alive' },
        { 'MEXC Global': 'dead' },
        { Binance: 'alive' },
      ]);
    });
  });
  describe('getExchangeHealth', () => {
    it('should return health status of a specific exchange', async () => {
      const healthStatus = await service.getExchangeHealth('binance');

      expect(healthStatus).toEqual({ statusCode: 200, message: 'alive' });
    });

    it('should throw BadRequestException if exchange not found', async () => {
      await expect(service.getExchangeHealth('unknown')).rejects.toThrow(
        'Exchange not found',
      );
    });

    it('should mark an exchange as dead if fetchBalance fails', async () => {
      await expect(service.getExchangeHealth('bitfinex')).rejects.toThrow(
        'Exchange bitfinex is dead',
      );
    });
  });

  it('ping should return "pong"', async () => {
    await expect(service.ping()).resolves.toEqual('pong');
  });
});

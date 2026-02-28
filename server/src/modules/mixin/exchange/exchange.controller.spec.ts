// exchange.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExchangeController } from './exchange.controller';

describe('ExchangeController', () => {
  let controller: ExchangeController;
  let service: ExchangeApiKeyService;

  beforeEach(async () => {
    // Mock ExchangeApiKeyService
    const mockExchangeService = {
      getAllSpotOrders: jest.fn(() => Promise.resolve(['order1', 'order2'])), // Example response
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeController],
      providers: [
        {
          provide: ExchangeApiKeyService,
          useValue: mockExchangeService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true }) // Mock JwtAuthGuard to always allow access
      .compile();

    controller = module.get<ExchangeController>(ExchangeController);
    service = module.get<ExchangeApiKeyService>(ExchangeApiKeyService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllSpotOrders', () => {
    it('should return an array of spot orders', async () => {
      // Act
      const result = await controller.getAllSpotOrders();

      // Assert
      expect(result).toEqual(['order1', 'order2']);
      expect(service.getAllSpotOrders).toHaveBeenCalled();
    });
  });
});

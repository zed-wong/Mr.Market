import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';

import { AdminExchangesController } from './exchanges.controller';

describe('AdminExchangesController', () => {
  let controller: AdminExchangesController;
  let exchangeService: jest.Mocked<ExchangeApiKeyService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminExchangesController],
      providers: [
        {
          provide: ExchangeApiKeyService,
          useValue: {
            readAllAPIKeys: jest.fn(),
            addApiKey: jest.fn(),
            getEncryptionPublicKey: jest.fn(),
            removeAPIKey: jest.fn(),
            removeAPIKeysByExchange: jest.fn(),
            updateAPIKeyState: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AdminExchangesController>(AdminExchangesController);
    exchangeService = module.get(ExchangeApiKeyService);
  });

  it('lists API keys', async () => {
    exchangeService.readAllAPIKeys.mockResolvedValueOnce([]);

    await controller.getAllAPIKeys();

    expect(exchangeService.readAllAPIKeys).toHaveBeenCalled();
  });

  it('adds API key with default exchange_index', async () => {
    exchangeService.addApiKey.mockResolvedValueOnce({} as never);

    await controller.addAPIKey({
      exchange: 'binance',
      exchange_index: '',
      name: 'main',
      api_key: 'api-key',
      api_secret: 'api-secret',
    });

    expect(exchangeService.addApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'binance',
        name: 'main',
        api_key: 'api-key',
      }),
    );
  });

  it('removes API key by id', async () => {
    await controller.removeAPIKey('key-1');

    expect(exchangeService.removeAPIKey).toHaveBeenCalledWith('key-1');
  });

  it('removes API keys by exchange', async () => {
    await controller.removeAPIKeysByExchange('binance');

    expect(exchangeService.removeAPIKeysByExchange).toHaveBeenCalledWith(
      'binance',
    );
  });

  it('updates API key enabled state', async () => {
    await controller.updateAPIKeyState('key-1', { enabled: false });

    expect(exchangeService.updateAPIKeyState).toHaveBeenCalledWith(
      'key-1',
      false,
    );
  });
});

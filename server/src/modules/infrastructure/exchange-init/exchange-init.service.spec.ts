/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';

import { ExchangeInitService } from './exchange-init.service';

describe('ExchangeinitService', () => {
  let service: ExchangeInitService;
  let exchangeService: {
    readSupportedExchanges: jest.Mock;
    readDecryptedAPIKeys: jest.Mock;
    seedApiKeysFromEnv: jest.Mock;
  };
  let initializeExchangeConfigsSpy: jest.SpyInstance;

  beforeEach(async () => {
    exchangeService = {
      readSupportedExchanges: jest.fn().mockResolvedValue(['binance']),
      readDecryptedAPIKeys: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            key_id: '1',
            exchange: 'binance',
            exchange_index: 'default',
            name: 'default',
            api_key: 'key',
            api_secret: 'secret',
          },
        ]),
      seedApiKeysFromEnv: jest.fn().mockResolvedValue(0),
    };

    initializeExchangeConfigsSpy = jest
      .spyOn(ExchangeInitService.prototype as any, 'initializeExchangeConfigs')
      .mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeInitService,
        {
          provide: CACHE_MANAGER,
          useValue: {},
        },
        {
          provide: ExchangeApiKeyService,
          useValue: exchangeService,
        },
      ],
    }).compile();

    service = module.get<ExchangeInitService>(ExchangeInitService);
  });

  afterEach(() => {
    initializeExchangeConfigsSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns supported exchanges from DB-backed list', async () => {
    const result = await service.getSupportedExchanges();

    expect(result).toEqual(['binance']);
    expect(exchangeService.readSupportedExchanges).toHaveBeenCalledTimes(1);
  });

  it('refreshes exchanges only when refreshExchanges is called', async () => {
    await Promise.resolve();
    expect(initializeExchangeConfigsSpy).toHaveBeenCalledTimes(1);

    await service.refreshExchanges('test');

    expect(initializeExchangeConfigsSpy).toHaveBeenCalledTimes(2);
  });
});

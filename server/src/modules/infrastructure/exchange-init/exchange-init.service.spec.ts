/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';

import { ExchangeInitService } from './exchange-init.service';

describe('ExchangeinitService', () => {
  let service: ExchangeInitService;
  const originalSandboxEnv = {
    enabled: process.env.CCXT_SANDBOX_ENABLED,
    exchange: process.env.CCXT_SANDBOX_EXCHANGE,
    apiKey: process.env.CCXT_SANDBOX_API_KEY,
    secret: process.env.CCXT_SANDBOX_SECRET,
    accountLabel: process.env.CCXT_SANDBOX_ACCOUNT_LABEL,
  };
  let exchangeService: {
    readSupportedExchanges: jest.Mock;
    readDecryptedAPIKeys: jest.Mock;
    seedApiKeysFromEnv: jest.Mock;
  };
  let initializeExchangeConfigsSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    delete process.env.CCXT_SANDBOX_ENABLED;
    delete process.env.CCXT_SANDBOX_EXCHANGE;
    delete process.env.CCXT_SANDBOX_API_KEY;
    delete process.env.CCXT_SANDBOX_SECRET;
    delete process.env.CCXT_SANDBOX_ACCOUNT_LABEL;
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
    jest.clearAllTimers();
    jest.useRealTimers();
    initializeExchangeConfigsSpy.mockRestore();
    restoreEnvVar('CCXT_SANDBOX_ENABLED', originalSandboxEnv.enabled);
    restoreEnvVar('CCXT_SANDBOX_EXCHANGE', originalSandboxEnv.exchange);
    restoreEnvVar('CCXT_SANDBOX_API_KEY', originalSandboxEnv.apiKey);
    restoreEnvVar('CCXT_SANDBOX_SECRET', originalSandboxEnv.secret);
    restoreEnvVar('CCXT_SANDBOX_ACCOUNT_LABEL', originalSandboxEnv.accountLabel);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns supported exchanges from DB-backed list', async () => {
    const result = await service.getSupportedExchanges();

    expect(result).toEqual(['binance']);
    expect(exchangeService.readSupportedExchanges).toHaveBeenCalledTimes(1);
  });

  it('refreshes exchanges when API keys change', async () => {
    await Promise.resolve();
    expect(initializeExchangeConfigsSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10 * 1000);
    await Promise.resolve();

    expect(initializeExchangeConfigsSpy).toHaveBeenCalledTimes(2);
  });

  it('uses env-driven sandbox config when sandbox credentials are present', async () => {
    process.env.CCXT_SANDBOX_EXCHANGE = 'binance';
    process.env.CCXT_SANDBOX_API_KEY = 'sandbox-key';
    process.env.CCXT_SANDBOX_SECRET = 'sandbox-secret';
    process.env.CCXT_SANDBOX_ACCOUNT_LABEL = 'testnet';
    initializeExchangeConfigsSpy.mockClear();
    exchangeService.seedApiKeysFromEnv.mockClear();

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

    const sandboxService = module.get<ExchangeInitService>(ExchangeInitService);

    await Promise.resolve();

    expect(sandboxService).toBeDefined();
    expect(initializeExchangeConfigsSpy).toHaveBeenLastCalledWith([
      expect.objectContaining({
        name: 'binance',
        accounts: [
          expect.objectContaining({
            label: 'testnet',
            apiKey: 'sandbox-key',
            secret: 'sandbox-secret',
            sandboxMode: true,
          }),
        ],
      }),
    ]);
    expect(exchangeService.seedApiKeysFromEnv).not.toHaveBeenCalled();

    await module.close();
  });

  it('does not start DB refresh polling when sandbox config is active', async () => {
    process.env.CCXT_SANDBOX_EXCHANGE = 'binance';
    process.env.CCXT_SANDBOX_API_KEY = 'sandbox-key';
    process.env.CCXT_SANDBOX_SECRET = 'sandbox-secret';
    initializeExchangeConfigsSpy.mockClear();
    const startRefreshSpy = jest
      .spyOn(ExchangeInitService.prototype as any, 'startRefresh')
      .mockImplementation(() => undefined);

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

    const sandboxService = module.get<ExchangeInitService>(ExchangeInitService);

    await Promise.resolve();
    expect(sandboxService).toBeDefined();
    expect(startRefreshSpy).not.toHaveBeenCalled();

    await module.close();
    startRefreshSpy.mockRestore();
  });
});

function restoreEnvVar(
  key: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[key];

    return;
  }

  process.env[key] = value;
}

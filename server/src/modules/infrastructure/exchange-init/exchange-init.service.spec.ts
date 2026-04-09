/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';

import { ExchangeInitService } from './exchange-init.service';

describe('ExchangeinitService', () => {
  let service: ExchangeInitService;
  const originalSandboxEnv = {
    exchange: process.env.CCXT_SANDBOX_EXCHANGE,
    apiKey: process.env.CCXT_SANDBOX_API_KEY,
    secret: process.env.CCXT_SANDBOX_SECRET,
    accountLabel: process.env.CCXT_SANDBOX_ACCOUNT_LABEL,
    account2ApiKey: process.env.CCXT_SANDBOX_ACCOUNT2_API_KEY,
    account2Secret: process.env.CCXT_SANDBOX_ACCOUNT2_SECRET,
    account2Label: process.env.CCXT_SANDBOX_ACCOUNT2_LABEL,
    systemTestSandboxFlag: process.env.MR_MARKET_SYSTEM_TEST_SANDBOX_EXCHANGE,
  };
  let exchangeService: {
    readSupportedExchanges: jest.Mock;
    readDecryptedAPIKeys: jest.Mock;
    seedApiKeysFromEnv: jest.Mock;
  };
  let initializeExchangeConfigsSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    delete process.env.CCXT_SANDBOX_EXCHANGE;
    delete process.env.CCXT_SANDBOX_API_KEY;
    delete process.env.CCXT_SANDBOX_SECRET;
    delete process.env.CCXT_SANDBOX_ACCOUNT_LABEL;
    delete process.env.CCXT_SANDBOX_ACCOUNT2_API_KEY;
    delete process.env.CCXT_SANDBOX_ACCOUNT2_SECRET;
    delete process.env.CCXT_SANDBOX_ACCOUNT2_LABEL;
    delete process.env.MR_MARKET_SYSTEM_TEST_SANDBOX_EXCHANGE;
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
    restoreEnvVar('CCXT_SANDBOX_EXCHANGE', originalSandboxEnv.exchange);
    restoreEnvVar('CCXT_SANDBOX_API_KEY', originalSandboxEnv.apiKey);
    restoreEnvVar('CCXT_SANDBOX_SECRET', originalSandboxEnv.secret);
    restoreEnvVar(
      'CCXT_SANDBOX_ACCOUNT_LABEL',
      originalSandboxEnv.accountLabel,
    );
    restoreEnvVar(
      'CCXT_SANDBOX_ACCOUNT2_API_KEY',
      originalSandboxEnv.account2ApiKey,
    );
    restoreEnvVar(
      'CCXT_SANDBOX_ACCOUNT2_SECRET',
      originalSandboxEnv.account2Secret,
    );
    restoreEnvVar(
      'CCXT_SANDBOX_ACCOUNT2_LABEL',
      originalSandboxEnv.account2Label,
    );
    restoreEnvVar(
      'MR_MARKET_SYSTEM_TEST_SANDBOX_EXCHANGE',
      originalSandboxEnv.systemTestSandboxFlag,
    );
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

  it('retries transient exchange initialization failures before giving up', async () => {
    class FlakyExchange {
      static attempts = 0;
      has = {};

      async loadMarkets() {
        FlakyExchange.attempts += 1;

        if (FlakyExchange.attempts < 3) {
          throw new Error('temporary network failure');
        }
      }
    }

    (service as any).initializationRetryDelayMs = 0;

    const exchange = await (service as any).initializeAccountWithRetry(
      {
        name: 'mexc',
        class: FlakyExchange,
      },
      {
        label: 'default',
        apiKey: 'key',
        secret: 'secret',
      },
    );

    expect(exchange).toBeInstanceOf(FlakyExchange);
    expect(FlakyExchange.attempts).toBe(3);
  });

  it('reports pending exchanges as not ready without throwing', () => {
    (service as any).exchangeInitializationStates.set('mexc', 'pending');

    expect(service.isReady('mexc')).toBe(false);
  });

  it('notifies ready listeners for each initialized account label', async () => {
    const listener = jest.fn();
    const unsubscribe = service.onExchangeReady(listener);

    (service as any).notifyExchangeReady('mexc', ['default', 'desk-1']);
    await Promise.resolve();

    expect(listener).toHaveBeenNthCalledWith(1, 'mexc', 'default');
    expect(listener).toHaveBeenNthCalledWith(2, 'mexc', 'desk-1');

    unsubscribe();
  });

  it('uses env-driven sandbox config when sandbox credentials are present', async () => {
    process.env.MR_MARKET_SYSTEM_TEST_SANDBOX_EXCHANGE = 'true';
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

  it('ignores sandbox credentials outside the system-test sandbox runtime', async () => {
    process.env.CCXT_SANDBOX_EXCHANGE = 'binance';
    process.env.CCXT_SANDBOX_API_KEY = 'sandbox-key';
    process.env.CCXT_SANDBOX_SECRET = 'sandbox-secret';
    initializeExchangeConfigsSpy.mockClear();
    exchangeService.readDecryptedAPIKeys.mockReset();
    exchangeService.readDecryptedAPIKeys
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
      ]);
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

    await Promise.resolve();

    expect(initializeExchangeConfigsSpy).not.toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'binance',
        accounts: expect.arrayContaining([
          expect.objectContaining({
            sandboxMode: true,
          }),
        ]),
      }),
    ]);
    expect(exchangeService.seedApiKeysFromEnv).toHaveBeenCalledTimes(1);

    await module.close();
  });

  it('includes an optional second sandbox account when account2 credentials are present', async () => {
    process.env.MR_MARKET_SYSTEM_TEST_SANDBOX_EXCHANGE = 'true';
    process.env.CCXT_SANDBOX_EXCHANGE = 'binance';
    process.env.CCXT_SANDBOX_API_KEY = 'sandbox-key';
    process.env.CCXT_SANDBOX_SECRET = 'sandbox-secret';
    process.env.CCXT_SANDBOX_ACCOUNT_LABEL = 'testnet';
    process.env.CCXT_SANDBOX_ACCOUNT2_API_KEY = 'sandbox-key-2';
    process.env.CCXT_SANDBOX_ACCOUNT2_SECRET = 'sandbox-secret-2';
    process.env.CCXT_SANDBOX_ACCOUNT2_LABEL = 'maker-b';
    initializeExchangeConfigsSpy.mockClear();

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

    await Promise.resolve();

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
          expect.objectContaining({
            label: 'maker-b',
            apiKey: 'sandbox-key-2',
            secret: 'sandbox-secret-2',
            sandboxMode: true,
          }),
        ],
      }),
    ]);

    await module.close();
  });

  it('does not start DB refresh polling when sandbox config is active', async () => {
    process.env.MR_MARKET_SYSTEM_TEST_SANDBOX_EXCHANGE = 'true';
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

  it('reports pending exchange initialization separately from configuration errors', () => {
    (service as any).exchangeInitializationStates.set('binance', 'pending');

    expect(() => service.getExchange('binance')).toThrow(
      'Exchange binance is still initializing.',
    );
  });

  it('surfaces exchange initialization failure details', () => {
    (service as any).exchangeInitializationStates.set('binance', 'failed');
    (service as any).exchangeInitializationErrors.set(
      'binance:default',
      new Error('binance testnet exchangeInfo timed out'),
    );

    expect(() => service.getExchange('binance')).toThrow(
      'Exchange binance failed to initialize: binance testnet exchangeInfo timed out',
    );
  });
});

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];

    return;
  }

  process.env[key] = value;
}

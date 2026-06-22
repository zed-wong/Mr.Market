/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';
import { TradingAccountService } from 'src/modules/market-making/trading-account/trading-account.service';

import { ExchangeInitService } from './exchange-init.service';

describe('ExchangeinitService', () => {
  let service: ExchangeInitService;
  let exchangeService: {
    readSupportedExchanges: jest.Mock;
    readDecryptedAPIKeys: jest.Mock;
  };
  let tradingAccountService: {
    listValidWalletCredentialsByPurpose: jest.Mock;
  };
  let initializeExchangeConfigsSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    exchangeService = {
      readSupportedExchanges: jest.fn().mockResolvedValue(['binance']),
      readDecryptedAPIKeys: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            key_id: '1',
            exchange: 'binance',
            name: 'default',
            api_key: 'key',
            api_secret: 'secret',
          },
        ]),
    };
    tradingAccountService = {
      listValidWalletCredentialsByPurpose: jest.fn().mockResolvedValue([]),
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
        {
          provide: TradingAccountService,
          useValue: tradingAccountService,
        },
      ],
    }).compile();

    service = module.get<ExchangeInitService>(ExchangeInitService);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    initializeExchangeConfigsSpy.mockRestore();
  });
  it('returns supported exchanges from DB-backed list', async () => {
    const result = await service.getSupportedExchanges();

    expect(result).toEqual(['binance']);
    expect(exchangeService.readSupportedExchanges).toHaveBeenCalledTimes(1);
  });

  it('builds DB-backed exchange configs with key_id account labels', () => {
    const exchangeConfigs = (service as any).buildExchangeConfigsFromDb([
      {
        key_id: '42',
        exchange: 'binance',
        name: 'desk-42',
        api_key: 'key',
        api_secret: 'secret',
      },
    ]);

    expect(exchangeConfigs).toEqual([
      expect.objectContaining({
        name: 'binance',
        accounts: [
          expect.objectContaining({
            label: '42',
            apiKey: 'key',
            secret: 'secret',
          }),
        ],
      }),
    ]);
  });

  it('maps hyperliquid api_key to walletAddress during DB-backed config build', () => {
    const exchangeConfigs = (service as any).buildExchangeConfigsFromDb([
      {
        key_id: '77',
        exchange: 'hyperliquid',
        name: 'hl-77',
        api_key: '0xabc123',
        api_secret: 'secret',
      },
    ]);

    expect(exchangeConfigs).toEqual([
      expect.objectContaining({
        name: 'hyperliquid',
        accounts: [
          expect.objectContaining({
            label: '77',
            apiKey: '0xabc123',
            secret: 'secret',
            walletAddress: '0xabc123',
          }),
        ],
      }),
    ]);
  });

  it('adds valid clob_trading TradingAccounts as Hyperliquid wallet accounts', () => {
    const exchangeConfigs = (service as any).buildExchangeConfigsFromDb(
      [],
      [
        {
          id: 'hl-wallet-1',
          label: 'HL Wallet',
          purpose: 'clob_trading',
          walletAddress: '0xwallet',
          privateKey: 'private-key',
        },
      ],
    );

    expect(exchangeConfigs).toEqual([
      expect.objectContaining({
        name: 'hyperliquid',
        accounts: [
          expect.objectContaining({
            label: 'hl-wallet-1',
            apiKey: '0xwallet',
            secret: 'private-key',
            walletAddress: '0xwallet',
          }),
        ],
      }),
    ]);
  });

  it('skips CLOB TradingAccount preload when migrations have not created the table', async () => {
    tradingAccountService.listValidWalletCredentialsByPurpose.mockRejectedValueOnce(
      new Error('SQLITE_ERROR: no such table: trading_accounts'),
    );

    await expect((service as any).readClobTradingAccounts()).resolves.toEqual(
      [],
    );
  });

  it('passes walletAddress to exchange initialization when configured', async () => {
    class HyperliquidExchange {
      has = {};
      constructor(public readonly options: Record<string, unknown>) {}
      async loadMarkets() {}
    }

    const exchange = await (service as any).initializeAccountWithRetry(
      {
        name: 'hyperliquid',
        class: HyperliquidExchange,
      },
      {
        label: 'hl-1',
        apiKey: '0xwallet',
        secret: 'private-key',
        walletAddress: '0xwallet',
      },
    );

    expect(exchange).toBeInstanceOf(HyperliquidExchange);
    expect((exchange as any).options).toEqual(
      expect.objectContaining({
        apiKey: '0xwallet',
        secret: 'private-key',
        walletAddress: '0xwallet',
        options: expect.objectContaining({
          builderFee: false,
          walletAddress: '0xwallet',
        }),
      }),
    );
  });

  it('refreshes exchanges when API keys change', async () => {
    await Promise.resolve();
    expect(initializeExchangeConfigsSpy).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10 * 1000);

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

  it('starts DB refresh polling after initialization', async () => {
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
        {
          provide: TradingAccountService,
          useValue: tradingAccountService,
        },
      ],
    }).compile();

    const sandboxService = module.get<ExchangeInitService>(ExchangeInitService);

    await Promise.resolve();
    expect(sandboxService).toBeDefined();
    expect(startRefreshSpy).toHaveBeenCalledTimes(1);

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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ccxt from 'ccxt';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';

import { ExchangeApiKeyService } from './exchange-api-key.service';

jest.mock('src/common/helpers/crypto', () => ({
  decrypt: jest.fn(),
  encrypt: jest.fn(),
  getPublicKeyFromPrivate: jest.fn(),
}));

const crypto = jest.requireMock('src/common/helpers/crypto');

describe('ExchangeApiKeyService', () => {
  const makeService = (overrides?: {
    readAllAPIKeys?: jest.Mock;
    addAPIKey?: jest.Mock;
    updateAPIKey?: jest.Mock;
    getConfig?: jest.Mock;
  }) => {
    const exchangeRepository = {
      readAllAPIKeys:
        overrides?.readAllAPIKeys || jest.fn().mockResolvedValue([]),
      addAPIKey: overrides?.addAPIKey || jest.fn().mockResolvedValue(undefined),
      updateAPIKey:
        overrides?.updateAPIKey || jest.fn().mockResolvedValue(undefined),
    } as any;

    const configService = {
      get: overrides?.getConfig || jest.fn().mockReturnValue('private-key'),
    } as unknown as ConfigService;

    return {
      service: new ExchangeApiKeyService(exchangeRepository, configService),
      exchangeRepository,
      configService,
    };
  };

  beforeEach(() => {
    crypto.decrypt.mockImplementation((value: string) => {
      if (value === 'transport-secret') {
        return 'plain-secret';
      }

      return value;
    });
    crypto.encrypt.mockImplementation((value: string) => `enc(${value})`);
    crypto.getPublicKeyFromPrivate.mockReturnValue('public-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns numeric free balance for requested symbol', async () => {
    const { service } = makeService();
    const fetchBalanceSpy = jest
      .spyOn((ccxt as any).binance.prototype, 'fetchBalance')
      .mockResolvedValue({
        free: {
          USDT: 42.5,
          BTC: 1.25,
        },
      } as any);

    try {
      const balance = await service.getBalanceBySymbol(
        'binance',
        'api-key',
        'api-secret',
        'USDT',
      );

      expect(balance).toBe(42.5);
      expect(typeof balance).toBe('number');
      await expect(
        service.checkExchangeBalanceEnough(
          'binance',
          'api-key',
          'api-secret',
          'USDT',
          '10',
        ),
      ).resolves.toBe(true);
    } finally {
      fetchBalanceSpy.mockRestore();
    }
  });

  it('masks api_secret when listing API keys', async () => {
    const readAllAPIKeys = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          key_id: '1',
          exchange: 'binance',
          name: 'default',
          api_key: 'key',
          api_secret: 'secret',
          validation_status: 'pending',
          created_at: '2026-04-02T00:00:00.000Z',
        } as APIKeysConfig,
      ]);

    const { service } = makeService({ readAllAPIKeys });

    const result = await service.readAllAPIKeys();

    expect(result[0].api_secret).toBe('********');
    expect(result[0].state).toBe('pending');
  });

  it('seeds API keys from env configs when DB is empty', async () => {
    const readAllAPIKeys = jest.fn().mockResolvedValue([]);
    const addAPIKey = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({ readAllAPIKeys, addAPIKey });

    const seeded = await service.seedApiKeysFromEnv([
      {
        name: 'binance',
        accounts: [{ label: 'default', apiKey: 'key', secret: 'secret' }],
      },
    ]);

    expect(seeded).toBe(1);
    expect(addAPIKey).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'binance',
        name: 'default',
        api_key: 'key',
        api_secret: 'enc(secret)',
        created_at: expect.any(String),
      }),
    );
  });

  it('trims name when adding an api key', async () => {
    const addAPIKey = jest.fn().mockImplementation(async (value) => value);
    const { service } = makeService({ addAPIKey });

    const result = await service.addApiKey({
      key_id: '1',
      exchange: 'binance',
      name: '  desk-1  ',
      api_key: 'key',
      api_secret: 'transport-secret',
    } as APIKeysConfig);

    expect(result).toEqual(
      expect.objectContaining({
        name: 'desk-1',
      }),
    );
    expect(addAPIKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'desk-1', validation_status: 'pending' }),
    );
  });

  it('rejects blank api key names after trim', async () => {
    const { service } = makeService();

    await expect(
      service.addApiKey({
        key_id: '1',
        exchange: 'binance',
        name: '   ',
        api_key: 'key',
        api_secret: 'transport-secret',
      } as APIKeysConfig),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets created_at when adding an api key', async () => {
    const addAPIKey = jest.fn().mockImplementation(async (value) => value);
    const { service } = makeService({ addAPIKey });

    const result = await service.addApiKey({
      key_id: '1',
      exchange: 'binance',
      name: 'default',
      api_key: 'key',
      api_secret: 'transport-secret',
    } as APIKeysConfig);

    expect(result).toEqual(
      expect.objectContaining({
        created_at: expect.any(String),
      }),
    );
  });

  it('builds hyperliquid exchange client options with walletAddress', () => {
    const { service } = makeService();

    expect(
      (service as any).buildExchangeClientOptions({
        exchange: 'hyperliquid',
        api_key: '0xwallet',
        api_secret: 'private-key',
      }),
    ).toEqual({
      apiKey: '0xwallet',
      secret: 'private-key',
      walletAddress: '0xwallet',
      options: {
        builderFee: false,
        walletAddress: '0xwallet',
      },
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
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
    getConfig?: jest.Mock;
  }) => {
    const exchangeRepository = {
      readAllAPIKeys:
        overrides?.readAllAPIKeys || jest.fn().mockResolvedValue([]),
      addAPIKey: overrides?.addAPIKey || jest.fn().mockResolvedValue(undefined),
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
          exchange_index: 'default',
          name: 'default',
          api_key: 'key',
          api_secret: 'secret',
        } as APIKeysConfig,
      ]);

    const { service } = makeService({ readAllAPIKeys });

    const result = await service.readAllAPIKeys();

    expect(result[0].api_secret).toBe('********');
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
        exchange_index: 'default',
        name: 'default',
        api_key: 'key',
        api_secret: 'enc(secret)',
      }),
    );
  });
});

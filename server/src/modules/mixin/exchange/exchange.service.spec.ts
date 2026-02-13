import { ConfigService } from '@nestjs/config';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';

import { ExchangeService } from './exchange.service';

jest.mock('src/common/helpers/crypto', () => ({
  decrypt: jest.fn(),
  encrypt: jest.fn(),
  getPublicKeyFromPrivate: jest.fn(),
}));

const crypto = jest.requireMock('src/common/helpers/crypto');

describe('ExchangeService', () => {
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
      service: new ExchangeService(exchangeRepository, configService),
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

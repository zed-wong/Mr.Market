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
    readAPIKey?: jest.Mock;
    addAPIKey?: jest.Mock;
    updateAPIKey?: jest.Mock;
    getConfig?: jest.Mock;
  }) => {
    const exchangeRepository = {
      readAllAPIKeys:
        overrides?.readAllAPIKeys || jest.fn().mockResolvedValue([]),
      readAPIKey: overrides?.readAPIKey || jest.fn().mockResolvedValue(null),
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

  it('returns an account snapshot for a stored API key', async () => {
    const readAPIKey = jest.fn().mockResolvedValue({
      key_id: '2',
      exchange: 'binance',
      name: 'main',
      api_key: 'api-key',
      api_secret: 'transport-secret',
      permissions: 'read-trade',
      validation_status: 'valid',
      validation_error: null,
      validated_at: '2026-05-22T00:00:00.000Z',
      created_at: '2026-05-21T00:00:00.000Z',
    } as APIKeysConfig);
    const { service } = makeService({ readAPIKey });
    const fetchBalanceSpy = jest
      .spyOn((ccxt as any).binance.prototype, 'fetchBalance')
      .mockResolvedValue({
        free: { USDT: 100, BTC: 0 },
        used: { USDT: 5, BTC: 0 },
        total: { USDT: 105, BTC: 0 },
      } as any);

    try {
      const snapshot = await service.getAPIKeyAccountSnapshot('2');

      expect(readAPIKey).toHaveBeenCalledWith('2');
      expect(fetchBalanceSpy).toHaveBeenCalledTimes(1);
      expect(snapshot).toMatchObject({
        key_id: '2',
        exchange: 'binance',
        name: 'main',
        permissions: 'read-trade',
        validation_status: 'valid',
        validation_error: null,
        validated_at: '2026-05-22T00:00:00.000Z',
        created_at: '2026-05-21T00:00:00.000Z',
        balance: {
          free: { USDT: 100 },
          used: { USDT: 5 },
          total: { USDT: 105 },
        },
      });
      expect(snapshot.generated_at).toEqual(expect.any(String));
    } finally {
      fetchBalanceSpy.mockRestore();
    }
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

  it('keeps API key validation pending when exchange balance validation times out', async () => {
    const readAPIKey = jest.fn().mockResolvedValue({
      key_id: '1',
      exchange: 'binance',
      name: 'default',
      api_key: 'key',
      api_secret: 'secret',
      validation_status: 'pending',
      created_at: '2026-04-02T00:00:00.000Z',
    } as APIKeysConfig);
    const updateAPIKey = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({ readAPIKey, updateAPIKey });
    const fetchBalanceSpy = jest
      .spyOn((ccxt as any).binance.prototype, 'fetchBalance')
      .mockImplementation(() => new Promise(() => undefined));

    try {
      (service as any).validationTimeoutMs = 1;
      const validation = (service as any).validateApiKeyInBackground('1');

      await validation;

      expect(updateAPIKey).toHaveBeenCalledWith('1', {
        validation_status: 'pending',
        validation_error: null,
        validated_at: null,
      });
    } finally {
      fetchBalanceSpy.mockRestore();
    }
  });

  it('revalidates pending and timed-out API keys from the scheduled validator', async () => {
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
        {
          key_id: '2',
          exchange: 'binance',
          name: 'timed-out',
          api_key: 'key-2',
          api_secret: 'secret-2',
          validation_status: 'invalid',
          validation_error: 'Validation timeout',
          created_at: '2026-04-02T00:00:00.000Z',
        } as APIKeysConfig,
        {
          key_id: '3',
          exchange: 'binance',
          name: 'valid',
          api_key: 'key-3',
          api_secret: 'secret-3',
          validation_status: 'valid',
          created_at: '2026-04-02T00:00:00.000Z',
        } as APIKeysConfig,
      ]);
    const readAPIKey = jest.fn().mockImplementation(async (keyId: string) => {
      if (keyId === '1') {
        return {
          key_id: '1',
          exchange: 'binance',
          name: 'default',
          api_key: 'key',
          api_secret: 'secret',
          validation_status: 'pending',
          created_at: '2026-04-02T00:00:00.000Z',
        } as APIKeysConfig;
      }

      if (keyId === '2') {
        return {
          key_id: '2',
          exchange: 'binance',
          name: 'timed-out',
          api_key: 'key-2',
          api_secret: 'secret-2',
          validation_status: 'invalid',
          validation_error: 'Validation timeout',
          created_at: '2026-04-02T00:00:00.000Z',
        } as APIKeysConfig;
      }

      return null;
    });
    const updateAPIKey = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({
      readAllAPIKeys,
      readAPIKey,
      updateAPIKey,
    });
    const fetchBalanceSpy = jest
      .spyOn((ccxt as any).binance.prototype, 'fetchBalance')
      .mockResolvedValue({ free: {} } as any);

    try {
      await service.pendingApiKeyValidator();

      expect(readAPIKey).toHaveBeenCalledWith('1');
      expect(readAPIKey).toHaveBeenCalledWith('2');
      expect(readAPIKey).not.toHaveBeenCalledWith('3');
      expect(updateAPIKey).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          validation_status: 'valid',
          validation_error: null,
        }),
      );
      expect(updateAPIKey).toHaveBeenCalledWith(
        '2',
        expect.objectContaining({
          validation_status: 'valid',
          validation_error: null,
        }),
      );
    } finally {
      fetchBalanceSpy.mockRestore();
    }
  });
});

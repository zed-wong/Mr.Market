import { BadRequestException } from '@nestjs/common';

import { CustomConfigEntity } from '../../../common/entities/admin/custom-config.entity';
import { AdminSystemConfigService } from './admin-system-config.service';

describe('AdminSystemConfigService', () => {
  const baseConfig: CustomConfigEntity = {
    config_id: 1,
    spot_fee: '0.002',
    market_making_fee: '0.001',
    enable_spot_fee: true,
    enable_market_making_fee: true,
    max_balance_mixin_bot: '100',
    max_balance_single_api_key: '25',
    funding_account: 'safe-wallet-address',
  };

  const createRepository = (config: CustomConfigEntity | null = baseConfig) => {
    const state = { config };
    const customConfigService = {
      readPrimaryConfig: jest.fn(async () => state.config),
      createConfig: jest.fn((input: Partial<CustomConfigEntity>) => ({
        ...input,
      })),
      saveConfig: jest.fn(async (input: CustomConfigEntity) => {
        state.config = input;

        return input;
      }),
    };

    return { customConfigService, state };
  };

  it('returns only allowlisted config metadata with explicit mutability and validation', async () => {
    const { customConfigService } = createRepository();
    const service = new AdminSystemConfigService(customConfigService as any);

    const response = await service.getConfig();

    expect(response.items).toHaveLength(7);
    expect(response.items.map((item) => item.key).sort()).toEqual([
      'fees.enable_market_making_fee',
      'fees.enable_spot_fee',
      'fees.market_making_fee',
      'fees.spot_fee',
      'funding.funding_account',
      'limits.max_balance_mixin_bot',
      'limits.max_balance_single_api_key',
    ]);
    expect(response.items[0]).toEqual(
      expect.objectContaining({
        label: expect.any(String),
        category: expect.any(String),
        type: expect.any(String),
        mutable: true,
        validation: expect.any(Object),
        source: 'custom_config',
        sourceClass: 'database',
        updatedAt: null,
        updatedBy: null,
      }),
    );
    expect(JSON.stringify(response)).not.toMatch(
      /JWT_SECRET|ADMIN_PASSWORD|private[_-]?key|authorization/i,
    );
  });

  it('validates and persists a safe decimal update', async () => {
    const { customConfigService, state } = createRepository({ ...baseConfig });
    const service = new AdminSystemConfigService(customConfigService as any);

    const response = await service.updateConfig({
      key: 'fees.spot_fee',
      value: '0.0035',
    });

    expect(customConfigService.saveConfig).toHaveBeenCalledTimes(1);
    expect(state.config?.spot_fee).toBe('0.0035');
    expect(response.item).toEqual(
      expect.objectContaining({
        key: 'fees.spot_fee',
        value: '0.0035',
      }),
    );
  });

  it('validates and persists boolean updates', async () => {
    const { customConfigService, state } = createRepository({ ...baseConfig });
    const service = new AdminSystemConfigService(customConfigService as any);

    await service.updateConfig({
      key: 'fees.enable_spot_fee',
      value: false,
    });

    expect(customConfigService.saveConfig).toHaveBeenCalledTimes(1);
    expect(state.config?.enable_spot_fee).toBe(false);
  });

  it('resets a safe mutable key to its default value', async () => {
    const { customConfigService, state } = createRepository({
      ...baseConfig,
      market_making_fee: '0.01',
    });
    const service = new AdminSystemConfigService(customConfigService as any);

    const response = await service.resetConfig({
      key: 'fees.market_making_fee',
    });

    expect(customConfigService.saveConfig).toHaveBeenCalledTimes(1);
    expect(state.config?.market_making_fee).toBe('0.001');
    expect(response.item.value).toBe('0.001');
  });

  it('rejects unknown, sensitive-looking, and dotted non-allowlisted keys without side effects', async () => {
    const { customConfigService } = createRepository({ ...baseConfig });
    const service = new AdminSystemConfigService(customConfigService as any);

    for (const key of [
      'JWT_SECRET',
      'security.api_secret_pepper',
      'fees.unknown',
      'constructor.prototype.polluted',
    ]) {
      await expect(
        service.updateConfig({ key, value: '1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    expect(customConfigService.saveConfig).not.toHaveBeenCalled();
  });

  it('rejects invalid value types and out-of-range decimals without side effects', async () => {
    const { customConfigService } = createRepository({ ...baseConfig });
    const service = new AdminSystemConfigService(customConfigService as any);

    await expect(
      service.updateConfig({ key: 'fees.spot_fee', value: '2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({
        key: 'fees.enable_spot_fee',
        value: { enabled: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig({
        key: 'funding.funding_account',
        value: ['wallet'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(customConfigService.saveConfig).not.toHaveBeenCalled();
  });

  it('rejects mass assignment and prototype pollution payloads without side effects', async () => {
    const { customConfigService } = createRepository({ ...baseConfig });
    const service = new AdminSystemConfigService(customConfigService as any);

    await expect(
      service.updateConfig({
        key: 'fees.spot_fee',
        value: '0.004',
        enable_spot_fee: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig(
        JSON.parse(
          '{"key":"fees.spot_fee","value":"0.004","__proto__":{"polluted":true}}',
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resetConfig({ key: 'fees.spot_fee', value: '0.004' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(customConfigService.saveConfig).not.toHaveBeenCalled();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminSystemConfigController } from './admin-system-config.controller';

describe('AdminSystemConfigController', () => {
  it('protects system config routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminSystemConfigController,
    );

    expect(guards).toContain(JwtAuthGuard);
  });

  it('audits system config mutation attempts', () => {
    const interceptors = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      AdminSystemConfigController,
    );

    expect(interceptors).toContain(AdminAuditInterceptor);
  });

  it('delegates config reads to the config service', async () => {
    const configService = {
      getConfig: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        items: [],
      })),
    };
    const controller = new AdminSystemConfigController(configService as any);

    await expect(controller.getConfig()).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      items: [],
    });
    expect(configService.getConfig).toHaveBeenCalledWith();
  });

  it('delegates update payloads to the config service', async () => {
    const configService = {
      updateConfig: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        item: { key: 'fees.spot_fee', value: '0.003' },
      })),
    };
    const controller = new AdminSystemConfigController(configService as any);
    const payload = { key: 'fees.spot_fee', value: '0.003' };

    await expect(controller.updateConfig(payload)).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      item: { key: 'fees.spot_fee', value: '0.003' },
    });
    expect(configService.updateConfig).toHaveBeenCalledWith(payload);
  });

  it('delegates reset payloads to the config service', async () => {
    const configService = {
      resetConfig: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        item: { key: 'fees.spot_fee', value: '0.002' },
      })),
    };
    const controller = new AdminSystemConfigController(configService as any);
    const payload = { key: 'fees.spot_fee' };

    await expect(controller.resetConfig(payload)).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      item: { key: 'fees.spot_fee', value: '0.002' },
    });
    expect(configService.resetConfig).toHaveBeenCalledWith(payload);
  });
});

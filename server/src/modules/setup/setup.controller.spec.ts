import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SetupController } from './setup.controller';
import type { SetupService } from './setup.service';

describe('SetupController', () => {
  const service = {
    getStatus: jest.fn(),
    setPassword: jest.fn(),
    seedDatabase: jest.fn(),
    getSeedStatus: jest.fn(),
    completeStep: jest.fn(),
    completeSetup: jest.fn(),
    writeEnvValues: jest.fn(),
    listConfigStatus: jest.fn(),
  };

  it('keeps status and password endpoints pre-auth', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SetupController.prototype.status),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SetupController.prototype.password),
    ).toBeUndefined();
  });

  it('protects mutation endpoints after password setup with the admin JWT guard', () => {
    for (const method of [
      'seed',
      'seedStatus',
      'completeStep',
      'complete',
      'env',
      'envStatus',
    ] as const) {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        SetupController.prototype[method],
      );

      expect(guards).toContain(JwtAuthGuard);
    }
  });

  it('delegates password setup to the setup service', async () => {
    service.setPassword.mockResolvedValue({
      access_token: 'token',
      expires_in: 604800,
    });
    const controller = new SetupController(service as unknown as SetupService);

    await expect(
      controller.password({ password: 'long-password' }),
    ).resolves.toEqual({
      access_token: 'token',
      expires_in: 604800,
    });
    expect(service.setPassword).toHaveBeenCalledWith('long-password');
  });
});

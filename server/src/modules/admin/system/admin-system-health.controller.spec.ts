import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminSystemHealthController } from './admin-system-health.controller';

describe('AdminSystemHealthController', () => {
  it('protects system health routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminSystemHealthController,
    );

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates filter parameters to the health service', async () => {
    const healthService = {
      getHealth: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        services: [],
      })),
    };
    const controller = new AdminSystemHealthController(healthService as any);

    await expect(
      controller.getHealth('connector', 'connector.api-keys'),
    ).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      services: [],
    });
    expect(healthService.getHealth).toHaveBeenCalledWith({
      group: 'connector',
      service: 'connector.api-keys',
    });
  });
});

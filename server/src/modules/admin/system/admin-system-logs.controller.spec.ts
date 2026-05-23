import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminSystemLogsController } from './admin-system-logs.controller';

describe('AdminSystemLogsController', () => {
  it('protects system log routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminSystemLogsController);

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates bounded filter parameters to the logs service', async () => {
    const logsService = {
      getLogs: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        entries: [],
      })),
    };
    const controller = new AdminSystemLogsController(logsService as any);

    await expect(
      controller.getLogs('combined', 'error', 'order', '25', 'true'),
    ).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      entries: [],
    });
    expect(logsService.getLogs).toHaveBeenCalledWith({
      source: 'combined',
      level: 'error',
      query: 'order',
      limit: '25',
      export: 'true',
    });
  });
});

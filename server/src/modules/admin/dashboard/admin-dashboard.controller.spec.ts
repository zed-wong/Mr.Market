import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminDashboardController } from './admin-dashboard.controller';

describe('AdminDashboardController', () => {
  it('protects dashboard summary routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminDashboardController);

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates range validation and summary generation to the service', async () => {
    const dashboardService = {
      getSummary: jest.fn(async () => ({ generatedAt: '2026-05-23T00:00:00.000Z' })),
    };
    const controller = new AdminDashboardController(dashboardService as any);

    await expect(controller.getSummary('7d')).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
    });
    expect(dashboardService.getSummary).toHaveBeenCalledWith('7d');
  });
});

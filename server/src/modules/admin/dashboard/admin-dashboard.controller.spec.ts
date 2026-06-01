import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardController', () => {
  it('protects dashboard summary routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminDashboardController,
    );

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates range validation and summary generation to the service', async () => {
    const dashboardService = {
      getSummary: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
      })),
    };
    const controller = new AdminDashboardController(dashboardService as any);

    await expect(controller.getSummary('7d')).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
    });
    expect(dashboardService.getSummary).toHaveBeenCalledWith('7d');
  });

  it.each([
    ['repeated range parameters', ['24h', '7d']],
    ['nested range parameters', { value: '24h' }],
  ])('returns a safe validation error for %s', async (_label, range) => {
    const service = new AdminDashboardService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getRuntimeMetrics: jest.fn() } as any,
    );
    const controller = new AdminDashboardController(service);

    await expect(controller.getSummary(range)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

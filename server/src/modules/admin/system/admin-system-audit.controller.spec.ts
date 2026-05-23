import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminSystemAuditController } from './admin-system-audit.controller';

describe('AdminSystemAuditController', () => {
  it('protects system audit routes with the admin JWT guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminSystemAuditController,
    );

    expect(guards).toContain(JwtAuthGuard);
  });

  it('delegates bounded filter parameters to the audit service', async () => {
    const auditLogService = {
      getAudit: jest.fn(async () => ({
        generatedAt: '2026-05-23T00:00:00.000Z',
        entries: [],
      })),
    };
    const controller = new AdminSystemAuditController(auditLogService as any);

    await expect(
      controller.getAudit(
        'admin',
        'admin.post',
        '/admin/fee/global',
        'success',
        '2026-05-23T00:00:00.000Z',
        '2026-05-24T00:00:00.000Z',
        '25',
        '2',
        'true',
        'true',
      ),
    ).resolves.toEqual({
      generatedAt: '2026-05-23T00:00:00.000Z',
      entries: [],
    });
    expect(auditLogService.getAudit).toHaveBeenCalledWith({
      actor: 'admin',
      action: 'admin.post',
      resource: '/admin/fee/global',
      status: 'success',
      from: '2026-05-23T00:00:00.000Z',
      to: '2026-05-24T00:00:00.000Z',
      limit: '25',
      page: '2',
      export: 'true',
      integrity: 'true',
    });
  });
});

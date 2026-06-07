import { BadRequestException } from '@nestjs/common';

import { AdminAuditLogService } from './admin-audit-log.service';

describe('AdminAuditLogService', () => {
  function buildService() {
    const records: any[] = [];
    const repository = {
      find: jest.fn(async () =>
        records
          .slice()
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 1),
      ),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        records.push(value);

        return value;
      }),
      findAndCount: jest.fn(async (options) => {
        const limit = options.take ?? 50;
        const skip = options.skip ?? 0;

        return [
          records
            .slice()
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt),
            )
            .slice(skip, skip + limit),
          records.length,
        ];
      }),
    };

    return {
      records,
      repository,
      service: new AdminAuditLogService(repository as any),
    };
  }

  it('appends records with redacted metadata and request context', async () => {
    const { records, service } = buildService();

    await service.record({
      actor: 'admin',
      action: 'admin.password_login.succeeded',
      resource: 'auth',
      status: 'success',
      metadata: {
        password: 'hunter2',
        apiKey: 'abc123',
        nested: {
          authorization:
            'Bearer **********************************************',
        },
      },
      requestContext: {
        authorization: 'Bearer **********************************************',
        note: 'safe',
      },
    });
    const response = (await service.getAudit({
      limit: '10',
      export: 'true',
      integrity: 'true',
    })) as any;
    const serialized = JSON.stringify(response);

    expect(records).toHaveLength(1);
    expect(records[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(serialized).toContain('[REDACTED]');
    expect(response.entries[0]).toMatchObject({
      actor: 'admin',
      action: 'admin.password_login.succeeded',
      resource: 'auth',
      status: 'success',
    });
    expect(response.export?.byteLength).toBeLessThanOrEqual(
      response.limits.maxExportBytes,
    );
    expect(response.integrity).toMatchObject({ checked: 1, valid: true });
  });

  it('enforces bounded pagination and safe filters', async () => {
    const { repository, service } = buildService();

    await service.getAudit({
      actor: 'admin',
      status: 'success',
      from: '2026-05-23T00:00:00.000Z',
      to: '2026-05-24T00:00:00.000Z',
      limit: '9999',
      page: '2',
    });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        skip: 200,
        where: expect.objectContaining({
          actor: 'admin',
          status: 'success',
        }),
      }),
    );
  });

  it('rejects invalid filters without leaking internals', async () => {
    const { service } = buildService();

    await expect(
      service.getAudit({ status: 'deleted' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getAudit({ from: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getAudit({ actor: 'x'.repeat(121) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getAudit({ export: 'maybe' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

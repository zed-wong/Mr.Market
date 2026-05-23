import { BadRequestException } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { AdminSystemLogsService } from './admin-system-logs.service';

describe('AdminSystemLogsService', () => {
  async function buildService(files: Record<string, string>) {
    const root = await mkdtemp(join(tmpdir(), 'admin-system-logs-'));
    mkdirSync(root, { recursive: true });

    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(root, name), content, 'utf8');
    }

    return new AdminSystemLogsService([root]);
  }

  it('returns bounded entries from approved logical sources', async () => {
    const service = await buildService({
      'combined.log': [
        '[2026-05-23T00:00:00.000Z] [INFO] [Orders] first message',
        '[2026-05-23T00:01:00.000Z] [ERROR] [Orders] failed order abc',
        '[2026-05-23T00:02:00.000Z] [WARN] [Health] another message',
      ].join('\n'),
    });

    const response = await service.getLogs({
      source: 'combined',
      level: 'error',
      query: 'order',
      limit: '5',
    });

    expect(response.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(response.entries).toHaveLength(1);
    expect(response.entries[0]).toMatchObject({
      source: 'combined',
      level: 'error',
      context: 'Orders',
      message: 'failed order abc',
    });
    expect(response.filters).toMatchObject({
      source: 'combined',
      level: 'error',
      query: 'order',
    });
    expect(response.limits.maxLimit).toBeGreaterThanOrEqual(100);
    expect(response.byteLength).toBeLessThanOrEqual(
      response.limits.maxResponseBytes,
    );
  });

  it('rejects paths, traversal, unsupported sources, and oversized filters safely', async () => {
    const service = await buildService({ 'combined.log': '' });

    await expect(
      service.getLogs({ source: '../../server/.env' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getLogs({ source: '/var/log/system.log' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getLogs({ source: 'combined.log' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getLogs({ source: 'combined', query: 'x'.repeat(121) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getLogs({ source: 'combined', level: 'trace' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redacts secret-like values before returning entries or exports', async () => {
    const service = await buildService({
      'combined.log':
        '[2026-05-23T00:00:00.000Z] [INFO] [Auth] password=hunter2 api_key=abc123 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature private_key=-----BEGIN PRIVATE KEY----- encryptedSecret=sealed',
    });

    const response = await service.getLogs({
      source: 'combined',
      limit: '1',
      export: 'true',
    });
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(serialized).not.toContain('BEGIN PRIVATE KEY');
    expect(serialized).not.toContain('sealed');
    expect(serialized).toContain('[REDACTED]');
    expect(response.export?.content).toContain('[REDACTED]');
    expect(response.export?.byteLength).toBeLessThanOrEqual(
      response.limits.maxExportBytes,
    );
  });

  it('truncates oversized messages and response bytes without crashing', async () => {
    const service = await buildService({
      'combined.log': Array.from({ length: 50 }, (_, index) => {
        return `[2026-05-23T00:${String(index).padStart(
          2,
          '0',
        )}:00.000Z] [INFO] [Long] ${'x'.repeat(5000)}`;
      }).join('\n'),
    });

    const response = await service.getLogs({
      source: 'combined',
      limit: '50',
    });

    expect(response.entries.length).toBeGreaterThan(0);
    expect(response.entries.length).toBeLessThanOrEqual(50);
    expect(response.entries[0].message.length).toBeLessThanOrEqual(
      response.limits.maxMessageLength + '…[truncated]'.length,
    );
    expect(response.entries[0].message).toContain('[truncated]');
    expect(response.truncated.messages).toBeGreaterThan(0);
    expect(response.byteLength).toBeLessThanOrEqual(
      response.limits.maxResponseBytes,
    );
  });

  it('returns a bounded safe response when an approved log file is missing', async () => {
    const service = await buildService({});

    const response = await service.getLogs({ source: 'error' });

    expect(response.entries).toEqual([]);
    expect(response.warnings).toEqual(['Requested log source is unavailable.']);
    expect(JSON.stringify(response)).not.toContain(tmpdir());
    expect(JSON.stringify(response)).not.toContain('ENOENT');
  });
});

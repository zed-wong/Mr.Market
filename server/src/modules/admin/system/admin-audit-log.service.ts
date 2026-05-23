import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import {
  AdminAuditLogEntity,
  AdminAuditLogStatus,
} from 'src/common/entities/admin/admin-audit-log.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import {
  Between,
  FindOperator,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_FILTER_LENGTH = 120;
const MAX_JSON_BYTES = 8 * 1024;
const MAX_STRING_LENGTH = 1000;
const MAX_EXPORT_BYTES = 128 * 1024;
const MAX_OBJECT_KEYS = 50;
const MAX_ARRAY_ITEMS = 50;
const TRUNCATION_SUFFIX = '…[truncated]';
const SENSITIVE_KEY_PATTERN =
  /authorization|password|passwd|pwd|secret|token|jwt|api[_-]?key|apikey|private[_-]?key|privatekey|session[_-]?token|accesstoken|access[_-]?token|refreshtoken|refresh[_-]?token|encrypted(?:[_-]?(?:secret|material|value))?/i;

export interface AdminAuditRecordInput {
  actor?: string | null;
  action: string;
  resource: string;
  status: AdminAuditLogStatus;
  metadata?: unknown;
  diff?: unknown;
  requestContext?: unknown;
}

export interface AdminSystemAuditQuery {
  actor?: string;
  action?: string;
  resource?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: string;
  page?: string;
  export?: string;
  integrity?: string;
}

export interface AdminAuditLogEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  status: AdminAuditLogStatus;
  timestamp: string;
  metadata: unknown;
  diff: unknown;
  requestContext: unknown;
  previousHash: string | null;
  contentHash: string;
}

type ResolvedAuditFilters = {
  actor?: string;
  action?: string;
  resource?: string;
  status?: AdminAuditLogStatus;
  from?: string;
  to?: string;
  limit: number;
  page: number;
  includeExport: boolean;
  includeIntegrity: boolean;
};

@Injectable()
export class AdminAuditLogService {
  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly auditRepository: Repository<AdminAuditLogEntity>,
  ) {}

  async record(input: AdminAuditRecordInput): Promise<AdminAuditLogEntry> {
    const createdAt = getRFC3339Timestamp();
    const metadataJson = this.toSafeJson(input.metadata ?? null);
    const diffJson = this.toSafeJson(input.diff ?? null);
    const requestContextJson = this.toSafeJson(input.requestContext ?? null);
    const [latest] = await this.auditRepository.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 1,
    });
    const entity = this.auditRepository.create({
      id: randomUUID(),
      actor: this.normalizeText(input.actor || 'anonymous', 'actor'),
      action: this.normalizeText(input.action, 'action'),
      resource: this.normalizeText(input.resource, 'resource'),
      status: input.status,
      metadataJson,
      diffJson,
      requestContextJson,
      previousHash: latest?.contentHash || null,
      contentHash: '',
      createdAt,
    });

    entity.contentHash = this.computeContentHash(entity);
    const saved = await this.auditRepository.save(entity);

    return this.toEntry(saved);
  }

  async getAudit(input: AdminSystemAuditQuery = {}) {
    const filters = this.resolveFilters(input);
    const where = this.buildWhere(filters);
    const [records, total] = await this.auditRepository.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });
    const entries = records.map((record) => this.toEntry(record));
    const response = {
      generatedAt: getRFC3339Timestamp(),
      entries,
      filters: {
        actor: filters.actor || null,
        action: filters.action || null,
        resource: filters.resource || null,
        status: filters.status || null,
        from: filters.from || null,
        to: filters.to || null,
      },
      pagination: {
        page: filters.page,
        limit: filters.limit,
        returned: entries.length,
        total,
        hasMore: filters.page * filters.limit < total,
      },
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        maxFilterLength: MAX_FILTER_LENGTH,
        maxJsonBytes: MAX_JSON_BYTES,
        maxStringLength: MAX_STRING_LENGTH,
        maxExportBytes: MAX_EXPORT_BYTES,
      },
    };

    if (!filters.includeExport && !filters.includeIntegrity) {
      return response;
    }

    return {
      ...response,
      ...(filters.includeExport
        ? { export: this.buildExport(entries) }
        : undefined),
      ...(filters.includeIntegrity
        ? { integrity: this.buildIntegrity(records) }
        : undefined),
    };
  }

  redactForAudit(value: unknown): unknown {
    return this.redactValue(value);
  }

  private resolveFilters(input: AdminSystemAuditQuery): ResolvedAuditFilters {
    const from = this.normalizeTimestampFilter(input.from, 'from');
    const to = this.normalizeTimestampFilter(input.to, 'to');

    if (from && to && Date.parse(from) > Date.parse(to)) {
      throw new BadRequestException('from must be earlier than or equal to to.');
    }

    return {
      actor: this.normalizeOptionalText(input.actor, 'actor'),
      action: this.normalizeOptionalText(input.action, 'action'),
      resource: this.normalizeOptionalText(input.resource, 'resource'),
      status: this.normalizeStatus(input.status),
      from,
      to,
      limit: this.resolvePositiveInteger(input.limit, DEFAULT_LIMIT, MAX_LIMIT),
      page: this.resolvePositiveInteger(input.page, 1, 10_000),
      includeExport: this.resolveBoolean(input.export, 'export'),
      includeIntegrity: this.resolveBoolean(input.integrity, 'integrity'),
    };
  }

  private buildWhere(
    filters: ResolvedAuditFilters,
  ): FindOptionsWhere<AdminAuditLogEntity> {
    const where: FindOptionsWhere<AdminAuditLogEntity> = {};

    if (filters.actor) where.actor = filters.actor;
    if (filters.action) where.action = filters.action;
    if (filters.resource) where.resource = filters.resource;
    if (filters.status) where.status = filters.status;

    const createdAt = this.createdAtOperator(filters);

    if (createdAt) {
      where.createdAt = createdAt;
    }

    return where;
  }

  private createdAtOperator(
    filters: ResolvedAuditFilters,
  ): FindOperator<string> | undefined {
    if (filters.from && filters.to) {
      return Between(filters.from, filters.to);
    }

    if (filters.from) {
      return MoreThanOrEqual(filters.from);
    }

    if (filters.to) {
      return LessThanOrEqual(filters.to);
    }

    return undefined;
  }

  private normalizeOptionalText(value: string | undefined, field: string) {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return this.normalizeText(value, field);
  }

  private normalizeText(value: string, field: string) {
    const normalized = String(value || '').trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    if (normalized.length > MAX_FILTER_LENGTH) {
      throw new BadRequestException(
        `${field} is too long. Maximum length is ${MAX_FILTER_LENGTH} characters.`,
      );
    }

    return normalized;
  }

  private normalizeStatus(value?: string): AdminAuditLogStatus | undefined {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();

    if (!['success', 'denied', 'error'].includes(normalized)) {
      throw new BadRequestException(
        'Unsupported audit status. Supported statuses: success, denied, error.',
      );
    }

    return normalized as AdminAuditLogStatus;
  }

  private normalizeTimestampFilter(value: string | undefined, field: string) {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    const trimmed = value.trim();
    const parsed = Date.parse(trimmed);

    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`${field} must be an RFC3339 timestamp.`);
    }

    return new Date(parsed).toISOString();
  }

  private resolvePositiveInteger(
    value: string | undefined,
    defaultValue: number,
    max: number,
  ) {
    if (value === undefined || value === '') {
      return defaultValue;
    }

    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('Pagination values must be positive integers.');
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException('Pagination values must be positive integers.');
    }

    return Math.min(parsed, max);
  }

  private resolveBoolean(value: string | undefined, field: string) {
    if (typeof value !== 'string' || value.trim() === '') {
      return false;
    }

    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'no'].includes(normalized)) return false;

    throw new BadRequestException(`${field} must be true or false.`);
  }

  private toEntry(record: AdminAuditLogEntity): AdminAuditLogEntry {
    return {
      id: record.id,
      actor: this.redactString(record.actor),
      action: record.action,
      resource: this.redactString(record.resource),
      status: record.status,
      timestamp: record.createdAt,
      metadata: this.redactValue(this.parseJson(record.metadataJson)),
      diff: this.redactValue(this.parseJson(record.diffJson)),
      requestContext: this.redactValue(this.parseJson(record.requestContextJson)),
      previousHash: record.previousHash || null,
      contentHash: record.contentHash,
    };
  }

  private parseJson(value?: string | null): unknown {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return '[REDACTED]';
    }
  }

  private toSafeJson(value: unknown): string {
    const redacted = this.redactValue(value);
    const raw = JSON.stringify(redacted ?? null);

    if (Buffer.byteLength(raw, 'utf8') <= MAX_JSON_BYTES) {
      return raw;
    }

    return JSON.stringify({
      truncated: true,
      value: this.truncateString(raw, MAX_JSON_BYTES),
    });
  }

  private redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      return this.redactString(this.truncateString(value, MAX_STRING_LENGTH));
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => this.redactValue(item, seen));
    }

    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[REDACTED]';
      }

      seen.add(value);

      const output: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>).slice(
        0,
        MAX_OBJECT_KEYS,
      );

      for (const [key, nestedValue] of entries) {
        const safeKey = this.redactString(
          this.truncateString(key, MAX_STRING_LENGTH),
        );
        output[safeKey] = SENSITIVE_KEY_PATTERN.test(key)
          ? '[REDACTED]'
          : this.redactValue(nestedValue, seen);
      }

      return output;
    }

    return this.redactString(String(value));
  }

  private redactString(value: string): string {
    return String(value)
      .replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        '[REDACTED]',
      )
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        '[REDACTED]',
      )
      .replace(
        /((?:authorization|password|passwd|pwd|secret|token|jwt|api[_-]?key|private[_-]?key|session[_-]?token|access[_-]?token|refresh[_-]?token|encrypted(?:[_-]?(?:secret|material|value))?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        '$1[REDACTED]',
      )
      .replace(
        /((?:apiKey|privateKey|sessionToken|accessToken|refreshToken|encryptedSecret|encryptedMaterial)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/g,
        '$1[REDACTED]',
      );
  }

  private truncateString(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}${TRUNCATION_SUFFIX}`;
  }

  private buildExport(entries: AdminAuditLogEntry[]) {
    let content = '';
    let truncated = false;

    for (const entry of entries) {
      const next = `${content}${JSON.stringify(entry)}\n`;

      if (Buffer.byteLength(next, 'utf8') > MAX_EXPORT_BYTES) {
        truncated = true;
        break;
      }

      content = next;
    }

    return {
      format: 'application/x-ndjson',
      byteLength: Buffer.byteLength(content, 'utf8'),
      content,
      truncated,
    };
  }

  private buildIntegrity(records: AdminAuditLogEntity[]) {
    const checks = records.map((record) => {
      const valid = this.computeContentHash(record) === record.contentHash;

      return {
        id: record.id,
        timestamp: record.createdAt,
        previousHash: record.previousHash || null,
        contentHash: record.contentHash,
        valid,
      };
    });

    return {
      checked: checks.length,
      valid: checks.every((check) => check.valid),
      checks,
    };
  }

  private computeContentHash(record: AdminAuditLogEntity): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          id: record.id,
          actor: record.actor,
          action: record.action,
          resource: record.resource,
          status: record.status,
          metadataJson: record.metadataJson || null,
          diffJson: record.diffJson || null,
          requestContextJson: record.requestContextJson || null,
          previousHash: record.previousHash || null,
          createdAt: record.createdAt,
        }),
      )
      .digest('hex');
  }
}

import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { existsSync } from 'fs';
import { lstat, open, stat } from 'fs/promises';
import { join } from 'path';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';

export const ADMIN_SYSTEM_LOG_ROOTS = 'ADMIN_SYSTEM_LOG_ROOTS';

const LOG_SOURCES = ['combined', 'error'] as const;
const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MAX_QUERY_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_READ_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_EXPORT_BYTES = 128 * 1024;
const TRUNCATION_SUFFIX = '…[truncated]';

type LogSource = (typeof LOG_SOURCES)[number];
type LogLevel = (typeof LOG_LEVELS)[number];

export interface AdminSystemLogsQuery {
  source?: string;
  level?: string;
  query?: string;
  limit?: string;
  export?: string;
}

type ResolvedLogFilters = {
  source: LogSource | 'all';
  level?: LogLevel;
  query?: string;
  limit: number;
  includeExport: boolean;
};

type AdminSystemLogEntry = {
  source: LogSource;
  timestamp: string;
  level: string;
  context: string | null;
  message: string;
};

export interface AdminSystemLogsResponse {
  generatedAt: string;
  entries: AdminSystemLogEntry[];
  filters: {
    source: LogSource | 'all';
    level: LogLevel | null;
    query: string | null;
  };
  sources: {
    available: LogSource[];
    selected: LogSource[];
  };
  counts: {
    returned: number;
    matched: number;
    scannedLines: number;
  };
  byteLength: number;
  truncated: {
    messages: number;
    responseBytes: boolean;
    entries: boolean;
    readBytes: boolean;
  };
  warnings: string[];
  limits: {
    defaultLimit: number;
    maxLimit: number;
    maxQueryLength: number;
    maxMessageLength: number;
    maxReadBytes: number;
    maxResponseBytes: number;
    maxExportBytes: number;
  };
  export?: {
    format: 'text/plain';
    byteLength: number;
    content: string;
    truncated: boolean;
  };
}

@Injectable()
export class AdminSystemLogsService {
  constructor(
    @Optional()
    @Inject(ADMIN_SYSTEM_LOG_ROOTS)
    private readonly configuredLogRoots?: string[],
  ) {}

  async getLogs(
    input: AdminSystemLogsQuery = {},
  ): Promise<AdminSystemLogsResponse> {
    const filters = this.resolveFilters(input);
    const generatedAt = getRFC3339Timestamp();
    const selectedSources =
      filters.source === 'all' ? [...LOG_SOURCES] : [filters.source];
    const warnings: string[] = [];
    const entries: AdminSystemLogEntry[] = [];
    let readBytes = 0;
    let scannedLines = 0;
    let truncatedMessages = 0;

    for (const source of selectedSources) {
      const logFile = await this.resolveSourceFile(source);

      if (!logFile) {
        warnings.push('Requested log source is unavailable.');
        continue;
      }

      const tail = await this.readTail(logFile);
      readBytes += tail.bytesRead;
      const lines = tail.content.split(/\r?\n/).filter(Boolean);
      scannedLines += lines.length;

      for (const line of lines) {
        const parsed = this.parseLine(source, line, generatedAt);

        if (!this.matchesFilters(parsed, filters)) {
          continue;
        }

        const truncated = this.truncateMessage(parsed.message);

        if (truncated.wasTruncated) {
          truncatedMessages += 1;
        }

        entries.push({
          ...parsed,
          message: truncated.message,
        });
      }
    }

    const boundedEntries = this.boundEntries(entries, filters.limit);
    const response = {
      generatedAt,
      entries: boundedEntries.entries,
      filters: {
        source: filters.source,
        level: filters.level || null,
        query: filters.query || null,
      },
      sources: {
        available: [...LOG_SOURCES],
        selected: selectedSources,
      },
      counts: {
        returned: boundedEntries.entries.length,
        matched: entries.length,
        scannedLines,
      },
      byteLength: boundedEntries.byteLength,
      truncated: {
        messages: truncatedMessages,
        responseBytes: boundedEntries.truncatedByBytes,
        entries: entries.length > boundedEntries.entries.length,
        readBytes: readBytes >= MAX_READ_BYTES * selectedSources.length,
      },
      warnings: [...new Set(warnings)],
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        maxQueryLength: MAX_QUERY_LENGTH,
        maxMessageLength: MAX_MESSAGE_LENGTH,
        maxReadBytes: MAX_READ_BYTES,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        maxExportBytes: MAX_EXPORT_BYTES,
      },
    };

    if (!filters.includeExport) {
      return response;
    }

    const content = this.buildExportContent(boundedEntries.entries);

    return {
      ...response,
      export: {
        format: 'text/plain',
        byteLength: Buffer.byteLength(content, 'utf8'),
        content,
        truncated: Buffer.byteLength(content, 'utf8') >= MAX_EXPORT_BYTES,
      },
    };
  }

  private resolveFilters(input: AdminSystemLogsQuery): ResolvedLogFilters {
    const source = this.normalizeSource(input.source);
    const level = this.normalizeLevel(input.level);
    const query = typeof input.query === 'string' ? input.query.trim() : '';

    if (query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(
        `Log query is too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`,
      );
    }

    return {
      source,
      level,
      query: query || undefined,
      limit: this.resolveLimit(input.limit),
      includeExport: this.resolveBoolean(input.export),
    };
  }

  private normalizeSource(value?: string): LogSource | 'all' {
    if (typeof value !== 'string' || value.trim() === '') {
      return 'combined';
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'all') {
      return 'all';
    }

    if (!LOG_SOURCES.includes(normalized as LogSource)) {
      throw new BadRequestException(
        `Unsupported log source. Supported sources: ${LOG_SOURCES.join(
          ', ',
        )}, all.`,
      );
    }

    return normalized as LogSource;
  }

  private normalizeLevel(value?: string): LogLevel | undefined {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();

    if (!LOG_LEVELS.includes(normalized as LogLevel)) {
      throw new BadRequestException(
        `Unsupported log level. Supported levels: ${LOG_LEVELS.join(', ')}.`,
      );
    }

    return normalized as LogLevel;
  }

  private resolveLimit(value?: string): number {
    if (value === undefined || value === '') {
      return DEFAULT_LIMIT;
    }

    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    return Math.min(parsed, MAX_LIMIT);
  }

  private resolveBoolean(value?: string): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      return false;
    }

    if (['1', 'true', 'yes'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no'].includes(normalized)) {
      return false;
    }

    throw new BadRequestException('export must be true or false.');
  }

  private async resolveSourceFile(source: LogSource): Promise<string | null> {
    const filename = `${source}.log`;

    for (const root of this.logRoots()) {
      const candidate = join(root, filename);

      if (!existsSync(candidate)) {
        continue;
      }

      const linkDetails = await lstat(candidate);

      if (linkDetails.isSymbolicLink()) {
        continue;
      }

      const details = await stat(candidate);

      if (details.isFile()) {
        return candidate;
      }
    }

    return null;
  }

  private logRoots(): string[] {
    if (this.configuredLogRoots?.length) {
      return this.configuredLogRoots;
    }

    return [
      join(process.cwd(), 'src', 'modules', 'logs'),
      join(process.cwd(), 'dist', 'src', 'modules', 'logs'),
      join(process.cwd(), 'dist', 'src', 'modules', 'infrastructure', 'logs'),
    ];
  }

  private async readTail(filePath: string): Promise<{
    content: string;
    bytesRead: number;
  }> {
    const details = await stat(filePath);
    const start = Math.max(0, details.size - MAX_READ_BYTES);
    const length = details.size - start;
    const buffer = Buffer.alloc(length);
    const handle = await open(filePath, 'r');
    let bytesRead = 0;

    try {
      const result = await handle.read(buffer, 0, length, start);
      bytesRead = result.bytesRead;
    } finally {
      await handle.close();
    }

    const content = buffer.subarray(0, bytesRead).toString('utf8');

    if (start === 0) {
      return { content, bytesRead };
    }

    const firstNewline = /\r?\n/.exec(content);

    return {
      content: firstNewline
        ? content.slice(firstNewline.index + firstNewline[0].length)
        : content,
      bytesRead,
    };
  }

  private parseLine(
    source: LogSource,
    line: string,
    fallbackTimestamp: string,
  ): AdminSystemLogEntry {
    const match = line.match(/^\[([^\]]+)]\s+\[([^\]]+)]\s+\[([^\]]*)]\s?(.*)$/);
    const timestamp = this.normalizeTimestamp(match?.[1]) || fallbackTimestamp;
    const level = (match?.[2] || 'info').toLowerCase();
    const context = match?.[3]?.trim() || null;
    const rawMessage = match ? match[4] || '' : line;

    return {
      source,
      timestamp,
      level,
      context,
      message: this.redact(rawMessage),
    };
  }

  private matchesFilters(
    entry: AdminSystemLogEntry,
    filters: ResolvedLogFilters,
  ): boolean {
    if (filters.level && entry.level !== filters.level) {
      return false;
    }

    if (filters.query) {
      const haystack = `${entry.level} ${entry.context || ''} ${
        entry.message
      }`.toLowerCase();

      return haystack.includes(filters.query.toLowerCase());
    }

    return true;
  }

  private truncateMessage(message: string): {
    message: string;
    wasTruncated: boolean;
  } {
    if (message.length <= MAX_MESSAGE_LENGTH) {
      return { message, wasTruncated: false };
    }

    return {
      message: `${message.slice(0, MAX_MESSAGE_LENGTH)}${TRUNCATION_SUFFIX}`,
      wasTruncated: true,
    };
  }

  private boundEntries(entries: AdminSystemLogEntry[], limit: number) {
    const newestFirst = entries
      .slice()
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    const bounded: AdminSystemLogEntry[] = [];
    let byteLength = 0;
    let truncatedByBytes = false;

    for (const entry of newestFirst) {
      if (bounded.length >= limit) {
        break;
      }

      const nextByteLength = Buffer.byteLength(JSON.stringify(entry), 'utf8');

      if (
        bounded.length > 0 &&
        byteLength + nextByteLength > MAX_RESPONSE_BYTES
      ) {
        truncatedByBytes = true;
        break;
      }

      bounded.push(entry);
      byteLength += nextByteLength;
    }

    return { entries: bounded, byteLength, truncatedByBytes };
  }

  private buildExportContent(entries: AdminSystemLogEntry[]): string {
    let content = '';

    for (const entry of entries) {
      const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${
        entry.context || 'unknown'
      }] [${entry.source}] ${entry.message}\n`;
      const next = `${content}${line}`;

      if (Buffer.byteLength(next, 'utf8') > MAX_EXPORT_BYTES) {
        break;
      }

      content = next;
    }

    return content;
  }

  private redact(value: string): string {
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
        /(["'])(authorization|password|passwd|pwd|secret|token|jwt|api[_-]?key|apikey|private[_-]?key|privatekey|session[_-]?token|sessiontoken|access[_-]?token|accesstoken|refresh[_-]?token|refreshtoken|encrypted(?:[_-]?(?:secret|material|value))?)\1\s*:\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}\]]+)/gi,
        (_match: string, quote: string, key: string) =>
          `${quote}${key}${quote}: "[REDACTED]"`,
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

  private normalizeTimestamp(value?: string): string | null {
    if (!value) {
      return null;
    }

    const ms = Date.parse(value);

    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
}

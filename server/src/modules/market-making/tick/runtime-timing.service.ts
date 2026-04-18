import { Injectable } from '@nestjs/common';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

type TimingMetadataValue = string | number | boolean | null | undefined;

export type RuntimeTimingMetadata = Record<string, TimingMetadataValue>;

export type RuntimeTimingRecord = {
  scope: string;
  durationMs: number;
  recordedAt: string;
  metadata: RuntimeTimingMetadata;
};

type RuntimeTimingStats = {
  scope: string;
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  lastRecordedAt: string;
  lastMetadata: RuntimeTimingMetadata;
};

type RecordDurationOptions = {
  warnThresholdMs?: number;
};

@Injectable()
export class MarketMakingRuntimeTimingService {
  private static readonly MAX_RECENT_RECORDS = 100;
  private readonly logger = new CustomLogger(
    MarketMakingRuntimeTimingService.name,
  );
  private readonly statsByScope = new Map<string, RuntimeTimingStats>();
  private readonly recentRecords: RuntimeTimingRecord[] = [];

  recordDuration(
    scope: string,
    durationMs: number,
    metadata: RuntimeTimingMetadata = {},
    options: RecordDurationOptions = {},
  ): void {
    const normalizedDurationMs = Number.isFinite(durationMs)
      ? Math.max(0, durationMs)
      : 0;
    const sanitizedMetadata = this.sanitizeMetadata(metadata);
    const recordedAt = getRFC3339Timestamp();
    const existingStats = this.statsByScope.get(scope);
    const count = (existingStats?.count || 0) + 1;
    const totalDurationMs =
      (existingStats?.totalDurationMs || 0) + normalizedDurationMs;

    this.statsByScope.set(scope, {
      scope,
      count,
      totalDurationMs,
      avgDurationMs: totalDurationMs / count,
      maxDurationMs: Math.max(
        existingStats?.maxDurationMs || 0,
        normalizedDurationMs,
      ),
      lastDurationMs: normalizedDurationMs,
      lastRecordedAt: recordedAt,
      lastMetadata: sanitizedMetadata,
    });

    this.recentRecords.push({
      scope,
      durationMs: normalizedDurationMs,
      recordedAt,
      metadata: sanitizedMetadata,
    });

    while (
      this.recentRecords.length >
      MarketMakingRuntimeTimingService.MAX_RECENT_RECORDS
    ) {
      this.recentRecords.shift();
    }

    if (
      options.warnThresholdMs !== undefined &&
      normalizedDurationMs >= options.warnThresholdMs
    ) {
      this.logger.warn(
        [
          'Runtime timing threshold exceeded',
          `scope=${scope}`,
          `durationMs=${normalizedDurationMs}`,
          ...this.toMetadataParts(sanitizedMetadata),
        ].join(' | '),
      );
    }
  }

  async measureAsync<T>(
    scope: string,
    metadata: RuntimeTimingMetadata,
    operation: () => Promise<T>,
    options: RecordDurationOptions = {},
  ): Promise<T> {
    const startedAtMs = Date.now();

    try {
      return await operation();
    } finally {
      this.recordDuration(scope, Date.now() - startedAtMs, metadata, options);
    }
  }

  getSnapshot(): {
    stats: RuntimeTimingStats[];
    recent: RuntimeTimingRecord[];
  } {
    return {
      stats: [...this.statsByScope.values()].sort((a, b) =>
        a.scope.localeCompare(b.scope),
      ),
      recent: [...this.recentRecords],
    };
  }

  reset(): void {
    this.statsByScope.clear();
    this.recentRecords.length = 0;
  }

  private sanitizeMetadata(
    metadata: RuntimeTimingMetadata,
  ): RuntimeTimingMetadata {
    const sanitized: RuntimeTimingMetadata = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (
        value === undefined ||
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        sanitized[key] = value;
      } else {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  private toMetadataParts(metadata: RuntimeTimingMetadata): string[] {
    return Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`);
  }
}

import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { HealthService } from 'src/modules/infrastructure/health/health.service';
import { BalanceStateCacheService } from 'src/modules/market-making/balance-state/balance-state-cache.service';
import { BalanceStateRefreshService } from 'src/modules/market-making/balance-state/balance-state-refresh.service';
import { MetricsService } from 'src/modules/market-making/metrics/metrics.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import { UserStreamIngestionService } from 'src/modules/market-making/trackers/user-stream-ingestion.service';
import { UserStreamTrackerService } from 'src/modules/market-making/trackers/user-stream-tracker.service';
import { Repository } from 'typeorm';

const SOURCE_TIMEOUT_MS = 750;
const MAX_SERVICES = 100;
const MAX_CONNECTOR_ACCOUNTS = 25;
const MAX_RUNTIME_ROWS = 10;
const MAX_TRACKED_ORDER_SAMPLE = 500;
const MAX_TOKEN_LENGTH = 80;

type AdminHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface AdminSystemHealthQuery {
  group?: string;
  service?: string;
}

type HealthServiceRow = {
  id: string;
  group: string;
  name: string;
  status: AdminHealthStatus;
  message: string;
  observedAt: string;
  metrics?: Record<string, unknown>;
  details?: Record<string, unknown>;
  issues?: string[];
};

@Injectable()
export class AdminSystemHealthService {
  constructor(
    @InjectRepository(APIKeysConfig)
    private readonly apiKeysRepository: Repository<APIKeysConfig>,
    @Optional()
    private readonly healthService?: HealthService,
    @Optional()
    private readonly metricsService?: MetricsService,
    @Optional()
    private readonly balanceStateRefreshService?: BalanceStateRefreshService,
    @Optional()
    private readonly balanceStateCacheService?: BalanceStateCacheService,
    @Optional()
    private readonly userStreamTrackerService?: UserStreamTrackerService,
    @Optional()
    private readonly userStreamIngestionService?: UserStreamIngestionService,
    @Optional()
    private readonly exchangeOrderTrackerService?: ExchangeOrderTrackerService,
  ) {}

  async getHealth(input: AdminSystemHealthQuery = {}) {
    const filters = this.resolveFilters(input);
    const generatedAt = getRFC3339Timestamp();
    const nowMs = Date.parse(generatedAt);
    const services = (
      await Promise.all([
        Promise.resolve(this.buildCoreServices(generatedAt)),
        this.buildQueueServices(generatedAt),
        Promise.resolve(this.buildRuntimeServices(generatedAt)),
        this.buildConnectorServices(generatedAt, nowMs),
        Promise.resolve(this.buildStreamServices(generatedAt)),
        Promise.resolve(this.buildTrackedOrderServices(generatedAt)),
      ])
    ).flat();

    const availableGroups = this.uniqueSorted(services.map((row) => row.group));
    const availableServices = services
      .map((row) => ({
        id: row.id,
        group: row.group,
        name: row.name,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const filtered = services
      .filter((row) => !filters.group || row.group === filters.group)
      .filter((row) => !filters.service || row.id === filters.service)
      .slice(0, MAX_SERVICES);

    return {
      generatedAt,
      overallStatus: this.reduceStatus(filtered),
      summary: this.buildSummary(filtered),
      groups: this.buildGroups(filtered),
      services: filtered,
      filters: {
        group: filters.group || null,
        service: filters.service || null,
        availableGroups,
        availableServices,
      },
      limits: {
        maxServices: MAX_SERVICES,
        sourceTimeoutMs: SOURCE_TIMEOUT_MS,
        maxConnectorAccounts: MAX_CONNECTOR_ACCOUNTS,
        maxRuntimeRows: MAX_RUNTIME_ROWS,
        maxTrackedOrderSample: MAX_TRACKED_ORDER_SAMPLE,
      },
    };
  }

  private resolveFilters(input: AdminSystemHealthQuery): {
    group?: string;
    service?: string;
  } {
    return {
      group: this.normalizeToken(input.group, 'group'),
      service: this.normalizeToken(input.service, 'service'),
    };
  }

  private normalizeToken(
    value: string | undefined,
    label: 'group' | 'service',
  ): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();

    if (!normalized || normalized === 'all') {
      return undefined;
    }

    if (
      normalized.length > MAX_TOKEN_LENGTH ||
      !/^[a-z0-9][a-z0-9._:-]*$/.test(normalized)
    ) {
      throw new BadRequestException(
        `${label} must be a simple bounded identifier.`,
      );
    }

    return normalized;
  }

  private buildCoreServices(generatedAt: string): HealthServiceRow[] {
    return [
      {
        id: 'core.api',
        group: 'core',
        name: 'Admin API',
        status: 'healthy',
        message: 'Admin API process is responding.',
        observedAt: generatedAt,
      },
    ];
  }

  private async buildQueueServices(
    generatedAt: string,
  ): Promise<HealthServiceRow[]> {
    if (!this.healthService) {
      return [
        {
          id: 'queue.snapshots',
          group: 'queue',
          name: 'Snapshots queue',
          status: 'unknown',
          message: 'Snapshot queue health source is unavailable.',
          observedAt: generatedAt,
        },
      ];
    }

    const health = await this.withTimeout(
      () => this.healthService!.checkSnapshotPollingHealth(),
      'Snapshot queue health source timed out.',
    );

    if (health instanceof Error) {
      return [
        {
          id: 'queue.snapshots',
          group: 'queue',
          name: 'Snapshots queue',
          status: 'critical',
          message: 'Snapshot queue health source is unavailable.',
          observedAt: generatedAt,
          issues: ['Failed to read snapshot queue health.'],
        },
      ];
    }

    return [
      {
        id: 'queue.snapshots',
        group: 'queue',
        name: 'Snapshots queue',
        status: this.normalizeStatus(health?.status),
        message: Array.isArray(health?.issues)
          ? health.issues.slice(0, 3).join('; ') || 'Snapshot queue is healthy.'
          : 'Snapshot queue status was read from Bull queue metrics.',
        observedAt: this.normalizeTimestamp(health?.timestamp) || generatedAt,
        metrics: {
          waiting: health?.metrics?.waiting || 0,
          active: health?.metrics?.active || 0,
          completed: health?.metrics?.completed || 0,
          failed: health?.metrics?.failed || 0,
          delayed: health?.metrics?.delayed || 0,
        },
        details: {
          queue: health?.queue?.name || 'snapshots',
          isPaused: Boolean(health?.queue?.isPaused),
          isPollingActive: Boolean(health?.queue?.isPollingActive),
          recentFailureCount: Array.isArray(health?.recentFailures)
            ? health.recentFailures.length
            : 0,
        },
        issues: Array.isArray(health?.issues)
          ? health.issues.slice(0, 5)
          : undefined,
      },
    ];
  }

  private buildRuntimeServices(generatedAt: string): HealthServiceRow[] {
    if (!this.metricsService) {
      return [
        {
          id: 'runtime.timing',
          group: 'runtime',
          name: 'Runtime timing',
          status: 'unknown',
          message: 'Runtime metrics source is unavailable.',
          observedAt: generatedAt,
        },
      ];
    }

    const snapshot = this.metricsService.getRuntimeMetrics();
    const stats = Array.isArray(snapshot?.stats) ? snapshot.stats : [];
    const recent = Array.isArray(snapshot?.recent) ? snapshot.recent : [];
    const slowScopes = stats
      .filter((row) => Number(row.maxDurationMs || 0) >= 1000)
      .slice(0, MAX_RUNTIME_ROWS)
      .map((row) => row.scope);

    return [
      {
        id: 'runtime.timing',
        group: 'runtime',
        name: 'Runtime timing',
        status: slowScopes.length > 0 ? 'warning' : 'healthy',
        message:
          slowScopes.length > 0
            ? 'One or more runtime scopes exceeded the slow-operation threshold.'
            : 'Runtime timing snapshot is available.',
        observedAt: generatedAt,
        metrics: {
          scopes: stats.length,
          recentRecords: recent.length,
          slowScopes: slowScopes.length,
        },
        details: {
          stats: stats
            .slice(0, MAX_RUNTIME_ROWS)
            .map((row) => this.normalizeTimestampFields(row)),
          recent: recent
            .slice(-MAX_RUNTIME_ROWS)
            .map((row) => this.normalizeTimestampFields(row)),
          truncated:
            stats.length > MAX_RUNTIME_ROWS || recent.length > MAX_RUNTIME_ROWS,
        },
        issues: slowScopes.length > 0 ? slowScopes : undefined,
      },
    ];
  }

  private async buildConnectorServices(
    generatedAt: string,
    nowMs: number,
  ): Promise<HealthServiceRow[]> {
    const [apiKeyService, balanceServices] = await Promise.all([
      this.buildApiKeyService(generatedAt),
      Promise.resolve(this.buildBalanceCacheServices(generatedAt, nowMs)),
    ]);

    return [apiKeyService, ...balanceServices];
  }

  private async buildApiKeyService(
    generatedAt: string,
  ): Promise<HealthServiceRow> {
    const result = await this.withTimeout(async () => {
      const [total, keys] = await Promise.all([
        this.apiKeysRepository.count(),
        this.apiKeysRepository.find({
          order: { created_at: 'DESC' },
          take: MAX_CONNECTOR_ACCOUNTS,
        }),
      ]);
      const byValidationStatus = keys.reduce<Record<string, number>>(
        (summary, key) => {
          const status = String(key.validation_status || 'unknown');

          summary[status] = (summary[status] || 0) + 1;

          return summary;
        },
        {},
      );

      return { total, keys, byValidationStatus };
    }, 'Exchange API key metadata source timed out.');

    if (result instanceof Error) {
      return {
        id: 'connector.api-keys',
        group: 'connector',
        name: 'Exchange API key metadata',
        status: 'warning',
        message: 'Exchange API key metadata source is unavailable.',
        observedAt: generatedAt,
        issues: ['Failed to read exchange connector metadata.'],
      };
    }

    return {
      id: 'connector.api-keys',
      group: 'connector',
      name: 'Exchange API key metadata',
      status: this.apiKeyStatus(result.total, result.byValidationStatus),
      message:
        result.total > 0
          ? 'Connector metadata was read from stored admin exchange key records.'
          : 'No connector metadata records are configured.',
      observedAt: generatedAt,
      metrics: {
        total: result.total,
        scanned: result.keys.length,
        byValidationStatus: result.byValidationStatus,
      },
      details: {
        accounts: result.keys.map((key) => ({
          keyId: key.key_id,
          exchange: key.exchange,
          name: key.name,
          permissions: key.permissions,
          validationStatus: key.validation_status,
          validatedAt: this.normalizeTimestamp(key.validated_at) || null,
          createdAt: this.normalizeTimestamp(key.created_at),
        })),
        truncated: result.total > result.keys.length,
      },
    };
  }

  private buildBalanceCacheServices(
    generatedAt: string,
    nowMs: number,
  ): HealthServiceRow[] {
    if (!this.balanceStateRefreshService) {
      return [
        {
          id: 'connector.balance-cache',
          group: 'connector',
          name: 'Balance cache',
          status: 'unknown',
          message: 'Balance cache registration source is unavailable.',
          observedAt: generatedAt,
        },
      ];
    }

    const accounts = this.balanceStateRefreshService
      .getRegisteredAccounts()
      .slice(0, MAX_CONNECTOR_ACCOUNTS);

    if (accounts.length === 0) {
      return [
        {
          id: 'connector.balance-cache',
          group: 'connector',
          name: 'Balance cache',
          status: 'unknown',
          message: 'No connector balance-cache accounts are registered.',
          observedAt: generatedAt,
          metrics: { registeredAccounts: 0 },
        },
      ];
    }

    return accounts.map((account) => {
      const streamHealth = this.balanceStateRefreshService!.getHealthState(
        account.exchange,
        account.accountLabel,
      );
      const snapshot = this.balanceStateCacheService?.getSnapshotDiagnostic(
        account.exchange,
        account.accountLabel,
        nowMs,
      );
      const status = this.streamStatus(streamHealth, snapshot?.fresh);

      return {
        id: `connector.balance-cache.${this.toIdentifier(
          account.exchange,
        )}.${this.toIdentifier(account.accountLabel)}`,
        group: 'connector',
        name: `Balance cache ${account.exchange}:${account.accountLabel}`,
        status,
        message: snapshot?.present
          ? 'Balance cache diagnostics were read from cached stream/rest snapshots.'
          : 'No cached balance snapshot is present for this registered account.',
        observedAt:
          this.normalizeTimestamp(snapshot?.freshnessTimestamp) || generatedAt,
        metrics: {
          streamHealth,
          snapshotPresent: Boolean(snapshot?.present),
          snapshotFresh: Boolean(snapshot?.fresh),
          snapshotAgeMs: snapshot?.ageMs ?? null,
        },
        details: {
          exchange: account.exchange,
          accountLabel: account.accountLabel,
          lastRefreshAt:
            this.normalizeTimestamp(
              this.balanceStateRefreshService!.getLastRefreshTime(
                account.exchange,
                account.accountLabel,
              ),
            ) || null,
          snapshotSource: snapshot?.source || null,
        },
      };
    });
  }

  private buildStreamServices(generatedAt: string): HealthServiceRow[] {
    const queueDepth = this.userStreamTrackerService?.getQueueDepth() || 0;
    const orphanedFills =
      this.userStreamTrackerService?.getOrphanedFills()?.length || 0;
    const duplicateFillSuppressionCount =
      this.userStreamTrackerService?.getDuplicateFillSuppressionCount() || 0;
    const activeWatchers =
      this.userStreamIngestionService?.getActiveWatcherCount() || 0;
    const status =
      queueDepth > 100
        ? 'critical'
        : queueDepth > 0 || orphanedFills > 0
        ? 'warning'
        : 'healthy';

    return [
      {
        id: 'stream.user',
        group: 'stream',
        name: 'User stream ingestion',
        status,
        message:
          status === 'healthy'
            ? 'User stream tracker has no pending backlog.'
            : 'User stream tracker has pending or orphaned events.',
        observedAt: generatedAt,
        metrics: {
          queueDepth,
          activeWatchers,
          orphanedFills,
          duplicateFillSuppressionCount,
        },
      },
    ];
  }

  private buildTrackedOrderServices(generatedAt: string): HealthServiceRow[] {
    const summary: {
      totalOrders: number;
      sampledOrders: number;
      byStatus: Record<string, number>;
      truncated: boolean;
    } = this.exchangeOrderTrackerService?.getTrackedOrderSummary(
      MAX_TRACKED_ORDER_SAMPLE,
    ) || {
      totalOrders: 0,
      sampledOrders: 0,
      byStatus: {},
      truncated: false,
    };
    const byStatus = summary.byStatus;
    const missing =
      (byStatus.external_missing || 0) + (byStatus.internal_missing || 0);
    const failed = byStatus.failed || 0;
    const status: AdminHealthStatus =
      failed > 0 ? 'critical' : missing > 0 ? 'warning' : 'healthy';

    return [
      {
        id: 'orders.tracker',
        group: 'orders',
        name: 'Tracked order cache',
        status,
        message:
          status === 'healthy'
            ? 'Tracked order cache has no sampled missing or failed orders.'
            : 'Tracked order cache contains sampled failed or missing orders.',
        observedAt: generatedAt,
        metrics: {
          totalOrders: summary.totalOrders,
          sampledOrders: summary.sampledOrders,
          byStatus,
          missing,
          failed,
          truncated: summary.truncated,
        },
      },
    ];
  }

  private async withTimeout<T>(
    producer: () => Promise<T>,
    timeoutMessage: string,
  ): Promise<T | Error> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        producer(),
        new Promise<Error>((resolve) => {
          timeout = setTimeout(
            () => resolve(new Error(timeoutMessage)),
            SOURCE_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private apiKeyStatus(
    total: number,
    byValidationStatus: Record<string, number>,
  ): AdminHealthStatus {
    if (total === 0) {
      return 'unknown';
    }

    if ((byValidationStatus.invalid || 0) > 0) {
      return 'critical';
    }

    if ((byValidationStatus.pending || 0) > 0) {
      return 'warning';
    }

    return 'healthy';
  }

  private streamStatus(
    streamHealth: string,
    snapshotFresh: boolean | undefined,
  ): AdminHealthStatus {
    if (streamHealth === 'healthy' && snapshotFresh !== false) {
      return 'healthy';
    }

    if (streamHealth === 'degraded' || streamHealth === 'reconnecting') {
      return 'warning';
    }

    if (streamHealth === 'silent') {
      return 'critical';
    }

    return 'unknown';
  }

  private normalizeStatus(status?: string): AdminHealthStatus {
    if (status === 'healthy' || status === 'warning' || status === 'critical') {
      return status;
    }

    return 'unknown';
  }

  private reduceStatus(rows: HealthServiceRow[]): AdminHealthStatus {
    if (rows.some((row) => row.status === 'critical')) {
      return 'critical';
    }

    if (rows.some((row) => row.status === 'warning')) {
      return 'warning';
    }

    if (rows.some((row) => row.status === 'unknown')) {
      return 'unknown';
    }

    return rows.length > 0 ? 'healthy' : 'unknown';
  }

  private buildSummary(rows: HealthServiceRow[]) {
    return {
      total: rows.length,
      healthy: rows.filter((row) => row.status === 'healthy').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      critical: rows.filter((row) => row.status === 'critical').length,
      unknown: rows.filter((row) => row.status === 'unknown').length,
    };
  }

  private buildGroups(rows: HealthServiceRow[]) {
    return this.uniqueSorted(rows.map((row) => row.group)).map((group) => {
      const services = rows.filter((row) => row.group === group);

      return {
        name: group,
        status: this.reduceStatus(services),
        serviceCount: services.length,
        issues: services.flatMap((service) => service.issues || []).slice(0, 5),
      };
    });
  }

  private uniqueSorted(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private toIdentifier(value: string): string {
    return String(value || 'default')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_TOKEN_LENGTH);
  }

  private normalizeTimestamp(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const ms = Date.parse(value);

    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  private normalizeTimestampFields<T extends Record<string, unknown>>(
    row: T,
  ): T {
    const normalized: Record<string, unknown> = { ...row };

    for (const key of Object.keys(normalized)) {
      if (
        key === 'timestamp' ||
        key.endsWith('At') ||
        key.endsWith('Timestamp')
      ) {
        const value = normalized[key];

        if (typeof value === 'string') {
          normalized[key] = this.normalizeTimestamp(value);
        }
      }
    }

    return normalized as T;
  }
}

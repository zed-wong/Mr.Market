import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { HealthService } from 'src/modules/infrastructure/health/health.service';
import { MetricsService } from 'src/modules/market-making/metrics/metrics.service';
import { ReconciliationService } from 'src/modules/market-making/reconciliation/reconciliation.service';
import {
  Between,
  FindOptionsWhere,
  MoreThanOrEqual,
  ObjectLiteral,
  Repository,
} from 'typeorm';

const DASHBOARD_RANGES = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

type DashboardRange = keyof typeof DASHBOARD_RANGES;

const RECENT_LIMIT = 10;
const CAPITAL_SCAN_LIMIT = 500;
const API_KEY_SCAN_LIMIT = 25;

const INTENT_STATUSES = [
  'QUEUED',
  'SENT',
  'DONE',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
] as const;

const TRACKED_ORDER_STATUSES = [
  'pending_create',
  'open',
  'partially_filled',
  'pending_cancel',
  'filled',
  'cancelled',
  'failed',
  'external_missing',
  'internal_missing',
] as const;

const STRATEGY_STATUSES = ['running', 'stopped', 'failed'] as const;

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository: Repository<StrategyInstance>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyOrderIntentEntity)
    private readonly strategyOrderIntentRepository: Repository<StrategyOrderIntentEntity>,
    @InjectRepository(TrackedOrderEntity)
    private readonly trackedOrderRepository: Repository<TrackedOrderEntity>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(APIKeysConfig)
    private readonly apiKeysRepository: Repository<APIKeysConfig>,
    @InjectRepository(StrategyExecutionHistory)
    private readonly executionHistoryRepository: Repository<StrategyExecutionHistory>,
    private readonly metricsService: MetricsService,
    @Optional()
    private readonly reconciliationService?: ReconciliationService,
    @Optional()
    private readonly healthService?: HealthService,
  ) {}

  async getSummary(rangeInput?: string) {
    const range = this.resolveRange(rangeInput);
    const generatedAt = getRFC3339Timestamp();
    const nowMs = Date.parse(generatedAt);
    const startAt = new Date(nowMs - DASHBOARD_RANGES[range]).toISOString();

    const [
      strategySummary,
      intentSummary,
      orderSummary,
      capitalSummary,
      exchangeSummary,
      runtimeMetrics,
      reconciliationSummary,
      healthSummary,
      volumeSummary,
    ] = await Promise.all([
      this.buildStrategySummary(startAt),
      this.buildIntentSummary(startAt),
      this.buildOrderSummary(startAt),
      this.buildCapitalSummary(),
      this.buildExchangeSummary(),
      this.buildRuntimeMetrics(),
      this.buildReconciliationSummary(),
      this.buildHealthSummary(),
      this.buildVolumeSummary(startAt, generatedAt),
    ]);

    return {
      generatedAt,
      range: {
        key: range,
        startedAt: startAt,
        endedAt: generatedAt,
      },
      kpis: {
        activeStrategies: strategySummary.counts.running || 0,
        totalStrategies: strategySummary.total,
        pendingIntents:
          (intentSummary.counts.QUEUED || 0) + (intentSummary.counts.SENT || 0),
        openOrders:
          (orderSummary.counts.open || 0) +
          (orderSummary.counts.partially_filled || 0) +
          (orderSummary.counts.pending_create || 0) +
          (orderSummary.counts.pending_cancel || 0),
        trackedOrders: orderSummary.total,
        totalCapital: capitalSummary.total,
        reconciliationViolations: reconciliationSummary.totalViolations,
        runtimeHealth: healthSummary.status,
      },
      strategies: strategySummary,
      intents: intentSummary,
      orderFlow: {
        ...orderSummary,
        volume: volumeSummary,
      },
      capital: capitalSummary,
      exchanges: exchangeSummary,
      health: healthSummary,
      reconciliation: reconciliationSummary,
      runtime: runtimeMetrics,
      limits: {
        recentItems: RECENT_LIMIT,
        capitalScanRows: CAPITAL_SCAN_LIMIT,
        apiKeyScanRows: API_KEY_SCAN_LIMIT,
      },
    };
  }

  private resolveRange(input?: string): DashboardRange {
    const range = (input || '24h').trim();

    if (range in DASHBOARD_RANGES) {
      return range as DashboardRange;
    }

    throw new BadRequestException(
      `Unsupported dashboard range. Supported ranges: ${Object.keys(
        DASHBOARD_RANGES,
      ).join(', ')}`,
    );
  }

  private async buildStrategySummary(startAt: string) {
    const [total, definitions, recent] = await Promise.all([
      this.strategyInstanceRepository.count(),
      this.strategyDefinitionRepository.count(),
      this.strategyInstanceRepository.find({
        order: { updatedAt: 'DESC' },
        take: RECENT_LIMIT,
      }),
    ]);
    const counts = await this.countByKnownValues(
      this.strategyInstanceRepository,
      'status',
      STRATEGY_STATUSES,
    );

    return {
      total,
      definitions,
      counts,
      recent: recent.map((strategy) => ({
        strategyKey: strategy.strategyKey,
        strategyType: strategy.strategyType,
        status: strategy.status,
        strategyDefinitionId: strategy.strategyDefinitionId || null,
        definitionName:
          strategy.strategyDefinitionSnapshot?.definitionName || null,
        marketMakingOrderId: strategy.marketMakingOrderId || null,
        createdAt: this.normalizeTimestamp(strategy.createdAt),
        updatedAt: this.normalizeTimestamp(strategy.updatedAt),
      })),
      updatedSince: startAt,
      truncated: recent.length >= RECENT_LIMIT,
    };
  }

  private async buildIntentSummary(startAt: string) {
    const where = { createdAt: MoreThanOrEqual(startAt) };
    const [total, recent] = await Promise.all([
      this.strategyOrderIntentRepository.count({ where }),
      this.strategyOrderIntentRepository.find({
        where,
        order: { createdAt: 'DESC' },
        take: RECENT_LIMIT,
      }),
    ]);
    const counts = await this.countByKnownValues(
      this.strategyOrderIntentRepository,
      'status',
      INTENT_STATUSES,
      where,
    );

    return {
      total,
      counts,
      recent: recent.map((intent) => ({
        intentId: intent.intentId,
        strategyKey: intent.strategyKey,
        type: intent.type,
        status: intent.status,
        exchange: intent.exchange,
        accountLabel: intent.accountLabel || null,
        pair: intent.pair,
        side: intent.side,
        createdAt: this.normalizeTimestamp(intent.createdAt),
        updatedAt: this.normalizeTimestamp(intent.updatedAt),
      })),
      truncated: recent.length >= RECENT_LIMIT,
    };
  }

  private async buildOrderSummary(startAt: string) {
    const [total, recent] = await Promise.all([
      this.trackedOrderRepository.count(),
      this.trackedOrderRepository.find({
        order: { updatedAt: 'DESC' },
        take: RECENT_LIMIT,
      }),
    ]);
    const counts = await this.countByKnownValues(
      this.trackedOrderRepository,
      'status',
      TRACKED_ORDER_STATUSES,
    );

    return {
      total,
      counts,
      recent: recent.map((order) => ({
        orderId: order.orderId,
        strategyKey: order.strategyKey,
        exchange: order.exchange,
        accountLabel: order.accountLabel || null,
        pair: order.pair,
        side: order.side,
        qty: order.qty,
        filledQty: order.cumulativeFilledQty || '0',
        price: order.price,
        status: order.status,
        createdAt: this.normalizeTimestamp(order.createdAt),
        updatedAt: this.normalizeTimestamp(order.updatedAt),
      })),
      truncated: recent.length >= RECENT_LIMIT,
      updatedSince: startAt,
    };
  }

  private async buildCapitalSummary() {
    const [totalRows, rows] = await Promise.all([
      this.orderBalanceRepository.count(),
      this.orderBalanceRepository.find({
        order: { updatedAt: 'DESC' },
        take: CAPITAL_SCAN_LIMIT,
      }),
    ]);
    const byAsset = new Map<
      string,
      {
        asset: string;
        available: BigNumber;
        locked: BigNumber;
        total: BigNumber;
      }
    >();
    let aggregateTotal = new BigNumber(0);

    for (const row of rows) {
      const asset = row.assetId.toUpperCase();
      const existing =
        byAsset.get(asset) ||
        {
          asset,
          available: new BigNumber(0),
          locked: new BigNumber(0),
          total: new BigNumber(0),
        };

      existing.available = existing.available.plus(row.available || 0);
      existing.locked = existing.locked.plus(row.locked || 0);
      existing.total = existing.total.plus(row.total || 0);
      aggregateTotal = aggregateTotal.plus(row.total || 0);
      byAsset.set(asset, existing);
    }

    return {
      total: aggregateTotal.toFixed(),
      byAsset: [...byAsset.values()]
        .sort((left, right) =>
          right.total.comparedTo(left.total) === 0
            ? left.asset.localeCompare(right.asset)
            : right.total.comparedTo(left.total),
        )
        .slice(0, RECENT_LIMIT)
        .map((entry) => ({
          asset: entry.asset,
          available: entry.available.toFixed(),
          locked: entry.locked.toFixed(),
          total: entry.total.toFixed(),
        })),
      scannedRows: rows.length,
      totalRows,
      truncated: totalRows > rows.length,
    };
  }

  private async buildExchangeSummary() {
    const [total, keys] = await Promise.all([
      this.apiKeysRepository.count(),
      this.apiKeysRepository.find({
        order: { created_at: 'DESC' },
        take: API_KEY_SCAN_LIMIT,
      }),
    ]);
    const byValidationStatus = keys.reduce<Record<string, number>>(
      (result, key) => {
        const status = key.validation_status || 'unknown';

        result[status] = (result[status] || 0) + 1;
        return result;
      },
      {},
    );

    return {
      total,
      byValidationStatus,
      accounts: keys.slice(0, RECENT_LIMIT).map((key) => ({
        keyId: key.key_id,
        exchange: key.exchange,
        name: key.name,
        permissions: key.permissions,
        validationStatus: key.validation_status,
        validatedAt: key.validated_at
          ? this.normalizeTimestamp(key.validated_at)
          : null,
        createdAt: this.normalizeTimestamp(key.created_at),
      })),
      scannedRows: keys.length,
      truncated: total > keys.length,
    };
  }

  private async buildRuntimeMetrics() {
    const snapshot = this.metricsService.getRuntimeMetrics();

    return {
      stats: snapshot.stats
        .slice(0, RECENT_LIMIT)
        .map((row) => this.normalizeTimestampFields(row)),
      recent: snapshot.recent
        .slice(-RECENT_LIMIT)
        .map((row) => this.normalizeTimestampFields(row)),
      truncated:
        snapshot.stats.length > RECENT_LIMIT ||
        snapshot.recent.length > RECENT_LIMIT,
    };
  }

  private async buildReconciliationSummary() {
    if (!this.reconciliationService) {
      return {
        totalViolations: 0,
        reports: [],
      };
    }

    const [ledger, intents] = await Promise.all([
      this.reconciliationService.reconcileLedgerInvariants(),
      this.reconciliationService.reconcileIntentLifecycleConsistency(),
    ]);
    const reports = [
      { name: 'ledger', ...ledger },
      { name: 'intents', ...intents },
    ];

    return {
      totalViolations: reports.reduce(
        (sum, report) => sum + report.violations,
        0,
      ),
      reports,
    };
  }

  private async buildHealthSummary() {
    let health: Awaited<
      ReturnType<HealthService['checkSnapshotPollingHealth']>
    > | null = null;

    if (this.healthService) {
      try {
        health = await this.healthService.checkSnapshotPollingHealth();
      } catch {
        health = null;
      }
    }

    return {
      status: health?.status || 'unknown',
      timestamp:
        this.normalizeTimestamp(health?.timestamp) || getRFC3339Timestamp(),
      queue: this.normalizeNestedTimestamps(health?.queue || null),
      metrics: this.normalizeNestedTimestamps(health?.metrics || null),
      issues: Array.isArray(health?.issues) ? health.issues.slice(0, 5) : [],
    };
  }

  private async buildVolumeSummary(startAt: string, endAt: string) {
    const rows = await this.executionHistoryRepository.find({
      where: {
        executedAt: Between(startAt, endAt),
      },
      order: { executedAt: 'DESC' },
      take: CAPITAL_SCAN_LIMIT,
    });
    const volume = rows.reduce((total, row) => {
      const amount = new BigNumber(row.amount || 0);
      const price = new BigNumber(row.price || 0);

      if (!amount.isFinite() || !price.isFinite()) {
        return total;
      }

      return total.plus(amount.multipliedBy(price));
    }, new BigNumber(0));

    return {
      tradeCount: rows.length,
      notionalVolume: volume.toFixed(),
      scannedRows: rows.length,
      truncated: rows.length >= CAPITAL_SCAN_LIMIT,
    };
  }

  private async countByKnownValues<T extends ObjectLiteral>(
    repository: Repository<T>,
    field: keyof T & string,
    values: readonly string[],
    baseWhere: FindOptionsWhere<T> = {},
  ): Promise<Record<string, number>> {
    const entries = await Promise.all(
      values.map(async (value) => {
        const where = {
          ...baseWhere,
          [field]: value,
        } as FindOptionsWhere<T>;

        return [value, await repository.count({ where })] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  private normalizeTimestamp(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const ms = Date.parse(value);

    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  private normalizeTimestampValue(value: unknown): unknown {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }

    if (typeof value === 'string') {
      return this.normalizeTimestamp(value);
    }

    return value;
  }

  private normalizeNestedTimestamps(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizeNestedTimestamps(entry));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
          key,
          key === 'timestamp' || key.endsWith('At') || key.endsWith('Timestamp')
            ? this.normalizeTimestampValue(nested)
            : this.normalizeNestedTimestamps(nested),
        ]),
      );
    }

    return value;
  }

  private normalizeTimestampFields<T extends Record<string, unknown>>(row: T): T {
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

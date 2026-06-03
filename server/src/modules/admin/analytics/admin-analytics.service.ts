import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { PerformanceService } from 'src/modules/market-making/performance/performance.service';
import { OrderBookTrackerService } from 'src/modules/market-making/trackers/order-book-tracker.service';
import { Repository } from 'typeorm';

const ANALYTICS_RANGES = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

const ANALYTICS_SCOPES = ['admin', 'pair', 'order'] as const;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_TOKEN_LENGTH = 128;
const MAX_PAIR_LENGTH = 64;
const ORDER_BOOK_STALE_MS = 30 * 1000;

type AnalyticsScope = (typeof ANALYTICS_SCOPES)[number];
type AnalyticsRange = keyof typeof ANALYTICS_RANGES;
type MetricStatus = 'available' | 'unavailable';

type DecimalMetric = {
  status: MetricStatus;
  value: string | null;
  currency: string | null;
  unavailableReason: string | null;
};

export interface AdminAnalyticsQuery {
  scope?: unknown;
  orderId?: unknown;
  exchange?: unknown;
  pair?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  range?: unknown;
  limit?: unknown;
}

type ResolvedAnalyticsQuery = {
  scope: AnalyticsScope;
  orderId?: string;
  exchange?: string;
  pair?: string;
  startedAt: string;
  endedAt: string;
  limit: number;
  rangeKey: AnalyticsRange | 'custom';
};

type TrackedOrderProjection = Pick<
  TrackedOrderEntity,
  | 'trackingKey'
  | 'orderId'
  | 'strategyKey'
  | 'exchange'
  | 'pair'
  | 'exchangeOrderId'
  | 'clientOrderId'
  | 'side'
  | 'price'
  | 'qty'
  | 'cumulativeFilledQty'
  | 'settledFilledQty'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(TrackedOrderEntity)
    private readonly trackedOrderRepository: Repository<TrackedOrderEntity>,
    @InjectRepository(StrategyOrderIntentEntity)
    private readonly strategyOrderIntentRepository: Repository<StrategyOrderIntentEntity>,
    @InjectRepository(StrategyExecutionHistory)
    private readonly executionHistoryRepository: Repository<StrategyExecutionHistory>,
    private readonly orderBookTrackerService: OrderBookTrackerService,
    private readonly performanceService: PerformanceService,
  ) {}

  async getFoundation(input: AdminAnalyticsQuery = {}) {
    const filters = this.resolveQuery(input);

    const trackedOrders = await this.loadTrackedOrders(filters);
    const scopedOrderIds = this.resolveScopedOrderIds(filters, trackedOrders);
    const strategyKeys = this.unique(
      trackedOrders.map((order) => order.strategyKey).filter(Boolean),
    );

    const [ledgerEntries, orderBalances, strategyOrderIntents, executions] =
      await Promise.all([
        this.loadLedgerEntries(filters, scopedOrderIds),
        this.loadOrderBalances(filters, scopedOrderIds),
        this.loadStrategyOrderIntents(filters, strategyKeys),
        this.loadStrategyExecutions(filters),
      ]);
    const midPairs = this.resolveMidPairs(filters, trackedOrders, [
      ...strategyOrderIntents,
      ...executions,
    ]);
    const orderBookMids = midPairs.map(({ exchange, pair }) =>
      this.readOrderBookMid(exchange, pair),
    );
    const perOrderAnalytics =
      filters.scope === 'order' && filters.orderId
        ? await this.buildPerOrderAnalytics(filters, {
            trackedOrders,
            ledgerEntries,
            orderBalances,
            strategyOrderIntents,
            executions,
            orderBookMids,
          })
        : null;

    return {
      generatedAt: getRFC3339Timestamp(),
      scope: {
        type: filters.scope,
        orderId: filters.orderId || null,
        exchange: filters.exchange || null,
        pair: filters.pair || null,
      },
      range: {
        key: filters.rangeKey,
        startedAt: filters.startedAt,
        endedAt: filters.endedAt,
      },
      filters: {
        orderId: filters.orderId || null,
        exchange: filters.exchange || null,
        pair: filters.pair || null,
      },
      summary: {
        counts: {
          ledgerEntries: ledgerEntries.length,
          orderBalances: orderBalances.length,
          trackedOrders: trackedOrders.length,
          strategyOrderIntents: strategyOrderIntents.length,
          strategyExecutions: executions.length,
          orderBookMids: orderBookMids.length,
        },
        ledgerAmountByAsset: this.summarizeLedgerAmounts(ledgerEntries),
        balanceTotalsByAsset: this.summarizeBalances(orderBalances),
      },
      sources: {
        ledgerEntries: ledgerEntries.map((entry) =>
          this.serializeLedgerEntry(entry),
        ),
        orderBalances: orderBalances.map((balance) =>
          this.serializeOrderBalance(balance),
        ),
        trackedOrders: trackedOrders.map((order) =>
          this.serializeTrackedOrder(order),
        ),
        strategyOrderIntents: strategyOrderIntents.map((intent) =>
          this.serializeStrategyOrderIntent(intent),
        ),
        strategyExecutions: executions.map((execution) =>
          this.serializeStrategyExecution(execution),
        ),
        orderBookMids,
      },
      analytics: {
        perOrder: perOrderAnalytics,
      },
      dataSources: [
        'ledger_entries',
        'order_scoped_balances',
        'tracked_orders',
        'strategy_order_intents',
        'strategy_execution_history',
        'order_book_tracker_mid',
      ],
      numericSerialization: {
        format: 'decimal-string',
        calculator: 'bignumber.js',
        zeroFallbackForUnavailableMetrics: false,
      },
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        appliedLimit: filters.limit,
        orderBookStaleMs: ORDER_BOOK_STALE_MS,
      },
    };
  }

  async getOrderAnalytics(
    orderId: string,
    input: Omit<AdminAnalyticsQuery, 'scope' | 'orderId'> = {},
  ) {
    const foundation = await this.getFoundation({
      ...input,
      scope: 'order',
      orderId,
    });

    return {
      generatedAt: foundation.generatedAt,
      scope: foundation.scope,
      range: foundation.range,
      filters: foundation.filters,
      analytics: foundation.analytics.perOrder,
    };
  }

  private resolveQuery(input: AdminAnalyticsQuery): ResolvedAnalyticsQuery {
    const scope = this.resolveScope(input.scope);
    const orderId = this.normalizeOptionalToken(input.orderId, 'orderId');
    const exchange = this.normalizeOptionalToken(input.exchange, 'exchange');
    const pair = this.normalizeOptionalPair(input.pair);
    const range = this.resolveRange(input.range, input.startAt, input.endAt);
    const limit = this.resolveLimit(input.limit);

    if (scope === 'order' && !orderId) {
      throw new BadRequestException('orderId is required for order scope.');
    }

    if (scope === 'pair') {
      if (!exchange) {
        throw new BadRequestException('exchange is required for pair scope.');
      }
      if (!pair) {
        throw new BadRequestException('pair is required for pair scope.');
      }
    }

    return {
      scope,
      orderId,
      exchange,
      pair,
      startedAt: range.startedAt,
      endedAt: range.endedAt,
      rangeKey: range.rangeKey,
      limit,
    };
  }

  private resolveScope(input?: unknown): AnalyticsScope {
    if (input === undefined || input === '') {
      return 'admin';
    }

    if (typeof input !== 'string') {
      throw new BadRequestException(
        `Analytics scope must be a single string value. Supported scopes: ${ANALYTICS_SCOPES.join(
          ', ',
        )}`,
      );
    }

    const normalized = input.trim().toLowerCase();

    if (ANALYTICS_SCOPES.includes(normalized as AnalyticsScope)) {
      return normalized as AnalyticsScope;
    }

    throw new BadRequestException(
      `Unsupported analytics scope. Supported scopes: ${ANALYTICS_SCOPES.join(
        ', ',
      )}`,
    );
  }

  private resolveRange(
    rangeInput?: unknown,
    startAtInput?: unknown,
    endAtInput?: unknown,
  ): {
    startedAt: string;
    endedAt: string;
    rangeKey: AnalyticsRange | 'custom';
  } {
    const hasStart = startAtInput !== undefined && startAtInput !== '';
    const hasEnd = endAtInput !== undefined && endAtInput !== '';

    if (hasStart || hasEnd) {
      if (!hasStart || !hasEnd) {
        throw new BadRequestException(
          'Both startAt and endAt are required for a custom analytics range.',
        );
      }

      const startedAt = this.normalizeTimestampInput(startAtInput, 'startAt');
      const endedAt = this.normalizeTimestampInput(endAtInput, 'endAt');

      if (Date.parse(startedAt) > Date.parse(endedAt)) {
        throw new BadRequestException(
          'Analytics startAt must be before or equal to endAt.',
        );
      }

      return { startedAt, endedAt, rangeKey: 'custom' };
    }

    const rangeKey = this.resolveRangeKey(rangeInput);
    const endedAt = getRFC3339Timestamp();
    const startedAt = new Date(
      Date.parse(endedAt) - ANALYTICS_RANGES[rangeKey],
    ).toISOString();

    return { startedAt, endedAt, rangeKey };
  }

  private resolveRangeKey(input?: unknown): AnalyticsRange {
    if (input === undefined || input === '') {
      return '24h';
    }

    if (typeof input !== 'string') {
      throw new BadRequestException(
        `Analytics range must be a single string value. Supported ranges: ${Object.keys(
          ANALYTICS_RANGES,
        ).join(', ')}`,
      );
    }

    const range = input.trim();

    if (range in ANALYTICS_RANGES) {
      return range as AnalyticsRange;
    }

    throw new BadRequestException(
      `Unsupported analytics range. Supported ranges: ${Object.keys(
        ANALYTICS_RANGES,
      ).join(', ')}`,
    );
  }

  private normalizeTimestampInput(input: unknown, label: string): string {
    if (typeof input !== 'string') {
      throw new BadRequestException(`${label} must be an RFC3339 timestamp.`);
    }

    const ms = Date.parse(input);

    if (!Number.isFinite(ms)) {
      throw new BadRequestException(`${label} must be an RFC3339 timestamp.`);
    }

    return new Date(ms).toISOString();
  }

  private normalizeOptionalToken(
    value: unknown,
    label: 'orderId' | 'exchange',
  ): string | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} must be a single string value.`);
    }

    const normalized = value.trim();

    if (!normalized || normalized.toLowerCase() === 'all') {
      return undefined;
    }

    if (
      normalized.length > MAX_TOKEN_LENGTH ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized)
    ) {
      throw new BadRequestException(
        `${label} must be a simple bounded identifier.`,
      );
    }

    return label === 'exchange' ? normalized.toLowerCase() : normalized;
  }

  private normalizeOptionalPair(value: unknown): string | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('pair must be a single string value.');
    }

    const normalized = value.trim().toUpperCase();

    if (!normalized || normalized.toLowerCase() === 'all') {
      return undefined;
    }

    if (
      normalized.length > MAX_PAIR_LENGTH ||
      !/^[A-Z0-9][A-Z0-9._:/-]*$/.test(normalized)
    ) {
      throw new BadRequestException(
        'pair must be a simple bounded market pair identifier.',
      );
    }

    return normalized;
  }

  private resolveLimit(input?: unknown): number {
    if (input === undefined || input === '') {
      return DEFAULT_LIMIT;
    }

    if (typeof input !== 'string' || !/^\d+$/.test(input)) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    const parsed = Number(input);

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    return Math.min(parsed, MAX_LIMIT);
  }

  private async loadTrackedOrders(
    filters: ResolvedAnalyticsQuery,
  ): Promise<TrackedOrderProjection[]> {
    const query = this.trackedOrderRepository.createQueryBuilder('trackedOrder');

    this.applyWindow(query, 'trackedOrder', 'updatedAt', filters);
    this.applyOrderFilter(query, 'trackedOrder', filters.orderId);
    this.applyExchangePairFilters(query, 'trackedOrder', filters);

    return await query
      .orderBy('trackedOrder.updatedAt', 'DESC')
      .take(filters.limit)
      .getMany();
  }

  private async loadLedgerEntries(
    filters: ResolvedAnalyticsQuery,
    scopedOrderIds: string[],
  ): Promise<LedgerEntry[]> {
    const query = this.ledgerEntryRepository.createQueryBuilder('ledgerEntry');

    this.applyWindow(query, 'ledgerEntry', 'createdAt', filters);
    this.applyScopedOrderIds(query, 'ledgerEntry', filters, scopedOrderIds);

    return await query
      .orderBy('ledgerEntry.createdAt', 'DESC')
      .take(filters.limit)
      .getMany();
  }

  private async loadOrderBalances(
    filters: ResolvedAnalyticsQuery,
    scopedOrderIds: string[],
  ): Promise<MarketMakingOrderBalance[]> {
    const query = this.orderBalanceRepository.createQueryBuilder('balance');

    this.applyWindow(query, 'balance', 'updatedAt', filters);
    this.applyScopedOrderIds(query, 'balance', filters, scopedOrderIds);

    return await query
      .orderBy('balance.updatedAt', 'DESC')
      .take(filters.limit)
      .getMany();
  }

  private async loadStrategyOrderIntents(
    filters: ResolvedAnalyticsQuery,
    strategyKeys: string[],
  ): Promise<StrategyOrderIntentEntity[]> {
    const query =
      this.strategyOrderIntentRepository.createQueryBuilder('intent');

    this.applyWindow(query, 'intent', 'createdAt', filters);
    this.applyExchangePairFilters(query, 'intent', filters);
    this.applyStrategyKeyScope(query, 'intent', filters, strategyKeys);

    return await query
      .orderBy('intent.createdAt', 'DESC')
      .take(filters.limit)
      .getMany();
  }

  private async loadStrategyExecutions(
    filters: ResolvedAnalyticsQuery,
  ): Promise<StrategyExecutionHistory[]> {
    const query =
      this.executionHistoryRepository.createQueryBuilder('execution');

    this.applyWindow(query, 'execution', 'executedAt', filters);
    this.applyOrderFilter(query, 'execution', filters.orderId);
    this.applyExchangePairFilters(query, 'execution', filters);

    return await query
      .orderBy('execution.executedAt', 'DESC')
      .take(filters.limit)
      .getMany();
  }

  private applyWindow(
    query: { andWhere: (sql: string, params?: Record<string, unknown>) => any },
    alias: string,
    field: string,
    filters: ResolvedAnalyticsQuery,
  ) {
    query.andWhere(`${alias}.${field} BETWEEN :startedAt AND :endedAt`, {
      startedAt: filters.startedAt,
      endedAt: filters.endedAt,
    });
  }

  private applyOrderFilter(
    query: { andWhere: (sql: string, params?: Record<string, unknown>) => any },
    alias: string,
    orderId?: string,
  ) {
    if (orderId) {
      query.andWhere(`${alias}.orderId = :orderId`, { orderId });
    }
  }

  private applyScopedOrderIds(
    query: { andWhere: (sql: string, params?: Record<string, unknown>) => any },
    alias: string,
    filters: ResolvedAnalyticsQuery,
    scopedOrderIds: string[],
  ) {
    if (filters.orderId) {
      this.applyOrderFilter(query, alias, filters.orderId);
      return;
    }

    if (filters.exchange || filters.pair) {
      if (scopedOrderIds.length === 0) {
        query.andWhere('1 = 0');
        return;
      }

      query.andWhere(`${alias}.orderId IN (:...orderIds)`, {
        orderIds: scopedOrderIds,
      });
    }
  }

  private applyExchangePairFilters(
    query: { andWhere: (sql: string, params?: Record<string, unknown>) => any },
    alias: string,
    filters: ResolvedAnalyticsQuery,
  ) {
    if (filters.exchange) {
      query.andWhere(`LOWER(${alias}.exchange) = :exchange`, {
        exchange: filters.exchange,
      });
    }

    if (filters.pair) {
      query.andWhere(`UPPER(${alias}.pair) = :pair`, {
        pair: filters.pair,
      });
    }
  }

  private applyStrategyKeyScope(
    query: { andWhere: (sql: string, params?: Record<string, unknown>) => any },
    alias: string,
    filters: ResolvedAnalyticsQuery,
    strategyKeys: string[],
  ) {
    if (!filters.orderId) {
      return;
    }

    if (strategyKeys.length === 0) {
      query.andWhere('1 = 0');
      return;
    }

    query.andWhere(`${alias}.strategyKey IN (:...strategyKeys)`, {
      strategyKeys,
    });
  }

  private resolveScopedOrderIds(
    filters: ResolvedAnalyticsQuery,
    trackedOrders: TrackedOrderProjection[],
  ): string[] {
    if (filters.orderId) {
      return [filters.orderId];
    }

    if (!filters.exchange && !filters.pair) {
      return [];
    }

    return this.unique(trackedOrders.map((order) => order.orderId));
  }

  private resolveMidPairs(
    filters: ResolvedAnalyticsQuery,
    trackedOrders: TrackedOrderProjection[],
    rows: Array<{ exchange?: string; pair?: string }>,
  ): Array<{ exchange: string; pair: string }> {
    const pairs = new Map<string, { exchange: string; pair: string }>();

    const add = (exchange?: string, pair?: string) => {
      if (!exchange || !pair) {
        return;
      }

      const normalizedExchange = exchange.toLowerCase();
      const normalizedPair = pair.toUpperCase();

      pairs.set(`${normalizedExchange}:${normalizedPair}`, {
        exchange: normalizedExchange,
        pair: normalizedPair,
      });
    };

    add(filters.exchange, filters.pair);

    for (const order of trackedOrders) {
      add(order.exchange, order.pair);
    }

    for (const row of rows) {
      add(row.exchange, row.pair);
    }

    return [...pairs.values()].slice(0, filters.limit);
  }

  private readOrderBookMid(exchange: string, pair: string) {
    const book = this.orderBookTrackerService.getOrderBook(exchange, pair);
    const bestBid = this.toPositiveDecimal(book?.bids?.[0]?.[0]);
    const bestAsk = this.toPositiveDecimal(book?.asks?.[0]?.[0]);
    const lastUpdateAt = this.orderBookTrackerService.getLastUpdateAt(
      exchange,
      pair,
    );
    const stale = this.orderBookTrackerService.isStale(
      exchange,
      pair,
      ORDER_BOOK_STALE_MS,
    );

    if (!book || !bestBid || !bestAsk) {
      return {
        exchange,
        pair,
        midPrice: null,
        bestBid: bestBid ? bestBid.toFixed() : null,
        bestAsk: bestAsk ? bestAsk.toFixed() : null,
        sequence: book?.sequence ?? null,
        updatedAt: lastUpdateAt ? new Date(lastUpdateAt).toISOString() : null,
        stale,
        unavailableReason: 'order-book-mid-unavailable',
      };
    }

    return {
      exchange,
      pair,
      midPrice: bestBid.plus(bestAsk).dividedBy(2).toFixed(),
      bestBid: bestBid.toFixed(),
      bestAsk: bestAsk.toFixed(),
      sequence: book.sequence,
      updatedAt: lastUpdateAt ? new Date(lastUpdateAt).toISOString() : null,
      stale,
      unavailableReason: null,
    };
  }

  private async buildPerOrderAnalytics(
    filters: ResolvedAnalyticsQuery,
    sources: {
      trackedOrders: TrackedOrderProjection[];
      ledgerEntries: LedgerEntry[];
      orderBalances: MarketMakingOrderBalance[];
      strategyOrderIntents: StrategyOrderIntentEntity[];
      executions: StrategyExecutionHistory[];
      orderBookMids: Array<ReturnType<AdminAnalyticsService['readOrderBookMid']>>;
    },
  ) {
    const performance = await this.performanceService.getOrderPerformance(
      filters.orderId!,
    );
    const market = this.resolveOrderMarket(
      filters,
      sources.trackedOrders,
      sources.executions,
      sources.strategyOrderIntents,
    );
    const pairAssets = this.parsePair(market.pair);
    const quoteCurrency = pairAssets.quote || null;
    const baseCurrency = pairAssets.base || null;
    const mark = this.resolveOrderMark(market, sources.orderBookMids);
    const inventoryBaseQty = this.toDecimal(
      performance.summary.inventoryBaseQty,
    );
    const inventoryCostQuote = this.toDecimal(
      performance.summary.inventoryCostQuote,
    );
    const inventoryAverageCostQuote = this.resolveInventoryAverageCost(
      inventoryBaseQty,
      inventoryCostQuote,
      performance.summary.inventoryAverageCostQuote,
    );
    const realizedPnlQuote = this.toDecimal(
      performance.summary.realizedPnlQuote,
    );
    const feesQuote = this.toDecimal(performance.summary.feesQuote);
    const realizedNetPnlQuote = this.toDecimal(performance.summary.netPnlQuote);
    const markPrice =
      mark.midPrice !== null ? this.toPositiveDecimal(mark.midPrice) : null;
    const markUnavailableReason =
      mark.unavailableReason ||
      (!market.exchange || !market.pair
        ? 'order-market-pair-unavailable'
        : 'order-book-mid-unavailable');
    const unrealizedPnlQuote =
      markPrice && inventoryAverageCostQuote
        ? inventoryBaseQty.multipliedBy(markPrice.minus(inventoryAverageCostQuote))
        : null;
    const inventoryNotionalQuote = markPrice
      ? inventoryBaseQty.multipliedBy(markPrice)
      : null;
    const netPnlQuote = unrealizedPnlQuote
      ? realizedNetPnlQuote.plus(unrealizedPnlQuote)
      : null;

    return {
      orderId: filters.orderId,
      exchange: market.exchange,
      pair: market.pair,
      baseAsset: baseCurrency,
      quoteAsset: quoteCurrency,
      markPrice: {
        ...this.metricFromNullable(markPrice, quoteCurrency, markUnavailableReason),
        source: 'order_book_mid',
        stale: mark.stale,
        updatedAt: mark.updatedAt,
        bestBid: mark.bestBid,
        bestAsk: mark.bestAsk,
        sequence: mark.sequence,
      },
      pnl: {
        realized: this.availableMetric(realizedPnlQuote, quoteCurrency),
        unrealized: this.metricFromNullable(
          unrealizedPnlQuote,
          quoteCurrency,
          markUnavailableReason,
        ),
        net: this.metricFromNullable(
          netPnlQuote,
          quoteCurrency,
          markUnavailableReason,
        ),
        realizedNet: this.availableMetric(realizedNetPnlQuote, quoteCurrency),
      },
      fees: {
        total: this.availableMetric(feesQuote, quoteCurrency),
        other: performance.summary.otherFees,
      },
      inventoryExposure: {
        quantity: this.availableMetric(inventoryBaseQty, baseCurrency),
        costBasis: this.availableMetric(inventoryCostQuote, quoteCurrency),
        averageCost: this.metricFromNullable(
          inventoryAverageCostQuote,
          quoteCurrency,
          'inventory-cost-basis-unavailable',
        ),
        notional: this.metricFromNullable(
          inventoryNotionalQuote,
          quoteCurrency,
          markUnavailableReason,
        ),
        balances: sources.orderBalances.map((balance) =>
          this.serializeOrderBalance(balance),
        ),
      },
      spreadCapture: {
        quote: this.availableMetric(realizedPnlQuote, quoteCurrency),
        effectiveSpreadBps: performance.summary.effectiveSpreadBps,
        tradedQuoteVolume: this.availableMetric(
          this.toDecimal(performance.summary.tradedQuoteVolume),
          quoteCurrency,
        ),
        fillCount: performance.summary.fillCount,
      },
      drawdown: this.buildDrawdown(performance.series, quoteCurrency),
      timeline: this.buildPerOrderTimeline(sources),
      dataSources: [
        'performance_service_order_performance',
        'ledger_entries',
        'order_scoped_balances',
        'tracked_orders',
        'strategy_order_intents',
        'strategy_execution_history',
        'order_book_tracker_mid',
      ],
    };
  }

  private resolveOrderMarket(
    filters: ResolvedAnalyticsQuery,
    trackedOrders: TrackedOrderProjection[],
    executions: StrategyExecutionHistory[],
    intents: StrategyOrderIntentEntity[],
  ): { exchange: string | null; pair: string | null } {
    const firstTracked = trackedOrders.find((order) => order.orderId);
    const firstExecution = executions.find((execution) => execution.orderId);
    const firstIntent = intents[0];

    return {
      exchange:
        filters.exchange ||
        firstTracked?.exchange?.toLowerCase() ||
        firstExecution?.exchange?.toLowerCase() ||
        firstIntent?.exchange?.toLowerCase() ||
        null,
      pair:
        filters.pair ||
        firstTracked?.pair?.toUpperCase() ||
        firstExecution?.pair?.toUpperCase() ||
        firstIntent?.pair?.toUpperCase() ||
        null,
    };
  }

  private resolveOrderMark(
    market: { exchange: string | null; pair: string | null },
    mids: Array<ReturnType<AdminAnalyticsService['readOrderBookMid']>>,
  ) {
    const matched = mids.find(
      (mid) =>
        mid.exchange === market.exchange &&
        mid.pair === market.pair,
    );

    if (matched) {
      return matched;
    }

    return {
      exchange: market.exchange,
      pair: market.pair,
      midPrice: null,
      bestBid: null,
      bestAsk: null,
      sequence: null,
      updatedAt: null,
      stale: true,
      unavailableReason: 'order-market-pair-unavailable',
    };
  }

  private resolveInventoryAverageCost(
    inventoryBaseQty: BigNumber,
    inventoryCostQuote: BigNumber,
    reportedAverageCost?: string | null,
  ): BigNumber | null {
    const reported = this.toNullableDecimal(reportedAverageCost);

    if (reported) {
      return reported;
    }

    if (inventoryBaseQty.isGreaterThan(0)) {
      return inventoryCostQuote.dividedBy(inventoryBaseQty);
    }

    return new BigNumber(0);
  }

  private buildDrawdown(
    series: Array<{ t: string; net: string; realized: string; fees: string }>,
    currency: string | null,
  ) {
    const points = [...series]
      .sort((left, right) => left.t.localeCompare(right.t))
      .map((point) => ({
        t: point.t,
        realized: this.serializeDecimal(point.realized),
        fees: this.serializeDecimal(point.fees),
        net: this.serializeDecimal(point.net),
      }));
    let peak: BigNumber | null = null;
    let peakAt: string | null = null;
    let troughAt: string | null = null;
    let maxDrawdown = new BigNumber(0);

    for (const point of points) {
      const net = this.toDecimal(point.net);

      if (peak === null || net.isGreaterThan(peak)) {
        peak = net;
        peakAt = point.t;
      }

      const drawdown = (peak || new BigNumber(0)).minus(net);

      if (drawdown.isGreaterThan(maxDrawdown)) {
        maxDrawdown = drawdown;
        troughAt = point.t;
      }
    }

    return {
      status: 'available' as const,
      maxDrawdownQuote: maxDrawdown.toFixed(),
      currency,
      peakAt,
      troughAt,
      series: points,
      unavailableReason: null,
    };
  }

  private buildPerOrderTimeline(sources: {
    trackedOrders: TrackedOrderProjection[];
    ledgerEntries: LedgerEntry[];
    strategyOrderIntents: StrategyOrderIntentEntity[];
    executions: StrategyExecutionHistory[];
  }) {
    const events: Array<{
      id: string;
      type: 'quote' | 'fill' | 'cancel' | 'decision';
      at: string | null;
      source: string;
      sourceId: string;
      status: string | null;
      side: string | null;
      price: string | null;
      qty: string | null;
    }> = [];

    for (const intent of sources.strategyOrderIntents) {
      events.push({
        id: `intent:${intent.intentId}`,
        type: 'quote',
        at: this.normalizeTimestamp(intent.createdAt),
        source: 'strategy_order_intent',
        sourceId: intent.intentId,
        status: intent.status || null,
        side: intent.side || null,
        price: this.serializeNullableDecimal(intent.price),
        qty: this.serializeNullableDecimal(intent.qty),
      });
    }

    for (const order of sources.trackedOrders) {
      const filledQty = this.toDecimal(order.cumulativeFilledQty);

      if (filledQty.isGreaterThan(0)) {
        events.push({
          id: `tracked:${order.trackingKey}:fill`,
          type: 'fill',
          at: this.normalizeTimestamp(order.updatedAt),
          source: 'tracked_order',
          sourceId: order.trackingKey,
          status: order.status || null,
          side: order.side || null,
          price: this.serializeNullableDecimal(order.price),
          qty: filledQty.toFixed(),
        });
      }

      if (String(order.status || '').toLowerCase().includes('cancel')) {
        events.push({
          id: `tracked:${order.trackingKey}:cancel`,
          type: 'cancel',
          at: this.normalizeTimestamp(order.updatedAt),
          source: 'tracked_order',
          sourceId: order.trackingKey,
          status: order.status || null,
          side: order.side || null,
          price: this.serializeNullableDecimal(order.price),
          qty: this.serializeNullableDecimal(order.qty),
        });
      }
    }

    for (const execution of sources.executions) {
      events.push({
        id: `execution:${execution.id}`,
        type: 'decision',
        at: this.normalizeTimestamp(execution.executedAt),
        source: 'strategy_execution_history',
        sourceId: execution.id,
        status: execution.status || null,
        side: execution.side || null,
        price: this.serializeNullableDecimal(execution.price),
        qty: this.serializeNullableDecimal(execution.amount),
      });
    }

    for (const entry of sources.ledgerEntries) {
      if (entry.type !== 'fill_settle') {
        continue;
      }

      events.push({
        id: `ledger:${entry.entryId}`,
        type: 'fill',
        at: this.normalizeTimestamp(entry.createdAt),
        source: 'ledger_entry',
        sourceId: entry.entryId,
        status: entry.type,
        side: null,
        price: null,
        qty: this.serializeNullableDecimal(entry.amount),
      });
    }

    return {
      events: events.sort((left, right) => {
        const atOrder = String(left.at || '').localeCompare(
          String(right.at || ''),
        );

        if (atOrder !== 0) {
          return atOrder;
        }

        return left.id.localeCompare(right.id);
      }),
    };
  }

  private availableMetric(
    value: BigNumber,
    currency: string | null,
  ): DecimalMetric {
    return {
      status: 'available',
      value: value.toFixed(),
      currency,
      unavailableReason: null,
    };
  }

  private metricFromNullable(
    value: BigNumber | null,
    currency: string | null,
    unavailableReason: string,
  ): DecimalMetric {
    if (!value || !value.isFinite()) {
      return {
        status: 'unavailable',
        value: null,
        currency,
        unavailableReason,
      };
    }

    return this.availableMetric(value, currency);
  }

  private summarizeLedgerAmounts(entries: LedgerEntry[]) {
    const byAsset = new Map<string, BigNumber>();

    for (const entry of entries) {
      const asset = entry.assetId;
      const amount = byAsset.get(asset) || new BigNumber(0);

      byAsset.set(asset, amount.plus(this.toDecimal(entry.amount)));
    }

    return [...byAsset.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([asset, amount]) => ({
        asset,
        amount: amount.toFixed(),
      }));
  }

  private summarizeBalances(balances: MarketMakingOrderBalance[]) {
    const byAsset = new Map<
      string,
      {
        available: BigNumber;
        locked: BigNumber;
        total: BigNumber;
        realizedDelta: BigNumber;
        feePaid: BigNumber;
      }
    >();

    for (const balance of balances) {
      const existing = byAsset.get(balance.assetId) || {
        available: new BigNumber(0),
        locked: new BigNumber(0),
        total: new BigNumber(0),
        realizedDelta: new BigNumber(0),
        feePaid: new BigNumber(0),
      };

      existing.available = existing.available.plus(
        this.toDecimal(balance.available),
      );
      existing.locked = existing.locked.plus(this.toDecimal(balance.locked));
      existing.total = existing.total.plus(this.toDecimal(balance.total));
      existing.realizedDelta = existing.realizedDelta.plus(
        this.toDecimal(balance.realizedDelta),
      );
      existing.feePaid = existing.feePaid.plus(this.toDecimal(balance.feePaid));
      byAsset.set(balance.assetId, existing);
    }

    return [...byAsset.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([asset, totals]) => ({
        asset,
        available: totals.available.toFixed(),
        locked: totals.locked.toFixed(),
        total: totals.total.toFixed(),
        realizedDelta: totals.realizedDelta.toFixed(),
        feePaid: totals.feePaid.toFixed(),
      }));
  }

  private serializeLedgerEntry(entry: LedgerEntry) {
    return {
      entryId: entry.entryId,
      orderId: entry.orderId,
      assetId: entry.assetId,
      amount: this.serializeDecimal(entry.amount),
      type: entry.type,
      refType: entry.refType || null,
      refId: entry.refId || null,
      createdAt: this.normalizeTimestamp(entry.createdAt),
    };
  }

  private serializeOrderBalance(balance: MarketMakingOrderBalance) {
    return {
      id: `${balance.orderId}:${balance.assetId}`,
      orderId: balance.orderId,
      assetId: balance.assetId,
      available: this.serializeDecimal(balance.available),
      locked: this.serializeDecimal(balance.locked),
      total: this.serializeDecimal(balance.total),
      initialDeposit: this.serializeDecimal(balance.initialDeposit),
      realizedDelta: this.serializeDecimal(balance.realizedDelta),
      feePaid: this.serializeDecimal(balance.feePaid),
      updatedAt: this.normalizeTimestamp(balance.updatedAt),
    };
  }

  private serializeTrackedOrder(order: TrackedOrderProjection) {
    return {
      trackingKey: order.trackingKey,
      orderId: order.orderId,
      strategyKey: order.strategyKey,
      exchange: order.exchange,
      pair: order.pair,
      exchangeOrderId: order.exchangeOrderId,
      clientOrderId: order.clientOrderId || null,
      side: order.side,
      price: this.serializeDecimal(order.price),
      qty: this.serializeDecimal(order.qty),
      cumulativeFilledQty: this.serializeNullableDecimal(
        order.cumulativeFilledQty,
      ),
      settledFilledQty: this.serializeNullableDecimal(order.settledFilledQty),
      status: order.status,
      createdAt: this.normalizeTimestamp(order.createdAt),
      updatedAt: this.normalizeTimestamp(order.updatedAt),
    };
  }

  private serializeStrategyOrderIntent(intent: StrategyOrderIntentEntity) {
    return {
      intentId: intent.intentId,
      strategyKey: intent.strategyKey,
      type: intent.type,
      exchange: intent.exchange,
      pair: intent.pair,
      side: intent.side,
      price: this.serializeDecimal(intent.price),
      qty: this.serializeDecimal(intent.qty),
      status: intent.status,
      createdAt: this.normalizeTimestamp(intent.createdAt),
      updatedAt: this.normalizeTimestamp(intent.updatedAt),
    };
  }

  private serializeStrategyExecution(execution: StrategyExecutionHistory) {
    return {
      id: execution.id,
      orderId: execution.orderId || null,
      exchange: execution.exchange,
      pair: execution.pair,
      side: execution.side || null,
      amount: this.serializeNullableDecimal(execution.amount),
      price: this.serializeNullableDecimal(execution.price),
      strategyType: execution.strategyType,
      status: execution.status || null,
      executedAt: this.normalizeTimestamp(execution.executedAt),
    };
  }

  private serializeDecimal(value: unknown): string {
    return this.toDecimal(value).toFixed();
  }

  private serializeNullableDecimal(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return this.serializeDecimal(value);
  }

  private toNullableDecimal(value: unknown): BigNumber | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const decimal = new BigNumber(String(value));

    return decimal.isFinite() ? decimal : null;
  }

  private toDecimal(value: unknown): BigNumber {
    const decimal = new BigNumber(String(value ?? '0'));

    return decimal.isFinite() ? decimal : new BigNumber(0);
  }

  private toPositiveDecimal(value: unknown): BigNumber | null {
    const decimal = new BigNumber(String(value ?? ''));

    return decimal.isFinite() && decimal.gt(0) ? decimal : null;
  }

  private normalizeTimestamp(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const ms = Date.parse(value);

    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  private parsePair(pair?: string | null): { base: string; quote: string } {
    const [base, quote] = String(pair || '').split('/');

    return {
      base: String(base || '').trim().toUpperCase(),
      quote: String(quote || '').trim().toUpperCase(),
    };
  }

  private unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }
}

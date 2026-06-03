import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
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

type MarketMakingOrderProjection = Pick<
  MarketMakingOrder,
  'orderId' | 'exchangeName' | 'pair' | 'source' | 'state' | 'createdAt'
>;

type OrderAggregateSnapshot = {
  orderId: string;
  exchange: string | null;
  pair: string | null;
  baseAsset: string | null;
  quoteAsset: string | null;
  realizedPnlQuote: BigNumber;
  feesQuote: BigNumber;
  realizedNetPnlQuote: BigNumber;
  unrealizedPnlQuote: BigNumber | null;
  inventoryBaseQty: BigNumber;
  inventoryCostQuote: BigNumber;
  inventoryNotionalQuote: BigNumber | null;
  tradedQuoteVolume: BigNumber;
  fillCount: number;
  series: Array<{ t: string; realized: string; fees: string; net: string }>;
  markUnavailableReason: string | null;
};

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository: Repository<MarketMakingOrder>,
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

    const [eligibleOrders, directMarketMakingOrders, trackedOrders] =
      await Promise.all([
        this.loadEligibleMarketMakingOrders(filters),
        this.loadEligibleMarketMakingOrders(filters, {
          directMarketMakingOnly: true,
        }),
        this.loadTrackedOrders(filters),
      ]);
    const scopedOrderIds = this.resolveScopedOrderIds(filters, eligibleOrders);
    const strategyKeys = this.unique(
      trackedOrders
        .filter(
          (order) =>
            scopedOrderIds.length === 0 ||
            scopedOrderIds.includes(order.orderId),
        )
        .map((order) => order.strategyKey)
        .filter(Boolean),
    );

    const [ledgerEntries, orderBalances, strategyOrderIntents, executions] =
      await Promise.all([
        this.loadLedgerEntries(filters, scopedOrderIds),
        this.loadOrderBalances(filters, scopedOrderIds),
        this.loadStrategyOrderIntents(filters, strategyKeys),
        this.loadStrategyExecutions(filters),
      ]);
    const midPairs = this.resolveMidPairs(
      filters,
      eligibleOrders,
      trackedOrders,
      [...strategyOrderIntents, ...executions],
    );
    const orderBookMids = midPairs.map(({ exchange, pair }) =>
      this.readOrderBookMid(exchange, pair),
    );
    const perOrderAnalytics =
      filters.scope === 'order' && filters.orderId
        ? await this.buildPerOrderAnalytics(filters, {
            trackedOrders,
            eligibleOrders,
            ledgerEntries,
            orderBalances,
            strategyOrderIntents,
            executions,
            orderBookMids,
          })
        : null;
    const aggregateAnalytics =
      filters.scope === 'pair' || filters.scope === 'admin'
        ? await this.buildAggregateAnalytics(filters, {
            trackedOrders,
            eligibleOrders,
            directMarketMakingOrders,
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
          marketMakingOrders: eligibleOrders.length,
          directMarketMakingOrders: directMarketMakingOrders.length,
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
        marketMakingOrders: eligibleOrders.map((order) =>
          this.serializeMarketMakingOrder(order),
        ),
        directMarketMakingOrders: directMarketMakingOrders.map((order) =>
          this.serializeMarketMakingOrder(order),
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
        aggregate: aggregateAnalytics,
      },
      dataSources: [
        'ledger_entries',
        'order_scoped_balances',
        'tracked_orders',
        'market_making_orders',
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

  async getDirectMarketMakingDashboard(input: AdminAnalyticsQuery = {}) {
    const foundation = await this.getFoundation(input);
    const scopeType = foundation.scope.type;
    const dashboard =
      scopeType === 'order'
        ? this.buildOrderDirectMarketMakingDashboard(foundation)
        : this.buildAggregateDirectMarketMakingDashboard(foundation);

    return {
      generatedAt: foundation.generatedAt,
      scope: foundation.scope,
      range: foundation.range,
      filters: foundation.filters,
      dashboard,
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
    const query =
      this.trackedOrderRepository.createQueryBuilder('trackedOrder');

    this.applyWindow(query, 'trackedOrder', 'updatedAt', filters);
    this.applyOrderFilter(query, 'trackedOrder', filters.orderId);
    this.applyExchangePairFilters(query, 'trackedOrder', filters);

    return await query
      .orderBy('trackedOrder.updatedAt', 'DESC')
      .take(filters.limit)
      .getMany();
  }

  private async loadEligibleMarketMakingOrders(
    filters: ResolvedAnalyticsQuery,
    options: { directMarketMakingOnly?: boolean } = {},
  ): Promise<MarketMakingOrderProjection[]> {
    const query =
      this.marketMakingOrderRepository.createQueryBuilder('marketMakingOrder');

    query.andWhere('marketMakingOrder.state != :deletedState', {
      deletedState: 'deleted',
    });

    if (options.directMarketMakingOnly) {
      query.andWhere('marketMakingOrder.source = :directSource', {
        directSource: 'admin_direct',
      });
    }

    if (filters.orderId) {
      query.andWhere('marketMakingOrder.orderId = :orderId', {
        orderId: filters.orderId,
      });
    }

    if (filters.exchange) {
      query.andWhere('LOWER(marketMakingOrder.exchangeName) = :exchange', {
        exchange: filters.exchange,
      });
    }

    if (filters.pair) {
      query.andWhere('UPPER(marketMakingOrder.pair) = :pair', {
        pair: filters.pair,
      });
    }

    const rows = await query
      .orderBy('marketMakingOrder.createdAt', 'DESC')
      .getMany();

    return this.filterEligibleMarketMakingOrders(
      rows as MarketMakingOrderProjection[],
      filters,
      options,
    );
  }

  private filterEligibleMarketMakingOrders(
    rows: MarketMakingOrderProjection[],
    filters: ResolvedAnalyticsQuery,
    options: { directMarketMakingOnly?: boolean },
  ): MarketMakingOrderProjection[] {
    return rows.filter((order) => {
      if (!order.orderId || order.state === 'deleted') {
        return false;
      }

      if (options.directMarketMakingOnly && order.source !== 'admin_direct') {
        return false;
      }

      if (filters.orderId && order.orderId !== filters.orderId) {
        return false;
      }

      if (
        filters.exchange &&
        String(order.exchangeName || '').toLowerCase() !== filters.exchange
      ) {
        return false;
      }

      if (
        filters.pair &&
        String(order.pair || '').toUpperCase() !== filters.pair
      ) {
        return false;
      }

      return true;
    });
  }

  private async loadLedgerEntries(
    filters: ResolvedAnalyticsQuery,
    scopedOrderIds: string[],
  ): Promise<LedgerEntry[]> {
    const query = this.ledgerEntryRepository.createQueryBuilder('ledgerEntry');

    this.applyWindow(query, 'ledgerEntry', 'createdAt', filters);
    this.applyScopedOrderIds(query, 'ledgerEntry', scopedOrderIds);

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
    this.applyScopedOrderIds(query, 'balance', scopedOrderIds);

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
    scopedOrderIds: string[],
  ) {
    if (scopedOrderIds.length === 0) {
      query.andWhere('1 = 0');

      return;
    }

    query.andWhere(`${alias}.orderId IN (:...orderIds)`, {
      orderIds: scopedOrderIds,
    });
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
    eligibleOrders: MarketMakingOrderProjection[],
  ): string[] {
    if (filters.orderId) {
      return eligibleOrders.some((order) => order.orderId === filters.orderId)
        ? [filters.orderId]
        : [];
    }

    return this.unique(eligibleOrders.map((order) => order.orderId));
  }

  private resolveMidPairs(
    filters: ResolvedAnalyticsQuery,
    eligibleOrders: MarketMakingOrderProjection[],
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

    for (const order of eligibleOrders) {
      add(order.exchangeName, order.pair);
    }

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

    if (!book || !bestBid || !bestAsk || stale) {
      return {
        exchange,
        pair,
        midPrice: null,
        bestBid: bestBid ? bestBid.toFixed() : null,
        bestAsk: bestAsk ? bestAsk.toFixed() : null,
        sequence: book?.sequence ?? null,
        updatedAt: lastUpdateAt ? new Date(lastUpdateAt).toISOString() : null,
        stale,
        unavailableReason:
          !book || !bestBid || !bestAsk
            ? 'order-book-mid-unavailable'
            : 'order-book-mid-stale',
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
      eligibleOrders: MarketMakingOrderProjection[];
      ledgerEntries: LedgerEntry[];
      orderBalances: MarketMakingOrderBalance[];
      strategyOrderIntents: StrategyOrderIntentEntity[];
      executions: StrategyExecutionHistory[];
      orderBookMids: Array<
        ReturnType<AdminAnalyticsService['readOrderBookMid']>
      >;
    },
  ) {
    const performance = await this.performanceService.getOrderPerformance(
      filters.orderId!,
    );
    const market = this.resolveOrderMarket(
      filters,
      sources.trackedOrders,
      sources.eligibleOrders,
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
        ? inventoryBaseQty.multipliedBy(
            markPrice.minus(inventoryAverageCostQuote),
          )
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
        ...this.metricFromNullable(
          markPrice,
          quoteCurrency,
          markUnavailableReason,
        ),
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
        'market_making_orders',
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
    eligibleOrders: MarketMakingOrderProjection[],
    executions: StrategyExecutionHistory[],
    intents: StrategyOrderIntentEntity[],
  ): { exchange: string | null; pair: string | null } {
    const firstTracked = trackedOrders.find((order) => order.orderId);
    const matchedOrder = filters.orderId
      ? eligibleOrders.find((order) => order.orderId === filters.orderId)
      : eligibleOrders[0];
    const firstExecution = executions.find((execution) => execution.orderId);
    const firstIntent = intents[0];

    return {
      exchange:
        filters.exchange ||
        matchedOrder?.exchangeName?.toLowerCase() ||
        firstTracked?.exchange?.toLowerCase() ||
        firstExecution?.exchange?.toLowerCase() ||
        firstIntent?.exchange?.toLowerCase() ||
        null,
      pair:
        filters.pair ||
        matchedOrder?.pair?.toUpperCase() ||
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
      (mid) => mid.exchange === market.exchange && mid.pair === market.pair,
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

  private async buildAggregateAnalytics(
    filters: ResolvedAnalyticsQuery,
    sources: {
      trackedOrders: TrackedOrderProjection[];
      eligibleOrders: MarketMakingOrderProjection[];
      directMarketMakingOrders: MarketMakingOrderProjection[];
      strategyOrderIntents: StrategyOrderIntentEntity[];
      executions: StrategyExecutionHistory[];
      orderBookMids: Array<
        ReturnType<AdminAnalyticsService['readOrderBookMid']>
      >;
    },
  ) {
    const eligibleOrderIds = this.unique(
      sources.eligibleOrders.map((order) => order.orderId),
    );
    const directMarketMakingOrderIds = this.unique(
      sources.directMarketMakingOrders.map((order) => order.orderId),
    );
    const scopedTrackedOrders = this.filterTrackedOrdersForAggregate(
      filters,
      sources.trackedOrders,
      eligibleOrderIds,
    );
    const directMarketMakingTrackedOrders =
      this.filterTrackedOrdersForAggregate(
        filters,
        sources.trackedOrders,
        directMarketMakingOrderIds,
      );
    const snapshots: OrderAggregateSnapshot[] = [];

    for (const orderId of eligibleOrderIds) {
      const sourceOrder = sources.eligibleOrders.find(
        (order) => order.orderId === orderId,
      );
      const performance = await this.performanceService.getOrderPerformance(
        orderId,
      );
      const orderTrackedOrders = scopedTrackedOrders.filter(
        (order) => order.orderId === orderId,
      );
      const market = this.resolveAggregateOrderMarket(
        filters,
        orderId,
        orderTrackedOrders,
        sources.executions,
        sourceOrder,
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
      const markPrice =
        mark.midPrice !== null ? this.toPositiveDecimal(mark.midPrice) : null;
      const markUnavailableReason =
        mark.unavailableReason ||
        (!market.exchange || !market.pair
          ? 'order-market-pair-unavailable'
          : 'order-book-mid-unavailable');
      const unrealizedPnlQuote =
        markPrice && inventoryAverageCostQuote
          ? inventoryBaseQty.multipliedBy(
              markPrice.minus(inventoryAverageCostQuote),
            )
          : null;
      const inventoryNotionalQuote = markPrice
        ? inventoryBaseQty.multipliedBy(markPrice)
        : null;

      snapshots.push({
        orderId,
        exchange: market.exchange,
        pair: market.pair,
        baseAsset: baseCurrency,
        quoteAsset: quoteCurrency,
        realizedPnlQuote: this.toDecimal(performance.summary.realizedPnlQuote),
        feesQuote: this.toDecimal(performance.summary.feesQuote),
        realizedNetPnlQuote: this.toDecimal(performance.summary.netPnlQuote),
        unrealizedPnlQuote,
        inventoryBaseQty,
        inventoryCostQuote,
        inventoryNotionalQuote,
        tradedQuoteVolume: this.toDecimal(
          performance.summary.tradedQuoteVolume,
        ),
        fillCount: performance.summary.fillCount,
        series: performance.series,
        markUnavailableReason:
          unrealizedPnlQuote && inventoryNotionalQuote
            ? null
            : markUnavailableReason,
      });
    }

    const directMarketMakingSnapshots = snapshots.filter((snapshot) =>
      directMarketMakingOrderIds.includes(snapshot.orderId),
    );

    const quoteCurrency = this.resolveCommonCurrency(
      snapshots.map((snapshot) => snapshot.quoteAsset),
    );
    const crossCurrencyAggregate =
      this.hasIncompatibleQuoteCurrencies(snapshots);
    const crossCurrencyMetric = this.unavailableMetric(
      null,
      'cross-currency-aggregate-unavailable',
    );
    const realizedPnlQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.realizedPnlQuote),
    );
    const feesQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.feesQuote),
    );
    const realizedNetPnlQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.realizedNetPnlQuote),
    );
    const tradedQuoteVolume = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.tradedQuoteVolume),
    );
    const inventoryCostQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.inventoryCostQuote),
    );
    const fillCount = snapshots.reduce(
      (total, snapshot) => total + snapshot.fillCount,
      0,
    );
    const markDependentUnavailable = snapshots.some(
      (snapshot) =>
        !snapshot.inventoryBaseQty.isZero() &&
        (!snapshot.unrealizedPnlQuote || !snapshot.inventoryNotionalQuote),
    );
    const markUnavailableReason =
      snapshots.find((snapshot) => snapshot.markUnavailableReason)
        ?.markUnavailableReason || 'aggregate-mark-price-unavailable';
    const unrealizedPnlQuote = markDependentUnavailable
      ? null
      : this.sumDecimals(
          snapshots.map(
            (snapshot) => snapshot.unrealizedPnlQuote || new BigNumber(0),
          ),
        );
    const inventoryNotionalQuote = markDependentUnavailable
      ? null
      : this.sumDecimals(
          snapshots.map(
            (snapshot) => snapshot.inventoryNotionalQuote || new BigNumber(0),
          ),
        );
    const netPnlQuote = unrealizedPnlQuote
      ? realizedNetPnlQuote.plus(unrealizedPnlQuote)
      : null;
    const pnlSeries = crossCurrencyAggregate
      ? []
      : this.buildAggregatePnlSeries(snapshots);
    const fillRate = this.buildFillRate(
      filters,
      scopedTrackedOrders,
      sources.strategyOrderIntents,
    );
    const quoteUptime = this.buildQuoteUptime(filters, scopedTrackedOrders);
    const spreadCaptureQuote = this.availableMetric(
      realizedPnlQuote,
      quoteCurrency,
    );
    const feeCost = this.availableMetric(feesQuote, quoteCurrency);
    const inventoryExposureNotional = this.metricFromNullable(
      inventoryNotionalQuote,
      quoteCurrency,
      markUnavailableReason,
    );

    return {
      scope: {
        type: filters.scope,
        exchange: filters.exchange || null,
        pair: filters.pair || null,
      },
      eligibleOrderIds,
      orderCount: eligibleOrderIds.length,
      pnl: {
        realized: crossCurrencyAggregate
          ? crossCurrencyMetric
          : this.availableMetric(realizedPnlQuote, quoteCurrency),
        unrealized: crossCurrencyAggregate
          ? crossCurrencyMetric
          : this.metricFromNullable(
              unrealizedPnlQuote,
              quoteCurrency,
              markUnavailableReason,
            ),
        net: crossCurrencyAggregate
          ? crossCurrencyMetric
          : this.metricFromNullable(
              netPnlQuote,
              quoteCurrency,
              markUnavailableReason,
            ),
        realizedNet: crossCurrencyAggregate
          ? crossCurrencyMetric
          : this.availableMetric(realizedNetPnlQuote, quoteCurrency),
      },
      fees: {
        total: crossCurrencyAggregate ? crossCurrencyMetric : feeCost,
      },
      inventoryExposure: {
        quantityByAsset: this.aggregateInventoryQuantityByAsset(snapshots),
        costBasis: crossCurrencyAggregate
          ? crossCurrencyMetric
          : this.availableMetric(inventoryCostQuote, quoteCurrency),
        notional: crossCurrencyAggregate
          ? crossCurrencyMetric
          : inventoryExposureNotional,
      },
      spreadCapture: {
        quote: crossCurrencyAggregate
          ? crossCurrencyMetric
          : spreadCaptureQuote,
        tradedQuoteVolume: crossCurrencyAggregate
          ? crossCurrencyMetric
          : this.availableMetric(tradedQuoteVolume, quoteCurrency),
        fillCount,
        effectiveSpreadBps:
          !crossCurrencyAggregate && tradedQuoteVolume.isGreaterThan(0)
            ? realizedPnlQuote
                .dividedBy(tradedQuoteVolume)
                .multipliedBy(10000)
                .toFixed()
            : null,
      },
      fillRate,
      quoteUptime,
      pnlSeries,
      drawdown: crossCurrencyAggregate
        ? this.unavailableDrawdown('cross-currency-aggregate-unavailable')
        : this.buildDrawdown(pnlSeries, quoteCurrency),
      quoteCurrencyBreakdown: this.buildQuoteCurrencyBreakdown(snapshots),
      directMarketMakingOrderIds,
      directMarketMakingTotals: this.buildDirectMarketMakingAggregateTotals(
        filters,
        directMarketMakingSnapshots,
        directMarketMakingTrackedOrders,
        sources.strategyOrderIntents,
        directMarketMakingOrderIds,
      ),
      dataSources: [
        'performance_service_order_performance',
        'market_making_orders',
        'tracked_orders',
        'strategy_order_intents',
        'order_book_tracker_mid',
      ],
    };
  }

  private buildDirectMarketMakingAggregateTotals(
    filters: ResolvedAnalyticsQuery,
    snapshots: OrderAggregateSnapshot[],
    trackedOrders: TrackedOrderProjection[],
    intents: StrategyOrderIntentEntity[],
    eligibleOrderIds: string[],
  ) {
    const quoteCurrency = this.resolveCommonCurrency(
      snapshots.map((snapshot) => snapshot.quoteAsset),
    );
    const crossCurrencyAggregate =
      this.hasIncompatibleQuoteCurrencies(snapshots);
    const crossCurrencyMetric = this.unavailableMetric(
      null,
      'cross-currency-aggregate-unavailable',
    );
    const realizedPnlQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.realizedPnlQuote),
    );
    const feesQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.feesQuote),
    );
    const realizedNetPnlQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.realizedNetPnlQuote),
    );
    const inventoryCostQuote = this.sumDecimals(
      snapshots.map((snapshot) => snapshot.inventoryCostQuote),
    );
    const markDependentUnavailable = snapshots.some(
      (snapshot) =>
        !snapshot.inventoryBaseQty.isZero() &&
        (!snapshot.unrealizedPnlQuote || !snapshot.inventoryNotionalQuote),
    );
    const markUnavailableReason =
      snapshots.find((snapshot) => snapshot.markUnavailableReason)
        ?.markUnavailableReason || 'aggregate-mark-price-unavailable';
    const unrealizedPnlQuote = markDependentUnavailable
      ? null
      : this.sumDecimals(
          snapshots.map(
            (snapshot) => snapshot.unrealizedPnlQuote || new BigNumber(0),
          ),
        );
    const netPnlQuote = unrealizedPnlQuote
      ? realizedNetPnlQuote.plus(unrealizedPnlQuote)
      : null;
    const inventoryNotionalQuote = markDependentUnavailable
      ? null
      : this.sumDecimals(
          snapshots.map(
            (snapshot) => snapshot.inventoryNotionalQuote || new BigNumber(0),
          ),
        );
    const inventoryExposure = this.metricFromNullable(
      inventoryNotionalQuote,
      quoteCurrency,
      markUnavailableReason,
    );

    return {
      orderIds: snapshots.map((snapshot) => snapshot.orderId),
      realizedPnl: crossCurrencyAggregate
        ? crossCurrencyMetric
        : this.availableMetric(realizedPnlQuote, quoteCurrency),
      unrealizedPnl: crossCurrencyAggregate
        ? crossCurrencyMetric
        : this.metricFromNullable(
            unrealizedPnlQuote,
            quoteCurrency,
            markUnavailableReason,
          ),
      netPnl: crossCurrencyAggregate
        ? crossCurrencyMetric
        : this.metricFromNullable(
            netPnlQuote,
            quoteCurrency,
            markUnavailableReason,
          ),
      feeCost: crossCurrencyAggregate
        ? crossCurrencyMetric
        : this.availableMetric(feesQuote, quoteCurrency),
      spreadCapture: crossCurrencyAggregate
        ? crossCurrencyMetric
        : this.availableMetric(realizedPnlQuote, quoteCurrency),
      inventorySkew: this.buildInventorySkew({
        quantityByAsset: this.aggregateInventoryQuantityByAsset(snapshots),
        costBasis: crossCurrencyAggregate
          ? crossCurrencyMetric
          : this.availableMetric(inventoryCostQuote, quoteCurrency),
        notional: crossCurrencyAggregate
          ? crossCurrencyMetric
          : inventoryExposure,
      }),
      inventoryExposure: crossCurrencyAggregate
        ? crossCurrencyMetric
        : inventoryExposure,
      fillRate: this.buildFillRate(filters, trackedOrders, intents, {
        eligibleOrderIds,
        requireIntentOrderAttribution: true,
      }),
      quoteUptime: this.buildQuoteUptime(filters, trackedOrders),
      quoteCurrencyBreakdown: this.buildQuoteCurrencyBreakdown(snapshots),
    };
  }

  private filterTrackedOrdersForAggregate(
    filters: ResolvedAnalyticsQuery,
    trackedOrders: TrackedOrderProjection[],
    eligibleOrderIds: string[],
  ): TrackedOrderProjection[] {
    return trackedOrders.filter((order) => {
      if (!order.orderId) {
        return false;
      }

      if (!eligibleOrderIds.includes(order.orderId)) {
        return false;
      }

      if (
        filters.exchange &&
        String(order.exchange || '').toLowerCase() !== filters.exchange
      ) {
        return false;
      }

      if (
        filters.pair &&
        String(order.pair || '').toUpperCase() !== filters.pair
      ) {
        return false;
      }

      return true;
    });
  }

  private resolveAggregateOrderMarket(
    filters: ResolvedAnalyticsQuery,
    orderId: string,
    trackedOrders: TrackedOrderProjection[],
    executions: StrategyExecutionHistory[],
    marketMakingOrder?: MarketMakingOrderProjection,
  ): { exchange: string | null; pair: string | null } {
    const firstTracked = trackedOrders[0];
    const firstExecution = executions.find(
      (execution) => execution.orderId === orderId,
    );

    return {
      exchange:
        filters.exchange ||
        marketMakingOrder?.exchangeName?.toLowerCase() ||
        firstTracked?.exchange?.toLowerCase() ||
        firstExecution?.exchange?.toLowerCase() ||
        null,
      pair:
        filters.pair ||
        marketMakingOrder?.pair?.toUpperCase() ||
        firstTracked?.pair?.toUpperCase() ||
        firstExecution?.pair?.toUpperCase() ||
        null,
    };
  }

  private buildAggregatePnlSeries(snapshots: OrderAggregateSnapshot[]) {
    const pointsByOrder = new Map<
      string,
      Array<{ t: string; realized: string; fees: string; net: string }>
    >();
    const timestamps = new Set<string>();

    for (const snapshot of snapshots) {
      const points = [...snapshot.series].sort((left, right) =>
        left.t.localeCompare(right.t),
      );

      pointsByOrder.set(snapshot.orderId, points);
      for (const point of points) {
        timestamps.add(point.t);
      }
    }

    const latestByOrder = new Map<
      string,
      { realized: BigNumber; fees: BigNumber; net: BigNumber }
    >();
    const cursors = new Map<string, number>();

    return [...timestamps]
      .sort((left, right) => left.localeCompare(right))
      .map((timestamp) => {
        for (const snapshot of snapshots) {
          const points = pointsByOrder.get(snapshot.orderId) || [];
          let cursor = cursors.get(snapshot.orderId) || 0;

          while (
            cursor < points.length &&
            points[cursor].t.localeCompare(timestamp) <= 0
          ) {
            latestByOrder.set(snapshot.orderId, {
              realized: this.toDecimal(points[cursor].realized),
              fees: this.toDecimal(points[cursor].fees),
              net: this.toDecimal(points[cursor].net),
            });
            cursor += 1;
          }

          cursors.set(snapshot.orderId, cursor);
        }

        const totals = [...latestByOrder.values()].reduce(
          (accumulator, point) => ({
            realized: accumulator.realized.plus(point.realized),
            fees: accumulator.fees.plus(point.fees),
            net: accumulator.net.plus(point.net),
          }),
          {
            realized: new BigNumber(0),
            fees: new BigNumber(0),
            net: new BigNumber(0),
          },
        );

        return {
          t: timestamp,
          realized: totals.realized.toFixed(),
          fees: totals.fees.toFixed(),
          net: totals.net.toFixed(),
        };
      });
  }

  private buildFillRate(
    filters: ResolvedAnalyticsQuery,
    trackedOrders: TrackedOrderProjection[],
    intents: StrategyOrderIntentEntity[],
    options: {
      eligibleOrderIds?: string[];
      requireIntentOrderAttribution?: boolean;
    } = {},
  ) {
    const strategyKeys = new Set(
      trackedOrders.map((order) => order.strategyKey).filter(Boolean),
    );
    const eligibleOrderIds = options.eligibleOrderIds
      ? new Set(options.eligibleOrderIds)
      : null;
    const candidateIntents = intents.filter((intent) => {
      if (
        strategyKeys.size > 0 &&
        !strategyKeys.has(String(intent.strategyKey || ''))
      ) {
        return false;
      }

      if (
        filters.exchange &&
        String(intent.exchange || '').toLowerCase() !== filters.exchange
      ) {
        return false;
      }

      if (
        filters.pair &&
        String(intent.pair || '').toUpperCase() !== filters.pair
      ) {
        return false;
      }

      return true;
    });
    const scopedIntents = eligibleOrderIds
      ? candidateIntents.filter((intent) => {
          const orderId = this.resolveIntentOrderId(intent);

          return orderId !== null && eligibleOrderIds.has(orderId);
        })
      : candidateIntents;
    const unattributedStrategyOrderIntents = eligibleOrderIds
      ? candidateIntents.filter(
          (intent) => this.resolveIntentOrderId(intent) === null,
        ).length
      : 0;
    const totalQuotes =
      trackedOrders.length > 0 ? trackedOrders.length : scopedIntents.length;
    const filledQuotes = trackedOrders.filter((order) =>
      this.toDecimal(order.cumulativeFilledQty).isGreaterThan(0),
    ).length;

    if (
      trackedOrders.length === 0 &&
      options.requireIntentOrderAttribution &&
      unattributedStrategyOrderIntents > 0
    ) {
      return {
        ...this.unavailableMetric(
          null,
          'strategy-order-intent-order-attribution-unavailable',
        ),
        filledQuotes,
        totalQuotes: 0,
        denominator: {
          source: 'strategy_order_intents',
          filledSource: 'tracked_orders',
          eligibleTrackedOrders: trackedOrders.length,
          eligibleStrategyOrderIntents: scopedIntents.length,
          unattributedStrategyOrderIntents,
          description:
            'Strategy order intents are used only when each fallback intent can be attributed to the same eligible order set as tracked orders and snapshots.',
        },
      };
    }

    const value =
      totalQuotes > 0
        ? new BigNumber(filledQuotes).dividedBy(totalQuotes)
        : new BigNumber(0);

    return {
      ...this.availableMetric(value, null),
      filledQuotes,
      totalQuotes,
      denominator: {
        source:
          trackedOrders.length > 0
            ? 'tracked_orders'
            : 'strategy_order_intents',
        filledSource: 'tracked_orders',
        eligibleTrackedOrders: trackedOrders.length,
        eligibleStrategyOrderIntents: scopedIntents.length,
        unattributedStrategyOrderIntents,
        description:
          'Filled tracked orders divided by eligible placed tracked orders for the same scope/range; strategy order intents are used only when tracked orders are unavailable.',
      },
    };
  }

  private resolveIntentOrderId(intent: StrategyOrderIntentEntity) {
    const metadata = intent.metadata;

    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const orderId = metadata.orderId ?? metadata.marketMakingOrderId;

    if (typeof orderId !== 'string') {
      return null;
    }

    const normalized = orderId.trim();

    return normalized || null;
  }

  private buildQuoteUptime(
    filters: ResolvedAnalyticsQuery,
    trackedOrders: TrackedOrderProjection[],
  ) {
    const startedAtMs = Date.parse(filters.startedAt);
    const endedAtMs = Date.parse(filters.endedAt);
    const windowMs = Math.max(endedAtMs - startedAtMs, 0);
    const intervals = trackedOrders
      .map((order) => ({
        start: Math.max(Date.parse(order.createdAt || ''), startedAtMs),
        end: Math.min(Date.parse(order.updatedAt || ''), endedAtMs),
      }))
      .filter(
        (interval) =>
          Number.isFinite(interval.start) &&
          Number.isFinite(interval.end) &&
          interval.end > interval.start,
      )
      .sort((left, right) => left.start - right.start);
    const merged: Array<{ start: number; end: number }> = [];

    for (const interval of intervals) {
      const previous = merged[merged.length - 1];

      if (!previous || interval.start > previous.end) {
        merged.push({ ...interval });
        continue;
      }

      previous.end = Math.max(previous.end, interval.end);
    }

    const activeMs = merged.reduce(
      (total, interval) => total + interval.end - interval.start,
      0,
    );
    const value =
      windowMs > 0
        ? BigNumber.min(
            new BigNumber(activeMs).dividedBy(windowMs),
            new BigNumber(1),
          )
        : new BigNumber(0);

    return {
      ...this.availableMetric(value, null),
      activeMs,
      windowMs,
    };
  }

  private buildOrderDirectMarketMakingDashboard(foundation: {
    scope: {
      type: AnalyticsScope;
      orderId: string | null;
      exchange: string | null;
      pair: string | null;
    };
    range: { startedAt: string; endedAt: string };
    analytics: { perOrder: any };
    sources: {
      trackedOrders: Array<Record<string, unknown>>;
      strategyOrderIntents: Array<Record<string, unknown>>;
      directMarketMakingOrders: Array<Record<string, unknown>>;
    };
  }) {
    const perOrder = foundation.analytics.perOrder;
    const directOrder = foundation.sources.directMarketMakingOrders.find(
      (order) => order.orderId === foundation.scope.orderId,
    );

    if (!perOrder || !directOrder) {
      throw new BadRequestException(
        'Direct Market Making dashboard order analytics require a non-deleted admin_direct order.',
      );
    }

    return {
      scope: {
        type: 'order' as const,
        orderId: foundation.scope.orderId,
        exchange: perOrder.exchange,
        pair: perOrder.pair,
      },
      orderIds: [perOrder.orderId],
      costRevenue: {
        spreadCapture: perOrder.spreadCapture.quote,
        feeCost: perOrder.fees.total,
        inventorySkew: this.buildInventorySkew({
          quantity: perOrder.inventoryExposure.quantity,
          costBasis: perOrder.inventoryExposure.costBasis,
          notional: perOrder.inventoryExposure.notional,
        }),
        realizedPnl: perOrder.pnl.realized,
        unrealizedPnl: perOrder.pnl.unrealized,
        netPnl: perOrder.pnl.net,
        fillRate: this.buildDirectOrderFillRate(foundation.sources),
        quoteUptime: this.buildDirectOrderQuoteUptime(
          foundation.range,
          foundation.sources.trackedOrders,
        ),
      },
      sources: [
        'performance_service_order_performance',
        'tracked_orders',
        'strategy_order_intents',
        'order_book_tracker_mid',
      ],
    };
  }

  private buildAggregateDirectMarketMakingDashboard(foundation: {
    scope: {
      type: AnalyticsScope;
      orderId: string | null;
      exchange: string | null;
      pair: string | null;
    };
    analytics: { aggregate: any };
  }) {
    const aggregate = foundation.analytics.aggregate;

    if (!aggregate) {
      throw new BadRequestException(
        'Direct Market Making dashboard aggregate analytics are unavailable.',
      );
    }

    return {
      scope: {
        type: foundation.scope.type,
        orderId: null,
        exchange: foundation.scope.exchange,
        pair: foundation.scope.pair,
      },
      orderIds: aggregate.directMarketMakingTotals.orderIds,
      costRevenue: {
        spreadCapture: aggregate.directMarketMakingTotals.spreadCapture,
        feeCost: aggregate.directMarketMakingTotals.feeCost,
        inventorySkew: aggregate.directMarketMakingTotals.inventorySkew,
        realizedPnl: aggregate.directMarketMakingTotals.realizedPnl,
        unrealizedPnl: aggregate.directMarketMakingTotals.unrealizedPnl,
        netPnl: aggregate.directMarketMakingTotals.netPnl,
        fillRate: aggregate.directMarketMakingTotals.fillRate,
        quoteUptime: aggregate.directMarketMakingTotals.quoteUptime,
        quoteCurrencyBreakdown:
          aggregate.directMarketMakingTotals.quoteCurrencyBreakdown,
      },
      sources: [
        'performance_service_order_performance',
        'market_making_orders',
        'tracked_orders',
        'strategy_order_intents',
        'order_book_tracker_mid',
      ],
    };
  }

  private buildInventorySkew(input: {
    quantity?: DecimalMetric;
    quantityByAsset?: Array<{ asset: string; quantity: string }>;
    costBasis: DecimalMetric;
    notional: DecimalMetric;
  }) {
    return {
      status: input.notional.status,
      unavailableReason: input.notional.unavailableReason,
      quantity: input.quantity,
      quantityByAsset: input.quantityByAsset,
      costBasis: input.costBasis,
      notional: input.notional,
    };
  }

  private buildDirectOrderFillRate(sources: {
    trackedOrders: Array<Record<string, unknown>>;
    strategyOrderIntents: Array<Record<string, unknown>>;
  }) {
    const trackedOrders = sources.trackedOrders || [];
    const totalQuotes =
      trackedOrders.length > 0
        ? trackedOrders.length
        : sources.strategyOrderIntents.length;
    const filledQuotes = trackedOrders.filter((order) =>
      this.toDecimal(order.cumulativeFilledQty).isGreaterThan(0),
    ).length;
    const value =
      totalQuotes > 0
        ? new BigNumber(filledQuotes).dividedBy(totalQuotes)
        : new BigNumber(0);

    return {
      ...this.availableMetric(value, null),
      filledQuotes,
      totalQuotes,
      denominator: {
        source:
          trackedOrders.length > 0
            ? 'tracked_orders'
            : 'strategy_order_intents',
        filledSource: 'tracked_orders',
        eligibleTrackedOrders: trackedOrders.length,
        eligibleStrategyOrderIntents: sources.strategyOrderIntents.length,
        description:
          'Filled tracked orders divided by eligible placed tracked orders for the same scope/range; strategy order intents are used only when tracked orders are unavailable.',
      },
    };
  }

  private buildDirectOrderQuoteUptime(
    range: { startedAt: string; endedAt: string },
    trackedOrders: Array<Record<string, unknown>>,
  ) {
    return this.buildQuoteUptime(
      {
        scope: 'order',
        startedAt: range.startedAt,
        endedAt: range.endedAt,
        limit: trackedOrders.length || DEFAULT_LIMIT,
        rangeKey: 'custom',
      },
      trackedOrders as TrackedOrderProjection[],
    );
  }

  private aggregateInventoryQuantityByAsset(
    snapshots: OrderAggregateSnapshot[],
  ) {
    const byAsset = new Map<string, BigNumber>();

    for (const snapshot of snapshots) {
      if (!snapshot.baseAsset) {
        continue;
      }

      byAsset.set(
        snapshot.baseAsset,
        (byAsset.get(snapshot.baseAsset) || new BigNumber(0)).plus(
          snapshot.inventoryBaseQty,
        ),
      );
    }

    return [...byAsset.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([asset, quantity]) => ({ asset, quantity: quantity.toFixed() }));
  }

  private hasIncompatibleQuoteCurrencies(snapshots: OrderAggregateSnapshot[]) {
    return (
      this.unique(
        snapshots
          .map((snapshot) => snapshot.quoteAsset)
          .filter(Boolean) as string[],
      ).length > 1
    );
  }

  private buildQuoteCurrencyBreakdown(snapshots: OrderAggregateSnapshot[]) {
    const snapshotsByCurrency = new Map<string, OrderAggregateSnapshot[]>();

    for (const snapshot of snapshots) {
      if (!snapshot.quoteAsset) {
        continue;
      }

      snapshotsByCurrency.set(snapshot.quoteAsset, [
        ...(snapshotsByCurrency.get(snapshot.quoteAsset) || []),
        snapshot,
      ]);
    }

    return [...snapshotsByCurrency.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([quoteCurrency, currencySnapshots]) => {
        const realizedPnlQuote = this.sumDecimals(
          currencySnapshots.map((snapshot) => snapshot.realizedPnlQuote),
        );
        const feesQuote = this.sumDecimals(
          currencySnapshots.map((snapshot) => snapshot.feesQuote),
        );
        const realizedNetPnlQuote = this.sumDecimals(
          currencySnapshots.map((snapshot) => snapshot.realizedNetPnlQuote),
        );
        const tradedQuoteVolume = this.sumDecimals(
          currencySnapshots.map((snapshot) => snapshot.tradedQuoteVolume),
        );
        const inventoryCostQuote = this.sumDecimals(
          currencySnapshots.map((snapshot) => snapshot.inventoryCostQuote),
        );
        const markDependentUnavailable = currencySnapshots.some(
          (snapshot) =>
            !snapshot.inventoryBaseQty.isZero() &&
            (!snapshot.unrealizedPnlQuote || !snapshot.inventoryNotionalQuote),
        );
        const markUnavailableReason =
          currencySnapshots.find((snapshot) => snapshot.markUnavailableReason)
            ?.markUnavailableReason || 'aggregate-mark-price-unavailable';
        const unrealizedPnlQuote = markDependentUnavailable
          ? null
          : this.sumDecimals(
              currencySnapshots.map(
                (snapshot) => snapshot.unrealizedPnlQuote || new BigNumber(0),
              ),
            );
        const inventoryNotionalQuote = markDependentUnavailable
          ? null
          : this.sumDecimals(
              currencySnapshots.map(
                (snapshot) =>
                  snapshot.inventoryNotionalQuote || new BigNumber(0),
              ),
            );
        const netPnlQuote = unrealizedPnlQuote
          ? realizedNetPnlQuote.plus(unrealizedPnlQuote)
          : null;

        return {
          quoteCurrency,
          orderIds: currencySnapshots.map((snapshot) => snapshot.orderId),
          realizedPnl: this.availableMetric(realizedPnlQuote, quoteCurrency),
          unrealizedPnl: this.metricFromNullable(
            unrealizedPnlQuote,
            quoteCurrency,
            markUnavailableReason,
          ),
          netPnl: this.metricFromNullable(
            netPnlQuote,
            quoteCurrency,
            markUnavailableReason,
          ),
          feeCost: this.availableMetric(feesQuote, quoteCurrency),
          realizedNetPnl: this.availableMetric(
            realizedNetPnlQuote,
            quoteCurrency,
          ),
          spreadCapture: this.availableMetric(realizedPnlQuote, quoteCurrency),
          tradedQuoteVolume: this.availableMetric(
            tradedQuoteVolume,
            quoteCurrency,
          ),
          inventoryCostBasis: this.availableMetric(
            inventoryCostQuote,
            quoteCurrency,
          ),
          inventoryNotional: this.metricFromNullable(
            inventoryNotionalQuote,
            quoteCurrency,
            markUnavailableReason,
          ),
        };
      });
  }

  private resolveCommonCurrency(currencies: Array<string | null>) {
    const uniqueCurrencies = this.unique(
      currencies.filter(Boolean) as string[],
    );

    return uniqueCurrencies.length === 1 ? uniqueCurrencies[0] : null;
  }

  private sumDecimals(values: BigNumber[]): BigNumber {
    return values.reduce((total, value) => total.plus(value), new BigNumber(0));
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

  private unavailableDrawdown(unavailableReason: string) {
    return {
      status: 'unavailable' as const,
      maxDrawdownQuote: null,
      currency: null,
      peakAt: null,
      troughAt: null,
      series: [],
      unavailableReason,
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
      sourceRef: {
        type: string;
        id: string;
      };
      metadata?: Record<string, unknown> | null;
    }> = [];

    for (const intent of sources.strategyOrderIntents) {
      events.push({
        id: `intent:${intent.intentId}`,
        type: 'quote',
        at: this.normalizeTimestamp(intent.createdAt),
        source: 'strategy_order_intent',
        sourceId: intent.intentId,
        sourceRef: {
          type: 'strategy_order_intent',
          id: intent.intentId,
        },
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
          sourceRef: {
            type: 'tracked_order',
            id: order.trackingKey,
          },
          status: order.status || null,
          side: order.side || null,
          price: this.serializeNullableDecimal(order.price),
          qty: filledQty.toFixed(),
        });
      }

      if (
        String(order.status || '')
          .toLowerCase()
          .includes('cancel')
      ) {
        events.push({
          id: `tracked:${order.trackingKey}:cancel`,
          type: 'cancel',
          at: this.normalizeTimestamp(order.updatedAt),
          source: 'tracked_order',
          sourceId: order.trackingKey,
          sourceRef: {
            type: 'tracked_order',
            id: order.trackingKey,
          },
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
        sourceRef: {
          type: 'strategy_execution_history',
          id: execution.id,
        },
        status: execution.status || null,
        side: execution.side || null,
        price: this.serializeNullableDecimal(execution.price),
        qty: this.serializeNullableDecimal(execution.amount),
        metadata: execution.metadata ?? null,
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
        sourceRef: {
          type: 'ledger_entry',
          id: entry.entryId,
        },
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

  private unavailableMetric(
    currency: string | null,
    unavailableReason: string,
  ): DecimalMetric {
    return {
      status: 'unavailable',
      value: null,
      currency,
      unavailableReason,
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

  private serializeMarketMakingOrder(order: MarketMakingOrderProjection) {
    return {
      orderId: order.orderId,
      exchange: order.exchangeName?.toLowerCase() || null,
      pair: order.pair?.toUpperCase() || null,
      source: order.source,
      state: order.state,
      createdAt: this.normalizeTimestamp(order.createdAt),
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
      metadata: execution.metadata ?? null,
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
      base: String(base || '')
        .trim()
        .toUpperCase(),
      quote: String(quote || '')
        .trim()
        .toUpperCase(),
    };
  }

  private unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }
}

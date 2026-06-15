import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import {
  LedgerEntry,
  LedgerEntryType,
} from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { In, Repository } from 'typeorm';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_PAGE = 1000;
const MAX_QUERY_LENGTH = 100;
const MAX_TOKEN_LENGTH = 64;
const METADATA_SCAN_LIMIT = 500;
const ACTIVE_MARKET_MAKING_ORDER_STATES = new Set(['running']);
const RISK_RELEVANT_TRACKED_ORDER_STATUSES = new Set([
  'pending_create',
  'open',
  'partially_filled',
  'pending_cancel',
]);

const LEDGER_ENTRY_TYPES: LedgerEntryType[] = [
  'deposit_credit',
  'reserve_lock',
  'reserve_release',
  'fill_settle',
  'fee_debit',
  'withdraw_debit',
  'allocation_release',
  'reward_credit',
  'reversal',
];

const UNAVAILABLE_PNL_REASON =
  'PnL metrics are unavailable because order-scoped balances do not include supported cost basis or mark-price valuation data.';

export interface AdminLedgerBalancesQuery {
  exchange?: string;
  asset?: string;
  query?: string;
  limit?: string;
  page?: string;
}

export interface AdminLedgerEntriesQuery {
  type?: string;
  asset?: string;
  query?: string;
  limit?: string;
  page?: string;
}

type BalanceFilters = {
  exchange?: string;
  asset?: string;
  query?: string;
};

type EntryFilters = {
  type?: LedgerEntryType;
  asset?: string;
  query?: string;
};

@Injectable()
export class AdminLedgerService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(GrowdataMarketMakingPair)
    private readonly marketMakingPairRepository: Repository<GrowdataMarketMakingPair>,
    @InjectRepository(TrackedOrderEntity)
    private readonly trackedOrderRepository: Repository<TrackedOrderEntity>,
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository: Repository<StrategyInstance>,
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository: Repository<MarketMakingOrder>,
  ) {}

  async getSummary() {
    const assetSymbols = await this.buildAssetSymbolMap();
    const [totalEntries, byTypeRaw, lastEntry, totalBalances, balanceRows] =
      await Promise.all([
        this.ledgerEntryRepository.count(),
        this.ledgerEntryRepository
          .createQueryBuilder('entry')
          .select('entry.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .groupBy('entry.type')
          .getRawMany<{ type: string; count: string | number }>(),
        this.ledgerEntryRepository.findOne({
          where: {},
          order: { createdAt: 'DESC', entryId: 'DESC' },
        }),
        this.orderBalanceRepository.count(),
        this.orderBalanceRepository.find({
          order: { updatedAt: 'DESC', orderId: 'ASC', assetId: 'ASC' },
          take: METADATA_SCAN_LIMIT,
        }),
      ]);

    const byTypeCounts = new Map<string, number>();

    for (const row of byTypeRaw) {
      byTypeCounts.set(String(row.type), Number(row.count) || 0);
    }

    const health = this.evaluateBalanceHealth(balanceRows);

    return {
      generatedAt: getRFC3339Timestamp(),
      entries: {
        total: totalEntries,
        lastEntryAt: this.normalizeTimestamp(lastEntry?.createdAt),
        byType: LEDGER_ENTRY_TYPES.map((type) => ({
          type,
          count: byTypeCounts.get(type) || 0,
        })),
      },
      balances: {
        total: totalBalances,
        scannedRows: balanceRows.length,
        truncated: totalBalances > balanceRows.length,
        invariantViolations: health.invariantViolations,
        negativeBalances: health.negativeBalances,
        healthy:
          health.invariantViolations === 0 && health.negativeBalances === 0,
        byAsset: this.aggregateByAsset(balanceRows, assetSymbols),
      },
      limits: {
        metadataScanLimit: METADATA_SCAN_LIMIT,
      },
    };
  }

  async listEntries(input: AdminLedgerEntriesQuery) {
    const filters = this.resolveEntryFilters(input);
    const pagination = this.resolvePagination(input);
    const assetSymbols = await this.buildAssetSymbolMap();

    const query = this.createFilteredEntryQuery(filters);
    const [entries, total] = await query
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.entryId', 'DESC')
      .take(pagination.limit)
      .skip((pagination.page - 1) * pagination.limit)
      .getManyAndCount();

    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    return {
      generatedAt: getRFC3339Timestamp(),
      items: entries.map((entry) =>
        this.serializeEntry(entry, assetSymbols),
      ),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrevious: pagination.page > 1,
      },
      filters: {
        type: filters.type || null,
        asset: filters.asset || null,
        query: filters.query || null,
      },
      types: LEDGER_ENTRY_TYPES,
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        maxPage: MAX_PAGE,
        maxQueryLength: MAX_QUERY_LENGTH,
      },
    };
  }

  async listBalances(input: AdminLedgerBalancesQuery) {
    const filters = this.resolveBalanceFilters(input);
    const pagination = this.resolvePagination(input);
    const exchangeOrderIds = await this.resolveExchangeOrderIds(
      filters.exchange,
    );

    if (filters.exchange && exchangeOrderIds.length === 0) {
      return this.emptyBalancesResponse(filters, pagination);
    }

    const query = this.createFilteredBalanceQuery(filters, exchangeOrderIds);

    const [balances, total] = await query
      .orderBy('balance.updatedAt', 'DESC')
      .addOrderBy('balance.orderId', 'ASC')
      .addOrderBy('balance.assetId', 'ASC')
      .take(pagination.limit)
      .skip((pagination.page - 1) * pagination.limit)
      .getManyAndCount();
    const summaryBalances = await this.createFilteredBalanceQuery(
      filters,
      exchangeOrderIds,
    )
      .orderBy('balance.updatedAt', 'DESC')
      .addOrderBy('balance.orderId', 'ASC')
      .addOrderBy('balance.assetId', 'ASC')
      .take(METADATA_SCAN_LIMIT)
      .getMany();

    const [
      orderMetadata,
      strategyMetadata,
      summaryExposureMetadata,
      assetSymbols,
    ] = await Promise.all([
      this.loadOrderMetadata(balances),
      this.loadStrategyMetadata(balances),
      this.loadSummaryExposureMetadata(summaryBalances),
      this.buildAssetSymbolMap(),
    ]);
    const items = balances.map((balance) =>
      this.serializeBalance(
        balance,
        assetSymbols,
        orderMetadata.get(balance.orderId),
        strategyMetadata.get(balance.orderId),
      ),
    );
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    return {
      generatedAt: getRFC3339Timestamp(),
      items,
      summary: this.buildSummary(
        summaryBalances,
        total,
        assetSymbols,
        summaryExposureMetadata,
      ),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrevious: pagination.page > 1,
      },
      filters: {
        exchange: filters.exchange || null,
        asset: filters.asset || null,
        query: filters.query || null,
      },
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        maxPage: MAX_PAGE,
        maxQueryLength: MAX_QUERY_LENGTH,
        metadataScanLimit: METADATA_SCAN_LIMIT,
      },
    };
  }

  private resolveBalanceFilters(
    input: AdminLedgerBalancesQuery,
  ): BalanceFilters {
    const exchange = this.normalizeOptionalToken(input.exchange, 'exchange');
    const asset = this.normalizeOptionalToken(input.asset, 'asset');
    const query = this.resolveQueryToken(input.query);

    return {
      exchange,
      asset,
      query,
    };
  }

  private resolveEntryFilters(input: AdminLedgerEntriesQuery): EntryFilters {
    const asset = this.normalizeOptionalToken(input.asset, 'asset');
    const query = this.resolveQueryToken(input.query);

    return {
      type: this.normalizeEntryType(input.type),
      asset,
      query,
    };
  }

  private resolveQueryToken(value?: string): string | undefined {
    const query = typeof value === 'string' ? value.trim() : '';

    if (query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(
        `Ledger query is too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`,
      );
    }

    return query || undefined;
  }

  private normalizeEntryType(
    value?: string,
  ): LedgerEntryType | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();

    if (!normalized || normalized === 'all') {
      return undefined;
    }

    if (!LEDGER_ENTRY_TYPES.includes(normalized as LedgerEntryType)) {
      throw new BadRequestException('type must be a known ledger entry type.');
    }

    return normalized as LedgerEntryType;
  }

  private resolvePagination(input: { limit?: string; page?: string }): {
    limit: number;
    page: number;
  } {
    return {
      limit: this.resolvePositiveInteger(input.limit, {
        name: 'limit',
        defaultValue: DEFAULT_LIMIT,
        maxValue: MAX_LIMIT,
        clampMax: true,
      }),
      page: this.resolvePositiveInteger(input.page, {
        name: 'page',
        defaultValue: 1,
        maxValue: MAX_PAGE,
        clampMax: false,
      }),
    };
  }

  private resolvePositiveInteger(
    value: string | undefined,
    options: {
      name: string;
      defaultValue: number;
      maxValue: number;
      clampMax: boolean;
    },
  ): number {
    if (value === undefined || value === '') {
      return options.defaultValue;
    }

    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(
        `${options.name} must be a positive integer.`,
      );
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException(
        `${options.name} must be a positive integer.`,
      );
    }

    if (parsed > options.maxValue) {
      if (options.clampMax) {
        return options.maxValue;
      }

      throw new BadRequestException(
        `${options.name} must be less than or equal to ${options.maxValue}.`,
      );
    }

    return parsed;
  }

  private normalizeOptionalToken(
    value: string | undefined,
    label: 'asset' | 'exchange',
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

  private async resolveExchangeOrderIds(exchange?: string): Promise<string[]> {
    if (!exchange) {
      return [];
    }

    const orders = await this.trackedOrderRepository
      .createQueryBuilder('order')
      .select(['order.orderId'])
      .andWhere('LOWER(order.exchange) = :exchange', { exchange })
      .orderBy('order.updatedAt', 'DESC')
      .take(METADATA_SCAN_LIMIT)
      .getMany();

    return [...new Set(orders.map((order) => order.orderId).filter(Boolean))];
  }

  private createFilteredEntryQuery(filters: EntryFilters) {
    const query = this.ledgerEntryRepository.createQueryBuilder('entry');

    if (filters.type) {
      query.andWhere('entry.type = :type', { type: filters.type });
    }

    if (filters.asset) {
      query.andWhere('LOWER(entry.assetId) = :asset', {
        asset: filters.asset,
      });
    }

    if (filters.query) {
      query.andWhere(
        `(${[
          "LOWER(entry.orderId) LIKE :query ESCAPE '\\'",
          "LOWER(entry.assetId) LIKE :query ESCAPE '\\'",
          "LOWER(entry.refId) LIKE :query ESCAPE '\\'",
          "LOWER(entry.entryId) LIKE :query ESCAPE '\\'",
        ].join(' OR ')})`,
        { query: `%${this.escapeLike(filters.query.toLowerCase())}%` },
      );
    }

    return query;
  }

  private createFilteredBalanceQuery(
    filters: BalanceFilters,
    exchangeOrderIds: string[],
  ) {
    const query = this.orderBalanceRepository.createQueryBuilder('balance');

    if (filters.asset) {
      query.andWhere('LOWER(balance.assetId) = :asset', {
        asset: filters.asset,
      });
    }

    if (exchangeOrderIds.length > 0) {
      query.andWhere('balance.orderId IN (:...orderIds)', {
        orderIds: exchangeOrderIds,
      });
    }

    if (filters.query) {
      query.andWhere(
        `(${[
          "LOWER(balance.orderId) LIKE :query ESCAPE '\\'",
          "LOWER(balance.assetId) LIKE :query ESCAPE '\\'",
        ].join(' OR ')})`,
        { query: `%${this.escapeLike(filters.query.toLowerCase())}%` },
      );
    }

    return query;
  }

  private async loadOrderMetadata(balances: MarketMakingOrderBalance[]) {
    const orderIds = this.uniqueOrderIds(balances);
    const metadata = new Map<
      string,
      {
        exchange: string | null;
        accountLabel: string | null;
        pair: string | null;
        strategyKey: string | null;
        orderStatus: string | null;
      }
    >();

    if (orderIds.length === 0) {
      return metadata;
    }

    const orders = await this.trackedOrderRepository.find({
      where: { orderId: In(orderIds) },
      order: { updatedAt: 'DESC' },
      take: METADATA_SCAN_LIMIT,
    });

    for (const order of orders) {
      if (metadata.has(order.orderId)) {
        continue;
      }

      metadata.set(order.orderId, {
        exchange: order.exchange || null,
        accountLabel: order.accountLabel || null,
        pair: order.pair || null,
        strategyKey: order.strategyKey || null,
        orderStatus: order.status || null,
      });
    }

    return metadata;
  }

  private async loadStrategyMetadata(balances: MarketMakingOrderBalance[]) {
    const orderIds = this.uniqueOrderIds(balances);
    const metadata = new Map<
      string,
      {
        strategyKey: string | null;
        strategyType: string | null;
        strategyStatus: string | null;
      }
    >();

    if (orderIds.length === 0) {
      return metadata;
    }

    const strategies = await this.strategyInstanceRepository.find({
      where: { marketMakingOrderId: In(orderIds) },
      order: { updatedAt: 'DESC' },
      take: METADATA_SCAN_LIMIT,
    });

    for (const strategy of strategies) {
      if (
        !strategy.marketMakingOrderId ||
        metadata.has(strategy.marketMakingOrderId)
      ) {
        continue;
      }

      metadata.set(strategy.marketMakingOrderId, {
        strategyKey: strategy.strategyKey || null,
        strategyType: strategy.strategyType || null,
        strategyStatus: strategy.status || null,
      });
    }

    return metadata;
  }

  private async loadSummaryExposureMetadata(
    balances: MarketMakingOrderBalance[],
  ): Promise<
    Map<
      string,
      {
        marketMakingState: string | null;
        trackedStatuses: Set<string>;
      }
    >
  > {
    const orderIds = this.uniqueOrderIds(balances);
    const metadata = new Map<
      string,
      {
        marketMakingState: string | null;
        trackedStatuses: Set<string>;
      }
    >();

    for (const orderId of orderIds) {
      metadata.set(orderId, {
        marketMakingState: null,
        trackedStatuses: new Set(),
      });
    }

    if (orderIds.length === 0) {
      return metadata;
    }

    const [orders, trackedOrders] = await Promise.all([
      this.marketMakingOrderRepository.find({
        where: { orderId: In(orderIds) },
        select: ['orderId', 'state'],
        take: METADATA_SCAN_LIMIT,
      }),
      this.trackedOrderRepository.find({
        where: { orderId: In(orderIds) },
        select: ['orderId', 'status'],
        take: METADATA_SCAN_LIMIT,
      }),
    ]);

    for (const order of orders) {
      const current = metadata.get(order.orderId);

      if (current) {
        current.marketMakingState = order.state || null;
      }
    }

    for (const trackedOrder of trackedOrders) {
      const current = metadata.get(trackedOrder.orderId);

      if (current && trackedOrder.status) {
        current.trackedStatuses.add(trackedOrder.status);
      }
    }

    return metadata;
  }

  private serializeEntry(
    entry: LedgerEntry,
    assetSymbols: Map<string, string>,
  ) {
    return {
      entryId: entry.entryId,
      type: entry.type,
      orderId: entry.orderId,
      userOrderId: entry.userOrderId,
      accountLabel: entry.accountLabel || null,
      asset: this.resolveAssetSymbol(entry.assetId, assetSymbols),
      assetId: entry.assetId,
      amount: this.formatDecimal(entry.amount),
      refType: entry.refType || null,
      refId: entry.refId || null,
      reversalOf: entry.reversalOf || null,
      createdAt: this.normalizeTimestamp(entry.createdAt),
    };
  }

  private serializeBalance(
    balance: MarketMakingOrderBalance,
    assetSymbols: Map<string, string>,
    order?: {
      exchange: string | null;
      accountLabel: string | null;
      pair: string | null;
      strategyKey: string | null;
      orderStatus: string | null;
    },
    strategy?: {
      strategyKey: string | null;
      strategyType: string | null;
      strategyStatus: string | null;
    },
  ) {
    const available = this.formatDecimal(balance.available);
    const locked = this.formatDecimal(balance.locked);
    const total = this.formatDecimal(balance.total);
    const asset = this.resolveAssetSymbol(balance.assetId, assetSymbols);
    const balanced = new BigNumber(balance.available || 0)
      .plus(balance.locked || 0)
      .isEqualTo(balance.total || 0);

    return {
      id: `${balance.orderId}:${balance.assetId}`,
      orderId: balance.orderId,
      asset,
      assetId: balance.assetId,
      exchange: order?.exchange || null,
      accountLabel: order?.accountLabel || null,
      pair: order?.pair || null,
      strategyKey: order?.strategyKey || strategy?.strategyKey || null,
      strategyType: strategy?.strategyType || null,
      strategyStatus: strategy?.strategyStatus || null,
      orderStatus: order?.orderStatus || null,
      available,
      locked,
      total,
      initialDeposit: this.formatDecimal(balance.initialDeposit),
      realizedDelta: this.formatDecimal(balance.realizedDelta),
      feePaid: this.formatDecimal(balance.feePaid),
      balanced,
      dataSources: ['ledger_order_balance'],
      updatedAt: this.normalizeTimestamp(balance.updatedAt),
    };
  }

  private buildSummary(
    balances: MarketMakingOrderBalance[],
    totalRows: number,
    assetSymbols: Map<string, string>,
    exposureMetadata: Map<
      string,
      {
        marketMakingState: string | null;
        trackedStatuses: Set<string>;
      }
    >,
  ) {
    const activeBalances = balances.filter((balance) =>
      this.isActiveInventoryBalance(balance, exposureMetadata),
    );

    return {
      scannedRows: activeBalances.length,
      totalRows,
      truncated: totalRows > balances.length,
      byAsset: this.aggregateByAsset(activeBalances, assetSymbols),
    };
  }

  private aggregateByAsset(
    balances: MarketMakingOrderBalance[],
    assetSymbols: Map<string, string>,
  ) {
    const byAsset = new Map<
      string,
      {
        asset: string;
        available: BigNumber;
        locked: BigNumber;
        total: BigNumber;
      }
    >();

    for (const balance of balances) {
      const asset = this.resolveAssetSymbol(balance.assetId, assetSymbols);
      const current = byAsset.get(asset) || {
        asset,
        available: new BigNumber(0),
        locked: new BigNumber(0),
        total: new BigNumber(0),
      };

      current.available = current.available.plus(balance.available || 0);
      current.locked = current.locked.plus(balance.locked || 0);
      current.total = current.total.plus(balance.total || 0);
      byAsset.set(asset, current);
    }

    return [...byAsset.values()]
      .sort((left, right) =>
        right.total.comparedTo(left.total) === 0
          ? left.asset.localeCompare(right.asset)
          : right.total.comparedTo(left.total),
      )
      .map((entry) => ({
        asset: entry.asset,
        available: entry.available.toFixed(),
        locked: entry.locked.toFixed(),
        total: entry.total.toFixed(),
      }));
  }

  private evaluateBalanceHealth(balances: MarketMakingOrderBalance[]): {
    invariantViolations: number;
    negativeBalances: number;
  } {
    let invariantViolations = 0;
    let negativeBalances = 0;

    for (const balance of balances) {
      const available = new BigNumber(balance.available || 0);
      const locked = new BigNumber(balance.locked || 0);
      const total = new BigNumber(balance.total || 0);

      if (!available.plus(locked).isEqualTo(total)) {
        invariantViolations += 1;
      }

      if (available.isLessThan(0) || locked.isLessThan(0)) {
        negativeBalances += 1;
      }
    }

    return { invariantViolations, negativeBalances };
  }

  private isActiveInventoryBalance(
    balance: MarketMakingOrderBalance,
    exposureMetadata: Map<
      string,
      {
        marketMakingState: string | null;
        trackedStatuses: Set<string>;
      }
    >,
  ): boolean {
    const total = new BigNumber(balance.total || 0);

    if (!total.isFinite() || total.isZero()) {
      return false;
    }

    const metadata = exposureMetadata.get(balance.orderId);

    if (!metadata) {
      return false;
    }

    if (
      metadata.marketMakingState &&
      ACTIVE_MARKET_MAKING_ORDER_STATES.has(metadata.marketMakingState)
    ) {
      return true;
    }

    return [...metadata.trackedStatuses].some((status) =>
      RISK_RELEVANT_TRACKED_ORDER_STATUSES.has(status),
    );
  }

  private emptyBalancesResponse(
    filters: BalanceFilters,
    pagination: { limit: number; page: number },
  ) {
    return {
      generatedAt: getRFC3339Timestamp(),
      items: [],
      summary: {
        scannedRows: 0,
        totalRows: 0,
        truncated: false,
        byAsset: [],
      },
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrevious: pagination.page > 1,
      },
      filters: {
        exchange: filters.exchange || null,
        asset: filters.asset || null,
        query: filters.query || null,
      },
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        maxPage: MAX_PAGE,
        maxQueryLength: MAX_QUERY_LENGTH,
        metadataScanLimit: METADATA_SCAN_LIMIT,
      },
    };
  }

  private uniqueOrderIds(balances: MarketMakingOrderBalance[]): string[] {
    return [
      ...new Set(balances.map((balance) => balance.orderId).filter(Boolean)),
    ];
  }

  private formatDecimal(value?: string | null): string {
    const parsed = new BigNumber(value || 0);

    return parsed.isFinite() ? parsed.toFixed() : '0';
  }

  private async buildAssetSymbolMap(): Promise<Map<string, string>> {
    const pairs = await this.marketMakingPairRepository.find({
      select: [
        'base_asset_id',
        'base_symbol',
        'quote_asset_id',
        'quote_symbol',
      ],
    });
    const symbols = new Map<string, string>();

    for (const pair of pairs) {
      if (pair.base_asset_id && pair.base_symbol) {
        symbols.set(pair.base_asset_id.toLowerCase(), pair.base_symbol);
      }
      if (pair.quote_asset_id && pair.quote_symbol) {
        symbols.set(pair.quote_asset_id.toLowerCase(), pair.quote_symbol);
      }
    }

    return symbols;
  }

  private resolveAssetSymbol(
    assetId: string,
    assetSymbols: Map<string, string>,
  ): string {
    return assetSymbols.get(assetId.toLowerCase()) || assetId;
  }

  private normalizeTimestamp(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const ms = Date.parse(value);

    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
  }
}

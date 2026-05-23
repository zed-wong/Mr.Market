import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { In, Repository } from 'typeorm';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_PAGE = 1000;
const MAX_QUERY_LENGTH = 100;
const MAX_TOKEN_LENGTH = 64;
const METADATA_SCAN_LIMIT = 500;

const UNAVAILABLE_PNL_REASON =
  'PnL metrics are unavailable because order-scoped balances do not include supported cost basis or mark-price valuation data.';

export interface AdminPositionsQuery {
  exchange?: string;
  asset?: string;
  query?: string;
  limit?: string;
  page?: string;
}

type PositionFilters = {
  exchange?: string;
  asset?: string;
  query?: string;
};

@Injectable()
export class AdminPositionsService {
  constructor(
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(TrackedOrderEntity)
    private readonly trackedOrderRepository: Repository<TrackedOrderEntity>,
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository: Repository<StrategyInstance>,
  ) {}

  async listPositions(input: AdminPositionsQuery) {
    const filters = this.resolveFilters(input);
    const pagination = this.resolvePagination(input);
    const exchangeOrderIds = await this.resolveExchangeOrderIds(
      filters.exchange,
    );

    if (filters.exchange && exchangeOrderIds.length === 0) {
      return this.emptyResponse(filters, pagination);
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

    const [orderMetadata, strategyMetadata] = await Promise.all([
      this.loadOrderMetadata(balances),
      this.loadStrategyMetadata(balances),
    ]);
    const items = balances.map((balance) =>
      this.serializePosition(
        balance,
        orderMetadata.get(balance.orderId),
        strategyMetadata.get(balance.orderId),
      ),
    );
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    return {
      generatedAt: getRFC3339Timestamp(),
      items,
      summary: this.buildSummary(summaryBalances, total),
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

  private resolveFilters(input: AdminPositionsQuery): PositionFilters {
    const exchange = this.normalizeOptionalToken(input.exchange, 'exchange');
    const asset = this.normalizeOptionalToken(input.asset, 'asset');
    const query = typeof input.query === 'string' ? input.query.trim() : '';

    if (query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(
        `Position query is too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`,
      );
    }

    return {
      exchange,
      asset,
      query: query || undefined,
    };
  }

  private resolvePagination(input: AdminPositionsQuery): {
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
      throw new BadRequestException(`${options.name} must be a positive integer.`);
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

  private createFilteredBalanceQuery(
    filters: PositionFilters,
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

  private serializePosition(
    balance: MarketMakingOrderBalance,
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

    return {
      id: `${balance.orderId}:${balance.assetId}`,
      orderId: balance.orderId,
      asset: balance.assetId,
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
      quantity: total,
      initialDeposit: this.formatDecimal(balance.initialDeposit),
      realizedDelta: this.formatDecimal(balance.realizedDelta),
      feePaid: this.formatDecimal(balance.feePaid),
      exposure: {
        asset: balance.assetId,
        quantity: total,
        notional: null,
        currency: null,
        unavailableReason:
          'Exposure notional is unavailable without a supported mark price.',
      },
      avgCost: null,
      realizedPnl: null,
      unrealizedPnl: null,
      markPrice: null,
      portfolioPercent: null,
      pnl: {
        averageCost: null,
        realized: null,
        unrealized: null,
        markPrice: null,
        portfolioPercent: null,
        unavailableReason: UNAVAILABLE_PNL_REASON,
      },
      dataSources: ['ledger_order_balance'],
      updatedAt: this.normalizeTimestamp(balance.updatedAt),
    };
  }

  private buildSummary(
    balances: MarketMakingOrderBalance[],
    totalRows: number,
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
      const current =
        byAsset.get(balance.assetId) ||
        {
          asset: balance.assetId,
          available: new BigNumber(0),
          locked: new BigNumber(0),
          total: new BigNumber(0),
        };

      current.available = current.available.plus(balance.available || 0);
      current.locked = current.locked.plus(balance.locked || 0);
      current.total = current.total.plus(balance.total || 0);
      byAsset.set(balance.assetId, current);
    }

    return {
      scannedRows: balances.length,
      totalRows,
      truncated: totalRows > balances.length,
      byAsset: [...byAsset.values()]
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
        })),
    };
  }

  private emptyResponse(
    filters: PositionFilters,
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

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import {
  MarketMakingOrder,
  SimplyGrowOrder,
} from 'src/common/entities/orders/user-orders.entity';
import { Repository } from 'typeorm';

const USER_ORDER_TYPES = ['market_making', 'simply_grow'] as const;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_PAGE = 1000;
const MAX_QUERY_LENGTH = 100;
const MAX_SCAN_ROWS = 1000;

type UserOrderType = (typeof USER_ORDER_TYPES)[number];

export interface AdminUserOrdersQuery {
  type?: string;
  state?: string;
  query?: string;
  limit?: string;
  page?: string;
}

export interface SerializedUserOrder {
  orderId: string;
  userId: string;
  type: UserOrderType;
  state: string;
  createdAt: string | null;
  rewardAddress: string | null;
  pair: string | null;
  exchangeName: string | null;
  source: string | null;
  strategyKey: string | null;
  apiKeyId: string | null;
  amount: string | null;
  baseBalance: string | null;
  quoteBalance: string | null;
  mixinAssetId: string | null;
}

@Injectable()
export class AdminUserOrdersService {
  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository: Repository<MarketMakingOrder>,
    @InjectRepository(SimplyGrowOrder)
    private readonly simplyGrowOrderRepository: Repository<SimplyGrowOrder>,
  ) {}

  async listUserOrders(input: AdminUserOrdersQuery) {
    const filters = this.resolveFilters(input);
    const pagination = this.resolvePagination(input);
    const items = await this.loadFilteredOrders(filters);
    const sorted = items.sort((left, right) =>
      this.compareCreatedAtDesc(left.createdAt, right.createdAt),
    );
    const offset = (pagination.page - 1) * pagination.limit;
    const pageItems = sorted.slice(offset, offset + pagination.limit);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pagination.limit));

    return {
      generatedAt: getRFC3339Timestamp(),
      items: pageItems,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: sorted.length,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrevious: pagination.page > 1,
      },
      filters: {
        type: filters.type || null,
        state: filters.state || null,
        query: filters.query || null,
      },
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        maxPage: MAX_PAGE,
        maxQueryLength: MAX_QUERY_LENGTH,
        maxScanRows: MAX_SCAN_ROWS,
      },
    };
  }

  private async loadFilteredOrders(filters: {
    type?: UserOrderType;
    state?: string;
    query?: string;
  }): Promise<SerializedUserOrder[]> {
    const orders: SerializedUserOrder[] = [];

    if (!filters.type || filters.type === 'market_making') {
      const query = this.marketMakingOrderRepository.createQueryBuilder('order');

      if (filters.state) {
        query.andWhere('LOWER(order.state) = :state', { state: filters.state });
      }

      if (filters.query) {
        query.andWhere(
          `(${[
            "LOWER(order.orderId) LIKE :query ESCAPE '\\'",
            "LOWER(order.userId) LIKE :query ESCAPE '\\'",
            "LOWER(order.pair) LIKE :query ESCAPE '\\'",
            "LOWER(order.exchangeName) LIKE :query ESCAPE '\\'",
            "LOWER(order.source) LIKE :query ESCAPE '\\'",
          ].join(' OR ')})`,
          { query: `%${this.escapeLike(filters.query.toLowerCase())}%` },
        );
      }

      const rows = await query
        .orderBy('order.createdAt', 'DESC')
        .take(MAX_SCAN_ROWS)
        .getMany();
      orders.push(...rows.map((order) => this.serializeMarketMakingOrder(order)));
    }

    if (!filters.type || filters.type === 'simply_grow') {
      const query = this.simplyGrowOrderRepository.createQueryBuilder('order');

      if (filters.state) {
        query.andWhere('LOWER(order.state) = :state', { state: filters.state });
      }

      if (filters.query) {
        query.andWhere(
          `(${[
            "LOWER(order.orderId) LIKE :query ESCAPE '\\'",
            "LOWER(order.userId) LIKE :query ESCAPE '\\'",
            "LOWER(order.mixinAssetId) LIKE :query ESCAPE '\\'",
          ].join(' OR ')})`,
          { query: `%${this.escapeLike(filters.query.toLowerCase())}%` },
        );
      }

      const rows = await query
        .orderBy('order.createdAt', 'DESC')
        .take(MAX_SCAN_ROWS)
        .getMany();
      orders.push(...rows.map((order) => this.serializeSimplyGrowOrder(order)));
    }

    return orders;
  }

  private serializeMarketMakingOrder(
    order: MarketMakingOrder,
  ): SerializedUserOrder {
    return {
      orderId: order.orderId,
      userId: order.userId,
      type: 'market_making',
      state: order.state,
      createdAt: order.createdAt || null,
      rewardAddress: order.rewardAddress || null,
      pair: order.pair || null,
      exchangeName: order.exchangeName || null,
      source: order.source || null,
      strategyKey: order.strategySnapshot?.definitionKey || null,
      apiKeyId: order.apiKeyId || null,
      amount: order.orderAmount || null,
      baseBalance: order.balanceA || null,
      quoteBalance: order.balanceB || null,
      mixinAssetId: null,
    };
  }

  private serializeSimplyGrowOrder(order: SimplyGrowOrder): SerializedUserOrder {
    return {
      orderId: order.orderId,
      userId: order.userId,
      type: 'simply_grow',
      state: order.state,
      createdAt: order.createdAt || null,
      rewardAddress: order.rewardAddress || null,
      pair: null,
      exchangeName: null,
      source: null,
      strategyKey: null,
      apiKeyId: null,
      amount: order.amount || null,
      baseBalance: null,
      quoteBalance: null,
      mixinAssetId: order.mixinAssetId || null,
    };
  }

  private resolveFilters(input: AdminUserOrdersQuery): {
    type?: UserOrderType;
    state?: string;
    query?: string;
  } {
    const type = this.normalizeOptionalToken(input.type);
    const state = this.normalizeOptionalToken(input.state);
    const query = typeof input.query === 'string' ? input.query.trim() : '';

    if (type && !USER_ORDER_TYPES.includes(type as UserOrderType)) {
      throw new BadRequestException(
        `Unsupported user order type. Supported types: ${USER_ORDER_TYPES.join(
          ', ',
        )}`,
      );
    }

    if (query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(
        `User order query is too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`,
      );
    }

    return {
      type: type as UserOrderType | undefined,
      state,
      query: query || undefined,
    };
  }

  private resolvePagination(input: AdminUserOrdersQuery): {
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
      throw new BadRequestException(`${options.name} must be a positive integer.`);
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

  private normalizeOptionalToken(value?: string): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();

    return normalized && normalized !== 'all' ? normalized : undefined;
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
  }

  private compareCreatedAtDesc(left?: string | null, right?: string | null) {
    return this.timestampMs(right) - this.timestampMs(left);
  }

  private timestampMs(value?: string | null) {
    if (!value) return 0;

    const time = new Date(value).getTime();

    return Number.isFinite(time) ? time : 0;
  }
}

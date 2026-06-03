import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { In, Repository } from 'typeorm';

const ORDER_STATUSES = [
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

const ORDER_SIDES = ['buy', 'sell'] as const;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_PAGE = 1000;
const MAX_QUERY_LENGTH = 100;
const EXECUTION_SCAN_LIMIT = 500;

type OrderStatus = (typeof ORDER_STATUSES)[number];
type OrderSide = (typeof ORDER_SIDES)[number];

export interface AdminOrdersQuery {
  status?: string;
  side?: string;
  query?: string;
  limit?: string;
  page?: string;
}

@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(TrackedOrderEntity)
    private readonly trackedOrderRepository: Repository<TrackedOrderEntity>,
    @InjectRepository(StrategyExecutionHistory)
    private readonly executionHistoryRepository: Repository<StrategyExecutionHistory>,
  ) {}

  async listOrders(input: AdminOrdersQuery) {
    const filters = this.resolveFilters(input);
    const pagination = this.resolvePagination(input);
    const query = this.trackedOrderRepository.createQueryBuilder('order');

    if (filters.status) {
      query.andWhere('order.status = :status', { status: filters.status });
    }

    if (filters.side) {
      query.andWhere('order.side = :side', { side: filters.side });
    }

    if (filters.query) {
      query.andWhere(
        `(${[
          "LOWER(order.orderId) LIKE :query ESCAPE '\\'",
          "LOWER(order.pair) LIKE :query ESCAPE '\\'",
          "LOWER(order.strategyKey) LIKE :query ESCAPE '\\'",
          "LOWER(order.exchange) LIKE :query ESCAPE '\\'",
          "LOWER(order.exchangeOrderId) LIKE :query ESCAPE '\\'",
          "LOWER(order.clientOrderId) LIKE :query ESCAPE '\\'",
          "LOWER(order.accountLabel) LIKE :query ESCAPE '\\'",
        ].join(' OR ')})`,
        { query: `%${this.escapeLike(filters.query.toLowerCase())}%` },
      );
    }

    const [orders, total] = await query
      .orderBy('order.updatedAt', 'DESC')
      .addOrderBy('order.trackingKey', 'DESC')
      .take(pagination.limit)
      .skip((pagination.page - 1) * pagination.limit)
      .getManyAndCount();

    const executionSummaries = await this.loadExecutionSummaries(orders);
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    return {
      generatedAt: getRFC3339Timestamp(),
      items: orders.map((order) =>
        this.serializeOrder(order, executionSummaries.get(order.orderId)),
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
        status: filters.status || null,
        side: filters.side || null,
        query: filters.query || null,
      },
      limits: {
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        maxPage: MAX_PAGE,
        maxQueryLength: MAX_QUERY_LENGTH,
        executionScanLimit: EXECUTION_SCAN_LIMIT,
      },
    };
  }

  private resolveFilters(input: AdminOrdersQuery): {
    status?: OrderStatus;
    side?: OrderSide;
    query?: string;
  } {
    const status = this.normalizeOptionalToken(input.status);
    const side = this.normalizeOptionalToken(input.side);
    const query = typeof input.query === 'string' ? input.query.trim() : '';

    if (status && !ORDER_STATUSES.includes(status as OrderStatus)) {
      throw new BadRequestException(
        `Unsupported order status. Supported statuses: ${ORDER_STATUSES.join(
          ', ',
        )}`,
      );
    }

    if (side && !ORDER_SIDES.includes(side as OrderSide)) {
      throw new BadRequestException(
        `Unsupported order side. Supported sides: ${ORDER_SIDES.join(', ')}`,
      );
    }

    if (query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(
        `Order query is too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`,
      );
    }

    return {
      status: status as OrderStatus | undefined,
      side: side as OrderSide | undefined,
      query: query || undefined,
    };
  }

  private resolvePagination(input: AdminOrdersQuery): {
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

  private normalizeOptionalToken(value?: string): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();

    return normalized && normalized !== 'all' ? normalized : undefined;
  }

  private async loadExecutionSummaries(orders: TrackedOrderEntity[]) {
    const orderIds = [...new Set(orders.map((order) => order.orderId))];
    const historyIdToOrderId = new Map<string, string>();
    const summaries = new Map<
      string,
      {
        count: number;
        lastExecutedAt: string | null;
        statuses: string[];
        strategyTypes: string[];
      }
    >();

    if (orderIds.length === 0) {
      return summaries;
    }

    for (const order of orders) {
      historyIdToOrderId.set(order.orderId, order.orderId);

      if (order.exchangeOrderId) {
        historyIdToOrderId.set(order.exchangeOrderId, order.orderId);
      }
    }

    const executions = await this.executionHistoryRepository.find({
      where: { orderId: In([...historyIdToOrderId.keys()]) },
      order: { executedAt: 'DESC' },
      take: EXECUTION_SCAN_LIMIT,
    });

    for (const execution of executions) {
      if (!execution.orderId) {
        continue;
      }

      const internalOrderId = historyIdToOrderId.get(execution.orderId);

      if (!internalOrderId) {
        continue;
      }

      const summary = summaries.get(internalOrderId) || {
        count: 0,
        lastExecutedAt: null,
        statuses: [],
        strategyTypes: [],
      };

      summary.count += 1;
      summary.lastExecutedAt =
        summary.lastExecutedAt ||
        this.normalizeTimestamp(execution.executedAt) ||
        null;
      this.addUnique(summary.statuses, execution.status);
      this.addUnique(summary.strategyTypes, execution.strategyType);
      summaries.set(internalOrderId, summary);
    }

    return summaries;
  }

  private serializeOrder(
    order: TrackedOrderEntity,
    executions?: {
      count: number;
      lastExecutedAt: string | null;
      statuses: string[];
      strategyTypes: string[];
    },
  ) {
    const quantity = order.qty || '0';
    const filledQuantity = order.cumulativeFilledQty || '0';

    return {
      trackingKey: order.trackingKey,
      orderId: order.orderId,
      symbol: order.pair,
      pair: order.pair,
      side: order.side,
      type: order.role || 'limit',
      role: order.role || null,
      quantity,
      filledQuantity,
      fillPercent: this.calculateFillPercent(filledQuantity, quantity),
      price: order.price,
      status: order.status,
      exchange: order.exchange,
      accountLabel: order.accountLabel || null,
      strategyKey: order.strategyKey,
      exchangeOrderId: order.exchangeOrderId,
      clientOrderId: order.clientOrderId || null,
      slotKey: order.slotKey || null,
      createdAt: this.normalizeTimestamp(order.createdAt),
      updatedAt: this.normalizeTimestamp(order.updatedAt),
      executions: executions || {
        count: 0,
        lastExecutedAt: null,
        statuses: [],
        strategyTypes: [],
      },
    };
  }

  private calculateFillPercent(filled: string, quantity: string): string {
    const filledAmount = new BigNumber(filled || 0);
    const quantityAmount = new BigNumber(quantity || 0);

    if (
      !filledAmount.isFinite() ||
      !quantityAmount.isFinite() ||
      quantityAmount.isLessThanOrEqualTo(0)
    ) {
      return '0';
    }

    return BigNumber.min(
      100,
      filledAmount.dividedBy(quantityAmount).multipliedBy(100),
    ).toFixed();
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

  private addUnique(target: string[], value?: string | null): void {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  }
}

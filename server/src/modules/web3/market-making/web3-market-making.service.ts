import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import type { MarketMakingStates } from 'src/common/types/orders/states';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { Repository } from 'typeorm';

type CreateOrderBody = {
  userId?: string;
  marketMakingPairId?: string;
  pairId?: string;
  strategyDefinitionId?: string;
  strategyId?: string;
  configOverrides?: Record<string, unknown>;
  initialDeposit?: {
    assetId?: string;
    asset?: string;
    amount?: string;
  };
};

type MoneyMovementBody = {
  assetId?: string;
  asset?: string;
  amount?: string;
  idempotencyKey?: string;
};

type OrderBalanceDto = {
  orderId: string;
  assetId: string;
  available: string;
  locked: string;
  total: string;
  initialDeposit: string;
  realizedDelta: string;
  feePaid: string;
  updatedAt: string;
};

const STARTABLE_STATES: MarketMakingStates[] = [
  'created',
  'payment_complete',
  'deposit_confirmed',
];
const PAUSABLE_STATES: MarketMakingStates[] = ['running'];
const RESUMABLE_STATES: MarketMakingStates[] = ['paused'];
const TERMINAL_STATES: MarketMakingStates[] = [
  'deleted',
  'failed',
  'refunded',
];

@Injectable()
export class Web3MarketMakingService {
  constructor(
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(GrowdataMarketMakingPair)
    private readonly marketMakingPairRepository: Repository<GrowdataMarketMakingPair>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(Performance)
    private readonly performanceRepository: Repository<Performance>,
    @InjectRepository(StrategyExecutionHistory)
    private readonly strategyExecutionHistoryRepository: Repository<StrategyExecutionHistory>,
    private readonly userOrdersService: UserOrdersService,
    private readonly marketMakingRuntimeService: MarketMakingRuntimeService,
    private readonly balanceLedgerService: BalanceLedgerService,
  ) {}

  async listOrders(userId: string) {
    const orders = (await this.userOrdersService.findMarketMakingByUserId(
      userId,
    )).filter((order) => order.source !== 'admin_direct');
    const balancesByOrderId = await this.loadBalancesByOrderId(
      orders.map((order) => order.orderId),
    );
    const definitionMap = await this.loadStrategyDefinitions(orders);

    return {
      namespace: '/api/v1/web3/market-making',
      total: orders.length,
      orders: orders.map((order) =>
        this.serializeOrderSummary(
          order,
          balancesByOrderId.get(order.orderId) || [],
          definitionMap.get(order.strategyDefinitionId || ''),
        ),
      ),
    };
  }

  async getOrderDetail(userId: string, orderId: string) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);
    const [balances, ledgerEntries, executionEvents, performanceRows] =
      await Promise.all([
        this.loadBalances(orderId),
        this.ledgerEntryRepository.find({
          where: { orderId },
          order: { createdAt: 'ASC' },
        }),
        this.strategyExecutionHistoryRepository.find({
          where: [{ orderId }, { clientId: orderId }],
          order: { executedAt: 'ASC' },
        }),
        this.performanceRepository.find({
          where: { userId, clientId: orderId },
          order: { executedAt: 'DESC' },
        }),
      ]);
    const definition = order.strategyDefinitionId
      ? await this.strategyDefinitionRepository.findOne({
          where: { id: order.strategyDefinitionId },
        })
      : null;

    return {
      namespace: '/api/v1/web3/market-making',
      order: this.serializeOrderDetail(
        order,
        balances,
        definition || undefined,
        performanceRows,
        ledgerEntries,
        executionEvents,
      ),
    };
  }

  async listStrategies() {
    return {
      namespace: '/api/v1/web3/market-making',
      strategies:
        await this.userOrdersService.listEnabledMarketMakingStrategies(),
    };
  }

  async listPairOptions() {
    const pairs = await this.marketMakingPairRepository.find({
      where: { enable: true },
      order: { symbol: 'ASC' },
    });

    return {
      namespace: '/api/v1/web3/market-making',
      options: pairs
        .filter((pair) => pair.enable !== false)
        .map((pair) => this.serializePairOption(pair)),
    };
  }

  async createOrder(userId: string, body: CreateOrderBody) {
    if (Object.prototype.hasOwnProperty.call(body || {}, 'userId')) {
      throw this.badRequest(
        'USER_ID_OVERRIDE_REJECTED',
        'userId is derived from authentication and cannot be supplied',
      );
    }

    const marketMakingPairId = body?.marketMakingPairId || body?.pairId;
    const strategyDefinitionId =
      body?.strategyDefinitionId || body?.strategyId;

    if (!marketMakingPairId) {
      throw this.badRequest(
        'PAIR_REQUIRED',
        'marketMakingPairId is required',
      );
    }
    if (!strategyDefinitionId) {
      throw this.badRequest(
        'STRATEGY_REQUIRED',
        'strategyDefinitionId is required',
      );
    }

    const intent = await this.userOrdersService.createMarketMakingOrderIntent({
      userId,
      marketMakingPairId,
      strategyDefinitionId,
      configOverrides: body?.configOverrides,
    });

    return {
      namespace: '/api/v1/web3/market-making',
      ...intent,
      funding: {
        mode: 'separate_deposit_required',
        depositEndpoint: `/api/v1/web3/market-making/orders/${intent.orderId}/deposit`,
        memo: intent.memo,
        expiresAt: intent.expiresAt,
      },
      initialDeposit: {
        mode: 'separate_deposit_required',
        acceptedDuringCreate: false,
        requested: body?.initialDeposit || null,
        message:
          'Create order records an intent only; balances change after the deposit endpoint succeeds.',
      },
    };
  }

  async deposit(userId: string, orderId: string, body: MoneyMovementBody) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);

    this.assertMutableFundingState(order, 'DEPOSIT_STATE_INVALID');
    const command = this.validateMoneyMovement(order, body, 'deposit');
    const result = await this.balanceLedgerService.creditDeposit({
      orderId,
      userId,
      assetId: command.assetId,
      amount: command.amount,
      idempotencyKey: `web3:deposit:${command.idempotencyKey}`,
      refType: 'web3_order_deposit',
      refId: command.idempotencyKey,
    });

    return {
      namespace: '/api/v1/web3/market-making',
      mutation: {
        type: 'deposit',
        applied: result.applied,
        idempotencyKey: command.idempotencyKey,
      },
      balance: this.serializeBalance(result.balance),
      order: (
        await this.getOrderDetail(userId, orderId)
      ).order,
    };
  }

  async withdraw(userId: string, orderId: string, body: MoneyMovementBody) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);

    this.assertMutableFundingState(order, 'WITHDRAW_STATE_INVALID');
    const command = this.validateMoneyMovement(order, body, 'withdraw');
    const existingBalance = await this.orderBalanceRepository.findOneBy({
      orderId,
      assetId: command.assetId,
    });
    const available = new BigNumber(existingBalance?.available || 0);

    if (available.isLessThan(command.amount)) {
      throw this.badRequest(
        'INSUFFICIENT_AVAILABLE_BALANCE',
        'withdraw amount exceeds available order balance',
      );
    }

    const result = await this.balanceLedgerService.debitWithdrawal({
      orderId,
      userId,
      assetId: command.assetId,
      amount: command.amount,
      idempotencyKey: `web3:withdraw:${command.idempotencyKey}`,
      refType: 'web3_order_withdrawal',
      refId: command.idempotencyKey,
    });

    return {
      namespace: '/api/v1/web3/market-making',
      mutation: {
        type: 'withdraw',
        applied: result.applied,
        idempotencyKey: command.idempotencyKey,
      },
      balance: this.serializeBalance(result.balance),
      order: (
        await this.getOrderDetail(userId, orderId)
      ).order,
    };
  }

  async start(userId: string, orderId: string) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);

    this.assertState(order, STARTABLE_STATES, 'START_STATE_INVALID');
    await this.assertRiskIncreasingAllowed(order);
    await this.marketMakingRuntimeService.startOrder(order);
    await this.userOrdersService.updateMarketMakingOrderState(
      orderId,
      'running',
    );
    order.state = 'running';

    return {
      namespace: '/api/v1/web3/market-making',
      mutation: { type: 'start', applied: true },
      order: (
        await this.getOrderDetail(userId, orderId)
      ).order,
    };
  }

  async pause(userId: string, orderId: string) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);

    this.assertState(order, PAUSABLE_STATES, 'PAUSE_STATE_INVALID');
    await this.marketMakingRuntimeService.stopOrder(order, userId);
    await this.userOrdersService.updateMarketMakingOrderState(
      orderId,
      'paused',
    );
    order.state = 'paused';

    return {
      namespace: '/api/v1/web3/market-making',
      mutation: { type: 'pause', applied: true },
      order: (
        await this.getOrderDetail(userId, orderId)
      ).order,
    };
  }

  async resume(userId: string, orderId: string) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);

    this.assertState(order, RESUMABLE_STATES, 'RESUME_STATE_INVALID');
    await this.assertRiskIncreasingAllowed(order);
    await this.marketMakingRuntimeService.startOrder(order);
    await this.userOrdersService.updateMarketMakingOrderState(
      orderId,
      'running',
    );
    order.state = 'running';

    return {
      namespace: '/api/v1/web3/market-making',
      mutation: { type: 'resume', applied: true },
      order: (
        await this.getOrderDetail(userId, orderId)
      ).order,
    };
  }

  private async loadOwnedPublicOrder(userId: string, orderId: string) {
    const order = await this.userOrdersService.findOwnedMarketMakingByOrderId(
      userId,
      orderId,
    );

    if (!order || order.source === 'admin_direct') {
      throw new NotFoundException('Market making order not found');
    }

    return order;
  }

  private async loadBalancesByOrderId(orderIds: string[]) {
    const balancesByOrderId = new Map<string, MarketMakingOrderBalance[]>();

    if (orderIds.length === 0) {
      return balancesByOrderId;
    }

    const balances = await this.orderBalanceRepository.find({
      where: orderIds.map((orderId) => ({ orderId })),
    });

    for (const balance of balances) {
      const rows = balancesByOrderId.get(balance.orderId) || [];

      rows.push(balance);
      balancesByOrderId.set(balance.orderId, rows);
    }

    return balancesByOrderId;
  }

  private async loadBalances(orderId: string) {
    return await this.orderBalanceRepository.find({
      where: { orderId },
      order: { assetId: 'ASC' },
    });
  }

  private async loadStrategyDefinitions(orders: MarketMakingOrder[]) {
    const ids = [
      ...new Set(
        orders
          .map((order) => order.strategyDefinitionId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const definitions = await Promise.all(
      ids.map((id) =>
        this.strategyDefinitionRepository.findOne({ where: { id } }),
      ),
    );

    return new Map(
      definitions
        .filter((definition): definition is StrategyDefinition =>
          Boolean(definition),
        )
        .map((definition) => [definition.id, definition]),
    );
  }

  private serializeOrderSummary(
    order: MarketMakingOrder,
    balances: MarketMakingOrderBalance[],
    definition?: StrategyDefinition,
  ) {
    return {
      orderId: order.orderId,
      state: order.state,
      pair: order.pair,
      exchangeName: order.exchangeName,
      source: 'web3_market_making_order',
      strategy: this.serializeStrategy(order, definition),
      specs: this.serializeOrderSpecs(order),
      balances: balances.map((balance) => this.serializeBalance(balance)),
      performance: this.serializeBalancePerformance(balances),
      validActions: this.serializeValidActions(order),
      lifecycleError: order.lifecycleError || null,
      createdAt: order.createdAt,
    };
  }

  private serializeOrderDetail(
    order: MarketMakingOrder,
    balances: MarketMakingOrderBalance[],
    definition?: StrategyDefinition,
    performanceRows: Performance[] = [],
    ledgerEntries: LedgerEntry[] = [],
    executionEvents: StrategyExecutionHistory[] = [],
  ) {
    return {
      ...this.serializeOrderSummary(order, balances, definition),
      events: this.serializeEvents(ledgerEntries, executionEvents),
      performance: {
        ...this.serializeBalancePerformance(balances),
        snapshots: performanceRows.map((row) => ({
          userId: row.userId,
          orderId: row.clientId,
          strategyType: row.strategyType,
          profitLoss: String(row.profitLoss),
          additionalMetrics: row.additionalMetrics || {},
          executedAt: row.executedAt,
        })),
      },
    };
  }

  private serializeStrategy(
    order: MarketMakingOrder,
    definition?: StrategyDefinition,
  ) {
    const snapshot = order.strategySnapshot;

    return {
      id: order.strategyDefinitionId || snapshot?.strategyDefinitionId || null,
      key: definition?.key || snapshot?.definitionKey || null,
      name:
        definition?.name ||
        snapshot?.definitionName ||
        snapshot?.controllerType ||
        null,
      description: definition?.description || null,
      controller:
        definition?.controllerType || snapshot?.controllerType || null,
      capabilities: definition?.capabilities || null,
      defaultConfig: definition?.defaultConfig || null,
      configSchema: definition?.configSchema || null,
      resolvedConfig: snapshot?.resolvedConfig || {},
      resolvedAt: snapshot?.resolvedAt || null,
    };
  }

  private serializeOrderSpecs(order: MarketMakingOrder) {
    return {
      pair: order.pair,
      exchangeName: order.exchangeName,
      bidSpread: order.bidSpread,
      askSpread: order.askSpread,
      orderAmount: order.orderAmount,
      orderRefreshTime: order.orderRefreshTime,
      numberOfLayers: order.numberOfLayers,
      priceSourceType: order.priceSourceType,
      amountChangePerLayer: order.amountChangePerLayer,
      amountChangeType: order.amountChangeType,
      ceilingPrice: order.ceilingPrice,
      floorPrice: order.floorPrice,
    };
  }

  private serializeBalance(balance: MarketMakingOrderBalance): OrderBalanceDto {
    return {
      orderId: balance.orderId,
      assetId: balance.assetId,
      available: balance.available,
      locked: balance.locked,
      total: balance.total,
      initialDeposit: balance.initialDeposit,
      realizedDelta: balance.realizedDelta,
      feePaid: balance.feePaid,
      updatedAt: balance.updatedAt,
    };
  }

  private serializeBalancePerformance(balances: MarketMakingOrderBalance[]) {
    return {
      realizedDeltaByAsset: Object.fromEntries(
        balances.map((balance) => [balance.assetId, balance.realizedDelta]),
      ),
      feePaidByAsset: Object.fromEntries(
        balances.map((balance) => [balance.assetId, balance.feePaid]),
      ),
      pnlByAsset: Object.fromEntries(
        balances.map((balance) => [
          balance.assetId,
          new BigNumber(balance.realizedDelta || 0)
            .minus(balance.feePaid || 0)
            .toFixed(),
        ]),
      ),
    };
  }

  private serializeEvents(
    ledgerEntries: LedgerEntry[],
    executionEvents: StrategyExecutionHistory[],
  ) {
    return [
      ...ledgerEntries.map((entry) => ({
        orderId: entry.orderId,
        type: entry.type,
        timestamp: entry.createdAt,
        assetId: entry.assetId,
        amount: entry.amount,
        refType: entry.refType || null,
        refId: entry.refId || null,
        idempotencyKey: entry.idempotencyKey,
      })),
      ...executionEvents.map((event) => ({
        orderId: event.orderId || event.clientId || '',
        type: event.status || 'strategy_execution',
        timestamp: event.executedAt,
        assetId: null,
        amount: event.amount || null,
        refType: 'strategy_execution_history',
        refId: event.id,
        metadata: event.metadata || {},
      })),
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private serializeValidActions(order: MarketMakingOrder) {
    const terminal = TERMINAL_STATES.includes(order.state);

    return {
      deposit: !terminal,
      withdraw: !terminal && order.state !== 'running',
      start: STARTABLE_STATES.includes(order.state),
      pause: PAUSABLE_STATES.includes(order.state),
      resume: RESUMABLE_STATES.includes(order.state),
    };
  }

  private serializePairOption(pair: GrowdataMarketMakingPair) {
    const supportedDepositAssets = [
      pair.base_asset_id || pair.base_symbol,
      pair.quote_asset_id || pair.quote_symbol,
    ].filter((asset): asset is string => Boolean(asset));

    return {
      pairId: pair.id,
      pair: pair.symbol,
      exchangeName: pair.exchange_id,
      base: {
        assetId: pair.base_asset_id,
        symbol: pair.base_symbol,
        iconUrl: pair.base_icon_url,
        chainId: pair.base_chain_id || null,
      },
      quote: {
        assetId: pair.quote_asset_id,
        symbol: pair.quote_symbol,
        iconUrl: pair.quote_icon_url,
        chainId: pair.quote_chain_id || null,
      },
      supportedDepositAssets,
      minimums: {
        orderAmount: pair.min_order_amount || null,
        maximumOrderAmount: pair.max_order_amount || null,
      },
      precision: {
        amount: pair.amount_significant_figures || null,
        price: pair.price_significant_figures || null,
      },
      prices: {
        base: pair.base_price || null,
        quote: pair.target_price || null,
      },
      strategyCompatibility: ['pureMarketMaking'],
      unavailable: false,
    };
  }

  private validateMoneyMovement(
    order: MarketMakingOrder,
    body: MoneyMovementBody,
    action: 'deposit' | 'withdraw',
  ) {
    const assetId = String(body?.assetId || body?.asset || '').trim();
    const amount = String(body?.amount || '').trim();
    const idempotencyKey = String(body?.idempotencyKey || '').trim();

    if (!assetId) {
      throw this.badRequest('ASSET_REQUIRED', 'assetId is required');
    }
    if (!this.getSupportedAssets(order).includes(assetId)) {
      throw this.badRequest(
        'ASSET_UNSUPPORTED',
        `${assetId} is not supported for order ${order.orderId}`,
      );
    }
    this.assertPositiveAmount(amount, 'AMOUNT_INVALID');
    if (!idempotencyKey) {
      throw this.badRequest(
        'IDEMPOTENCY_KEY_REQUIRED',
        `${action} requires idempotencyKey`,
      );
    }

    return { assetId, amount: new BigNumber(amount).toFixed(), idempotencyKey };
  }

  private assertPositiveAmount(amount: string, code: string): void {
    const amountBn = new BigNumber(amount);

    if (!amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
      throw this.badRequest(code, 'amount must be a positive numeric string');
    }
  }

  private assertMutableFundingState(order: MarketMakingOrder, code: string) {
    if (TERMINAL_STATES.includes(order.state)) {
      throw new ConflictException({
        code,
        message: `Cannot move funds while order is ${order.state}`,
      });
    }
  }

  private assertState(
    order: MarketMakingOrder,
    allowedStates: MarketMakingStates[],
    code: string,
  ) {
    if (!allowedStates.includes(order.state)) {
      throw new ConflictException({
        code,
        message: `Order ${order.orderId} is ${order.state}; expected one of ${allowedStates.join(
          ', ',
        )}`,
      });
    }
  }

  private async assertRiskIncreasingAllowed(order: MarketMakingOrder) {
    const balances = await this.loadBalances(order.orderId);

    if (
      !balances.some((balance) =>
        new BigNumber(balance.total || 0).isGreaterThan(0),
      )
    ) {
      throw new ConflictException({
        code: 'ORDER_FUNDING_REQUIRED',
        message: 'Order requires an order-attributed deposit before start',
      });
    }

    for (const balance of balances) {
      if (
        this.balanceLedgerService.isReservationPaused(
          order.orderId,
          balance.assetId,
        )
      ) {
        throw new ConflictException({
          code: 'RECONCILIATION_MISMATCH',
          message:
            'Risk-increasing operation blocked by order balance reconciliation mismatch',
        });
      }
    }
  }

  private getSupportedAssets(order: MarketMakingOrder) {
    return order.pair
      .split('/')
      .map((asset) => asset.trim())
      .filter((asset) => asset.length > 0);
  }

  private badRequest(code: string, message: string) {
    return new BadRequestException({
      code,
      message,
      timestamp: getRFC3339Timestamp(),
    });
  }
}

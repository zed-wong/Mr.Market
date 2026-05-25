import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { createHash, randomUUID } from 'crypto';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { LedgerEntry } from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import {
  MarketMakingLifecycleEvent,
  MarketMakingLifecycleEventType,
} from 'src/common/entities/market-making/market-making-lifecycle-event.entity';
import { Performance } from 'src/common/entities/market-making/performance.entity';
import {
  StrategyDefinition,
  StrategyDefinitionVisibility,
} from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import type { MarketMakingStates } from 'src/common/types/orders/states';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { DataSource, Repository } from 'typeorm';

type CreateOrderBody = {
  userId?: string;
  clientRequestId?: string;
  idempotencyKey?: string;
  requestId?: string;
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

type ValidationMismatchBody = {
  assetId?: string;
  asset?: string;
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

type LifecycleRuntimeAction = 'start' | 'stop' | null;

const STARTABLE_STATES: MarketMakingStates[] = [
  'created',
  'payment_complete',
  'deposit_confirmed',
];
const PAUSABLE_STATES: MarketMakingStates[] = ['running'];
const RESUMABLE_STATES: MarketMakingStates[] = ['paused'];
const TERMINAL_STATES: MarketMakingStates[] = ['deleted', 'failed', 'refunded'];
const VALIDATION_PAIR_ID = '00000000-0000-4000-8000-000000000101';
const WEB3_MARKET_MAKING_NAMESPACE = '/web3/market-making';

@Injectable()
export class Web3MarketMakingService {
  private readonly lifecycleMutationLocks = new Map<string, Promise<void>>();
  private readonly createOrderRequests = new Map<
    string,
    {
      payloadHash: string;
      expiresAt: number;
      promise?: Promise<unknown>;
      result?: unknown;
    }
  >();

  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingOrderRepository: Repository<MarketMakingOrder>,
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
    @InjectRepository(MarketMakingLifecycleEvent)
    private readonly lifecycleEventRepository: Repository<MarketMakingLifecycleEvent>,
    private readonly userOrdersService: UserOrdersService,
    private readonly marketMakingRuntimeService: MarketMakingRuntimeService,
    private readonly balanceLedgerService: BalanceLedgerService,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async listOrders(userId: string) {
    const orders = (
      await this.userOrdersService.findMarketMakingByUserId(userId)
    ).filter((order) => order.source !== 'admin_direct');
    const balancesByOrderId = await this.loadBalancesByOrderId(
      orders.map((order) => order.orderId),
    );
    const definitionMap = await this.loadStrategyDefinitions(orders);

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
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
    const [
      balances,
      ledgerEntries,
      executionEvents,
      performanceRows,
      lifecycleEvents,
    ] = await Promise.all([
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
      this.lifecycleEventRepository.find({
        where: { orderId },
        order: { timestamp: 'ASC' },
      }),
    ]);
    const definition = order.strategyDefinitionId
      ? await this.strategyDefinitionRepository.findOne({
          where: { id: order.strategyDefinitionId },
        })
      : null;

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      order: this.serializeOrderDetail(
        order,
        balances,
        definition || undefined,
        performanceRows,
        ledgerEntries,
        executionEvents,
        lifecycleEvents,
      ),
    };
  }

  async listStrategies() {
    await this.ensureValidationOptions();
    const strategies =
      await this.userOrdersService.listEnabledMarketMakingStrategies();

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      strategies: strategies.map((strategy) => ({
        ...strategy,
        name: strategy.name || strategy.key || null,
        description: strategy.description || null,
        controller: strategy.controller || strategy.controllerType || null,
        controllerType: strategy.controllerType || strategy.controller || null,
        capabilities: strategy.capabilities || null,
        defaultConfig: strategy.defaultConfig || {},
        configSchema: strategy.configSchema || {},
      })),
    };
  }

  async listPairOptions() {
    await this.ensureValidationOptions();

    const pairs = await this.marketMakingPairRepository.find({
      where: { enable: true },
      order: { symbol: 'ASC' },
    });

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      options: pairs
        .filter((pair) => pair.enable !== false)
        .map((pair) => this.serializePairOption(pair)),
    };
  }

  async createOrder(userId: string, body: CreateOrderBody) {
    const request = this.buildCreateOrderRequest(userId, body || {});

    return await this.withCreateOrderDeduplication(request, async () =>
      this.createOrderInternal(userId, body || {}),
    );
  }

  private async createOrderInternal(userId: string, body: CreateOrderBody) {
    await this.ensureValidationOptions();

    if (Object.prototype.hasOwnProperty.call(body || {}, 'userId')) {
      throw this.badRequest(
        'USER_ID_OVERRIDE_REJECTED',
        'userId is derived from authentication and cannot be supplied',
      );
    }

    const marketMakingPairId = body?.marketMakingPairId || body?.pairId;
    const strategyDefinitionId = body?.strategyDefinitionId || body?.strategyId;

    if (!marketMakingPairId) {
      throw this.badRequest('PAIR_REQUIRED', 'marketMakingPairId is required');
    }
    if (!strategyDefinitionId) {
      throw this.badRequest(
        'STRATEGY_REQUIRED',
        'strategyDefinitionId is required',
      );
    }

    const pair = await this.marketMakingPairRepository.findOne({
      where: { id: marketMakingPairId, enable: true },
    });

    if (!pair) {
      throw new NotFoundException('Market making pair not found');
    }

    const requestedDeposit = this.validateInitialDeposit(pair, body);

    const intent = await this.userOrdersService.createMarketMakingOrderIntent({
      userId,
      marketMakingPairId,
      strategyDefinitionId,
      configOverrides: body?.configOverrides,
    });
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id: strategyDefinitionId },
    });
    const order = await this.persistCreatedOrder({
      userId,
      pair,
      strategyDefinitionId,
      intent,
      definition: definition || undefined,
    });

    await this.appendLifecycleEvent(order, 'order_created', {
      fromState: null,
      toState: order.state,
    });
    let depositResult: Awaited<
      ReturnType<BalanceLedgerService['creditDeposit']>
    > | null = null;

    if (requestedDeposit) {
      depositResult = await this.balanceLedgerService.creditDeposit({
        orderId: order.orderId,
        userId,
        assetId: requestedDeposit.assetId,
        amount: requestedDeposit.amount,
        idempotencyKey: `web3:create:${order.orderId}:${requestedDeposit.assetId}`,
        refType: 'web3_order_initial_deposit',
        refId: order.orderId,
      });
    }

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      orderId: intent.orderId,
      memo: intent.memo,
      expiresAt: intent.expiresAt,
      funding: {
        mode: requestedDeposit
          ? 'initial_deposit_recorded'
          : 'separate_deposit_required',
        depositEndpoint: `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${intent.orderId}/deposit`,
        memo: intent.memo,
        expiresAt: intent.expiresAt,
      },
      initialDeposit: {
        mode: requestedDeposit
          ? 'accepted_during_create'
          : 'separate_deposit_required',
        acceptedDuringCreate: Boolean(requestedDeposit),
        requested: requestedDeposit || body?.initialDeposit || null,
        message: requestedDeposit
          ? 'Initial deposit was recorded as an order-attributed balance during create.'
          : 'Create order records an intent; balances change after the deposit endpoint succeeds.',
      },
      balance: depositResult
        ? this.serializeBalance(depositResult.balance)
        : null,
      order: (await this.getOrderDetail(userId, order.orderId)).order,
    };
  }

  async deposit(userId: string, orderId: string, body: MoneyMovementBody) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);

    this.assertMutableFundingState(order, 'DEPOSIT_STATE_INVALID');
    const command = await this.validateMoneyMovement(order, body, 'deposit');
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
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      mutation: {
        type: 'deposit',
        applied: result.applied,
        idempotencyKey: command.idempotencyKey,
      },
      balance: this.serializeBalance(result.balance),
      order: (await this.getOrderDetail(userId, orderId)).order,
    };
  }

  async withdraw(userId: string, orderId: string, body: MoneyMovementBody) {
    const order = await this.loadOwnedPublicOrder(userId, orderId);

    this.assertMutableFundingState(order, 'WITHDRAW_STATE_INVALID');
    const command = await this.validateMoneyMovement(order, body, 'withdraw');
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
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      mutation: {
        type: 'withdraw',
        applied: result.applied,
        idempotencyKey: command.idempotencyKey,
      },
      balance: this.serializeBalance(result.balance),
      order: (await this.getOrderDetail(userId, orderId)).order,
    };
  }

  async start(userId: string, orderId: string) {
    await this.withLifecycleMutationLock(orderId, async () => {
      const order = await this.loadOwnedPublicOrder(userId, orderId);
      const fromState = order.state;

      this.assertState(order, STARTABLE_STATES, 'START_STATE_INVALID');
      await this.assertRiskIncreasingAllowed(order);

      const transition = await this.persistLifecycleTransition(order, {
        type: 'order_started',
        fromState,
        toState: 'running',
      });
      const previousLifecycleError = order.lifecycleError ?? null;
      let runtimeReservation: {
        assetId: string;
        amount: string;
        applied: boolean;
      } | null = null;

      order.state = 'running';
      order.lifecycleError = null;
      try {
        runtimeReservation = await this.ensureRuntimeStartReservation(
          order,
          userId,
        );
        await this.runLifecycleRuntimeSideEffect(order, userId, 'start');
      } catch (error) {
        if (runtimeReservation?.applied) {
          await this.releaseRuntimeStartReservation(
            order,
            userId,
            runtimeReservation,
            'start_failed',
          ).catch(() => undefined);
        }
        await this.compensateLifecycleRuntimeFailure(order, {
          eventId: transition.eventId,
          fromState,
          previousLifecycleError,
          runtimeAction: 'start',
          userId,
        });
        throw error;
      }
    });

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      mutation: { type: 'start', applied: true },
      order: (await this.getOrderDetail(userId, orderId)).order,
    };
  }

  async pause(userId: string, orderId: string) {
    await this.withLifecycleMutationLock(orderId, async () => {
      const order = await this.loadOwnedPublicOrder(userId, orderId);
      const fromState = order.state;

      this.assertState(order, PAUSABLE_STATES, 'PAUSE_STATE_INVALID');

      const transition = await this.persistLifecycleTransition(order, {
        type: 'order_paused',
        fromState,
        toState: 'paused',
      });
      const previousLifecycleError = order.lifecycleError ?? null;

      order.state = 'paused';
      order.lifecycleError = null;
      await this.runLifecycleRuntimeSideEffect(order, userId, 'stop').catch(
        async (error) => {
          await this.compensateLifecycleRuntimeFailure(order, {
            eventId: transition.eventId,
            fromState,
            previousLifecycleError,
            runtimeAction: 'stop',
            userId,
          });
          throw error;
        },
      );
    });

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      mutation: { type: 'pause', applied: true },
      order: (await this.getOrderDetail(userId, orderId)).order,
    };
  }

  async resume(userId: string, orderId: string) {
    await this.withLifecycleMutationLock(orderId, async () => {
      const order = await this.loadOwnedPublicOrder(userId, orderId);
      const fromState = order.state;

      this.assertState(order, RESUMABLE_STATES, 'RESUME_STATE_INVALID');
      await this.assertRiskIncreasingAllowed(order);

      const transition = await this.persistLifecycleTransition(order, {
        type: 'order_resumed',
        fromState,
        toState: 'running',
      });
      const previousLifecycleError = order.lifecycleError ?? null;
      let runtimeReservation: {
        assetId: string;
        amount: string;
        applied: boolean;
      } | null = null;

      order.state = 'running';
      order.lifecycleError = null;
      try {
        runtimeReservation = await this.ensureRuntimeStartReservation(
          order,
          userId,
        );
        await this.runLifecycleRuntimeSideEffect(order, userId, 'start');
      } catch (error) {
        if (runtimeReservation?.applied) {
          await this.releaseRuntimeStartReservation(
            order,
            userId,
            runtimeReservation,
            'resume_failed',
          ).catch(() => undefined);
        }
        await this.compensateLifecycleRuntimeFailure(order, {
          eventId: transition.eventId,
          fromState,
          previousLifecycleError,
          runtimeAction: 'start',
          userId,
        });
        throw error;
      }
    });

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      mutation: { type: 'resume', applied: true },
      order: (await this.getOrderDetail(userId, orderId)).order,
    };
  }

  async createValidationReconciliationMismatch(
    userId: string,
    orderId: string,
    body: ValidationMismatchBody = {},
  ) {
    this.assertValidationFixtureEnabled();
    const order = await this.loadOwnedPublicOrder(userId, orderId);
    const balances = await this.loadBalances(order.orderId);
    const requestedAssetId = String(body?.assetId || body?.asset || '').trim();
    const balance = requestedAssetId
      ? balances.find((candidate) => candidate.assetId === requestedAssetId)
      : balances.find((candidate) =>
          new BigNumber(candidate.total || 0).isGreaterThan(0),
        );

    if (!balance) {
      throw this.badRequest(
        'FIXTURE_BALANCE_REQUIRED',
        requestedAssetId
          ? `${requestedAssetId} does not have an order-attributed balance for this order`
          : 'reconciliation mismatch fixture requires an order-attributed balance',
      );
    }

    this.balanceLedgerService.pauseReservations(order.orderId, balance.assetId);

    return {
      namespace: WEB3_MARKET_MAKING_NAMESPACE,
      fixture: 'reconciliation_mismatch',
      orderId: order.orderId,
      assetId: balance.assetId,
      status: 'active',
      blocks: ['start', 'resume'],
      message:
        'Validation fixture marked this order balance as reconciliation-mismatched; risk-increasing operations are blocked until the process is reset or the balance is rebuilt.',
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

  private async ensureValidationOptions(): Promise<void> {
    const [publicStrategy, pureStrategy, validationPair] = await Promise.all([
      this.strategyDefinitionRepository.findOne({
        where: {
          enabled: true,
          visibility: StrategyDefinitionVisibility.PUBLIC,
        },
        order: { updatedAt: 'DESC' },
      }),
      this.strategyDefinitionRepository.findOne({
        where: { key: 'pure_market_making' },
      }),
      this.marketMakingPairRepository.findOne({
        where: { id: VALIDATION_PAIR_ID },
      }),
    ]);

    if (!publicStrategy) {
      await this.strategyDefinitionRepository.save(
        this.strategyDefinitionRepository.create({
          ...(pureStrategy ? { id: pureStrategy.id } : {}),
          key: 'pure_market_making',
          name: 'Pure Market Making',
          description:
            'Public validation strategy for order-first web3 market making',
          controllerType: 'pureMarketMaking',
          configSchema: {},
          defaultConfig: this.defaultPureMarketMakingConfig(),
          capabilities: {
            launchSurfaces: ['strategy_settings'],
            directExecutionMode: 'single_account',
          },
          enabled: true,
          visibility: StrategyDefinitionVisibility.PUBLIC,
          createdBy: 'web3-validation-seed',
        }),
      );
    }

    if (!validationPair) {
      await this.marketMakingPairRepository.save(
        this.marketMakingPairRepository.create({
          id: VALIDATION_PAIR_ID,
          symbol: 'ETH/USDC',
          base_symbol: 'ETH',
          quote_symbol: 'USDC',
          base_asset_id: 'ETH',
          base_icon_url: '',
          base_chain_id: '1',
          base_chain_icon_url: '',
          quote_asset_id: 'USDC',
          quote_icon_url: '',
          quote_chain_id: '1',
          quote_chain_icon_url: '',
          base_price: '',
          target_price: '',
          exchange_id: 'binance',
          custom_fee_rate: '',
          min_order_amount: '0.01',
          max_order_amount: '',
          amount_significant_figures: '6',
          price_significant_figures: '2',
          enable: true,
        }),
      );
    }
  }

  private defaultPureMarketMakingConfig(): Record<string, unknown> {
    return {
      pair: 'ETH/USDC',
      exchangeName: 'binance',
      bidSpread: 0.001,
      askSpread: 0.001,
      orderAmount: 10,
      orderRefreshTime: 15000,
      numberOfLayers: 1,
      priceSourceType: PriceSourceType.MID_PRICE,
      amountChangePerLayer: 0,
      amountChangeType: 'percentage',
      ceilingPrice: 0,
      floorPrice: 0,
    };
  }

  private async persistCreatedOrder(params: {
    userId: string;
    pair: GrowdataMarketMakingPair;
    strategyDefinitionId: string;
    intent: {
      orderId: string;
      strategySnapshot?: MarketMakingOrder['strategySnapshot'] | null;
    };
    definition?: StrategyDefinition;
  }): Promise<MarketMakingOrder> {
    const existing = await this.marketMakingOrderRepository.findOneBy({
      orderId: params.intent.orderId,
    });

    if (existing) {
      return existing;
    }

    const resolvedConfig =
      params.intent.strategySnapshot?.resolvedConfig ||
      params.definition?.defaultConfig ||
      this.defaultPureMarketMakingConfig();
    const snapshot =
      params.intent.strategySnapshot ||
      (params.definition
        ? {
            strategyDefinitionId: params.definition.id,
            definitionKey: params.definition.key,
            definitionName: params.definition.name,
            controllerType: params.definition.controllerType,
            resolvedConfig,
            resolvedAt: getRFC3339Timestamp(),
          }
        : null);
    const readConfig = (key: string, fallback: unknown): string =>
      String(resolvedConfig[key] ?? fallback);

    return await this.userOrdersService.createMarketMaking({
      orderId: params.intent.orderId,
      userId: params.userId,
      pair: params.pair.symbol,
      exchangeName: params.pair.exchange_id,
      strategyDefinitionId: params.strategyDefinitionId,
      strategySnapshot: snapshot || undefined,
      source: 'payment_flow',
      bidSpread: readConfig('bidSpread', '0.001'),
      askSpread: readConfig('askSpread', '0.001'),
      orderAmount: readConfig(
        'orderAmount',
        params.pair.min_order_amount || '10',
      ),
      orderRefreshTime: readConfig('orderRefreshTime', '15000'),
      numberOfLayers: readConfig('numberOfLayers', '1'),
      priceSourceType: readConfig(
        'priceSourceType',
        PriceSourceType.MID_PRICE,
      ) as PriceSourceType,
      amountChangePerLayer: readConfig('amountChangePerLayer', '0'),
      amountChangeType: readConfig('amountChangeType', 'percentage') as
        | 'fixed'
        | 'percentage',
      ceilingPrice: readConfig('ceilingPrice', '0'),
      floorPrice: readConfig('floorPrice', '0'),
      state: 'created',
      lifecycleError: null,
      createdAt: getRFC3339Timestamp(),
      rewardAddress: '',
    } as MarketMakingOrder);
  }

  private validateInitialDeposit(
    pair: GrowdataMarketMakingPair,
    body: CreateOrderBody,
  ): { assetId: string; amount: string } | null {
    if (!body?.initialDeposit) {
      return null;
    }

    const assetId = String(
      body.initialDeposit.assetId || body.initialDeposit.asset || '',
    ).trim();
    const amount = String(body.initialDeposit.amount || '').trim();
    const supportedAssets = [pair.base_asset_id, pair.quote_asset_id].filter(
      (asset): asset is string => Boolean(asset),
    );

    if (!assetId) {
      throw this.badRequest(
        'ASSET_REQUIRED',
        'initialDeposit.assetId is required',
      );
    }
    if (!supportedAssets.includes(assetId)) {
      throw this.badRequest(
        'ASSET_UNSUPPORTED',
        `${assetId} is not supported for pair ${pair.symbol}`,
      );
    }
    this.assertPositiveAmount(amount, 'AMOUNT_INVALID');

    return { assetId, amount: new BigNumber(amount).toFixed() };
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
    lifecycleEvents: MarketMakingLifecycleEvent[] = [],
  ) {
    return {
      ...this.serializeOrderSummary(order, balances, definition),
      events: this.serializeEvents(
        order,
        ledgerEntries,
        executionEvents,
        lifecycleEvents,
      ),
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
    order: MarketMakingOrder,
    ledgerEntries: LedgerEntry[],
    executionEvents: StrategyExecutionHistory[],
    lifecycleEvents: MarketMakingLifecycleEvent[],
  ) {
    return [
      ...(lifecycleEvents.length > 0
        ? lifecycleEvents.map((event) => ({
            orderId: event.orderId,
            type: event.type,
            timestamp: event.timestamp,
            assetId: null,
            amount: null,
            refType: event.refType || 'market_making_order_lifecycle',
            refId: event.refId || event.eventId,
            metadata: {
              ...(event.metadata || {}),
              fromState: event.fromState || null,
              toState: event.toState || null,
            },
          }))
        : [
            {
              orderId: order.orderId,
              type: 'order_created',
              timestamp: order.createdAt,
              assetId: null,
              amount: null,
              refType: 'market_making_order',
              refId: order.orderId,
              metadata: { state: 'created' },
            },
          ]),
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
      pair.quote_asset_id,
      pair.base_asset_id,
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

  private async validateMoneyMovement(
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
    const supportedAssets = await this.getSupportedAssets(order);

    if (!supportedAssets.includes(assetId)) {
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
        message: `Order ${order.orderId} is ${
          order.state
        }; expected one of ${allowedStates.join(', ')}`,
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

  private async ensureRuntimeStartReservation(
    order: MarketMakingOrder,
    userId: string,
  ): Promise<{ assetId: string; amount: string; applied: boolean } | null> {
    const balances = await this.loadBalances(order.orderId);
    const existingLocked = balances.find((balance) =>
      new BigNumber(balance.locked || 0).isGreaterThan(0),
    );

    if (existingLocked) {
      return {
        assetId: existingLocked.assetId,
        amount: '0',
        applied: false,
      };
    }

    const candidates = balances
      .filter((balance) =>
        new BigNumber(balance.available || 0).isGreaterThan(0),
      )
      .sort((left, right) =>
        new BigNumber(right.available || 0)
          .minus(left.available || 0)
          .toNumber(),
      );
    const balance = candidates[0];

    if (!balance) {
      throw new ConflictException({
        code: 'ORDER_RESERVATION_REQUIRED',
        message:
          'Order requires available order-attributed funds before runtime reservation',
      });
    }

    const available = new BigNumber(balance.available);
    const configuredOrderAmount = new BigNumber(order.orderAmount || 0);
    const amount =
      configuredOrderAmount.isFinite() && configuredOrderAmount.isGreaterThan(0)
        ? BigNumber.minimum(configuredOrderAmount, available)
        : available;

    if (!amount.isFinite() || amount.isLessThanOrEqualTo(0)) {
      throw new ConflictException({
        code: 'ORDER_RESERVATION_REQUIRED',
        message:
          'Order requires positive available order-attributed funds before runtime reservation',
      });
    }

    const result = await this.balanceLedgerService.lockFunds({
      orderId: order.orderId,
      userId,
      assetId: balance.assetId,
      amount: amount.toFixed(),
      idempotencyKey: `web3:runtime-reservation:${order.orderId}:${balance.assetId}`,
      refType: 'web3_order_runtime_reservation',
      refId: order.orderId,
    });

    return {
      assetId: balance.assetId,
      amount: amount.toFixed(),
      applied: result.applied,
    };
  }

  private async releaseRuntimeStartReservation(
    order: MarketMakingOrder,
    userId: string,
    reservation: { assetId: string; amount: string },
    reason: 'start_failed' | 'resume_failed',
  ): Promise<void> {
    await this.balanceLedgerService.unlockFunds({
      orderId: order.orderId,
      userId,
      assetId: reservation.assetId,
      amount: reservation.amount,
      idempotencyKey: `web3:runtime-reservation-release:${order.orderId}:${reservation.assetId}:${reason}`,
      refType: `web3_order_runtime_reservation_${reason}`,
      refId: order.orderId,
    });
  }

  private async getSupportedAssets(order: MarketMakingOrder) {
    const pair = await this.marketMakingPairRepository.findOne({
      where: {
        symbol: order.pair,
        exchange_id: order.exchangeName,
        enable: true,
      },
    });

    return [pair?.base_asset_id, pair?.quote_asset_id]
      .map((asset) => String(asset || '').trim())
      .filter((asset) => asset.length > 0);
  }

  private async appendLifecycleEvent(
    order: MarketMakingOrder,
    type: MarketMakingLifecycleEventType,
    params: {
      fromState: MarketMakingStates | null;
      toState: MarketMakingStates;
    },
  ): Promise<void> {
    await this.lifecycleEventRepository.save(
      this.buildLifecycleEvent(order, type, params),
    );
  }

  private buildLifecycleEvent(
    order: MarketMakingOrder,
    type: MarketMakingLifecycleEventType,
    params: {
      fromState: MarketMakingStates | null;
      toState: MarketMakingStates;
    },
  ): MarketMakingLifecycleEvent {
    return this.lifecycleEventRepository.create({
      eventId: randomUUID(),
      orderId: order.orderId,
      userId: order.userId,
      type,
      timestamp: getRFC3339Timestamp(),
      fromState: params.fromState,
      toState: params.toState,
      refType: 'market_making_order_lifecycle',
      refId: order.orderId,
      metadata: {
        exchangeName: order.exchangeName,
        pair: order.pair,
      },
    });
  }

  private async persistLifecycleTransition(
    order: MarketMakingOrder,
    params: {
      type: MarketMakingLifecycleEventType;
      fromState: MarketMakingStates;
      toState: MarketMakingStates;
    },
  ): Promise<{ eventId: string }> {
    const event = this.buildLifecycleEvent(order, params.type, {
      fromState: params.fromState,
      toState: params.toState,
    });
    const update = {
      state: params.toState,
      lifecycleError: null,
    } as Partial<MarketMakingOrder>;

    const dataSource = this.getTransactionalDataSource();

    if (dataSource) {
      await dataSource.transaction(async (manager) => {
        const result = await manager
          .getRepository(MarketMakingOrder)
          .update({ orderId: order.orderId, state: params.fromState }, update);

        if (result.affected !== 1) {
          throw new ConflictException({
            code: 'LIFECYCLE_STATE_CHANGED',
            message: `Order ${order.orderId} changed state before lifecycle mutation could be persisted`,
          });
        }

        await manager.getRepository(MarketMakingLifecycleEvent).save(event);
      });

      return { eventId: event.eventId };
    }

    try {
      await this.userOrdersService.updateMarketMakingOrderState(
        order.orderId,
        params.toState,
        null,
      );
      await this.lifecycleEventRepository.save(event);

      return { eventId: event.eventId };
    } catch (error) {
      await this.userOrdersService
        .updateMarketMakingOrderState(
          order.orderId,
          params.fromState,
          order.lifecycleError ?? null,
        )
        .catch(() => undefined);
      throw error;
    }
  }

  private async runLifecycleRuntimeSideEffect(
    order: MarketMakingOrder,
    userId: string,
    action: LifecycleRuntimeAction,
  ): Promise<void> {
    if (!order.apiKeyId || !action) {
      return;
    }

    if (action === 'start') {
      await this.marketMakingRuntimeService.startOrder(order);

      return;
    }

    await this.marketMakingRuntimeService.stopOrder(order, userId);
  }

  private async compensateLifecycleRuntimeFailure(
    order: MarketMakingOrder,
    params: {
      eventId: string;
      fromState: MarketMakingStates;
      previousLifecycleError: string | null;
      runtimeAction: LifecycleRuntimeAction;
      userId: string;
    },
  ): Promise<void> {
    if (params.runtimeAction === 'start' && order.apiKeyId) {
      await Promise.resolve(
        this.marketMakingRuntimeService.stopOrder({ ...order }, params.userId),
      ).catch(() => undefined);
    }

    await this.rollbackLifecycleTransition(order, params);
    order.state = params.fromState;
    order.lifecycleError = params.previousLifecycleError;
  }

  private async rollbackLifecycleTransition(
    order: MarketMakingOrder,
    params: {
      eventId: string;
      fromState: MarketMakingStates;
      previousLifecycleError: string | null;
    },
  ): Promise<void> {
    const dataSource = this.getTransactionalDataSource();

    if (dataSource) {
      await dataSource.transaction(async (manager) => {
        await manager
          .getRepository(MarketMakingLifecycleEvent)
          .delete({ eventId: params.eventId });

        await manager.getRepository(MarketMakingOrder).update(
          { orderId: order.orderId },
          {
            state: params.fromState,
            lifecycleError: params.previousLifecycleError,
          },
        );
      });

      return;
    }

    await this.lifecycleEventRepository
      .delete({
        eventId: params.eventId,
      } as Partial<MarketMakingLifecycleEvent>)
      .catch(() => undefined);
    await this.userOrdersService.updateMarketMakingOrderState(
      order.orderId,
      params.fromState,
      params.previousLifecycleError,
    );
  }

  private getTransactionalDataSource(): DataSource | null {
    return this.dataSource?.isInitialized ? this.dataSource : null;
  }

  private buildCreateOrderRequest(userId: string, body: CreateOrderBody) {
    const explicitKey = String(
      body?.clientRequestId || body?.idempotencyKey || body?.requestId || '',
    ).trim();
    const payload = {
      userId,
      marketMakingPairId: body?.marketMakingPairId || body?.pairId || null,
      strategyDefinitionId:
        body?.strategyDefinitionId || body?.strategyId || null,
      configOverrides: body?.configOverrides || null,
      initialDeposit: body?.initialDeposit || null,
    };
    const payloadHash = createHash('sha256')
      .update(this.stableStringify(payload))
      .digest('hex');

    return {
      key: explicitKey
        ? `explicit:${userId}:${explicitKey}`
        : `fingerprint:${payloadHash}`,
      payloadHash,
    };
  }

  private async withCreateOrderDeduplication<T>(
    request: { key: string; payloadHash: string },
    operation: () => Promise<T>,
  ): Promise<T> {
    this.pruneCreateOrderRequests();
    const existing = this.createOrderRequests.get(request.key);

    if (existing) {
      if (existing.payloadHash !== request.payloadHash) {
        throw new ConflictException({
          code: 'CREATE_IDEMPOTENCY_CONFLICT',
          message:
            'create-order idempotency key was reused with a different payload',
        });
      }
      if (existing.result !== undefined) {
        return existing.result as T;
      }
      if (existing.promise) {
        return (await existing.promise) as T;
      }
    }

    const record = {
      payloadHash: request.payloadHash,
      expiresAt: Date.now() + 2 * 60 * 1000,
    } as {
      payloadHash: string;
      expiresAt: number;
      promise?: Promise<unknown>;
      result?: unknown;
    };
    const promise = operation()
      .then((result) => {
        record.result = result;
        record.expiresAt = Date.now() + 2 * 60 * 1000;

        return result;
      })
      .catch((error) => {
        this.createOrderRequests.delete(request.key);
        throw error;
      });

    record.promise = promise;
    this.createOrderRequests.set(request.key, record);

    return await promise;
  }

  private pruneCreateOrderRequests(): void {
    const now = Date.now();

    for (const [key, record] of this.createOrderRequests.entries()) {
      if (record.expiresAt <= now) {
        this.createOrderRequests.delete(key);
      }
    }
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    }

    const objectValue = value as Record<string, unknown>;

    return `{${Object.keys(objectValue)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${this.stableStringify(objectValue[key])}`,
      )
      .join(',')}}`;
  }

  private assertValidationFixtureEnabled(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      String(process.env.MR_MARKET_ENABLE_VALIDATION_FIXTURES || '')
        .toLowerCase()
        .trim() === 'true'
    ) {
      return;
    }

    throw new NotFoundException('Validation fixture surface is not enabled');
  }

  private async withLifecycleMutationLock<T>(
    orderId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const currentTail =
      this.lifecycleMutationLocks.get(orderId) || Promise.resolve();
    let releaseCurrent: () => void = () => {};
    const nextTail = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const chainedTail = currentTail.then(() => nextTail);

    this.lifecycleMutationLocks.set(orderId, chainedTail);
    await currentTail;

    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.lifecycleMutationLocks.get(orderId) === chainedTail) {
        this.lifecycleMutationLocks.delete(orderId);
      }
    }
  }

  private badRequest(code: string, message: string) {
    return new BadRequestException({
      code,
      message,
      timestamp: getRFC3339Timestamp(),
    });
  }
}

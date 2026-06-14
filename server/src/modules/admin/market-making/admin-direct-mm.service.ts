import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import * as ccxt from 'ccxt';
import { randomUUID } from 'crypto';
import { Wallet } from 'ethers';
import { APIKeysConfig } from 'src/common/entities/admin/api-keys.entity';
import { CampaignJoin } from 'src/common/entities/campaign/campaign-join.entity';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyOrderIntentEntity } from 'src/common/entities/market-making/strategy-order-intent.entity';
import { TrackedOrderEntity } from 'src/common/entities/market-making/tracked-order.entity';
import {
  MarketMakingOrder,
  type MarketMakingOrderStrategySnapshot,
} from 'src/common/entities/orders/user-orders.entity';
import {
  createPureMarketMakingStrategyKey,
  createStrategyKey,
} from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { BalanceStateCacheService } from 'src/modules/market-making/balance-state/balance-state-cache.service';
import { BalanceStateRefreshService } from 'src/modules/market-making/balance-state/balance-state-refresh.service';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';
import { ExchangeConnectorAdapterService } from 'src/modules/market-making/execution/exchange-connector-adapter.service';
import { BalanceLedgerService } from 'src/modules/market-making/ledger/balance-ledger.service';
import { OrderReservationService } from 'src/modules/market-making/ledger/order-reservation.service';
import { assertStrategyConfigOverridesSafe } from 'src/modules/market-making/strategy/config/strategy-config-override.guard';
import type { StrategyType } from 'src/modules/market-making/strategy/config/strategy-controller.types';
import { normalizeControllerType } from 'src/modules/market-making/strategy/config/strategy-controller-aliases';
import type {
  StrategyIntentStatus,
  StrategyIntentType,
  StrategyOrderIntent,
} from 'src/modules/market-making/strategy/config/strategy-intent.types';
import type { DualAccountVolumeStrategyParams } from 'src/modules/market-making/strategy/config/strategy-params.types';
import { StrategyConfigResolverService } from 'src/modules/market-making/strategy/dex/strategy-config-resolver.service';
import { normalizeEfficientDualAccountVolumeConfig } from 'src/modules/market-making/strategy/dual-account/dual-account-config';
import {
  DualAccountPlannerService,
  type DualAccountReadinessResult,
} from 'src/modules/market-making/strategy/dual-account/dual-account-planner.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import {
  StrategyIntentQueueState,
  StrategyIntentStoreService,
} from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import {
  ExchangeOrderTrackerService,
  type TrackedOrder,
} from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import { OrderBookTrackerService } from 'src/modules/market-making/trackers/order-book-tracker.service';
import { UserStreamIngestionService } from 'src/modules/market-making/trackers/user-stream-ingestion.service';
import { UserStreamTrackerService } from 'src/modules/market-making/trackers/user-stream-tracker.service';
import { mapStrategySnapshotToMarketMakingOrderFields } from 'src/modules/market-making/user-orders/market-making-order-snapshot.utils';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { UserStreamCapabilityService } from 'src/modules/market-making/user-stream';
import { In, Not, Repository } from 'typeorm';

import {
  attachStrategyDefinitionCapabilities,
  getStrategyDefinitionCapabilities,
  type StrategyDirectExecutionMode,
} from '../strategy/strategy-definition-capabilities';
import {
  CampaignJoinRequestDto,
  DirectStartMarketMakingDto,
} from './admin-direct-mm.dto';
import {
  buildEfficientDualAccountVolumeDefinitionBackfill,
  EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_ALIASES,
} from './efficient-dual-account-definition-backfill';
import {
  buildPureMarketMakingDefinitionBackfill,
  PURE_MARKET_MAKING_DEFINITION_ALIASES,
} from './pure-market-making-definition-backfill';

const DIRECT_ORDER_STALE_MS = 15_000;
const DIRECT_RESERVED_CONFIG_FIELDS = new Set([
  'userId',
  'clientId',
  'orderId',
  'marketMakingOrderId',
  'pair',
  'symbol',
  'exchangeName',
  'controllerType',
  'strategyDefinitionId',
  'apiKeyId',
  'makerApiKeyId',
  'takerApiKeyId',
  'definitionId',
  'externalId',
  'accountLabel',
  'makerAccountLabel',
  'takerAccountLabel',
  'id',
]);
const EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE = 'efficientDualAccountVolume';

type RuntimeSessionLike = {
  orderId: string;
  cadenceMs: number;
  nextRunAtMs: number;
  accountLabel?: string;
};

type DirectOrderControllerType = string;

type AdminCampaign = Record<string, unknown> & { joined: boolean };

type DirectExecutionAccount = {
  apiKeyId: string;
  accountLabel: string;
  apiKeyName: string;
  apiKey: Record<string, any>;
};

type DirectMarketSnapshot = {
  balance?: ccxt.Balances;
  tickerPrice?: BigNumber | null;
};

type DirectCycleLegRole = 'maker' | 'taker';

type DirectCycleLegStatus =
  | 'planned'
  | 'new'
  | 'sent'
  | 'acked'
  | 'done'
  | 'pending_create'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'failed'
  | 'unknown';

type DirectCycleLeg = {
  cycleId: string;
  cycleRole: DirectCycleLegRole;
  accountLabel: string;
  side: 'buy' | 'sell';
  plannedQty: string;
  plannedPrice: string;
  filledQty: string;
  notional: string;
  status: DirectCycleLegStatus;
  failureReason: string | null;
  linkedIntentId: string | null;
  linkedTrackedOrderId: string | null;
};

type DirectCycleStatus = {
  cycleId: string;
  aggregateStatus: string;
  failureReason: string | null;
  legs: DirectCycleLeg[];
};

type DirectCycleGroup = {
  cycleId: string;
  backendIndex: number;
  legs: Map<string, DirectCycleLeg>;
};

const RUNTIME_CYCLE_COUNTER_PATTERN = /(?:^|[:_-])cycle[:_-](\d+)(?=[:_-]|$)/i;
const RUNTIME_CYCLE_TIMESTAMP_PATTERN =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;

@Injectable()
export class AdminDirectMarketMakingService {
  private readonly logger = new CustomLogger(
    AdminDirectMarketMakingService.name,
  );

  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingRepository: Repository<MarketMakingOrder>,
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(GrowdataMarketMakingPair)
    private readonly growdataMarketMakingPairRepository: Repository<GrowdataMarketMakingPair>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(CampaignJoin)
    private readonly campaignJoinRepository: Repository<CampaignJoin>,
    private readonly userOrdersService: UserOrdersService,
    private readonly marketMakingRuntimeService: MarketMakingRuntimeService,
    private readonly strategyConfigResolver: StrategyConfigResolverService,
    private readonly exchangeApiKeyService: ExchangeApiKeyService,
    private readonly exchangeInitService: ExchangeInitService,
    private readonly executorRegistry: ExecutorRegistry,
    private readonly strategyService: StrategyService,
    private readonly strategyIntentStoreService: StrategyIntentStoreService,
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    private readonly userStreamTrackerService: UserStreamTrackerService,
    private readonly orderBookTrackerService: OrderBookTrackerService,
    private readonly campaignService: CampaignService,
    private readonly configService: ConfigService,
    private readonly balanceLedgerService: BalanceLedgerService,
    private readonly orderReservationService: OrderReservationService,
    @Optional()
    private readonly userStreamIngestionService?: UserStreamIngestionService,
    @Optional()
    private readonly balanceStateCacheService?: BalanceStateCacheService,
    @Optional()
    private readonly balanceStateRefreshService?: BalanceStateRefreshService,
    @Optional()
    private readonly userStreamCapabilityService?: UserStreamCapabilityService,
    @Optional()
    private readonly dualAccountPlannerService?: DualAccountPlannerService,
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    @InjectRepository(StrategyOrderIntentEntity)
    private readonly strategyOrderIntentRepository?: Repository<StrategyOrderIntentEntity>,
    @Optional()
    @InjectRepository(StrategyExecutionHistory)
    private readonly strategyExecutionHistoryRepository?: Repository<StrategyExecutionHistory>,
    @Optional()
    @InjectRepository(TrackedOrderEntity)
    private readonly trackedOrderRepository?: Repository<TrackedOrderEntity>,
  ) {}

  async directStart(
    dto: DirectStartMarketMakingDto,
    adminUserId?: string,
  ): Promise<{ orderId: string; state: string; warnings: string[] }> {
    const directUserId = adminUserId || 'admin-direct';

    this.logger.log(`strategyDefinitionId:${dto.strategyDefinitionId}`);
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id: dto.strategyDefinitionId, enabled: true },
    });

    if (!definition) {
      throw new BadRequestException('Strategy definition not found');
    }

    const controllerType =
      this.strategyConfigResolver.getDefinitionControllerType(definition);
    const capabilities = getStrategyDefinitionCapabilities(definition);

    if (
      !capabilities.directOrderCompatible ||
      !capabilities.directExecutionMode
    ) {
      throw new BadRequestException('Strategy definition not found');
    }

    const executionAccounts = await this.resolveExecutionAccounts(
      dto,
      capabilities.directExecutionMode,
    );
    const orderId = randomUUID();

    assertStrategyConfigOverridesSafe(
      dto.configOverrides,
      DIRECT_RESERVED_CONFIG_FIELDS,
    );
    const configOverrides = dto.configOverrides || {};
    const resolverInput = this.buildDirectResolverInput(
      definition,
      configOverrides,
      {
        symbol: dto.pair,
        userId: directUserId,
        clientId: orderId,
        marketMakingOrderId: orderId,
      },
    );

    this.logger.log(
      `Admin direct-start config ${JSON.stringify({
        strategyDefinitionId: dto.strategyDefinitionId,
        controllerType,
        rawConfigOverrideKeys: Object.keys(dto.configOverrides || {}),
        sanitizedConfigOverrideKeys: Object.keys(configOverrides),
        resolverInputKeys: Object.keys(resolverInput),
      })}`,
    );

    const resolvedConfig =
      await this.strategyConfigResolver.resolveForOrderSnapshot(
        dto.strategyDefinitionId,
        resolverInput,
      );

    this.applyDirectRuntimeFields(
      resolvedConfig.resolvedConfig,
      dto,
      directUserId,
      orderId,
      executionAccounts,
      capabilities.directExecutionMode,
    );
    if (controllerType === EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE) {
      Object.assign(
        resolvedConfig.resolvedConfig,
        this.normalizeEfficientDirectConfig(resolvedConfig.resolvedConfig),
      );
    }
    if (capabilities.directExecutionMode === 'dual_account') {
      await this.preloadDirectTradingRules(
        dto.exchangeName,
        dto.pair,
        executionAccounts.primary.accountLabel,
        executionAccounts.secondary?.accountLabel,
      );
    }
    const primaryMarketSnapshot = await this.resolveDirectMarketSnapshot(
      dto.exchangeName,
      dto.pair,
      executionAccounts.primary.accountLabel,
    );

    await this.populateAdminDirectLedgerAllocations(
      dto.exchangeName,
      dto.pair,
      executionAccounts.primary.accountLabel,
      resolvedConfig.resolvedConfig,
      primaryMarketSnapshot,
    );
    this.assertAdminDirectSeedAllocationsAvailable(
      resolvedConfig.resolvedConfig,
    );

    await this.validateAccountAllocationOverlap(
      dto.exchangeName,
      dto.pair,
      executionAccounts.primary.apiKeyId,
      executionAccounts.primary.accountLabel,
      resolvedConfig.resolvedConfig,
      primaryMarketSnapshot,
    );

    const warnings =
      capabilities.directExecutionMode === 'dual_account'
        ? await this.runDualAccountBalancePreCheck(
            dto.exchangeName,
            dto.pair,
            executionAccounts,
            resolvedConfig.resolvedConfig,
            primaryMarketSnapshot,
          )
        : await this.runSingleAccountPreCheck(
            dto.exchangeName,
            dto.pair,
            executionAccounts.primary.accountLabel,
            resolvedConfig.resolvedConfig,
            primaryMarketSnapshot,
          );

    const order = this.marketMakingRepository.create({
      orderId,
      userId: directUserId,
      pair: dto.pair,
      exchangeName: dto.exchangeName,
      strategyDefinitionId: dto.strategyDefinitionId,
      strategySnapshot: resolvedConfig,
      source: 'admin_direct',
      apiKeyId: executionAccounts.primary.apiKeyId,
      ...mapStrategySnapshotToMarketMakingOrderFields(resolvedConfig),
      balanceA: this.readPositiveAmount(resolvedConfig.resolvedConfig.balanceA),
      balanceB: this.readPositiveAmount(resolvedConfig.resolvedConfig.balanceB),
      state: 'created',
      createdAt: getRFC3339Timestamp(),
      rewardAddress: null,
    });

    await this.userOrdersService.createMarketMaking(order);

    try {
      await this.ensureAdminDirectLedgerSeeded(order);
      await this.marketMakingRuntimeService.startOrder(order);
      await this.userOrdersService.updateMarketMakingOrderState(
        orderId,
        'running',
      );

      return {
        orderId,
        state: 'running',
        warnings,
      };
    } catch (error) {
      await this.userOrdersService.updateMarketMakingOrderState(
        orderId,
        'failed',
      );
      throw this.mapCCXTError(error);
    }
  }

  async directStop(
    orderId: string,
  ): Promise<{ orderId: string; state: string }> {
    const order = await this.marketMakingRepository.findOne({
      where: { orderId, source: 'admin_direct' },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.state === 'stopped') {
      await this.releaseStoppedOrderReservations(
        order,
        order.userId || 'admin-direct',
      );

      return {
        orderId,
        state: 'stopped',
      };
    }

    await this.marketMakingRuntimeService.stopOrder(
      order,
      order.userId || 'admin-direct',
    );
    await this.releaseStoppedOrderReservations(
      order,
      order.userId || 'admin-direct',
    );
    await this.userOrdersService.updateMarketMakingOrderState(
      orderId,
      'stopped',
    );

    return {
      orderId,
      state: 'stopped',
    };
  }

  async directResume(
    orderId: string,
  ): Promise<{ orderId: string; state: string; warnings: string[] }> {
    const order = await this.marketMakingRepository.findOne({
      where: { orderId, source: 'admin_direct' },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.state !== 'stopped' && order.state !== 'paused') {
      throw new BadRequestException(
        'Only paused or stopped orders can be resumed',
      );
    }

    this.backfillOrderRuntimeSnapshot(order);

    const resolvedConfig = order.strategySnapshot?.resolvedConfig || {};

    if (
      this.readControllerType(order) === EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE
    ) {
      Object.assign(
        resolvedConfig,
        this.normalizeEfficientDirectConfig(resolvedConfig),
      );
    }
    if (this.isDualAccountMode(order)) {
      await this.preloadDirectTradingRules(
        order.exchangeName,
        order.pair,
        this.readMakerAccountLabel(order),
        this.readTakerAccountLabel(order),
      );
    }
    const primaryAccountLabel = this.isDualAccountMode(order)
      ? this.readMakerAccountLabel(order)
      : this.readPrimaryAccountLabel(order);
    const primaryMarketSnapshot = await this.resolveDirectMarketSnapshot(
      order.exchangeName,
      order.pair,
      primaryAccountLabel,
    );

    await this.populateAdminDirectLedgerAllocations(
      order.exchangeName,
      order.pair,
      primaryAccountLabel,
      resolvedConfig,
      primaryMarketSnapshot,
    );
    order.balanceA =
      this.readPositiveAmount(order.balanceA) ||
      this.readPositiveAmount(resolvedConfig.balanceA) ||
      order.balanceA;
    order.balanceB =
      this.readPositiveAmount(order.balanceB) ||
      this.readPositiveAmount(resolvedConfig.balanceB) ||
      order.balanceB;
    await this.reallocateAdminDirectOrderToAvailableBalance(
      order,
      resolvedConfig,
      primaryMarketSnapshot,
    );
    const warnings = this.isDualAccountMode(order)
      ? await this.runDualAccountBalancePreCheck(
          order.exchangeName,
          order.pair,
          {
            primary: {
              accountLabel: this.readMakerAccountLabel(order),
            },
            secondary: {
              accountLabel: this.readTakerAccountLabel(order),
            },
          },
          resolvedConfig,
          primaryMarketSnapshot,
        )
      : await this.runSingleAccountPreCheck(
          order.exchangeName,
          order.pair,
          primaryAccountLabel,
          resolvedConfig,
          primaryMarketSnapshot,
        );

    await this.validateAccountAllocationOverlap(
      order.exchangeName,
      order.pair,
      order.apiKeyId,
      primaryAccountLabel,
      resolvedConfig,
      primaryMarketSnapshot,
      order.orderId,
    );

    try {
      await this.ensureAdminDirectLedgerSeeded(order);
      await this.marketMakingRuntimeService.startOrder(order);
      await this.userOrdersService.updateMarketMakingOrderState(
        orderId,
        'running',
      );

      return {
        orderId,
        state: 'running',
        warnings,
      };
    } catch (error) {
      await this.userOrdersService.updateMarketMakingOrderState(
        orderId,
        'failed',
      );
      throw this.mapCCXTError(error);
    }
  }

  async removeDirectOrder(
    orderId: string,
  ): Promise<{ orderId: string; state: string }> {
    const order = await this.marketMakingRepository.findOne({
      where: { orderId, source: 'admin_direct' },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const canRemoveGoneRunningOrder =
      order.state === 'running' &&
      this.resolveExecutorHealth(this.getRuntimeSession(order.orderId)) ===
        'gone';

    if (
      order.state !== 'stopped' &&
      order.state !== 'failed' &&
      !canRemoveGoneRunningOrder
    ) {
      throw new BadRequestException(
        'Only stopped or failed orders can be removed',
      );
    }

    await this.cancelActiveTrackedOrdersBeforeRemoval(order);
    await this.releaseStoppedOrderReservations(
      order,
      order.userId || 'admin-direct',
    );
    this.assertNoActiveTrackedOrdersBeforeRemoval(order);

    await this.marketMakingRepository.update(
      {
        orderId,
        source: 'admin_direct',
      },
      {
        state: 'deleted',
      },
    );

    return {
      orderId,
      state: 'removed',
    };
  }

  private async cancelActiveTrackedOrdersBeforeRemoval(
    order: MarketMakingOrder,
  ): Promise<void> {
    if (!this.getActiveTrackedOrders(order).length) {
      return;
    }

    try {
      await this.marketMakingRuntimeService.stopOrder(
        order,
        order.userId || 'admin-direct',
      );
    } catch (error) {
      if (this.getActiveTrackedOrders(order).length) {
        throw error;
      }
    }
  }

  private assertNoActiveTrackedOrdersBeforeRemoval(
    order: MarketMakingOrder,
  ): void {
    const activeOrders = this.getActiveTrackedOrders(order);

    if (!activeOrders.length) {
      return;
    }

    throw new BadRequestException(
      `Cannot remove direct order ${order.orderId}: ${activeOrders.length} active exchange order(s) remain after cancellation`,
    );
  }

  async listDirectOrders() {
    const orders = await this.marketMakingRepository.find({
      where: { source: 'admin_direct', state: Not('deleted') },
      order: { createdAt: 'DESC' },
    });
    const strategyDefinitionIds = orders
      .map((order) => order.strategyDefinitionId)
      .filter((value): value is string => Boolean(value));
    const definitions = strategyDefinitionIds.length
      ? await this.strategyDefinitionRepository.find({
          where: { id: In(strategyDefinitionIds) },
        })
      : [];
    const definitionMap = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );

    return await Promise.all(
      orders.map(async (order) => {
        const makerAccountName = await this.readApiKeyName(
          order.apiKeyId,
          this.readMakerAccountLabel(order),
        );
        const takerAccountName = await this.readApiKeyName(
          this.readTakerApiKeyId(order),
          this.readTakerAccountLabel(order),
        );
        const session = this.getRuntimeSession(order.orderId);
        const strategyKey = this.buildStrategyKey(order);
        const queueState =
          order.state === 'running'
            ? await this.strategyIntentStoreService.getQueueState(strategyKey)
            : null;
        const status = this.resolveRuntimeState(
          order.state,
          session,
          queueState,
        );
        const lastTickAt = this.getEstimatedLastTickAt(session);
        const warnings: string[] = [];

        if (
          lastTickAt &&
          Date.now() - Date.parse(lastTickAt) > DIRECT_ORDER_STALE_MS
        ) {
          warnings.push('executor_stale');
        }

        if (queueState?.blockedByFailure) {
          warnings.push('execution_blocked');
        }

        return {
          orderId: order.orderId,
          exchangeName: order.exchangeName,
          pair: order.pair,
          state: order.state,
          runtimeState: status,
          strategyDefinitionId: order.strategyDefinitionId,
          strategyName:
            definitionMap.get(order.strategyDefinitionId || '')?.name ||
            order.strategySnapshot?.controllerType ||
            '',
          controllerType: this.readControllerType(order),
          directExecutionMode: this.resolveDirectExecutionMode(
            order,
            definitionMap,
          ),
          createdAt: order.createdAt,
          lastTickAt,
          accountLabel: makerAccountName,
          makerAccountLabel: this.readMakerAccountLabel(order),
          takerAccountLabel: this.readTakerAccountLabel(order),
          makerAccountName,
          takerAccountName,
          apiKeyId: order.apiKeyId || null,
          makerApiKeyId: order.apiKeyId || null,
          takerApiKeyId: this.readTakerApiKeyId(order) || null,
          warnings,
        };
      }),
    );
  }

  async getDirectOrderStatus(orderId: string) {
    const order = await this.marketMakingRepository.findOne({
      where: { orderId, source: 'admin_direct' },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const controllerType = this.readControllerType(order);
    const isEfficientDualAccount =
      controllerType === EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE;
    const strategyKey = this.buildStrategyKey(order);
    const resolvedConfig = await this.resolveLiveOrderConfig(
      order,
      strategyKey,
    );
    const readiness = isEfficientDualAccount
      ? await this.evaluateEfficientReadinessFromConfig({
          ...resolvedConfig,
          exchangeName: order.exchangeName,
          symbol: order.pair,
          pair: order.pair,
          userId: order.userId || 'admin-direct',
          clientId: order.orderId,
          marketMakingOrderId: order.orderId,
          makerAccountLabel:
            this.readMakerAccountLabel(order) ||
            String(resolvedConfig.makerAccountLabel || ''),
          takerAccountLabel:
            this.readTakerAccountLabel(order) ||
            String(resolvedConfig.takerAccountLabel || ''),
        })
      : null;
    const primaryAccountLabel = this.readPrimaryAccountLabel(order);
    const session = this.getRuntimeSession(orderId);
    const lastTickAt = this.getEstimatedLastTickAt(session);
    const queueState =
      order.state === 'running'
        ? await this.strategyIntentStoreService.getQueueState(strategyKey)
        : null;
    const isDualAccount = this.isDualAccountMode(order);
    const privateEvent = !isDualAccount
      ? this.userStreamTrackerService.getLatestEvent(
          order.exchangeName,
          primaryAccountLabel,
        )
      : null;
    const openOrders =
      this.exchangeOrderTrackerService.getLiveOrders(strategyKey);
    const cachedTrackedOrders = this.getTrackedOrders(strategyKey);
    const latestIntents =
      order.state === 'stopped'
        ? []
        : this.strategyService.getLatestIntentsForStrategy(strategyKey);
    const durableRuntimeCycleSources = isEfficientDualAccount
      ? await this.loadDurableRuntimeCycleSources(
          order,
          strategyKey,
          latestIntents,
          cachedTrackedOrders,
        )
      : {
          intents: latestIntents,
          trackedOrders: cachedTrackedOrders,
          executionHistory: [],
        };
    const intents = durableRuntimeCycleSources.intents;
    const trackedOrders = durableRuntimeCycleSources.trackedOrders;
    const book = this.orderBookTrackerService.getOrderBook(
      order.exchangeName,
      order.pair,
    );

    const inventoryBalances: Array<{
      asset: string;
      free: string;
      used: string;
      total: string;
      accountLabel?: string;
      source?: string;
    }> = [];

    const [baseAsset, quoteAsset] = this.parsePair(order.pair);
    const assets = [baseAsset, quoteAsset].filter(Boolean);
    const makerAccountName = await this.readApiKeyName(
      order.apiKeyId,
      this.readMakerAccountLabel(order),
    );
    const takerAccountName = await this.readApiKeyName(
      this.readTakerApiKeyId(order),
      this.readTakerAccountLabel(order),
    );
    const takerAccountLabel = this.isDualAccountMode(order)
      ? this.readTakerAccountLabel(order)
      : '';
    const accountsToFetch: Array<{ label: string; tag: string }> = [
      { label: primaryAccountLabel, tag: takerAccountLabel ? 'maker' : '' },
    ];

    if (takerAccountLabel) {
      accountsToFetch.push({ label: takerAccountLabel, tag: 'taker' });
    }

    const balanceCacheStatus = accountsToFetch.flatMap(({ label, tag }) =>
      assets.map((asset) => {
        const cached = this.balanceStateCacheService?.getBalance(
          order.exchangeName,
          label,
          asset,
        );

        return {
          asset,
          accountLabel: tag || label,
          source: cached?.source || 'missing',
          freshnessTimestamp: cached?.freshnessTimestamp || null,
          stale: this.balanceStateCacheService?.isStale(cached) ?? true,
        };
      }),
    );
    const userStreamCapabilities = accountsToFetch.map(({ label, tag }) => ({
      accountLabel: tag || label,
      ...this.userStreamCapabilityService?.getCapabilities(
        order.exchangeName,
        label,
      ),
    }));
    const streamHealth = accountsToFetch.map(({ label, tag }) => ({
      accountLabel: tag || label,
      ...this.userStreamIngestionService?.getWatcherState({
        exchange: order.exchangeName,
        accountLabel: label,
        symbol: order.pair,
      }),
      state:
        this.balanceStateRefreshService?.getHealthState(
          order.exchangeName,
          label,
        ) || 'silent',
      lastEventAt:
        this.userStreamTrackerService.getLatestEvent(order.exchangeName, label)
          ?.receivedAt || null,
      lastBalanceRefreshAt:
        this.balanceStateRefreshService?.getLastRefreshTime(
          order.exchangeName,
          label,
        ) || null,
    }));
    const userStreamRuntime = {
      activeWatcherCount:
        this.userStreamIngestionService?.getActiveWatcherCount() || 0,
      queueDepth: this.userStreamTrackerService.getQueueDepth(),
      duplicateFillSuppressionCount:
        this.userStreamTrackerService.getDuplicateFillSuppressionCount(),
    };

    for (const { label, tag } of accountsToFetch) {
      try {
        let balance: Record<string, any> | undefined;
        const isCacheFresh = assets.every((asset) => {
          const cached = this.balanceStateCacheService?.getBalance(
            order.exchangeName,
            label,
            asset,
          );

          return this.balanceStateCacheService?.isFresh(cached) ?? false;
        });

        if (!isCacheFresh && !isEfficientDualAccount) {
          const exchange = this.exchangeInitService.getExchange(
            order.exchangeName,
            label,
          );

          balance = await exchange.fetchBalance();
          this.balanceStateCacheService?.applyBalanceSnapshot(
            order.exchangeName,
            label,
            balance || {},
            getRFC3339Timestamp(),
            'rest',
          );
        }

        for (const asset of assets) {
          const cached = this.balanceStateCacheService?.getBalance(
            order.exchangeName,
            label,
            asset,
          );

          inventoryBalances.push({
            asset,
            free: String(cached?.free ?? balance?.free?.[asset] ?? 0),
            used: String(cached?.used ?? balance?.used?.[asset] ?? 0),
            total: String(cached?.total ?? balance?.total?.[asset] ?? 0),
            source: cached?.source || (isCacheFresh ? 'unknown' : 'rest'),
            ...(tag ? { accountLabel: tag } : {}),
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch inventory for direct order ${orderId} (${label}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const spread =
      book?.bids?.[0] && book?.asks?.[0]
        ? {
            bid: String(book.bids[0][0]),
            ask: String(book.asks[0][0]),
            absolute: new BigNumber(book.asks[0][0])
              .minus(book.bids[0][0])
              .toString(),
          }
        : null;

    const executorHealth = this.resolveExecutorHealth(session);
    const executor = this.executorRegistry.findExecutorByOrderId(orderId);
    const recentErrors =
      executor && typeof executor.getRecentErrors === 'function'
        ? executor.getRecentErrors(orderId)
        : [];
    const runtimeState = this.resolveRuntimeState(
      order.state,
      session,
      queueState,
    );

    if (
      queueState?.blockedByFailure &&
      queueState.failedHeadUpdatedAt &&
      queueState.failedHeadErrorReason &&
      !recentErrors.some(
        (entry) =>
          entry.ts === queueState.failedHeadUpdatedAt &&
          entry.message === queueState.failedHeadErrorReason,
      )
    ) {
      recentErrors.unshift({
        ts: queueState.failedHeadUpdatedAt,
        message: queueState.failedHeadErrorReason,
      });
    }

    const cycles = this.buildRuntimeCycleStatuses(
      resolvedConfig,
      intents,
      trackedOrders,
      durableRuntimeCycleSources.executionHistory,
      queueState,
    );
    const runtimeCycleMetrics = this.computeRuntimeCycleMetrics(cycles);
    const configuredPublishedCycles = this.readConfigNumber(
      resolvedConfig.publishedCycles,
    );
    const configuredCompletedCycles = this.readConfigNumber(
      resolvedConfig.completedCycles,
    );
    const configuredTradedQuoteVolume = this.readConfigString(
      resolvedConfig.tradedQuoteVolume,
    );
    const orderConfig = {
      orderAmount: this.readConfigString(
        resolvedConfig.orderAmount ??
          resolvedConfig.maxOrderAmount ??
          resolvedConfig.baseTradeAmount,
      ),
      bidSpread: this.readConfigString(resolvedConfig.bidSpread),
      askSpread: this.readConfigString(resolvedConfig.askSpread),
      numberOfLayers: this.readConfigString(resolvedConfig.numberOfLayers),
      baseIntervalTime: this.readConfigNumber(
        resolvedConfig.interval ?? resolvedConfig.baseIntervalTime,
      ),
      numTrades: this.readConfigNumber(resolvedConfig.numTrades),
      baseIncrementPercentage: this.readConfigString(
        resolvedConfig.baseIncrementPercentage,
      ),
      pricePushRate: this.readConfigString(resolvedConfig.pricePushRate),
      postOnlySide: this.readConfigString(resolvedConfig.postOnlySide),
      dynamicRoleSwitching:
        typeof resolvedConfig.dynamicRoleSwitching === 'boolean'
          ? resolvedConfig.dynamicRoleSwitching
          : null,
      targetQuoteVolume: this.readConfigString(
        resolvedConfig.dailyVolumeTarget ?? resolvedConfig.targetQuoteVolume,
      ),
      cadenceVariance: this.readConfigString(resolvedConfig.cadenceVariance),
      tradeAmountVariance: this.readConfigString(
        resolvedConfig.tradeAmountVariance,
      ),
      priceOffsetVariance: this.readConfigString(
        resolvedConfig.priceOffsetVariance,
      ),
      publishedCycles:
        configuredPublishedCycles === null && cycles.length === 0
          ? null
          : Math.max(configuredPublishedCycles ?? 0, cycles.length),
      completedCycles:
        configuredCompletedCycles === null && cycles.length === 0
          ? null
          : Math.max(
              configuredCompletedCycles ?? 0,
              runtimeCycleMetrics.completedCycles,
            ),
      tradedQuoteVolume: runtimeCycleMetrics.tradedQuoteVolume.isGreaterThan(0)
        ? runtimeCycleMetrics.tradedQuoteVolume.toFixed()
        : configuredTradedQuoteVolume,
      realizedPnlQuote: this.readConfigString(resolvedConfig.realizedPnlQuote),
    };

    return {
      orderId,
      state: order.state,
      runtimeState,
      controllerType,
      directExecutionMode: this.resolveDirectExecutionModeFromOrder(order),
      accountLabel: makerAccountName,
      makerAccountLabel: this.readMakerAccountLabel(order),
      takerAccountLabel: this.readTakerAccountLabel(order),
      makerAccountName,
      takerAccountName,
      apiKeyId: order.apiKeyId || null,
      makerApiKeyId: order.apiKeyId || null,
      takerApiKeyId: this.readTakerApiKeyId(order) || null,
      executorHealth,
      lastTickAt,
      lastUpdatedAt:
        queueState?.blockedByFailure && queueState.failedHeadUpdatedAt
          ? queueState.failedHeadUpdatedAt
          : privateEvent?.receivedAt || lastTickAt || order.createdAt,
      privateStreamEventAt: privateEvent?.receivedAt || null,
      openOrders,
      intents,
      fillCount1h: this.exchangeOrderTrackerService.getFillCount(
        strategyKey,
        60 * 60 * 1000,
      ),
      recentErrors,
      orderConfig,
      readiness,
      cycles,
      spread,
      inventoryBalances,
      balanceCacheStatus,
      userStreamCapabilities,
      userStreamRuntime,
      streamHealth,
      stale: executorHealth === 'stale',
    };
  }

  private async resolveLiveOrderConfig(
    order: MarketMakingOrder,
    strategyKey: string,
  ): Promise<Record<string, unknown>> {
    const snapshotConfig = order.strategySnapshot?.resolvedConfig || {};

    if (typeof this.strategyService.getStrategyInstanceKey !== 'function') {
      return snapshotConfig;
    }

    try {
      const strategyInstance =
        await this.strategyService.getStrategyInstanceKey(strategyKey);

      if (!strategyInstance?.parameters) {
        return snapshotConfig;
      }

      return {
        ...snapshotConfig,
        ...strategyInstance.parameters,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to read live strategy params for direct order ${
          order.orderId
        }: ${error instanceof Error ? error.message : String(error)}`,
      );

      return snapshotConfig;
    }
  }

  async listCampaigns(): Promise<AdminCampaign[]> {
    const campaigns = await this.campaignService.getCampaigns();
    const walletStatus = await this.getWalletStatus();

    if (!walletStatus.address) {
      return campaigns.map((campaign) => ({
        ...campaign,
        joined: false,
        apiKeyId: null,
        apiKeyName: null,
      }));
    }

    let joinedKeys: Set<string>;

    try {
      const privateKey = this.configService.get<string>('web3.private_key');

      const accessToken = await this.campaignService.getAccessToken(
        walletStatus.address,
        privateKey,
      );

      joinedKeys =
        await this.campaignService.getJoinedCampaignKeys(accessToken);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch joined campaigns: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      joinedKeys = new Set();
    }

    const joinedBindings = await this.campaignJoinRepository.find({
      where: {
        evmAddress: walletStatus.address.toLowerCase(),
        status: 'joined',
      },
    });
    const apiKeyNamesById = await this.readApiKeyNamesById(joinedBindings);
    const bindingsByCampaignKey = new Map<string, CampaignJoin>();

    for (const binding of joinedBindings) {
      bindingsByCampaignKey.set(
        `${binding.chainId}:${binding.campaignAddress.toLowerCase()}`,
        binding,
      );
    }

    return campaigns.map((campaign) => {
      const key = `${campaign.chain_id}:${campaign.address.toLowerCase()}`;
      const binding = bindingsByCampaignKey.get(key);
      const apiKeyId = binding?.apiKeyId || null;
      const apiKeyName =
        apiKeyId === null ? null : apiKeyNamesById.get(apiKeyId) || 'Deleted';

      return {
        ...campaign,
        joined: joinedKeys.has(key),
        apiKeyId,
        apiKeyName,
      };
    });
  }

  async joinCampaign(dto: CampaignJoinRequestDto) {
    const normalizedChainId =
      Number(dto.chainId) > 0 ? Number(dto.chainId) : 137;
    const apiKey = await this.exchangeApiKeyService.readDecryptedAPIKey(
      dto.apiKeyId,
    );

    if (!apiKey) {
      throw new BadRequestException('API key not found');
    }

    const privateKey = this.configService.get<string>('web3.private_key');

    if (!privateKey) {
      throw new BadRequestException('WEB3 private key is not configured');
    }

    if (!apiKey.exchange || !apiKey.api_key || !apiKey.api_secret) {
      throw new BadRequestException('Exchange API key is incomplete');
    }

    if (apiKey.permissions !== 'read') {
      throw new BadRequestException(
        'Only read-only API keys can be registered with Hufi Recording Oracle. Using executable keys would expose trading credentials.',
      );
    }

    try {
      await this.campaignService.joinCampaignWithAuth(
        dto.evmAddress.toLowerCase(),
        privateKey,
        apiKey.exchange,
        apiKey.api_key,
        apiKey.api_secret,
        normalizedChainId,
        dto.campaignAddress.toLowerCase(),
      );
    } catch (error) {
      throw this.mapCampaignJoinError(error);
    }

    const timestamp = getRFC3339Timestamp();
    const existingBinding = await this.campaignJoinRepository.findOne({
      where: {
        evmAddress: dto.evmAddress.toLowerCase(),
        apiKeyId: dto.apiKeyId,
        chainId: normalizedChainId,
        campaignAddress: dto.campaignAddress.toLowerCase(),
      },
    });

    if (existingBinding) {
      await this.campaignJoinRepository.update(
        { id: existingBinding.id },
        {
          status: 'joined',
          updatedAt: timestamp,
        },
      );
    } else {
      await this.campaignJoinRepository.save(
        this.campaignJoinRepository.create({
          id: randomUUID(),
          evmAddress: dto.evmAddress.toLowerCase(),
          apiKeyId: dto.apiKeyId,
          chainId: normalizedChainId,
          campaignAddress: dto.campaignAddress.toLowerCase(),
          status: 'joined',
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
    }

    return {
      status: 'joined',
      apiKeyId: dto.apiKeyId,
      campaignAddress: dto.campaignAddress.toLowerCase(),
      chainId: normalizedChainId,
    };
  }

  private async readApiKeyNamesById(
    bindings: CampaignJoin[],
  ): Promise<Map<string, string>> {
    const apiKeyIds = Array.from(
      new Set(bindings.map((binding) => binding.apiKeyId).filter(Boolean)),
    );

    if (apiKeyIds.length === 0) {
      return new Map();
    }

    const apiKeys = await Promise.all(
      apiKeyIds.map(async (apiKeyId) => {
        const apiKey = await this.exchangeApiKeyService.readAPIKey(apiKeyId);

        return apiKey ? ({ apiKeyId, apiKey } as const) : null;
      }),
    );

    return new Map(
      apiKeys
        .filter((entry): entry is { apiKeyId: string; apiKey: APIKeysConfig } =>
          Boolean(entry),
        )
        .map(({ apiKeyId, apiKey }) => [apiKeyId, apiKey.name]),
    );
  }

  async getWalletStatus(): Promise<{
    configured: boolean;
    address: string | null;
  }> {
    const privateKey = this.configService.get<string>('web3.private_key');

    if (!privateKey) {
      return {
        configured: false,
        address: null,
      };
    }

    try {
      return {
        configured: true,
        address: new Wallet(privateKey).address,
      };
    } catch {
      return {
        configured: false,
        address: null,
      };
    }
  }

  async listDirectStrategyDefinitions(): Promise<StrategyDefinition[]> {
    const definitions = await this.strategyDefinitionRepository.find({
      order: { updatedAt: 'DESC' },
    });
    let backfilledDefinitions =
      await this.ensureEfficientDualAccountDefinition(definitions);

    backfilledDefinitions = await this.ensurePureMarketMakingDefinition(
      backfilledDefinitions,
    );

    return backfilledDefinitions
      .map((definition) => attachStrategyDefinitionCapabilities(definition))
      .filter((definition) => {
        const controllerType = normalizeControllerType(
          String(definition.controllerType || '').trim(),
        );
        const visibility = String(definition.visibility || 'admin').trim();

        return (
          definition.enabled === true &&
          ['public', 'admin'].includes(visibility) &&
          controllerType.length > 0 &&
          definition.directOrderCompatible
        );
      });
  }

  private async ensureEfficientDualAccountDefinition(
    definitions: StrategyDefinition[],
  ): Promise<StrategyDefinition[]> {
    const existing = definitions.find((definition) => {
      const controllerType = normalizeControllerType(
        String(definition.controllerType || '').trim(),
      );

      return (
        controllerType === EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE ||
        EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_ALIASES.includes(
          String(
            definition.key || '',
          ).trim() as (typeof EFFICIENT_DUAL_ACCOUNT_VOLUME_DEFINITION_ALIASES)[number],
        )
      );
    });

    if (existing) {
      const capabilities = getStrategyDefinitionCapabilities(existing);
      const isDirectCompatible =
        existing.enabled === true &&
        String(existing.visibility || 'admin').trim() === 'admin' &&
        capabilities.directOrderCompatible &&
        capabilities.directExecutionMode === 'dual_account';

      if (isDirectCompatible) {
        return definitions;
      }

      const saved = (await this.strategyDefinitionRepository.save(
        buildEfficientDualAccountVolumeDefinitionBackfill(existing),
      )) as StrategyDefinition;

      return definitions.map((definition) =>
        definition.id === existing.id ? saved : definition,
      );
    }

    const saved = (await this.strategyDefinitionRepository.save(
      buildEfficientDualAccountVolumeDefinitionBackfill(),
    )) as StrategyDefinition;

    return [saved, ...definitions];
  }

  private async ensurePureMarketMakingDefinition(
    definitions: StrategyDefinition[],
  ): Promise<StrategyDefinition[]> {
    const existing = definitions.find((definition) => {
      const controllerType = normalizeControllerType(
        String(definition.controllerType || '').trim(),
      );

      return (
        controllerType === 'pureMarketMaking' ||
        PURE_MARKET_MAKING_DEFINITION_ALIASES.includes(
          String(
            definition.key || '',
          ).trim() as (typeof PURE_MARKET_MAKING_DEFINITION_ALIASES)[number],
        )
      );
    });

    if (existing) {
      const capabilities = getStrategyDefinitionCapabilities(existing);
      const isDirectCompatible =
        existing.enabled === true &&
        ['public', 'admin'].includes(
          String(existing.visibility || 'admin').trim(),
        ) &&
        capabilities.directOrderCompatible &&
        capabilities.directExecutionMode === 'single_account';

      if (isDirectCompatible) {
        return definitions;
      }

      const saved = (await this.strategyDefinitionRepository.save(
        buildPureMarketMakingDefinitionBackfill(existing),
      )) as StrategyDefinition;

      return definitions.map((definition) =>
        definition.id === existing.id ? saved : definition,
      );
    }

    const saved = (await this.strategyDefinitionRepository.save(
      buildPureMarketMakingDefinitionBackfill(),
    )) as StrategyDefinition;

    return [saved, ...definitions];
  }

  mapCCXTError(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    if (error instanceof ccxt.AuthenticationError) {
      return new BadRequestException('API key authentication failed');
    }
    if (error instanceof ccxt.RateLimitExceeded) {
      return new BadRequestException('Rate limited, try again');
    }
    if (error instanceof ccxt.NetworkError) {
      return new BadRequestException('Exchange timeout');
    }
    if (error instanceof ccxt.ExchangeError) {
      return new BadRequestException(
        error.message || 'Exchange rejected request',
      );
    }

    return new BadRequestException(
      error instanceof Error ? error.message : 'Unknown market-making error',
    );
  }

  private normalizeEfficientDirectConfig(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    try {
      return normalizeEfficientDualAccountVolumeConfig(config, {
        requireAccounts: true,
        requireMarket: true,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async evaluateEfficientReadinessFromConfig(
    config: Record<string, unknown>,
  ): Promise<DualAccountReadinessResult> {
    if (!this.dualAccountPlannerService) {
      throw new BadRequestException(
        'Planner readiness evaluator is unavailable',
      );
    }

    return this.dualAccountPlannerService.evaluateEfficientDualAccountReadiness(
      config as DualAccountVolumeStrategyParams,
    );
  }

  private async preloadDirectTradingRules(
    exchangeName: string,
    pair: string,
    primaryAccountLabel: string,
    secondaryAccountLabel?: string,
  ): Promise<void> {
    if (!this.exchangeConnectorAdapterService) {
      return;
    }

    const accountLabels = [primaryAccountLabel, secondaryAccountLabel]
      .map((value) => String(value || '').trim())
      .filter(
        (value, index, values) => value && values.indexOf(value) === index,
      );

    for (const accountLabel of accountLabels) {
      await this.exchangeConnectorAdapterService.loadTradingRules(
        exchangeName,
        pair,
        accountLabel,
      );
    }
  }

  private mapCampaignJoinError(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    return new BadRequestException(
      error instanceof Error ? error.message : 'Campaign join failed',
    );
  }

  private async resolveExecutionAccounts(
    dto: DirectStartMarketMakingDto,
    directExecutionMode: StrategyDirectExecutionMode,
  ): Promise<{
    primary: DirectExecutionAccount;
    secondary?: DirectExecutionAccount;
  }> {
    if (directExecutionMode === 'dual_account') {
      const maker = await this.validateExecutionAccount(
        dto.makerApiKeyId,
        dto.exchangeName,
      );
      const taker = await this.validateExecutionAccount(
        dto.takerApiKeyId,
        dto.exchangeName,
      );

      if (maker.apiKeyId === taker.apiKeyId) {
        throw new BadRequestException(
          'Maker and taker API keys must be different',
        );
      }

      return { primary: maker, secondary: taker };
    }

    return {
      primary: await this.validateExecutionAccount(
        dto.apiKeyId,
        dto.exchangeName,
      ),
    };
  }

  private async validateExecutionAccount(
    apiKeyId: string | undefined,
    exchangeName: string,
  ): Promise<DirectExecutionAccount> {
    if (!apiKeyId) {
      throw new BadRequestException('API key not found');
    }

    const apiKey = await this.exchangeApiKeyService.readAPIKey(apiKeyId);

    if (!apiKey) {
      throw new BadRequestException('API key not found');
    }

    if (apiKey.exchange !== exchangeName) {
      throw new BadRequestException('API key exchange does not match request');
    }

    if (String(apiKey.permissions || '').trim() !== 'read-trade') {
      throw new BadRequestException('API key must have read-trade permissions');
    }

    const accountLabel = String(apiKey.key_id || '').trim();

    if (!accountLabel) {
      throw new BadRequestException('API key identity is invalid');
    }

    return {
      apiKeyId,
      accountLabel,
      apiKeyName: String(apiKey.name || '').trim(),
      apiKey,
    };
  }

  private applyDirectRuntimeFields(
    resolvedConfig: Record<string, unknown>,
    dto: Pick<DirectStartMarketMakingDto, 'exchangeName' | 'pair'>,
    userId: string,
    orderId: string,
    executionAccounts: {
      primary: DirectExecutionAccount;
      secondary?: DirectExecutionAccount;
    },
    directExecutionMode: StrategyDirectExecutionMode,
  ): void {
    if (directExecutionMode === 'dual_account') {
      resolvedConfig.makerAccountLabel = executionAccounts.primary.accountLabel;
      resolvedConfig.takerAccountLabel =
        executionAccounts.secondary?.accountLabel;
      resolvedConfig.makerApiKeyId = executionAccounts.primary.apiKeyId;
      resolvedConfig.takerApiKeyId = executionAccounts.secondary?.apiKeyId;
    } else {
      resolvedConfig.accountLabel = executionAccounts.primary.accountLabel;
    }

    resolvedConfig.userId = userId;
    resolvedConfig.clientId = orderId;
    resolvedConfig.marketMakingOrderId = orderId;
    resolvedConfig.pair = dto.pair;
    resolvedConfig.symbol = dto.pair;
    resolvedConfig.exchangeName = dto.exchangeName;
  }

  private buildDirectResolverInput(
    definition: Pick<StrategyDefinition, 'configSchema'>,
    config: Record<string, unknown>,
    runtimeFields: Record<string, string>,
  ): Record<string, unknown> {
    const resolverInput = { ...config };

    for (const [field, value] of Object.entries(runtimeFields)) {
      if (this.schemaMentionsRootField(definition.configSchema, field)) {
        resolverInput[field] = value;
      }
    }

    return resolverInput;
  }

  private schemaMentionsRootField(schema: unknown, field: string): boolean {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return false;
    }

    const configSchema = schema as {
      required?: unknown;
      properties?: unknown;
    };
    const required = Array.isArray(configSchema.required)
      ? configSchema.required
      : [];
    const properties =
      configSchema.properties &&
      typeof configSchema.properties === 'object' &&
      !Array.isArray(configSchema.properties)
        ? (configSchema.properties as Record<string, unknown>)
        : {};

    return required.includes(field) || field in properties;
  }

  private async releaseStoppedOrderReservations(
    order: MarketMakingOrder,
    userId: string,
  ): Promise<void> {
    const strategyKey = this.buildStrategyKey(order);
    const trackedOrders = this.getTrackedOrders(strategyKey);

    if (!trackedOrders.length) {
      await this.orderReservationService.recoverDanglingReservationsForOrder({
        orderId: order.orderId,
        liveIntentIds: [],
        hasOpenOrder: false,
      });

      return;
    }

    const activeOrders = trackedOrders.filter(
      (trackedOrder) => !this.isTrackedOrderTerminal(trackedOrder.status),
    );

    if (activeOrders.length) {
      this.logger.warn(
        `Skipping stop reservation residual release for ${order.orderId}: ${activeOrders.length} tracked orders are not terminal`,
      );
    }

    const terminalOrders = trackedOrders.filter((trackedOrder) =>
      this.isTrackedOrderReservationReleasable(trackedOrder),
    );

    for (const trackedOrder of terminalOrders) {
      await this.orderReservationService.releaseRemainingLimitOrderReservation({
        orderId: trackedOrder.orderId,
        userId,
        intentId: trackedOrder.clientOrderId || trackedOrder.exchangeOrderId,
        releaseId: trackedOrder.clientOrderId || trackedOrder.exchangeOrderId,
        pair: trackedOrder.pair,
        side: trackedOrder.side,
        price: trackedOrder.price,
        qty: trackedOrder.qty,
        filledQty: trackedOrder.cumulativeFilledQty,
        reason:
          trackedOrder.status === 'filled'
            ? 'exchange_order_filled'
            : 'exchange_order_cancelled',
      });
    }

    if (!activeOrders.length) {
      await this.orderReservationService.recoverDanglingReservationsForOrder({
        orderId: order.orderId,
        liveIntentIds: [],
        hasOpenOrder: false,
      });
    }
  }

  private buildRuntimeCycleStatuses(
    resolvedConfig: Record<string, unknown>,
    intents: StrategyOrderIntent[],
    trackedOrders: TrackedOrder[],
    executionHistory: StrategyExecutionHistory[] = [],
    queueState?: StrategyIntentQueueState | null,
  ): DirectCycleStatus[] {
    const groups = new Map<string, DirectCycleGroup>();
    const activeCycle = this.readActiveCycle(resolvedConfig.activeCycle);

    if (activeCycle) {
      this.upsertCycleLeg(groups, {
        cycleId: activeCycle.cycleId,
        cycleRole: 'maker',
        accountLabel: activeCycle.makerAccountLabel,
        side: activeCycle.makerSide,
        plannedQty: activeCycle.requestedQty,
        plannedPrice: activeCycle.price,
        filledQty: activeCycle.makerFilledQty,
        notional: this.computeCycleLegNotional(
          activeCycle.requestedQty,
          activeCycle.price,
        ),
        status: new BigNumber(activeCycle.makerFilledQty || 0).isGreaterThan(0)
          ? 'partially_filled'
          : 'planned',
        failureReason: null,
        linkedIntentId: null,
        linkedTrackedOrderId: null,
      });
      this.upsertCycleLeg(groups, {
        cycleId: activeCycle.cycleId,
        cycleRole: 'taker',
        accountLabel: activeCycle.takerAccountLabel,
        side: activeCycle.makerSide === 'buy' ? 'sell' : 'buy',
        plannedQty: activeCycle.requestedQty,
        plannedPrice: activeCycle.price,
        filledQty: activeCycle.takerFilledQty,
        notional: this.computeCycleLegNotional(
          activeCycle.requestedQty,
          activeCycle.price,
        ),
        status: new BigNumber(activeCycle.takerFilledQty || 0).isGreaterThan(0)
          ? 'partially_filled'
          : 'planned',
        failureReason: null,
        linkedIntentId: null,
        linkedTrackedOrderId: null,
      });
    }

    for (const history of executionHistory) {
      const leg = this.buildCycleLegFromExecutionHistory(history);

      if (leg) {
        this.upsertCycleLeg(groups, leg);
      }
    }

    for (const intent of intents) {
      const leg = this.buildCycleLegFromIntent(intent, trackedOrders);

      if (leg) {
        this.upsertCycleLeg(groups, leg);
      }

      const plannedTakerLeg = this.buildPlannedTakerLegFromMakerIntent(intent);

      if (plannedTakerLeg) {
        this.upsertCycleLeg(groups, plannedTakerLeg);
      }
    }

    for (const trackedOrder of trackedOrders) {
      const leg = this.buildCycleLegFromTrackedOrder(
        trackedOrder,
        intents,
        activeCycle,
        queueState,
      );

      if (leg) {
        this.upsertCycleLeg(groups, leg);
      }
    }

    return [...groups.values()]
      .map((group) => {
        const legs = [...group.legs.values()].sort((left, right) => {
          if (left.cycleRole !== right.cycleRole) {
            return left.cycleRole === 'maker' ? -1 : 1;
          }

          return left.accountLabel.localeCompare(right.accountLabel);
        });
        const failureReason =
          legs.find((leg) => leg.failureReason)?.failureReason || null;

        return {
          cycleId: group.cycleId,
          aggregateStatus: this.resolveCycleAggregateStatus(legs),
          failureReason,
          legs,
        };
      })
      .sort((left, right) => this.compareRuntimeCycles(left, right, groups));
  }

  private buildCycleLegFromIntent(
    intent: StrategyOrderIntent,
    trackedOrders: TrackedOrder[],
  ): DirectCycleLeg | null {
    const metadata = this.readCycleMetadata(intent.metadata);
    const cycleId = this.readTrimmedString(metadata.cycleId);

    if (!cycleId) {
      return null;
    }

    const cycleRole = this.readCycleRole(metadata.cycleRole || metadata.role);

    if (!cycleRole) {
      return null;
    }

    const trackedOrder = this.findTrackedOrderForIntent(intent, trackedOrders);
    const plannedQty =
      this.readTrimmedString(metadata.plannedQty) || intent.qty || '0';
    const plannedPrice =
      this.readTrimmedString(metadata.plannedPrice) || intent.price || '0';

    return {
      cycleId,
      cycleRole,
      accountLabel:
        this.readTrimmedString(metadata.accountLabel) ||
        intent.accountLabel ||
        '',
      side: intent.side,
      plannedQty,
      plannedPrice,
      filledQty:
        trackedOrder?.cumulativeFilledQty ||
        this.readTrimmedString(metadata.filledQty) ||
        '0',
      notional:
        this.readTrimmedString(metadata.notional) ||
        this.computeCycleLegNotional(plannedQty, plannedPrice),
      status: trackedOrder
        ? this.normalizeCycleLegStatus(trackedOrder.status)
        : this.normalizeCycleLegStatus(
            this.readTrimmedString(metadata.status) || intent.status,
          ),
      failureReason:
        intent.errorReason ||
        this.readTrimmedString(metadata.failureReason) ||
        null,
      linkedIntentId:
        this.readTrimmedString(metadata.linkedIntentId) || intent.intentId,
      linkedTrackedOrderId:
        trackedOrder?.exchangeOrderId ||
        intent.mixinOrderId ||
        this.readTrimmedString(metadata.linkedTrackedOrderId) ||
        null,
    };
  }

  private buildPlannedTakerLegFromMakerIntent(
    intent: StrategyOrderIntent,
  ): DirectCycleLeg | null {
    const metadata = this.readCycleMetadata(intent.metadata);
    const cycleId = this.readTrimmedString(metadata.cycleId);
    const cycleRole = this.readCycleRole(metadata.cycleRole || metadata.role);
    const makerSide = this.readOrderSide(metadata.side || intent.side);
    const takerAccountLabel = this.readTrimmedString(
      metadata.takerAccountLabel,
    );

    if (!cycleId || cycleRole !== 'maker' || !makerSide || !takerAccountLabel) {
      return null;
    }

    const plannedQty =
      this.readTrimmedString(metadata.plannedQty) || intent.qty || '0';
    const plannedPrice =
      this.readTrimmedString(metadata.plannedPrice) || intent.price || '0';

    return {
      cycleId,
      cycleRole: 'taker',
      accountLabel: takerAccountLabel,
      side: makerSide === 'buy' ? 'sell' : 'buy',
      plannedQty,
      plannedPrice,
      filledQty: '0',
      notional:
        this.readTrimmedString(metadata.notional) ||
        this.computeCycleLegNotional(plannedQty, plannedPrice),
      status: 'planned',
      failureReason: null,
      linkedIntentId: null,
      linkedTrackedOrderId: null,
    };
  }

  private buildCycleLegFromExecutionHistory(
    history: StrategyExecutionHistory,
  ): DirectCycleLeg | null {
    const metadata = this.readCycleMetadata(history.metadata);
    const cycleId = this.readTrimmedString(metadata.cycleId);

    if (!cycleId) {
      return null;
    }

    const cycleRole = this.readCycleRole(metadata.cycleRole || metadata.role);
    const side = this.readOrderSide(metadata.side || history.side);

    if (!cycleRole || !side) {
      return null;
    }

    const plannedQty =
      this.readTrimmedString(metadata.plannedQty) ||
      this.readTrimmedString(history.amount) ||
      '0';
    const plannedPrice =
      this.readTrimmedString(metadata.plannedPrice) ||
      this.readTrimmedString(history.price) ||
      '0';
    const linkedTrackedOrderId =
      this.readTrimmedString(metadata.linkedTrackedOrderId) ||
      this.readTrimmedString(metadata.exchangeOrderId) ||
      null;

    return {
      cycleId,
      cycleRole,
      accountLabel: this.readTrimmedString(metadata.accountLabel),
      side,
      plannedQty,
      plannedPrice,
      filledQty: this.readTrimmedString(metadata.filledQty) || '0',
      notional:
        this.readTrimmedString(metadata.notional) ||
        this.computeCycleLegNotional(plannedQty, plannedPrice),
      status: this.normalizeCycleLegStatus(
        this.readTrimmedString(metadata.status) || history.status,
      ),
      failureReason: this.readTrimmedString(metadata.failureReason) || null,
      linkedIntentId:
        this.readTrimmedString(metadata.linkedIntentId) ||
        this.readTrimmedString(metadata.intentId) ||
        null,
      linkedTrackedOrderId,
    };
  }

  private buildCycleLegFromTrackedOrder(
    trackedOrder: TrackedOrder,
    intents: StrategyOrderIntent[],
    activeCycle: ReturnType<AdminDirectMarketMakingService['readActiveCycle']>,
    queueState?: StrategyIntentQueueState | null,
  ): DirectCycleLeg | null {
    const matchedIntent = this.findIntentForTrackedOrder(trackedOrder, intents);
    const metadata = this.readCycleMetadata(matchedIntent?.metadata);
    const cycleId =
      this.readTrimmedString(metadata.cycleId) ||
      (activeCycle &&
      this.isTrackedOrderInActiveCycle(trackedOrder, activeCycle) &&
      trackedOrder.role &&
      (trackedOrder.accountLabel === activeCycle.makerAccountLabel ||
        trackedOrder.accountLabel === activeCycle.takerAccountLabel)
        ? activeCycle.cycleId
        : '');
    const cycleRole = this.readCycleRole(
      metadata.cycleRole || metadata.role || trackedOrder.role,
    );

    if (!cycleId || !cycleRole) {
      return null;
    }

    const plannedQty =
      this.readTrimmedString(metadata.plannedQty) || trackedOrder.qty || '0';
    const plannedPrice =
      this.readTrimmedString(metadata.plannedPrice) ||
      trackedOrder.price ||
      '0';
    const failureReason =
      this.readTrimmedString(metadata.failureReason) ||
      matchedIntent?.errorReason ||
      (trackedOrder.status === 'failed'
        ? queueState?.failedHeadErrorReason || 'tracked order failed'
        : null);

    return {
      cycleId,
      cycleRole,
      accountLabel: trackedOrder.accountLabel || '',
      side: trackedOrder.side,
      plannedQty,
      plannedPrice,
      filledQty: trackedOrder.cumulativeFilledQty || '0',
      notional:
        this.readTrimmedString(metadata.notional) ||
        this.computeCycleLegNotional(plannedQty, plannedPrice),
      status: this.normalizeCycleLegStatus(trackedOrder.status),
      failureReason,
      linkedIntentId:
        this.readTrimmedString(metadata.linkedIntentId) ||
        matchedIntent?.intentId ||
        null,
      linkedTrackedOrderId: trackedOrder.exchangeOrderId,
    };
  }

  private upsertCycleLeg(
    groups: Map<string, DirectCycleGroup>,
    leg: DirectCycleLeg,
  ): void {
    const group = groups.get(leg.cycleId) || {
      cycleId: leg.cycleId,
      backendIndex: groups.size,
      legs: new Map<string, DirectCycleLeg>(),
    };
    const key = `${leg.cycleRole}:${leg.accountLabel}:${leg.side}`;
    const previous = group.legs.get(key);

    group.legs.set(
      key,
      previous
        ? {
            ...previous,
            ...leg,
            failureReason: this.selectCycleLegFailureReason(
              previous.failureReason,
              leg.failureReason,
            ),
            linkedIntentId: leg.linkedIntentId || previous.linkedIntentId,
            linkedTrackedOrderId:
              leg.linkedTrackedOrderId || previous.linkedTrackedOrderId,
          }
        : leg,
    );
    groups.set(leg.cycleId, group);
  }

  private compareRuntimeCycles(
    left: DirectCycleStatus,
    right: DirectCycleStatus,
    groups: Map<string, DirectCycleGroup>,
  ): number {
    const leftCounter = this.readRuntimeCycleCounter(left.cycleId);
    const rightCounter = this.readRuntimeCycleCounter(right.cycleId);

    if (
      leftCounter !== null &&
      rightCounter !== null &&
      leftCounter !== rightCounter
    ) {
      return leftCounter - rightCounter;
    }

    const leftTimestamp = this.readRuntimeCycleTimestampMs(left.cycleId);
    const rightTimestamp = this.readRuntimeCycleTimestampMs(right.cycleId);

    if (
      leftTimestamp !== null &&
      rightTimestamp !== null &&
      leftTimestamp !== rightTimestamp
    ) {
      return leftTimestamp - rightTimestamp;
    }

    return (
      (groups.get(left.cycleId)?.backendIndex ?? 0) -
      (groups.get(right.cycleId)?.backendIndex ?? 0)
    );
  }

  private readRuntimeCycleCounter(cycleId: string): number | null {
    const match = cycleId.match(RUNTIME_CYCLE_COUNTER_PATTERN);

    if (!match) {
      return null;
    }

    const counter = Number(match[1]);

    return Number.isSafeInteger(counter) ? counter : null;
  }

  private readRuntimeCycleTimestampMs(cycleId: string): number | null {
    const match = cycleId.match(RUNTIME_CYCLE_TIMESTAMP_PATTERN);

    if (!match) {
      return null;
    }

    const timestampMs = Date.parse(match[0]);

    return Number.isFinite(timestampMs) ? timestampMs : null;
  }

  private selectCycleLegFailureReason(
    previous: string | null,
    next: string | null,
  ): string | null {
    if (!next) {
      return previous;
    }
    if (next === 'tracked order failed' && previous) {
      return previous;
    }

    return next;
  }

  private findTrackedOrderForIntent(
    intent: StrategyOrderIntent,
    trackedOrders: TrackedOrder[],
  ): TrackedOrder | undefined {
    return trackedOrders.find((order) => {
      if (
        intent.mixinOrderId &&
        order.exchangeOrderId === intent.mixinOrderId
      ) {
        return true;
      }

      const role = this.readCycleRole(
        this.readCycleMetadata(intent.metadata).cycleRole ||
          this.readCycleMetadata(intent.metadata).role,
      );

      return (
        (!role || order.role === role) &&
        order.accountLabel === intent.accountLabel &&
        order.side === intent.side &&
        order.price === intent.price &&
        order.qty === intent.qty
      );
    });
  }

  private findIntentForTrackedOrder(
    trackedOrder: TrackedOrder,
    intents: StrategyOrderIntent[],
  ): StrategyOrderIntent | undefined {
    return intents.find((intent) => {
      if (
        intent.mixinOrderId &&
        intent.mixinOrderId === trackedOrder.exchangeOrderId
      ) {
        return true;
      }

      const role = this.readCycleRole(
        this.readCycleMetadata(intent.metadata).cycleRole ||
          this.readCycleMetadata(intent.metadata).role,
      );

      return (
        (!role || role === trackedOrder.role) &&
        intent.accountLabel === trackedOrder.accountLabel &&
        intent.side === trackedOrder.side &&
        intent.price === trackedOrder.price &&
        intent.qty === trackedOrder.qty
      );
    });
  }

  private resolveCycleAggregateStatus(legs: DirectCycleLeg[]): string {
    if (legs.some((leg) => leg.status === 'failed' || leg.failureReason)) {
      return 'failed';
    }
    if (legs.some((leg) => leg.status === 'cancelled')) {
      return legs.some((leg) =>
        new BigNumber(leg.filledQty || 0).isGreaterThan(0),
      )
        ? 'partial'
        : 'cancelled';
    }
    if (
      legs.length >= 2 &&
      legs.every((leg) => leg.status === 'filled' || leg.status === 'done')
    ) {
      return 'completed';
    }
    if (
      legs.some(
        (leg) =>
          leg.status === 'partially_filled' ||
          new BigNumber(leg.filledQty || 0).isGreaterThan(0),
      )
    ) {
      return 'partial';
    }
    if (legs.some((leg) => leg.status === 'open')) {
      return 'open';
    }
    if (legs.length > 0) {
      return 'pending';
    }

    return 'unknown';
  }

  private computeRuntimeCycleMetrics(cycles: DirectCycleStatus[]): {
    completedCycles: number;
    tradedQuoteVolume: BigNumber;
  } {
    let completedCycles = 0;
    let tradedQuoteVolume = new BigNumber(0);

    for (const cycle of cycles) {
      if (cycle.aggregateStatus !== 'completed') {
        continue;
      }

      const makerLeg = cycle.legs.find((leg) => leg.cycleRole === 'maker');
      const takerLeg = cycle.legs.find((leg) => leg.cycleRole === 'taker');

      if (!makerLeg || !takerLeg) {
        continue;
      }

      completedCycles += 1;

      const makerFilledQty = new BigNumber(makerLeg.filledQty || 0);
      const takerFilledQty = new BigNumber(takerLeg.filledQty || 0);
      const price = new BigNumber(
        makerLeg.plannedPrice || takerLeg.plannedPrice || 0,
      );

      if (
        !makerFilledQty.isFinite() ||
        !takerFilledQty.isFinite() ||
        !price.isFinite() ||
        price.isLessThanOrEqualTo(0)
      ) {
        continue;
      }

      const matchedQty = BigNumber.min(makerFilledQty, takerFilledQty);

      if (matchedQty.isGreaterThan(0)) {
        tradedQuoteVolume = tradedQuoteVolume.plus(
          matchedQty.multipliedBy(price),
        );
      }
    }

    return { completedCycles, tradedQuoteVolume };
  }

  private readActiveCycle(value: unknown): {
    cycleId: string;
    orderId: string;
    makerSide: 'buy' | 'sell';
    makerAccountLabel: string;
    takerAccountLabel: string;
    price: string;
    requestedQty: string;
    makerFilledQty: string;
    takerFilledQty: string;
  } | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const cycle = value as Record<string, unknown>;
    const makerSide = String(cycle.makerSide || '').trim();

    if (makerSide !== 'buy' && makerSide !== 'sell') {
      return null;
    }

    const cycleId = this.readTrimmedString(cycle.cycleId);
    const orderId = this.readTrimmedString(cycle.orderId);
    const makerAccountLabel = this.readTrimmedString(cycle.makerAccountLabel);
    const takerAccountLabel = this.readTrimmedString(cycle.takerAccountLabel);
    const price = this.readTrimmedString(cycle.price);
    const requestedQty = this.readTrimmedString(cycle.requestedQty);

    if (
      !cycleId ||
      !orderId ||
      !makerAccountLabel ||
      !takerAccountLabel ||
      !price ||
      !requestedQty
    ) {
      return null;
    }

    return {
      cycleId,
      orderId,
      makerSide,
      makerAccountLabel,
      takerAccountLabel,
      price,
      requestedQty,
      makerFilledQty: this.readTrimmedString(cycle.makerFilledQty) || '0',
      takerFilledQty: this.readTrimmedString(cycle.takerFilledQty) || '0',
    };
  }

  private isTrackedOrderInActiveCycle(
    trackedOrder: TrackedOrder,
    activeCycle: NonNullable<ReturnType<AdminDirectMarketMakingService['readActiveCycle']>>,
  ): boolean {
    if (trackedOrder.orderId === activeCycle.orderId) {
      return true;
    }

    const activeBaseOrderId = this.stripKnownAccountScope(
      activeCycle.orderId,
      [activeCycle.makerAccountLabel, activeCycle.takerAccountLabel],
    );
    const trackedBaseOrderId = this.stripKnownAccountScope(
      trackedOrder.orderId,
      [activeCycle.makerAccountLabel, activeCycle.takerAccountLabel],
    );

    return Boolean(
      activeBaseOrderId &&
        trackedBaseOrderId &&
        activeBaseOrderId !== activeCycle.orderId &&
        trackedBaseOrderId !== trackedOrder.orderId &&
        activeBaseOrderId === trackedBaseOrderId,
    );
  }

  private stripKnownAccountScope(
    orderId: string,
    accountLabels: Array<string | undefined>,
  ): string {
    const matchedAccountLabel = accountLabels.find(
      (accountLabel) => accountLabel && orderId.endsWith(`:${accountLabel}`),
    );

    if (!matchedAccountLabel) {
      return orderId;
    }

    return orderId.slice(0, -1 * (`:${matchedAccountLabel}`.length));
  }

  private readCycleMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  private readCycleRole(value: unknown): DirectCycleLegRole | null {
    const role = String(value || '').trim();

    return role === 'maker' || role === 'taker' ? role : null;
  }

  private normalizeCycleLegStatus(value: unknown): DirectCycleLegStatus {
    const status = String(value || '')
      .trim()
      .toLowerCase();

    if (
      [
        'planned',
        'new',
        'sent',
        'acked',
        'done',
        'pending_create',
        'open',
        'partially_filled',
        'filled',
        'cancelled',
        'failed',
      ].includes(status)
    ) {
      return status as DirectCycleLegStatus;
    }
    if (status === 'canceled') {
      return 'cancelled';
    }
    if (status === 'closed') {
      return 'filled';
    }

    return 'unknown';
  }

  private computeCycleLegNotional(qty: string, price: string): string {
    const notional = new BigNumber(qty || 0).multipliedBy(
      new BigNumber(price || 0),
    );

    return notional.isFinite() ? notional.toFixed() : '0';
  }

  private async loadDurableRuntimeCycleSources(
    order: MarketMakingOrder,
    strategyKey: string,
    latestIntents: StrategyOrderIntent[],
    cachedTrackedOrders: TrackedOrder[],
  ): Promise<{
    intents: StrategyOrderIntent[];
    trackedOrders: TrackedOrder[];
    executionHistory: StrategyExecutionHistory[];
  }> {
    const durableIntentRows = this.strategyOrderIntentRepository
      ? await this.strategyOrderIntentRepository.find({
          where: { strategyKey },
          order: { updatedAt: 'DESC' },
          take: 100,
        })
      : [];
    const durableTrackedRows = this.trackedOrderRepository
      ? await this.trackedOrderRepository.find({
          where: { strategyKey },
          order: { updatedAt: 'DESC' },
          take: 100,
        })
      : [];
    const executionHistory = this.strategyExecutionHistoryRepository
      ? await this.strategyExecutionHistoryRepository.find({
          where: { orderId: order.orderId },
          order: { executedAt: 'DESC' },
          take: 100,
        })
      : [];
    const durableIntents = durableIntentRows
      .map((row) => this.mapStrategyOrderIntentEntity(row))
      .filter((intent): intent is StrategyOrderIntent => Boolean(intent));
    const durableTrackedOrders = durableTrackedRows
      .map((row) => this.mapTrackedOrderEntity(row))
      .filter((trackedOrder): trackedOrder is TrackedOrder =>
        Boolean(trackedOrder),
      );

    return {
      intents: this.mergeDurableIntents(durableIntents, latestIntents),
      trackedOrders: this.mergeDurableTrackedOrders(
        durableTrackedOrders,
        cachedTrackedOrders,
      ),
      executionHistory,
    };
  }

  private mapStrategyOrderIntentEntity(
    row: StrategyOrderIntentEntity,
  ): StrategyOrderIntent | null {
    const type = this.readIntentType(row.type);
    const status = this.readIntentStatus(row.status);
    const side = this.readOrderSide(row.side);

    if (!type || !status || !side) {
      return null;
    }

    return {
      type,
      intentId: row.intentId,
      runtimeInstanceKey: row.runtimeInstanceKey,
      strategyKey: row.strategyKey,
      userId: row.userId,
      clientId: row.clientId,
      exchange: row.exchange,
      accountLabel: row.accountLabel,
      pair: row.pair,
      side,
      price: row.price,
      qty: row.qty,
      mixinOrderId: row.mixinOrderId,
      executionCategory:
        row.executionCategory as StrategyOrderIntent['executionCategory'],
      postOnly: row.postOnly,
      timeInForce:
        row.timeInForce === 'GTC' || row.timeInForce === 'IOC'
          ? row.timeInForce
          : undefined,
      slotKey: row.slotKey,
      metadata: row.metadata,
      createdAt: row.createdAt,
      status,
      errorReason: row.errorReason,
    };
  }

  private mapTrackedOrderEntity(row: TrackedOrderEntity): TrackedOrder | null {
    const side = this.readOrderSide(row.side);
    const role = this.readTrackedOrderRole(row.role);
    const status = this.readTrackedOrderStatus(row.status);

    if (!side || !status) {
      return null;
    }

    return {
      orderId: row.orderId,
      strategyKey: row.strategyKey,
      exchange: row.exchange,
      accountLabel: row.accountLabel,
      pair: row.pair,
      exchangeOrderId: row.exchangeOrderId,
      clientOrderId: row.clientOrderId,
      slotKey: row.slotKey,
      role,
      side,
      price: row.price,
      qty: row.qty,
      cumulativeFilledQty: row.cumulativeFilledQty,
      settledFilledQty: row.settledFilledQty,
      status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mergeDurableIntents(
    durableIntents: StrategyOrderIntent[],
    latestIntents: StrategyOrderIntent[],
  ): StrategyOrderIntent[] {
    const byIntentId = new Map<string, StrategyOrderIntent>();

    for (const intent of durableIntents) {
      byIntentId.set(intent.intentId, intent);
    }
    for (const intent of latestIntents) {
      if (!byIntentId.has(intent.intentId)) {
        byIntentId.set(intent.intentId, intent);
      }
    }

    return [...byIntentId.values()];
  }

  private mergeDurableTrackedOrders(
    durableTrackedOrders: TrackedOrder[],
    cachedTrackedOrders: TrackedOrder[],
  ): TrackedOrder[] {
    const byTrackedOrderId = new Map<string, TrackedOrder>();

    for (const trackedOrder of durableTrackedOrders) {
      byTrackedOrderId.set(
        this.getTrackedOrderMergeKey(trackedOrder),
        trackedOrder,
      );
    }
    for (const trackedOrder of cachedTrackedOrders) {
      const key = this.getTrackedOrderMergeKey(trackedOrder);

      if (!byTrackedOrderId.has(key)) {
        byTrackedOrderId.set(key, trackedOrder);
      }
    }

    return [...byTrackedOrderId.values()];
  }

  private getTrackedOrderMergeKey(trackedOrder: TrackedOrder): string {
    return (
      trackedOrder.exchangeOrderId ||
      trackedOrder.clientOrderId ||
      [
        trackedOrder.strategyKey,
        trackedOrder.accountLabel,
        trackedOrder.role,
        trackedOrder.side,
        trackedOrder.price,
        trackedOrder.qty,
      ].join(':')
    );
  }

  private readIntentType(value: unknown): StrategyIntentType | null {
    const type = String(value || '').trim();

    return [
      'CREATE_LIMIT_ORDER',
      'CANCEL_ORDER',
      'REPLACE_ORDER',
      'EXECUTE_AMM_SWAP',
      'STOP_CONTROLLER',
      'STOP_EXECUTOR',
    ].includes(type)
      ? (type as StrategyIntentType)
      : null;
  }

  private readIntentStatus(value: unknown): StrategyIntentStatus | null {
    const status = String(value || '')
      .trim()
      .toUpperCase();

    return ['NEW', 'SENT', 'ACKED', 'FAILED', 'DONE', 'CANCELLED'].includes(
      status,
    )
      ? (status as StrategyIntentStatus)
      : null;
  }

  private readOrderSide(value: unknown): 'buy' | 'sell' | null {
    const side = String(value || '').trim();

    return side === 'buy' || side === 'sell' ? side : null;
  }

  private readTrackedOrderRole(
    value: unknown,
  ): TrackedOrder['role'] | undefined {
    const role = String(value || '').trim();

    return role === 'maker' || role === 'taker' || role === 'rebalance'
      ? role
      : undefined;
  }

  private readTrackedOrderStatus(
    value: unknown,
  ): TrackedOrder['status'] | null {
    const status = String(value || '').trim();

    return [
      'pending_create',
      'open',
      'partially_filled',
      'pending_cancel',
      'filled',
      'cancelled',
      'failed',
      'external_missing',
      'internal_missing',
    ].includes(status)
      ? (status as TrackedOrder['status'])
      : null;
  }

  private readTrimmedString(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return '';
  }

  private getTrackedOrders(strategyKey: string): TrackedOrder[] {
    const tracker = this
      .exchangeOrderTrackerService as ExchangeOrderTrackerService & {
      getTrackedOrders?: (strategyKey: string) => TrackedOrder[];
    };

    return (
      tracker.getTrackedOrders?.(strategyKey) ||
      tracker.getOpenOrders(strategyKey)
    );
  }

  private getActiveTrackedOrders(order: MarketMakingOrder): TrackedOrder[] {
    return this.getTrackedOrders(this.buildStrategyKey(order)).filter(
      (trackedOrder) => !this.isTrackedOrderTerminal(trackedOrder.status),
    );
  }

  private isTrackedOrderReservationReleasable(order: TrackedOrder): boolean {
    return order.status === 'cancelled' || order.status === 'filled';
  }

  private isTrackedOrderTerminal(status: TrackedOrder['status']): boolean {
    return (
      status === 'filled' ||
      status === 'cancelled' ||
      status === 'failed' ||
      status === 'external_missing' ||
      status === 'internal_missing'
    );
  }

  private backfillOrderRuntimeSnapshot(order: MarketMakingOrder): void {
    if (!order.strategySnapshot?.resolvedConfig) {
      return;
    }

    const resolvedConfig = order.strategySnapshot.resolvedConfig as Record<
      string,
      unknown
    >;

    if (!String(resolvedConfig.exchangeName || '').trim()) {
      resolvedConfig.exchangeName = order.exchangeName;
    }
    if (!String(resolvedConfig.pair || '').trim()) {
      resolvedConfig.pair = order.pair;
    }
    if (!String(resolvedConfig.symbol || '').trim()) {
      resolvedConfig.symbol = order.pair;
    }
    if (!String(resolvedConfig.userId || '').trim()) {
      resolvedConfig.userId = order.userId || 'admin-direct';
    }
    if (!String(resolvedConfig.clientId || '').trim()) {
      resolvedConfig.clientId = order.orderId;
    }
    if (!String(resolvedConfig.marketMakingOrderId || '').trim()) {
      resolvedConfig.marketMakingOrderId = order.orderId;
    }

    if (this.isDualAccountMode(order)) {
      if (!String(resolvedConfig.makerAccountLabel || '').trim()) {
        resolvedConfig.makerAccountLabel = this.readMakerAccountLabel(order);
      }
      if (!String(resolvedConfig.takerAccountLabel || '').trim()) {
        resolvedConfig.takerAccountLabel = this.readTakerAccountLabel(order);
      }
      if (
        resolvedConfig.makerApiKeyId === undefined &&
        String(order.apiKeyId || '').trim()
      ) {
        resolvedConfig.makerApiKeyId = order.apiKeyId;
      }
      if (
        resolvedConfig.takerApiKeyId === undefined &&
        String(this.readTakerApiKeyId(order) || '').trim()
      ) {
        resolvedConfig.takerApiKeyId = this.readTakerApiKeyId(order);
      }

      return;
    }

    if (!String(resolvedConfig.accountLabel || '').trim()) {
      resolvedConfig.accountLabel = this.readAccountLabel(order);
    }
  }

  private async validateAccountAllocationOverlap(
    exchangeName: string,
    pair: string,
    apiKeyId: string | null,
    accountLabel: string,
    currentAllocation?: Record<string, unknown>,
    snapshot?: DirectMarketSnapshot,
    excludeOrderId?: string,
  ): Promise<void> {
    if (!apiKeyId) {
      return;
    }

    const [baseAsset, quoteAsset] = this.parsePair(pair);

    const overlappingOrders = await this.marketMakingRepository.find({
      where: {
        exchangeName,
        apiKeyId,
        source: 'admin_direct',
        state: In(['running', 'paused']),
      },
      select: ['orderId'],
    });
    const overlappingOrderIds = overlappingOrders
      .map((o) => o.orderId)
      .filter((id) => id !== excludeOrderId);

    const overlappingBalances = overlappingOrderIds.length
      ? await this.orderBalanceRepository.find({
          where: overlappingOrderIds.map((orderId) => ({ orderId })),
        })
      : [];

    const alreadyAllocated = new Map<string, BigNumber>();

    for (const bal of overlappingBalances) {
      if (!bal.assetId) {
        continue;
      }

      const current = alreadyAllocated.get(bal.assetId) || new BigNumber(0);

      alreadyAllocated.set(
        bal.assetId,
        current.plus(new BigNumber(bal.total || 0)),
      );
    }

    const currentAllocations = new Map<string, BigNumber>();

    if (baseAsset) {
      currentAllocations.set(
        baseAsset,
        new BigNumber(
          this.readPositiveAmount(currentAllocation?.balanceA) || 0,
        ),
      );
    }
    if (quoteAsset) {
      currentAllocations.set(
        quoteAsset,
        new BigNumber(
          this.readPositiveAmount(currentAllocation?.balanceB) || 0,
        ),
      );
    }

    const relevantAssets = [baseAsset, quoteAsset].filter(Boolean);
    const balanceSnapshot =
      snapshot ||
      (await this.resolveDirectMarketSnapshot(
        exchangeName,
        pair,
        accountLabel,
      ));

    for (const assetId of relevantAssets) {
      const siblingAllocated = alreadyAllocated.get(assetId) || new BigNumber(0);
      const currentOrderAllocated =
        currentAllocations.get(assetId) || new BigNumber(0);
      const allocated = siblingAllocated.plus(currentOrderAllocated);

      if (allocated.isLessThanOrEqualTo(0)) {
        continue;
      }

      const exchangeFree = new BigNumber(
        balanceSnapshot.balance?.free?.[assetId] ?? 0,
      );

      if (allocated.isGreaterThan(exchangeFree)) {
        throw new BadRequestException(
          overlappingOrderIds.length > 0
            ? `Account overlap: current order allocates ${currentOrderAllocated.toFixed()} ${assetId} and ${
                overlappingOrderIds.length
              } active order(s) allocate ${siblingAllocated.toFixed()} ${assetId}, but exchange free balance is only ${exchangeFree.toFixed()} ${assetId}. Reduce order amount or stop conflicting orders first.`
            : `Account allocation exceeds exchange free balance: current order allocates ${currentOrderAllocated.toFixed()} ${assetId}, but exchange free balance is only ${exchangeFree.toFixed()} ${assetId}. Reduce order amount or add funds before resuming.`,
        );
      }
    }
  }

  private async runSingleAccountPreCheck(
    exchangeName: string,
    pair: string,
    accountLabel: string,
    resolvedConfig: Record<string, unknown>,
    snapshot?: DirectMarketSnapshot,
  ): Promise<string[]> {
    await this.validateMinimumOrderAmount(
      exchangeName,
      pair,
      resolvedConfig,
      accountLabel,
      snapshot,
    );
    await this.validateExecutableSpreadConfig(
      exchangeName,
      accountLabel,
      pair,
      resolvedConfig,
    );

    return this.runBalancePreCheck(
      exchangeName,
      pair,
      accountLabel,
      resolvedConfig,
      snapshot,
    );
  }

  private async ensureAdminDirectLedgerSeeded(
    order: MarketMakingOrder,
  ): Promise<void> {
    const [baseAsset, quoteAsset] = this.parsePair(order.pair);
    const resolvedConfig = order.strategySnapshot?.resolvedConfig || {};
    const allocations = [
      {
        assetId: baseAsset,
        amount: this.readPositiveAmount(
          order.balanceA || resolvedConfig.balanceA,
        ),
      },
      {
        assetId: quoteAsset,
        amount: this.readPositiveAmount(
          order.balanceB || resolvedConfig.balanceB,
        ),
      },
    ].filter((allocation) => allocation.assetId);
    let hasFunding = false;

    for (const allocation of allocations) {
      const alreadyFunded = await this.balanceLedgerService.hasDepositCredit(
        order.orderId,
        allocation.assetId,
      );

      if (alreadyFunded) {
        hasFunding = true;
        continue;
      }

      if (!allocation.amount) {
        continue;
      }

      await this.balanceLedgerService.creditDeposit({
        orderId: order.orderId,
        userId: order.userId,
        assetId: allocation.assetId,
        amount: allocation.amount,
        idempotencyKey: `admin-direct-seed:${order.orderId}:${allocation.assetId}`,
        refType: 'admin_direct_seed',
        refId: order.orderId,
      });
      hasFunding = true;
    }

    if (!hasFunding) {
      throw new BadRequestException(
        'Admin direct order requires available base or quote balance to seed ledger',
      );
    }

    await this.seedDualAccountScopedBalances(order);
  }

  private async seedDualAccountScopedBalances(
    order: MarketMakingOrder,
  ): Promise<void> {
    if (!this.isDualAccountMode(order)) {
      return;
    }

    const config = order.strategySnapshot?.resolvedConfig || {};
    const makerAccountLabel = String(config.makerAccountLabel || '').trim();
    const takerAccountLabel = String(config.takerAccountLabel || '').trim();

    if (!makerAccountLabel || !takerAccountLabel) {
      return;
    }

    const [baseAsset, quoteAsset] = this.parsePair(order.pair);
    const accountLabels = [makerAccountLabel, takerAccountLabel];

    for (const accountLabel of accountLabels) {
      const scopedOrderId = `${order.orderId}:${accountLabel}`;
      const existingScopedEntries =
        await this.balanceLedgerService.findByOrderId(scopedOrderId);

      if (existingScopedEntries.length > 0) {
        continue;
      }

      const snapshot = await this.resolveDirectMarketSnapshot(
        order.exchangeName,
        order.pair,
        accountLabel,
      );
      const balance = snapshot.balance;
      const baseFree = new BigNumber(balance?.free?.[baseAsset] ?? 0);
      const quoteFree = new BigNumber(balance?.free?.[quoteAsset] ?? 0);
      const allocations = [
        { assetId: baseAsset, amount: baseFree },
        { assetId: quoteAsset, amount: quoteFree },
      ].filter(
        (a) => a.assetId && a.amount.isFinite() && a.amount.isGreaterThan(0),
      );

      for (const allocation of allocations) {
        const alreadyFunded = await this.balanceLedgerService.hasDepositCredit(
          scopedOrderId,
          allocation.assetId,
        );

        if (alreadyFunded) {
          continue;
        }

        await this.balanceLedgerService.creditDeposit({
          orderId: scopedOrderId,
          userId: order.userId,
          assetId: allocation.assetId,
          amount: allocation.amount.toFixed(),
          idempotencyKey: `admin-direct-seed:${scopedOrderId}:${allocation.assetId}`,
          refType: 'admin_direct_seed',
          refId: order.orderId,
        });
      }
    }
  }

  private async populateAdminDirectLedgerAllocations(
    exchangeName: string,
    pair: string,
    accountLabel: string,
    resolvedConfig: Record<string, unknown>,
    snapshot?: DirectMarketSnapshot,
  ): Promise<void> {
    if (
      this.readPositiveAmount(resolvedConfig.balanceA) ||
      this.readPositiveAmount(resolvedConfig.balanceB)
    ) {
      return;
    }

    const [baseAsset, quoteAsset] = this.parsePair(pair);
    const directSnapshot =
      snapshot ||
      (await this.resolveDirectMarketSnapshot(
        exchangeName,
        pair,
        accountLabel,
      ));
    const balance = directSnapshot.balance;
    const referencePrice = directSnapshot.tickerPrice;
    const desiredBase = this.calculateAdminDirectBaseAllocation(resolvedConfig);
    const desiredQuote =
      referencePrice && desiredBase.isGreaterThan(0)
        ? desiredBase.multipliedBy(referencePrice)
        : new BigNumber(0);
    const baseFree = new BigNumber(balance?.free?.[baseAsset] ?? 0);
    const quoteFree = new BigNumber(balance?.free?.[quoteAsset] ?? 0);
    const baseAllocation = BigNumber.minimum(baseFree, desiredBase);
    const quoteAllocation = BigNumber.minimum(quoteFree, desiredQuote);

    if (baseAllocation.isFinite() && baseAllocation.isGreaterThan(0)) {
      resolvedConfig.balanceA = baseAllocation.toFixed();
    }
    if (quoteAllocation.isFinite() && quoteAllocation.isGreaterThan(0)) {
      resolvedConfig.balanceB = quoteAllocation.toFixed();
    }
  }

  private async reallocateAdminDirectOrderToAvailableBalance(
    order: MarketMakingOrder,
    resolvedConfig: Record<string, unknown>,
    snapshot: DirectMarketSnapshot,
  ): Promise<void> {
    const [baseAsset, quoteAsset] = this.parsePair(order.pair);
    const siblingAllocations = await this.loadAdminDirectSiblingAllocations(
      order.exchangeName,
      order.apiKeyId,
      order.orderId,
    );
    const allocations = [
      {
        assetId: baseAsset,
        key: 'balanceA',
        current: new BigNumber(
          this.readPositiveAmount(order.balanceA || resolvedConfig.balanceA) ||
            0,
        ),
      },
      {
        assetId: quoteAsset,
        key: 'balanceB',
        current: new BigNumber(
          this.readPositiveAmount(order.balanceB || resolvedConfig.balanceB) ||
            0,
        ),
      },
    ].filter((allocation) => allocation.assetId);
    let hasAvailableAllocation = false;

    for (const allocation of allocations) {
      const exchangeFree = new BigNumber(
        snapshot.balance?.free?.[allocation.assetId] ?? 0,
      );
      const siblingAllocated =
        siblingAllocations.get(allocation.assetId) || new BigNumber(0);
      const accountAvailable = BigNumber.maximum(
        exchangeFree.minus(siblingAllocated),
        0,
      );
      const nextAllocation = BigNumber.minimum(
        allocation.current,
        accountAvailable,
      );

      if (nextAllocation.isGreaterThan(0)) {
        hasAvailableAllocation = true;
      }

      if (allocation.current.isGreaterThan(nextAllocation)) {
        await this.balanceLedgerService.releaseAllocation({
          orderId: order.orderId,
          userId: order.userId || 'admin-direct',
          assetId: allocation.assetId,
          amount: allocation.current.minus(nextAllocation).toFixed(),
          idempotencyKey: `admin-direct-reallocate:${order.orderId}:${
            allocation.assetId
          }:${allocation.current.toFixed()}->${nextAllocation.toFixed()}`,
          refType: 'admin_direct_reallocation',
          refId: order.orderId,
        });
      }

      const nextValue = nextAllocation.toFixed();

      resolvedConfig[allocation.key] = nextValue;
      if (allocation.key === 'balanceA') {
        order.balanceA = nextValue;
      } else {
        order.balanceB = nextValue;
      }
    }

    if (!hasAvailableAllocation) {
      throw new BadRequestException(
        'No available exchange balance remains to resume this direct order',
      );
    }

    if (order.strategySnapshot?.resolvedConfig) {
      order.strategySnapshot.resolvedConfig = resolvedConfig;
    }

    await this.marketMakingRepository.update(
      { orderId: order.orderId, source: 'admin_direct' },
      {
        balanceA: order.balanceA,
        balanceB: order.balanceB,
        strategySnapshot: order.strategySnapshot,
      },
    );
  }

  private async loadAdminDirectSiblingAllocations(
    exchangeName: string,
    apiKeyId: string | null,
    excludeOrderId: string,
  ): Promise<Map<string, BigNumber>> {
    const allocations = new Map<string, BigNumber>();

    if (!apiKeyId) {
      return allocations;
    }

    const overlappingOrders = await this.marketMakingRepository.find({
      where: {
        exchangeName,
        apiKeyId,
        source: 'admin_direct',
        state: In(['running', 'paused']),
      },
      select: ['orderId'],
    });
    const overlappingOrderIds = overlappingOrders
      .map((o) => o.orderId)
      .filter((id) => id !== excludeOrderId);

    if (!overlappingOrderIds.length) {
      return allocations;
    }

    const overlappingBalances = await this.orderBalanceRepository.find({
      where: overlappingOrderIds.map((orderId) => ({ orderId })),
    });

    for (const balance of overlappingBalances) {
      if (!balance.assetId) {
        continue;
      }

      const current = allocations.get(balance.assetId) || new BigNumber(0);

      allocations.set(
        balance.assetId,
        current.plus(new BigNumber(balance.total || 0)),
      );
    }

    return allocations;
  }

  private assertAdminDirectSeedAllocationsAvailable(
    resolvedConfig: Record<string, unknown>,
  ): void {
    if (
      this.readPositiveAmount(resolvedConfig.balanceA) ||
      this.readPositiveAmount(resolvedConfig.balanceB)
    ) {
      return;
    }

    throw new BadRequestException(
      'Admin direct order requires available base or quote balance to seed ledger',
    );
  }

  private calculateAdminDirectBaseAllocation(
    resolvedConfig: Record<string, unknown>,
  ): BigNumber {
    const baseAmount =
      this.readPositiveBigNumber(resolvedConfig.orderAmount) ||
      this.readPositiveBigNumber(resolvedConfig.maxOrderAmount) ||
      this.readPositiveBigNumber(resolvedConfig.baseTradeAmount) ||
      new BigNumber(0);
    const layerCount = Math.max(
      1,
      Math.floor(Number(resolvedConfig.numberOfLayers || 1)),
    );
    const amountChangePerLayer =
      this.readPositiveBigNumber(resolvedConfig.amountChangePerLayer) ||
      new BigNumber(0);
    const amountChangeType =
      resolvedConfig.amountChangeType === 'percentage' ? 'percentage' : 'fixed';
    let total = new BigNumber(0);

    for (let layer = 0; layer < layerCount; layer += 1) {
      const layerAmount =
        amountChangeType === 'percentage'
          ? baseAmount.multipliedBy(
              new BigNumber(1).plus(amountChangePerLayer).pow(layer),
            )
          : baseAmount.plus(amountChangePerLayer.multipliedBy(layer));

      if (layerAmount.isFinite() && layerAmount.isGreaterThan(0)) {
        total = total.plus(layerAmount);
      }
    }

    return total;
  }

  private async runDualAccountBalancePreCheck(
    exchangeName: string,
    pair: string,
    executionAccounts: {
      primary: Pick<DirectExecutionAccount, 'accountLabel'>;
      secondary?: Pick<DirectExecutionAccount, 'accountLabel'>;
    },
    resolvedConfig: Record<string, unknown>,
    primarySnapshot?: DirectMarketSnapshot,
  ): Promise<string[]> {
    await this.validateMinimumOrderAmount(
      exchangeName,
      pair,
      resolvedConfig,
      executionAccounts.primary.accountLabel,
      primarySnapshot,
    );

    const secondaryAccount = executionAccounts.secondary;
    const secondarySnapshotPromise =
      secondaryAccount && primarySnapshot
        ? this.resolveDirectBalanceSnapshot(
            exchangeName,
            secondaryAccount.accountLabel,
            primarySnapshot.tickerPrice,
          )
        : Promise.resolve(undefined);
    const warnings = await Promise.all([
      this.runBalancePreCheck(
        exchangeName,
        pair,
        executionAccounts.primary.accountLabel,
        resolvedConfig,
        primarySnapshot,
      ),
      secondaryAccount
        ? secondarySnapshotPromise.then((secondarySnapshot) =>
            this.runBalancePreCheck(
              exchangeName,
              pair,
              secondaryAccount.accountLabel,
              resolvedConfig,
              secondarySnapshot,
            ),
          )
        : Promise.resolve([]),
    ]);

    return warnings.flatMap((entries, index) => {
      const label =
        index === 0
          ? executionAccounts.primary.accountLabel
          : executionAccounts.secondary?.accountLabel || 'secondary';

      return entries.map((warning) => `[${label}] ${warning}`);
    });
  }

  private async runBalancePreCheck(
    exchangeName: string,
    pair: string,
    accountLabel: string,
    resolvedConfig: Record<string, unknown>,
    snapshot?: DirectMarketSnapshot,
  ): Promise<string[]> {
    const [baseAsset, quoteAsset] = this.parsePair(pair);

    try {
      const directSnapshot =
        snapshot ||
        (await this.resolveDirectMarketSnapshot(
          exchangeName,
          pair,
          accountLabel,
        ));
      const balance = directSnapshot.balance;
      const orderAmount = new BigNumber(
        String(
          resolvedConfig.orderAmount ??
            resolvedConfig.maxOrderAmount ??
            resolvedConfig.baseTradeAmount ??
            0,
        ),
      );
      const warnings: string[] = [];
      const baseFree = new BigNumber(balance?.free?.[baseAsset] ?? 0);
      const quoteFree = new BigNumber(balance?.free?.[quoteAsset] ?? 0);
      const quoteRequirement =
        quoteAsset && orderAmount.isFinite() && orderAmount.isGreaterThan(0)
          ? directSnapshot.tickerPrice?.multipliedBy(orderAmount) || null
          : null;

      if (baseAsset && baseFree.isZero()) {
        warnings.push(`Low ${baseAsset} balance`);
      }
      if (quoteAsset && quoteFree.isLessThan(quoteRequirement || orderAmount)) {
        warnings.push(`Low ${quoteAsset} balance`);
      }

      return warnings;
    } catch (error) {
      throw this.mapCCXTError(error);
    }
  }

  private normalizeMarketSymbol(symbol?: string) {
    return String(symbol || '')
      .split(':')[0]
      .trim()
      .toUpperCase();
  }

  private readPositiveAmount(value: unknown): string {
    const trimmed = String(value ?? '').trim();

    if (!trimmed) {
      return '';
    }

    const amount = new BigNumber(trimmed);

    if (!amount.isFinite() || !amount.isGreaterThan(0)) {
      return '';
    }

    return amount.toString();
  }

  private readPositiveBigNumber(value: unknown): BigNumber | null {
    const amount = this.readPositiveAmount(value);

    return amount ? new BigNumber(amount) : null;
  }

  private async resolveDirectMarketSnapshot(
    exchangeName: string,
    pair: string,
    accountLabel: string,
  ): Promise<DirectMarketSnapshot> {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );
    const [balance, tickerPrice] = await Promise.all([
      exchange.fetchBalance(),
      this.resolveTickerPrice(exchangeName, pair, accountLabel),
    ]);

    return {
      balance,
      tickerPrice,
    };
  }

  private async resolveDirectBalanceSnapshot(
    exchangeName: string,
    accountLabel: string,
    tickerPrice?: BigNumber | null,
  ): Promise<DirectMarketSnapshot> {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );

    return {
      balance: await exchange.fetchBalance(),
      tickerPrice,
    };
  }

  private async resolveTickerPrice(
    exchangeName: string,
    pair: string,
    accountLabel: string,
  ): Promise<BigNumber | null> {
    try {
      const exchange = this.exchangeInitService.getExchange(
        exchangeName,
        accountLabel,
      );
      const ticker = await exchange.fetchTicker(pair);
      const bid = this.readPositiveBigNumber(ticker?.bid);
      const ask = this.readPositiveBigNumber(ticker?.ask);

      if (bid && ask) {
        return bid.plus(ask).dividedBy(2);
      }

      return (
        this.readPositiveBigNumber(ticker?.last) ??
        this.readPositiveBigNumber(ticker?.close) ??
        bid ??
        ask
      );
    } catch (error) {
      this.logger.warn(
        `Failed to resolve ticker price for ${exchangeName} ${pair}`,
        error,
      );

      return null;
    }
  }

  private async resolveMinimumOrderAmount(
    exchangeName: string,
    pair: string,
    persistedMinimum: unknown,
    accountLabel: string,
    snapshot?: DirectMarketSnapshot,
  ): Promise<string> {
    const candidates = [this.readPositiveBigNumber(persistedMinimum)].filter(
      (value): value is BigNumber => value !== null,
    );

    try {
      const markets = (await this.exchangeInitService.getCcxtExchangeMarkets(
        exchangeName,
      )) as Array<{
        symbol?: string;
        limits?: {
          amount?: { min?: number | string | null };
          cost?: { min?: number | string | null };
        };
      }>;
      const normalizedPair = this.normalizeMarketSymbol(pair);
      const market = Array.isArray(markets)
        ? markets.find(
            (item) =>
              this.normalizeMarketSymbol(item?.symbol) === normalizedPair,
          )
        : undefined;
      const amountMinimum = this.readPositiveBigNumber(
        market?.limits?.amount?.min,
      );
      const costMinimum = this.readPositiveBigNumber(market?.limits?.cost?.min);

      if (amountMinimum) {
        candidates.push(amountMinimum);
      }

      if (costMinimum) {
        const tickerPrice =
          snapshot?.tickerPrice ??
          (await this.resolveTickerPrice(exchangeName, pair, accountLabel));

        if (tickerPrice) {
          candidates.push(costMinimum.dividedBy(tickerPrice));
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to resolve minimum order amount for ${exchangeName} ${pair}`,
        error,
      );
    }

    if (candidates.length === 0) {
      return '';
    }

    return candidates
      .reduce((maximum, candidate) =>
        candidate.isGreaterThan(maximum) ? candidate : maximum,
      )
      .toString();
  }

  private async validateMinimumOrderAmount(
    exchangeName: string,
    pair: string,
    resolvedConfig: Record<string, unknown>,
    accountLabel: string,
    snapshot?: DirectMarketSnapshot,
  ): Promise<void> {
    const pairConfig = await this.growdataMarketMakingPairRepository.findOne({
      where: { exchange_id: exchangeName, symbol: pair },
    });
    const minimum = await this.resolveMinimumOrderAmount(
      exchangeName,
      pair,
      pairConfig?.min_order_amount,
      accountLabel,
      snapshot,
    );

    if (!minimum) {
      return;
    }

    const orderAmount = new BigNumber(
      String(
        resolvedConfig.orderAmount ??
          resolvedConfig.maxOrderAmount ??
          resolvedConfig.baseTradeAmount ??
          '',
      ),
    );

    if (!orderAmount.isFinite()) {
      return;
    }

    if (orderAmount.isLessThan(minimum)) {
      throw new BadRequestException(
        `Order amount ${orderAmount.toFixed()} is below minimum ${minimum} for ${exchangeName} ${pair}`,
      );
    }
  }

  private async validateExecutableSpreadConfig(
    exchangeName: string,
    accountLabel: string,
    pair: string,
    resolvedConfig: Record<string, unknown>,
  ): Promise<void> {
    const bidSpread = Number(resolvedConfig.bidSpread || 0);
    const askSpread = Number(resolvedConfig.askSpread || 0);
    const configuredMinimumSpread = Number(resolvedConfig.minimumSpread || 0);
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );
    const market = exchange?.markets?.[pair];
    const makerFee = Number(
      market?.maker ?? exchange?.fees?.trading?.maker ?? 0,
    );
    const feeFloor =
      Number.isFinite(makerFee) && makerFee > 0 ? makerFee * 2 : 0;
    const effectiveMinimumSpread = Math.max(configuredMinimumSpread, feeFloor);

    if (effectiveMinimumSpread <= 0) {
      return;
    }

    const invalidSides: string[] = [];

    if (
      Number.isFinite(bidSpread) &&
      bidSpread > 0 &&
      bidSpread < effectiveMinimumSpread
    ) {
      invalidSides.push(
        `bidSpread ${bidSpread} < effectiveMinimumSpread ${effectiveMinimumSpread}`,
      );
    }
    if (
      Number.isFinite(askSpread) &&
      askSpread > 0 &&
      askSpread < effectiveMinimumSpread
    ) {
      invalidSides.push(
        `askSpread ${askSpread} < effectiveMinimumSpread ${effectiveMinimumSpread}`,
      );
    }

    if (invalidSides.length === 0) {
      return;
    }

    throw new BadRequestException(
      `PMM spread config will never quote for ${exchangeName} ${pair}: ${invalidSides.join(
        '; ',
      )}. Lower minimumSpread/fee floor or widen bid/ask spread.`,
    );
  }

  private getRuntimeSession(orderId: string): RuntimeSessionLike | null {
    const executor = this.executorRegistry.findExecutorByOrderId(orderId);
    const session = executor?.getSession(orderId);

    return session || null;
  }

  private getEstimatedLastTickAt(
    session: RuntimeSessionLike | null,
  ): string | null {
    if (!session) {
      return null;
    }

    const cadenceMs = Number(session.cadenceMs || 0);
    const estimateMs = Math.max(
      0,
      Number(session.nextRunAtMs || 0) - cadenceMs,
    );

    return estimateMs > 0 ? new Date(estimateMs).toISOString() : null;
  }

  private resolveExecutorHealth(
    session: RuntimeSessionLike | null,
  ): 'active' | 'gone' | 'stale' {
    if (!session) {
      return 'gone';
    }

    const lastTickAt = this.getEstimatedLastTickAt(session);

    if (!lastTickAt) {
      return 'stale';
    }

    return Date.now() - Date.parse(lastTickAt) > DIRECT_ORDER_STALE_MS
      ? 'stale'
      : 'active';
  }

  private resolveRuntimeState(
    orderState: string,
    session: RuntimeSessionLike | null,
    queueState?: StrategyIntentQueueState | null,
  ): string {
    if (orderState !== 'running') {
      return orderState;
    }

    if (queueState?.blockedByFailure) {
      return 'failed';
    }

    return this.resolveExecutorHealth(session);
  }

  private buildStrategyKey(order: MarketMakingOrder): string {
    const controllerType = this.readControllerType(order);

    if (controllerType === 'pureMarketMaking') {
      return createPureMarketMakingStrategyKey(order.orderId);
    }

    return createStrategyKey({
      type: normalizeControllerType(controllerType) as StrategyType,
      user_id:
        String(
          order.userId || order.strategySnapshot?.resolvedConfig?.userId || '',
        ) || 'admin-direct',
      client_id:
        String(
          order.strategySnapshot?.resolvedConfig?.clientId ||
            order.orderId ||
            '',
        ) || order.orderId,
    });
  }

  private readControllerType(
    order: MarketMakingOrder,
  ): DirectOrderControllerType {
    const snapshotControllerType = String(
      order.strategySnapshot?.controllerType || '',
    ).trim();

    if (snapshotControllerType) {
      return snapshotControllerType;
    }

    return (
      String(
        order.strategySnapshot?.resolvedConfig?.controllerType || '',
      ).trim() || 'pureMarketMaking'
    );
  }

  private readPrimaryAccountLabel(order: MarketMakingOrder): string {
    return this.isDualAccountMode(order)
      ? this.readMakerAccountLabel(order)
      : this.readAccountLabel(order);
  }

  private async readApiKeyName(
    apiKeyId: string | null | undefined,
    fallback: string,
  ): Promise<string> {
    if (!apiKeyId) {
      return fallback;
    }

    try {
      const apiKey = await this.exchangeApiKeyService.readAPIKey(apiKeyId);
      const apiKeyName = String(apiKey?.name || '').trim();

      return apiKeyName || fallback;
    } catch {
      return fallback;
    }
  }

  private readMakerAccountLabel(order: MarketMakingOrder): string {
    const accountLabel =
      order.strategySnapshot?.resolvedConfig?.makerAccountLabel ||
      order.strategySnapshot?.resolvedConfig?.accountLabel;

    return typeof accountLabel === 'string' && accountLabel.trim().length > 0
      ? accountLabel.trim()
      : 'default';
  }

  private readTakerAccountLabel(order: MarketMakingOrder): string {
    const accountLabel =
      order.strategySnapshot?.resolvedConfig?.takerAccountLabel;

    return typeof accountLabel === 'string' && accountLabel.trim().length > 0
      ? accountLabel.trim()
      : '';
  }

  private readTakerApiKeyId(order: MarketMakingOrder): string {
    const apiKeyId = order.strategySnapshot?.resolvedConfig?.takerApiKeyId;

    if (apiKeyId === undefined || apiKeyId === null) {
      return '';
    }

    const normalizedApiKeyId = String(apiKeyId).trim();

    return normalizedApiKeyId.length > 0 ? normalizedApiKeyId : '';
  }

  private isDualAccountMode(order: MarketMakingOrder): boolean {
    const config = order.strategySnapshot?.resolvedConfig;

    if (config && typeof config === 'object') {
      const makerLabel = config.makerAccountLabel;
      const takerLabel = config.takerAccountLabel;

      if (
        (typeof makerLabel === 'string' && makerLabel.trim()) ||
        (typeof takerLabel === 'string' && String(takerLabel).trim())
      ) {
        return true;
      }
    }

    const controllerType = this.readControllerType(order);

    return (
      controllerType === 'dualAccountVolume' ||
      controllerType === 'dualAccountBestCapacityVolume' ||
      controllerType === EFFICIENT_DUAL_ACCOUNT_CONTROLLER_TYPE
    );
  }

  private resolveDirectExecutionModeFromOrder(
    order: MarketMakingOrder,
  ): 'single_account' | 'dual_account' | null {
    if (this.isDualAccountMode(order)) {
      return 'dual_account';
    }

    return 'single_account';
  }

  private resolveDirectExecutionMode(
    order: MarketMakingOrder,
    definitionMap: Map<string, StrategyDefinition>,
  ): 'single_account' | 'dual_account' | null {
    const definition = definitionMap.get(order.strategyDefinitionId || '');

    if (definition) {
      const capabilities = getStrategyDefinitionCapabilities(definition);

      if (capabilities.directExecutionMode) {
        return capabilities.directExecutionMode;
      }
    }

    return this.resolveDirectExecutionModeFromOrder(order);
  }

  private readConfigString(value: unknown): string | null {
    return value !== undefined && value !== null ? String(value) : null;
  }

  private readConfigNumber(value: unknown): number | null {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  private readAccountLabel(order: MarketMakingOrder): string {
    const accountLabel = order.strategySnapshot?.resolvedConfig?.accountLabel;

    return typeof accountLabel === 'string' && accountLabel.trim().length > 0
      ? accountLabel.trim()
      : 'default';
  }

  private parsePair(pair: string): [string, string] {
    const normalizedPair = pair.replace('-', '/');
    const [baseAsset, quoteAsset] = normalizedPair.split('/');

    return [baseAsset || '', quoteAsset || ''];
  }
}

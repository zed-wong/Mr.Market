import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import * as ccxt from 'ccxt';
import { randomUUID } from 'crypto';
import { Wallet } from 'ethers';
import { GrowdataMarketMakingPair } from 'src/common/entities/data/grow-data.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { createPureMarketMakingStrategyKey } from 'src/common/helpers/strategyKey';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CampaignService } from 'src/modules/campaign/campaign.service';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { ExchangeApiKeyService } from 'src/modules/market-making/exchange-api-key/exchange-api-key.service';
import { StrategyConfigResolverService } from 'src/modules/market-making/strategy/dex/strategy-config-resolver.service';
import { ExecutorRegistry } from 'src/modules/market-making/strategy/execution/executor-registry';
import {
  StrategyIntentQueueState,
  StrategyIntentStoreService,
} from 'src/modules/market-making/strategy/execution/strategy-intent-store.service';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';
import { ExchangeOrderTrackerService } from 'src/modules/market-making/trackers/exchange-order-tracker.service';
import { OrderBookTrackerService } from 'src/modules/market-making/trackers/order-book-tracker.service';
import { PrivateStreamTrackerService } from 'src/modules/market-making/trackers/private-stream-tracker.service';
import { mapStrategySnapshotToMarketMakingOrderFields } from 'src/modules/market-making/user-orders/market-making-order-snapshot.utils';
import { MarketMakingRuntimeService } from 'src/modules/market-making/user-orders/market-making-runtime.service';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { In, Repository } from 'typeorm';

import {
  CampaignJoinRequestDto,
  DirectStartMarketMakingDto,
} from './admin-direct-mm.dto';

const DIRECT_ORDER_STALE_MS = 15_000;

type RuntimeSessionLike = {
  orderId: string;
  cadenceMs: number;
  nextRunAtMs: number;
  accountLabel?: string;
};

type AdminCampaign = Record<string, unknown> & { joined: boolean };

@Injectable()
export class AdminDirectMarketMakingService {
  private readonly logger = new CustomLogger(
    AdminDirectMarketMakingService.name,
  );

  constructor(
    @InjectRepository(MarketMakingOrder)
    private readonly marketMakingRepository: Repository<MarketMakingOrder>,
    @InjectRepository(GrowdataMarketMakingPair)
    private readonly growdataMarketMakingPairRepository: Repository<GrowdataMarketMakingPair>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitionRepository: Repository<StrategyDefinition>,
    private readonly userOrdersService: UserOrdersService,
    private readonly marketMakingRuntimeService: MarketMakingRuntimeService,
    private readonly strategyConfigResolver: StrategyConfigResolverService,
    private readonly exchangeApiKeyService: ExchangeApiKeyService,
    private readonly exchangeInitService: ExchangeInitService,
    private readonly executorRegistry: ExecutorRegistry,
    private readonly strategyService: StrategyService,
    private readonly strategyIntentStoreService: StrategyIntentStoreService,
    private readonly exchangeOrderTrackerService: ExchangeOrderTrackerService,
    private readonly privateStreamTrackerService: PrivateStreamTrackerService,
    private readonly orderBookTrackerService: OrderBookTrackerService,
    private readonly campaignService: CampaignService,
    private readonly configService: ConfigService,
  ) {}

  async directStart(
    dto: DirectStartMarketMakingDto,
    adminUserId?: string,
  ): Promise<{ orderId: string; state: string; warnings: string[] }> {
    const apiKey = await this.exchangeApiKeyService.readDecryptedAPIKey(
      dto.apiKeyId,
    );

    if (!apiKey) {
      throw new BadRequestException('API key not found');
    }
    if (apiKey.exchange !== dto.exchangeName) {
      throw new BadRequestException('API key exchange does not match request');
    }
    if ((apiKey.exchange_index || 'default') !== dto.accountLabel) {
      throw new BadRequestException(
        'API key account label does not match request',
      );
    }

    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id: dto.strategyDefinitionId, enabled: true },
    });

    if (!definition) {
      throw new BadRequestException('Strategy definition not found');
    }
    if (
      this.strategyConfigResolver.getDefinitionControllerType(definition) !==
      'pureMarketMaking'
    ) {
      throw new BadRequestException('Strategy definition not found');
    }

    const orderId = randomUUID();
    const resolvedConfig =
      await this.strategyConfigResolver.resolveForOrderSnapshot(
        dto.strategyDefinitionId,
        {
          ...(dto.configOverrides || {}),
          userId: adminUserId || 'admin-direct',
          clientId: orderId,
          marketMakingOrderId: orderId,
          pair: dto.pair,
          exchangeName: dto.exchangeName,
        },
      );

    resolvedConfig.resolvedConfig.accountLabel = dto.accountLabel;

    await this.validateMinimumOrderAmount(
      dto.exchangeName,
      dto.pair,
      resolvedConfig.resolvedConfig,
    );

    const warnings = await this.runBalancePreCheck(
      dto.exchangeName,
      dto.pair,
      dto.accountLabel,
      resolvedConfig.resolvedConfig,
    );

    const order = this.marketMakingRepository.create({
      orderId,
      userId: adminUserId || 'admin-direct',
      pair: dto.pair,
      exchangeName: dto.exchangeName,
      strategyDefinitionId: dto.strategyDefinitionId,
      strategySnapshot: resolvedConfig,
      source: 'admin_direct',
      apiKeyId: dto.apiKeyId,
      ...mapStrategySnapshotToMarketMakingOrderFields(resolvedConfig),
      state: 'created',
      createdAt: getRFC3339Timestamp(),
      rewardAddress: null,
    });

    await this.userOrdersService.createMarketMaking(order);

    try {
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
      throw new BadRequestException('Order already stopped');
    }

    await this.marketMakingRuntimeService.stopOrder(
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
    if (order.state !== 'stopped') {
      throw new BadRequestException('Only stopped orders can be resumed');
    }

    const accountLabel = this.readAccountLabel(order);
    const warnings = await this.runBalancePreCheck(
      order.exchangeName,
      order.pair,
      accountLabel,
      order.strategySnapshot?.resolvedConfig || {},
    );

    try {
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

  async listDirectOrders() {
    const orders = await this.marketMakingRepository.find({
      where: { source: 'admin_direct' },
      order: { createdAt: 'DESC' },
    });
    const definitionIds = orders
      .map((order) => order.strategyDefinitionId)
      .filter((value): value is string => Boolean(value));
    const definitions = definitionIds.length
      ? await this.strategyDefinitionRepository.find({
          where: { id: In(definitionIds) },
        })
      : [];
    const definitionMap = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );

    return await Promise.all(
      orders.map(async (order) => {
        const session = this.getRuntimeSession(order.orderId);
        const strategyKey = createPureMarketMakingStrategyKey(order.orderId);
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
        const accountLabel = this.readAccountLabel(order);
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
          createdAt: order.createdAt,
          lastTickAt,
          accountLabel,
          apiKeyId: order.apiKeyId || null,
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

    const session = this.getRuntimeSession(orderId);
    const lastTickAt = this.getEstimatedLastTickAt(session);
    const accountLabel = this.readAccountLabel(order);
    const strategyKey = createPureMarketMakingStrategyKey(orderId);
    const queueState =
      order.state === 'running'
        ? await this.strategyIntentStoreService.getQueueState(strategyKey)
        : null;
    const privateEvent = this.privateStreamTrackerService.getLatestEvent(
      order.exchangeName,
      accountLabel,
    );
    const openOrders =
      this.exchangeOrderTrackerService.getOpenOrders(strategyKey);
    const intents =
      order.state === 'stopped'
        ? []
        : this.strategyService.getLatestIntentsForStrategy(strategyKey);
    const book = this.orderBookTrackerService.getOrderBook(
      order.exchangeName,
      order.pair,
    );

    let inventoryBalances: Array<{
      asset: string;
      free: string;
      used: string;
      total: string;
    }> = [];

    try {
      const exchange = this.exchangeInitService.getExchange(
        order.exchangeName,
        accountLabel,
      );
      const balance = await exchange.fetchBalance();
      const [baseAsset, quoteAsset] = this.parsePair(order.pair);

      inventoryBalances = [baseAsset, quoteAsset]
        .filter(Boolean)
        .map((asset) => ({
          asset,
          free: String(balance?.free?.[asset] ?? 0),
          used: String(balance?.used?.[asset] ?? 0),
          total: String(balance?.total?.[asset] ?? 0),
        }));
    } catch (error) {
      this.logger.warn(
        `Failed to fetch inventory for direct order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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

    const resolvedConfig = order.strategySnapshot?.resolvedConfig || {};
    const orderConfig = {
      orderAmount:
        resolvedConfig.orderAmount !== undefined &&
        resolvedConfig.orderAmount !== null
          ? String(resolvedConfig.orderAmount)
          : null,
      bidSpread:
        resolvedConfig.bidSpread !== undefined &&
        resolvedConfig.bidSpread !== null
          ? String(resolvedConfig.bidSpread)
          : null,
      askSpread:
        resolvedConfig.askSpread !== undefined &&
        resolvedConfig.askSpread !== null
          ? String(resolvedConfig.askSpread)
          : null,
      numberOfLayers:
        resolvedConfig.numberOfLayers !== undefined &&
        resolvedConfig.numberOfLayers !== null
          ? String(resolvedConfig.numberOfLayers)
          : null,
    };

    return {
      orderId,
      state: order.state,
      runtimeState,
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
      spread,
      inventoryBalances,
      stale: executorHealth === 'stale',
    };
  }

  async listCampaigns(): Promise<AdminCampaign[]> {
    const campaigns = await this.campaignService.getCampaigns();
    const walletStatus = await this.getWalletStatus();

    if (!walletStatus.address) {
      return campaigns.map((campaign) => ({ ...campaign, joined: false }));
    }

    let joinedKeys: Set<string>;

    try {
      const privateKey =
        this.configService.get<string>('WEB3_PRIVATE_KEY') ||
        this.configService.get<string>('web3.private_key') ||
        process.env.WEB3_PRIVATE_KEY;

      const nonce = await this.campaignService.get_auth_nonce(
        walletStatus.address,
      );
      const accessToken = await this.campaignService.authenticate_web3_user(
        walletStatus.address,
        nonce,
        privateKey,
      );

      joinedKeys = await this.campaignService.getJoinedCampaignKeys(
        accessToken,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch joined campaigns: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      joinedKeys = new Set();
    }

    return campaigns.map((campaign) => {
      const key = `${campaign.chain_id}:${campaign.address.toLowerCase()}`;

      return { ...campaign, joined: joinedKeys.has(key) };
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

    const privateKey =
      this.configService.get<string>('WEB3_PRIVATE_KEY') ||
      this.configService.get<string>('web3.private_key') ||
      process.env.WEB3_PRIVATE_KEY;

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

    await this.campaignService.joinCampaignWithAuth(
      dto.evmAddress.toLowerCase(),
      privateKey,
      apiKey.exchange,
      apiKey.api_key,
      apiKey.api_secret,
      normalizedChainId,
      dto.campaignAddress.toLowerCase(),
    );

    return {
      status: 'joined',
      apiKeyId: dto.apiKeyId,
      campaignAddress: dto.campaignAddress.toLowerCase(),
      chainId: normalizedChainId,
    };
  }

  async getWalletStatus(): Promise<{
    configured: boolean;
    address: string | null;
  }> {
    const privateKey =
      this.configService.get<string>('WEB3_PRIVATE_KEY') ||
      this.configService.get<string>('web3.private_key') ||
      process.env.WEB3_PRIVATE_KEY;

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

  private async runBalancePreCheck(
    exchangeName: string,
    pair: string,
    accountLabel: string,
    resolvedConfig: Record<string, unknown>,
  ): Promise<string[]> {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );
    const [baseAsset, quoteAsset] = this.parsePair(pair);

    try {
      const balance = await exchange.fetchBalance();
      const orderAmount = new BigNumber(
        String(resolvedConfig.orderAmount || 0),
      );
      const warnings: string[] = [];
      const baseFree = new BigNumber(balance?.free?.[baseAsset] ?? 0);
      const quoteFree = new BigNumber(balance?.free?.[quoteAsset] ?? 0);

      if (baseAsset && baseFree.isZero()) {
        warnings.push(`Low ${baseAsset} balance`);
      }
      if (quoteAsset && quoteFree.isLessThan(orderAmount)) {
        warnings.push(`Low ${quoteAsset} balance`);
      }

      return warnings;
    } catch (error) {
      throw this.mapCCXTError(error);
    }
  }

  private async validateMinimumOrderAmount(
    exchangeName: string,
    pair: string,
    resolvedConfig: Record<string, unknown>,
  ): Promise<void> {
    const pairConfig = await this.growdataMarketMakingPairRepository.findOne({
      where: { exchange_id: exchangeName, symbol: pair },
    });
    const minimum = String(pairConfig?.min_order_amount || '').trim();

    if (!minimum) {
      return;
    }

    const orderAmount = new BigNumber(String(resolvedConfig.orderAmount || ''));

    if (!orderAmount.isFinite()) {
      return;
    }

    if (orderAmount.isLessThan(minimum)) {
      throw new BadRequestException(
        `Order amount ${orderAmount.toFixed()} is below minimum ${minimum} for ${exchangeName} ${pair}`,
      );
    }
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

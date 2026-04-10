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
import {
  createPureMarketMakingStrategyKey,
  createStrategyKey,
} from 'src/common/helpers/strategyKey';
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
const DIRECT_RESERVED_CONFIG_FIELDS = new Set([
  'userId',
  'clientId',
  'marketMakingOrderId',
  'pair',
  'symbol',
  'exchangeName',
]);

type RuntimeSessionLike = {
  orderId: string;
  cadenceMs: number;
  nextRunAtMs: number;
  accountLabel?: string;
};

type AdminCampaign = Record<string, unknown> & { joined: boolean };

type DirectExecutionAccount = {
  apiKeyId: string;
  accountLabel: string;
  apiKeyName: string;
  apiKey: Record<string, any>;
};

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
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id: dto.strategyDefinitionId, enabled: true },
    });

    if (!definition) {
      throw new BadRequestException('Strategy definition not found');
    }

    const controllerType =
      this.strategyConfigResolver.getDefinitionControllerType(definition);

    if (
      controllerType !== 'pureMarketMaking' &&
      controllerType !== 'dualAccountVolume'
    ) {
      throw new BadRequestException('Strategy definition not found');
    }

    const executionAccounts = await this.resolveExecutionAccounts(
      dto,
      controllerType,
    );
    const orderId = randomUUID();
    const configOverrides = this.sanitizeConfigOverrides(dto.configOverrides);

    const resolvedConfig =
      await this.strategyConfigResolver.resolveForOrderSnapshot(
        dto.strategyDefinitionId,
        {
          ...configOverrides,
          userId: adminUserId || 'admin-direct',
          clientId: orderId,
          marketMakingOrderId: orderId,
          pair: dto.pair,
          symbol: dto.pair,
          exchangeName: dto.exchangeName,
        },
      );

    if (controllerType === 'dualAccountVolume') {
      resolvedConfig.resolvedConfig.makerAccountLabel =
        executionAccounts.primary.accountLabel;
      resolvedConfig.resolvedConfig.takerAccountLabel =
        executionAccounts.secondary?.accountLabel;
      resolvedConfig.resolvedConfig.makerApiKeyId =
        executionAccounts.primary.apiKeyId;
      resolvedConfig.resolvedConfig.takerApiKeyId =
        executionAccounts.secondary?.apiKeyId;
    } else {
      resolvedConfig.resolvedConfig.accountLabel =
        executionAccounts.primary.accountLabel;
    }

    const warnings =
      controllerType === 'dualAccountVolume'
        ? await this.runDualAccountBalancePreCheck(
            dto.exchangeName,
            dto.pair,
            executionAccounts,
            resolvedConfig.resolvedConfig,
          )
        : await this.runSingleAccountPreCheck(
            dto.exchangeName,
            dto.pair,
            executionAccounts.primary.accountLabel,
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
      apiKeyId: executionAccounts.primary.apiKeyId,
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

    const controllerType = this.readControllerType(order);
    const resolvedConfig = order.strategySnapshot?.resolvedConfig || {};
    const warnings =
      controllerType === 'dualAccountVolume'
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
          )
        : await this.runSingleAccountPreCheck(
            order.exchangeName,
            order.pair,
            this.readPrimaryAccountLabel(order),
            resolvedConfig,
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
          createdAt: order.createdAt,
          lastTickAt,
          accountLabel: await this.readPrimaryDisplayLabel(order),
          makerAccountLabel: this.readMakerAccountLabel(order),
          takerAccountLabel: this.readTakerAccountLabel(order),
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
    const strategyKey = this.buildStrategyKey(order);
    const primaryAccountLabel = this.readPrimaryAccountLabel(order);
    const session = this.getRuntimeSession(orderId);
    const lastTickAt = this.getEstimatedLastTickAt(session);
    const queueState =
      order.state === 'running'
        ? await this.strategyIntentStoreService.getQueueState(strategyKey)
        : null;
    const privateEvent =
      controllerType === 'pureMarketMaking'
        ? this.privateStreamTrackerService.getLatestEvent(
            order.exchangeName,
            primaryAccountLabel,
          )
        : null;
    const openOrders =
      this.exchangeOrderTrackerService.getLiveOrders(strategyKey);
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
        primaryAccountLabel,
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
      orderAmount: this.readConfigString(
        resolvedConfig.orderAmount ?? resolvedConfig.baseTradeAmount,
      ),
      bidSpread: this.readConfigString(resolvedConfig.bidSpread),
      askSpread: this.readConfigString(resolvedConfig.askSpread),
      numberOfLayers: this.readConfigString(resolvedConfig.numberOfLayers),
      baseIncrementPercentage: this.readConfigString(
        resolvedConfig.baseIncrementPercentage,
      ),
      dynamicRoleSwitching:
        typeof resolvedConfig.dynamicRoleSwitching === 'boolean'
          ? resolvedConfig.dynamicRoleSwitching
          : null,
      targetQuoteVolume: this.readConfigString(
        resolvedConfig.targetQuoteVolume,
      ),
      publishedCycles: this.readConfigNumber(resolvedConfig.publishedCycles),
      completedCycles: this.readConfigNumber(resolvedConfig.completedCycles),
      tradedQuoteVolume: this.readConfigString(
        resolvedConfig.tradedQuoteVolume,
      ),
      realizedPnlQuote: this.readConfigString(resolvedConfig.realizedPnlQuote),
    };

    return {
      orderId,
      state: order.state,
      runtimeState,
      controllerType,
      accountLabel: await this.readPrimaryDisplayLabel(order),
      makerAccountLabel: this.readMakerAccountLabel(order),
      takerAccountLabel: this.readTakerAccountLabel(order),
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

      const accessToken = await this.campaignService.getAccessToken(
        walletStatus.address,
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

  async listDirectStrategyDefinitions(): Promise<StrategyDefinition[]> {
    const definitions = await this.strategyDefinitionRepository.find({
      where: { enabled: true },
      order: { updatedAt: 'DESC' },
    });

    return definitions.filter((definition) => {
      const controllerType = String(
        definition.controllerType || definition.executorType || '',
      ).trim();
      const visibility = String(definition.visibility || 'public').trim();

      return (
        ['public', 'admin'].includes(visibility) && controllerType.length > 0
      );
    });
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

  private sanitizeConfigOverrides(
    configOverrides?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!configOverrides) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(configOverrides).filter(
        ([field]) => !DIRECT_RESERVED_CONFIG_FIELDS.has(field),
      ),
    );
  }

  private async resolveExecutionAccounts(
    dto: DirectStartMarketMakingDto,
    controllerType: 'pureMarketMaking' | 'dualAccountVolume',
  ): Promise<{
    primary: DirectExecutionAccount;
    secondary?: DirectExecutionAccount;
  }> {
    if (controllerType === 'dualAccountVolume') {
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

  private async runSingleAccountPreCheck(
    exchangeName: string,
    pair: string,
    accountLabel: string,
    resolvedConfig: Record<string, unknown>,
  ): Promise<string[]> {
    await this.validateMinimumOrderAmount(
      exchangeName,
      pair,
      resolvedConfig,
      accountLabel,
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
    );
  }

  private async runDualAccountBalancePreCheck(
    exchangeName: string,
    pair: string,
    executionAccounts: {
      primary: Pick<DirectExecutionAccount, 'accountLabel'>;
      secondary?: Pick<DirectExecutionAccount, 'accountLabel'>;
    },
    resolvedConfig: Record<string, unknown>,
  ): Promise<string[]> {
    await this.validateMinimumOrderAmount(
      exchangeName,
      pair,
      resolvedConfig,
      executionAccounts.primary.accountLabel,
    );

    const warnings = await Promise.all([
      this.runBalancePreCheck(
        exchangeName,
        pair,
        executionAccounts.primary.accountLabel,
        resolvedConfig,
      ),
      executionAccounts.secondary
        ? this.runBalancePreCheck(
            exchangeName,
            pair,
            executionAccounts.secondary.accountLabel,
            resolvedConfig,
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
  ): Promise<string[]> {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );
    const [baseAsset, quoteAsset] = this.parsePair(pair);

    try {
      const balance = await exchange.fetchBalance();
      const orderAmount = new BigNumber(
        String(
          resolvedConfig.orderAmount ?? resolvedConfig.baseTradeAmount ?? 0,
        ),
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
        const tickerPrice = await this.resolveTickerPrice(
          exchangeName,
          pair,
          accountLabel,
        );

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
  ): Promise<void> {
    const pairConfig = await this.growdataMarketMakingPairRepository.findOne({
      where: { exchange_id: exchangeName, symbol: pair },
    });
    const minimum = await this.resolveMinimumOrderAmount(
      exchangeName,
      pair,
      pairConfig?.min_order_amount,
      accountLabel,
    );

    if (!minimum) {
      return;
    }

    const orderAmount = new BigNumber(
      String(
        resolvedConfig.orderAmount ?? resolvedConfig.baseTradeAmount ?? '',
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
      market?.maker || exchange?.fees?.trading?.maker || 0,
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
      type: controllerType,
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
  ): 'pureMarketMaking' | 'dualAccountVolume' {
    return order.strategySnapshot?.controllerType === 'dualAccountVolume'
      ? 'dualAccountVolume'
      : 'pureMarketMaking';
  }

  private readPrimaryAccountLabel(order: MarketMakingOrder): string {
    return this.readControllerType(order) === 'dualAccountVolume'
      ? this.readMakerAccountLabel(order)
      : this.readAccountLabel(order);
  }

  private async readPrimaryDisplayLabel(
    order: MarketMakingOrder,
  ): Promise<string> {
    if (this.readControllerType(order) === 'dualAccountVolume') {
      return this.readPrimaryAccountLabel(order);
    }

    if (!order.apiKeyId) {
      return this.readAccountLabel(order);
    }

    try {
      const apiKey = await this.exchangeApiKeyService.readAPIKey(
        order.apiKeyId,
      );
      const apiKeyName = String(apiKey?.name || '').trim();

      return apiKeyName || this.readAccountLabel(order);
    } catch {
      return this.readAccountLabel(order);
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

    return typeof apiKeyId === 'string' && apiKeyId.trim().length > 0
      ? apiKeyId.trim()
      : '';
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

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { ExecutorAction } from '../config/executor-action.types';
import { ConnectorId } from '../config/strategy.dto';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyRuntimeSession,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import {
  normalizeExecutionCategory,
  StrategyExecutionCategory,
  toLegacyExecutionVenue,
} from '../config/strategy-execution-category';
import type {
  AmmDexVolumeStrategyParams,
  CexVolumeStrategyParams,
  VolumeStrategyParams,
} from '../config/strategy-params.types';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { StrategySessionRegistryService } from '../runtime/strategy-session-registry.service';
import {
  normalizeVolumeRerunConfig,
  sanitizeVolumeCadenceMs,
} from './volume-controller.helpers';

@Injectable()
export class VolumeStrategyController implements StrategyController {
  readonly strategyType = 'volume' as const;

  private readonly logger = new CustomLogger(VolumeStrategyController.name);

  constructor(
    @Optional()
    @InjectRepository(StrategyInstance)
    private readonly strategyInstanceRepository?: Repository<StrategyInstance>,
    @Optional()
    private readonly strategySessionRegistryService?: StrategySessionRegistryService,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
  ) {}

  getCadenceMs(parameters: Record<string, unknown>): number {
    return sanitizeVolumeCadenceMs(
      parameters?.baseIntervalTime ?? parameters?.intervalTime,
    );
  }

  async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
    return await this.buildVolumeSessionActions(ctx.session, ctx.ts);
  }

  async onActionsPublished(
    ctx: StrategyTickContext,
    actions: ExecutorAction[],
  ): Promise<void> {
    await this.onVolumeActionsPublished(ctx.session, actions);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyControllerFacade,
  ): Promise<void> {
    const config = normalizeVolumeRerunConfig(strategyInstance);

    await service.executeVolumeStrategy(
      config.exchangeName,
      config.symbol,
      config.baseIncrementPercentage,
      config.baseIntervalTime,
      config.baseTradeAmount,
      config.numTrades,
      config.userId,
      config.clientId,
      config.pricePushRate,
      config.postOnlySide,
      config.executionVenue as any,
      config.dexId as any,
      config.chainId,
      config.tokenIn,
      config.tokenOut,
      config.feeTier,
      config.slippageBps,
      config.recipient,
      config.executionCategory,
    );
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    const executionVenue = this.resolveVolumeExecutionVenue(config);
    const executionCategory = this.resolveVolumeExecutionCategory(config);

    await service.executeVolumeStrategy(
      this.readString(config.exchangeName),
      this.readString(config.symbol),
      this.readNumber(config.incrementPercentage) ??
        this.readNumber(config.baseIncrementPercentage) ??
        0,
      this.readNumber(config.intervalTime) ??
        this.readNumber(config.baseIntervalTime) ??
        10,
      this.readNumber(config.tradeAmount) ??
        this.readNumber(config.baseTradeAmount) ??
        0,
      this.readNumber(config.numTrades) ?? 1,
      this.readString(config.userId) || '',
      this.readString(config.clientId) || '',
      this.readNumber(config.pricePushRate) ?? 0,
      this.readSide(config.postOnlySide),
      executionVenue,
      this.readConnectorId(config.dexId),
      this.readNumber(config.chainId),
      this.readString(config.tokenIn),
      this.readString(config.tokenOut),
      this.readNumber(config.feeTier),
      this.readNumber(config.slippageBps),
      this.readString(config.recipient),
      executionCategory,
    );
  }

  async buildVolumeSessionActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const params = session.params as VolumeStrategyParams;
    const executedTrades = Number(params.executedTrades || 0);

    if (executedTrades >= Number(params.numTrades || 0)) {
      const activeBeforeStop = this.getActiveSession(session.strategyKey);

      if (!this.isSameActiveSession(activeBeforeStop, session)) {
        this.logger.warn(
          `Skipping stale volume stop for ${session.strategyKey}: active session changed`,
        );

        return [];
      }

      return [
        this.buildStopControllerAction(session, ts, 'completed_trades_reached'),
      ];
    }

    if (params.executionCategory === 'amm') {
      const side = this.resolveVolumeSide(params.postOnlySide, executedTrades);
      const amountIn = this.computeAmmAmountIn(params, executedTrades);

      return [
        {
          type: 'EXECUTE_AMM_SWAP',
          intentId: `${session.strategyKey}:${ts}:amm-${executedTrades}`,
          runtimeInstanceKey: session.strategyKey,
          strategyKey: session.strategyKey,
          userId: session.userId,
          clientId: session.clientId,
          exchange: params.exchangeName,
          pair: params.symbol,
          side,
          price: '0',
          qty: amountIn,
          executionCategory: 'amm',
          metadata: {
            dexId: params.dexId,
            chainId: params.chainId,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            feeTier: params.feeTier,
            baseTradeAmount: params.baseTradeAmount,
            baseIncrementPercentage: params.baseIncrementPercentage,
            pricePushRate: params.pricePushRate,
            executedTrades,
            slippageBps: params.slippageBps,
            recipient: params.recipient,
          },
          createdAt: ts,
          status: 'NEW',
        },
      ];
    }

    return await this.buildVolumeActions(
      session.strategyKey,
      params as CexVolumeStrategyParams,
      ts,
    );
  }

  async onVolumeActionsPublished(
    session: StrategyRuntimeSession,
    actions: ExecutorAction[],
  ): Promise<void> {
    if (actions.length === 0) {
      return;
    }

    const activeBeforePersist = this.getActiveSession(session.strategyKey);

    if (!this.isSameActiveSession(activeBeforePersist, session)) {
      this.logger.warn(
        `Skipping stale volume tick before persist for ${session.strategyKey}: active session changed`,
      );

      return;
    }

    const params = activeBeforePersist.params as VolumeStrategyParams;
    const nextParams: VolumeStrategyParams = {
      ...params,
      executedTrades: Number(params.executedTrades || 0) + 1,
    };

    await this.persistStrategyParams(session.strategyKey, nextParams);

    const currentSession = this.getActiveSession(session.strategyKey);

    if (this.isSameActiveSession(currentSession, session)) {
      currentSession.params = nextParams;
      this.setActiveSession(session.strategyKey, currentSession);

      return;
    }

    this.logger.warn(
      `Skipping stale volume tick write-back for ${session.strategyKey}: active session changed`,
    );
  }

  async buildVolumeActions(
    strategyKey: string,
    params: CexVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    const trackedBestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

    if (!trackedBestBidAsk) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: tracked order book unavailable`,
      );

      return [];
    }

    const { bestBid, bestAsk } = trackedBestBidAsk;
    const mid = new BigNumber(bestBid).plus(bestAsk).dividedBy(2);
    const pushMultiplier = new BigNumber(1).plus(
      new BigNumber(params.pricePushRate || 0)
        .dividedBy(100)
        .multipliedBy(Number(params.executedTrades || 0)),
    );
    const basePrice = mid.multipliedBy(pushMultiplier);
    const offsetMultiplier = new BigNumber(
      params.baseIncrementPercentage || 0,
    ).dividedBy(100);
    const side = this.resolveVolumeSide(
      params.postOnlySide,
      Number(params.executedTrades || 0),
    );
    const price =
      side === 'buy'
        ? basePrice.multipliedBy(new BigNumber(1).minus(offsetMultiplier))
        : basePrice.multipliedBy(new BigNumber(1).plus(offsetMultiplier));
    const qty = new BigNumber(params.baseTradeAmount);

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping volume cycle for ${strategyKey}: invalid non-positive price ${price.toFixed()} (executedTrades=${
          params.executedTrades || 0
        }, params=${JSON.stringify({
          exchangeName: params.exchangeName,
          symbol: params.symbol,
          baseIncrementPercentage: params.baseIncrementPercentage,
          pricePushRate: params.pricePushRate,
        })})`,
      );

      return [];
    }

    if (!qty.isFinite() || qty.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping volume cycle for ${strategyKey}: invalid qty ${params.baseTradeAmount}`,
      );

      return [];
    }

    return [
      this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        params.exchangeName,
        params.symbol,
        side,
        price,
        qty,
        ts,
        `volume-${params.executedTrades || 0}`,
        params.executionCategory,
      ),
    ];
  }

  resolveVolumeSide(
    postOnlySide: 'buy' | 'sell' | 'inventory_balance' | undefined,
    executedTrades: number,
    buyBias?: number,
  ): 'buy' | 'sell' {
    if (postOnlySide === 'buy' || postOnlySide === 'sell') {
      return postOnlySide;
    }

    const normalizedBuyBias =
      this.readUnitIntervalNumber(buyBias) ??
      (executedTrades > 0 ? 0.5 : undefined);

    if (normalizedBuyBias === undefined) {
      return executedTrades % 2 === 0 ? 'buy' : 'sell';
    }

    return Math.random() < normalizedBuyBias ? 'buy' : 'sell';
  }

  computeAmmAmountIn(
    params: AmmDexVolumeStrategyParams,
    executedTrades: number,
  ): string {
    const baseAmount = new BigNumber(params.baseTradeAmount || 0);

    if (!baseAmount.isFinite() || baseAmount.isLessThanOrEqualTo(0)) {
      return '0';
    }

    const pushMultiplier = new BigNumber(1).plus(
      new BigNumber(params.pricePushRate || 0)
        .dividedBy(100)
        .multipliedBy(executedTrades),
    );
    const incrementMultiplier = new BigNumber(1).plus(
      new BigNumber(params.baseIncrementPercentage || 0).dividedBy(100),
    );

    return baseAmount
      .multipliedBy(pushMultiplier)
      .multipliedBy(incrementMultiplier)
      .toFixed();
  }

  buildClobVolumeParams(input: {
    executionCategory: 'clob' | 'clob_dex';
    exchangeName: string | undefined;
    symbol: string | undefined;
    baseIncrementPercentage: number;
    baseIntervalTime: number;
    baseTradeAmount: number;
    numTrades: number;
    userId: string;
    clientId: string;
    pricePushRate: number;
    postOnlySide?: 'buy' | 'sell';
  }): CexVolumeStrategyParams {
    const exchangeName = String(input.exchangeName || '').trim();
    const symbol = String(input.symbol || '').trim();

    if (!exchangeName) {
      throw new Error('exchangeName is required for cex volume strategy');
    }
    if (!symbol) {
      throw new Error('symbol is required for cex volume strategy');
    }

    return {
      executionCategory: input.executionCategory,
      executionVenue: 'cex',
      exchangeName,
      symbol,
      baseIncrementPercentage: input.baseIncrementPercentage,
      baseIntervalTime: input.baseIntervalTime,
      baseTradeAmount: input.baseTradeAmount,
      numTrades: input.numTrades,
      userId: input.userId,
      clientId: input.clientId,
      pricePushRate: input.pricePushRate,
      postOnlySide: input.postOnlySide,
      executedTrades: 0,
    };
  }

  buildAmmDexVolumeParams(input: {
    exchangeName: string | undefined;
    symbol: string | undefined;
    baseIncrementPercentage: number;
    baseIntervalTime: number;
    baseTradeAmount: number;
    numTrades: number;
    userId: string;
    clientId: string;
    pricePushRate: number;
    postOnlySide?: 'buy' | 'sell';
    dexId?: ConnectorId;
    chainId?: number;
    tokenIn?: string;
    tokenOut?: string;
    feeTier?: number;
    slippageBps?: number;
    recipient?: string;
  }): AmmDexVolumeStrategyParams {
    if (!input.dexId) {
      throw new Error('dexId is required for dex volume strategy');
    }
    if (!Number.isFinite(input.chainId) || Number(input.chainId) <= 0) {
      throw new Error(
        'chainId must be a positive number for dex volume strategy',
      );
    }

    const tokenIn = String(input.tokenIn || '').trim();
    const tokenOut = String(input.tokenOut || '').trim();

    if (!tokenIn || !tokenOut) {
      throw new Error(
        'tokenIn and tokenOut are required for dex volume strategy',
      );
    }
    if (!Number.isFinite(input.feeTier) || Number(input.feeTier) <= 0) {
      throw new Error(
        'feeTier must be a positive number for dex volume strategy',
      );
    }

    const syntheticSymbol =
      String(input.symbol || '').trim() || `${tokenIn}/${tokenOut}`;

    return {
      executionCategory: 'amm',
      executionVenue: 'dex',
      exchangeName: String(input.exchangeName || input.dexId),
      symbol: syntheticSymbol,
      baseIncrementPercentage: input.baseIncrementPercentage,
      baseIntervalTime: input.baseIntervalTime,
      baseTradeAmount: input.baseTradeAmount,
      numTrades: input.numTrades,
      userId: input.userId,
      clientId: input.clientId,
      pricePushRate: input.pricePushRate,
      postOnlySide: input.postOnlySide,
      executedTrades: 0,
      dexId: input.dexId,
      chainId: Number(input.chainId),
      tokenIn,
      tokenOut,
      feeTier: Number(input.feeTier),
      slippageBps: input.slippageBps,
      recipient: input.recipient,
    };
  }

  private createIntent(
    runtimeInstanceKey: string,
    strategyKey: string,
    userId: string,
    clientId: string,
    exchange: string,
    pair: string,
    side: 'buy' | 'sell',
    price: BigNumber,
    qty: BigNumber,
    ts: string,
    suffix: string,
    executionCategory?: StrategyExecutionCategory,
  ): ExecutorAction {
    if (!this.strategyIntentStoreService) {
      throw new Error('strategy intent store is not available');
    }

    return this.strategyIntentStoreService.createLimitOrderIntent(
      runtimeInstanceKey,
      strategyKey,
      userId,
      clientId,
      exchange,
      pair,
      side,
      price,
      qty,
      ts,
      suffix,
      executionCategory,
    );
  }

  private readUnitIntervalNumber(value: unknown): number | undefined {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
      ? parsed
      : undefined;
  }

  private resolveVolumeExecutionVenue(
    config: Record<string, unknown>,
  ): 'cex' | 'dex' {
    if (config.executionCategory !== undefined) {
      const normalized = normalizeExecutionCategory(
        this.readString(config.executionCategory),
      );

      return toLegacyExecutionVenue(normalized);
    }

    return this.readString(config.executionVenue) === 'dex' ? 'dex' : 'cex';
  }

  private resolveVolumeExecutionCategory(
    config: Record<string, unknown>,
  ): string {
    return normalizeExecutionCategory(
      this.readString(config.executionCategory) ||
        this.readString(config.executionVenue),
    );
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : undefined;

    return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
  }

  private readSide(value: unknown): 'buy' | 'sell' | undefined {
    return value === 'buy' || value === 'sell' ? value : undefined;
  }

  private readConnectorId(value: unknown): ConnectorId | undefined {
    return value === 'uniswapV3' || value === 'pancakeV3' ? value : undefined;
  }

  private getActiveSession(
    strategyKey: string,
  ): StrategyRuntimeSession | undefined {
    return this.getStrategySessionRegistry().sessions.get(strategyKey);
  }

  private setActiveSession(
    strategyKey: string,
    session: StrategyRuntimeSession,
  ): void {
    this.getStrategySessionRegistry().sessions.set(strategyKey, session);
  }

  private isSameActiveSession(
    active: StrategyRuntimeSession | undefined,
    expected: StrategyRuntimeSession,
  ): active is StrategyRuntimeSession {
    return this.getStrategySessionRegistry().isSameActiveSession(
      active,
      expected,
    );
  }

  private async persistStrategyParams(
    strategyKey: string,
    params: VolumeStrategyParams,
  ): Promise<void> {
    await this.getStrategyInstanceRepository().update(
      { strategyKey },
      {
        parameters: params as Record<string, any>,
        updatedAt: getRFC3339Timestamp(),
      },
    );
  }

  private getStrategyInstanceRepository(): Repository<StrategyInstance> {
    if (!this.strategyInstanceRepository) {
      throw new Error('StrategyInstance repository is not available');
    }

    return this.strategyInstanceRepository;
  }

  private buildStopControllerAction(
    session: StrategyRuntimeSession,
    ts: string,
    reason: string,
  ): ExecutorAction {
    return {
      type: 'STOP_CONTROLLER',
      intentId: `${session.strategyKey}:${ts}:stop-${reason}`,
      runtimeInstanceKey: session.strategyKey,
      strategyKey: session.strategyKey,
      userId: session.userId,
      clientId: session.clientId,
      exchange: '',
      pair: '',
      side: 'buy',
      price: '0',
      qty: '0',
      metadata: { reason },
      createdAt: ts,
    };
  }

  private getStrategySessionRegistry(): StrategySessionRegistryService {
    if (!this.strategySessionRegistryService) {
      throw new Error('StrategySessionRegistryService is not available');
    }

    return this.strategySessionRegistryService;
  }
}

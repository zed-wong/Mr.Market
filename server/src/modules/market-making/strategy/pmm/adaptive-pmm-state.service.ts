import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { StrategyExecutionHistory } from 'src/common/entities/market-making/strategy-execution-history.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { Repository } from 'typeorm';

import { BalanceLedgerService } from '../../ledger/balance-ledger.service';
import { ExecutorAction } from '../config/executor-action.types';
import { PureMarketMakingStrategyDto } from '../config/strategy.dto';
import { StrategyRuntimeSession } from '../config/strategy-controller.types';
import { AdaptivePmmSignalSnapshot } from '../data/strategy-market-data-provider.service';
import { StrategyRuntimePressureSnapshot } from '../observation/runtime-observation.service';
import { RuntimeObservationService } from '../observation/runtime-observation.service';
import { QuotePlannerService } from '../quote/quote-planner.service';
import { TrackedOrder } from '../../trackers/exchange-order-tracker.service';

export type AdaptivePmmToxicityState = {
  buyScore: number;
  sellScore: number;
  buyPausedUntilMs: number | null;
  sellPausedUntilMs: number | null;
  buyLastPausedUntilMs?: number | null;
  sellLastPausedUntilMs?: number | null;
};

export type AdaptivePmmWarmupState = {
  active: boolean;
  reason: string | null;
  bidSpread: number;
  askSpread: number;
  orderAmount: string;
};

export type AdaptivePmmSideRecoveryState = {
  buyActive: boolean;
  sellActive: boolean;
  buyWidenBps: number;
  sellWidenBps: number;
  buySizeRatio: number;
  sellSizeRatio: number;
};

export type AdaptivePmmDecisionSnapshot = {
  params: PureMarketMakingStrategyDto;
  reason: string;
  signalSnapshot: AdaptivePmmSignalSnapshot | null;
  toxicityState: AdaptivePmmToxicityState | null;
  actions: number;
  layers: number;
  realizedVolatility?: number | null;
  orderBookImbalance?: number | null;
  buyPaused?: boolean;
  sellPaused?: boolean;
  warmupActive?: boolean;
  warmupReason?: string | null;
  softStale?: boolean;
  buyRecoveryActive?: boolean;
  sellRecoveryActive?: boolean;
  runtimePressure?: StrategyRuntimePressureSnapshot | null;
  runtimePressureWiden?: number;
};

@Injectable()
export class AdaptivePmmStateService {
  private readonly logger = new CustomLogger(AdaptivePmmStateService.name);
  private readonly warmupStartedAtByStrategy = new Map<string, number>();
  private readonly warmupTicksByStrategy = new Map<string, number>();

  constructor(
    @Optional()
    private readonly quotePlannerService?: QuotePlannerService,
    @Optional()
    private readonly balanceLedgerService?: BalanceLedgerService,
    @Optional()
    private readonly runtimeObservationService?: RuntimeObservationService,
    @Optional()
    @InjectRepository(StrategyExecutionHistory)
    private readonly strategyExecutionHistoryRepository?: Repository<StrategyExecutionHistory>,
  ) {}

  get adaptivePmmWarmupStartedAtByStrategy(): Map<string, number> {
    return this.warmupStartedAtByStrategy;
  }

  get adaptivePmmWarmupTicksByStrategy(): Map<string, number> {
    return this.warmupTicksByStrategy;
  }

  clearStrategyState(strategyKey: string): void {
    this.warmupStartedAtByStrategy.delete(strategyKey);
    this.warmupTicksByStrategy.delete(strategyKey);
  }

  async resolveAdaptivePmmLayerCountFromBudget(
    params: PureMarketMakingStrategyDto,
    referencePrice: BigNumber,
    availableBalances: {
      base: BigNumber;
      quote: BigNumber;
      assets: { base: string; quote: string };
    } | null,
  ): Promise<number> {
    const configuredLayers = Math.max(
      1,
      Math.floor(Number(params.numberOfLayers || 1)),
    );

    if (!params.adaptiveSizeEnabled || configuredLayers <= 1) {
      return configuredLayers;
    }

    const multiple = new BigNumber(params.layeringMinBudgetMultiple || 10);

    if (
      !multiple.isFinite() ||
      multiple.isLessThanOrEqualTo(0) ||
      !availableBalances ||
      !referencePrice.isFinite() ||
      referencePrice.isLessThanOrEqualTo(0)
    ) {
      return configuredLayers;
    }

    const minOrderNotional = await this.getQuotePlanner().resolveMinOrderNotional(
      params.exchangeName,
      params.pair,
      params.accountLabel,
      referencePrice,
    );

    if (minOrderNotional.isLessThanOrEqualTo(0)) {
      return configuredLayers;
    }

    const perLayerBudget = minOrderNotional.multipliedBy(multiple);
    const buyBudget = availableBalances.quote;
    const sellBudget = availableBalances.base.multipliedBy(referencePrice);
    const sideBudget = BigNumber.min(buyBudget, sellBudget);
    const affordableLayers = BigNumber.max(
      1,
      BigNumber.min(
        configuredLayers,
        sideBudget.dividedBy(perLayerBudget).integerValue(BigNumber.ROUND_FLOOR),
      ),
    );

    if (
      !affordableLayers.isFinite() ||
      affordableLayers.isLessThanOrEqualTo(1)
    ) {
      return 1;
    }

    return affordableLayers.toNumber();
  }

  shouldReadAdaptivePmmSignals(params: PureMarketMakingStrategyDto): boolean {
    return (
      Boolean(params.volBasedSpread) ||
      Number(params.imbalanceSkewFactor || 0) > 0 ||
      Boolean(params.adaptiveRefreshEnabled) ||
      Boolean(params.adaptiveSizeEnabled) ||
      Number(params.marketCrashBps || 0) > 0 ||
      Number(params.marketCrashWindowMs || 0) > 0 ||
      Number(params.warmupTicks || 0) > 0 ||
      Number(params.warmupMs || 0) > 0 ||
      Number(params.warmupSpread || 0) > 0 ||
      Number(params.adverseMarkoutGuardBps || 0) > 0 ||
      params.priceSourceType === PriceSourceType.MICROPRICE
    );
  }

  resolveAdaptivePmmWarmupState(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    signalSnapshot: AdaptivePmmSignalSnapshot | null,
    minSamples: number,
  ): AdaptivePmmWarmupState {
    const nowMs = Date.now();
    const startedAt = this.warmupStartedAtByStrategy.get(strategyKey) || nowMs;
    const ticks = (this.warmupTicksByStrategy.get(strategyKey) || 0) + 1;

    this.warmupStartedAtByStrategy.set(strategyKey, startedAt);
    this.warmupTicksByStrategy.set(strategyKey, ticks);

    const warmupMs = Math.max(0, Number(params.warmupMs || 0));
    const warmupTicks = Math.max(
      0,
      Math.floor(Number(params.warmupTicks || 0)),
    );
    const sampleCount = signalSnapshot?.midPriceHistory.length || 0;
    let reason: string | null = null;

    if (signalSnapshot && sampleCount > 0 && sampleCount < minSamples) {
      reason = 'insufficient_signal_samples';
    }
    if (!reason && warmupMs > 0 && nowMs - startedAt < warmupMs) {
      reason = 'warmup_ms';
    }
    if (!reason && warmupTicks > 0 && ticks <= warmupTicks) {
      reason = 'warmup_ticks';
    }

    const active = reason !== null;

    if (!active) {
      return {
        active: false,
        reason: null,
        bidSpread: params.bidSpread,
        askSpread: params.askSpread,
        orderAmount: new BigNumber(params.orderAmount).toFixed(),
      };
    }

    const warmupSpread = new BigNumber(params.warmupSpread || 0);
    const sizeRatio = this.resolveAdaptivePmmWarmupSizeRatio(
      params.warmupSizeRatio,
    );
    const orderAmount = new BigNumber(params.orderAmount);

    return {
      active,
      reason,
      bidSpread:
        warmupSpread.isFinite() && warmupSpread.isGreaterThan(0)
          ? BigNumber.max(params.bidSpread, warmupSpread).toNumber()
          : params.bidSpread,
      askSpread:
        warmupSpread.isFinite() && warmupSpread.isGreaterThan(0)
          ? BigNumber.max(params.askSpread, warmupSpread).toNumber()
          : params.askSpread,
      orderAmount:
        orderAmount.isFinite() && orderAmount.isGreaterThan(0)
          ? orderAmount.multipliedBy(sizeRatio).toFixed()
          : new BigNumber(params.orderAmount).toFixed(),
    };
  }

  resolveAdaptivePmmRuntimePressure(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    runtimeObservationService = this.runtimeObservationService,
  ): StrategyRuntimePressureSnapshot | null {
    if (!runtimeObservationService) {
      return null;
    }

    const windowMs = Math.max(
      1_000,
      Number(params.runtimeObservationWindowMs || 60_000),
    );

    return runtimeObservationService.getPressure(strategyKey, windowMs);
  }

  resolveAdaptivePmmRuntimePressureWiden(
    params: PureMarketMakingStrategyDto,
    pressure: StrategyRuntimePressureSnapshot | null,
  ): number {
    if (!pressure) {
      return 0;
    }

    const threshold = Math.max(
      0,
      Math.floor(Number(params.postOnlyRejectThreshold || 0)),
    );
    const widenBps = Math.max(0, Number(params.postOnlyRejectWidenBps || 0));

    if (
      threshold <= 0 ||
      widenBps <= 0 ||
      pressure.postOnlyRejectCount < threshold
    ) {
      return 0;
    }

    return widenBps / 10_000;
  }

  applyAdaptivePmmRuntimePressureCadence(
    params: PureMarketMakingStrategyDto,
    pressure: StrategyRuntimePressureSnapshot | null,
    session: StrategyRuntimeSession | undefined,
  ): boolean {
    const threshold = Math.max(
      0,
      Math.floor(Number(params.rateLimitPressureThreshold || 0)),
    );

    if (!session) {
      return false;
    }

    if (!pressure || threshold <= 0 || pressure.rateLimitCount < threshold) {
      return this.restoreAdaptivePmmRuntimePressureCadence(params, session);
    }

    session.cadenceMs = Math.max(
      session.cadenceMs,
      Number(params.refreshMaxMs || params.orderRefreshTime || session.cadenceMs),
    );

    return true;
  }

  restoreAdaptivePmmRuntimePressureCadence(
    params: PureMarketMakingStrategyDto,
    session: StrategyRuntimeSession,
  ): boolean {
    if (params.adaptiveRefreshEnabled) {
      return false;
    }

    const baseCadenceMs = Math.max(
      1_000,
      Number(params.orderRefreshTime || session.cadenceMs),
    );

    if (
      !Number.isFinite(baseCadenceMs) ||
      session.cadenceMs === baseCadenceMs
    ) {
      return false;
    }

    session.cadenceMs = baseCadenceMs;
    return true;
  }

  resolveAdaptivePmmWarmupSizeRatio(value: number | undefined): BigNumber {
    const ratio = new BigNumber(value === undefined ? 0.2 : value);

    if (!ratio.isFinite() || ratio.isLessThanOrEqualTo(0)) {
      return new BigNumber(0.2);
    }

    return BigNumber.min(1, ratio);
  }

  resolveAdaptivePmmSideRecoveryState(
    params: PureMarketMakingStrategyDto,
    toxicityState: {
      buyLastPausedUntilMs?: number | null;
      sellLastPausedUntilMs?: number | null;
    } | null,
  ): AdaptivePmmSideRecoveryState {
    const windowMs = Math.max(
      0,
      Number(params.adverseMarkoutRecoveryMs || params.adverseMarkoutCooldownMs || 0),
    );
    const baseWidenBps = Math.max(
      0,
      Number(params.adverseMarkoutGuardBps || 0),
    );
    const floorRatio = this.resolveAdaptivePmmWarmupSizeRatio(
      params.adverseMarkoutRecoverySizeRatio,
    ).toNumber();

    if (!toxicityState || windowMs <= 0 || baseWidenBps <= 0) {
      return {
        buyActive: false,
        sellActive: false,
        buyWidenBps: 0,
        sellWidenBps: 0,
        buySizeRatio: 1,
        sellSizeRatio: 1,
      };
    }

    const nowMs = Date.now();
    const buy = this.resolveAdaptivePmmSideRecovery(
      toxicityState.buyLastPausedUntilMs,
      nowMs,
      windowMs,
      baseWidenBps,
      floorRatio,
    );
    const sell = this.resolveAdaptivePmmSideRecovery(
      toxicityState.sellLastPausedUntilMs,
      nowMs,
      windowMs,
      baseWidenBps,
      floorRatio,
    );

    return {
      buyActive: buy.active,
      sellActive: sell.active,
      buyWidenBps: buy.widenBps,
      sellWidenBps: sell.widenBps,
      buySizeRatio: buy.sizeRatio,
      sellSizeRatio: sell.sizeRatio,
    };
  }

  resolveAdaptivePmmSideRecovery(
    lastPausedUntilMs: number | null | undefined,
    nowMs: number,
    windowMs: number,
    baseWidenBps: number,
    floorRatio: number,
  ): { active: boolean; widenBps: number; sizeRatio: number } {
    if (!lastPausedUntilMs || nowMs <= lastPausedUntilMs) {
      return { active: false, widenBps: 0, sizeRatio: 1 };
    }

    const elapsedMs = nowMs - lastPausedUntilMs;

    if (elapsedMs >= windowMs) {
      return { active: false, widenBps: 0, sizeRatio: 1 };
    }

    const remaining = 1 - elapsedMs / windowMs;

    return {
      active: true,
      widenBps: baseWidenBps * remaining,
      sizeRatio: floorRatio + (1 - floorRatio) * (1 - remaining),
    };
  }

  shouldBlockAdaptivePmmForMarketSafety(
    signalSnapshot: AdaptivePmmSignalSnapshot,
  ): boolean {
    return (
      signalSnapshot.crash.crashed ||
      signalSnapshot.freshness.status === 'missing' ||
      signalSnapshot.freshness.status === 'hard_stale'
    );
  }

  isAdaptivePmmReservationPaused(params: PureMarketMakingStrategyDto): boolean {
    if (
      !params.marketMakingOrderId ||
      !this.balanceLedgerService ||
      typeof this.balanceLedgerService.isReservationPaused !== 'function'
    ) {
      return false;
    }

    const [baseAssetId, quoteAssetId] = params.pair.split('/');

    return [baseAssetId, quoteAssetId]
      .filter(Boolean)
      .some((assetId) =>
        this.balanceLedgerService?.isReservationPaused(
          params.marketMakingOrderId as string,
          assetId,
        ),
      );
  }

  appendAdaptivePmmSafetyCancels(
    actions: ExecutorAction[],
    cancelledExchangeOrderIds: Set<string>,
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
    liveOrders: TrackedOrder[],
  ): void {
    const cancelBudgetPerSec = Number(params.cancelBudgetPerSec || 0);

    for (const order of liveOrders) {
      this.getQuotePlanner().appendCancelAction(
        actions,
        cancelledExchangeOrderIds,
        this.getQuotePlanner().buildCancelOrderAction(
          strategyKey,
          params,
          order,
          ts,
          'adaptive-market-safety',
        ),
        strategyKey,
        ts,
        cancelBudgetPerSec,
      );
    }
  }

  logAdaptivePmmDecisionSnapshot(
    strategyKey: string,
    snapshot: AdaptivePmmDecisionSnapshot,
  ): void {
    const metadata = this.buildAdaptivePmmDecisionMetadata(strategyKey, snapshot);

    this.logger.log(JSON.stringify(metadata));
    void this.persistAdaptivePmmDecisionSnapshot(snapshot.params, metadata);
  }

  buildAdaptivePmmDecisionMetadata(
    strategyKey: string,
    snapshot: Omit<AdaptivePmmDecisionSnapshot, 'params'>,
  ): Record<string, unknown> {
    return {
      event: 'adaptive_pmm.decision',
      strategyKey,
      reason: snapshot.reason,
      actions: snapshot.actions,
      layers: snapshot.layers,
      freshness: snapshot.signalSnapshot?.freshness.status || null,
      freshnessAgeMs: snapshot.signalSnapshot?.freshness.ageMs || null,
      crash: snapshot.signalSnapshot?.crash.crashed || false,
      crashChangeBps: snapshot.signalSnapshot?.crash.changeBps ?? null,
      realizedVolatility:
        snapshot.realizedVolatility ??
        snapshot.signalSnapshot?.realizedVolatility ??
        null,
      imbalance:
        snapshot.orderBookImbalance ?? snapshot.signalSnapshot?.imbalance ?? null,
      imbalanceDepthNotional:
        snapshot.signalSnapshot?.imbalanceDepthNotional ?? null,
      buyToxicityScore: snapshot.toxicityState?.buyScore || 0,
      sellToxicityScore: snapshot.toxicityState?.sellScore || 0,
      buyPaused: Boolean(snapshot.buyPaused),
      sellPaused: Boolean(snapshot.sellPaused),
      warmupActive: Boolean(snapshot.warmupActive),
      warmupReason: snapshot.warmupReason || null,
      softStale: Boolean(snapshot.softStale),
      buyRecoveryActive: Boolean(snapshot.buyRecoveryActive),
      sellRecoveryActive: Boolean(snapshot.sellRecoveryActive),
      runtimeRejectCount: snapshot.runtimePressure?.rejectCount || 0,
      runtimePostOnlyRejectCount:
        snapshot.runtimePressure?.postOnlyRejectCount || 0,
      runtimeRateLimitCount: snapshot.runtimePressure?.rateLimitCount || 0,
      runtimePressureWiden: snapshot.runtimePressureWiden || 0,
      unavailableReasons: snapshot.signalSnapshot?.unavailableReasons || [],
    };
  }

  async persistAdaptivePmmDecisionSnapshot(
    params: PureMarketMakingStrategyDto,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.strategyExecutionHistoryRepository) {
      return;
    }

    try {
      await this.strategyExecutionHistoryRepository.save(
        this.strategyExecutionHistoryRepository.create({
          userId: params.userId,
          clientId: params.clientId,
          exchange: params.exchangeName,
          pair: params.pair,
          strategyType: 'pureMarketMaking',
          runtimeInstanceKey: String(metadata.strategyKey || ''),
          orderId: params.marketMakingOrderId,
          status: String(metadata.reason || 'decision'),
          metadata,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to persist adaptive PMM decision snapshot for ${
          params.clientId
        }: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  updateAdaptivePmmCadence(
    params: PureMarketMakingStrategyDto,
    realizedVolatility: number | null,
    session: StrategyRuntimeSession | undefined,
  ): boolean {
    if (!params.adaptiveRefreshEnabled || !session) {
      return false;
    }

    const refreshMinMs = Math.max(1000, Number(params.refreshMinMs || 1000));
    const refreshMaxMs = Math.max(
      refreshMinMs,
      Number(params.refreshMaxMs || params.orderRefreshTime || refreshMinMs),
    );
    const pivot = Number(params.refreshVolPivot || 0);
    const sigma = Number(realizedVolatility || 0);
    const intensity =
      Number.isFinite(sigma) && sigma > 0 && Number.isFinite(pivot) && pivot > 0
        ? Math.min(1, sigma / pivot)
        : 0;
    const nextCadenceMs = Math.round(
      refreshMaxMs - (refreshMaxMs - refreshMinMs) * intensity,
    );

    session.cadenceMs = nextCadenceMs;
    return true;
  }

  private getQuotePlanner(): QuotePlannerService {
    if (!this.quotePlannerService) {
      throw new Error('QuotePlannerService is not available');
    }

    return this.quotePlannerService;
  }
}

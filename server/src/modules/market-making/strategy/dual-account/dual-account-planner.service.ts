import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import BigNumber from 'bignumber.js';

import { OrderScopedBalanceQueryService } from '../../balance-state/order-scoped-balance-query.service';
import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import type { TrackedOrder } from '../../trackers/exchange-order-tracker.service';
import { CustomLogger } from '../../../infrastructure/logger/logger.service';
import { ExecutorAction } from '../config/executor-action.types';
import { StrategyExecutionCategory } from '../config/strategy-execution-category';
import type {
  DualAccountActiveCycleState,
  DualAccountBalanceSnapshot,
  DualAccountBehaviorProfile,
  DualAccountBestCapacityCandidate,
  DualAccountExecutionPlan,
  DualAccountPairBalances,
  DualAccountRebalanceCandidate,
  DualAccountResolvedAccounts,
  DualAccountTradeabilityPlan,
  DualAccountVolumeStrategyParams,
} from '../config/strategy-params.types';
import { VolumeStrategyController } from '../controllers/volume-strategy.controller';
import * as dualAccountConfig from './dual-account-config';
import { QuotePlannerService } from '../quote/quote-planner.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';

export type DualAccountCapacityDiagnostics = {
  buyCapacity: BigNumber;
  sellCapacity: BigNumber;
  preferredSideCapacity: BigNumber;
  selectedSideCapacity: BigNumber;
  capacityUtilization: BigNumber;
  capacityLimited: boolean;
  capacityLimiter:
    | 'maker_base'
    | 'maker_quote'
    | 'taker_base'
    | 'taker_quote'
    | 'balanced'
    | 'unknown';
  rebalanceNeeded: boolean;
};

@Injectable()
export class DualAccountPlannerService {
  private readonly logger = new CustomLogger(DualAccountPlannerService.name);
  private readonly loggedBestCapacityIgnoredConfigWarnings = new Set<string>();

  constructor(
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
    @Optional()
    private readonly orderScopedBalanceQueryService?: OrderScopedBalanceQueryService,
    @Optional()
    private readonly strategyMarketDataProviderService?: StrategyMarketDataProviderService,
    @Optional()
    private readonly volumeStrategyController?: VolumeStrategyController,
    @Optional()
    private readonly quotePlannerService?: QuotePlannerService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  resolveCycleAccountsFromBalances(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
  ): DualAccountResolvedAccounts {
    const configured: DualAccountResolvedAccounts = {
      makerAccountLabel: params.makerAccountLabel,
      takerAccountLabel: params.takerAccountLabel,
    };
    const capacity1 = this.computeCapacity(
      makerBalances,
      takerBalances,
      side,
      price,
      feeBufferRate,
    );
    const capacity2 = this.computeCapacity(
      takerBalances,
      makerBalances,
      side,
      price,
      feeBufferRate,
    );

    if (params.dynamicRoleSwitching && capacity2.isGreaterThan(capacity1)) {
      this.logger.log(
        `Dynamic role switching: swapping maker=${params.makerAccountLabel}→${
          params.takerAccountLabel
        } taker=${params.takerAccountLabel}→${
          params.makerAccountLabel
        } for side=${side} (capacity configured=${capacity1.toFixed()} swapped=${capacity2.toFixed()})`,
      );

      return {
        makerAccountLabel: params.takerAccountLabel,
        takerAccountLabel: params.makerAccountLabel,
        makerBalances: takerBalances,
        takerBalances: makerBalances,
        capacity: capacity2,
      };
    }

    return {
      ...configured,
      makerBalances,
      takerBalances,
      capacity: capacity1,
    };
  }

  computeCapacity(
    makerBalances: Pick<DualAccountPairBalances, 'base' | 'quote'>,
    takerBalances: Pick<DualAccountPairBalances, 'base' | 'quote'>,
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
  ): BigNumber {
    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      return new BigNumber(0);
    }

    const retainFactor = this.resolveRetainFactor(feeBufferRate);

    return side === 'buy'
      ? BigNumber.min(
          makerBalances.quote.dividedBy(price).multipliedBy(retainFactor),
          takerBalances.base,
        )
      : BigNumber.min(
          makerBalances.base,
          takerBalances.quote.dividedBy(price).multipliedBy(retainFactor),
        );
  }

  buildCapacityDiagnostics(
    params: DualAccountVolumeStrategyParams,
    price: BigNumber,
    feeBufferRate: BigNumber,
    snapshot: DualAccountBalanceSnapshot,
    preferredSide: 'buy' | 'sell',
    selectedSide: 'buy' | 'sell',
    effectiveQty: BigNumber,
  ): DualAccountCapacityDiagnostics {
    const buyResolved = this.resolveCycleAccountsFromBalances(
      params,
      'buy',
      price,
      snapshot.makerBalances,
      snapshot.takerBalances,
      feeBufferRate,
    );
    const sellResolved = this.resolveCycleAccountsFromBalances(
      params,
      'sell',
      price,
      snapshot.makerBalances,
      snapshot.takerBalances,
      feeBufferRate,
    );
    const buyCapacity = buyResolved.capacity || new BigNumber(0);
    const sellCapacity = sellResolved.capacity || new BigNumber(0);
    const preferredSideCapacity =
      preferredSide === 'buy' ? buyCapacity : sellCapacity;
    const selectedSideCapacity =
      selectedSide === 'buy' ? buyCapacity : sellCapacity;
    const capacityUtilization = selectedSideCapacity.isGreaterThan(0)
      ? effectiveQty.dividedBy(selectedSideCapacity)
      : new BigNumber(0);
    const imbalanceRatio = this.computeImbalanceRatio(
      buyCapacity,
      sellCapacity,
    );

    return {
      buyCapacity,
      sellCapacity,
      preferredSideCapacity,
      selectedSideCapacity,
      capacityUtilization,
      capacityLimited: selectedSideCapacity.isGreaterThan(0)
        ? effectiveQty.isGreaterThanOrEqualTo(selectedSideCapacity)
        : false,
      capacityLimiter: this.resolveCapacityLimiter(
        selectedSide === 'buy' ? buyResolved : sellResolved,
        selectedSide,
        price,
        feeBufferRate,
      ),
      rebalanceNeeded:
        buyCapacity.isLessThanOrEqualTo(0) ||
        sellCapacity.isLessThanOrEqualTo(0) ||
        preferredSideCapacity.isLessThanOrEqualTo(0) ||
        imbalanceRatio.isGreaterThanOrEqualTo(2),
    };
  }

  resolveCapacityLimiter(
    resolvedAccounts: DualAccountResolvedAccounts,
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
  ):
    | 'maker_base'
    | 'maker_quote'
    | 'taker_base'
    | 'taker_quote'
    | 'balanced'
    | 'unknown' {
    if (
      !resolvedAccounts.makerBalances ||
      !resolvedAccounts.takerBalances ||
      !price.isFinite() ||
      price.isLessThanOrEqualTo(0)
    ) {
      return 'unknown';
    }

    const retainFactor = this.resolveRetainFactor(feeBufferRate);

    if (side === 'buy') {
      const makerQuoteCapacity = resolvedAccounts.makerBalances.quote
        .dividedBy(price)
        .multipliedBy(retainFactor);
      const takerBaseCapacity = resolvedAccounts.takerBalances.base;

      if (makerQuoteCapacity.isLessThan(takerBaseCapacity)) {
        return 'maker_quote';
      }
      if (takerBaseCapacity.isLessThan(makerQuoteCapacity)) {
        return 'taker_base';
      }

      return 'balanced';
    }

    const makerBaseCapacity = resolvedAccounts.makerBalances.base;
    const takerQuoteCapacity = resolvedAccounts.takerBalances.quote
      .dividedBy(price)
      .multipliedBy(retainFactor);

    if (makerBaseCapacity.isLessThan(takerQuoteCapacity)) {
      return 'maker_base';
    }
    if (takerQuoteCapacity.isLessThan(makerBaseCapacity)) {
      return 'taker_quote';
    }

    return 'balanced';
  }

  buildBestCapacityCandidates(
    params: DualAccountVolumeStrategyParams,
    price: BigNumber,
    feeBufferRate: BigNumber,
    snapshot: DualAccountBalanceSnapshot,
  ): DualAccountBestCapacityCandidate[] {
    const retainFactor = this.resolveRetainFactor(feeBufferRate);
    const candidates: Omit<
      DualAccountBestCapacityCandidate,
      'candidateRank'
    >[] = (
      [
        this.buildBestCapacityCandidate(
          params,
          'buy',
          params.makerAccountLabel,
          params.takerAccountLabel,
          snapshot.makerBalances,
          snapshot.takerBalances,
          price,
          retainFactor,
          'configured',
        ),
        this.buildBestCapacityCandidate(
          params,
          'buy',
          params.takerAccountLabel,
          params.makerAccountLabel,
          snapshot.takerBalances,
          snapshot.makerBalances,
          price,
          retainFactor,
          'swapped',
        ),
        this.buildBestCapacityCandidate(
          params,
          'sell',
          params.makerAccountLabel,
          params.takerAccountLabel,
          snapshot.makerBalances,
          snapshot.takerBalances,
          price,
          retainFactor,
          'configured',
        ),
        this.buildBestCapacityCandidate(
          params,
          'sell',
          params.takerAccountLabel,
          params.makerAccountLabel,
          snapshot.takerBalances,
          snapshot.makerBalances,
          price,
          retainFactor,
          'swapped',
        ),
      ] as const
    ).filter(
      (candidate) =>
        candidate.capacity.isFinite() && candidate.capacity.isGreaterThan(0),
    );

    candidates.sort((left, right) => {
      const scoreComparison = this.scoreBestCapacityCandidate(
        params,
        right,
        price,
      ).comparedTo(this.scoreBestCapacityCandidate(params, left, price));

      if (scoreComparison !== 0) {
        return scoreComparison;
      }

      const capacityComparison = right.capacity.comparedTo(left.capacity);

      if (capacityComparison !== 0) {
        return capacityComparison;
      }

      if (left.roleAssignment !== right.roleAssignment) {
        return left.roleAssignment === 'configured' ? -1 : 1;
      }

      if (left.side !== right.side) {
        return left.side === 'buy' ? -1 : 1;
      }

      return 0;
    });

    return candidates.map((candidate, index) => ({
      ...candidate,
      candidateRank: index + 1,
    }));
  }

  computeImbalanceRatio(
    primaryCapacity: BigNumber,
    oppositeCapacity: BigNumber,
  ): BigNumber {
    const smallerCapacity = BigNumber.min(primaryCapacity, oppositeCapacity);
    const largerCapacity = BigNumber.max(primaryCapacity, oppositeCapacity);

    if (smallerCapacity.isLessThanOrEqualTo(0)) {
      return largerCapacity.isGreaterThan(0)
        ? new BigNumber(Number.MAX_SAFE_INTEGER)
        : new BigNumber(1);
    }

    return largerCapacity.dividedBy(smallerCapacity);
  }

  scoreBestCapacityCandidate(
    params: Pick<
      DualAccountVolumeStrategyParams,
      'targetQuoteVolume' | 'totalMatchedQuoteVolume'
    >,
    candidate: Pick<
      DualAccountBestCapacityCandidate,
      'capacity' | 'futureOppositeCapacity' | 'imbalanceRatio'
    >,
    price: BigNumber,
  ): BigNumber {
    const candidateQuoteCapacity = candidate.capacity.multipliedBy(price);
    const targetQuoteVolume = new BigNumber(params.targetQuoteVolume || 0);
    const matchedQuoteVolume = new BigNumber(
      params.totalMatchedQuoteVolume || 0,
    );
    const remainingTargetQuote = targetQuoteVolume.isGreaterThan(0)
      ? BigNumber.maximum(targetQuoteVolume.minus(matchedQuoteVolume), 0)
      : candidateQuoteCapacity;
    const targetProgressScore = BigNumber.min(
      candidateQuoteCapacity,
      remainingTargetQuote,
    );

    return candidate.capacity
      .multipliedBy(1000)
      .plus(candidate.futureOppositeCapacity.multipliedBy(100))
      .plus(targetProgressScore.multipliedBy(10))
      .minus(candidate.imbalanceRatio.multipliedBy(10));
  }

  findCandidateCapacity(
    candidates: DualAccountBestCapacityCandidate[],
    side: 'buy' | 'sell',
    roleAssignment: 'configured' | 'swapped',
  ): BigNumber | undefined {
    return candidates.find(
      (candidate) =>
        candidate.side === side && candidate.roleAssignment === roleAssignment,
    )?.capacity;
  }

  async resolveFeeBufferRate(
    exchangeName: string,
    pair: string,
  ): Promise<BigNumber> {
    if (!this.exchangeConnectorAdapterService) {
      return new BigNumber(0);
    }

    try {
      const rules = await this.exchangeConnectorAdapterService.loadTradingRules(
        exchangeName,
        pair,
      );
      const makerFee = new BigNumber(rules.makerFee || 0);
      const takerFee = new BigNumber(rules.takerFee || 0);
      const totalFeeRate = makerFee.plus(takerFee);

      if (!totalFeeRate.isFinite() || totalFeeRate.isLessThanOrEqualTo(0)) {
        return new BigNumber(0);
      }

      return totalFeeRate;
    } catch (error) {
      this.logger.warn(
        `Failed to load dual-account fee buffer for ${exchangeName} ${pair}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return new BigNumber(0);
    }
  }

  async loadBalanceSnapshot(
    params: DualAccountVolumeStrategyParams,
    context: 'execution' | 'rebalance',
  ): Promise<DualAccountBalanceSnapshot | null> {
    try {
      const [makerBalances, takerBalances] = await Promise.all([
        this.orderScopedBalanceQueryService?.getAvailableBalancesForPair(
          params.exchangeName,
          params.symbol,
          params.makerAccountLabel,
          params.marketMakingOrderId,
        ),
        this.orderScopedBalanceQueryService?.getAvailableBalancesForPair(
          params.exchangeName,
          params.symbol,
          params.takerAccountLabel,
          params.marketMakingOrderId,
        ),
      ]);

      if (!makerBalances || !takerBalances) {
        return null;
      }

      return {
        makerBalances,
        takerBalances,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load dual-account ${context} balances for ${
          params.exchangeName
        } ${params.symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

  async resolvePreferredSide(
    params: DualAccountVolumeStrategyParams,
    publishedCycles: number,
    makerBalances?: DualAccountPairBalances,
  ): Promise<'buy' | 'sell'> {
    if (params.postOnlySide !== 'inventory_balance') {
      return this.resolveVolumeSide(
        params.postOnlySide,
        publishedCycles,
        params.buyBias,
      );
    }

    const resolvedMakerBalances =
      makerBalances ||
      (await this.orderScopedBalanceQueryService?.getAvailableBalancesForPair(
        params.exchangeName,
        params.symbol,
        params.makerAccountLabel,
        params.marketMakingOrderId,
      ));

    if (!resolvedMakerBalances) {
      return this.resolveVolumeSide(undefined, publishedCycles, params.buyBias);
    }

    const quoteValue = resolvedMakerBalances.quote;
    const baseValue = resolvedMakerBalances.base.multipliedBy(
      await this.resolveInventoryReferencePrice(
        params.exchangeName,
        params.symbol,
      ),
    );
    const totalValue = quoteValue.plus(baseValue);

    if (!totalValue.isFinite() || totalValue.isLessThanOrEqualTo(0)) {
      return this.resolveVolumeSide(undefined, publishedCycles, params.buyBias);
    }

    const imbalance = quoteValue.minus(baseValue).dividedBy(totalValue);

    if (imbalance.isGreaterThan(0.05)) {
      return 'buy';
    }

    if (imbalance.isLessThan(-0.05)) {
      return 'sell';
    }

    return this.resolveVolumeSide(undefined, publishedCycles, params.buyBias);
  }

  async resolveInventoryReferencePrice(
    exchangeName: string,
    pair: string,
  ): Promise<BigNumber> {
    const trackedBestBidAsk =
      this.strategyMarketDataProviderService?.getTrackedBestBidAsk(
        exchangeName,
        pair,
      );

    if (trackedBestBidAsk?.bestBid && trackedBestBidAsk?.bestAsk) {
      return new BigNumber(trackedBestBidAsk.bestBid)
        .plus(trackedBestBidAsk.bestAsk)
        .dividedBy(2);
    }

    const bestBidAsk =
      await this.strategyMarketDataProviderService?.getBestBidAsk(
        exchangeName,
        pair,
      );

    if (bestBidAsk?.bestBid && bestBidAsk?.bestAsk) {
      return new BigNumber(bestBidAsk.bestBid)
        .plus(bestBidAsk.bestAsk)
        .dividedBy(2);
    }

    return new BigNumber(1);
  }

  normalizeMakerPrice(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    qty: BigNumber,
    candidatePrice: BigNumber,
    accountLabel: string,
    bestBid: BigNumber,
    bestAsk: BigNumber,
  ): BigNumber | null {
    if (this.isMakerPriceValid(side, candidatePrice, bestBid, bestAsk)) {
      return candidatePrice;
    }

    const boundaryPrice = side === 'buy' ? bestBid : bestAsk;
    let adjustedPrice = boundaryPrice;

    if (this.exchangeConnectorAdapterService) {
      const quantized = this.exchangeConnectorAdapterService.quantizeOrder(
        params.exchangeName,
        params.symbol,
        qty.toFixed(),
        boundaryPrice.toFixed(),
        accountLabel,
      );

      adjustedPrice = new BigNumber(quantized.price);
    }

    if (this.isMakerPriceValid(side, adjustedPrice, bestBid, bestAsk)) {
      this.logger.log(
        [
          'Adjusted dual-account maker price',
          `strategy=${strategyKey}`,
          `side=${side}`,
          `original=${candidatePrice.toFixed()}`,
          `adjusted=${adjustedPrice.toFixed()}`,
          `bestBid=${bestBid.toFixed()}`,
          `bestAsk=${bestAsk.toFixed()}`,
          'reason=quantized_outside_top_of_book',
        ].join(' | '),
      );

      return adjustedPrice;
    }

    this.logger.warn(
      [
        'Skipping dual-account volume cycle after invalid maker price quantization',
        `strategy=${strategyKey}`,
        `side=${side}`,
        `candidate=${candidatePrice.toFixed()}`,
        `adjusted=${adjustedPrice.toFixed()}`,
        `bestBid=${bestBid.toFixed()}`,
        `bestAsk=${bestAsk.toFixed()}`,
      ].join(' | '),
    );

    return null;
  }

  isMakerPriceValid(
    side: 'buy' | 'sell',
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
  ): boolean {
    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      return false;
    }

    return side === 'buy'
      ? price.isGreaterThanOrEqualTo(bestBid) && price.isLessThan(bestAsk)
      : price.isGreaterThan(bestBid) && price.isLessThanOrEqualTo(bestAsk);
  }

  clonePairBalances(
    balances: DualAccountPairBalances,
  ): DualAccountPairBalances {
    return {
      base: new BigNumber(balances.base),
      quote: new BigNumber(balances.quote),
      assets: {
        ...balances.assets,
      },
    };
  }

  resolveCycleRoles(params: DualAccountVolumeStrategyParams): {
    makerAccountLabel: string;
    takerAccountLabel: string;
  } {
    if (params.cycleMode === 'static') {
      return {
        makerAccountLabel: params.makerAccountLabel,
        takerAccountLabel: params.takerAccountLabel,
      };
    }

    return {
      makerAccountLabel:
        this.readString(
          params.nextMakerAccountLabel,
          params.makerAccountLabel,
        ) || params.makerAccountLabel,
      takerAccountLabel:
        this.readString(
          params.nextTakerAccountLabel,
          params.takerAccountLabel,
        ) || params.takerAccountLabel,
    };
  }

  advanceCycleRolesAfterSuccess(
    params: DualAccountVolumeStrategyParams,
    activeCycle: DualAccountActiveCycleState,
  ): DualAccountVolumeStrategyParams {
    if (params.cycleMode === 'static') {
      return {
        ...params,
        nextMakerAccountLabel: params.makerAccountLabel,
        nextTakerAccountLabel: params.takerAccountLabel,
      };
    }

    return {
      ...params,
      nextMakerAccountLabel: activeCycle.takerAccountLabel,
      nextTakerAccountLabel: activeCycle.makerAccountLabel,
    };
  }

  buildActiveCycleState(
    action?: ExecutorAction,
  ): DualAccountActiveCycleState | undefined {
    if (!action || this.isRebalanceAction(action)) {
      return undefined;
    }

    const metadata =
      action.metadata && typeof action.metadata === 'object'
        ? (action.metadata as Record<string, unknown>)
        : undefined;

    if (metadata?.role !== 'maker') {
      return undefined;
    }

    const makerAccountLabel = this.readString(
      metadata.makerAccountLabel,
      this.readString(action.accountLabel),
    );
    const takerAccountLabel = this.readString(metadata.takerAccountLabel);
    const cycleId = this.readString(metadata.cycleId, action.intentId);
    const tickId = this.readString(metadata.tickId, action.createdAt);
    const orderId = this.readString(metadata.orderId, action.clientId);
    const price = this.readString(action.price);
    const requestedQty = this.readString(action.qty);

    if (
      !makerAccountLabel ||
      !takerAccountLabel ||
      !cycleId ||
      !tickId ||
      !orderId ||
      !price ||
      !requestedQty
    ) {
      return undefined;
    }

    return {
      cycleId,
      tickId,
      orderId,
      makerSide: action.side,
      makerAccountLabel,
      takerAccountLabel,
      price,
      requestedQty,
      makerFilledQty: '0',
      takerFilledQty: '0',
      matchedFilledQty: '0',
      matchedQuoteVolume: '0',
    };
  }

  buildPublishedParams(
    params: DualAccountVolumeStrategyParams,
    actions: ExecutorAction[],
    orderBookReady: boolean,
  ): DualAccountVolumeStrategyParams {
    const shouldIncrementPublishedCycles = actions.some(
      (action) => !this.isRebalanceAction(action),
    );
    const tradeAction = actions.find(
      (action) => !this.isRebalanceAction(action),
    );
    const metadata =
      tradeAction &&
      tradeAction.metadata &&
      typeof tradeAction.metadata === 'object'
        ? (tradeAction.metadata as Record<string, unknown>)
        : undefined;
    const consecutiveFallbackCycles =
      metadata && metadata.consecutiveFallbackCycles !== undefined
        ? Number(metadata.consecutiveFallbackCycles)
        : Number(params.consecutiveFallbackCycles || 0);

    return {
      ...params,
      publishedCycles:
        Number(params.publishedCycles || 0) +
        (shouldIncrementPublishedCycles ? 1 : 0),
      consecutiveFallbackCycles: Number.isFinite(consecutiveFallbackCycles)
        ? consecutiveFallbackCycles
        : Number(params.consecutiveFallbackCycles || 0),
      orderBookReady,
      activeCycle: this.buildActiveCycleState(tradeAction),
    };
  }

  applyFillProgress(
    fill: {
      qty?: string;
    },
    trackedOrder: TrackedOrder,
    params: DualAccountVolumeStrategyParams,
  ): DualAccountVolumeStrategyParams {
    if (trackedOrder.role === 'rebalance' || !params.activeCycle) {
      return params;
    }

    const fillQty = new BigNumber(fill.qty || 0);

    if (!fillQty.isFinite() || fillQty.isLessThanOrEqualTo(0)) {
      return params;
    }

    const activeCycle = { ...params.activeCycle };

    if (trackedOrder.orderId !== activeCycle.orderId) {
      return params;
    }

    if (
      trackedOrder.role === 'maker' &&
      trackedOrder.accountLabel === activeCycle.makerAccountLabel
    ) {
      const makerFilledQty = new BigNumber(
        activeCycle.makerFilledQty || 0,
      ).plus(fillQty);

      return {
        ...params,
        activeCycle: this.updateMatchedCycleMetrics({
          ...activeCycle,
          makerFilledQty: makerFilledQty.toFixed(),
        }),
      };
    }

    if (
      trackedOrder.role === 'taker' &&
      trackedOrder.accountLabel === activeCycle.takerAccountLabel
    ) {
      return {
        ...params,
        activeCycle: this.updateMatchedCycleMetrics({
          ...activeCycle,
          takerFilledQty: new BigNumber(activeCycle.takerFilledQty || 0)
            .plus(fillQty)
            .toFixed(),
        }),
      };
    }

    return params;
  }

  updateMatchedCycleMetrics(
    activeCycle: DualAccountActiveCycleState,
  ): DualAccountActiveCycleState {
    const makerFilledQty = new BigNumber(activeCycle.makerFilledQty || 0);
    const takerFilledQty = new BigNumber(activeCycle.takerFilledQty || 0);
    const matchedFilledQty = BigNumber.min(makerFilledQty, takerFilledQty);
    const price = new BigNumber(activeCycle.price || 0);
    const matchedQuoteVolume =
      matchedFilledQty.isFinite() && price.isFinite()
        ? matchedFilledQty.multipliedBy(price)
        : new BigNumber(0);

    return {
      ...activeCycle,
      matchedFilledQty: matchedFilledQty.isFinite()
        ? matchedFilledQty.toFixed()
        : '0',
      matchedQuoteVolume: matchedQuoteVolume.isFinite()
        ? matchedQuoteVolume.toFixed()
        : '0',
    };
  }

  finalizeSettledCycle(params: DualAccountVolumeStrategyParams): {
    params: DualAccountVolumeStrategyParams;
    underHedged: boolean;
  } {
    if (!params.activeCycle) {
      return { params, underHedged: false };
    }

    const makerFilledQty = new BigNumber(
      params.activeCycle.makerFilledQty || 0,
    );
    const takerFilledQty = new BigNumber(
      params.activeCycle.takerFilledQty || 0,
    );
    const nextParams: DualAccountVolumeStrategyParams = {
      ...params,
      activeCycle: undefined,
    };

    if (!makerFilledQty.isFinite() || makerFilledQty.isLessThanOrEqualTo(0)) {
      return { params: nextParams, underHedged: false };
    }

    const matchedFilledQty = BigNumber.min(
      makerFilledQty,
      takerFilledQty.isFinite() ? takerFilledQty : new BigNumber(0),
    );

    if (
      matchedFilledQty.isGreaterThan(0) &&
      makerFilledQty.isEqualTo(takerFilledQty)
    ) {
      const matchedQuoteVolume = new BigNumber(
        params.activeCycle.matchedQuoteVolume || 0,
      );

      nextParams.completedCycles = Number(nextParams.completedCycles || 0) + 1;
      nextParams.totalMatchedBaseVolume = new BigNumber(
        nextParams.totalMatchedBaseVolume || 0,
      )
        .plus(matchedFilledQty)
        .toNumber();
      nextParams.totalMatchedQuoteVolume = new BigNumber(
        nextParams.totalMatchedQuoteVolume || 0,
      )
        .plus(matchedQuoteVolume.isFinite() ? matchedQuoteVolume : 0)
        .toNumber();
      nextParams.activeCycle = undefined;
      Object.assign(
        nextParams,
        this.advanceCycleRolesAfterSuccess(nextParams, params.activeCycle),
      );
      nextParams.repairRequired = false;
      nextParams.repairReason = undefined;

      return { params: nextParams, underHedged: false };
    }

    nextParams.repairRequired = true;
    nextParams.repairReason = 'paired_fill_mismatch';

    return { params: nextParams, underHedged: true };
  }

  mergeFillRuntimeIntoPersisted(
    runtime: DualAccountVolumeStrategyParams,
    persisted?: Partial<DualAccountVolumeStrategyParams>,
  ): DualAccountVolumeStrategyParams {
    if (!persisted) {
      return runtime;
    }

    const next: DualAccountVolumeStrategyParams = {
      ...runtime,
    };

    if (Number.isFinite(Number(persisted.publishedCycles))) {
      next.publishedCycles = Math.max(
        Number(runtime.publishedCycles || 0),
        Number(persisted.publishedCycles),
      );
    }

    if (Number.isFinite(Number(persisted.completedCycles))) {
      next.completedCycles = Math.max(
        Number(runtime.completedCycles || 0),
        Number(persisted.completedCycles),
      );
    }

    if (Number.isFinite(Number(persisted.tradedQuoteVolume))) {
      next.tradedQuoteVolume = Math.max(
        Number(runtime.tradedQuoteVolume || 0),
        Number(persisted.tradedQuoteVolume),
      );
    }

    return next;
  }

  isRebalanceAction(action: ExecutorAction): boolean {
    if (!action.metadata || typeof action.metadata !== 'object') {
      return false;
    }

    const metadata = action.metadata as Record<string, unknown>;

    return metadata.role === 'rebalance' || metadata.rebalance === true;
  }

  private getQuotePlanner(): QuotePlannerService {
    if (!this.quotePlannerService) {
      throw new Error('QuotePlannerService is not available');
    }

    return this.quotePlannerService;
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
    metadata?: Record<string, unknown>,
    postOnly?: boolean,
    accountLabel?: string,
    timeInForce?: 'GTC' | 'IOC',
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
      metadata,
      postOnly,
      accountLabel,
      timeInForce,
    );
  }

  async buildDualAccountVolumeActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    if (!this.hasFreshTrackedOrderBook(strategyKey, params, 'volume')) {
      return [];
    }

    const trackedBestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

    if (!trackedBestBidAsk) {
      if (params.orderBookReady) {
        this.logger.warn(
          `Skipping dual-account volume cycle for ${strategyKey}: tracked order book unavailable`,
        );
      }

      this.logger.warn(
        `Deferring dual-account volume cycle for ${strategyKey}: waiting for tracked order book`,
      );

      return [];
    }

    const { bestBid, bestAsk } = trackedBestBidAsk;
    const feeBufferRate = await this.resolveFeeBufferRate(
      params.exchangeName,
      params.symbol,
    );

    const publishedCycles = Number(params.publishedCycles || 0);
    const bestBidBn = new BigNumber(bestBid);
    const bestAskBn = new BigNumber(bestAsk);
    const spread = bestAskBn.minus(bestBidBn);

    if (spread.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: no spread bestBid=${bestBid} bestAsk=${bestAsk}`,
      );

      return [];
    }

    const spreadPosition = new BigNumber(Math.random());
    const price = bestBidBn.plus(spread.multipliedBy(spreadPosition));
    const decisionStartedAtMs = Date.now();
    const balanceSnapshot = await this.loadBalanceSnapshot(params, 'execution');

    if (!balanceSnapshot) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: balance cache unavailable or stale`,
      );

      return [];
    }

    const cycleRoles = this.resolveCycleRoles(params);
    const alternatingParams = {
      ...params,
      makerAccountLabel: cycleRoles.makerAccountLabel,
      takerAccountLabel: cycleRoles.takerAccountLabel,
    };
    const rotatedBalanceSnapshot =
      cycleRoles.makerAccountLabel === params.makerAccountLabel &&
      cycleRoles.takerAccountLabel === params.takerAccountLabel
        ? balanceSnapshot
        : {
            makerBalances: balanceSnapshot.takerBalances,
            takerBalances: balanceSnapshot.makerBalances,
          };
    const preferredSide = await this.resolvePreferredSide(
      alternatingParams,
      publishedCycles,
      rotatedBalanceSnapshot.makerBalances,
    );

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping dual-account volume cycle for ${strategyKey}: invalid non-positive price ${price.toFixed()}`,
      );

      return [];
    }

    const resolvedExecution = await this.resolveDualAccountExecutionPlan(
      strategyKey,
      alternatingParams,
      preferredSide,
      price,
      bestBidBn,
      bestAskBn,
      feeBufferRate,
      rotatedBalanceSnapshot,
    );
    const decisionDurationMs = Date.now() - decisionStartedAtMs;

    if (!resolvedExecution) {
      const rebalanceAction = await this.maybeBuildDualAccountRebalanceAction(
        strategyKey,
        params,
        preferredSide,
        bestBidBn,
        bestAskBn,
        price,
        feeBufferRate,
        publishedCycles,
        ts,
        balanceSnapshot,
      );

      if (rebalanceAction) {
        return [rebalanceAction];
      }

      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: no tradable side found`,
      );

      return [];
    }

    const {
      side,
      resolvedAccounts,
      profile,
      requestedQty,
      adjustedQuote,
      sideReason,
      fallbackReason,
    } = resolvedExecution;

    const tickId = ts;
    const cycleId = `${strategyKey}:cycle:${publishedCycles}:${tickId}`;
    const orderId = this.resolveOrderScopedOrderId(params);
    const accountBuyBias = profile.buyBias ?? params.buyBias;
    const fallbackApplied = side !== preferredSide;
    const capacityDiagnostics = balanceSnapshot
      ? this.buildDualAccountCapacityDiagnostics(
          alternatingParams,
          adjustedQuote.price,
          feeBufferRate,
          rotatedBalanceSnapshot,
          preferredSide,
          side,
          adjustedQuote.qty,
        )
      : null;
    const consecutiveFallbackCycles = fallbackApplied
      ? Number(params.consecutiveFallbackCycles || 0) + 1
      : 0;
    const estimatedLegNotional = adjustedQuote.qty.multipliedBy(
      adjustedQuote.price,
    );
    const estimatedTotalFee = estimatedLegNotional.multipliedBy(feeBufferRate);
    const netEdgeEstimate = estimatedTotalFee.negated();

    this.logger.log(
      [
        'Dual-account volume decision',
        `strategy=${strategyKey}`,
        `cycle=${cycleId}`,
        `tick=${tickId}`,
        `preferredSide=${preferredSide}`,
        `selectedSide=${side}`,
        `sideReason=${sideReason}`,
        `fallbackReason=${fallbackReason || 'n/a'}`,
        `bestBid=${bestBid}`,
        `bestAsk=${bestAsk}`,
        `spread=${spread.toFixed()}`,
        `spreadPosition=${spreadPosition.toFixed(4)}`,
        `rawPrice=${price.toFixed()}`,
        `price=${adjustedQuote.price.toFixed()}`,
        `requestedQty=${requestedQty.toFixed()}`,
        `effectiveQty=${adjustedQuote.qty.toFixed()}`,
        `maker=${resolvedAccounts.makerAccountLabel}`,
        `taker=${resolvedAccounts.takerAccountLabel}`,
        `capacity=${resolvedAccounts.capacity?.toFixed() ?? 'unknown'}`,
        `buyCapacity=${
          capacityDiagnostics?.buyCapacity.toFixed() ?? 'unknown'
        }`,
        `sellCapacity=${
          capacityDiagnostics?.sellCapacity.toFixed() ?? 'unknown'
        }`,
        `capacityLimiter=${capacityDiagnostics?.capacityLimiter ?? 'unknown'}`,
        `consecutiveFallbackCycles=${consecutiveFallbackCycles}`,
        `estimatedTotalFee=${estimatedTotalFee.toFixed()}`,
        `netEdgeEstimate=${netEdgeEstimate.toFixed()}`,
        `rebalanceNeeded=${capacityDiagnostics?.rebalanceNeeded ?? false}`,
        `decisionDurationMs=${decisionDurationMs}`,
      ].join(' | '),
    );

    return [
      this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        params.exchangeName,
        params.symbol,
        side,
        adjustedQuote.price,
        adjustedQuote.qty,
        ts,
        `dual-account-volume-maker-${publishedCycles}`,
        params.executionCategory,
        {
          cycleId,
          tickId,
          orderId,
          role: 'maker',
          preferredSide,
          selectedSide: side,
          sideReason,
          fallbackApplied,
          fallbackReason,
          makerAccountLabel: resolvedAccounts.makerAccountLabel,
          takerAccountLabel: resolvedAccounts.takerAccountLabel,
          configuredMakerAccountLabel: params.makerAccountLabel,
          configuredTakerAccountLabel: params.takerAccountLabel,
          dynamicRoleSwitching: Boolean(params.dynamicRoleSwitching),
          cycleMode: params.cycleMode || 'alternating',
          makerProtectionMode: params.makerProtectionMode || 'alive_only',
          activeHours: profile.activeHours,
          buyBias: accountBuyBias,
          requestedQty: requestedQty.toFixed(),
          effectiveQty: adjustedQuote.qty.toFixed(),
          buyCapacity: capacityDiagnostics?.buyCapacity.toFixed(),
          sellCapacity: capacityDiagnostics?.sellCapacity.toFixed(),
          preferredSideCapacity:
            capacityDiagnostics?.preferredSideCapacity.toFixed(),
          selectedSideCapacity:
            capacityDiagnostics?.selectedSideCapacity.toFixed(),
          capacityUtilization:
            capacityDiagnostics?.capacityUtilization.toFixed(),
          capacityLimited: capacityDiagnostics?.capacityLimited,
          capacityLimiter: capacityDiagnostics?.capacityLimiter,
          consecutiveFallbackCycles,
          estimatedTotalFee: estimatedTotalFee.toFixed(),
          netEdgeEstimate: netEdgeEstimate.toFixed(),
          feeBufferRate: feeBufferRate.toFixed(),
          rebalanceNeeded: capacityDiagnostics?.rebalanceNeeded ?? false,
        },
        true,
        resolvedAccounts.makerAccountLabel,
      ),
    ];
  }

  async buildDualAccountBestCapacityVolumeActions(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    ts: string,
  ): Promise<ExecutorAction[]> {
    if (!this.strategyMarketDataProviderService) {
      throw new Error('strategy market data provider is not available');
    }

    this.maybeWarnDualAccountBestCapacityIgnoredFields(strategyKey, params);

    if (
      !this.hasFreshTrackedOrderBook(
        strategyKey,
        params,
        'best-capacity volume',
      )
    ) {
      return [];
    }

    const trackedBestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );

    if (!trackedBestBidAsk) {
      if (params.orderBookReady) {
        this.logger.warn(
          `Skipping dual-account best-capacity volume cycle for ${strategyKey}: tracked order book unavailable`,
        );
      }

      this.logger.warn(
        `Deferring dual-account best-capacity volume cycle for ${strategyKey}: waiting for tracked order book`,
      );

      return [];
    }

    const { bestBid, bestAsk } = trackedBestBidAsk;
    const feeBufferRate = await this.resolveFeeBufferRate(
      params.exchangeName,
      params.symbol,
    );
    const publishedCycles = Number(params.publishedCycles || 0);
    const bestBidBn = new BigNumber(bestBid);
    const bestAskBn = new BigNumber(bestAsk);
    const spread = bestAskBn.minus(bestBidBn);

    if (spread.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping dual-account best-capacity volume cycle for ${strategyKey}: no spread bestBid=${bestBid} bestAsk=${bestAsk}`,
      );

      return [];
    }

    const spreadPosition = new BigNumber(Math.random());
    const price = bestBidBn.plus(spread.multipliedBy(spreadPosition));
    const decisionStartedAtMs = Date.now();
    const balanceSnapshot = await this.loadBalanceSnapshot(params, 'execution');

    if (!balanceSnapshot) {
      return [];
    }

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping dual-account best-capacity volume cycle for ${strategyKey}: invalid non-positive price ${price.toFixed()}`,
      );

      return [];
    }

    const rawCandidates = this.buildBestCapacityCandidates(
      params,
      price,
      feeBufferRate,
      balanceSnapshot,
    );
    const resolvedExecution =
      await this.resolveBestExecutableDualAccountCandidate(
        strategyKey,
        params,
        rawCandidates,
        price,
        bestBidBn,
        bestAskBn,
        feeBufferRate,
      );
    const decisionDurationMs = Date.now() - decisionStartedAtMs;

    if (!resolvedExecution) {
      const rebalanceAction = await this.maybeBuildDualAccountRebalanceAction(
        strategyKey,
        params,
        'buy',
        bestBidBn,
        bestAskBn,
        price,
        feeBufferRate,
        publishedCycles,
        ts,
        balanceSnapshot,
      );

      if (rebalanceAction) {
        return [rebalanceAction];
      }

      this.logger.warn(
        `Skipping dual-account best-capacity volume cycle for ${strategyKey}: no executable candidate found`,
      );

      return [];
    }

    const {
      side,
      resolvedAccounts,
      profile,
      requestedQty,
      adjustedQuote,
      candidate,
    } = resolvedExecution;
    const cycleId = `${strategyKey}:cycle:${publishedCycles}:${ts}`;
    const orderId = this.resolveOrderScopedOrderId(params);
    const accountBuyBias = profile.buyBias ?? params.buyBias;
    const selectedCapacity = candidate.capacity;
    const estimatedLegNotional = adjustedQuote.qty.multipliedBy(
      adjustedQuote.price,
    );
    const estimatedTotalFee = estimatedLegNotional.multipliedBy(feeBufferRate);
    const netEdgeEstimate = estimatedTotalFee.negated();

    this.logger.log(
      [
        'Dual-account best-capacity decision',
        `strategy=${strategyKey}`,
        `cycle=${cycleId}`,
        `tick=${ts}`,
        'selectionModel=best_capacity',
        `candidateRank=${candidate.candidateRank}`,
        `candidateCount=${rawCandidates.length}`,
        `selectedSide=${side}`,
        `price=${adjustedQuote.price.toFixed()}`,
        `requestedQty=${requestedQty.toFixed()}`,
        `effectiveQty=${adjustedQuote.qty.toFixed()}`,
        `selectedCapacity=${selectedCapacity.toFixed()}`,
        `matchedQuoteProgress=${new BigNumber(
          params.totalMatchedQuoteVolume || 0,
        ).toFixed()}`,
        `targetQuoteVolume=${new BigNumber(
          params.targetQuoteVolume || 0,
        ).toFixed()}`,
        `maker=${resolvedAccounts.makerAccountLabel}`,
        `taker=${resolvedAccounts.takerAccountLabel}`,
        `decisionDurationMs=${decisionDurationMs}`,
      ].join(' | '),
    );

    return [
      this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        params.exchangeName,
        params.symbol,
        side,
        adjustedQuote.price,
        adjustedQuote.qty,
        ts,
        `dual-account-best-capacity-volume-maker-${publishedCycles}`,
        params.executionCategory,
        {
          cycleId,
          tickId: ts,
          orderId,
          role: 'maker',
          selectionModel: 'best_capacity',
          candidateRank: candidate.candidateRank,
          candidateCount: rawCandidates.length,
          buyCapacityConfigured: this.findCandidateCapacity(
            rawCandidates,
            'buy',
            'configured',
          )?.toFixed(),
          sellCapacityConfigured: this.findCandidateCapacity(
            rawCandidates,
            'sell',
            'configured',
          )?.toFixed(),
          buyCapacitySwapped: this.findCandidateCapacity(
            rawCandidates,
            'buy',
            'swapped',
          )?.toFixed(),
          sellCapacitySwapped: this.findCandidateCapacity(
            rawCandidates,
            'sell',
            'swapped',
          )?.toFixed(),
          selectedCapacity: selectedCapacity.toFixed(),
          selectedMakerAccountLabel: resolvedAccounts.makerAccountLabel,
          selectedTakerAccountLabel: resolvedAccounts.takerAccountLabel,
          rebalanced: false,
          makerAccountLabel: resolvedAccounts.makerAccountLabel,
          takerAccountLabel: resolvedAccounts.takerAccountLabel,
          configuredMakerAccountLabel: params.makerAccountLabel,
          configuredTakerAccountLabel: params.takerAccountLabel,
          dynamicRoleSwitching: Boolean(params.dynamicRoleSwitching),
          cycleMode: params.cycleMode || 'alternating',
          makerProtectionMode: params.makerProtectionMode || 'alive_only',
          activeHours: profile.activeHours,
          buyBias: accountBuyBias,
          requestedQty: requestedQty.toFixed(),
          effectiveQty: adjustedQuote.qty.toFixed(),
          estimatedTotalFee: estimatedTotalFee.toFixed(),
          netEdgeEstimate: netEdgeEstimate.toFixed(),
          feeBufferRate: feeBufferRate.toFixed(),
        },
        true,
        resolvedAccounts.makerAccountLabel,
      ),
    ];
  }

  private async resolveDualAccountCycleAccounts(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<DualAccountResolvedAccounts | null> {
    const configured: DualAccountResolvedAccounts = {
      makerAccountLabel: params.makerAccountLabel,
      takerAccountLabel: params.takerAccountLabel,
    };

    if (!price.isFinite() || price.isLessThanOrEqualTo(0)) {
      return configured;
    }

    const snapshot =
      balanceSnapshot || (await this.loadBalanceSnapshot(params, 'execution'));

    if (!snapshot) {
      return configured;
    }
    const { makerBalances, takerBalances } = snapshot;

    return this.resolveDualAccountCycleAccountsFromBalances(
      params,
      side,
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
  }

  private resolveDualAccountCycleAccountsFromBalances(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
  ): DualAccountResolvedAccounts {
    return this.resolveCycleAccountsFromBalances(
      params,
      side,
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
  }

  private computeDualAccountCapacity(
    makerBalances: {
      base: BigNumber;
      quote: BigNumber;
    },
    takerBalances: {
      base: BigNumber;
      quote: BigNumber;
    },
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
  ): BigNumber {
    return this.computeCapacity(
      makerBalances,
      takerBalances,
      side,
      price,
      feeBufferRate,
    );
  }

  private resolveOrderScopedOrderId(
    params: Pick<
      DualAccountVolumeStrategyParams,
      'marketMakingOrderId' | 'clientId'
    >,
  ): string {
    return this.readString(params.marketMakingOrderId, params.clientId);
  }

  private hasFreshTrackedOrderBook(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    label: string,
  ): boolean {
    if (!this.strategyMarketDataProviderService?.getTrackedOrderBookFreshness) {
      return true;
    }

    const freshness =
      this.strategyMarketDataProviderService.getTrackedOrderBookFreshness(
        params.exchangeName,
        params.symbol,
        this.getMarketDataMaxAgeMs(),
      );

    if (freshness.fresh) {
      return true;
    }

    this.logger.warn(
      [
        `Skipping dual-account ${label} cycle for ${strategyKey}: stale tracked market data`,
        `exchange=${params.exchangeName}`,
        `pair=${params.symbol}`,
        `ageMs=${freshness.ageMs ?? 'missing'}`,
        `freshnessTimestamp=${freshness.freshnessTimestamp ?? 'missing'}`,
      ].join(' | '),
    );

    return false;
  }

  private getMarketDataMaxAgeMs(): number {
    const parsed = Number(
      this.configService?.get('strategy.market_data_max_age_ms', 30_000),
    );

    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 30_000;
  }

  private buildDualAccountCapacityDiagnostics(
    params: DualAccountVolumeStrategyParams,
    price: BigNumber,
    feeBufferRate: BigNumber,
    snapshot: DualAccountBalanceSnapshot,
    preferredSide: 'buy' | 'sell',
    selectedSide: 'buy' | 'sell',
    effectiveQty: BigNumber,
  ): DualAccountCapacityDiagnostics {
    return this.buildCapacityDiagnostics(
      params,
      price,
      feeBufferRate,
      snapshot,
      preferredSide,
      selectedSide,
      effectiveQty,
    );
  }

  private resolveDualAccountCapacityLimiter(
    resolvedAccounts: DualAccountResolvedAccounts,
    side: 'buy' | 'sell',
    price: BigNumber,
    feeBufferRate: BigNumber,
  ):
    | 'maker_base'
    | 'maker_quote'
    | 'taker_base'
    | 'taker_quote'
    | 'balanced'
    | 'unknown' {
    return this.resolveCapacityLimiter(
      resolvedAccounts,
      side,
      price,
      feeBufferRate,
    );
  }

  private async resolveDualAccountExecutionPlan(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<DualAccountExecutionPlan | null> {
    const fallbackSide = preferredSide === 'buy' ? 'sell' : 'buy';
    const tradeAmountVarianceSample = Math.random();

    const preferredExecution = await this.evaluateDualAccountExecutionForSide(
      strategyKey,
      params,
      preferredSide,
      price,
      tradeAmountVarianceSample,
      bestBid,
      bestAsk,
      feeBufferRate,
      balanceSnapshot,
    );

    if (preferredExecution) {
      return {
        ...preferredExecution,
        sideReason: 'preferred_side_tradable',
      };
    }

    this.logger.log(
      [
        'Dual-account volume side fallback',
        `strategy=${strategyKey}`,
        `preferredSide=${preferredSide}`,
        `fallbackSide=${fallbackSide}`,
        'fallbackReason=preferred_side_not_tradable',
      ].join(' | '),
    );

    const fallbackExecution = await this.evaluateDualAccountExecutionForSide(
      strategyKey,
      params,
      fallbackSide,
      price,
      tradeAmountVarianceSample,
      bestBid,
      bestAsk,
      feeBufferRate,
      balanceSnapshot,
    );

    if (!fallbackExecution) {
      return null;
    }

    return {
      ...fallbackExecution,
      sideReason: 'fallback_side_tradable',
      fallbackReason: 'preferred_side_not_tradable',
    };
  }

  private buildDualAccountBestCapacityCandidates(
    params: DualAccountVolumeStrategyParams,
    price: BigNumber,
    feeBufferRate: BigNumber,
    snapshot: DualAccountBalanceSnapshot,
  ): DualAccountBestCapacityCandidate[] {
    return this.buildBestCapacityCandidates(
      params,
      price,
      feeBufferRate,
      snapshot,
    );
  }

  private computeDualAccountImbalanceRatio(
    primaryCapacity: BigNumber,
    oppositeCapacity: BigNumber,
  ): BigNumber {
    return this.computeImbalanceRatio(primaryCapacity, oppositeCapacity);
  }

  private scoreDualAccountBestCapacityCandidate(
    params: Pick<
      DualAccountVolumeStrategyParams,
      'targetQuoteVolume' | 'totalMatchedQuoteVolume'
    >,
    candidate: Pick<
      DualAccountBestCapacityCandidate,
      'capacity' | 'futureOppositeCapacity' | 'imbalanceRatio'
    >,
    price: BigNumber,
  ): BigNumber {
    return this.scoreBestCapacityCandidate(params, candidate, price);
  }

  private async resolveBestExecutableDualAccountCandidate(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    candidates: DualAccountBestCapacityCandidate[],
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
  ): Promise<
    | (DualAccountExecutionPlan & {
        candidate: DualAccountBestCapacityCandidate;
      })
    | null
  > {
    const tradeAmountVarianceSample = Math.random();

    for (const candidate of candidates) {
      const execution =
        await this.evaluateDualAccountExecutionForSideWithAccounts(
          strategyKey,
          params,
          candidate.side,
          {
            makerAccountLabel: candidate.makerAccountLabel,
            takerAccountLabel: candidate.takerAccountLabel,
            makerBalances: candidate.makerBalances,
            takerBalances: candidate.takerBalances,
            capacity: candidate.capacity,
          },
          price,
          tradeAmountVarianceSample,
          bestBid,
          bestAsk,
          feeBufferRate,
        );

      if (execution) {
        return {
          ...execution,
          candidate,
          sideReason: 'preferred_side_tradable',
        };
      }
    }

    return null;
  }

  async maybeBuildDualAccountRebalanceAction(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    bestBid: BigNumber,
    bestAsk: BigNumber,
    price: BigNumber,
    feeBufferRate: BigNumber,
    publishedCycles: number,
    ts: string,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<ExecutorAction | null> {
    const snapshot =
      balanceSnapshot || (await this.loadBalanceSnapshot(params, 'rebalance'));

    if (!snapshot) {
      return null;
    }
    const { makerBalances, takerBalances } = snapshot;

    const passiveCandidates = (
      await Promise.all([
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestAsk,
          params.makerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestAsk,
          params.takerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestBid,
          params.makerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          bestBid,
          params.takerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
      ])
    ).filter(
      (candidate): candidate is DualAccountRebalanceCandidate =>
        candidate !== null,
    );

    const aggressiveCandidates = (
      await Promise.all([
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.makerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.takerAccountLabel,
          'buy',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.makerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
        this.buildDualAccountRebalanceCandidate(
          strategyKey,
          params,
          preferredSide,
          price,
          price,
          params.takerAccountLabel,
          'sell',
          makerBalances,
          takerBalances,
          feeBufferRate,
          publishedCycles,
          ts,
        ),
      ])
    ).filter(
      (candidate): candidate is DualAccountRebalanceCandidate =>
        candidate !== null,
    );

    const selectBestRebalanceCandidate = (
      candidates: DualAccountRebalanceCandidate[],
    ): DualAccountRebalanceCandidate | null => {
      if (candidates.length === 0) {
        return null;
      }

      return candidates.reduce((best, candidate) => {
        const bestScore = best.restoredCapacityScore.minus(
          best.rebalanceCostScore,
        );
        const candidateScore = candidate.restoredCapacityScore.minus(
          candidate.rebalanceCostScore,
        );

        if (candidateScore.isGreaterThan(bestScore)) {
          return candidate;
        }

        return best;
      });
    };

    const selectedPassive = selectBestRebalanceCandidate(passiveCandidates);
    const selectedAggressive =
      selectBestRebalanceCandidate(aggressiveCandidates);

    if (!selectedPassive && !selectedAggressive) {
      return null;
    }

    const passiveNetScore = selectedPassive
      ? selectedPassive.restoredCapacityScore.minus(
          selectedPassive.rebalanceCostScore,
        )
      : null;
    const aggressiveNetScore = selectedAggressive
      ? selectedAggressive.restoredCapacityScore.minus(
          selectedAggressive.rebalanceCostScore,
        )
      : null;

    const selected =
      selectedPassive &&
      (!selectedAggressive ||
        !aggressiveNetScore ||
        !passiveNetScore ||
        aggressiveNetScore.isLessThanOrEqualTo(
          passiveNetScore.multipliedBy(1.05),
        ))
        ? selectedPassive
        : selectedAggressive;

    if (!selected) {
      return null;
    }

    this.logger.log(
      `Dual-account volume ${strategyKey}: scheduling rebalance account=${
        selected.accountLabel
      } side=${selected.side} qty=${selected.action.qty} price=${
        selected.action.price
      } restoredSide=${selected.futureExecution.side} restoredMaker=${
        selected.futureExecution.resolvedAccounts.makerAccountLabel
      } restoredTaker=${
        selected.futureExecution.resolvedAccounts.takerAccountLabel
      } restoredCapacity=${selected.futureExecution.capacity.toFixed()}`,
    );

    return selected.action;
  }

  private async buildDualAccountRebalanceCandidate(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    futurePrice: BigNumber,
    executionPrice: BigNumber,
    accountLabel: string,
    side: 'buy' | 'sell',
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
    publishedCycles: number,
    ts: string,
  ): Promise<DualAccountRebalanceCandidate | null> {
    if (!executionPrice.isFinite() || executionPrice.isLessThanOrEqualTo(0)) {
      return null;
    }

    const nextMakerBalances = this.clonePairBalances(makerBalances);
    const nextTakerBalances = this.clonePairBalances(takerBalances);
    const selectedBalances =
      accountLabel === params.makerAccountLabel
        ? nextMakerBalances
        : nextTakerBalances;

    const maxAffordableQty =
      side === 'buy'
        ? selectedBalances.quote
            .dividedBy(executionPrice)
            .multipliedBy(new BigNumber(1).minus(feeBufferRate))
        : selectedBalances.base;
    const requestedQty = BigNumber.min(
      new BigNumber(params.baseTradeAmount),
      maxAffordableQty,
    );

    if (!requestedQty.isFinite() || requestedQty.isLessThanOrEqualTo(0)) {
      return null;
    }

    const adjustedQuote = await this.getQuotePlanner().quantizeAndValidateQuote(
      `${strategyKey}:rebalance`,
      params.exchangeName,
      params.symbol,
      accountLabel,
      side,
      0,
      `dual-account-rebalance:${accountLabel}:${side}`,
      requestedQty,
      executionPrice,
      selectedBalances,
    );

    if (!adjustedQuote) {
      return null;
    }

    if (side === 'buy') {
      selectedBalances.base = selectedBalances.base.plus(adjustedQuote.qty);
    } else {
      selectedBalances.quote = selectedBalances.quote.plus(
        adjustedQuote.qty.multipliedBy(adjustedQuote.price),
      );
    }

    const futureExecution = this.resolveBestDualAccountTradeabilityFromBalances(
      params,
      preferredSide,
      futurePrice,
      nextMakerBalances,
      nextTakerBalances,
      feeBufferRate,
    );

    if (!futureExecution) {
      return null;
    }

    const orderId = this.resolveOrderScopedOrderId(params);
    const cycleId = `${strategyKey}:rebalance:${ts}:${accountLabel}:${side}`;

    const rebalanceNotional = adjustedQuote.qty.multipliedBy(
      adjustedQuote.price,
    );
    const rebalanceCostScore = rebalanceNotional.multipliedBy(feeBufferRate);
    const restoredCapacityScore = futureExecution.capacity;
    const mode = executionPrice.isEqualTo(futurePrice)
      ? 'passive'
      : 'aggressive';

    return {
      action: this.createIntent(
        strategyKey,
        strategyKey,
        params.userId,
        params.clientId,
        params.exchangeName,
        params.symbol,
        side,
        adjustedQuote.price,
        adjustedQuote.qty,
        ts,
        `dual-account-volume-rebalance-${publishedCycles}-${accountLabel}-${side}`,
        params.executionCategory,
        {
          cycleId,
          orderId,
          role: 'rebalance',
          rebalance: true,
          rebalanceReason: 'no_tradable_side',
          rebalanceAccountLabel: accountLabel,
          makerAccountLabel: futureExecution.resolvedAccounts.makerAccountLabel,
          takerAccountLabel: futureExecution.resolvedAccounts.takerAccountLabel,
          configuredMakerAccountLabel: params.makerAccountLabel,
          configuredTakerAccountLabel: params.takerAccountLabel,
          preferredSide,
          restoredSide: futureExecution.side,
          restoredCapacity: futureExecution.capacity.toFixed(),
          targetQty: new BigNumber(params.baseTradeAmount).toFixed(),
          requestedQty: requestedQty.toFixed(),
          effectiveQty: adjustedQuote.qty.toFixed(),
        },
        false,
        accountLabel,
        'IOC',
      ),
      futureExecution,
      accountLabel,
      side,
      restoredCapacityScore,
      rebalanceCostScore,
      mode,
    };
  }

  private resolveBestDualAccountTradeabilityFromBalances(
    params: DualAccountVolumeStrategyParams,
    preferredSide: 'buy' | 'sell',
    price: BigNumber,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
  ): DualAccountTradeabilityPlan | null {
    const preferredTradeability =
      this.evaluateDualAccountTradeabilityForSideFromBalances(
        params,
        preferredSide,
        price,
        makerBalances,
        takerBalances,
        feeBufferRate,
      );

    if (preferredTradeability) {
      return preferredTradeability;
    }

    return this.evaluateDualAccountTradeabilityForSideFromBalances(
      params,
      preferredSide === 'buy' ? 'sell' : 'buy',
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
  }

  private evaluateDualAccountTradeabilityForSideFromBalances(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    feeBufferRate: BigNumber,
  ): DualAccountTradeabilityPlan | null {
    const resolvedAccounts = this.resolveDualAccountCycleAccountsFromBalances(
      params,
      side,
      price,
      makerBalances,
      takerBalances,
      feeBufferRate,
    );
    const profile = this.resolveBehaviorProfile(
      params,
      resolvedAccounts.makerAccountLabel,
    );

    if (!this.isWithinProfileWindow(profile)) {
      return null;
    }

    const capacity = resolvedAccounts.capacity;

    if (!capacity || !capacity.isFinite() || capacity.isLessThanOrEqualTo(0)) {
      return null;
    }

    return {
      side,
      resolvedAccounts,
      profile,
      capacity,
    };
  }

  private cloneDualAccountPairBalances(
    balances: DualAccountPairBalances,
  ): DualAccountPairBalances {
    return this.clonePairBalances(balances);
  }

  private async evaluateDualAccountExecutionForSide(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    price: BigNumber,
    tradeAmountVarianceSample: number,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
    balanceSnapshot?: DualAccountBalanceSnapshot | null,
  ): Promise<DualAccountExecutionPlan | null> {
    const resolvedAccounts = await this.resolveDualAccountCycleAccounts(
      params,
      side,
      price,
      feeBufferRate,
      balanceSnapshot,
    );

    if (!resolvedAccounts) {
      this.logger.warn(
        `Dual-account volume ${strategyKey}: unable to resolve maker/taker accounts for side=${side}`,
      );

      return null;
    }

    return await this.evaluateDualAccountExecutionForSideWithAccounts(
      strategyKey,
      params,
      side,
      resolvedAccounts,
      price,
      tradeAmountVarianceSample,
      bestBid,
      bestAsk,
      feeBufferRate,
    );
  }

  private async evaluateDualAccountExecutionForSideWithAccounts(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    resolvedAccounts: DualAccountResolvedAccounts,
    price: BigNumber,
    tradeAmountVarianceSample: number,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
  ): Promise<DualAccountExecutionPlan | null> {
    const profile = this.resolveBehaviorProfile(
      params,
      resolvedAccounts.makerAccountLabel,
    );

    if (!this.isWithinProfileWindow(profile)) {
      this.logger.log(
        `Dual-account volume ${strategyKey}: maker account ${resolvedAccounts.makerAccountLabel} is outside active hours for side=${side}`,
      );

      return null;
    }

    const requestedQty = this.isBestCapacityConfig(params)
      ? new BigNumber(params.maxOrderAmount || 0)
      : new BigNumber(
          this.applyVariance(
            params.baseTradeAmount,
            profile.tradeAmountVariance ?? params.tradeAmountVariance,
            profile.tradeAmountMultiplier,
            tradeAmountVarianceSample,
          ),
        );

    if (!requestedQty.isFinite() || requestedQty.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Dual-account volume ${strategyKey}: invalid qty ${
          (params.maxOrderAmount ?? params.baseTradeAmount) || 0
        } for side=${side}`,
      );

      return null;
    }

    const adjustedQuote = await this.quantizeAndAdaptDualAccountQuote(
      strategyKey,
      params,
      side,
      price,
      requestedQty,
      resolvedAccounts,
      bestBid,
      bestAsk,
      feeBufferRate,
    );

    if (!adjustedQuote) {
      return null;
    }

    return {
      side,
      resolvedAccounts,
      profile,
      requestedQty,
      adjustedQuote,
      sideReason: 'preferred_side_tradable',
    };
  }

  private async quantizeAndAdaptDualAccountQuote(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    rawPrice: BigNumber,
    requestedQty: BigNumber,
    resolvedAccounts: DualAccountResolvedAccounts,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
  ): Promise<{ price: BigNumber; qty: BigNumber } | null> {
    let effectivePrice = rawPrice;

    if (this.exchangeConnectorAdapterService) {
      const initialQuantized =
        this.exchangeConnectorAdapterService.quantizeOrder(
          params.exchangeName,
          params.symbol,
          requestedQty.toFixed(),
          rawPrice.toFixed(),
          resolvedAccounts.makerAccountLabel,
        );

      effectivePrice = new BigNumber(initialQuantized.price);
    }

    effectivePrice = this.normalizeMakerPrice(
      strategyKey,
      params,
      side,
      requestedQty,
      effectivePrice,
      resolvedAccounts.makerAccountLabel,
      bestBid,
      bestAsk,
    );

    if (!effectivePrice) {
      return null;
    }

    if (!effectivePrice.isFinite() || effectivePrice.isLessThanOrEqualTo(0)) {
      this.logger.error(
        `Skipping dual-account volume cycle for ${strategyKey}: invalid quantized price ${effectivePrice.toFixed()}`,
      );

      return null;
    }

    const capacity =
      resolvedAccounts.makerBalances && resolvedAccounts.takerBalances
        ? this.computeDualAccountCapacity(
            resolvedAccounts.makerBalances,
            resolvedAccounts.takerBalances,
            side,
            effectivePrice,
            feeBufferRate,
          )
        : resolvedAccounts.capacity;
    const rules = this.exchangeConnectorAdapterService
      ? await this.exchangeConnectorAdapterService.loadTradingRules(
          params.exchangeName,
          params.symbol,
          resolvedAccounts.makerAccountLabel,
        )
      : {};
    let effectiveQty = requestedQty;

    if (
      capacity &&
      capacity.isFinite() &&
      capacity.isGreaterThanOrEqualTo(0) &&
      effectiveQty.isGreaterThan(capacity)
    ) {
      this.logger.log(
        `Reducing dual-account volume qty for ${strategyKey}: requested=${requestedQty.toFixed()} effective=${capacity.toFixed()} capacity=${capacity.toFixed()} side=${side} maker=${
          resolvedAccounts.makerAccountLabel
        } taker=${
          resolvedAccounts.takerAccountLabel
        } qtyReason=capacity_limited`,
      );
      effectiveQty = capacity;
    }

    if (rules.amountMax && effectiveQty.isGreaterThan(rules.amountMax)) {
      const cappedQty = new BigNumber(rules.amountMax);

      this.logger.log(
        `Capping dual-account volume qty for ${strategyKey}: effective=${effectiveQty.toFixed()} capped=${cappedQty.toFixed()} amountMax=${cappedQty.toFixed()} side=${side} maker=${
          resolvedAccounts.makerAccountLabel
        } taker=${
          resolvedAccounts.takerAccountLabel
        } qtyReason=exchange_amount_max`,
      );
      effectiveQty = cappedQty;
    }

    if (rules.costMax) {
      const maxNotionalQty = new BigNumber(rules.costMax).dividedBy(
        effectivePrice,
      );

      if (effectiveQty.isGreaterThan(maxNotionalQty)) {
        this.logger.log(
          `Capping dual-account volume qty for ${strategyKey}: effective=${effectiveQty.toFixed()} capped=${maxNotionalQty.toFixed()} costMax=${new BigNumber(
            rules.costMax,
          ).toFixed()} side=${side} maker=${
            resolvedAccounts.makerAccountLabel
          } taker=${
            resolvedAccounts.takerAccountLabel
          } qtyReason=exchange_cost_max`,
        );
        effectiveQty = maxNotionalQty;
      }
    }

    if (!effectiveQty.isFinite() || effectiveQty.isLessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: adapted qty ${effectiveQty.toFixed()} is non-positive after balance and rule checks`,
      );

      return null;
    }

    const effectiveCost = effectiveQty.multipliedBy(effectivePrice);

    if (
      (rules.amountMin && effectiveQty.isLessThan(rules.amountMin)) ||
      (rules.costMin && effectiveCost.isLessThan(rules.costMin))
    ) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: adapted qty ${effectiveQty.toFixed()}@${effectivePrice.toFixed()} is below exchange minimums before quantization qtyReason=below_exchange_minimums`,
      );

      return null;
    }

    let qty = effectiveQty;

    if (this.exchangeConnectorAdapterService) {
      try {
        const quantized = this.exchangeConnectorAdapterService.quantizeOrder(
          params.exchangeName,
          params.symbol,
          effectiveQty.toFixed(),
          effectivePrice.toFixed(),
          resolvedAccounts.makerAccountLabel,
        );

        effectivePrice = new BigNumber(quantized.price);
        qty = new BigNumber(quantized.qty);
      } catch (error) {
        this.logger.warn(
          `Skipping dual-account volume cycle for ${strategyKey}: quantization rejected qty ${effectiveQty.toFixed()}@${effectivePrice.toFixed()} for side=${side} maker=${
            resolvedAccounts.makerAccountLabel
          } taker=${resolvedAccounts.takerAccountLabel}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        return null;
      }
    }

    effectivePrice = this.normalizeMakerPrice(
      strategyKey,
      params,
      side,
      qty,
      effectivePrice,
      resolvedAccounts.makerAccountLabel,
      bestBid,
      bestAsk,
    );

    if (!effectivePrice) {
      return null;
    }

    if (
      !qty.isFinite() ||
      qty.isLessThanOrEqualTo(0) ||
      !effectivePrice.isFinite() ||
      effectivePrice.isLessThanOrEqualTo(0) ||
      (rules.amountMin && qty.isLessThan(rules.amountMin)) ||
      (rules.amountMax && qty.isGreaterThan(rules.amountMax)) ||
      (rules.costMin &&
        qty.multipliedBy(effectivePrice).isLessThan(rules.costMin)) ||
      (rules.costMax &&
        qty.multipliedBy(effectivePrice).isGreaterThan(rules.costMax))
    ) {
      this.logger.warn(
        `Skipping dual-account volume cycle for ${strategyKey}: quantized qty ${qty.toFixed()}@${effectivePrice.toFixed()} is outside exchange limits or non-positive`,
      );

      return null;
    }

    if (resolvedAccounts.makerBalances && resolvedAccounts.takerBalances) {
      const quantizedCapacity = this.computeDualAccountCapacity(
        resolvedAccounts.makerBalances,
        resolvedAccounts.takerBalances,
        side,
        effectivePrice,
        feeBufferRate,
      );

      if (qty.isGreaterThan(quantizedCapacity)) {
        this.logger.warn(
          `Skipping dual-account volume cycle for ${strategyKey}: quantized qty ${qty.toFixed()} exceeds live capacity ${quantizedCapacity.toFixed()} for side=${side} maker=${
            resolvedAccounts.makerAccountLabel
          } taker=${resolvedAccounts.takerAccountLabel}`,
        );

        return null;
      }
    }

    return { price: effectivePrice, qty };
  }

  private resolveBehaviorProfile(
    params: DualAccountVolumeStrategyParams,
    accountLabel: string,
  ): DualAccountBehaviorProfile {
    return dualAccountConfig.resolveDualAccountBehaviorProfile(
      params,
      accountLabel,
    );
  }

  private isBestCapacityConfig(
    params: DualAccountVolumeStrategyParams,
  ): boolean {
    return dualAccountConfig.isBestCapacityConfig(params);
  }

  private maybeWarnDualAccountBestCapacityIgnoredFields(
    strategyKey: string,
    params: DualAccountVolumeStrategyParams,
  ): void {
    if (this.loggedBestCapacityIgnoredConfigWarnings.has(strategyKey)) {
      return;
    }

    const ignoredFields: string[] = [];

    if (params.dynamicRoleSwitching) {
      ignoredFields.push('dynamicRoleSwitching');
    }
    if (params.postOnlySide !== undefined) {
      ignoredFields.push('postOnlySide');
    }
    if (params.buyBias !== undefined) {
      ignoredFields.push('buyBias');
    }

    if (ignoredFields.length === 0) {
      return;
    }

    this.loggedBestCapacityIgnoredConfigWarnings.add(strategyKey);
    this.logger.warn(
      `Dual-account best-capacity strategy ${strategyKey}: ignoring config fields ${ignoredFields.join(
        ', ',
      )}`,
    );
  }

  private applyVariance(
    baseValue: number,
    variance?: number,
    multiplier?: number,
    varianceSample?: number,
  ): number {
    return dualAccountConfig.applyVariance(
      baseValue,
      variance,
      multiplier,
      varianceSample,
    );
  }

  private isWithinProfileWindow(profile: DualAccountBehaviorProfile): boolean {
    return dualAccountConfig.isWithinDualAccountProfileWindow(profile);
  }

  private buildBestCapacityCandidate(
    params: DualAccountVolumeStrategyParams,
    side: 'buy' | 'sell',
    makerAccountLabel: string,
    takerAccountLabel: string,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    price: BigNumber,
    retainFactor: BigNumber,
    roleAssignment: 'configured' | 'swapped',
  ): Omit<DualAccountBestCapacityCandidate, 'candidateRank'> {
    const capacity = this.computeCapacity(
      makerBalances,
      takerBalances,
      side,
      price,
      new BigNumber(1).minus(retainFactor),
    );
    const futureOppositeCapacity = this.computeCapacity(
      makerBalances,
      takerBalances,
      side === 'buy' ? 'sell' : 'buy',
      price,
      new BigNumber(1).minus(retainFactor),
    );

    return {
      side,
      makerAccountLabel,
      takerAccountLabel,
      makerBalances,
      takerBalances,
      capacity,
      futureOppositeCapacity,
      imbalanceRatio: this.computeImbalanceRatio(
        capacity,
        futureOppositeCapacity,
      ),
      roleAssignment,
    };
  }

  private resolveRetainFactor(feeBufferRate: BigNumber): BigNumber {
    return feeBufferRate.isFinite()
      ? BigNumber.max(
          new BigNumber(1).minus(
            feeBufferRate.isGreaterThanOrEqualTo(0) ? feeBufferRate : 0,
          ),
          new BigNumber(0),
        )
      : new BigNumber(1);
  }

  private resolveVolumeSide(
    postOnlySide: 'buy' | 'sell' | 'inventory_balance' | undefined,
    executedTrades: number,
    buyBias?: number,
  ): 'buy' | 'sell' {
    if (!this.volumeStrategyController) {
      throw new Error('volume strategy controller is not available');
    }

    return this.volumeStrategyController.resolveVolumeSide(
      postOnlySide,
      executedTrades,
      buyBias,
    );
  }

  private readString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return fallback;
  }
}

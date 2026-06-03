import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import BigNumber from 'bignumber.js';

import { CustomLogger } from '../../../infrastructure/logger/logger.service';
import { OrderScopedBalanceQueryService } from '../../balance-state/order-scoped-balance-query.service';
import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import type { TrackedOrder } from '../../trackers/exchange-order-tracker.service';
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
  DualAccountSafetyBufferConfig,
  DualAccountTradeabilityPlan,
  DualAccountVolumeStrategyParams,
  EfficientDualAccountVolumeMode,
} from '../config/strategy-params.types';
import { VolumeStrategyController } from '../controllers/volume-strategy.controller';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { QuotePlannerService } from '../quote/quote-planner.service';
import * as dualAccountConfig from './dual-account-config';

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

export type DualAccountReadinessBlockingReason = {
  code:
    | 'market_data_stale'
    | 'market_data_missing'
    | 'trading_rules_missing'
    | 'trading_rules_incomplete'
    | 'fee_data_missing'
    | 'balance_snapshot_unavailable'
    | 'below_exchange_minimums';
  message: string;
  accountLabel?: string;
  asset?: string;
};

export type DualAccountReadinessMissingBalance = {
  accountLabel: string;
  asset: string;
  availableAmount: string;
  minimumUsefulAmount: string;
  missingAmount: string;
};

export type DualAccountReadinessCapitalRequirement = {
  accountLabel: string;
  asset: string;
  amount: string;
};

export type DualAccountReadinessResult = {
  canStart: boolean;
  mode: EfficientDualAccountVolumeMode;
  bestFirstAction: {
    makerAccountLabel: string;
    takerAccountLabel: string;
    side: 'buy' | 'sell';
    baseAsset: string;
    quoteAsset: string;
    quantity: string;
    price: string;
    notional: string;
  } | null;
  maximumCycleQty: string;
  recommendedCycleQty: string;
  minimumCapitalByAccountAsset: DualAccountReadinessCapitalRequirement[];
  recommendedCapitalByAccountAsset: DualAccountReadinessCapitalRequirement[];
  missingBalances: DualAccountReadinessMissingBalance[];
  estimatedCycles: {
    count: string;
    basis: 'current_available_balances';
  };
  estimatedVolume: {
    baseAsset: string;
    quoteAsset: string;
    baseAmount: string;
    quoteAmount: string;
  };
  blockingReasons: DualAccountReadinessBlockingReason[];
};

type DualAccountBestCapacityMarketContext = {
  bestBid?: BigNumber;
  bestAsk?: BigNumber;
  referencePrice?: BigNumber;
};

type DualAccountBestCapacityFeeRates = {
  makerFeeRate?: BigNumber;
  takerFeeRate?: BigNumber;
};

const MODE_AWARE_BEST_CAPACITY_WEIGHTS: Record<
  EfficientDualAccountVolumeMode,
  {
    volume: number;
    futureCapacity: number;
    feeCost: number;
    spreadCost: number;
    rebalance: number;
    dust: number;
  }
> = {
  cheapest_capital: {
    volume: 0.8,
    futureCapacity: 1.6,
    feeCost: 1.4,
    spreadCost: 1.4,
    rebalance: 2,
    dust: 2,
  },
  balanced: {
    volume: 1,
    futureCapacity: 1,
    feeCost: 1,
    spreadCost: 1,
    rebalance: 1.2,
    dust: 1.5,
  },
  fastest_volume: {
    volume: 1.6,
    futureCapacity: 0.6,
    feeCost: 0.7,
    spreadCost: 0.7,
    rebalance: 0.7,
    dust: 1,
  },
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
    marketContext?: DualAccountBestCapacityMarketContext,
    feeRates?: DualAccountBestCapacityFeeRates,
  ): DualAccountBestCapacityCandidate[] {
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
          feeBufferRate,
          'configured',
          marketContext,
          feeRates,
        ),
        this.buildBestCapacityCandidate(
          params,
          'buy',
          params.takerAccountLabel,
          params.makerAccountLabel,
          snapshot.takerBalances,
          snapshot.makerBalances,
          price,
          feeBufferRate,
          'swapped',
          marketContext,
          feeRates,
        ),
        this.buildBestCapacityCandidate(
          params,
          'sell',
          params.makerAccountLabel,
          params.takerAccountLabel,
          snapshot.makerBalances,
          snapshot.takerBalances,
          price,
          feeBufferRate,
          'configured',
          marketContext,
          feeRates,
        ),
        this.buildBestCapacityCandidate(
          params,
          'sell',
          params.takerAccountLabel,
          params.makerAccountLabel,
          snapshot.takerBalances,
          snapshot.makerBalances,
          price,
          feeBufferRate,
          'swapped',
          marketContext,
          feeRates,
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
      'mode' | 'targetQuoteVolume' | 'totalMatchedQuoteVolume'
    >,
    candidate: Pick<
      DualAccountBestCapacityCandidate,
      | 'capacity'
      | 'quoteVolume'
      | 'futureOppositeCapacity'
      | 'nextCycleQuoteCapacity'
      | 'estimatedFeeQuote'
      | 'estimatedSpreadCostQuote'
      | 'rebalanceRiskQuote'
      | 'dustRiskQuote'
      | 'imbalanceRatio'
    >,
    price: BigNumber,
  ): BigNumber {
    const mode = this.resolveBestCapacityMode(params.mode);
    const weights = MODE_AWARE_BEST_CAPACITY_WEIGHTS[mode];
    const candidateQuoteCapacity = this.readFiniteBigNumber(
      candidate.quoteVolume,
      candidate.capacity.multipliedBy(price),
    );
    const nextCycleQuoteCapacity = this.readFiniteBigNumber(
      candidate.nextCycleQuoteCapacity,
      candidate.futureOppositeCapacity.multipliedBy(price),
    );
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
    const estimatedFeeQuote = this.readFiniteBigNumber(
      candidate.estimatedFeeQuote,
      new BigNumber(0),
    );
    const estimatedSpreadCostQuote = this.readFiniteBigNumber(
      candidate.estimatedSpreadCostQuote,
      new BigNumber(0),
    );
    const rebalanceRiskQuote = this.readFiniteBigNumber(
      candidate.rebalanceRiskQuote,
      candidate.imbalanceRatio.isGreaterThan(1)
        ? candidateQuoteCapacity.multipliedBy(candidate.imbalanceRatio.minus(1))
        : new BigNumber(0),
    );
    const dustRiskQuote = this.readFiniteBigNumber(
      candidate.dustRiskQuote,
      new BigNumber(0),
    );

    return candidateQuoteCapacity
      .multipliedBy(weights.volume)
      .plus(nextCycleQuoteCapacity.multipliedBy(weights.futureCapacity))
      .plus(targetProgressScore.multipliedBy(0.3))
      .minus(estimatedFeeQuote.multipliedBy(weights.feeCost))
      .minus(estimatedSpreadCostQuote.multipliedBy(weights.spreadCost))
      .minus(rebalanceRiskQuote.multipliedBy(weights.rebalance))
      .minus(dustRiskQuote.multipliedBy(weights.dust));
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
    const rules = this.getCachedDualAccountTradingRules(exchangeName, pair);

    if (!rules) {
      return new BigNumber(0);
    }

    const makerFee = new BigNumber(rules.makerFee || 0);
    const takerFee = new BigNumber(rules.takerFee || 0);
    const totalFeeRate = makerFee.plus(takerFee);

    if (!totalFeeRate.isFinite() || totalFeeRate.isLessThanOrEqualTo(0)) {
      return new BigNumber(0);
    }

    return totalFeeRate;
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

  async evaluateEfficientDualAccountReadiness(
    params: DualAccountVolumeStrategyParams,
  ): Promise<DualAccountReadinessResult> {
    const mode = this.resolveBestCapacityMode(params.mode);
    const assets = this.parseBaseQuote(params.symbol || params.pair || '');

    if (!assets) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'market_data_missing',
        message: 'Trading pair is invalid or missing',
      });
    }

    if (!this.strategyMarketDataProviderService) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'market_data_missing',
        message: 'Tracked market data provider is unavailable',
      });
    }

    const freshness =
      this.strategyMarketDataProviderService.getTrackedOrderBookFreshness?.(
        params.exchangeName,
        params.symbol,
        this.getMarketDataMaxAgeMs(),
      );

    if (freshness && !freshness.fresh) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'market_data_stale',
        message: `Tracked order book is stale or missing for ${params.exchangeName} ${params.symbol}`,
      });
    }

    const trackedBestBidAsk =
      this.strategyMarketDataProviderService.getTrackedBestBidAsk(
        params.exchangeName,
        params.symbol,
      );
    const bestBid = new BigNumber(trackedBestBidAsk?.bestBid || 0);
    const bestAsk = new BigNumber(trackedBestBidAsk?.bestAsk || 0);

    if (
      !bestBid.isFinite() ||
      !bestAsk.isFinite() ||
      bestBid.isLessThanOrEqualTo(0) ||
      bestAsk.isLessThanOrEqualTo(bestBid)
    ) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'market_data_missing',
        message: `Tracked best bid/ask is unavailable for ${params.exchangeName} ${params.symbol}`,
      });
    }

    const rules = this.getCachedReadinessTradingRules(params);

    if (!rules) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'trading_rules_missing',
        message: `Cached trading rules are unavailable for ${params.exchangeName} ${params.symbol}`,
      });
    }

    const amountMin = this.readPositiveFiniteNumber(rules.amountMin);
    const costMin = this.readPositiveFiniteNumber(rules.costMin);

    if (!amountMin && !costMin) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'trading_rules_incomplete',
        message: `Trading rules for ${params.exchangeName} ${params.symbol} are missing amount or notional minimums`,
      });
    }

    const makerFee = this.readPositiveFiniteNumber(rules.makerFee);
    const takerFee = this.readPositiveFiniteNumber(rules.takerFee);

    if (!makerFee || !takerFee) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'fee_data_missing',
        message: `Trading fee data is unavailable for ${params.exchangeName} ${params.symbol}`,
      });
    }

    const feeBufferRate = new BigNumber(makerFee).plus(takerFee);
    const price = bestBid.plus(bestAsk).dividedBy(2);
    const snapshot = await this.loadBalanceSnapshot(params, 'execution');

    if (!snapshot) {
      return this.buildBlockedReadiness(params, mode, {
        code: 'balance_snapshot_unavailable',
        message: 'Order-scoped balances are unavailable or stale',
      });
    }

    const candidates = this.buildBestCapacityCandidates(
      params,
      price,
      feeBufferRate,
      snapshot,
      { bestBid, bestAsk, referencePrice: price },
      {
        makerFeeRate: new BigNumber(makerFee),
        takerFeeRate: new BigNumber(takerFee),
      },
    );

    for (const candidate of candidates) {
      const plan = this.buildReadinessExecutablePlan(
        params,
        candidate,
        price,
        bestBid,
        bestAsk,
        feeBufferRate,
        rules,
        assets,
      );

      if (!plan) {
        continue;
      }

      const estimatedCycles = plan.recommendedCycleQty.isGreaterThan(0)
        ? candidate.capacity
            .dividedBy(plan.recommendedCycleQty)
            .integerValue(BigNumber.ROUND_FLOOR)
        : new BigNumber(0);
      const estimatedBaseAmount =
        plan.recommendedCycleQty.multipliedBy(estimatedCycles);
      const estimatedQuoteAmount = estimatedBaseAmount.multipliedBy(plan.price);

      return {
        canStart: true,
        mode,
        bestFirstAction: {
          makerAccountLabel: candidate.makerAccountLabel,
          takerAccountLabel: candidate.takerAccountLabel,
          side: candidate.side,
          baseAsset: assets.base,
          quoteAsset: assets.quote,
          quantity: plan.recommendedCycleQty.toFixed(),
          price: plan.price.toFixed(),
          notional: plan.recommendedCycleQty.multipliedBy(plan.price).toFixed(),
        },
        maximumCycleQty: plan.maximumCycleQty.toFixed(),
        recommendedCycleQty: plan.recommendedCycleQty.toFixed(),
        minimumCapitalByAccountAsset: plan.minimumCapital,
        recommendedCapitalByAccountAsset: plan.recommendedCapital,
        missingBalances: [],
        estimatedCycles: {
          count: estimatedCycles.toFixed(),
          basis: 'current_available_balances',
        },
        estimatedVolume: {
          baseAsset: assets.base,
          quoteAsset: assets.quote,
          baseAmount: estimatedBaseAmount.toFixed(),
          quoteAmount: estimatedQuoteAmount.toFixed(),
        },
        blockingReasons: [],
      };
    }

    const missingBalances = this.pickBestReadinessMissingBalances(
      params,
      snapshot,
      price,
      feeBufferRate,
      rules,
      assets,
    );

    return {
      ...this.buildBlockedReadiness(params, mode, {
        code: 'below_exchange_minimums',
        message:
          'No dual-account role/direction candidate satisfies exchange minimums with the current balances',
      }),
      missingBalances,
    };
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

    const intent = this.strategyIntentStoreService.createLimitOrderIntent(
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

    return this.attachCycleLinkedIntentMetadata(intent);
  }

  private attachCycleLinkedIntentMetadata(
    intent: ExecutorAction,
  ): ExecutorAction {
    const metadata =
      intent.metadata && typeof intent.metadata === 'object'
        ? (intent.metadata as Record<string, unknown>)
        : undefined;

    if (!metadata?.cycleId) {
      return intent;
    }

    return {
      ...intent,
      metadata: {
        ...metadata,
        linkedIntentId: this.readString(
          metadata.linkedIntentId,
          intent.intentId,
        ),
        linkedTrackedOrderId: metadata.linkedTrackedOrderId ?? null,
      },
    };
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
          cycleRole: 'maker',
          accountLabel: resolvedAccounts.makerAccountLabel,
          side,
          plannedQty: adjustedQuote.qty.toFixed(),
          plannedPrice: adjustedQuote.price.toFixed(),
          filledQty: '0',
          notional: estimatedLegNotional.toFixed(),
          status: 'planned',
          failureReason: null,
          linkedIntentId: null,
          linkedTrackedOrderId: null,
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
      { bestBid: bestBidBn, bestAsk: bestAskBn, referencePrice: price },
      this.resolveCachedDualAccountFeeRates(
        params.exchangeName,
        params.symbol,
        params.makerAccountLabel,
        feeBufferRate,
      ),
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
          cycleRole: 'maker',
          accountLabel: resolvedAccounts.makerAccountLabel,
          side,
          plannedQty: adjustedQuote.qty.toFixed(),
          plannedPrice: adjustedQuote.price.toFixed(),
          filledQty: '0',
          notional: estimatedLegNotional.toFixed(),
          status: 'planned',
          failureReason: null,
          linkedIntentId: null,
          linkedTrackedOrderId: null,
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
      'mode' | 'targetQuoteVolume' | 'totalMatchedQuoteVolume'
    >,
    candidate: Pick<
      DualAccountBestCapacityCandidate,
      | 'capacity'
      | 'quoteVolume'
      | 'futureOppositeCapacity'
      | 'nextCycleQuoteCapacity'
      | 'estimatedFeeQuote'
      | 'estimatedSpreadCostQuote'
      | 'rebalanceRiskQuote'
      | 'dustRiskQuote'
      | 'imbalanceRatio'
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

    const executionAttempts = this.buildExecutionVarianceAttempts(
      params,
      profile,
      price,
      tradeAmountVarianceSample,
    );

    for (const attempt of executionAttempts) {
      if (
        !attempt.requestedQty.isFinite() ||
        attempt.requestedQty.isLessThanOrEqualTo(0) ||
        !attempt.price.isFinite() ||
        attempt.price.isLessThanOrEqualTo(0)
      ) {
        this.logger.warn(
          `Dual-account volume ${strategyKey}: invalid ${
            attempt.reason
          } qty ${attempt.requestedQty.toFixed()} price ${attempt.price.toFixed()} for side=${side}`,
        );
        continue;
      }

      const adjustedQuote = await this.quantizeAndAdaptDualAccountQuote(
        strategyKey,
        params,
        side,
        attempt.price,
        attempt.requestedQty,
        resolvedAccounts,
        bestBid,
        bestAsk,
        feeBufferRate,
      );

      if (!adjustedQuote) {
        continue;
      }

      return {
        side,
        resolvedAccounts,
        profile,
        requestedQty: attempt.requestedQty,
        adjustedQuote,
        sideReason: 'preferred_side_tradable',
      };
    }

    this.logger.warn(
      `Dual-account volume ${strategyKey}: no valid variance-safe qty/price found for side=${side}`,
    );

    return null;
  }

  private buildExecutionVarianceAttempts(
    params: DualAccountVolumeStrategyParams,
    profile: DualAccountBehaviorProfile,
    price: BigNumber,
    tradeAmountVarianceSample: number,
  ): Array<{
    requestedQty: BigNumber;
    price: BigNumber;
    reason: 'variance_sample' | 'variance_resample' | 'deterministic';
  }> {
    const isBestCapacity = this.isBestCapacityConfig(params);
    const baseQty = isBestCapacity
      ? Number(params.maxOrderAmount || 0)
      : Number(params.baseTradeAmount || 0);
    const tradeVariance =
      profile.tradeAmountVariance ?? params.tradeAmountVariance;
    const priceVariance =
      profile.priceOffsetVariance ?? params.priceOffsetVariance;
    const deterministicQty = new BigNumber(
      this.applyVariance(baseQty, undefined, profile.tradeAmountMultiplier),
    );
    const deterministicPrice = new BigNumber(
      this.applyVariance(
        price.toNumber(),
        undefined,
        profile.priceOffsetMultiplier,
      ),
    );

    if (
      !isBestCapacity ||
      ((!tradeVariance || tradeVariance <= 0) &&
        (!priceVariance || priceVariance <= 0))
    ) {
      return [
        {
          requestedQty: new BigNumber(
            this.applyVariance(
              baseQty,
              tradeVariance,
              profile.tradeAmountMultiplier,
              tradeAmountVarianceSample,
            ),
          ),
          price: deterministicPrice,
          reason:
            tradeVariance || priceVariance
              ? 'variance_sample'
              : 'deterministic',
        },
      ];
    }

    const buildAttempt = (
      reason: 'variance_sample' | 'variance_resample',
      qtySample: number,
      priceSample: number,
    ): {
      requestedQty: BigNumber;
      price: BigNumber;
      reason: 'variance_sample' | 'variance_resample';
    } => ({
      requestedQty: new BigNumber(
        this.applyVariance(
          baseQty,
          tradeVariance,
          profile.tradeAmountMultiplier,
          qtySample,
        ),
      ),
      price: new BigNumber(
        this.applyVariance(
          price.toNumber(),
          priceVariance,
          profile.priceOffsetMultiplier,
          priceSample,
        ),
      ),
      reason,
    });

    return [
      buildAttempt('variance_sample', tradeAmountVarianceSample, Math.random()),
      buildAttempt('variance_resample', Math.random(), Math.random()),
      {
        requestedQty: deterministicQty,
        price: deterministicPrice,
        reason: 'deterministic',
      },
    ];
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
    const rules =
      this.getCachedDualAccountTradingRules(
        params.exchangeName,
        params.symbol,
        resolvedAccounts.makerAccountLabel,
      ) || {};
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
    feeBufferRate: BigNumber,
    roleAssignment: 'configured' | 'swapped',
    marketContext?: DualAccountBestCapacityMarketContext,
    feeRates?: DualAccountBestCapacityFeeRates,
  ): Omit<DualAccountBestCapacityCandidate, 'candidateRank'> {
    const normalizedFeeRates = this.normalizeBestCapacityFeeRates(
      feeBufferRate,
      feeRates,
    );
    const capacity = this.computeCapacity(
      makerBalances,
      takerBalances,
      side,
      price,
      normalizedFeeRates.totalFeeRate,
    );
    const postCycleBalances = this.simulatePostCycleBalances(
      side,
      makerBalances,
      takerBalances,
      capacity,
      price,
      normalizedFeeRates.makerFeeRate,
      normalizedFeeRates.takerFeeRate,
    );
    const futureOppositeCapacity = this.computeCapacity(
      postCycleBalances.makerBalances,
      postCycleBalances.takerBalances,
      side === 'buy' ? 'sell' : 'buy',
      price,
      normalizedFeeRates.totalFeeRate,
    );
    const quoteVolume = this.toPositiveFiniteBigNumber(
      capacity.multipliedBy(price),
    );
    const nextCycleQuoteCapacity = this.toPositiveFiniteBigNumber(
      futureOppositeCapacity.multipliedBy(price),
    );
    const estimatedFeeQuote = quoteVolume.multipliedBy(
      normalizedFeeRates.totalFeeRate.isFinite() &&
        normalizedFeeRates.totalFeeRate.isGreaterThan(0)
        ? normalizedFeeRates.totalFeeRate
        : 0,
    );
    const estimatedSpreadCostQuote = this.computeEstimatedSpreadCostQuote(
      side,
      price,
      quoteVolume,
      marketContext,
    );
    const rebalanceRiskQuote = this.computeRebalanceRiskQuote(
      quoteVolume,
      nextCycleQuoteCapacity,
      this.computeImbalanceRatio(capacity, futureOppositeCapacity),
    );
    const dustRiskQuote = this.computeDustRiskQuote(
      params,
      quoteVolume,
      normalizedFeeRates.totalFeeRate,
    );
    const imbalanceRatio = this.computeImbalanceRatio(
      capacity,
      futureOppositeCapacity,
    );

    return {
      side,
      makerAccountLabel,
      takerAccountLabel,
      makerBalances,
      takerBalances,
      capacity,
      quoteVolume,
      futureOppositeCapacity,
      nextCycleQuoteCapacity,
      estimatedFeeQuote,
      estimatedSpreadCostQuote,
      rebalanceRiskQuote,
      dustRiskQuote,
      imbalanceRatio,
      roleAssignment,
    };
  }

  private normalizeBestCapacityFeeRates(
    feeBufferRate: BigNumber,
    feeRates?: DualAccountBestCapacityFeeRates,
  ): {
    makerFeeRate: BigNumber;
    takerFeeRate: BigNumber;
    totalFeeRate: BigNumber;
  } {
    const fallbackTotalFeeRate = this.readFiniteBigNumber(
      feeBufferRate,
      new BigNumber(0),
    );
    const fallbackLegFeeRate = fallbackTotalFeeRate.dividedBy(2);
    const makerFeeRate = this.toNonNegativeFiniteBigNumber(
      feeRates?.makerFeeRate,
      fallbackLegFeeRate,
    );
    const takerFeeRate = this.toNonNegativeFiniteBigNumber(
      feeRates?.takerFeeRate,
      fallbackLegFeeRate,
    );

    return {
      makerFeeRate,
      takerFeeRate,
      totalFeeRate: makerFeeRate.plus(takerFeeRate),
    };
  }

  private simulatePostCycleBalances(
    side: 'buy' | 'sell',
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    qty: BigNumber,
    price: BigNumber,
    makerFeeRate: BigNumber,
    takerFeeRate: BigNumber,
  ): DualAccountBalanceSnapshot {
    if (
      !qty.isFinite() ||
      qty.isLessThanOrEqualTo(0) ||
      !price.isFinite() ||
      price.isLessThanOrEqualTo(0)
    ) {
      return { makerBalances, takerBalances };
    }

    const notional = qty.multipliedBy(price);
    const makerFeeQuote = notional.multipliedBy(makerFeeRate);
    const takerFeeQuote = notional.multipliedBy(takerFeeRate);

    if (side === 'buy') {
      return {
        makerBalances: {
          ...makerBalances,
          base: makerBalances.base.plus(qty),
          quote: this.subtractNonNegative(
            makerBalances.quote,
            notional.plus(makerFeeQuote),
          ),
        },
        takerBalances: {
          ...takerBalances,
          base: this.subtractNonNegative(takerBalances.base, qty),
          quote: takerBalances.quote.plus(
            BigNumber.max(notional.minus(takerFeeQuote), 0),
          ),
        },
      };
    }

    return {
      makerBalances: {
        ...makerBalances,
        base: this.subtractNonNegative(makerBalances.base, qty),
        quote: makerBalances.quote.plus(
          BigNumber.max(notional.minus(makerFeeQuote), 0),
        ),
      },
      takerBalances: {
        ...takerBalances,
        base: takerBalances.base.plus(qty),
        quote: this.subtractNonNegative(
          takerBalances.quote,
          notional.plus(takerFeeQuote),
        ),
      },
    };
  }

  private computeEstimatedSpreadCostQuote(
    side: 'buy' | 'sell',
    price: BigNumber,
    quoteVolume: BigNumber,
    marketContext?: DualAccountBestCapacityMarketContext,
  ): BigNumber {
    if (
      !marketContext ||
      !price.isFinite() ||
      price.isLessThanOrEqualTo(0) ||
      !quoteVolume.isFinite() ||
      quoteVolume.isLessThanOrEqualTo(0)
    ) {
      return new BigNumber(0);
    }

    const referencePrice = this.resolveSpreadReferencePrice(marketContext);
    const bookBoundaryPrice =
      side === 'buy'
        ? this.toPositiveFiniteBigNumber(marketContext.bestBid)
        : this.toPositiveFiniteBigNumber(marketContext.bestAsk);

    if (
      !referencePrice.isGreaterThan(0) &&
      !bookBoundaryPrice.isGreaterThan(0)
    ) {
      return new BigNumber(0);
    }

    const executionQty = quoteVolume.dividedBy(price);
    const referencePenalty = referencePrice.isGreaterThan(0)
      ? side === 'buy'
        ? price.minus(referencePrice)
        : referencePrice.minus(price)
      : new BigNumber(0);
    const bookPenalty = bookBoundaryPrice.isGreaterThan(0)
      ? side === 'buy'
        ? price.minus(bookBoundaryPrice)
        : bookBoundaryPrice.minus(price)
      : new BigNumber(0);
    const unfavorablePriceDistance = BigNumber.max(
      referencePenalty,
      bookPenalty,
      0,
    );

    return unfavorablePriceDistance.isGreaterThan(0)
      ? unfavorablePriceDistance.multipliedBy(executionQty)
      : new BigNumber(0);
  }

  private resolveSpreadReferencePrice(
    marketContext: DualAccountBestCapacityMarketContext,
  ): BigNumber {
    const explicitReference = this.toPositiveFiniteBigNumber(
      marketContext.referencePrice,
    );

    if (explicitReference.isGreaterThan(0)) {
      return explicitReference;
    }

    const bestBid = this.toPositiveFiniteBigNumber(marketContext.bestBid);
    const bestAsk = this.toPositiveFiniteBigNumber(marketContext.bestAsk);

    return bestBid.isGreaterThan(0) && bestAsk.isGreaterThan(bestBid)
      ? bestBid.plus(bestAsk).dividedBy(2)
      : new BigNumber(0);
  }

  private subtractNonNegative(value: BigNumber, delta: BigNumber): BigNumber {
    return BigNumber.max(value.minus(delta), 0);
  }

  private computeRebalanceRiskQuote(
    quoteVolume: BigNumber,
    nextCycleQuoteCapacity: BigNumber,
    imbalanceRatio: BigNumber,
  ): BigNumber {
    if (
      !quoteVolume.isFinite() ||
      quoteVolume.isLessThanOrEqualTo(0) ||
      !imbalanceRatio.isFinite() ||
      imbalanceRatio.isLessThanOrEqualTo(1)
    ) {
      return new BigNumber(0);
    }

    const missingOppositeCapacity = BigNumber.max(
      quoteVolume.minus(nextCycleQuoteCapacity),
      0,
    );

    return missingOppositeCapacity.plus(
      quoteVolume.multipliedBy(imbalanceRatio.minus(1)).dividedBy(10),
    );
  }

  private computeDustRiskQuote(
    params: Pick<DualAccountVolumeStrategyParams, 'safetyBuffer'>,
    quoteVolume: BigNumber,
    feeBufferRate: BigNumber,
  ): BigNumber {
    const safetyBufferQuote = this.computeSafetyBufferQuote(
      params,
      new BigNumber(0),
      quoteVolume,
      feeBufferRate,
    );

    if (
      !quoteVolume.isFinite() ||
      quoteVolume.isLessThanOrEqualTo(0) ||
      quoteVolume.isGreaterThanOrEqualTo(safetyBufferQuote)
    ) {
      return new BigNumber(0);
    }

    return safetyBufferQuote.minus(quoteVolume);
  }

  private computeSafetyBufferQuote(
    params: Pick<DualAccountVolumeStrategyParams, 'safetyBuffer'>,
    exchangeCostMin: BigNumber,
    cycleNotional: BigNumber,
    feeBufferRate: BigNumber,
  ): BigNumber {
    const safetyBuffer = this.resolveSafetyBuffer(params.safetyBuffer);
    const exchangeMinimumBranch = this.readFiniteBigNumber(
      exchangeCostMin,
      new BigNumber(0),
    ).multipliedBy(safetyBuffer.exchangeCostMinMultiplier);
    const feeBranch = this.readFiniteBigNumber(cycleNotional, new BigNumber(0))
      .multipliedBy(
        feeBufferRate.isFinite() && feeBufferRate.isGreaterThan(0)
          ? feeBufferRate
          : 0,
      )
      .multipliedBy(safetyBuffer.feeCostMultiplier);

    return BigNumber.max(exchangeMinimumBranch, feeBranch);
  }

  private resolveSafetyBuffer(
    safetyBuffer?: DualAccountSafetyBufferConfig,
  ): DualAccountSafetyBufferConfig {
    return safetyBuffer || dualAccountConfig.DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER;
  }

  private readFiniteBigNumber(
    value: BigNumber,
    fallback: BigNumber,
  ): BigNumber {
    return value?.isFinite() ? value : fallback;
  }

  private toPositiveFiniteBigNumber(value?: BigNumber): BigNumber {
    return value?.isFinite() && value.isGreaterThan(0)
      ? value
      : new BigNumber(0);
  }

  private toNonNegativeFiniteBigNumber(
    value: BigNumber | undefined,
    fallback: BigNumber,
  ): BigNumber {
    if (!value?.isFinite()) {
      return fallback.isFinite() && fallback.isGreaterThan(0)
        ? fallback
        : new BigNumber(0);
    }

    return value.isGreaterThan(0) ? value : new BigNumber(0);
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

  private resolveBestCapacityMode(
    mode: EfficientDualAccountVolumeMode | undefined,
  ): EfficientDualAccountVolumeMode {
    return mode && MODE_AWARE_BEST_CAPACITY_WEIGHTS[mode] ? mode : 'balanced';
  }

  private getCachedReadinessTradingRules(
    params: DualAccountVolumeStrategyParams,
  ):
    | {
        amountMin?: number;
        amountMax?: number;
        costMin?: number;
        costMax?: number;
        makerFee?: number;
        takerFee?: number;
      }
    | undefined {
    return this.getCachedDualAccountTradingRules(
      params.exchangeName,
      params.symbol,
      params.makerAccountLabel,
    );
  }

  private getCachedDualAccountTradingRules(
    exchangeName: string,
    pair: string,
    accountLabel?: string,
  ):
    | {
        amountMin?: number;
        amountMax?: number;
        costMin?: number;
        costMax?: number;
        makerFee?: number;
        takerFee?: number;
      }
    | undefined {
    const connector = this.exchangeConnectorAdapterService as
      | (ExchangeConnectorAdapterService & {
          getCachedTradingRules?: (
            exchangeName: string,
            pair: string,
            accountLabel?: string,
          ) => {
            amountMin?: number;
            amountMax?: number;
            costMin?: number;
            costMax?: number;
            makerFee?: number;
            takerFee?: number;
          } | null;
        })
      | undefined;

    return (
      connector?.getCachedTradingRules?.(exchangeName, pair, accountLabel) ||
      connector?.getCachedTradingRules?.(exchangeName, pair) ||
      undefined
    );
  }

  private resolveCachedDualAccountFeeRates(
    exchangeName: string,
    pair: string,
    accountLabel: string | undefined,
    fallbackFeeBufferRate: BigNumber,
  ): DualAccountBestCapacityFeeRates {
    const rules = this.getCachedDualAccountTradingRules(
      exchangeName,
      pair,
      accountLabel,
    );
    const makerFeeRate = this.readPositiveBigNumber(rules?.makerFee);
    const takerFeeRate = this.readPositiveBigNumber(rules?.takerFee);

    const fallbackLegFeeRate = this.readFiniteBigNumber(
      fallbackFeeBufferRate,
      new BigNumber(0),
    ).dividedBy(2);

    if (makerFeeRate || takerFeeRate) {
      return {
        makerFeeRate: makerFeeRate || fallbackLegFeeRate,
        takerFeeRate: takerFeeRate || fallbackLegFeeRate,
      };
    }

    return {
      makerFeeRate: fallbackLegFeeRate,
      takerFeeRate: fallbackLegFeeRate,
    };
  }

  private buildReadinessExecutablePlan(
    params: DualAccountVolumeStrategyParams,
    candidate: DualAccountBestCapacityCandidate,
    price: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    feeBufferRate: BigNumber,
    rules: {
      amountMin?: number;
      amountMax?: number;
      costMin?: number;
      costMax?: number;
    },
    assets: { base: string; quote: string },
  ): {
    price: BigNumber;
    maximumCycleQty: BigNumber;
    recommendedCycleQty: BigNumber;
    minimumCapital: DualAccountReadinessCapitalRequirement[];
    recommendedCapital: DualAccountReadinessCapitalRequirement[];
  } | null {
    let effectivePrice = price;
    const requestedQty =
      this.readPositiveBigNumber(params.maxOrderAmount) ||
      this.readPositiveBigNumber(params.baseTradeAmount) ||
      new BigNumber(0);
    const amountMin = this.readPositiveBigNumber(rules.amountMin);
    const costMin = this.readPositiveBigNumber(rules.costMin);
    const amountMax = this.readPositiveBigNumber(rules.amountMax);
    const costMax = this.readPositiveBigNumber(rules.costMax);
    const minExecutableQty = BigNumber.max(
      amountMin || 0,
      costMin && effectivePrice.isGreaterThan(0)
        ? costMin.dividedBy(effectivePrice)
        : 0,
    );
    let maximumCycleQty = candidate.capacity;

    if (amountMax && maximumCycleQty.isGreaterThan(amountMax)) {
      maximumCycleQty = amountMax;
    }
    if (costMax && effectivePrice.isGreaterThan(0)) {
      maximumCycleQty = BigNumber.min(
        maximumCycleQty,
        costMax.dividedBy(effectivePrice),
      );
    }

    let recommendedCycleQty = requestedQty.isGreaterThan(0)
      ? BigNumber.min(requestedQty, maximumCycleQty)
      : maximumCycleQty;

    if (
      !recommendedCycleQty.isFinite() ||
      recommendedCycleQty.isLessThan(minExecutableQty) ||
      recommendedCycleQty.isLessThanOrEqualTo(0)
    ) {
      return null;
    }

    if (this.exchangeConnectorAdapterService) {
      try {
        const quantized = this.exchangeConnectorAdapterService.quantizeOrder(
          params.exchangeName,
          params.symbol,
          recommendedCycleQty.toFixed(),
          effectivePrice.toFixed(),
          candidate.makerAccountLabel,
        );

        recommendedCycleQty = new BigNumber(quantized.qty);
        effectivePrice = new BigNumber(quantized.price);
      } catch {
        return null;
      }
    }

    if (
      !effectivePrice.isFinite() ||
      effectivePrice.isLessThanOrEqualTo(0) ||
      !recommendedCycleQty.isFinite() ||
      recommendedCycleQty.isLessThanOrEqualTo(0) ||
      recommendedCycleQty.isLessThan(minExecutableQty) ||
      recommendedCycleQty.multipliedBy(effectivePrice).isLessThan(costMin || 0)
    ) {
      return null;
    }

    const normalizedPrice = this.normalizeMakerPrice(
      'readiness',
      params,
      candidate.side,
      recommendedCycleQty,
      effectivePrice,
      candidate.makerAccountLabel,
      bestBid,
      bestAsk,
    );

    if (!normalizedPrice) {
      return null;
    }
    effectivePrice = normalizedPrice;

    const quoteRequirements = this.buildReadinessCapitalRequirements(
      candidate.side,
      candidate.makerAccountLabel,
      candidate.takerAccountLabel,
      minExecutableQty,
      effectivePrice,
      feeBufferRate,
      params,
      rules,
      assets,
    );
    const recommendedRequirements = this.buildReadinessCapitalRequirements(
      candidate.side,
      candidate.makerAccountLabel,
      candidate.takerAccountLabel,
      recommendedCycleQty,
      effectivePrice,
      feeBufferRate,
      params,
      rules,
      assets,
    );

    return {
      price: effectivePrice,
      maximumCycleQty,
      recommendedCycleQty,
      minimumCapital: quoteRequirements.map((requirement) => ({
        accountLabel: requirement.accountLabel,
        asset: requirement.asset,
        amount: requirement.minimumUsefulAmount.toFixed(),
      })),
      recommendedCapital: recommendedRequirements.map((requirement) => ({
        accountLabel: requirement.accountLabel,
        asset: requirement.asset,
        amount: requirement.minimumUsefulAmount.toFixed(),
      })),
    };
  }

  private pickBestReadinessMissingBalances(
    params: DualAccountVolumeStrategyParams,
    snapshot: DualAccountBalanceSnapshot,
    price: BigNumber,
    feeBufferRate: BigNumber,
    rules: { amountMin?: number; costMin?: number },
    assets: { base: string; quote: string },
  ): DualAccountReadinessMissingBalance[] {
    const sides: Array<'buy' | 'sell'> = ['buy', 'sell'];
    const roleAssignments = [
      {
        makerAccountLabel: params.makerAccountLabel,
        takerAccountLabel: params.takerAccountLabel,
        makerBalances: snapshot.makerBalances,
        takerBalances: snapshot.takerBalances,
      },
      {
        makerAccountLabel: params.takerAccountLabel,
        takerAccountLabel: params.makerAccountLabel,
        makerBalances: snapshot.takerBalances,
        takerBalances: snapshot.makerBalances,
      },
    ];
    let best: {
      missing: DualAccountReadinessMissingBalance[];
      quoteNormalizedMissing: BigNumber;
    } | null = null;

    for (const roleAssignment of roleAssignments) {
      for (const side of sides) {
        const missing = this.buildReadinessMissingBalances(
          side,
          roleAssignment.makerAccountLabel,
          roleAssignment.takerAccountLabel,
          roleAssignment.makerBalances,
          roleAssignment.takerBalances,
          price,
          feeBufferRate,
          params,
          rules,
          assets,
        );
        const quoteNormalizedMissing = missing.reduce((total, entry) => {
          const amount = new BigNumber(entry.missingAmount);

          return total.plus(
            entry.asset === assets.base ? amount.multipliedBy(price) : amount,
          );
        }, new BigNumber(0));

        if (
          missing.length &&
          (!best ||
            quoteNormalizedMissing.isLessThan(best.quoteNormalizedMissing))
        ) {
          best = { missing, quoteNormalizedMissing };
        }
      }
    }

    return best?.missing || [];
  }

  private buildReadinessMissingBalances(
    side: 'buy' | 'sell',
    makerAccountLabel: string,
    takerAccountLabel: string,
    makerBalances: DualAccountPairBalances,
    takerBalances: DualAccountPairBalances,
    price: BigNumber,
    feeBufferRate: BigNumber,
    params: Pick<DualAccountVolumeStrategyParams, 'safetyBuffer'>,
    rules: { amountMin?: number; costMin?: number },
    assets: { base: string; quote: string },
  ): DualAccountReadinessMissingBalance[] {
    return this.buildReadinessCapitalRequirements(
      side,
      makerAccountLabel,
      takerAccountLabel,
      BigNumber.max(
        this.readPositiveBigNumber(rules.amountMin) || 0,
        this.readPositiveBigNumber(rules.costMin) && price.isGreaterThan(0)
          ? (this.readPositiveBigNumber(rules.costMin) as BigNumber).dividedBy(
              price,
            )
          : 0,
      ),
      price,
      feeBufferRate,
      params,
      rules,
      assets,
    )
      .map((requirement) => {
        const availableAmount =
          requirement.accountLabel === makerAccountLabel
            ? requirement.asset === assets.base
              ? makerBalances.base
              : makerBalances.quote
            : requirement.asset === assets.base
            ? takerBalances.base
            : takerBalances.quote;
        const missingAmount = BigNumber.max(
          requirement.minimumUsefulAmount.minus(availableAmount),
          0,
        );

        return {
          accountLabel: requirement.accountLabel,
          asset: requirement.asset,
          availableAmount: availableAmount.toFixed(),
          minimumUsefulAmount: requirement.minimumUsefulAmount.toFixed(),
          missingAmount: missingAmount.toFixed(),
        };
      })
      .filter((entry) => new BigNumber(entry.missingAmount).isGreaterThan(0));
  }

  private buildReadinessCapitalRequirements(
    side: 'buy' | 'sell',
    makerAccountLabel: string,
    takerAccountLabel: string,
    qty: BigNumber,
    price: BigNumber,
    feeBufferRate: BigNumber,
    params: Pick<DualAccountVolumeStrategyParams, 'safetyBuffer'>,
    rules: { costMin?: number },
    assets: { base: string; quote: string },
  ): Array<{
    accountLabel: string;
    asset: string;
    minimumUsefulAmount: BigNumber;
  }> {
    const notional = qty.multipliedBy(price);
    const quoteSafetyBuffer = this.computeSafetyBufferQuote(
      params,
      this.readPositiveBigNumber(rules.costMin) || new BigNumber(0),
      notional,
      feeBufferRate,
    );
    const quoteRequired = notional.plus(quoteSafetyBuffer);

    return side === 'buy'
      ? [
          {
            accountLabel: makerAccountLabel,
            asset: assets.quote,
            minimumUsefulAmount: quoteRequired,
          },
          {
            accountLabel: takerAccountLabel,
            asset: assets.base,
            minimumUsefulAmount: qty,
          },
        ]
      : [
          {
            accountLabel: makerAccountLabel,
            asset: assets.base,
            minimumUsefulAmount: qty,
          },
          {
            accountLabel: takerAccountLabel,
            asset: assets.quote,
            minimumUsefulAmount: quoteRequired,
          },
        ];
  }

  private buildBlockedReadiness(
    params: Pick<DualAccountVolumeStrategyParams, 'symbol' | 'pair'>,
    mode: EfficientDualAccountVolumeMode,
    reason: DualAccountReadinessBlockingReason,
  ): DualAccountReadinessResult {
    const assets = this.parseBaseQuote(params.symbol || params.pair || '') || {
      base: '',
      quote: '',
    };

    return {
      canStart: false,
      mode,
      bestFirstAction: null,
      maximumCycleQty: '0',
      recommendedCycleQty: '0',
      minimumCapitalByAccountAsset: [],
      recommendedCapitalByAccountAsset: [],
      missingBalances: [],
      estimatedCycles: {
        count: '0',
        basis: 'current_available_balances',
      },
      estimatedVolume: {
        baseAsset: assets.base,
        quoteAsset: assets.quote,
        baseAmount: '0',
        quoteAmount: '0',
      },
      blockingReasons: [reason],
    };
  }

  private parseBaseQuote(pair: string): { base: string; quote: string } | null {
    const [base, quote] = String(pair || '').split('/');

    if (!base || !quote) {
      return null;
    }

    return { base, quote };
  }

  private readPositiveFiniteNumber(value: unknown): number | null {
    const amount = this.readPositiveBigNumber(value);

    return amount ? amount.toNumber() : null;
  }

  private readPositiveBigNumber(value: unknown): BigNumber | null {
    const amount = new BigNumber(String(value ?? ''));

    return amount.isFinite() && amount.isGreaterThan(0) ? amount : null;
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

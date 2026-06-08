import BigNumber from 'bignumber.js';

import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import type {
  DualAccountBestCapacityCandidate,
  DualAccountPairBalances,
  DualAccountVolumeStrategyParams,
} from '../config/strategy-params.types';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { QuotePlannerService } from '../quote/quote-planner.service';
import { DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER } from './dual-account-config';
import { DualAccountPlannerService } from './dual-account-planner.service';

describe('DualAccountPlannerService efficient best-capacity planning', () => {
  const buildBalances = (
    base: number | string,
    quote: number | string,
  ): DualAccountPairBalances => ({
    base: new BigNumber(base),
    quote: new BigNumber(quote),
    assets: { base: 'BTC', quote: 'USDT' },
  });

  const baseParams: DualAccountVolumeStrategyParams = {
    exchangeName: 'binance',
    symbol: 'BTC/USDT',
    pair: 'BTC/USDT',
    marketMakingOrderId: 'mm-order-1',
    baseIncrementPercentage: 0,
    baseIntervalTime: 10,
    baseTradeAmount: 0.5,
    maxOrderAmount: 0.5,
    numTrades: 0,
    userId: 'user-1',
    clientId: 'client-1',
    pricePushRate: 0,
    executionCategory: 'clob_cex',
    executionVenue: 'cex',
    makerAccountLabel: 'account-a',
    takerAccountLabel: 'account-b',
    mode: 'balanced',
    strategyContract: 'efficientDualAccountVolume',
    safetyBuffer: DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER,
    cycleMode: 'alternating',
    dynamicRoleSwitching: true,
  };

  const buildPlanner = (options?: {
    balances?: Record<string, DualAccountPairBalances>;
    rules?: {
      amountMin?: number;
      amountMax?: number;
      costMin?: number;
      costMax?: number;
      makerFee?: number;
      takerFee?: number;
    };
    bestBid?: string;
    bestAsk?: string;
  }): {
    planner: DualAccountPlannerService;
    balanceQuery: { getAvailableBalancesForPair: jest.Mock };
    exchangeConnector: jest.Mocked<
      Pick<
        ExchangeConnectorAdapterService,
        | 'getCachedTradingRules'
        | 'loadTradingRules'
        | 'fetchOrderBook'
        | 'quantizeOrder'
      >
    > & {
      fetchBalance: jest.Mock;
      placeLimitOrder: jest.Mock;
      cancelOrder: jest.Mock;
    };
    intentStore: { createLimitOrderIntent: jest.Mock };
  } => {
    const rules = options?.rules || {
      amountMin: 0.001,
      costMin: 10,
      makerFee: 0.001,
      takerFee: 0.001,
    };
    const exchangeConnector = {
      getCachedTradingRules: jest.fn().mockReturnValue(rules),
      loadTradingRules: jest.fn().mockResolvedValue(rules),
      fetchOrderBook: jest.fn(),
      fetchBalance: jest.fn(),
      placeLimitOrder: jest.fn(),
      cancelOrder: jest.fn(),
      quantizeOrder: jest.fn(
        (_exchangeName: string, _pair: string, qty: string, price: string) => ({
          qty: new BigNumber(qty)
            .decimalPlaces(6, BigNumber.ROUND_DOWN)
            .toFixed(),
          price: new BigNumber(price)
            .decimalPlaces(2, BigNumber.ROUND_DOWN)
            .toFixed(),
        }),
      ),
    };
    const balances =
      options?.balances ||
      ({
        'account-a': buildBalances(10, 1_000),
        'account-b': buildBalances(10, 1_000),
      } satisfies Record<string, DualAccountPairBalances>);
    const balanceQuery = {
      getAvailableBalancesForPair: jest.fn(
        async (_exchangeName: string, _pair: string, accountLabel: string) =>
          balances[accountLabel],
      ),
    };
    const marketDataProvider = {
      getTrackedOrderBookFreshness: jest.fn(() => ({ fresh: true })),
      getTrackedBestBidAsk: jest.fn(() => ({
        bestBid: options?.bestBid || '99',
        bestAsk: options?.bestAsk || '101',
      })),
    };
    const intentStore = {
      createLimitOrderIntent: jest.fn(
        (
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
          executionCategory: string,
          metadata: Record<string, unknown>,
          postOnly?: boolean,
          accountLabel?: string,
          timeInForce?: 'GTC' | 'IOC',
        ) => ({
          type: 'CREATE_LIMIT_ORDER',
          intentId: `${strategyKey}:${suffix}`,
          runtimeInstanceKey,
          strategyKey,
          userId,
          clientId,
          exchange,
          pair,
          side,
          price: price.toFixed(),
          qty: qty.toFixed(),
          createdAt: ts,
          executionCategory,
          metadata,
          postOnly,
          accountLabel,
          timeInForce,
          status: 'NEW',
        }),
      ),
    };
    const quotePlanner = new QuotePlannerService(
      exchangeConnector as unknown as ExchangeConnectorAdapterService,
    );
    const planner = new DualAccountPlannerService(
      exchangeConnector as unknown as ExchangeConnectorAdapterService,
      balanceQuery as never,
      marketDataProvider as unknown as StrategyMarketDataProviderService,
      undefined,
      quotePlanner,
      intentStore as unknown as StrategyIntentStoreService,
    );

    return { planner, balanceQuery, exchangeConnector, intentStore };
  };

  const buildScoreCandidate = (
    label: string,
    quoteVolume: number,
    nextCycleQuoteCapacity: number,
    rankingCosts:
      | number
      | {
          rebalanceRiskQuote?: number;
          estimatedSpreadCostQuote?: number;
        } = 0,
  ): DualAccountBestCapacityCandidate & { label: string } => {
    const options =
      typeof rankingCosts === 'number'
        ? { rebalanceRiskQuote: rankingCosts }
        : rankingCosts;
    const capacity = new BigNumber(quoteVolume);
    const futureOppositeCapacity = new BigNumber(nextCycleQuoteCapacity);

    return {
      label,
      side: 'buy',
      makerAccountLabel: `${label}-maker`,
      takerAccountLabel: `${label}-taker`,
      makerBalances: buildBalances(100, 100),
      takerBalances: buildBalances(100, 100),
      capacity,
      quoteVolume: new BigNumber(quoteVolume),
      futureOppositeCapacity,
      nextCycleQuoteCapacity: new BigNumber(nextCycleQuoteCapacity),
      estimatedFeeQuote: new BigNumber(1),
      estimatedSpreadCostQuote: new BigNumber(
        options.estimatedSpreadCostQuote || 0,
      ),
      rebalanceRiskQuote: new BigNumber(options.rebalanceRiskQuote || 0),
      dustRiskQuote: new BigNumber(0),
      imbalanceRatio: new BigNumber(1),
      roleAssignment: 'configured',
      candidateRank: 0,
    };
  };

  it('constructs all four configured and swapped maker/taker direction candidates', () => {
    const { planner } = buildPlanner();
    const candidates = planner.buildBestCapacityCandidates(
      baseParams,
      new BigNumber(100),
      new BigNumber(0.002),
      {
        makerBalances: buildBalances(10, 1_000),
        takerBalances: buildBalances(10, 1_000),
      },
    );

    expect(candidates).toHaveLength(4);
    expect(
      candidates.map(
        (candidate) =>
          `${candidate.roleAssignment}:${candidate.makerAccountLabel}->${candidate.takerAccountLabel}:${candidate.side}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        'configured:account-a->account-b:buy',
        'configured:account-a->account-b:sell',
        'swapped:account-b->account-a:buy',
        'swapped:account-b->account-a:sell',
      ]),
    );
  });

  it('uses mode-aware quote-normalized scoring to choose different winners from one fixture', () => {
    const { planner } = buildPlanner();
    const candidates = [
      buildScoreCandidate('cheap-capital', 40, 120, 20),
      buildScoreCandidate('balanced', 70, 60),
      buildScoreCandidate('fast-volume', 110, 0),
    ];
    const selectWinner = (mode: DualAccountVolumeStrategyParams['mode']) =>
      candidates
        .map((candidate) => ({
          label: candidate.label,
          score: planner.scoreBestCapacityCandidate(
            { mode, targetQuoteVolume: 0, totalMatchedQuoteVolume: 0 },
            candidate,
            new BigNumber(1),
          ),
        }))
        .sort((left, right) => right.score.comparedTo(left.score))[0].label;

    expect(selectWinner('cheapest_capital')).toBe('cheap-capital');
    expect(selectWinner(undefined)).toBe('balanced');
    expect(selectWinner('balanced')).toBe('balanced');
    expect(selectWinner('fastest_volume')).toBe('fast-volume');
  });

  it('simulates post-cycle inventory and fees before scoring future capacity', () => {
    const { planner } = buildPlanner();
    const price = new BigNumber(100);
    const feeBufferRate = new BigNumber(0.002);
    const snapshot = {
      makerBalances: buildBalances(0, 100),
      takerBalances: buildBalances(1, 0),
    };
    const preCycleOppositeCapacity = planner.computeCapacity(
      snapshot.makerBalances,
      snapshot.takerBalances,
      'sell',
      price,
      feeBufferRate,
    );

    const candidate = planner
      .buildBestCapacityCandidates(baseParams, price, feeBufferRate, snapshot, {
        bestBid: new BigNumber(99),
        bestAsk: new BigNumber(101),
        referencePrice: price,
      })
      .find(
        (entry) =>
          entry.roleAssignment === 'configured' && entry.side === 'buy',
      );

    expect(preCycleOppositeCapacity.toFixed()).toBe('0');
    expect(candidate).toBeDefined();
    expect(
      (
        candidate as DualAccountBestCapacityCandidate
      ).nextCycleQuoteCapacity.isGreaterThan(0),
    ).toBe(true);
    expect(
      (
        candidate as DualAccountBestCapacityCandidate
      ).rebalanceRiskQuote.isLessThan(
        (candidate as DualAccountBestCapacityCandidate).quoteVolume,
      ),
    ).toBe(true);
  });

  it('computes deterministic spread cost and lets spread penalties affect ranking', () => {
    const { planner } = buildPlanner();
    const price = new BigNumber(100);
    const feeBufferRate = new BigNumber(0.002);
    const candidates = planner.buildBestCapacityCandidates(
      baseParams,
      price,
      feeBufferRate,
      {
        makerBalances: buildBalances(1, 100),
        takerBalances: buildBalances(1, 100),
      },
      {
        bestBid: new BigNumber(99),
        bestAsk: new BigNumber(101),
        referencePrice: price,
      },
    );
    const configuredBuy = candidates.find(
      (candidate) =>
        candidate.roleAssignment === 'configured' && candidate.side === 'buy',
    );

    expect(configuredBuy).toBeDefined();
    expect(
      (
        configuredBuy as DualAccountBestCapacityCandidate
      ).estimatedSpreadCostQuote.isGreaterThan(0),
    ).toBe(true);

    const rankingCandidates = [
      buildScoreCandidate('higher-volume-wide-spread', 100, 100, {
        estimatedSpreadCostQuote: 60,
      }),
      buildScoreCandidate('lower-volume-tight-spread', 80, 80),
    ];
    const selectWinner = (mode: DualAccountVolumeStrategyParams['mode']) =>
      rankingCandidates
        .map((candidate) => ({
          label: candidate.label,
          score: planner.scoreBestCapacityCandidate(
            { mode, targetQuoteVolume: 0, totalMatchedQuoteVolume: 0 },
            candidate,
            new BigNumber(1),
          ),
        }))
        .sort((left, right) => right.score.comparedTo(left.score))[0].label;

    expect(selectWinner('cheapest_capital')).toBe('lower-volume-tight-spread');
    expect(selectWinner('balanced')).toBe('lower-volume-tight-spread');
    expect(selectWinner('fastest_volume')).toBe('higher-volume-wide-spread');
  });

  it('emits the unified best-capacity path with all four candidates evaluated', async () => {
    const { planner } = buildPlanner();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      const actions = await planner.buildDualAccountBestCapacityVolumeActions(
        'strategy-1',
        baseParams,
        '2026-06-04T00:00:00.000Z',
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].metadata).toEqual(
        expect.objectContaining({
          cycleId: 'strategy-1:cycle:0:2026-06-04T00:00:00.000Z',
          cycleRole: 'maker',
          accountLabel: actions[0].accountLabel,
          side: actions[0].side,
          plannedQty: actions[0].qty,
          plannedPrice: actions[0].price,
          filledQty: '0',
          notional: '50',
          status: 'planned',
          failureReason: null,
          linkedIntentId: actions[0].intentId,
          linkedTrackedOrderId: null,
          selectionModel: 'best_capacity',
          candidateCount: 4,
        }),
      );
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('plans efficient cycles from order-scoped balances and cached rules without blocking exchange I/O', async () => {
    const { planner, balanceQuery, exchangeConnector } = buildPlanner();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      const actions = await planner.buildDualAccountBestCapacityVolumeActions(
        'architecture-strategy',
        baseParams,
        '2026-06-04T00:00:00.000Z',
      );

      expect(actions).toHaveLength(1);
      expect(balanceQuery.getAvailableBalancesForPair).toHaveBeenCalledWith(
        'binance',
        'BTC/USDT',
        'account-a',
        'mm-order-1:account-a',
      );
      expect(balanceQuery.getAvailableBalancesForPair).toHaveBeenCalledWith(
        'binance',
        'BTC/USDT',
        'account-b',
        'mm-order-1:account-b',
      );
      expect(exchangeConnector.getCachedTradingRules).toHaveBeenCalledWith(
        'binance',
        'BTC/USDT',
        undefined,
      );
      expect(exchangeConnector.loadTradingRules).not.toHaveBeenCalled();
      expect(exchangeConnector.fetchOrderBook).not.toHaveBeenCalled();
      expect(exchangeConnector.fetchBalance).not.toHaveBeenCalled();
      expect(exchangeConnector.placeLimitOrder).not.toHaveBeenCalled();
      expect(exchangeConnector.cancelOrder).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('rejects below-minimum cycle and dust rebalance attempts instead of scheduling actions', async () => {
    const { planner } = buildPlanner({
      balances: {
        'account-a': buildBalances(0.0005, 5),
        'account-b': buildBalances(0.0005, 5),
      },
      rules: {
        amountMin: 0.001,
        costMin: 10,
        makerFee: 0.001,
        takerFee: 0.001,
      },
    });
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      await expect(
        planner.buildDualAccountBestCapacityVolumeActions(
          'dust-strategy',
          {
            ...baseParams,
            baseTradeAmount: 0.0005,
            maxOrderAmount: 0.0005,
          },
          '2026-06-04T00:00:00.000Z',
        ),
      ).resolves.toEqual([]);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('does not schedule optimal volume when capacity falls below exchange notional minimum', async () => {
    const { planner, intentStore } = buildPlanner({
      bestBid: '53',
      bestAsk: '55',
      balances: {
        'account-a': buildBalances(0, 100),
        'account-b': buildBalances(0.017, 0),
      },
      rules: {
        amountMin: 0.001,
        costMin: 1,
        makerFee: 0.001,
        takerFee: 0.001,
      },
    });
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      await expect(
        planner.buildOptimalDualAccountVolumeActions(
          'xin-strategy',
          {
            ...baseParams,
            exchangeName: 'mexc',
            symbol: 'XIN/USDT',
            pair: 'XIN/USDT',
            baseTradeAmount: 0.02,
            maxOrderAmount: 0.02,
          },
          '2026-06-08T05:38:53.000Z',
        ),
      ).resolves.toEqual([]);
      expect(intentStore.createLimitOrderIntent).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('does not schedule dual-account execution when cached trading rules are unavailable at runtime', async () => {
    const { planner, exchangeConnector, intentStore } = buildPlanner();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    exchangeConnector.getCachedTradingRules.mockReturnValue(undefined);

    try {
      await expect(
        planner.buildDualAccountBestCapacityVolumeActions(
          'missing-rules-strategy',
          baseParams,
          '2026-06-04T00:00:00.000Z',
        ),
      ).resolves.toEqual([]);
      expect(exchangeConnector.loadTradingRules).not.toHaveBeenCalled();
      expect(intentStore.createLimitOrderIntent).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('resamples and then falls back when variance would push execution below exchange minimums', async () => {
    const { planner, exchangeConnector } = buildPlanner({
      balances: {
        'account-a': buildBalances(1, 1_000),
        'account-b': buildBalances(1, 1_000),
      },
      rules: {
        amountMin: 0.001,
        costMin: 10,
        makerFee: 0.001,
        takerFee: 0.001,
      },
    });
    const randomSpy = jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValue(0);

    try {
      const actions = await planner.buildDualAccountBestCapacityVolumeActions(
        'variance-strategy',
        {
          ...baseParams,
          maxOrderAmount: 0.11,
          baseTradeAmount: 0.11,
          tradeAmountVariance: 0.95,
        },
        '2026-06-04T00:00:00.000Z',
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].qty).toBe('0.11');
      expect(
        new BigNumber(actions[0].qty)
          .multipliedBy(actions[0].price)
          .isGreaterThanOrEqualTo(10),
      ).toBe(true);
      expect(
        exchangeConnector.quantizeOrder.mock.calls.some((call) =>
          new BigNumber(call[2]).isLessThan(0.01),
        ),
      ).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('computes both safety-buffer formula branches', () => {
    const { planner } = buildPlanner();
    const computeSafetyBufferQuote = (
      planner as unknown as {
        computeSafetyBufferQuote: (
          params: Pick<DualAccountVolumeStrategyParams, 'safetyBuffer'>,
          exchangeCostMin: BigNumber,
          cycleNotional: BigNumber,
          feeBufferRate: BigNumber,
        ) => BigNumber;
      }
    ).computeSafetyBufferQuote.bind(planner);

    expect(
      computeSafetyBufferQuote(
        baseParams,
        new BigNumber(10),
        new BigNumber(100),
        new BigNumber(0.001),
      ).toFixed(),
    ).toBe('5');
    expect(
      computeSafetyBufferQuote(
        baseParams,
        new BigNumber(10),
        new BigNumber(10_000),
        new BigNumber(0.001),
      ).toFixed(),
    ).toBe('20');
  });

  it('returns canStart true with a best first action for one-sided rotating inventory', async () => {
    const { planner, balanceQuery, exchangeConnector, intentStore } =
      buildPlanner({
        balances: {
          'account-a': buildBalances(0, 1_000),
          'account-b': buildBalances(1, 0),
        },
      });

    const readiness = await planner.evaluateEfficientDualAccountReadiness({
      ...baseParams,
      baseTradeAmount: 0.5,
      maxOrderAmount: 0.5,
    });

    expect(readiness).toEqual(
      expect.objectContaining({
        canStart: true,
        mode: 'balanced',
        maximumCycleQty: '1',
        recommendedCycleQty: '0.5',
        estimatedCycles: expect.objectContaining({
          count: expect.any(String),
        }),
        estimatedVolume: expect.objectContaining({
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
        }),
        bestFirstAction: expect.objectContaining({
          makerAccountLabel: 'account-a',
          takerAccountLabel: 'account-b',
          side: 'buy',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          quantity: '0.5',
          notional: '50',
        }),
      }),
    );
    expect(readiness.missingBalances).toEqual([]);
    expect(balanceQuery.getAvailableBalancesForPair).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'account-a',
      'mm-order-1:account-a',
    );
    expect(balanceQuery.getAvailableBalancesForPair).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'account-b',
      'mm-order-1:account-b',
    );
    expect(exchangeConnector.loadTradingRules).not.toHaveBeenCalled();
    expect(exchangeConnector.fetchOrderBook).not.toHaveBeenCalled();
    expect(exchangeConnector.fetchBalance).not.toHaveBeenCalled();
    expect(exchangeConnector.placeLimitOrder).not.toHaveBeenCalled();
    expect(exchangeConnector.cancelOrder).not.toHaveBeenCalled();
    expect(intentStore.createLimitOrderIntent).not.toHaveBeenCalled();
  });

  it('returns actionable missing balances when all readiness candidates are blocked', async () => {
    const { planner } = buildPlanner({
      balances: {
        'account-a': buildBalances(0, 4),
        'account-b': buildBalances(0, 0),
      },
    });

    const readiness = await planner.evaluateEfficientDualAccountReadiness({
      ...baseParams,
      baseTradeAmount: 0.5,
      maxOrderAmount: 0.5,
    });

    expect(readiness.canStart).toBe(false);
    expect(readiness.bestFirstAction).toBeNull();
    expect(readiness.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'below_exchange_minimums' }),
      ]),
    );
    expect(readiness.missingBalances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountLabel: 'account-a',
          asset: 'USDT',
          availableAmount: '4',
          minimumUsefulAmount: expect.any(String),
          missingAmount: expect.any(String),
        }),
        expect.objectContaining({
          accountLabel: 'account-b',
          asset: 'BTC',
          availableAmount: '0',
          minimumUsefulAmount: expect.any(String),
          missingAmount: expect.any(String),
        }),
      ]),
    );
    for (const missing of readiness.missingBalances) {
      expect(new BigNumber(missing.missingAmount).isGreaterThan(0)).toBe(true);
    }
  });

  it('blocks safely on stale market data without live exchange fallback', async () => {
    const { planner, exchangeConnector } = buildPlanner();
    const marketDataProvider = (
      planner as unknown as {
        strategyMarketDataProviderService: {
          getTrackedOrderBookFreshness: jest.Mock;
          getTrackedBestBidAsk: jest.Mock;
        };
      }
    ).strategyMarketDataProviderService;

    marketDataProvider.getTrackedOrderBookFreshness.mockReturnValue({
      fresh: false,
      ageMs: 60_000,
      freshnessTimestamp: '2026-06-04T00:00:00.000Z',
    });
    marketDataProvider.getTrackedBestBidAsk.mockReturnValue(null);

    const readiness = await planner.evaluateEfficientDualAccountReadiness(
      baseParams,
    );

    expect(readiness.canStart).toBe(false);
    expect(readiness.blockingReasons).toEqual([
      expect.objectContaining({ code: 'market_data_stale' }),
    ]);
    expect(exchangeConnector.fetchOrderBook).not.toHaveBeenCalled();
  });

  it('blocks safely when deterministic trading rules are unavailable', async () => {
    const { planner, exchangeConnector } = buildPlanner();

    exchangeConnector.getCachedTradingRules.mockReturnValue(undefined);

    const readiness = await planner.evaluateEfficientDualAccountReadiness(
      baseParams,
    );

    expect(readiness.canStart).toBe(false);
    expect(readiness.blockingReasons).toEqual([
      expect.objectContaining({ code: 'trading_rules_missing' }),
    ]);
    expect(exchangeConnector.loadTradingRules).not.toHaveBeenCalled();
  });

  it('allows valid zero maker or taker fee rates in readiness', async () => {
    const { planner, exchangeConnector } = buildPlanner({
      rules: {
        amountMin: 0.001,
        costMin: 10,
        makerFee: 0,
        takerFee: 0.001,
      },
    });

    const readiness = await planner.evaluateEfficientDualAccountReadiness(
      baseParams,
    );

    expect(readiness.blockingReasons).not.toContainEqual(
      expect.objectContaining({ code: 'fee_data_missing' }),
    );
    expect(exchangeConnector.loadTradingRules).not.toHaveBeenCalled();
  });
});

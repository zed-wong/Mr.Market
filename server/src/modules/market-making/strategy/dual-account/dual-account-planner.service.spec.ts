import BigNumber from 'bignumber.js';

import { ExchangeConnectorAdapterService } from '../../execution/exchange-connector-adapter.service';
import { StrategyMarketDataProviderService } from '../data/strategy-market-data-provider.service';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import { QuotePlannerService } from '../quote/quote-planner.service';
import type {
  DualAccountBestCapacityCandidate,
  DualAccountPairBalances,
  DualAccountVolumeStrategyParams,
} from '../config/strategy-params.types';
import { DualAccountPlannerService } from './dual-account-planner.service';
import { DEFAULT_DUAL_ACCOUNT_SAFETY_BUFFER } from './dual-account-config';

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
    exchangeConnector: jest.Mocked<
      Pick<ExchangeConnectorAdapterService, 'loadTradingRules' | 'quantizeOrder'>
    >;
    intentStore: { createLimitOrderIntent: jest.Mock };
  } => {
    const rules = options?.rules || {
      amountMin: 0.001,
      costMin: 10,
      makerFee: 0.001,
      takerFee: 0.001,
    };
    const exchangeConnector = {
      loadTradingRules: jest.fn().mockResolvedValue(rules),
      quantizeOrder: jest.fn(
        (
          _exchangeName: string,
          _pair: string,
          qty: string,
          price: string,
        ) => ({
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
        async (
          _exchangeName: string,
          _pair: string,
          accountLabel: string,
        ) => balances[accountLabel],
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

    return { planner, exchangeConnector, intentStore };
  };

  const buildScoreCandidate = (
    label: string,
    quoteVolume: number,
    nextCycleQuoteCapacity: number,
    rebalanceRiskQuote = 0,
  ): DualAccountBestCapacityCandidate & { label: string } => {
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
      estimatedSpreadCostQuote: new BigNumber(0),
      rebalanceRiskQuote: new BigNumber(rebalanceRiskQuote),
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
          selectionModel: 'best_capacity',
          candidateCount: 4,
        }),
      );
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
});

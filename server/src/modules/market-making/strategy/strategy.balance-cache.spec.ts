import 'reflect-metadata';

import BigNumber from 'bignumber.js';

import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { OrderScopedBalanceQueryService } from '../balance-state/order-scoped-balance-query.service';
import { TimeIndicatorStrategyController } from './controllers/time-indicator-strategy.controller';
import { DualAccountPlannerService } from './dual-account/dual-account-planner.service';
import { QuotePlannerService } from './quote/quote-planner.service';

jest.mock(
  'src/common/entities/market-making/strategy-instances.entity',
  () => ({
    StrategyInstance: class StrategyInstance {},
  }),
);

jest.mock('src/common/entities/orders/user-orders.entity', () => ({
  MarketMakingOrder: class MarketMakingOrder {},
}));

describe('StrategyService balance cache helpers', () => {
  const createService = ({
    exchangeInitService = {
      getExchange: jest.fn(),
      onExchangeReady: jest.fn().mockReturnValue(() => undefined),
    },
    strategyControllerRegistry,
    balanceLedgerService,
    balanceStateCacheService = new BalanceStateCacheService(),
    exchangeConnectorAdapterService = {
      fetchBalance: jest.fn(),
      loadTradingRules: jest.fn().mockResolvedValue({}),
      quantizeOrder: jest.fn(
        (
          _exchangeName: string,
          _symbol: string,
          qty: string,
          price: string,
        ) => ({ qty, price }),
      ),
    },
    strategyMarketDataProviderService = {
      getTrackedBestBidAsk: jest.fn().mockReturnValue({
        bestBid: 100,
        bestAsk: 101,
      }),
      getTrackedOrderBookFreshness: jest.fn().mockReturnValue({
        fresh: true,
        ageMs: 1000,
        freshnessTimestamp: '2026-04-14T00:00:04.000Z',
      }),
      getBestBidAsk: jest.fn().mockResolvedValue({
        bestBid: 100,
        bestAsk: 101,
      }),
    },
  }: {
    exchangeInitService?: Record<string, any>;
    strategyControllerRegistry?: Record<string, any>;
    balanceLedgerService?: Record<string, any>;
    balanceStateCacheService?: BalanceStateCacheService;
    exchangeConnectorAdapterService?: Record<string, any>;
    strategyMarketDataProviderService?: Record<string, any>;
  } = {}) => {
    const orderScopedBalanceQueryService = new OrderScopedBalanceQueryService(
      balanceLedgerService as any,
      balanceStateCacheService,
    );
    const volumeStrategyController = {
      resolveVolumeSide: (
        postOnlySide: 'buy' | 'sell' | 'inventory_balance' | undefined,
        executedTrades: number,
      ) =>
        postOnlySide === 'buy' || postOnlySide === 'sell'
          ? postOnlySide
          : executedTrades % 2 === 0
          ? 'buy'
          : 'sell',
    };
    const strategyIntentStoreService = {
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
          executionCategory?: string,
          metadata?: Record<string, unknown>,
          postOnly?: boolean,
          accountLabel?: string,
          timeInForce?: 'GTC' | 'IOC',
        ) => ({
          type: 'CREATE_LIMIT_ORDER',
          intentId: `${strategyKey}:${ts}:${suffix}`,
          runtimeInstanceKey,
          strategyKey,
          userId,
          clientId,
          exchange,
          accountLabel,
          pair,
          side,
          price: price.toFixed(),
          qty: qty.toFixed(),
          executionCategory,
          postOnly,
          timeInForce,
          metadata,
          createdAt: ts,
          status: 'NEW',
        }),
      ),
    };
    const quotePlannerService = new QuotePlannerService(
      exchangeConnectorAdapterService as any,
    );
    const dualAccountPlannerService = new DualAccountPlannerService(
      exchangeConnectorAdapterService as any,
      orderScopedBalanceQueryService,
      strategyMarketDataProviderService as any,
      volumeStrategyController as any,
      quotePlannerService,
      strategyIntentStoreService as any,
    );
    const timeIndicatorStrategyController = new TimeIndicatorStrategyController(
      exchangeInitService as any,
      orderScopedBalanceQueryService,
    );

    return {
      buildTimeIndicatorActions:
        timeIndicatorStrategyController.buildTimeIndicatorActions.bind(
          timeIndicatorStrategyController,
        ),
      getAvailableBalancesForPair:
        orderScopedBalanceQueryService.getAvailableBalancesForPair.bind(
          orderScopedBalanceQueryService,
        ),
      resolveDualAccountPreferredSide:
        dualAccountPlannerService.resolvePreferredSide.bind(
          dualAccountPlannerService,
        ),
      buildDualAccountVolumeActions:
        dualAccountPlannerService.buildDualAccountVolumeActions.bind(
          dualAccountPlannerService,
        ),
      advanceDualAccountCycleRolesAfterSuccess:
        dualAccountPlannerService.advanceCycleRolesAfterSuccess.bind(
          dualAccountPlannerService,
        ),
      runSession: async (session: any, ts: string) => {
        await strategyControllerRegistry
          ?.getController(session.strategyType)
          ?.decideActions({ session, ts });
      },
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads pair balances from a fresh account snapshot', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { BTC: 1.5, USDT: 200 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
    const exchangeConnectorAdapterService = { fetchBalance: jest.fn() };
    const service = createService({
      balanceStateCacheService,
      exchangeConnectorAdapterService,
    });

    const balances = await (service as any).getAvailableBalancesForPair(
      'binance',
      'BTC/USDT',
      'maker',
    );

    expect(balances).toEqual({
      base: new BigNumber(1.5),
      quote: new BigNumber(200),
      assets: { base: 'BTC', quote: 'USDT' },
    });
    expect(exchangeConnectorAdapterService.fetchBalance).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('treats missing assets in a fresh snapshot as zero', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { USDT: 200 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
    const service = createService({ balanceStateCacheService });

    const balances = await (service as any).getAvailableBalancesForPair(
      'binance',
      'BTC/USDT',
      'maker',
    );

    expect(balances).toEqual({
      base: new BigNumber(0),
      quote: new BigNumber(200),
      assets: { base: 'BTC', quote: 'USDT' },
    });
    jest.restoreAllMocks();
  });

  it('returns null when account snapshots are stale instead of falling back to REST', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { BTC: 1, USDT: 100 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:01:05.000Z'));
    const exchangeConnectorAdapterService = {
      fetchBalance: jest
        .fn()
        .mockResolvedValue({ free: { BTC: 2, USDT: 300 } }),
    };
    const service = createService({
      balanceStateCacheService,
      exchangeConnectorAdapterService,
    });

    const balances = await (service as any).getAvailableBalancesForPair(
      'binance',
      'BTC/USDT',
      'maker',
    );

    expect(balances).toBeNull();
    expect(exchangeConnectorAdapterService.fetchBalance).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('does not call fetchBalance during controller decisions', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();
    const exchangeConnectorAdapterService = {
      fetchBalance: jest
        .fn()
        .mockResolvedValue({ free: { BTC: 2, USDT: 300 } }),
    };

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'default',
      { free: { BTC: 1, USDT: 100 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:01:05.000Z'));

    const service = createService({
      balanceStateCacheService,
      exchangeConnectorAdapterService,
      strategyControllerRegistry: {
        getController: jest.fn().mockReturnValue({
          decideActions: jest.fn(async () => {
            await expect(
              (service as any).getAvailableBalancesForPair(
                'binance',
                'BTC/USDT',
                'default',
              ),
            ).resolves.toBeNull();

            return [];
          }),
        }),
      },
    });

    await expect(
      (service as any).runSession(
        {
          strategyKey: 'strategy-1',
          strategyType: 'timeIndicator',
          exchange: 'binance',
          pair: 'BTC/USDT',
          accountLabel: 'default',
          params: {},
        },
        '2026-04-14T00:00:05.000Z',
      ),
    ).resolves.toBeUndefined();

    expect(exchangeConnectorAdapterService.fetchBalance).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('reads dual-account planning balances from the order ledger when an order id is bound', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();
    const balanceLedgerService = {
      getExistingBalance: jest
        .fn()
        .mockImplementation(async (orderId: string, assetId: string) => {
          const balances: Record<
            string,
            Record<string, { available: string }>
          > = {
            'order-1': {
              BTC: { available: '0.25' },
              USDT: { available: '1000' },
            },
          };

          return balances[orderId]?.[assetId] || null;
        }),
    };

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { BTC: 10, USDT: 1000 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
    const service = createService({
      balanceLedgerService,
      balanceStateCacheService,
    });

    const balances = await (service as any).getAvailableBalancesForPair(
      'binance',
      'BTC/USDT',
      'maker',
      'order-1',
    );

    expect(balances).toEqual({
      base: new BigNumber(0.25),
      quote: new BigNumber(1000),
      assets: { base: 'BTC', quote: 'USDT' },
    });
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-1',
      'BTC',
    );
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalledWith(
      'order-1',
      'USDT',
    );
    jest.restoreAllMocks();
  });

  it('caps dual-account maker intent by order ledger balance instead of exchange account cache', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();
    const balanceLedgerService = {
      getExistingBalance: jest
        .fn()
        .mockImplementation(async (orderId: string, assetId: string) => {
          const balances: Record<
            string,
            Record<string, { available: string }>
          > = {
            'order-1': {
              BTC: { available: '0.1' },
              USDT: { available: '1000' },
            },
            'order-1:maker': {
              BTC: { available: '0.1' },
              USDT: { available: '1000' },
            },
            'order-1:taker': {
              BTC: { available: '10' },
              USDT: { available: '1000' },
            },
          };

          return balances[orderId]?.[assetId] || null;
        }),
    };

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { BTC: 10, USDT: 1000 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'taker',
      { free: { BTC: 10, USDT: 1000 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const service = createService({
      balanceLedgerService,
      balanceStateCacheService,
      exchangeConnectorAdapterService: {
        getCachedTradingRules: jest.fn().mockReturnValue({
          amountMin: 0.001,
          costMin: 10,
          makerFee: 0.001,
          takerFee: 0.001,
        }),
        loadTradingRules: jest.fn().mockResolvedValue({}),
        quantizeOrder: jest.fn(
          (
            _exchangeName: string,
            _symbol: string,
            qty: string,
            price: string,
          ) => ({ qty, price }),
        ),
      },
      strategyMarketDataProviderService: {
        getTrackedBestBidAsk: jest.fn().mockReturnValue({
          bestBid: 100,
          bestAsk: 101,
        }),
        getTrackedOrderBookFreshness: jest.fn().mockReturnValue({
          fresh: true,
          ageMs: 1000,
          freshnessTimestamp: '2026-04-14T00:00:04.000Z',
        }),
        getBestBidAsk: jest.fn().mockResolvedValue({
          bestBid: 100,
          bestAsk: 101,
        }),
      },
    });

    const actions = await (service as any).buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        marketMakingOrderId: 'order-1',
        baseIncrementPercentage: 0,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        postOnlySide: 'sell',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      },
      '2026-04-14T00:00:05.000Z',
    );

    expect(actions).toEqual([
      expect.objectContaining({
        side: 'sell',
        qty: '0.1',
        accountLabel: 'maker',
        metadata: expect.objectContaining({
          orderId: 'order-1:maker',
          requestedQty: '1',
          effectiveQty: '0.1',
        }),
      }),
    ]);
    expect(balanceLedgerService.getExistingBalance).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('skips dual-account maker intent when tracked market data is stale', async () => {
    const balanceLedgerService = {
      getExistingBalance: jest.fn().mockResolvedValue({ available: '1000' }),
    };
    const service = createService({
      balanceLedgerService,
      strategyMarketDataProviderService: {
        getTrackedBestBidAsk: jest.fn().mockReturnValue({
          bestBid: 100,
          bestAsk: 101,
        }),
        getTrackedOrderBookFreshness: jest.fn().mockReturnValue({
          fresh: false,
          ageMs: 45_000,
          freshnessTimestamp: '2026-04-14T00:00:00.000Z',
        }),
        getBestBidAsk: jest.fn().mockResolvedValue({
          bestBid: 100,
          bestAsk: 101,
        }),
      },
    });

    const actions = await (service as any).buildDualAccountVolumeActions(
      'dual-key',
      {
        exchangeName: 'binance',
        symbol: 'BTC/USDT',
        marketMakingOrderId: 'order-1',
        baseIncrementPercentage: 0,
        baseIntervalTime: 10,
        baseTradeAmount: 1,
        numTrades: 2,
        userId: 'user1',
        clientId: 'client1',
        pricePushRate: 0,
        executionCategory: 'clob_cex',
        executionVenue: 'cex',
        postOnlySide: 'sell',
        makerAccountLabel: 'maker',
        takerAccountLabel: 'taker',
        dynamicRoleSwitching: false,
        publishedCycles: 0,
        completedCycles: 0,
      },
      '2026-04-14T00:00:45.000Z',
    );

    expect(actions).toEqual([]);
    expect(balanceLedgerService.getExistingBalance).not.toHaveBeenCalled();
  });

  it('uses maker inventory balance to choose buy or sell when postOnlySide=inventory_balance', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { BTC: 0.1, USDT: 500 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
    const service = createService({ balanceStateCacheService });

    await expect(
      (service as any).resolveDualAccountPreferredSide(
        {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
          postOnlySide: 'inventory_balance',
          buyBias: 0.5,
        },
        0,
      ),
    ).resolves.toBe('buy');

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { BTC: 10, USDT: 50 } },
      '2026-04-14T00:00:06.000Z',
      'ws',
    );

    await expect(
      (service as any).resolveDualAccountPreferredSide(
        {
          exchangeName: 'binance',
          symbol: 'BTC/USDT',
          makerAccountLabel: 'maker',
          takerAccountLabel: 'taker',
          postOnlySide: 'inventory_balance',
          buyBias: 0.5,
        },
        0,
      ),
    ).resolves.toBe('sell');
    jest.restoreAllMocks();
  });

  it('skips time-indicator decisions when the cache is stale without calling exchange fetchBalance', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();
    const exchange = {
      id: 'binance',
      markets: {
        'BTC/USDT': { limits: { amount: { min: 0.001 }, cost: { min: 10 } } },
      },
      timeframes: { '5m': true },
      loadMarkets: jest.fn(),
      fetchOpenOrders: jest.fn().mockResolvedValue([]),
      fetchBalance: jest
        .fn()
        .mockResolvedValue({ free: { BTC: 10, USDT: 1000 } }),
      amountToPrecision: jest.fn((_symbol: string, value: number) =>
        value.toFixed(4),
      ),
      priceToPrecision: jest.fn((_symbol: string, value: number) =>
        value.toFixed(2),
      ),
    };

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'default',
      { free: { BTC: 10, USDT: 1000 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:01:05.000Z'));
    const service = createService({
      exchangeInitService: {
        getExchange: jest.fn().mockReturnValue(exchange),
        onExchangeReady: jest.fn().mockReturnValue(() => undefined),
      },
      balanceStateCacheService,
    });

    (exchange as any).fetchOHLCV = jest.fn().mockResolvedValue([
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 90],
      [0, 0, 0, 0, 95],
      [0, 0, 0, 0, 110],
      [0, 0, 0, 0, 120],
    ]);

    await expect(
      service.buildTimeIndicatorActions(
        {
          runId: 'run-1',
          strategyKey: 'user-1-client-1-timeIndicator',
          strategyType: 'timeIndicator',
          userId: 'user-1',
          clientId: 'client-1',
          cadenceMs: 1000,
          nextRunAtMs: 0,
          params: {
            userId: 'user-1',
            clientId: 'client-1',
            exchangeName: 'binance',
            symbol: 'BTC/USDT',
            timeframe: '5m',
            lookback: 20,
            emaFast: 3,
            emaSlow: 5,
            rsiPeriod: 3,
            indicatorMode: 'ema',
            orderMode: 'quote',
            orderSize: 100,
            tickIntervalMs: 1000,
          },
        } as any,
        '2026-03-11T00:00:00.000Z',
      ),
    ).resolves.toEqual([]);
    expect(exchange.fetchBalance).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('rotates dual-account maker and taker roles after a matched cycle when cycleMode=alternating', () => {
    const service = createService();

    const nextParams = (
      service as any
    ).advanceDualAccountCycleRolesAfterSuccess(
      {
        makerAccountLabel: 'maker-a',
        takerAccountLabel: 'maker-b',
        cycleMode: 'alternating',
      },
      {
        cycleId: 'cycle-1',
        tickId: 'tick-1',
        orderId: 'order-1',
        makerSide: 'sell',
        makerAccountLabel: 'maker-a',
        takerAccountLabel: 'maker-b',
        price: '100',
        requestedQty: '1',
        makerFilledQty: '1',
        takerFilledQty: '1',
      },
    );

    expect(nextParams.nextMakerAccountLabel).toBe('maker-b');
    expect(nextParams.nextTakerAccountLabel).toBe('maker-a');
  });

  it('keeps configured roles when cycleMode=static', () => {
    const service = createService();

    const nextParams = (
      service as any
    ).advanceDualAccountCycleRolesAfterSuccess(
      {
        makerAccountLabel: 'maker-a',
        takerAccountLabel: 'maker-b',
        cycleMode: 'static',
      },
      {
        cycleId: 'cycle-1',
        tickId: 'tick-1',
        orderId: 'order-1',
        makerSide: 'sell',
        makerAccountLabel: 'maker-a',
        takerAccountLabel: 'maker-b',
        price: '100',
        requestedQty: '1',
        makerFilledQty: '1',
        takerFilledQty: '1',
      },
    );

    expect(nextParams.nextMakerAccountLabel).toBe('maker-a');
    expect(nextParams.nextTakerAccountLabel).toBe('maker-b');
  });
});

import 'reflect-metadata';
import BigNumber from 'bignumber.js';

import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';

jest.mock('src/common/entities/market-making/strategy-instances.entity', () => ({
  StrategyInstance: class StrategyInstance {},
}));

jest.mock('src/common/entities/orders/user-orders.entity', () => ({
  MarketMakingOrder: class MarketMakingOrder {},
}));

const { StrategyService } = require('./strategy.service');

describe('StrategyService balance cache helpers', () => {
  const strategyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const createService = ({
    exchangeInitService = {
      getExchange: jest.fn(),
      onExchangeReady: jest.fn().mockReturnValue(() => undefined),
    },
    strategyControllerRegistry,
    balanceStateCacheService = new BalanceStateCacheService(),
    exchangeConnectorAdapterService = {
      fetchBalance: jest.fn(),
      loadTradingRules: jest.fn(),
    },
    strategyMarketDataProviderService = {
      getTrackedBestBidAsk: jest.fn().mockReturnValue({
        bestBid: 100,
        bestAsk: 101,
      }),
      getBestBidAsk: jest.fn().mockResolvedValue({
        bestBid: 100,
        bestAsk: 101,
      }),
    },
  }: {
    exchangeInitService?: Record<string, any>;
    strategyControllerRegistry?: Record<string, any>;
    balanceStateCacheService?: BalanceStateCacheService;
    exchangeConnectorAdapterService?: Record<string, any>;
    strategyMarketDataProviderService?: Record<string, any>;
  } = {}) =>
    new StrategyService(
      exchangeInitService as any,
      strategyRepo as any,
      undefined,
      undefined,
      undefined,
      undefined,
      strategyControllerRegistry as any,
      undefined,
      strategyMarketDataProviderService as any,
      undefined,
      undefined,
      undefined,
      undefined,
      balanceStateCacheService,
      undefined,
      undefined,
      exchangeConnectorAdapterService as any,
      undefined,
    );

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
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
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
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
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
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-14T00:01:05.000Z'));
    const exchangeConnectorAdapterService = {
      fetchBalance: jest.fn().mockResolvedValue({ free: { BTC: 2, USDT: 300 } }),
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
      fetchBalance: jest.fn().mockResolvedValue({ free: { BTC: 2, USDT: 300 } }),
    };

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'default',
      { free: { BTC: 1, USDT: 100 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-14T00:01:05.000Z'));

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

  it('uses maker inventory balance to choose buy or sell when postOnlySide=inventory_balance', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      { free: { BTC: 0.1, USDT: 500 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
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
      fetchBalance: jest.fn().mockResolvedValue({ free: { BTC: 10, USDT: 1000 } }),
      amountToPrecision: jest.fn((_symbol: string, value: number) => value.toFixed(4)),
      priceToPrecision: jest.fn((_symbol: string, value: number) => value.toFixed(2)),
    };

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'default',
      { free: { BTC: 10, USDT: 1000 } },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-14T00:01:05.000Z'));
    const service = createService({
      exchangeInitService: {
        getExchange: jest.fn().mockReturnValue(exchange),
        onExchangeReady: jest.fn().mockReturnValue(() => undefined),
      },
      balanceStateCacheService,
    });

    jest.spyOn(service as any, 'fetchCandles').mockResolvedValue([
      [0, 0, 0, 0, 90],
      [0, 0, 0, 0, 95],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
      [0, 0, 0, 0, 100],
    ]);
    jest.spyOn(service as any, 'calcEma')
      .mockReturnValueOnce([90, 95, 99, 101, 103, 104, 105])
      .mockReturnValueOnce([100, 100, 100, 100, 100, 100, 100]);
    jest.spyOn(service as any, 'calcRsi').mockReturnValue([50, 50, 50, 50]);
    jest.spyOn(service as any, 'calcCross').mockReturnValue('CROSS_UP');

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

    const nextParams = (service as any).advanceDualAccountCycleRolesAfterSuccess(
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

    const nextParams = (service as any).advanceDualAccountCycleRolesAfterSuccess(
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

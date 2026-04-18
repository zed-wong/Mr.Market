/* eslint-disable @typescript-eslint/no-explicit-any */
import BigNumber from 'bignumber.js';

import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { ExchangeConnectorAdapterService } from '../execution/exchange-connector-adapter.service';
import { StrategyService } from './strategy.service';

describe('StrategyService balance cache helpers', () => {
  const strategyRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const createService = ({
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
    balanceStateCacheService?: BalanceStateCacheService;
    exchangeConnectorAdapterService?: Partial<ExchangeConnectorAdapterService>;
    strategyMarketDataProviderService?: Record<string, any>;
  } = {}) =>
    new StrategyService(
      {
        getExchange: jest.fn(),
        onExchangeReady: jest.fn().mockReturnValue(() => undefined),
      } as any,
      strategyRepo as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
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

  it('reads pair balances from the fresh balance cache before falling back to REST', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      {
        free: { BTC: 1.5, USDT: 200 },
      },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:00:05.000Z'));
    const exchangeConnectorAdapterService = {
      fetchBalance: jest.fn(),
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

    expect(balances).toEqual({
      base: new BigNumber(1.5),
      quote: new BigNumber(200),
      assets: { base: 'BTC', quote: 'USDT' },
    });
    expect(exchangeConnectorAdapterService.fetchBalance).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('falls back to REST when cached balances are stale and refreshes the cache', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      {
        free: { BTC: 1, USDT: 100 },
      },
      '2026-04-14T00:00:00.000Z',
      'ws',
    );
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-04-14T00:01:00.000Z'));
    const exchangeConnectorAdapterService = {
      fetchBalance: jest.fn().mockResolvedValue({
        free: { BTC: 2, USDT: 300 },
      }),
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

    expect(balances).toEqual({
      base: new BigNumber(2),
      quote: new BigNumber(300),
      assets: { base: 'BTC', quote: 'USDT' },
    });
    expect(exchangeConnectorAdapterService.fetchBalance).toHaveBeenCalledWith(
      'binance',
      'maker',
    );
    expect(
      balanceStateCacheService.getBalance('binance', 'maker', 'USDT'),
    ).toEqual(
      expect.objectContaining({
        free: '300',
        source: 'rest',
      }),
    );
    jest.restoreAllMocks();
  });

  it('uses maker inventory balance to choose buy or sell when postOnlySide=inventory_balance', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();

    balanceStateCacheService.applyBalanceSnapshot(
      'binance',
      'maker',
      {
        free: { BTC: 0.1, USDT: 500 },
      },
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
      {
        free: { BTC: 10, USDT: 50 },
      },
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
});

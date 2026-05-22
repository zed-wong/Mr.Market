import { GrowdataService } from './grow-data.service';

describe('GrowdataService', () => {
  const createService = () => {
    const cache = new Map<string, unknown>();
    const cacheService = {
      get: jest.fn((key: string) => Promise.resolve(cache.get(key))),
      set: jest.fn((key: string, value: unknown) => {
        cache.set(key, value);
        return Promise.resolve();
      }),
    };
    const growdataRepository = {
      findAllExchanges: jest.fn().mockResolvedValue([
        { exchange_id: 'binance', name: 'Binance', enable: true },
      ]),
      findAllSimplyGrowTokens: jest.fn().mockResolvedValue([]),
      findAllArbitragePairs: jest.fn().mockResolvedValue([]),
      findAllMarketMakingPairs: jest.fn().mockResolvedValue([
        {
          id: 'pair-1',
          exchange_id: 'binance',
          symbol: 'BTC/USDT',
          base_asset_id: 'btc',
          quote_asset_id: 'usdt',
          min_order_amount: null,
          max_order_amount: null,
          amount_significant_figures: null,
          price_significant_figures: null,
        },
        {
          id: 'pair-2',
          exchange_id: 'binance',
          symbol: 'ETH/USDT',
          base_asset_id: 'eth',
          quote_asset_id: 'usdt',
          min_order_amount: null,
          max_order_amount: null,
          amount_significant_figures: null,
          price_significant_figures: null,
        },
      ]),
    };
    const mixinClientService = {
      client: {
        safe: {
          fetchAssets: jest.fn().mockResolvedValue([
            { asset_id: 'btc', price_usd: '100000' },
            { asset_id: 'eth', price_usd: '4000' },
            { asset_id: 'usdt', price_usd: '1' },
          ]),
        },
      },
    };
    const exchangeInitService = {
      getCcxtExchangeMarkets: jest.fn().mockResolvedValue([
        {
          symbol: 'BTC/USDT',
          limits: {
            amount: { min: '0.0001', max: '2' },
            cost: { min: '10' },
          },
          precision: { amount: '0.0001', price: '0.01' },
        },
        {
          symbol: 'ETH/USDT',
          limits: {
            amount: { min: '0.001', max: '10' },
            cost: { min: '10' },
          },
          precision: { amount: '0.001', price: '0.01' },
        },
      ]),
    };

    return {
      cache,
      cacheService,
      exchangeInitService,
      growdataRepository,
      service: new GrowdataService(
        cacheService as any,
        growdataRepository as any,
        mixinClientService as any,
        exchangeInitService as any,
      ),
    };
  };

  it('caches /grow/info and avoids duplicate exchange market loads per exchange', async () => {
    const { exchangeInitService, growdataRepository, service } =
      createService();

    const first = await service.getGrowData();
    const second = await service.getGrowData();

    expect(first).toBe(second);
    expect(growdataRepository.findAllExchanges).toHaveBeenCalledTimes(1);
    expect(growdataRepository.findAllMarketMakingPairs).toHaveBeenCalledTimes(
      1,
    );
    expect(exchangeInitService.getCcxtExchangeMarkets).toHaveBeenCalledTimes(1);
    expect(exchangeInitService.getCcxtExchangeMarkets).toHaveBeenCalledWith(
      'binance',
    );
  });

  it('warms grow data on module init so API reads use the prepared snapshot', async () => {
    const { growdataRepository, service } = createService();

    await service.onModuleInit();
    const warmed = await service.getGrowData();

    expect(warmed).toBeTruthy();
    expect(growdataRepository.findAllExchanges).toHaveBeenCalledTimes(1);
    expect(growdataRepository.findAllMarketMakingPairs).toHaveBeenCalledTimes(
      1,
    );
  });

  it('refreshes the prepared snapshot from the cron path', async () => {
    const { growdataRepository, service } = createService();

    await service.onModuleInit();
    await service.refreshGrowDataCacheFromCron();

    expect(growdataRepository.findAllExchanges).toHaveBeenCalledTimes(2);
    expect(growdataRepository.findAllMarketMakingPairs).toHaveBeenCalledTimes(
      2,
    );
  });
});

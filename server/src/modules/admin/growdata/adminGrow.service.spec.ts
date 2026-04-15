import { AdminGrowService } from './adminGrow.service';

describe('AdminGrowService', () => {
  let service: AdminGrowService;
  let growDataService: {
    getExchangeById: jest.Mock;
    getMarketMakingPairById: jest.Mock;
  };
  let growdataRepository: {
    addMarketMakingPair: jest.Mock;
  };
  let mixinClientService: {
    client: {
      safe: {
        fetchAsset: jest.Mock;
      };
    };
  };
  let exchangeInitService: {
    getCcxtExchangeMarkets: jest.Mock;
  };

  beforeEach(() => {
    growDataService = {
      getExchangeById: jest.fn().mockResolvedValue({ exchange_id: 'binance' }),
      getMarketMakingPairById: jest.fn(),
    };
    growdataRepository = {
      addMarketMakingPair: jest.fn().mockImplementation(async (pair) => pair),
    };
    mixinClientService = {
      client: {
        safe: {
          fetchAsset: jest.fn(async (assetId: string) => {
            if (assetId === 'base-asset') {
              return { chain_id: 'base-chain' };
            }
            if (assetId === 'quote-asset') {
              return { chain_id: 'quote-chain' };
            }
            if (assetId === 'base-chain') {
              return { icon_url: 'base-chain-icon' };
            }
            if (assetId === 'quote-chain') {
              return { icon_url: 'quote-chain-icon' };
            }

            return {};
          }),
        },
      },
    };
    exchangeInitService = {
      getCcxtExchangeMarkets: jest.fn().mockResolvedValue([
        {
          symbol: 'BTC/USDT',
          limits: { amount: { min: 0.001, max: 10 } },
          precision: { amount: 6, price: 2 },
        },
      ]),
    };

    service = new AdminGrowService(
      growDataService as any,
      growdataRepository as any,
      mixinClientService as any,
      exchangeInitService as any,
    );
  });

  it('hydrates live exchange limits when adding a market making pair', async () => {
    await service.addMarketMakingPair({
      id: 'pair-1',
      symbol: 'BTC/USDT',
      base_symbol: 'BTC',
      quote_symbol: 'USDT',
      base_asset_id: 'base-asset',
      base_icon_url: 'base-icon',
      quote_asset_id: 'quote-asset',
      quote_icon_url: 'quote-icon',
      exchange_id: 'binance',
      enable: true,
    } as any);

    expect(exchangeInitService.getCcxtExchangeMarkets).toHaveBeenCalledWith(
      'binance',
    );
    expect(growdataRepository.addMarketMakingPair).toHaveBeenCalledWith(
      expect.objectContaining({
        min_order_amount: '0.001',
        max_order_amount: '10',
        amount_significant_figures: '6',
        price_significant_figures: '2',
        base_chain_id: 'base-chain',
        quote_chain_id: 'quote-chain',
      }),
    );
  });

  it('replaces persisted zero minimums with the live exchange minimum on update', async () => {
    growDataService.getMarketMakingPairById.mockResolvedValue({
      id: 'pair-1',
      symbol: 'BTC/USDT',
      base_symbol: 'BTC',
      quote_symbol: 'USDT',
      base_asset_id: 'base-asset',
      base_icon_url: 'base-icon',
      quote_asset_id: 'quote-asset',
      quote_icon_url: 'quote-icon',
      exchange_id: 'binance',
      min_order_amount: '0',
      enable: true,
    });

    await service.updateMarketMakingPair('pair-1', {});

    expect(growdataRepository.addMarketMakingPair).toHaveBeenCalledWith(
      expect.objectContaining({
        min_order_amount: '0.001',
      }),
    );
  });
});

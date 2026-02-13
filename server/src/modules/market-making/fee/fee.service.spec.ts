import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GrowdataRepository } from 'src/modules/data/grow-data/grow-data.repository';

import { CustomConfigService } from '../../infrastructure/custom-config/custom-config.service';
import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { MixinClientService } from '../../mixin/client/mixin-client.service';
import { FeeService } from './fee.service';

// Mock the Mixin SDK clients
const mockClient = {
  network: {
    searchAssets: jest.fn(),
  },
  safe: {
    fetchAsset: jest.fn(),
    fetchFee: jest.fn(),
  },
};

jest.mock('@mixin.dev/mixin-node-sdk', () => ({
  MixinApi: jest.fn(() => mockClient),
}));

describe('FeeService', () => {
  let service: FeeService;
  let exchangeInitService: ExchangeInitService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let configService: ConfigService;
  let testingModule: TestingModule;

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        FeeService,
        {
          provide: ExchangeInitService,
          useValue: {
            getExchange: jest.fn(),
          },
        },
        {
          provide: MixinClientService,
          useValue: {
            client: mockClient,
            spendKey: 'test-spend-key',
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'mixin.app_id') return 'mock_app_id';
              if (key === 'mixin.session_id') return 'mock_session_id';
              if (key === 'mixin.server_public_key')
                return 'mock_server_public_key';
              if (key === 'mixin.session_private_key')
                return 'mock_session_private_key';

              return null;
            }),
          },
        },
        {
          provide: CustomConfigService,
          useValue: {
            readMarketMakingFee: jest.fn().mockResolvedValue('0.001'),
          },
        },
        {
          provide: GrowdataRepository,
          useValue: {
            findMarketMakingPairByExchangeAndSymbol: jest.fn(),
          },
        },
      ],
    }).compile();

    service = testingModule.get<FeeService>(FeeService);
    exchangeInitService =
      testingModule.get<ExchangeInitService>(ExchangeInitService);
    configService = testingModule.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateMoveFundsFee', () => {
    const pair = 'BTC/USDT';
    const baseAssetId = 'c6d0c728-2624-429b-8e0d-d9d19b6592fa'; // BTC (Bitcoin chain ID used for simple match)
    const quoteAssetId = '4d8c508b-91c5-375b-92b0-ee7ca2db9a57'; // USDT

    const mockBaseAsset = {
      asset_id: baseAssetId,
      chain_id: 'c6d0c728-2624-429b-8e0d-d9d19b6592fa', // Bitcoin Chain
      symbol: 'BTC',
    };
    const mockQuoteAsset = {
      asset_id: quoteAssetId,
      chain_id: '43d61dcd-e413-450d-80b8-101d5e903357', // Ethereum Chain
      symbol: 'USDT',
    };

    const mockTradingPair = {
      base_asset_id: baseAssetId,
      quote_asset_id: quoteAssetId,
    };

    beforeEach(() => {
      mockClient.network.searchAssets.mockImplementation((query) => {
        if (query === 'BTC') return [mockBaseAsset];
        if (query === 'USDT') return [mockQuoteAsset];

        return [];
      });
      mockClient.safe.fetchAsset.mockImplementation((assetId) => {
        if (assetId === baseAssetId) return mockBaseAsset;
        if (assetId === quoteAssetId) return mockQuoteAsset;

        return undefined;
      });
      const repo = testingModule.get(GrowdataRepository) as {
        findMarketMakingPairByExchangeAndSymbol: jest.Mock;
      };

      repo.findMarketMakingPairByExchangeAndSymbol.mockResolvedValue(
        mockTradingPair,
      );
    });

    it('should calculate fees for deposit_to_exchange', async () => {
      const direction = 'deposit_to_exchange';
      const exchangeName = 'binance';

      mockClient.safe.fetchFee.mockImplementation((assetId) => {
        if (assetId === baseAssetId)
          return [{ amount: '0.0001', asset_id: baseAssetId }];
        if (assetId === quoteAssetId)
          return [{ amount: '5', asset_id: quoteAssetId }];

        return [];
      });

      const result = await service.calculateMoveFundsFee(
        exchangeName,
        pair,
        direction,
      );

      expect(mockClient.safe.fetchFee).toHaveBeenCalledWith(baseAssetId, '');
      expect(mockClient.safe.fetchFee).toHaveBeenCalledWith(quoteAssetId, '');

      expect(result).toEqual({
        base_asset_id: baseAssetId,
        quote_asset_id: quoteAssetId,
        base_fee_id: baseAssetId,
        quote_fee_id: quoteAssetId,
        base_fee_amount: '0.0001',
        quote_fee_amount: '5',
        base_fee_symbol: 'BTC',
        quote_fee_symbol: 'USDT',
        base_fee_price_usd: undefined,
        quote_fee_price_usd: undefined,
        base_asset_price_usd: undefined,
        quote_asset_price_usd: undefined,
        market_making_fee_percentage: '0.001',
        direction: 'mixin->exchange',
      });
    });

    it('should calculate fees for withdraw_to_mixin with known chain IDs', async () => {
      const direction = 'withdraw_to_mixin';
      const exchangeName = 'binance';

      const mockExchange = {
        has: { fetchTransactionFees: true },
        fetchTransactionFees: jest.fn().mockResolvedValue({
          [baseAssetId]: { withdraw: 0.0005 },
          [quoteAssetId]: { withdraw: 10 },
        }),
      };

      jest
        .spyOn(exchangeInitService, 'getExchange')
        .mockReturnValue(mockExchange as any);

      // Bitcoin Chain ID -> USD 3
      // Ethereum Chain ID -> USD 3
      // Total Mixin Deposit Fee = 3 + 3 = 6

      const result = await service.calculateMoveFundsFee(
        exchangeName,
        pair,
        direction,
      );

      expect(exchangeInitService.getExchange).toHaveBeenCalledWith(
        exchangeName,
      );
      expect(mockExchange.fetchTransactionFees).toHaveBeenCalledWith([
        baseAssetId,
        quoteAssetId,
      ]);

      expect(result).toEqual({
        symbol: pair,
        base_asset_id: baseAssetId,
        quote_asset_id: quoteAssetId,
        base_asset_fee: 0.0005,
        quote_asset_fee: 10,
        mixin_deposit_fee: '6',
        direction: 'exchange->mixin',
      });
    });

    it('should calculate fees for withdraw_to_mixin with other chain IDs', async () => {
      const direction = 'withdraw_to_mixin';
      const exchangeName = 'binance';
      const pairSimple = 'LTC/DOGE'; // Litecoin / Dogecoin

      const ltcAssetId = '76c802a2-7c88-447f-a93e-c29c9e5dd9c8'; // Litecoin Chain
      const dogeAssetId = '6770a1e5-6086-44d5-b60f-545f9d9e8ffd'; // Dogecoin Chain

      const mockLTC = {
        asset_id: ltcAssetId,
        chain_id: ltcAssetId,
        symbol: 'LTC',
      };
      const mockDoge = {
        asset_id: dogeAssetId,
        chain_id: dogeAssetId,
        symbol: 'DOGE',
      };

      mockClient.network.searchAssets.mockImplementation((query) => {
        if (query === 'LTC') return [mockLTC];
        if (query === 'DOGE') return [mockDoge];

        return [];
      });

      const mockExchange = {
        has: { fetchTransactionFees: false },
        currencies: {
          [ltcAssetId]: { fee: 0.001 },
          [dogeAssetId]: { fee: 1 },
        },
      };

      jest
        .spyOn(exchangeInitService, 'getExchange')
        .mockReturnValue(mockExchange as any);

      // Litecoin -> 0.1
      // Dogecoin -> 0.1
      // Total = 0.2

      const repo = testingModule.get(GrowdataRepository) as {
        findMarketMakingPairByExchangeAndSymbol: jest.Mock;
      };

      repo.findMarketMakingPairByExchangeAndSymbol.mockResolvedValue({
        base_asset_id: ltcAssetId,
        quote_asset_id: dogeAssetId,
      });
      mockClient.safe.fetchAsset.mockImplementation((assetId) => {
        if (assetId === ltcAssetId) return mockLTC;
        if (assetId === dogeAssetId) return mockDoge;

        return undefined;
      });

      const result = await service.calculateMoveFundsFee(
        exchangeName,
        pairSimple,
        direction,
      );

      expect(result.mixin_deposit_fee).toBe('0.2');
      expect(result.base_asset_fee).toBe(0.001);
      expect(result.quote_asset_fee).toBe(1);
    });

    it('should calculate fees for withdraw_external', async () => {
      const direction = 'withdraw_external';
      const exchangeName = 'binance';

      const mockExchange = {
        has: { fetchTransactionFees: true },
        fetchTransactionFees: jest.fn().mockResolvedValue({
          [baseAssetId]: { withdraw: 0.0004 },
          [quoteAssetId]: { withdraw: 8 },
        }),
      };

      jest
        .spyOn(exchangeInitService, 'getExchange')
        .mockReturnValue(mockExchange as any);

      const result = await service.calculateMoveFundsFee(
        exchangeName,
        pair,
        direction,
      );

      expect(result).toEqual({
        symbol: pair,
        base_asset_id: baseAssetId,
        quote_asset_id: quoteAssetId,
        base_asset_fee: 0.0004,
        quote_asset_fee: 8,
        direction: 'exchange->external',
      });
    });

    it('should return undefined fees if exchange or fetch fails', async () => {
      const direction = 'withdraw_external';
      const exchangeName = 'unknown';

      jest.spyOn(exchangeInitService, 'getExchange').mockReturnValue(null);

      const result = await service.calculateMoveFundsFee(
        exchangeName,
        pair,
        direction,
      );

      expect(result.base_asset_fee).toBeUndefined();
      expect(result.quote_asset_fee).toBeUndefined();
    });
  });
});

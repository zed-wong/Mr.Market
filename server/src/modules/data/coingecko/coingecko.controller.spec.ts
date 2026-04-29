import { Test, TestingModule } from '@nestjs/testing';

import { CoingeckoController } from './coingecko.controller';
import { CoingeckoProxyService } from './coingecko.service';

const coinMarketDataFixture = [
  { id: 'ethereum', symbol: 'eth', current_price: 2000 },
  { id: 'bitcoin', symbol: 'btc', current_price: 60000 },
  { id: 'mixin', symbol: 'xin', current_price: 250 },
];

const coinFullInfoFixture = {
  id: 'ethereum',
  symbol: 'eth',
  name: 'Ethereum',
};

const coinMarketChartResponseFixture = {
  prices: [
    [1609459200000, 730.0],
    [1612137600000, 1400.0],
    [1614556800000, 1500.0],
  ],
  market_caps: [
    [1609459200000, 83000000.0],
    [1612137600000, 160000000.0],
    [1614556800000, 180000000.0],
  ],
  total_volumes: [
    [1609459200000, 10000000.0],
    [1612137600000, 22000000.0],
    [1614556800000, 25000000.0],
  ],
};

describe('CoingeckoController', () => {
  let controller: CoingeckoController;
  let service: CoingeckoProxyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoingeckoController],
      providers: [
        {
          provide: CoingeckoProxyService,
          useValue: {
            coinsId: jest.fn(),
            coinsMarkets: jest.fn(),
            coinsIdMarketChart: jest.fn(),
            coinIdMarketChartRange: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CoingeckoController>(CoingeckoController);
    service = module.get<CoingeckoProxyService>(CoingeckoProxyService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get coins by id', async () => {
    const id = '7';
    const expectedResult = coinFullInfoFixture;

    (service.coinsId as jest.Mock).mockReturnValueOnce(expectedResult);
    const result = await controller.getCoinsById(id);

    expect(service.coinsId).toHaveBeenCalledWith(id);
    expect(result).toEqual(expectedResult);
  });
  it('should get coin markets with requested currency', async () => {
    const currency = 'ethereum';
    const expectedResult = coinMarketDataFixture;

    (service.coinsMarkets as jest.Mock).mockReturnValueOnce(expectedResult);
    const result = await controller.getCoinMarkets(
      currency,
      undefined,
      undefined,
    );

    expect(service.coinsMarkets).toHaveBeenCalledWith(
      currency,
      undefined,
      undefined,
      undefined,
    );
    expect(result).toEqual(expectedResult);
  });
  it('should get coin markets by category', async () => {
    const currency = 'ethereum';
    const expectedResult = [coinMarketDataFixture[2]];
    const category = 'all';

    (service.coinsMarkets as jest.Mock).mockReturnValueOnce(expectedResult);
    const result = await controller.getCoinMarketsByCategory(
      currency,
      category,
      undefined,
      undefined,
    );

    expect(service.coinsMarkets).toHaveBeenCalledWith(
      currency,
      category === 'all' ? undefined : 'all',
      undefined,
      undefined,
    );
    expect(result).toEqual(expectedResult);
  });
  it('should get coin markets with all category', async () => {
    const currency = 'ethereum';
    const expectedResult = coinMarketDataFixture;
    const category = 'all';

    (service.coinsMarkets as jest.Mock).mockReturnValueOnce(expectedResult);
    const result = await controller.getCoinMarketsByCategory(
      currency,
      category,
      undefined,
      undefined,
    );

    expect(service.coinsMarkets).toHaveBeenCalledWith(
      currency,
      category === 'all' ? undefined : 'all',
      undefined,
      undefined,
    );
    expect(result).toEqual(expectedResult);
  });
  it('should get coin market chart', async () => {
    const expectedResult = coinMarketChartResponseFixture;
    const id = 'ethereum';
    const days = 59;
    const currency = 'ethereum';

    (service.coinsIdMarketChart as jest.Mock).mockReturnValueOnce(
      expectedResult,
    );
    const result = await controller.getCoinIdMarketChart(id, days, currency);

    expect(service.coinsIdMarketChart).toHaveBeenCalledWith(id, days, currency);
    expect(result).toEqual(expectedResult);
  });

  it('should get coin market chart by range', async () => {
    const expectedResult = coinMarketChartResponseFixture;
    const id = 'ethereum';
    const from = 1609459200000;
    const to = 1614556800000;
    const currency = 'ethereum';

    (service.coinIdMarketChartRange as jest.Mock).mockReturnValueOnce(
      expectedResult,
    );
    const result = await controller.getCoinIdMarketRange(
      id,
      from,
      to,
      currency,
    );

    expect(service.coinIdMarketChartRange).toHaveBeenCalledWith(
      id,
      from,
      to,
      currency,
    );
    expect(result).toEqual(expectedResult);
  });
});

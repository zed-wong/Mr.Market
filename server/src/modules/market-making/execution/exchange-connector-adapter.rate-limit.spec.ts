/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';

import { ExchangeConnectorAdapterService } from './exchange-connector-adapter.service';

describe('ExchangeConnectorAdapterService rate-limit behavior', () => {
  const createConfigService = (minRequestIntervalMs = 1) =>
    ({
      get: jest.fn((key: string, defaultValue?: number) => {
        if (key === 'strategy.exchange_min_request_interval_ms') {
          return minRequestIntervalMs;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('still releases the per-exchange rate-limit chain after a request fails', async () => {
    const exchange = {
      fetchOrderBook: jest
        .fn()
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValueOnce({ bids: [], asks: [] }),
    };
    const exchangeInitService = {
      getExchange: jest.fn().mockReturnValue(exchange),
    };
    const service = new ExchangeConnectorAdapterService(
      exchangeInitService as any,
      createConfigService(0),
    );

    await expect(
      service.fetchOrderBook('binance', 'BTC/USDT'),
    ).rejects.toThrow('429 Too Many Requests');

    await expect(
      service.fetchOrderBook('binance', 'BTC/USDT'),
    ).resolves.toEqual({ bids: [], asks: [] });

    expect(exchange.fetchOrderBook).toHaveBeenCalledTimes(2);
  });
});

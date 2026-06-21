import { ConfigService } from '@nestjs/config';
import { BigNumber } from 'ethers';

import { GasPriceOracleService } from './gas-price-oracle.service';

describe('GasPriceOracleService', () => {
  it('scales and caches provider fee data', async () => {
    const provider = {
      getFeeData: jest.fn().mockResolvedValue({
        gasPrice: BigNumber.from(100),
        maxFeePerGas: BigNumber.from(200),
        maxPriorityFeePerGas: BigNumber.from(10),
      }),
    };
    const tradingAccountService = {
      getSigner: jest.fn().mockResolvedValue({ provider }),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'web3.gas_multiplier': 1.5,
          'web3.gas_price_cache_ttl_ms': 10_000,
        };

        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    const service = new GasPriceOracleService(
      tradingAccountService as any,
      configService,
    );

    const first = await service.quoteGasPrice(1, 'account-1');
    const second = await service.quoteGasPrice(1, 'account-1');

    expect(first.gasPrice.toString()).toBe('150');
    expect(first.maxFeePerGas?.toString()).toBe('300');
    expect(first.maxPriorityFeePerGas?.toString()).toBe('15');
    expect(second).toBe(first);
    expect(provider.getFeeData).toHaveBeenCalledTimes(1);
  });
});

import { BadRequestException } from '@nestjs/common';
import { TokenRegistryEntry } from 'src/common/entities/market-making/token-registry-entry.entity';

import { TokenRegistryService } from './token-registry.service';

describe('TokenRegistryService', () => {
  const rows = new Map<string, TokenRegistryEntry>();
  const repository = {
    create: jest.fn((value: TokenRegistryEntry) => value),
    save: jest.fn(async (value: TokenRegistryEntry) => {
      rows.set(value.assetId, value);

      return value;
    }),
    findOneBy: jest.fn(async (where: Partial<TokenRegistryEntry>) => {
      return (
        [...rows.values()].find((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof TokenRegistryEntry] === value,
          ),
        ) || null
      );
    }),
  };

  beforeEach(() => {
    rows.clear();
    jest.clearAllMocks();
  });

  it('resolves registered ERC20 and native asset ids', async () => {
    const service = new TokenRegistryService(repository as any);

    await service.upsert({
      assetId: 'USDC_1_0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chainId: 1,
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
    });
    await service.upsert({
      assetId: 'ETH_1',
      chainId: 1,
      contractAddress: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      decimals: 18,
      isNative: true,
    });

    await expect(
      service.resolveAssetId(
        1,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      ),
    ).resolves.toBe(
      'USDC_1_0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    );
    await expect(service.resolveNativeAssetId(1)).resolves.toBe('ETH_1');
  });

  it('rejects unknown token mappings', async () => {
    const service = new TokenRegistryService(repository as any);

    await expect(
      service.resolveAssetId(1, '0x0000000000000000000000000000000000000001'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

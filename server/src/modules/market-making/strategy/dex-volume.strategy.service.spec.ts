import { Test, TestingModule } from '@nestjs/testing';
import { BigNumber, ethers } from 'ethers';
import { DexAdapterRegistry } from 'src/defi/adapter-registry';
import { ensureAllowance, readDecimals } from 'src/defi/utils/erc20';
import { Web3Service } from 'src/modules/web3/web3.service';

import { DexVolumeStrategyService } from './dex-volume.strategy.service';

jest.mock('src/defi/utils/erc20', () => ({
  ensureAllowance: jest.fn().mockResolvedValue(undefined),
  readDecimals: jest.fn().mockResolvedValue(6),
}));

describe('DexVolumeStrategyService', () => {
  let service: DexVolumeStrategyService;
  const provider = {} as ethers.providers.Provider;

  const signer = {
    provider,
    getAddress: jest
      .fn()
      .mockResolvedValue('0x0000000000000000000000000000000000000009'),
  };

  const mockAdapter = {
    supportsChain: jest.fn().mockReturnValue(true),
    getPool: jest
      .fn()
      .mockResolvedValue('0x0000000000000000000000000000000000000010'),
    quoteExactInputSingle: jest.fn().mockResolvedValue({
      amountOut: BigNumber.from('1000000'),
    }),
    getAddresses: jest.fn().mockReturnValue({
      factory: '0x0000000000000000000000000000000000000020',
      router: '0x0000000000000000000000000000000000000030',
      quoterV2: '0x0000000000000000000000000000000000000040',
      weth: '0x0000000000000000000000000000000000000050',
    }),
    exactInputSingle: jest.fn().mockResolvedValue({
      transactionHash: '0xtesthash',
    }),
  };

  const mockRegistry = {
    get: jest.fn().mockReturnValue(mockAdapter),
  };
  const mockWeb3 = {
    getSigner: jest.fn().mockReturnValue(signer),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DexVolumeStrategyService,
        { provide: DexAdapterRegistry, useValue: mockRegistry },
        { provide: Web3Service, useValue: mockWeb3 },
      ],
    }).compile();

    service = module.get<DexVolumeStrategyService>(DexVolumeStrategyService);
    jest.clearAllMocks();
    mockRegistry.get.mockReturnValue(mockAdapter);
    mockAdapter.supportsChain.mockReturnValue(true);
    mockAdapter.getPool.mockResolvedValue(
      '0x0000000000000000000000000000000000000010',
    );
    mockAdapter.quoteExactInputSingle.mockResolvedValue({
      amountOut: BigNumber.from('1000000'),
    });
    mockAdapter.exactInputSingle.mockResolvedValue({
      transactionHash: '0xtesthash',
    });
    mockWeb3.getSigner.mockReturnValue(signer);
    (readDecimals as jest.Mock).mockResolvedValue(6);
    (ensureAllowance as jest.Mock).mockResolvedValue(undefined);
  });

  it('executes one dex volume cycle via adapter registry', async () => {
    const result = await service.executeCycle({
      dexId: 'uniswapV3',
      chainId: 1,
      tokenIn: '0x0000000000000000000000000000000000000001',
      tokenOut: '0x0000000000000000000000000000000000000002',
      feeTier: 3000,
      baseTradeAmount: 1,
      baseIncrementPercentage: 0.1,
      pricePushRate: 0,
      executedTrades: 0,
      side: 'buy',
      slippageBps: 100,
    });

    expect(mockRegistry.get).toHaveBeenCalledWith('uniswapV3');
    expect(mockAdapter.quoteExactInputSingle).toHaveBeenCalledTimes(1);
    expect(ensureAllowance).toHaveBeenCalledTimes(1);
    expect(mockAdapter.exactInputSingle).toHaveBeenCalledTimes(1);
    expect(result.txHash).toBe('0xtesthash');
  });

  it('throws when no pool exists for pair+fee', async () => {
    mockAdapter.getPool.mockResolvedValue(ethers.constants.AddressZero);

    await expect(
      service.executeCycle({
        dexId: 'uniswapV3',
        chainId: 1,
        tokenIn: '0x0000000000000000000000000000000000000001',
        tokenOut: '0x0000000000000000000000000000000000000002',
        feeTier: 3000,
        baseTradeAmount: 1,
        baseIncrementPercentage: 0.1,
        pricePushRate: 0,
        executedTrades: 0,
        side: 'buy',
      }),
    ).rejects.toThrow('No v3 pool found');
  });
});

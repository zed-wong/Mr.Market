import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

import {
  getInfoFromChainId,
  getTokenSymbolByContractAddress,
} from './blockchain-utils';

jest.mock('axios');

jest.mock('ethers', () => ({
  ethers: {
    providers: {
      JsonRpcProvider: jest.fn((rpcUrl: string) => ({ rpcUrl })),
    },
    Contract: jest.fn(
      (_address: string, _abi: string[], provider: { rpcUrl: string }) => ({
        symbol: jest.fn(async () => {
          if (provider.rpcUrl === 'https://rpc-1.example') {
            throw new Error('rpc-1 failed');
          }

          return 'USDT';
        }),
      }),
    ),
  },
}));

describe('blockchain-utils', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  const mockedEthers = jest.requireMock('ethers') as {
    ethers: {
      providers: {
        JsonRpcProvider: jest.Mock;
      };
      Contract: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to the next RPC URL when one RPC fails', async () => {
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          chainId: 1,
          rpc: ['https://rpc-1.example', 'https://rpc-2.example'],
        },
      ],
    });

    const symbol = await getTokenSymbolByContractAddress(
      '0x0000000000000000000000000000000000000001',
      1,
    );

    expect(symbol).toBe('USDT');
    expect(mockedEthers.ethers.providers.JsonRpcProvider).toHaveBeenCalledTimes(
      2,
    );
    expect(
      mockedEthers.ethers.providers.JsonRpcProvider,
    ).toHaveBeenNthCalledWith(1, 'https://rpc-1.example');
    expect(
      mockedEthers.ethers.providers.JsonRpcProvider,
    ).toHaveBeenNthCalledWith(2, 'https://rpc-2.example');
  });

  it('throws bad request when chain id cannot be found', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] });

    await expect(getInfoFromChainId(999999)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

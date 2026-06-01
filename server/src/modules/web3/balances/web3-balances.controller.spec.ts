import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';

import { Web3BalancesController } from './web3-balances.controller';

describe('Web3BalancesController', () => {
  const service = {
    getBalances: jest.fn(),
  };

  let controller: Web3BalancesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new Web3BalancesController(service as never);
  });

  it('uses the web3 namespace', () => {
    expect(Reflect.getMetadata(PATH_METADATA, Web3BalancesController)).toBe(
      'web3',
    );
  });

  it('binds balances to the authenticated user', async () => {
    service.getBalances.mockResolvedValueOnce({ available: [] });

    await controller.getBalances({ user: { userId: 'user-1' } });

    expect(service.getBalances).toHaveBeenCalledWith('user-1');
  });

  it('rejects balances when the authenticated user is absent', async () => {
    await expect(controller.getBalances({ user: {} })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.getBalances).not.toHaveBeenCalled();
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';

import { Web3WithdrawController } from './web3-withdraw.controller';

describe('Web3WithdrawController', () => {
  const service = {
    createWithdrawal: jest.fn(),
    getWithdrawal: jest.fn(),
  };

  let controller: Web3WithdrawController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new Web3WithdrawController(service as never);
  });

  it('uses the web3 namespace', () => {
    expect(Reflect.getMetadata(PATH_METADATA, Web3WithdrawController)).toBe(
      'web3',
    );
  });

  it('binds withdrawal requests to the authenticated web3 user and wallet', async () => {
    service.createWithdrawal.mockResolvedValueOnce({
      withdrawalId: 'withdrawal-1',
      status: 'blocked',
    });
    const body = {
      chainId: 11155111,
      tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      amount: '2.5',
      idempotencyKey: 'request-1',
    };

    await controller.createWithdrawal(body, {
      user: {
        userId: 'user-1',
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(service.createWithdrawal).toHaveBeenCalledWith(
      'user-1',
      '0x1111111111111111111111111111111111111111',
      body,
    );
  });

  it('binds withdrawal status lookup to the authenticated owner', async () => {
    service.getWithdrawal.mockResolvedValueOnce({
      withdrawalId: 'withdrawal-1',
      status: 'submitted',
    });

    await controller.getWithdrawal('withdrawal-1', {
      user: {
        userId: 'user-1',
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(service.getWithdrawal).toHaveBeenCalledWith(
      'user-1',
      'withdrawal-1',
    );
  });

  it('rejects withdrawal creation when the authenticated web3 user is absent', async () => {
    await expect(
      controller.createWithdrawal({}, { user: { userId: 'user-1' } }),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.createWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects status lookup when the authenticated web3 user is absent', async () => {
    await expect(
      controller.getWithdrawal('withdrawal-1', { user: {} }),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.getWithdrawal).not.toHaveBeenCalled();
  });
});

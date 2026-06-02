import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';

import { Web3WithdrawController } from './web3-withdraw.controller';

describe('Web3WithdrawController', () => {
  const service = {
    createWithdrawalRequest: jest.fn(),
    getWithdrawal: jest.fn(),
    verifyWithdrawalTransaction: jest.fn(),
  };

  let controller: Web3WithdrawController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new Web3WithdrawController(service as never);
  });

  it('uses the withdrawal request namespace', () => {
    expect(Reflect.getMetadata(PATH_METADATA, Web3WithdrawController)).toBe(
      'web3/withdrawal-requests',
    );
  });

  it('binds request creation to the authenticated web3 user and wallet', async () => {
    service.createWithdrawalRequest.mockResolvedValueOnce({ withdrawalId: 'withdrawal-1' });
    const body = { orderId: 'order-1' };

    await controller.createWithdrawalRequest(body, {
      user: {
        userId: 'user-1',
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(service.createWithdrawalRequest).toHaveBeenCalledWith(
      'user-1',
      '0x1111111111111111111111111111111111111111',
      body,
    );
  });

  it('binds verify to the authenticated owner', async () => {
    service.verifyWithdrawalTransaction.mockResolvedValueOnce({ withdrawalId: 'withdrawal-1' });

    await controller.verifyWithdrawalTransaction('withdrawal-1', { txHash: 'tx' }, {
      user: {
        userId: 'user-1',
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(service.verifyWithdrawalTransaction).toHaveBeenCalledWith(
      'user-1',
      'withdrawal-1',
      { txHash: 'tx' },
    );
  });

  it('binds status lookup to the authenticated owner', async () => {
    service.getWithdrawal.mockResolvedValueOnce({ withdrawalId: 'withdrawal-1' });

    await controller.getWithdrawal('withdrawal-1', {
      user: {
        userId: 'user-1',
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(service.getWithdrawal).toHaveBeenCalledWith('user-1', 'withdrawal-1');
  });

  it('rejects request creation when the authenticated web3 user is absent', async () => {
    await expect(
      controller.createWithdrawalRequest({}, { user: { userId: 'user-1' } }),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.createWithdrawalRequest).not.toHaveBeenCalled();
  });
});

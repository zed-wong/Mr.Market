import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';

import { Web3DepositController } from './web3-deposit.controller';

describe('Web3DepositController', () => {
  const service = {
    getInstructions: jest.fn(),
    verifyDeposit: jest.fn(),
  };

  let controller: Web3DepositController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new Web3DepositController(service as never);
  });

  it('uses the web3 deposit namespace', () => {
    expect(Reflect.getMetadata(PATH_METADATA, Web3DepositController)).toBe(
      'web3/deposit',
    );
  });

  it('returns instructions for the requested chain', () => {
    service.getInstructions.mockReturnValueOnce({ chainId: 11155111 });

    expect(controller.getInstructions('11155111')).toEqual({
      chainId: 11155111,
    });
    expect(service.getInstructions).toHaveBeenCalledWith('11155111');
  });

  it('binds deposit verification to the authenticated web3 user', async () => {
    service.verifyDeposit.mockResolvedValueOnce({
      deposit: { status: 'credited' },
    });
    const body = {
      chainId: 11155111,
      txHash: `0x${'a'.repeat(64)}`,
      tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      amount: '12.34',
    };

    await controller.verifyDeposit(body, {
      user: {
        userId: 'user-1',
        address: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(service.verifyDeposit).toHaveBeenCalledWith(
      'user-1',
      '0x1111111111111111111111111111111111111111',
      body,
    );
  });

  it('rejects verification when the authenticated web3 user is absent', async () => {
    await expect(
      controller.verifyDeposit({}, { user: { userId: 'user-1' } }),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.verifyDeposit).not.toHaveBeenCalled();
  });
});

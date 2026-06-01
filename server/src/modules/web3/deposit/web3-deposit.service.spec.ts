import { BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';

import { Web3DepositService } from './web3-deposit.service';

describe('Web3DepositService', () => {
  const receiverAddress = '0x2222222222222222222222222222222222222222';
  const authenticatedWallet = '0x1111111111111111111111111111111111111111';
  const sepoliaUsdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const txHash = `0x${'a'.repeat(64)}`;

  const buildService = (params?: {
    verified?: boolean;
    ledgerApplied?: boolean;
  }) => {
    const web3Service = {
      getOperatorAddress: jest.fn(() => receiverAddress),
      verifyTransactionDetails: jest.fn(async () => params?.verified ?? true),
    };
    const balanceLedgerService = {
      creditDeposit: jest.fn(async (command) => ({
        applied: params?.ledgerApplied ?? true,
        entry: {
          entryId: 'ledger-entry-1',
          ...command,
        },
        balance: {
          orderId: command.orderId,
          userId: command.userId,
          assetId: command.assetId,
          available: command.amount,
          locked: '0',
          total: command.amount,
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      })),
    };
    const service = new Web3DepositService(
      web3Service as never,
      balanceLedgerService as never,
    );

    return { service, web3Service, balanceLedgerService };
  };

  it('returns chain-specific receiving instructions and supported tokens', () => {
    const { service, web3Service } = buildService();

    const result = service.getInstructions('11155111');

    expect(web3Service.getOperatorAddress).toHaveBeenCalledWith(11155111);
    expect(result).toMatchObject({
      namespace: '/web3/deposit',
      chainId: 11155111,
      receiverAddress,
    });
    expect(result.supportedTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chainId: 11155111,
          symbol: 'USDC',
          tokenAddress: sepoliaUsdc,
          decimals: 6,
        }),
      ]),
    );
  });

  it('rejects unsupported chains with a validation error', () => {
    const { service } = buildService();

    expect(() => service.getInstructions('999999')).toThrow(
      BadRequestException,
    );
  });

  it('verifies a deposit transaction and credits the authenticated user ledger', async () => {
    const { service, web3Service, balanceLedgerService } = buildService();

    const result = await service.verifyDeposit('user-1', authenticatedWallet, {
      chainId: '11155111',
      txHash,
      tokenAddress: sepoliaUsdc.toLowerCase(),
      amount: '12.34',
    });

    expect(web3Service.verifyTransactionDetails).toHaveBeenCalledWith(
      11155111,
      txHash,
      sepoliaUsdc,
      receiverAddress,
      ethers.utils.parseUnits('12.34', 6),
      authenticatedWallet,
    );
    expect(balanceLedgerService.creditDeposit).toHaveBeenCalledWith({
      orderId: 'web3:wallet:user-1',
      userId: 'user-1',
      assetId: 'evm:11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
      amount: '12.34',
      idempotencyKey: `web3:deposit:tx:11155111:${txHash}`,
      refType: 'web3_wallet_deposit',
      refId: txHash,
    });
    expect(result.deposit).toMatchObject({
      status: 'credited',
      applied: true,
      chainId: 11155111,
      txHash,
      tokenAddress: sepoliaUsdc,
      amount: '12.34',
      receiverAddress,
      fromAddress: authenticatedWallet,
      ledgerEntryId: 'ledger-entry-1',
    });
  });

  it('returns an idempotent response when the ledger already credited the tx hash', async () => {
    const { service } = buildService({ ledgerApplied: false });

    const result = await service.verifyDeposit('user-1', authenticatedWallet, {
      chainId: 11155111,
      txHash,
      tokenAddress: sepoliaUsdc,
      amount: '12.34',
    });

    expect(result.deposit.status).toBe('already_credited');
    expect(result.deposit.applied).toBe(false);
  });

  it('does not credit the ledger when chain verification fails', async () => {
    const { service, balanceLedgerService } = buildService({
      verified: false,
    });

    await expect(
      service.verifyDeposit('user-1', authenticatedWallet, {
        chainId: 11155111,
        txHash,
        tokenAddress: sepoliaUsdc,
        amount: '12.34',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(balanceLedgerService.creditDeposit).not.toHaveBeenCalled();
  });

  it('rejects unsupported tokens and invalid amount precision', async () => {
    const { service } = buildService();

    await expect(
      service.verifyDeposit('user-1', authenticatedWallet, {
        chainId: 11155111,
        txHash,
        tokenAddress: '0x3333333333333333333333333333333333333333',
        amount: '12.34',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.verifyDeposit('user-1', authenticatedWallet, {
        chainId: 11155111,
        txHash,
        tokenAddress: sepoliaUsdc,
        amount: '0.0000001',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

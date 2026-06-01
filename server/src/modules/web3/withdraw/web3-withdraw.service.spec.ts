import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ethers } from 'ethers';

import { Web3WithdrawService } from './web3-withdraw.service';

describe('Web3WithdrawService', () => {
  const userId = 'user-1';
  const recipientAddress = '0x1111111111111111111111111111111111111111';
  const sepoliaUsdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const assetId = 'evm:11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';
  const token = {
    chainId: 11155111,
    assetId,
    symbol: 'USDC',
    name: 'USD Coin (Sepolia)',
    tokenAddress: sepoliaUsdc,
    decimals: 6,
  };

  const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }

    const objectValue = value as Record<string, unknown>;

    return `{${Object.keys(objectValue)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`,
      )
      .join(',')}}`;
  };

  const buildPayloadHash = (amount = '2.5') =>
    ethers.utils
      .sha256(
        ethers.utils.toUtf8Bytes(
          stableStringify({
            userId,
            chainId: 11155111,
            tokenAddress: sepoliaUsdc.toLowerCase(),
            assetId,
            amount,
            recipientAddress,
          }),
        ),
      )
      .slice(2);

  const buildExistingWithdrawal = (overrides = {}) => ({
    withdrawalId: 'withdrawal-1',
    userId,
    chainId: 11155111,
    tokenAddress: sepoliaUsdc,
    assetId,
    amount: '2.5',
    recipientAddress,
    status: 'submitted',
    idempotencyKey: 'web3:withdraw:user-1:request-1',
    payloadHash: buildPayloadHash(),
    ledgerDebitIdempotencyKey: 'web3:withdraw:user-1:request-1:ledger',
    ledgerEntryId: 'ledger-entry-1',
    txHash: `0x${'b'.repeat(64)}`,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:01.000Z',
    ...overrides,
  });

  const buildService = (params?: {
    existingWithdrawal?: unknown;
    available?: string;
    signer?: unknown;
    transferError?: Error;
  }) => {
    const withdrawalRepository = {
      findOneBy: jest.fn(async () => params?.existingWithdrawal || null),
      create: jest.fn((entity) => ({ ...entity })),
      save: jest.fn(async (entity) => entity),
    };
    const orderBalanceRepository = {
      findOne: jest.fn(async () => ({
        orderId: 'web3:wallet:user-1',
        userId,
        assetId,
        available: params?.available ?? '10',
        locked: '0',
        total: params?.available ?? '10',
        initialDeposit: params?.available ?? '10',
        realizedDelta: '0',
        feePaid: '0',
        updatedAt: '2026-06-01T00:00:00.000Z',
      })),
    };
    const web3Service = {
      getSigner: jest.fn(() => params?.signer),
      transferErc20: jest.fn(async () => {
        if (params?.transferError) {
          throw params.transferError;
        }

        return { txHash: `0x${'c'.repeat(64)}` };
      }),
    };
    const web3DepositService = {
      resolveSupportedTokenForChain: jest.fn(() => token),
    };
    const balanceLedgerService = {
      debitWithdrawal: jest.fn(async (command) => ({
        applied: true,
        entry: {
          entryId: 'ledger-entry-1',
          ...command,
        },
        balance: {
          orderId: command.orderId,
          userId: command.userId,
          assetId: command.assetId,
          available: '7.5',
          locked: '0',
          total: '7.5',
          initialDeposit: '10',
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-06-01T00:00:01.000Z',
        },
      })),
    };
    const service = new Web3WithdrawService(
      withdrawalRepository as never,
      orderBalanceRepository as never,
      web3Service as never,
      web3DepositService as never,
      balanceLedgerService as never,
    );

    return {
      service,
      withdrawalRepository,
      orderBalanceRepository,
      web3Service,
      web3DepositService,
      balanceLedgerService,
    };
  };

  it('rejects insufficient available wallet balance before debiting the ledger', async () => {
    const { service, balanceLedgerService, withdrawalRepository } =
      buildService({ available: '1' });

    await expect(
      service.createWithdrawal(userId, recipientAddress, {
        chainId: 11155111,
        tokenAddress: sepoliaUsdc,
        amount: '2.5',
        idempotencyKey: 'request-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(balanceLedgerService.debitWithdrawal).not.toHaveBeenCalled();
    expect(withdrawalRepository.save).not.toHaveBeenCalled();
  });

  it('records a wallet ledger debit and blocked status when no signer is configured', async () => {
    const { service, balanceLedgerService, withdrawalRepository, web3Service } =
      buildService();

    const result = await service.createWithdrawal(userId, recipientAddress, {
      chainId: 11155111,
      tokenAddress: sepoliaUsdc.toLowerCase(),
      amount: '2.5',
      idempotencyKey: 'request-1',
    });

    expect(balanceLedgerService.debitWithdrawal).toHaveBeenCalledWith({
      orderId: 'web3:wallet:user-1',
      userId,
      assetId,
      amount: '2.5',
      idempotencyKey: 'web3:withdraw:user-1:request-1:ledger',
      refType: 'web3_wallet_withdrawal',
      refId: expect.any(String),
    });
    expect(web3Service.getSigner).toHaveBeenCalledWith(11155111);
    expect(web3Service.transferErc20).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      namespace: '/web3/withdraw',
      status: 'blocked',
      txHash: null,
      failureReason: 'Web3 signer is not configured for chain 11155111',
      withdrawal: {
        chainId: 11155111,
        assetId,
        amount: '2.5',
        ledgerEntryId: 'ledger-entry-1',
        status: 'blocked',
      },
      balance: {
        orderId: 'web3:wallet:user-1',
        available: '7.5',
      },
    });
    expect(withdrawalRepository.save).toHaveBeenCalledTimes(2);
  });

  it('submits an ERC-20 transfer through the configured web3 signer', async () => {
    const { service, web3Service } = buildService({ signer: { provider: {} } });

    const result = await service.createWithdrawal(userId, recipientAddress, {
      chainId: 11155111,
      tokenAddress: sepoliaUsdc,
      amount: '2.5',
      idempotencyKey: 'request-1',
    });

    expect(web3Service.transferErc20).toHaveBeenCalledWith(
      11155111,
      sepoliaUsdc,
      recipientAddress,
      ethers.utils.parseUnits('2.5', 6),
    );
    expect(result.status).toBe('submitted');
    expect(result.txHash).toBe(`0x${'c'.repeat(64)}`);
  });

  it('records failed status and failure evidence when transfer submission fails', async () => {
    const { service } = buildService({
      signer: { provider: {} },
      transferError: new Error('rpc rejected transfer'),
    });

    const result = await service.createWithdrawal(userId, recipientAddress, {
      chainId: 11155111,
      tokenAddress: sepoliaUsdc,
      amount: '2.5',
      idempotencyKey: 'request-1',
    });

    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('rpc rejected transfer');
  });

  it('returns an idempotent replay without debiting the ledger again', async () => {
    const { service, balanceLedgerService, orderBalanceRepository } =
      buildService({
        existingWithdrawal: buildExistingWithdrawal(),
      });

    const result = await service.createWithdrawal(userId, recipientAddress, {
      chainId: 11155111,
      tokenAddress: sepoliaUsdc,
      amount: '2.5',
      idempotencyKey: 'request-1',
    });

    expect(result.status).toBe('submitted');
    expect(result.txHash).toBe(`0x${'b'.repeat(64)}`);
    expect(balanceLedgerService.debitWithdrawal).not.toHaveBeenCalled();
    expect(orderBalanceRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects idempotency key reuse with a different payload', async () => {
    const { service } = buildService({
      existingWithdrawal: buildExistingWithdrawal({ payloadHash: 'different' }),
    });

    await expect(
      service.createWithdrawal(userId, recipientAddress, {
        chainId: 11155111,
        tokenAddress: sepoliaUsdc,
        amount: '2.5',
        idempotencyKey: 'request-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('enforces withdrawal ownership on status lookups', async () => {
    const { service } = buildService({
      existingWithdrawal: buildExistingWithdrawal({ userId: 'other-user' }),
    });

    await expect(service.getWithdrawal(userId, 'withdrawal-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns tx evidence for the authenticated withdrawal owner', async () => {
    const { service } = buildService({
      existingWithdrawal: buildExistingWithdrawal(),
    });

    const result = await service.getWithdrawal(userId, 'withdrawal-1');

    expect(result).toMatchObject({
      withdrawalId: 'withdrawal-1',
      status: 'submitted',
      txHash: `0x${'b'.repeat(64)}`,
      withdrawal: {
        ledgerEntryId: 'ledger-entry-1',
        failureReason: null,
      },
    });
  });
});

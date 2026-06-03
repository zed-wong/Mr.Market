import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ethers } from 'ethers';

import { MR_MARKET_ROUTER_ABI } from '../contracts/mr-market-router.abi';
import { Web3WithdrawService } from './web3-withdraw.service';

describe('Web3WithdrawService', () => {
  const userId = 'user-1';
  const walletAddress = '0x1111111111111111111111111111111111111111';
  const routerAddress = '0x2222222222222222222222222222222222222222';
  const recipientAddress = '0x3333333333333333333333333333333333333333';
  const sepoliaUsdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const assetId = 'evm:11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238';
  const orderId = 'order-1';
  const token = {
    chainId: 11155111,
    assetId,
    symbol: 'USDC',
    name: 'USD Coin (Sepolia)',
    tokenAddress: sepoliaUsdc,
    decimals: 6,
  };
  const routerInterface = new ethers.utils.Interface([...MR_MARKET_ROUTER_ABI]);

  const buildService = (params?: {
    available?: string;
    signer?: unknown;
    transferError?: Error;
    existingWithdrawal?: unknown;
  }) => {
    const withdrawalRows = new Map<string, Record<string, unknown>>();

    if (params?.existingWithdrawal) {
      withdrawalRows.set(
        String(
          (params.existingWithdrawal as { withdrawalId: string }).withdrawalId,
        ),
        params.existingWithdrawal as Record<string, unknown>,
      );
    }
    const eventRows: Record<string, unknown>[] = [];
    const withdrawalRepository = {
      findOneBy: jest.fn(async (where) => {
        if (where.withdrawalId)
          return withdrawalRows.get(String(where.withdrawalId)) || null;
        if (where.idempotencyKey) {
          return (
            [...withdrawalRows.values()].find(
              (row) => row.idempotencyKey === where.idempotencyKey,
            ) || null
          );
        }

        return null;
      }),
      create: jest.fn((entity) => ({ ...entity })),
      save: jest.fn(async (entity) => {
        withdrawalRows.set(String(entity.withdrawalId), entity);

        return entity;
      }),
    };
    const orderBalanceRepository = {
      findOne: jest.fn(async () => ({
        orderId,
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
    const eventLogRepository = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => {
        eventRows.push(row);

        return row;
      }),
      findOne: jest.fn(
        async ({ where }) =>
          eventRows.find(
            (row) =>
              row.chainId === where.chainId &&
              row.txHash === where.txHash &&
              row.logIndex === where.logIndex,
          ) || null,
      ),
    };
    const web3Service = {
      getSigner: jest.fn(() => params?.signer),
      getCurrentBlockNumber: jest.fn(async () => 90),
      getTransactionReceipt: jest.fn(),
      transferErc20: jest.fn(async () => {
        if (params?.transferError) throw params.transferError;

        return { txHash: `0x${'d'.repeat(64)}` };
      }),
    };
    const web3DepositService = {
      resolveSupportedTokenForChain: jest.fn(() => token),
    };
    const balanceLedgerService = {
      debitWithdrawal: jest.fn(async (command) => ({
        applied: true,
        entry: { entryId: 'ledger-entry-1', ...command },
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
      debitFee: jest.fn(),
    };
    const userOrdersService = {
      findOwnedMarketMakingByOrderId: jest.fn(async () => ({
        orderId,
        userId,
        source: 'payment_flow',
      })),
    };
    const service = new Web3WithdrawService(
      withdrawalRepository as never,
      orderBalanceRepository as never,
      eventLogRepository as never,
      web3Service as never,
      web3DepositService as never,
      balanceLedgerService as never,
      userOrdersService as never,
    );

    return {
      service,
      withdrawalRows,
      withdrawalRepository,
      orderBalanceRepository,
      eventLogRepository,
      web3Service,
      balanceLedgerService,
      userOrdersService,
    };
  };

  const createRequest = async (service: Web3WithdrawService) =>
    await service.createWithdrawalRequest(userId, walletAddress, {
      orderId,
      chainId: 11155111,
      routerAddress,
      tokenAddress: sepoliaUsdc,
      amount: '2.5',
      recipientAddress,
      idempotencyKey: 'request-1',
    });

  it('prepares a Router withdrawal request without debiting the ledger', async () => {
    const { service, balanceLedgerService } = buildService();

    const result = await createRequest(service);

    expect(result.namespace).toBe('/web3/withdrawal-requests');
    expect(result.status).toBe('created');
    expect(result.withdrawal).toMatchObject({
      userId,
      orderId,
      chainId: 11155111,
      routerAddress,
      tokenAddress: sepoliaUsdc,
      amount: '2.5',
      recipientAddress,
      feeAmount: '0',
      startBlockNumber: 90,
      ledgerEntryId: null,
    });
    expect(result.routerCall).toMatchObject({
      functionName: 'requestWithdrawal',
      routerAddress,
      tokenAddress: sepoliaUsdc,
      amount: '2.5',
      amountBaseUnits: ethers.utils.parseUnits('2.5', 6).toString(),
      recipientAddress,
    });
    expect(result.withdrawalId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(balanceLedgerService.debitWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects insufficient order balance before creating a request', async () => {
    const { service, withdrawalRepository } = buildService({ available: '1' });

    await expect(createRequest(service)).rejects.toThrow(BadRequestException);
    expect(withdrawalRepository.save).not.toHaveBeenCalled();
  });

  it('processes a matching WithdrawalRequested event then debits ledger and submits payout', async () => {
    const { service, web3Service, balanceLedgerService } = buildService({
      signer: { provider: {} },
    });
    const prepared = await createRequest(service);
    const event = routerInterface.encodeEventLog(
      routerInterface.getEvent('WithdrawalRequested'),
      [
        prepared.withdrawalId,
        walletAddress,
        sepoliaUsdc,
        ethers.utils.parseUnits('2.5', 6),
        recipientAddress,
        prepared.routerCall?.payloadHash,
      ],
    );

    web3Service.getTransactionReceipt.mockResolvedValue({
      status: 1,
      transactionHash: `0x${'c'.repeat(64)}`,
      blockNumber: 101,
      logs: [
        {
          address: routerAddress,
          topics: event.topics,
          data: event.data,
          logIndex: 2,
        },
      ],
    });

    const result = await service.verifyWithdrawalTransaction(
      userId,
      prepared.withdrawalId,
      {
        txHash: `0x${'c'.repeat(64)}`,
      },
    );

    expect(balanceLedgerService.debitWithdrawal).toHaveBeenCalledWith({
      orderId,
      userId,
      assetId,
      amount: '2.5',
      idempotencyKey: 'web3:withdrawal-request:user-1:request-1:ledger',
      refType: 'web3_order_withdrawal',
      refId: prepared.withdrawalId,
    });
    expect(web3Service.transferErc20).toHaveBeenCalledWith(
      11155111,
      sepoliaUsdc,
      recipientAddress,
      ethers.utils.parseUnits('2.5', 6),
    );
    expect(result).toMatchObject({
      applied: true,
      status: 'submitted',
      requestTxHash: `0x${'c'.repeat(64)}`,
      payoutTxHash: `0x${'d'.repeat(64)}`,
      withdrawal: {
        ledgerEntryId: 'ledger-entry-1',
        requestLogIndex: 2,
      },
    });
  });

  it('blocks payout after ledger debit when no server signer is configured', async () => {
    const { service } = buildService();
    const prepared = await createRequest(service);

    const result = await service.recordWithdrawalRequestedEvent({
      chainId: 11155111,
      requestId: prepared.withdrawalId,
      user: walletAddress,
      token: sepoliaUsdc,
      amount: ethers.utils.parseUnits('2.5', 6).toString(),
      recipient: recipientAddress,
      payloadHash: prepared.routerCall?.payloadHash,
      routerAddress,
      txHash: `0x${'e'.repeat(64)}`,
      logIndex: 0,
    });

    expect(result.status).toBe('blocked');
    expect(result.failureReason).toBe(
      'Web3 signer is not configured for chain 11155111',
    );
  });

  it('rejects mismatched event evidence before ledger debit', async () => {
    const { service, balanceLedgerService } = buildService();
    const prepared = await createRequest(service);

    await expect(
      service.recordWithdrawalRequestedEvent({
        chainId: 11155111,
        requestId: prepared.withdrawalId,
        user: walletAddress,
        token: sepoliaUsdc,
        amount: ethers.utils.parseUnits('1', 6).toString(),
        recipient: recipientAddress,
        payloadHash: prepared.routerCall?.payloadHash,
        routerAddress,
        txHash: `0x${'f'.repeat(64)}`,
        logIndex: 0,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(balanceLedgerService.debitWithdrawal).not.toHaveBeenCalled();
  });

  it('returns idempotent replay of the prepared request', async () => {
    const { service, balanceLedgerService } = buildService();
    const first = await createRequest(service);
    const second = await createRequest(service);

    expect(second.withdrawalId).toBe(first.withdrawalId);
    expect(balanceLedgerService.debitWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects idempotency key reuse with a different payload', async () => {
    const { service } = buildService();

    await createRequest(service);

    await expect(
      service.createWithdrawalRequest(userId, walletAddress, {
        orderId,
        chainId: 11155111,
        routerAddress,
        tokenAddress: sepoliaUsdc,
        amount: '3',
        recipientAddress,
        idempotencyKey: 'request-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('enforces withdrawal ownership on status lookups', async () => {
    const { service } = buildService();
    const prepared = await createRequest(service);

    await expect(
      service.getWithdrawal('other-user', prepared.withdrawalId),
    ).rejects.toThrow(ForbiddenException);
  });
});

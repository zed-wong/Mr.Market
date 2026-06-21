import { BigNumber } from 'ethers';

import { EvmReceiptConfirmerService } from './evm-receipt-confirmer.service';

describe('EvmReceiptConfirmerService', () => {
  it('marks submitted executions confirmed after required confirmations', async () => {
    const execution = {
      id: 'execution-1',
      status: 'submitted',
      txHash: '0xtx',
      tradingAccountId: 'account-1',
      chainId: 1,
      requiredConfirmations: 3,
    };
    const evmExecutionService = {
      requireById: jest.fn().mockResolvedValue(execution),
      markConfirmed: jest.fn(async (_id, command) => ({
        ...execution,
        status: 'confirmed',
        ...command,
      })),
    };
    const provider = {
      getTransactionReceipt: jest.fn().mockResolvedValue({
        transactionHash: '0xtx',
        blockNumber: 10,
        status: 1,
        logs: [],
        gasUsed: BigNumber.from(21_000),
        effectiveGasPrice: BigNumber.from(100),
      }),
      getBlockNumber: jest.fn().mockResolvedValue(12),
    };
    const tradingAccountService = {
      getSigner: jest.fn().mockResolvedValue({ provider }),
    };
    const configService = {
      get: jest.fn((_key, defaultValue) => defaultValue),
    };
    const service = new EvmReceiptConfirmerService(
      evmExecutionService as any,
      tradingAccountService as any,
      configService as any,
    );

    await service.confirmExecution('execution-1');

    expect(evmExecutionService.markConfirmed).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({
        blockNumber: 10,
        confirmationCount: 3,
        gasUsed: '21000',
        gasPrice: '100',
        effectiveGasCost: '2100000',
      }),
    );
  });

  it('exposes per-chain confirmation policy defaults', () => {
    const service = new EvmReceiptConfirmerService(
      {} as any,
      {} as any,
      { get: jest.fn((_key, defaultValue) => defaultValue) } as any,
    );

    expect(service.getConfirmationPolicy(1)).toMatchObject({
      requiredConfirmations: 12,
      pollIntervalMs: 12_000,
    });
    expect(service.getConfirmationPolicy(56)).toMatchObject({
      requiredConfirmations: 15,
      pollIntervalMs: 3_000,
    });
    expect(service.getConfirmationPolicy(137)).toMatchObject({
      requiredConfirmations: 20,
      pollIntervalMs: 2_000,
    });
  });

  it('routes stuck pending executions to manual review', async () => {
    const execution = {
      id: 'execution-1',
      status: 'submitted',
      txHash: '0xtx',
      tradingAccountId: 'account-1',
      chainId: 1,
      requiredConfirmations: 3,
      firstPendingBlockNumber: 10,
    };
    const evmExecutionService = {
      requireById: jest.fn().mockResolvedValue(execution),
      recordPendingObservation: jest.fn(async () => execution),
      markManualReview: jest.fn(async (_id, reason) => ({
        ...execution,
        status: 'manual_review',
        manualReviewReason: reason,
      })),
    };
    const provider = {
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
      getBlockNumber: jest.fn().mockResolvedValue(36),
    };
    const tradingAccountService = {
      getSigner: jest.fn().mockResolvedValue({ provider }),
    };
    const service = new EvmReceiptConfirmerService(
      evmExecutionService as any,
      tradingAccountService as any,
      { get: jest.fn((_key, defaultValue) => defaultValue) } as any,
    );

    await service.confirmExecution('execution-1');

    expect(evmExecutionService.markManualReview).toHaveBeenCalledWith(
      'execution-1',
      'stuck_pending',
    );
  });

  it('routes missing confirmed receipts to manual review for reorg handling', async () => {
    const execution = {
      id: 'execution-1',
      status: 'confirmed',
      txHash: '0xtx',
      receiptContentHash: 'hash',
      tradingAccountId: 'account-1',
      chainId: 1,
    };
    const evmExecutionService = {
      requireById: jest.fn().mockResolvedValue(execution),
      markManualReview: jest.fn(async (_id, reason) => ({
        ...execution,
        status: 'manual_review',
        manualReviewReason: reason,
      })),
    };
    const provider = {
      getTransactionReceipt: jest.fn().mockResolvedValue(null),
    };
    const tradingAccountService = {
      getSigner: jest.fn().mockResolvedValue({ provider }),
    };
    const service = new EvmReceiptConfirmerService(
      evmExecutionService as any,
      tradingAccountService as any,
      { get: jest.fn((_key, defaultValue) => defaultValue) } as any,
    );

    await service.monitorConfirmedExecution('execution-1');

    expect(evmExecutionService.markManualReview).toHaveBeenCalledWith(
      'execution-1',
      'reorg_receipt_missing',
    );
  });

  it('routes changed confirmed receipts to manual review for reorg handling', async () => {
    const receipt = {
      transactionHash: '0xtx',
      blockNumber: 10,
      status: 1,
      logs: [],
    };
    const execution = {
      id: 'execution-1',
      status: 'confirmed',
      txHash: '0xtx',
      receiptContentHash: 'old-hash',
      tradingAccountId: 'account-1',
      chainId: 1,
    };
    const evmExecutionService = {
      requireById: jest.fn().mockResolvedValue(execution),
      hashReceiptForComparison: jest.fn().mockReturnValue('new-hash'),
      markManualReview: jest.fn(async (_id, reason) => ({
        ...execution,
        status: 'manual_review',
        manualReviewReason: reason,
      })),
    };
    const provider = {
      getTransactionReceipt: jest.fn().mockResolvedValue(receipt),
    };
    const tradingAccountService = {
      getSigner: jest.fn().mockResolvedValue({ provider }),
    };
    const service = new EvmReceiptConfirmerService(
      evmExecutionService as any,
      tradingAccountService as any,
      { get: jest.fn((_key, defaultValue) => defaultValue) } as any,
    );

    await service.monitorConfirmedExecution('execution-1');

    expect(evmExecutionService.markManualReview).toHaveBeenCalledWith(
      'execution-1',
      'reorg_receipt_changed',
    );
  });
});

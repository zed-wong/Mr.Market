/* eslint-disable @typescript-eslint/no-explicit-any */
import { WithdrawalProcessor } from './withdrawal.processor';

describe('WithdrawalProcessor', () => {
  const buildProcessor = (overrides?: {
    hasEnoughBalance?: boolean;
    executeWithdrawalError?: Error;
    ledgerDebitError?: Error;
  }) => {
    const withdrawal = {
      id: 'withdrawal-1',
      userId: 'user-1',
      assetId: 'asset-usdt',
      amount: 10,
      destination: '0xabc',
      destinationTag: '',
      status: 'pending',
      retryCount: 0,
    };

    const withdrawalService = {
      getWithdrawalById: jest.fn().mockResolvedValue(withdrawal),
      markAsFailed: jest.fn().mockResolvedValue(undefined),
      executeWithdrawal: overrides?.executeWithdrawalError
        ? jest.fn().mockRejectedValue(overrides.executeWithdrawalError)
        : jest.fn().mockResolvedValue([{ request_id: 'mixin-tx-1' }]),
      updateWithdrawalStatus: jest.fn().mockResolvedValue(undefined),
      incrementRetryCount: jest.fn().mockResolvedValue(undefined),
    };

    const walletService = {
      checkMixinBalanceEnough: jest
        .fn()
        .mockResolvedValue(overrides?.hasEnoughBalance ?? true),
    };

    const createQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const withdrawalRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder),
    };

    const balanceLedgerService = {
      debitWithdrawal: overrides?.ledgerDebitError
        ? jest.fn().mockRejectedValue(overrides.ledgerDebitError)
        : jest.fn().mockResolvedValue({ applied: true }),
    };

    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    return {
      processor: new WithdrawalProcessor(
        withdrawalService as any,
        walletService as any,
        withdrawalRepository as any,
        balanceLedgerService as any,
      ),
      withdrawalService,
      balanceLedgerService,
      queue,
    };
  };

  it('debits ledger for successful withdrawal processing', async () => {
    const { processor, balanceLedgerService, queue } = buildProcessor();

    await processor.handleWithdrawal({
      data: { withdrawalId: 'withdrawal-1' },
      queue,
    } as any);

    expect(balanceLedgerService.debitWithdrawal).toHaveBeenCalledWith({
      userId: 'user-1',
      assetId: 'asset-usdt',
      amount: '10',
      idempotencyKey: 'withdrawal-debit:withdrawal-1',
      refType: 'withdrawal_processor',
      refId: 'withdrawal-1',
    });
  });

  it('does not debit ledger when wallet balance is insufficient', async () => {
    const { processor, balanceLedgerService, queue } = buildProcessor({
      hasEnoughBalance: false,
    });

    await processor.handleWithdrawal({
      data: { withdrawalId: 'withdrawal-1' },
      queue,
    } as any);

    expect(balanceLedgerService.debitWithdrawal).not.toHaveBeenCalled();
  });

  it('enqueues ledger debit reconciliation when post-send debit fails', async () => {
    const { processor, withdrawalService, queue } = buildProcessor({
      ledgerDebitError: new Error('ledger offline'),
    });

    await processor.handleWithdrawal({
      data: { withdrawalId: 'withdrawal-1' },
      queue,
    } as any);

    expect(withdrawalService.updateWithdrawalStatus).toHaveBeenCalledWith(
      'withdrawal-1',
      'sent',
      expect.objectContaining({
        errorMessage: expect.stringContaining('LEDGER_DEBIT_PENDING:'),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'reconcile_withdrawal_ledger_debit',
      { withdrawalId: 'withdrawal-1' },
      expect.objectContaining({
        jobId: 'reconcile_ledger_debit_withdrawal-1',
      }),
    );
  });
});

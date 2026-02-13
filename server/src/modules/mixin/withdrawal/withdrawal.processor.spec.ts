import { WithdrawalProcessor } from './withdrawal.processor';

describe('WithdrawalProcessor', () => {
  const buildProcessor = (overrides?: {
    hasEnoughBalance?: boolean;
    executeWithdrawalError?: Error;
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
      debitWithdrawal: jest.fn().mockResolvedValue({ applied: true }),
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
    };
  };

  it('debits ledger for successful withdrawal processing', async () => {
    const { processor, balanceLedgerService } = buildProcessor();

    await processor.handleWithdrawal({
      data: { withdrawalId: 'withdrawal-1' },
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
    const { processor, balanceLedgerService } = buildProcessor({
      hasEnoughBalance: false,
    });

    await processor.handleWithdrawal({
      data: { withdrawalId: 'withdrawal-1' },
    } as any);

    expect(balanceLedgerService.debitWithdrawal).not.toHaveBeenCalled();
  });
});

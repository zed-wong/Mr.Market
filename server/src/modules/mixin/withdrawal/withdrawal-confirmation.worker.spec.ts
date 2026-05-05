/* eslint-disable @typescript-eslint/no-explicit-any */
import { WithdrawalConfirmationWorker } from './withdrawal-confirmation.worker';

describe('WithdrawalConfirmationWorker', () => {
  const buildWorker = (params: {
    withdrawals: any[];
    snapshots: Record<string, any>;
  }) => {
    const withdrawalService = {
      getPendingWithdrawals: jest.fn().mockResolvedValue(params.withdrawals),
      getWithdrawalById: jest.fn(async (id: string) => {
        return params.withdrawals.find((withdrawal) => withdrawal.id === id);
      }),
      updateLastChecked: jest.fn().mockResolvedValue(undefined),
      updateWithdrawalStatus: jest.fn().mockResolvedValue(undefined),
      markAsFailed: jest.fn().mockResolvedValue(undefined),
    };
    const mixinClientService = {
      client: {
        safe: {
          fetchSafeSnapshot: jest.fn(async (txId: string) => {
            return params.snapshots[txId] || null;
          }),
        },
      },
    };
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new WithdrawalConfirmationWorker(
      withdrawalService as any,
      mixinClientService as any,
    );

    return {
      mixinClientService,
      queue,
      withdrawalService,
      worker,
    };
  };

  it('reconciles sent and confirmed withdrawals from Mixin snapshot evidence', async () => {
    const { queue, withdrawalService, worker } = buildWorker({
      withdrawals: [
        {
          id: 'withdrawal-sent',
          status: 'sent',
          mixinTxId: 'mixin-pending',
        },
        {
          id: 'withdrawal-confirmed',
          status: 'confirmed',
          mixinTxId: 'mixin-completed',
        },
      ],
      snapshots: {
        'mixin-pending': {
          confirmations: 0,
          transaction_hash: 'chain-pending',
        },
        'mixin-completed': {
          confirmations: 1,
          transaction_hash: 'chain-completed',
        },
      },
    });

    await worker.handleCheckConfirmations({ queue } as any);

    expect(withdrawalService.updateLastChecked).toHaveBeenCalledWith(
      'withdrawal-sent',
    );
    expect(withdrawalService.updateLastChecked).toHaveBeenCalledWith(
      'withdrawal-confirmed',
    );
    expect(withdrawalService.updateWithdrawalStatus).toHaveBeenCalledWith(
      'withdrawal-sent',
      'confirmed',
      {
        onChainTxId: 'chain-pending',
      },
    );
    expect(withdrawalService.updateWithdrawalStatus).toHaveBeenCalledWith(
      'withdrawal-confirmed',
      'completed',
      {
        onChainTxId: 'chain-completed',
      },
    );
    expect(queue.add).toHaveBeenCalledWith(
      'check_withdrawal_confirmations',
      {},
      {
        delay: 30000,
        removeOnComplete: true,
      },
    );
  });

  it('marks failed withdrawals when Mixin snapshot evidence reports failure', async () => {
    const { mixinClientService, queue, withdrawalService, worker } =
      buildWorker({
        withdrawals: [
          {
            id: 'withdrawal-failed',
            status: 'sent',
            mixinTxId: 'mixin-failed',
          },
        ],
        snapshots: {},
      });

    mixinClientService.client.safe.fetchSafeSnapshot.mockResolvedValueOnce({
      confirmations: 0,
      transaction_hash: 'chain-failed',
    });
    jest
      .spyOn(worker as any, 'checkMixinTransactionStatus')
      .mockResolvedValueOnce({
        status: 'failed',
        confirmed: false,
        onChainHash: 'chain-failed',
      });

    await worker.handleCheckConfirmations({ queue } as any);

    expect(withdrawalService.markAsFailed).toHaveBeenCalledWith(
      'withdrawal-failed',
      'Transaction failed on blockchain',
    );
  });
});

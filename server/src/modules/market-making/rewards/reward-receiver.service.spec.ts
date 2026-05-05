/* eslint-disable @typescript-eslint/no-explicit-any */
import { RewardReceiverService } from './reward-receiver.service';

describe('RewardReceiverService', () => {
  it('confirms observed reward when chain receipt is confirmed', async () => {
    const rows: any[] = [
      {
        txHash: 'tx-1',
        status: 'OBSERVED',
      },
    ];

    const rewardLedgerRepository = {
      find: jest.fn(async () => rows),
      save: jest.fn(async (payload) => {
        rows[0] = { ...rows[0], ...payload };

        return rows[0];
      }),
    };

    const web3Service = {
      getSigner: jest.fn().mockReturnValue({
        provider: {
          getTransactionReceipt: jest.fn().mockResolvedValue({ status: 1 }),
        },
      }),
    };

    const service = new RewardReceiverService(
      rewardLedgerRepository as any,
      web3Service as any,
    );

    await service.confirmObservedRewards(1);

    expect(rows[0].status).toBe('CONFIRMED');
  });

  it('leaves observed rewards pending when chain receipt is missing or failed', async () => {
    const rows: any[] = [
      {
        txHash: 'tx-missing',
        status: 'OBSERVED',
      },
      {
        txHash: 'tx-failed',
        status: 'OBSERVED',
      },
    ];

    const rewardLedgerRepository = {
      find: jest.fn(async () => rows),
      save: jest.fn(),
    };

    const web3Service = {
      getSigner: jest.fn().mockReturnValue({
        provider: {
          getTransactionReceipt: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ status: 0 }),
        },
      }),
    };

    const service = new RewardReceiverService(
      rewardLedgerRepository as any,
      web3Service as any,
    );

    await service.confirmObservedRewards(1);

    expect(rows.map((row) => row.status)).toEqual(['OBSERVED', 'OBSERVED']);
    expect(rewardLedgerRepository.save).not.toHaveBeenCalled();
  });
});

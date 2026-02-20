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
});

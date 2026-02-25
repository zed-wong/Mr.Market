/* eslint-disable @typescript-eslint/no-explicit-any */
import { RewardVaultTransferService } from './reward-vault-transfer.service';

describe('RewardVaultTransferService', () => {
  const createDurabilityService = (options?: {
    isProcessed?: boolean;
    markProcessed?: boolean;
  }) => ({
    isProcessed: jest.fn().mockResolvedValue(options?.isProcessed ?? false),
    markProcessed: jest.fn().mockResolvedValue(options?.markProcessed ?? true),
  });

  it('marks confirmed rewards as transferred to mixin vault', async () => {
    const rows: any[] = [
      {
        txHash: 'tx-1',
        token: 'HFT',
        amount: '10',
        status: 'CONFIRMED',
      },
    ];

    const rewardLedgerRepository = {
      find: jest.fn(async () => rows),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (payload) => {
        rows[0] = { ...rows[0], ...payload };

        return rows[0];
      }),
    };

    const transactionService = {
      transfer: jest.fn().mockResolvedValue([{ trace_id: 'trace-1' }]),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'reward.mixin_vault_user_id') {
          return 'vault-user';
        }

        return undefined;
      }),
    };

    const service = new RewardVaultTransferService(
      rewardLedgerRepository as any,
      transactionService as any,
      configService as any,
      createDurabilityService() as any,
    );

    const transferred = await service.transferConfirmedRewardsToMixin();

    expect(transferred).toBe(1);
    expect(rows[0].status).toBe('TRANSFERRED_TO_MIXIN');
    expect(transactionService.transfer).toHaveBeenCalledWith(
      'vault-user',
      'HFT',
      '10',
      'reward-vault:tx-1',
    );
  });

  it('does not mark rewards transferred when vault user is missing', async () => {
    const rows: any[] = [
      {
        txHash: 'tx-2',
        token: 'HFT',
        amount: '5',
        status: 'CONFIRMED',
      },
    ];

    const rewardLedgerRepository = {
      find: jest.fn(async () => rows),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (payload) => {
        rows[0] = { ...rows[0], ...payload };

        return rows[0];
      }),
    };

    const transactionService = {
      transfer: jest.fn().mockResolvedValue([{ trace_id: 'trace-2' }]),
    };

    const configService = {
      get: jest.fn(() => undefined),
    };

    const service = new RewardVaultTransferService(
      rewardLedgerRepository as any,
      transactionService as any,
      configService as any,
      createDurabilityService() as any,
    );

    const transferred = await service.transferConfirmedRewardsToMixin();

    expect(transferred).toBe(0);
    expect(rows[0].status).toBe('CONFIRMED');
    expect(transactionService.transfer).not.toHaveBeenCalled();
  });

  it('continues processing remaining rows when one transfer fails', async () => {
    const rows: any[] = [
      {
        txHash: 'tx-fail',
        token: 'HFT',
        amount: '10',
        status: 'CONFIRMED',
      },
      {
        txHash: 'tx-ok',
        token: 'HFT',
        amount: '12',
        status: 'CONFIRMED',
      },
    ];

    const rewardLedgerRepository = {
      find: jest.fn(async () => rows),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (payload) => payload),
    };
    const transactionService = {
      transfer: jest
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce([{ trace_id: 'trace-2' }]),
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'reward.mixin_vault_user_id' ? 'vault-user' : undefined,
      ),
    };

    const service = new RewardVaultTransferService(
      rewardLedgerRepository as any,
      transactionService as any,
      configService as any,
      createDurabilityService() as any,
    );

    const transferred = await service.transferConfirmedRewardsToMixin();

    expect(transferred).toBe(1);
    expect(transactionService.transfer).toHaveBeenCalledTimes(2);
  });

  it('skips transfer when another worker already claimed the row', async () => {
    const rows: any[] = [
      {
        txHash: 'tx-processed',
        token: 'HFT',
        amount: '8',
        status: 'CONFIRMED',
      },
    ];

    const rewardLedgerRepository = {
      find: jest.fn(async () => rows),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      save: jest.fn(async (payload) => payload),
    };
    const transactionService = {
      transfer: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'reward.mixin_vault_user_id' ? 'vault-user' : undefined,
      ),
    };
    const service = new RewardVaultTransferService(
      rewardLedgerRepository as any,
      transactionService as any,
      configService as any,
      createDurabilityService() as any,
    );

    const transferred = await service.transferConfirmedRewardsToMixin();

    expect(transferred).toBe(0);
    expect(transactionService.transfer).not.toHaveBeenCalled();
    expect(rewardLedgerRepository.save).not.toHaveBeenCalled();
  });
});

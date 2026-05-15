/* eslint-disable @typescript-eslint/no-explicit-any, unused-imports/no-unused-vars */
import { SafeSnapshot } from '@mixin.dev/mixin-node-sdk';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Withdrawal } from 'src/common/entities/mixin/withdrawal.entity';

import { MixinClientService } from '../client/mixin-client.service';
import { WithdrawalService } from './withdrawal.service';

describe('WithdrawalService', () => {
  let service: WithdrawalService;

  const mockWithdrawalRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalService,
        {
          provide: getRepositoryToken(Withdrawal),
          useValue: mockWithdrawalRepository,
        },
        {
          provide: 'BullQueue_withdrawals',
          useValue: mockQueue,
        },
        {
          provide: MixinClientService,
          useValue: {
            client: {
              network: {
                fetchAsset: jest.fn(),
              },
              safe: {
                fetchAsset: jest.fn(),
                fetchFee: jest.fn(),
                fetchAssets: jest.fn(),
              },
              utxo: {
                safeOutputs: jest.fn(),
                ghostKey: jest.fn(),
                verifyTransaction: jest.fn(),
                sendTransactions: jest.fn(),
              },
            },
            spendKey: 'test-spend-key',
          },
        },
      ],
    }).compile();

    service = module.get<WithdrawalService>(WithdrawalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeWithdrawal', () => {
    const mockSnapshot: SafeSnapshot = {
      snapshot_id: 'test-snapshot-id',
      opponent_id: 'test-user-id',
      amount: '100.5',
      asset_id: 'test-asset-id',
      memo: 'test-memo',
      created_at: '2024-01-01T00:00:00Z',
    } as any;

    const mockMemoDetails = {
      version: 1,
      tradingType: 'Withdrawal',
      destination: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      destinationTag: undefined,
      assetId: 'test-asset-id',
      amount: '100.5',
    };

    it('should create a new withdrawal when snapshot is new', async () => {
      mockWithdrawalRepository.findOne.mockResolvedValue(null);
      mockWithdrawalRepository.create.mockReturnValue({
        id: 'test-withdrawal-id',
        ...mockMemoDetails,
      });
      mockWithdrawalRepository.save.mockResolvedValue({
        id: 'test-withdrawal-id',
        ...mockMemoDetails,
      });

      const result = await service.initializeWithdrawal(
        mockSnapshot,
        mockMemoDetails,
      );

      expect(mockWithdrawalRepository.findOne).toHaveBeenCalledWith({
        where: { snapshotId: 'test-snapshot-id' },
      });
      expect(mockWithdrawalRepository.create).toHaveBeenCalled();
      expect(mockWithdrawalRepository.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process_withdrawal',
        { withdrawalId: 'test-withdrawal-id' },
        expect.any(Object),
      );
      expect(result).toBeDefined();
      expect(result?.id).toBe('test-withdrawal-id');
    });

    it('should not create duplicate withdrawal for same snapshot', async () => {
      const existingWithdrawal = {
        id: 'existing-withdrawal-id',
        snapshotId: 'test-snapshot-id',
      };

      mockWithdrawalRepository.findOne.mockResolvedValue(existingWithdrawal);

      const result = await service.initializeWithdrawal(
        mockSnapshot,
        mockMemoDetails,
      );

      expect(mockWithdrawalRepository.findOne).toHaveBeenCalledWith({
        where: { snapshotId: 'test-snapshot-id' },
      });
      expect(mockWithdrawalRepository.create).not.toHaveBeenCalled();
      expect(mockWithdrawalRepository.save).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(result).toEqual(existingWithdrawal);
    });

    it('should queue withdrawal with correct parameters', async () => {
      const withdrawalId = 'test-withdrawal-id';

      await service.queueWithdrawal(withdrawalId);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process_withdrawal',
        { withdrawalId },
        expect.objectContaining({
          jobId: withdrawalId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
        }),
      );
      expect(mockWithdrawalRepository.update).toHaveBeenCalledWith(
        withdrawalId,
        { status: 'queued' },
      );
    });
  });

  describe('updateWithdrawalStatus', () => {
    it('should update withdrawal status', async () => {
      const withdrawalId = 'test-withdrawal-id';
      const newStatus = 'completed';

      await service.updateWithdrawalStatus(withdrawalId, newStatus);

      expect(mockWithdrawalRepository.update).toHaveBeenCalledWith(
        withdrawalId,
        { status: newStatus },
      );
    });

    it('should mark withdrawal as failed with error message', async () => {
      const withdrawalId = 'test-withdrawal-id';
      const errorMessage = 'Insufficient balance';

      await service.markAsFailed(withdrawalId, errorMessage);

      expect(mockWithdrawalRepository.update).toHaveBeenCalledWith(
        withdrawalId,
        {
          status: 'failed',
          errorMessage,
        },
      );
    });
  });

  describe('markAsRefunded', () => {
    it('should mark withdrawal as refunded with tx id', async () => {
      const withdrawalId = 'test-withdrawal-id';
      const mixinTxId = 'test-tx-id';

      await service.markAsRefunded(withdrawalId, mixinTxId);

      expect(mockWithdrawalRepository.update).toHaveBeenCalledWith(
        withdrawalId,
        {
          status: 'refunded',
          mixinTxId,
        },
      );
    });
  });

  describe('incrementRetryCount', () => {
    it('should increment retry count', async () => {
      const withdrawalId = 'test-withdrawal-id';
      const mockWithdrawal = { id: withdrawalId, retryCount: 1 };

      mockWithdrawalRepository.findOne.mockResolvedValue(mockWithdrawal);

      await service.incrementRetryCount(withdrawalId);

      expect(mockWithdrawalRepository.update).toHaveBeenCalledWith(
        withdrawalId,
        { retryCount: 2 },
      );
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { encodeMarketMakingCreateMemo } from 'src/common/helpers/mixin/memo';

import { SnapshotsService } from './snapshots.service';

describe('SnapshotsService', () => {
  const buildService = () => {
    const snapshotsQueue = {
      client: {
        get: jest.fn(),
        set: jest.fn(),
      },
    };
    const marketMakingQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    const transactionService = {
      refund: jest.fn().mockResolvedValue([{}]),
    };
    const marketMakingOrderIntentRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const service = new SnapshotsService(
      {
        get: jest.fn().mockReturnValue('false'),
      } as any,
      snapshotsQueue as any,
      marketMakingQueue as any,
      {
        client: {
          safe: {
            fetchSafeSnapshots: jest.fn(),
          },
        },
      } as any,
      transactionService as any,
      marketMakingOrderIntentRepository as any,
    );

    return {
      service,
      marketMakingQueue,
      transactionService,
      marketMakingOrderIntentRepository,
    };
  };

  it('refunds market-making snapshot when payer does not match bound intent user', async () => {
    const {
      service,
      marketMakingQueue,
      transactionService,
      marketMakingOrderIntentRepository,
    } = buildService();
    const memo = encodeMarketMakingCreateMemo({
      version: 1,
      tradingType: 'Market Making',
      action: 'create',
      marketMakingPairId: '123e4567-e89b-12d3-a456-426614174001',
      orderId: '123e4567-e89b-12d3-a456-426614174002',
    });
    const snapshot = {
      snapshot_id: 'snapshot-1',
      amount: '1',
      asset_id: 'asset-1',
      opponent_id: '123e4567-e89b-12d3-a456-426614174003',
      memo: Buffer.from(memo, 'utf-8').toString('hex'),
    };

    marketMakingOrderIntentRepository.findOne.mockResolvedValueOnce({
      orderId: '123e4567-e89b-12d3-a456-426614174002',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      marketMakingPairId: '123e4567-e89b-12d3-a456-426614174001',
      state: 'pending',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    await service.handleSnapshot(snapshot as any);

    expect(transactionService.refund).toHaveBeenCalledWith(snapshot);
    expect(marketMakingQueue.add).not.toHaveBeenCalled();
  });
});

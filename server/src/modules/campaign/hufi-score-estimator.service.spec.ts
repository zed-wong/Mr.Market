import { HufiScoreEstimatorService } from './hufi-score-estimator.service';

describe('HufiScoreEstimatorService', () => {
  it('builds daily score snapshots from market making fills', async () => {
    const historyRepository = {
      find: jest.fn().mockResolvedValue([
        {
          exchange: 'binance',
          pair: 'BTC/USDT',
          amount: '10',
          status: 'closed',
        },
      ]),
    };
    const snapshotRows: any[] = [];
    const scoreSnapshotRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => {
        snapshotRows.push(payload);

        return payload;
      }),
    };

    const service = new HufiScoreEstimatorService(
      historyRepository as any,
      scoreSnapshotRepository as any,
    );

    await service.estimateDailyScore('2026-02-11');

    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0].score).toBe('10');
    expect(historyRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'closed' }),
      }),
    );
  });

  it('queries only fills inside the requested UTC day window', async () => {
    const historyRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const scoreSnapshotRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => payload),
    };

    const service = new HufiScoreEstimatorService(
      historyRepository as any,
      scoreSnapshotRepository as any,
    );

    await service.estimateDailyScore('2026-02-11');

    const callArg = historyRepository.find.mock.calls[0][0];

    expect(callArg.where.executedAt).toBeDefined();
  });
});

import { SnapshotsProcessor } from './snapshots.processor';

describe('SnapshotsProcessor', () => {
  const buildProcessor = () => {
    const snapshotsService = {
      isPollingEnabled: jest.fn().mockReturnValue(true),
    };
    const snapshotsQueue = {
      clean: jest.fn().mockResolvedValue(undefined),
    };

    const processor = new SnapshotsProcessor(
      snapshotsService as any,
      snapshotsQueue as any,
    );
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    };
    (processor as any).logger = logger;

    return { processor, logger };
  };

  it('ignores legacy process_snapshots failures', () => {
    const { processor, logger } = buildProcessor();

    processor.onFailed(
      {
        name: 'process_snapshots',
        id: 'legacy-1',
        attemptsMade: 1,
        data: {},
      } as any,
      new Error('Missing process handler for job type process_snapshots'),
    );

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs normal process_snapshot failures', () => {
    const { processor, logger } = buildProcessor();

    processor.onFailed(
      {
        name: 'process_snapshot',
        id: 'snapshot-1',
        attemptsMade: 1,
        data: { snapshot_id: 'snapshot-1' },
      } as any,
      new Error('snapshot failed'),
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('ignores legacy process_snapshots stalled events', () => {
    const { processor, logger } = buildProcessor();

    processor.onStalled({ name: 'process_snapshots', id: 'legacy-2' } as any);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

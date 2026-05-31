import { HealthService } from './health.service';

describe('HealthService', () => {
  const now = 1_800_000;

  const buildQueue = (overrides: Record<string, unknown> = {}) => ({
    getWaitingCount: jest.fn(async () => 0),
    getActiveCount: jest.fn(async () => 0),
    getCompletedCount: jest.fn(async () => 12),
    getFailedCount: jest.fn(async () => 0),
    getDelayedCount: jest.fn(async () => 0),
    isPaused: jest.fn(async () => false),
    getActive: jest.fn(async () => []),
    getFailed: jest.fn(async () => []),
    getCompleted: jest.fn(async () => []),
    client: {
      get: jest.fn(async () => String(now - 60_000)),
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('treats stale snapshot polling without backlog as warning', async () => {
    const service = new HealthService(buildQueue() as any, {} as any);

    const health = await service.checkSnapshotPollingHealth();

    expect(health.status).toBe('warning');
    expect(health.issues).toContain('Snapshot polling appears stale');
    expect(health.metrics.waiting).toBe(0);
    expect(health.metrics.active).toBe(0);
  });

  it('treats waiting snapshot jobs without active workers as critical', async () => {
    const service = new HealthService(
      buildQueue({
        getWaitingCount: jest.fn(async () => 3),
      }) as any,
      {} as any,
    );

    const health = await service.checkSnapshotPollingHealth();

    expect(health.status).toBe('critical');
    expect(health.issues).toEqual(
      expect.arrayContaining([
        'Snapshot polling appears stale',
        'No active workers processing waiting jobs',
      ]),
    );
  });
});

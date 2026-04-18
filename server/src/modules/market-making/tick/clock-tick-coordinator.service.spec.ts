import { ConfigService } from '@nestjs/config';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { ClockTickCoordinatorService } from './clock-tick-coordinator.service';
import { MarketMakingRuntimeTimingService } from './runtime-timing.service';

type TestTickComponent = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  onTick: (ts: string) => Promise<void>;
  health: () => Promise<boolean>;
};

describe('ClockTickCoordinatorService', () => {
  const createService = (
    tickSizeMs = 1000,
    runtimeTimingService?: MarketMakingRuntimeTimingService,
  ) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: number) => {
        if (key === 'strategy.tick_size_ms') {
          return tickSizeMs;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;

    return new ClockTickCoordinatorService(configService, runtimeTimingService);
  };

  const createComponent = (): TestTickComponent => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    onTick: jest.fn().mockResolvedValue(undefined),
    health: jest.fn().mockResolvedValue(true),
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('ticks registered components in deterministic order', async () => {
    const service = createService(100);
    const executionOrder: string[] = [];
    const first = createComponent();
    const second = createComponent();

    first.onTick = jest.fn(async () => {
      executionOrder.push('first');
    });
    second.onTick = jest.fn(async () => {
      executionOrder.push('second');
    });

    service.register('second', second, 20);
    service.register('first', first, 10);

    await service.start();
    await service.tickOnce();

    expect(executionOrder).toEqual(['first', 'second']);

    await service.stop();
  });

  it('starts and stops all registered components', async () => {
    const service = createService(100);
    const first = createComponent();
    const second = createComponent();

    service.register('first', first, 10);
    service.register('second', second, 20);

    await service.start();
    await service.stop();

    expect(first.start).toHaveBeenCalledTimes(1);
    expect(second.start).toHaveBeenCalledTimes(1);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
  });

  it('skips unhealthy components during a tick', async () => {
    const service = createService(100);
    const healthy = createComponent();
    const unhealthy = createComponent();

    unhealthy.health = jest.fn().mockResolvedValue(false);

    service.register('healthy', healthy, 10);
    service.register('unhealthy', unhealthy, 20);

    await service.start();
    await service.tickOnce();

    expect(healthy.onTick).toHaveBeenCalledTimes(1);
    expect(unhealthy.onTick).not.toHaveBeenCalled();

    await service.stop();
  });

  it('continues ticking later components when one component throws', async () => {
    const service = createService(100);
    const first = createComponent();
    const second = createComponent();
    const loggerErrorSpy = jest
      .spyOn(CustomLogger.prototype, 'error')
      .mockImplementation(() => undefined);

    first.onTick = jest.fn().mockRejectedValue(new Error('boom'));

    service.register('first', first, 10);
    service.register('second', second, 20);

    await service.start();
    await service.tickOnce();

    expect(first.onTick).toHaveBeenCalledTimes(1);
    expect(second.onTick).toHaveBeenCalledTimes(1);
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Tick component failed: first'),
      expect.any(String),
    );

    await service.stop();
  });

  it('does not run overlapping ticks', async () => {
    jest.useFakeTimers();
    const service = createService(10);
    const component = createComponent();
    let pendingResolver: (() => void) | undefined;

    component.onTick = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          pendingResolver = resolve;
        }),
    );

    service.register('component', component, 10);
    await service.start();

    jest.advanceTimersByTime(30);
    await Promise.resolve();

    expect(component.onTick).toHaveBeenCalledTimes(1);

    pendingResolver?.();
    await Promise.resolve();
    await service.stop();
  });

  it('records coordinator and component timing metrics for completed ticks', async () => {
    const runtimeTimingService = new MarketMakingRuntimeTimingService();
    const service = createService(100, runtimeTimingService);
    const component = createComponent();

    service.register('component', component, 10);

    await service.start();
    await service.tickOnce();
    await service.stop();

    const snapshot = runtimeTimingService.getSnapshot();

    expect(snapshot.stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'coordinator.component',
          count: 1,
        }),
        expect.objectContaining({
          scope: 'coordinator.tick',
          count: 1,
        }),
      ]),
    );
  });
});

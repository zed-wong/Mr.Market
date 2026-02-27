import { ConfigService } from '@nestjs/config';

import { ClockTickCoordinatorService } from './clock-tick-coordinator.service';

type TestTickComponent = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  onTick: (ts: string) => Promise<void>;
  health: () => Promise<boolean>;
};

describe('ClockTickCoordinatorService', () => {
  const createService = (tickSizeMs = 1000) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: number) => {
        if (key === 'strategy.tick_size_ms') {
          return tickSizeMs;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;

    return new ClockTickCoordinatorService(configService);
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

    await service.tickOnce();

    expect(executionOrder).toEqual(['first', 'second']);
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

    await service.tickOnce();

    expect(healthy.onTick).toHaveBeenCalledTimes(1);
    expect(unhealthy.onTick).not.toHaveBeenCalled();
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
});

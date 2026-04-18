import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { MarketMakingRuntimeTimingService } from './runtime-timing.service';

describe('MarketMakingRuntimeTimingService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records rolling stats and recent measurements by scope', () => {
    const service = new MarketMakingRuntimeTimingService();

    service.recordDuration('strategy.executor.tick', 100, {
      exchange: 'binance',
    });
    service.recordDuration('strategy.executor.tick', 200, {
      exchange: 'binance',
    });

    const snapshot = service.getSnapshot();

    expect(snapshot.stats).toEqual([
      expect.objectContaining({
        scope: 'strategy.executor.tick',
        count: 2,
        avgDurationMs: 150,
        maxDurationMs: 200,
        lastDurationMs: 200,
        lastMetadata: { exchange: 'binance' },
      }),
    ]);
    expect(snapshot.recent).toHaveLength(2);
  });

  it('warns when a duration crosses the configured threshold', () => {
    const service = new MarketMakingRuntimeTimingService();
    const warnSpy = jest
      .spyOn(CustomLogger.prototype, 'warn')
      .mockImplementation(() => undefined);

    service.recordDuration(
      'order-tracker.fetch-order',
      501,
      {
        exchange: 'binance',
        exchangeOrderId: 'ex-1',
      },
      { warnThresholdMs: 500 },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('scope=order-tracker.fetch-order'),
    );
  });
});

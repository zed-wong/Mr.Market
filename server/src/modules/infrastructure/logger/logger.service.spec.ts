import { CustomLogger } from './logger.service';

describe('CustomLogger marketMaking adapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('formats market-making fields with identity fields first', () => {
    const logSpy = jest
      .spyOn(CustomLogger.prototype, 'log')
      .mockImplementation();
    const logger = new CustomLogger('TestLogger').marketMaking();

    logger.info('strategy blocked', {
      actions: 0,
      strategy: 'strategy-1',
      empty: '',
      reason: 'order_book_stale',
      exchange: 'mexc',
      pair: 'XIN/USDT',
      account: '2',
      ageMs: 9297,
      custom: 'value',
    });

    expect(logSpy).toHaveBeenCalledWith(
      '[MM] strategy blocked | reason=order_book_stale strategy=strategy-1 exchange=mexc pair=XIN/USDT account=2 | actions=0 ageMs=9297 | custom=value',
    );
  });

  it('rate-limits market-making warnings by once key', () => {
    const warnSpy = jest
      .spyOn(CustomLogger.prototype, 'warn')
      .mockImplementation();
    const logger = new CustomLogger('TestLogger').marketMaking();

    logger.warn(
      'runtime slow',
      { scope: 'fetch_order', durationMs: 700 },
      { onceKey: 'runtime:fetch_order', windowMs: 60_000 },
    );
    logger.warn(
      'runtime slow',
      { scope: 'fetch_order', durationMs: 800 },
      { onceKey: 'runtime:fetch_order', windowMs: 60_000 },
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[MM] runtime slow | scope=fetch_order | durationMs=700',
    );
  });
});

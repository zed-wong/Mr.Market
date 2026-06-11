import * as ccxt from 'ccxt';

import { RuntimeObservationService } from './runtime-observation.service';

describe('RuntimeObservationService', () => {
  it('counts post-only rejects and rate-limit pressure per strategy window', () => {
    const service = new RuntimeObservationService();

    service.recordIntentFailure(
      {
        type: 'CREATE_LIMIT_ORDER',
        intentId: 'intent-1',
        runtimeInstanceKey: 'strategy-1',
        strategyKey: 'strategy-1',
        userId: 'user-1',
        clientId: 'client-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
        postOnly: true,
        createdAt: '2026-03-11T00:00:00.000Z',
        status: 'NEW',
      },
      new Error('post-only order would take liquidity'),
      1_000,
    );
    service.recordIntentFailure(
      {
        type: 'CANCEL_ORDER',
        intentId: 'intent-2',
        runtimeInstanceKey: 'strategy-1',
        strategyKey: 'strategy-1',
        userId: 'user-1',
        clientId: 'client-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
        createdAt: '2026-03-11T00:00:00.000Z',
        status: 'NEW',
      },
      new ccxt.RateLimitExceeded('binance 429 too many requests'),
      1_500,
    );

    expect(service.getPressure('strategy-1', 1_000, 2_000)).toEqual({
      strategyKey: 'strategy-1',
      windowMs: 1_000,
      rejectCount: 2,
      postOnlyRejectCount: 1,
      rateLimitCount: 1,
    });
    expect(service.getPressure('other', 1_000, 2_000).rejectCount).toBe(0);
  });

  it('tracks dual-account soft cycle outcomes without increasing generic runtime pressure', () => {
    const service = new RuntimeObservationService();

    service.recordDualAccountCycleOutcome({
      strategyKey: 'strategy-1',
      intentId: 'intent-1',
      orderId: 'order-1',
      status: 'small_mismatch',
      makerFilledQty: '1.001',
      takerFilledQty: '1',
      mismatchQty: '0.001',
      mismatchRatio: '0.000999000999000999',
      makerCleanupConfirmed: true,
      observedAtMs: 1_000,
    });
    service.recordDualAccountCycleOutcome({
      strategyKey: 'strategy-1',
      intentId: 'intent-2',
      orderId: 'order-1',
      status: 'safe_no_fill',
      makerFilledQty: '0',
      takerFilledQty: '0',
      makerCleanupConfirmed: true,
      observedAtMs: 1_500,
    });

    expect(service.getPressure('strategy-1', 5_000, 2_000)).toEqual({
      strategyKey: 'strategy-1',
      windowMs: 5_000,
      rejectCount: 0,
      postOnlyRejectCount: 0,
      rateLimitCount: 0,
    });
    expect(service.getDualAccountCycleHealth('strategy-1', 5_000, 2_000)).toEqual(
      {
        strategyKey: 'strategy-1',
        windowMs: 5_000,
        softFailureCount: 2,
        hasUnsafeOutcome: false,
        latestOutcomeStatus: 'safe_no_fill',
      },
    );
  });

  it('resets dual-account soft cycle health after a matched outcome', () => {
    const service = new RuntimeObservationService();

    service.recordDualAccountCycleOutcome({
      strategyKey: 'strategy-1',
      intentId: 'intent-1',
      orderId: 'order-1',
      status: 'small_mismatch',
      makerFilledQty: '1.001',
      takerFilledQty: '1',
      makerCleanupConfirmed: true,
      observedAtMs: 1_000,
    });
    service.recordDualAccountCycleOutcome({
      strategyKey: 'strategy-1',
      intentId: 'intent-2',
      orderId: 'order-1',
      status: 'matched',
      makerFilledQty: '1',
      takerFilledQty: '1',
      makerCleanupConfirmed: true,
      observedAtMs: 1_500,
    });

    expect(service.getDualAccountCycleHealth('strategy-1', 5_000, 2_000)).toEqual(
      {
        strategyKey: 'strategy-1',
        windowMs: 5_000,
        softFailureCount: 0,
        hasUnsafeOutcome: false,
        latestOutcomeStatus: 'matched',
      },
    );
  });
});

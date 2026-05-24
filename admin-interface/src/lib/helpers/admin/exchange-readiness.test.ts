import { describe, expect, it } from 'vitest';

import { getExchangeReadiness, summarizeExchangeReadiness } from './exchange-readiness';

describe('exchange readiness', () => {
  it('maps enabled exchanges to ready operator language', () => {
    const readiness = getExchangeReadiness({ exchange_id: 'binance', name: 'Binance', enable: true });

    expect(readiness.status).toBe('ready');
    expect(readiness.label).toBe('ready');
    expect(readiness.description).toContain('configured and enabled');
    expect(readiness.enablement).toMatchObject({
      label: 'enabled',
      actionLabel: 'disable',
      canToggle: true,
      nextEnable: false,
    });
  });

  it('maps disabled exchanges to configured but not usable language', () => {
    const readiness = getExchangeReadiness({ exchange_id: 'binance', name: 'Binance', enable: false });

    expect(readiness.status).toBe('disabled');
    expect(readiness.label).toBe('disabled');
    expect(readiness.description).toContain('not usable for trading');
    expect(readiness.enablement).toMatchObject({
      label: 'disabled',
      actionLabel: 'enable',
      canToggle: true,
      nextEnable: true,
    });
  });

  it('classifies missing and malformed exchange records conservatively', () => {
    expect(getExchangeReadiness(null)).toMatchObject({
      status: 'missing',
      enablement: {
        label: 'unavailable',
        actionLabel: 'enablement unavailable',
        canToggle: false,
        nextEnable: null,
      },
    });
    expect(getExchangeReadiness({ exchange_id: 'binance', name: 'Binance' })).toMatchObject({
      status: 'unknown',
      enablement: {
        label: 'unknown',
        actionLabel: 'enablement unknown',
        canToggle: false,
        nextEnable: null,
      },
    });
    expect(getExchangeReadiness({ enable: true })).toMatchObject({
      status: 'unknown',
      enablement: {
        label: 'unknown',
        actionLabel: 'enablement unknown',
        canToggle: false,
        nextEnable: null,
      },
    });
    expect(getExchangeReadiness({ exchange_id: 'binance', name: 'Binance', enable: 'false' })).toMatchObject({
      status: 'unknown',
      enablement: {
        label: 'unknown',
        actionLabel: 'enablement unknown',
        canToggle: false,
        nextEnable: null,
      },
    });
  });

  it('summarizes ready disabled missing and unknown exchange readiness', () => {
    expect(
      summarizeExchangeReadiness([
        { exchange_id: 'binance', name: 'Binance', enable: true },
        { exchange_id: 'kraken', name: 'Kraken', enable: false },
        { exchange_id: 'mystery', name: 'Mystery' },
      ]),
    ).toMatchObject({
      total: 3,
      ready: 1,
      disabled: 1,
      missing: 0,
      unknown: 1,
    });

    expect(summarizeExchangeReadiness([])).toMatchObject({ total: 0, missing: 1 });
  });
});

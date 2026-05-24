import { describe, expect, it } from 'vitest';

import {
  getApiKeyPermissionViews,
  getApiKeyReadiness,
  getApiKeyUseReadiness,
  hasApiKeyCapability,
  summarizeApiKeyReadiness,
} from './api-key-readiness';

describe('API key readiness', () => {
  it('maps validated usable keys to ready operator language', () => {
    const readiness = getApiKeyReadiness({ state: 'alive', validation_status: 'valid' });

    expect(readiness.status).toBe('ready');
    expect(readiness.label).toBe('ready');
    expect(readiness.description).toContain('validated');
  });

  it('distinguishes validation pending from validation failed', () => {
    expect(getApiKeyReadiness({ validation_status: 'pending' }).status).toBe('validation_pending');
    expect(getApiKeyReadiness({ validation_error: 'Validation timeout' }).status).toBe('validation_pending');

    const failed = getApiKeyReadiness({ validation_status: 'failed', validation_error: 'Invalid signature' });
    expect(failed.status).toBe('validation_failed');
    expect(failed.label).toBe('validation failed');
    expect(failed.description).toBe('Invalid signature');
  });

  it('does not present disabled keys as ready even when validation succeeded', () => {
    const readiness = getApiKeyReadiness({ state: 'disabled', validation_status: 'valid' });

    expect(readiness.status).toBe('disabled');
    expect(readiness.label).toBe('disabled');
  });

  it('classifies unrecognized key states conservatively as unknown', () => {
    const readiness = getApiKeyReadiness({ state: 'mystery', validation_status: 'mystery' });

    expect(readiness.status).toBe('unknown');
    expect(readiness.description).toContain('could not be classified');
  });

  it('uses missing vocabulary when no API key record is available', () => {
    const readiness = getApiKeyReadiness(null);

    expect(readiness.status).toBe('missing');
    expect(readiness.label).toBe('missing');
  });

  it('labels read-only and trade-capable permissions without implying trading for read-only keys', () => {
    expect(getApiKeyPermissionViews({ permissions: 'read' }).map((view) => view.label)).toEqual(['read only']);
    expect(getApiKeyPermissionViews({ permissions: 'read-trade' }).map((view) => view.label)).toEqual([
      'read access',
      'trade enabled',
    ]);
    expect(getApiKeyPermissionViews({ permissions: 'custom' }).map((view) => view.label)).toEqual([
      'permission unknown',
    ]);
  });

  it('uses shared readiness and permission vocabulary for direct API key use checks', () => {
    const readyTrade = getApiKeyUseReadiness({
      state: 'alive',
      validation_status: 'valid',
      permissions: 'read-trade',
    });
    const pendingTrade = getApiKeyUseReadiness({
      validation_status: 'pending',
      permissions: 'read-trade',
    });
    const readOnlyTrade = getApiKeyUseReadiness({
      state: 'alive',
      validation_status: 'valid',
      permissions: 'read',
    });

    expect(readyTrade.usable).toBe(true);
    expect(readyTrade.label).toBe('ready');
    expect(pendingTrade.usable).toBe(false);
    expect(pendingTrade.label).toBe('validation pending');
    expect(readOnlyTrade.usable).toBe(false);
    expect(readOnlyTrade.label).toBe('read only');
  });

  it('recognizes shared permission aliases before filtering direct order keys', () => {
    expect(hasApiKeyCapability({ permissions: 'read_trade' }, 'trade')).toBe(true);
    expect(hasApiKeyCapability({ permissions: 'trade' }, 'trade')).toBe(true);
    expect(hasApiKeyCapability({ permissions: 'read-only' }, 'read')).toBe(true);
    expect(hasApiKeyCapability({ permissions: 'read-only' }, 'trade')).toBe(false);
  });

  it('summarizes ready pending failed disabled and unknown key readiness', () => {
    expect(
      summarizeApiKeyReadiness([
        { state: 'alive', validation_status: 'valid' },
        { validation_status: 'pending' },
        { validation_status: 'failed' },
        { state: 'disabled', validation_status: 'valid' },
        null,
        { state: 'mystery' },
      ]),
    ).toMatchObject({
      total: 6,
      ready: 1,
      validation_pending: 1,
      validation_failed: 1,
      disabled: 1,
      missing: 1,
      unknown: 1,
    });
  });
});

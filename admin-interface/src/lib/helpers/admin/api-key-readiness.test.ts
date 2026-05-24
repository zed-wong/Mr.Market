import { describe, expect, it } from 'vitest';

import { getApiKeyPermissionViews, getApiKeyReadiness, summarizeApiKeyReadiness } from './api-key-readiness';

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

  it('summarizes ready pending failed disabled and unknown key readiness', () => {
    expect(
      summarizeApiKeyReadiness([
        { state: 'alive', validation_status: 'valid' },
        { validation_status: 'pending' },
        { validation_status: 'failed' },
        { state: 'disabled', validation_status: 'valid' },
        { state: 'mystery' },
      ]),
    ).toMatchObject({
      total: 5,
      ready: 1,
      validation_pending: 1,
      validation_failed: 1,
      disabled: 1,
      unknown: 1,
    });
  });
});

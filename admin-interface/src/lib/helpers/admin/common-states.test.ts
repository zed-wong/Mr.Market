import { describe, expect, it } from 'vitest';
import { ApiError } from '$lib/helpers/api/client';
import { classifyAdminError } from './common-states';

describe('admin common states', () => {
  it('maps unauthorized failures to a recoverable session state', () => {
    const state = classifyAdminError(new ApiError(401, { message: 'expired' }, 'Session expired'));

    expect(state.kind).toBe('session');
    expect(state.title).toBe('session expired');
    expect(state.actionLabel).toBe('sign in again');
  });

  it('maps forbidden failures to a permission state without calling it empty data', () => {
    const state = classifyAdminError(new ApiError(403, { message: 'forbidden' }, 'Permission denied'));

    expect(state.kind).toBe('permission');
    expect(state.title).toBe('permission denied');
    expect(state.message).toContain('does not have permission');
  });

  it('keeps ordinary API failures as retryable errors', () => {
    const state = classifyAdminError(new Error('backend unavailable'), 'fallback');

    expect(state.kind).toBe('error');
    expect(state.title).toBe('request failed');
    expect(state.message).toBe('backend unavailable');
    expect(state.actionLabel).toBe('retry');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { applyValidatedSession, authState, clearAuth, hasUsableAuthSession, isAuthed, persistAuth } from './auth';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('web3 auth session expiry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T00:00:00Z'));
    clearAuth();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats persisted auth as usable only until the local expiry time', () => {
    persistAuth('jwt-token', '0xabc', '1', 30);

    expect(hasUsableAuthSession(Date.now() + 29_000)).toBe(true);
    expect(hasUsableAuthSession(Date.now() + 31_000)).toBe(false);
  });

  it('blocks create-session checks when token storage is missing', () => {
    expect(hasUsableAuthSession()).toBe(false);
  });

  it('hydrates central auth state from a backend-validated session', () => {
    persistAuth('jwt-token', '0xabc', '1', 60);

    expect(
      applyValidatedSession({
        authenticated: true,
        address: '0xabc',
        chainId: '1',
        userId: 'web3-user',
      })
    ).toBe(true);

    expect(get(isAuthed)).toBe(true);
    expect(get(authState)).toEqual({
      token: 'jwt-token',
      address: '0xabc',
      chainId: '1',
      userId: 'web3-user',
    });
  });

  it('clears auth when session validation is not authenticated', () => {
    persistAuth('jwt-token', '0xabc', '1', 60);

    expect(applyValidatedSession({ authenticated: false })).toBe(false);
    expect(get(isAuthed)).toBe(false);
    expect(get(authState).token).toBeNull();
  });
});

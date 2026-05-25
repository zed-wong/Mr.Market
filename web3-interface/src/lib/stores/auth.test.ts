import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuth, hasUsableAuthSession, persistAuth } from './auth';

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
});

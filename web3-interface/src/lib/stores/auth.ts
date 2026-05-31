import { writable } from 'svelte/store';
import type { SessionResponse, Web3AuthState } from '$lib/types/auth';

const STORAGE_KEY = 'web3-access-token';
const CHAIN_KEY = 'web3-chain-id';
const ADDRESS_KEY = 'web3-address';
const EXPIRES_AT_KEY = 'web3-auth-expires-at';

export const checked = writable(false);
export const isAuthed = writable(false);
export const loginLoading = writable(false);
export const showSessionExpired = writable(false);
export const authExpiresAt = writable<number | null>(null);

export const authState = writable<Web3AuthState>({
  token: null,
  address: null,
  chainId: null,
  userId: null,
});

export const getAccessToken = (): string | null =>
  typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);

export const setAccessToken = (token: string) => {
  localStorage.setItem(STORAGE_KEY, token);
};

export const clearAuth = () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('web3-access-token');
  localStorage.removeItem(CHAIN_KEY);
  localStorage.removeItem(ADDRESS_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  isAuthed.set(false);
  authExpiresAt.set(null);
  authState.set({ token: null, address: null, chainId: null, userId: null });
};

export const getAuthExpiresAt = (): number | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(EXPIRES_AT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const hasUsableAuthSession = (now = Date.now()): boolean => {
  const token = getAccessToken();
  if (!token) return false;
  const expiresAt = getAuthExpiresAt();
  return expiresAt === null || expiresAt > now;
};

export const expireAuthSession = ({ showDialog = true }: { showDialog?: boolean } = {}) => {
  clearAuth();
  showSessionExpired.set(showDialog);
};

export const persistAuth = (token: string, address: string, chainId: string, expiresIn?: number, userId?: string) => {
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem('web3-access-token', token);
  localStorage.setItem(ADDRESS_KEY, address);
  localStorage.setItem(CHAIN_KEY, chainId);
  const expiresAt = Number.isFinite(expiresIn) && Number(expiresIn) > 0 ? Date.now() + Number(expiresIn) * 1000 : null;
  if (expiresAt) {
    localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
  } else {
    localStorage.removeItem(EXPIRES_AT_KEY);
  }
  authExpiresAt.set(expiresAt);
  isAuthed.set(true);
  authState.set({
    token,
    address,
    chainId,
    userId: userId ?? null,
  });
};

export const applyValidatedSession = (session: SessionResponse): boolean => {
  const token = getAccessToken();
  if (!token || !session.authenticated) {
    clearAuth();
    return false;
  }

  authExpiresAt.set(getAuthExpiresAt());
  isAuthed.set(true);
  authState.set({
    token,
    address: session.address ?? null,
    chainId: session.chainId ?? null,
    userId: session.userId ?? null,
  });

  return true;
};
import { writable } from 'svelte/store';
import type { Web3AuthState } from '$lib/types/auth';

const STORAGE_KEY = 'web3-access-token';
const CHAIN_KEY = 'web3-chain-id';
const ADDRESS_KEY = 'web3-address';

export const checked = writable(false);
export const isAuthed = writable(false);
export const loginLoading = writable(false);
export const showSessionExpired = writable(false);

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
  localStorage.removeItem(CHAIN_KEY);
  localStorage.removeItem(ADDRESS_KEY);
  isAuthed.set(false);
  authState.set({ token: null, address: null, chainId: null, userId: null });
};

export const persistAuth = (token: string, address: string, chainId: string) => {
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(ADDRESS_KEY, address);
  localStorage.setItem(CHAIN_KEY, chainId);
};
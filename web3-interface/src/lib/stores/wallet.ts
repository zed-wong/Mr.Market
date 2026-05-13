import { writable, derived } from 'svelte/store';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export const walletAddress = writable<string | null>(null);
export const walletChainId = writable<number | null>(null);
export const walletStatus = writable<WalletStatus>('disconnected');

export const walletShortAddress = derived(walletAddress, ($addr) => {
  if (!$addr) return '';
  return `${$addr.slice(0, 6)}...${$addr.slice(-4)}`;
});

export const walletIsConnected = derived(walletStatus, ($s) => $s === 'connected');

export const setWalletDisconnected = () => {
  walletAddress.set(null);
  walletChainId.set(null);
  walletStatus.set('disconnected');
};
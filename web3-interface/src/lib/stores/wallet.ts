import { derived, writable } from 'svelte/store';
import {
  mockAccounts,
  namespaceLabel,
  shortenMockAddress,
  type MockAccount,
  type WalletNamespace,
} from '$lib/helpers/mock-web3';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unsupported';

export const walletStatus = writable<WalletStatus>('disconnected');
export const selectedMockAccountId = writable<string | null>(null);
export const walletModalOpen = writable(false);

export const walletAccount = derived(
  [walletStatus, selectedMockAccountId],
  ([$status, $accountId]): MockAccount | null => {
    if ($status === 'disconnected' || $status === 'connecting' || !$accountId) return null;
    return mockAccounts.find((account) => account.id === $accountId) ?? null;
  }
);

export const walletAddress = derived(walletAccount, ($account) => $account?.address ?? null);
export const walletChainId = derived(walletAccount, ($account) => $account?.chainId ?? null);
export const walletNamespace = derived(walletAccount, ($account) => $account?.namespace ?? null);
export const walletNetwork = derived(walletAccount, ($account) => $account?.network ?? null);

export const walletShortAddress = derived(walletAddress, ($addr) =>
  $addr ? shortenMockAddress($addr) : ''
);

export const walletIsConnected = derived(walletStatus, ($status) => $status === 'connected');
export const walletHasAccount = derived(
  walletStatus,
  ($status) => $status === 'connected' || $status === 'unsupported'
);
export const walletIsUnsupported = derived(walletStatus, ($status) => $status === 'unsupported');

export const walletNamespaceLabel = derived(walletNamespace, ($namespace) =>
  $namespace ? namespaceLabel($namespace as WalletNamespace) : 'No chain selected'
);

export const openMockWallet = () => walletModalOpen.set(true);
export const closeMockWallet = () => walletModalOpen.set(false);

export const connectMockWallet = async (accountId: string, delayMs = 350): Promise<void> => {
  const account = mockAccounts.find((item) => item.id === accountId);
  if (!account) return;

  walletModalOpen.set(true);
  selectedMockAccountId.set(accountId);
  walletStatus.set('connecting');

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  selectedMockAccountId.set(accountId);
  walletStatus.set(account.unsupported ? 'unsupported' : 'connected');
};

export const setUnsupportedChain = () => {
  selectedMockAccountId.set('unsupported-polygon');
  walletStatus.set('unsupported');
  walletModalOpen.set(false);
};

export const switchMockAccount = (accountId: string) => {
  const account = mockAccounts.find((item) => item.id === accountId);
  if (!account) return;

  selectedMockAccountId.set(accountId);
  walletStatus.set(account.unsupported ? 'unsupported' : 'connected');
};

export const setWalletDisconnected = () => {
  selectedMockAccountId.set(null);
  walletStatus.set('disconnected');
  walletModalOpen.set(false);
};
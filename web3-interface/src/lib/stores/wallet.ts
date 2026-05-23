import { derived, writable } from 'svelte/store';
import { getAppKit, initAppKit } from '$lib/helpers/wallet/appkit';
import {
  deterministicAccountForWallet,
  isSupportedDemoWallet,
  namespaceLabel,
  type WalletNamespace,
} from '$lib/helpers/mock-web3';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unsupported';

const namespaceLabelFor = (namespace: WalletNamespace | null): string => {
  if (namespace === 'evm') return 'EVM';
  if (namespace === 'solana') return 'Solana / SVM';
  return 'No chain selected';
};

const shortenAddress = (address: string | null): string => {
  if (!address) return '';
  if (address.startsWith('0x') && address.length > 10) {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }
  if (address.length > 10) {
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }
  return address;
};

interface NamespaceAccount {
  address: string | null;
  connected: boolean;
  status: string;
}

export const walletStatus = writable<WalletStatus>('disconnected');
export const walletAddress = writable<string | null>(null);
export const walletChainId = writable<number | string | null>(null);
export const walletNamespace = writable<WalletNamespace | null>(null);
export const walletNetwork = writable<string | null>(null);

export const walletAccount = derived(
  [walletAddress, walletNamespace, walletChainId, walletNetwork],
  ([$address, $namespace, $chainId, $network]) => {
    if (!$address || !$namespace) return null;
    const demoAccount = deterministicAccountForWallet($namespace, $chainId);
    if (!demoAccount) return null;
    return {
      id: demoAccount.id,
      address: $address,
      demoAddress: demoAccount.address,
      namespace: demoAccount.namespace,
      chainId: $chainId ?? demoAccount.chainId,
      network: $network ?? demoAccount.network,
      label: `${demoAccount.label} · ${namespaceLabel(demoAccount.namespace)}`,
      unsupported: Boolean(demoAccount.unsupported),
    };
  }
);

export const walletShortAddress = derived(walletAddress, ($addr) => shortenAddress($addr));

export const walletIsConnected = derived(walletStatus, ($status) => $status === 'connected');
export const walletHasAccount = derived(
  walletStatus,
  ($status) => $status === 'connected' || $status === 'unsupported'
);
export const walletIsUnsupported = derived(walletStatus, ($status) => $status === 'unsupported');

export const walletNamespaceLabel = derived(walletNamespace, ($namespace) => namespaceLabelFor($namespace));

let initialized = false;

const namespaceAccounts: Record<WalletNamespace, NamespaceAccount> = {
  evm: { address: null, connected: false, status: 'disconnected' },
  solana: { address: null, connected: false, status: 'disconnected' },
};

const recomputeFromAccounts = (activeNamespace: WalletNamespace | null) => {
  const ns = activeNamespace ?? (namespaceAccounts.evm.connected ? 'evm' : namespaceAccounts.solana.connected ? 'solana' : null);
  if (!ns) {
    const anyConnecting = namespaceAccounts.evm.status === 'connecting' || namespaceAccounts.evm.status === 'reconnecting' || namespaceAccounts.solana.status === 'connecting' || namespaceAccounts.solana.status === 'reconnecting';
    walletStatus.set(anyConnecting ? 'connecting' : 'disconnected');
    walletAddress.set(null);
    walletNamespace.set(null);
    return;
  }
  const acc = namespaceAccounts[ns];
  if (!acc.connected) {
    const other: WalletNamespace = ns === 'evm' ? 'solana' : 'evm';
    if (namespaceAccounts[other].connected) {
      recomputeFromAccounts(other);
      return;
    }
    walletStatus.set(acc.status === 'connecting' || acc.status === 'reconnecting' ? 'connecting' : 'disconnected');
    walletAddress.set(null);
    walletNamespace.set(null);
    return;
  }
  walletAddress.set(acc.address);
  walletNamespace.set(ns);
  const appKit = getAppKit();
  const chainId = appKit?.getChainId();
  walletStatus.set(isSupportedDemoWallet(ns, chainId) ? 'connected' : 'unsupported');
};

export const initWalletStore = () => {
  if (initialized || typeof window === 'undefined') return;
  const appKit = initAppKit();
  if (!appKit) return;
  initialized = true;

  const onAccount = (state: { isConnected: boolean; address?: string; status?: string }, namespace: WalletNamespace) => {
    namespaceAccounts[namespace] = {
      address: state.isConnected ? (state.address ?? null) : namespaceAccounts[namespace].address,
      connected: state.isConnected,
      status: state.status ?? 'disconnected',
    };
    recomputeFromAccounts(null);
  };

  appKit.subscribeAccount((state) => onAccount(state, 'evm'), 'eip155');
  appKit.subscribeAccount((state) => onAccount(state, 'solana'), 'solana');

  appKit.subscribeNetwork((state) => {
    walletChainId.set(state.chainId ?? null);
    walletNetwork.set(state.caipNetwork?.name ?? null);

    const namespace: WalletNamespace | null = state.caipNetwork?.chainNamespace === 'solana' ? 'solana' : state.caipNetwork?.chainNamespace === 'eip155' ? 'evm' : null;
    if (namespace) {
      walletNamespace.set(namespace);
      recomputeFromAccounts(namespace);
    }

    if (state.chainId !== undefined && namespace === 'evm') {
      const numericId = typeof state.chainId === 'string' ? Number(state.chainId) : state.chainId;
      if (typeof numericId === 'number' && !Number.isNaN(numericId)) {
        if (namespaceAccounts.evm.connected) {
          walletStatus.set(isSupportedDemoWallet('evm', numericId) ? 'connected' : 'unsupported');
        }
      }
    }
  });
};

export const openWalletModal = () => {
  const appKit = getAppKit() ?? initAppKit();
  appKit?.open();
};

export const closeWalletModal = () => {
  const appKit = getAppKit();
  appKit?.close();
};

export const openNetworkModal = () => {
  const appKit = getAppKit() ?? initAppKit();
  appKit?.open({ view: 'Networks' });
};

export const disconnectWallet = async () => {
  const appKit = getAppKit();
  if (!appKit) return;
  await appKit.disconnect();
  walletStatus.set('disconnected');
  walletAddress.set(null);
  walletNamespace.set(null);
  walletChainId.set(null);
  walletNetwork.set(null);
};

export const openMockWallet = openWalletModal;
export const closeMockWallet = closeWalletModal;

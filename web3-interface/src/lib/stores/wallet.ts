import { derived, writable } from 'svelte/store';
import { getAppKit, initAppKit } from '$lib/helpers/wallet/appkit';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unsupported';
export type WalletNamespace = 'evm' | 'solana';

const SUPPORTED_EVM_CHAIN_IDS = new Set<number>([1, 11155111, 42161, 8453, 137, 10]);

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

export const walletStatus = writable<WalletStatus>('disconnected');
export const walletAddress = writable<string | null>(null);
export const walletChainId = writable<number | string | null>(null);
export const walletNamespace = writable<WalletNamespace | null>(null);
export const walletNetwork = writable<string | null>(null);

export const walletAccount = derived(
  [walletAddress, walletNamespace, walletChainId, walletNetwork],
  ([$address, $namespace, $chainId, $network]) =>
    $address
      ? { id: $address, address: $address, namespace: $namespace, chainId: $chainId, network: $network, label: $network ?? '' }
      : null
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

export const initWalletStore = () => {
  if (initialized || typeof window === 'undefined') return;
  const appKit = initAppKit();
  if (!appKit) return;
  initialized = true;

  const applyAccount = (state: { isConnected: boolean; address?: string; status?: string }, namespace: WalletNamespace) => {
    if (!state.isConnected) {
      const otherNamespace: WalletNamespace = namespace === 'evm' ? 'solana' : 'evm';
      const otherAddress = appKit.getAddress(otherNamespace === 'evm' ? 'eip155' : 'solana');
      if (!otherAddress) {
        walletStatus.set(state.status === 'connecting' || state.status === 'reconnecting' ? 'connecting' : 'disconnected');
        walletAddress.set(null);
        walletNamespace.set(null);
      }
      return;
    }
    walletAddress.set(state.address ?? null);
    walletNamespace.set(namespace);
    if (state.status === 'connecting' || state.status === 'reconnecting') {
      walletStatus.set('connecting');
    } else {
      const chainId = appKit.getChainId();
      const isEvmUnsupported = namespace === 'evm' && typeof chainId === 'number' && !SUPPORTED_EVM_CHAIN_IDS.has(chainId);
      walletStatus.set(isEvmUnsupported ? 'unsupported' : 'connected');
    }
  };

  appKit.subscribeAccount((state) => applyAccount(state, 'evm'), 'eip155');
  appKit.subscribeAccount((state) => applyAccount(state, 'solana'), 'solana');

  appKit.subscribeNetwork((state) => {
    walletChainId.set(state.chainId ?? null);
    walletNetwork.set(state.caipNetwork?.name ?? null);

    const namespace = state.caipNetwork?.chainNamespace === 'solana' ? 'solana' : state.caipNetwork?.chainNamespace === 'eip155' ? 'evm' : null;
    if (namespace) walletNamespace.set(namespace);

    if (state.chainId !== undefined && namespace === 'evm') {
      const numericId = typeof state.chainId === 'string' ? Number(state.chainId) : state.chainId;
      if (typeof numericId === 'number' && !Number.isNaN(numericId)) {
        const isUnsupported = !SUPPORTED_EVM_CHAIN_IDS.has(numericId);
        if (appKit.getIsConnectedState()) {
          walletStatus.set(isUnsupported ? 'unsupported' : 'connected');
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

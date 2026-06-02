import { derived, get, writable } from 'svelte/store';
import {
  connect as wagmiConnect,
  signMessage as wagmiSignMessage,
  waitForTransactionReceipt as wagmiWaitForTransactionReceipt,
  writeContract as wagmiWriteContract,
} from '@wagmi/core';
import {
  deterministicAccountForWallet,
  isSupportedDemoWallet,
  namespaceLabel,
  type WalletNamespace,
} from '$lib/helpers/mock-web3';
import { isValidationWalletEnabled } from '$lib/helpers/constants';
import { VALIDATION_WALLET_CONNECTOR_ID } from '$lib/helpers/wallet/validation-wallet';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unsupported';
export type DemoWalletPreset = 'evm' | 'solana' | 'wrong-network';
type AppKitModule = typeof import('$lib/helpers/wallet/appkit');
type AppKitInstance = NonNullable<ReturnType<AppKitModule['initAppKit']>>;

const DEMO_WALLET_STORAGE_KEY = 'mrmarket-web3-demo-wallet';

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
let appKitSubscriptionsInitialized = false;
let demoWalletActive = false;
let appKitModulePromise: Promise<AppKitModule> | null = null;
let appKitInstance: AppKitInstance | null = null;

const namespaceAccounts: Record<WalletNamespace, NamespaceAccount> = {
  evm: { address: null, connected: false, status: 'disconnected' },
  solana: { address: null, connected: false, status: 'disconnected' },
};

const demoWalletPresets: Record<DemoWalletPreset, { namespace: WalletNamespace; chainId: number | null }> = {
  evm: { namespace: 'evm', chainId: 1 },
  solana: { namespace: 'solana', chainId: null },
  'wrong-network': { namespace: 'evm', chainId: 137 },
};

const persistDemoWalletPreset = (preset: DemoWalletPreset) => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(DEMO_WALLET_STORAGE_KEY, preset);
};

const clearPersistedDemoWallet = () => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(DEMO_WALLET_STORAGE_KEY);
};

const clearWalletState = () => {
  demoWalletActive = false;
  clearPersistedDemoWallet();
  namespaceAccounts.evm = { address: null, connected: false, status: 'disconnected' };
  namespaceAccounts.solana = { address: null, connected: false, status: 'disconnected' };
  walletStatus.set('disconnected');
  walletAddress.set(null);
  walletNamespace.set(null);
  walletChainId.set(null);
  walletNetwork.set(null);
};

const restoreDemoWalletState = () => {
  if (typeof sessionStorage === 'undefined') return;
  const preset = sessionStorage.getItem(DEMO_WALLET_STORAGE_KEY);
  if (preset === 'evm' || preset === 'solana' || preset === 'wrong-network') {
    connectDemoWallet(preset, false);
  }
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
  const chainId = appKitInstance?.getChainId();
  walletStatus.set(isSupportedDemoWallet(ns, chainId) ? 'connected' : 'unsupported');
};

export const initWalletStore = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
};

const subscribeAppKitWallet = (appKit: AppKitInstance) => {
  if (appKitSubscriptionsInitialized) return;
  appKitSubscriptionsInitialized = true;

  const onAccount = (state: { isConnected: boolean; address?: string; status?: string }, namespace: WalletNamespace) => {
    if (demoWalletActive && !state.isConnected) return;
    if (state.isConnected) {
      demoWalletActive = false;
      clearPersistedDemoWallet();
    }
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
    if (demoWalletActive) return;
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

const loadAppKitModule = () => {
  appKitModulePromise ??= import('$lib/helpers/wallet/appkit');
  return appKitModulePromise;
};

const getWalletAppKit = async () => {
  if (typeof window === 'undefined') return null;
  const { getAppKit, initAppKit } = await loadAppKitModule();
  const appKit = getAppKit() ?? initAppKit();
  appKitInstance = appKit;
  if (appKit) subscribeAppKitWallet(appKit);
  return appKit;
};

export const setWalletThemeMode = (mode: 'dark' | 'light') => {
  appKitInstance?.setThemeMode(mode);
};

export const openWalletModal = async () => {
  const appKit = await getWalletAppKit();
  appKit?.open();
};

export const closeWalletModal = async () => {
  appKitInstance?.close();
};

export const canUseValidationWallet = () => isValidationWalletEnabled();

export const connectValidationWallet = async () => {
  if (!canUseValidationWallet()) {
    throw new Error('Validation wallet is not enabled');
  }

  const appKit = await getWalletAppKit();
  if (!appKit) {
    throw new Error('Wallet connection is unavailable');
  }

  const { getWagmiAdapter } = await loadAppKitModule();
  const adapter = getWagmiAdapter();
  const connector = adapter?.wagmiConfig.connectors.find(
    (candidate) => candidate.id === VALIDATION_WALLET_CONNECTOR_ID
  );
  if (!adapter?.wagmiConfig || !connector) {
    throw new Error('Validation wallet connector is unavailable');
  }

  const result = await wagmiConnect(adapter.wagmiConfig, { connector });
  const address = result.accounts[0] ?? null;
  if (!address) {
    throw new Error('Validation wallet did not return an EVM account');
  }

  demoWalletActive = false;
  clearPersistedDemoWallet();
  namespaceAccounts.evm = { address, connected: true, status: 'connected' };
  namespaceAccounts.solana = { address: null, connected: false, status: 'disconnected' };
  const chain = adapter.wagmiConfig.chains.find((candidate) => candidate.id === result.chainId);
  walletStatus.set('connected');
  walletAddress.set(address);
  walletNamespace.set('evm');
  walletChainId.set(result.chainId);
  walletNetwork.set(chain?.name ?? 'Ethereum');

  return address;
};

export const openNetworkModal = async () => {
  const appKit = await getWalletAppKit();
  appKit?.open({ view: 'Networks' });
};

export const signWalletMessage = async (message: string): Promise<string> => {
  const appKit = await getWalletAppKit();
  if (!appKit) {
    throw new Error('Wallet connection is unavailable');
  }

  const address = get(walletAddress);
  const namespace = get(walletNamespace);
  if (namespace !== 'evm' || !address?.startsWith('0x')) {
    throw new Error('Connect a supported EVM wallet before signing in');
  }

  const { getWagmiAdapter } = await loadAppKitModule();
  const adapter = getWagmiAdapter();
  if (!adapter?.wagmiConfig) {
    throw new Error('Reown AppKit wallet signer is unavailable');
  }

  return wagmiSignMessage(adapter.wagmiConfig, {
    account: address as `0x${string}`,
    message,
  });
};

const ROUTER_ABI = [
  {
    type: 'function',
    name: 'routeFunds',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'payloadHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'requestWithdrawal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'payloadHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const loadEvmWagmiConfig = async () => {
  const appKit = await getWalletAppKit();
  if (!appKit) {
    throw new Error('Wallet connection is unavailable');
  }

  const address = get(walletAddress);
  const namespace = get(walletNamespace);
  if (namespace !== 'evm' || !address?.startsWith('0x')) {
    throw new Error('Connect a supported EVM wallet before routing funds');
  }

  const { getWagmiAdapter } = await loadAppKitModule();
  const adapter = getWagmiAdapter();
  if (!adapter?.wagmiConfig) {
    throw new Error('Reown AppKit wallet signer is unavailable');
  }

  return { wagmiConfig: adapter.wagmiConfig, address };
};

export const approveRouterTokenWithWallet = async (params: {
  routerAddress: string;
  tokenAddress: string;
  amountBaseUnits: string;
}): Promise<string> => {
  const { wagmiConfig, address } = await loadEvmWagmiConfig();
  const txHash = await wagmiWriteContract(wagmiConfig, {
    account: address as `0x${string}`,
    address: params.tokenAddress as `0x${string}`,
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [params.routerAddress as `0x${string}`, BigInt(params.amountBaseUnits)],
  });

  await wagmiWaitForTransactionReceipt(wagmiConfig, {
    hash: txHash,
  });

  return String(txHash);
};

export const routeFundsWithWallet = async (params: {
  routerAddress: string;
  requestId: string;
  tokenAddress: string;
  amountBaseUnits: string;
  payloadHash: string;
}): Promise<string> => {
  const { wagmiConfig, address } = await loadEvmWagmiConfig();
  const txHash = await wagmiWriteContract(wagmiConfig, {
    account: address as `0x${string}`,
    address: params.routerAddress as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'routeFunds',
    args: [
      params.requestId as `0x${string}`,
      params.tokenAddress as `0x${string}`,
      BigInt(params.amountBaseUnits),
      params.payloadHash as `0x${string}`,
    ],
  });

  await wagmiWaitForTransactionReceipt(wagmiConfig, {
    hash: txHash,
  });

  return String(txHash);
};

export const requestWithdrawalWithWallet = async (params: {
  routerAddress: string;
  requestId: string;
  tokenAddress: string;
  amountBaseUnits: string;
  recipientAddress: string;
  payloadHash: string;
}): Promise<string> => {
  const { wagmiConfig, address } = await loadEvmWagmiConfig();
  const txHash = await wagmiWriteContract(wagmiConfig, {
    account: address as `0x${string}`,
    address: params.routerAddress as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'requestWithdrawal',
    args: [
      params.requestId as `0x${string}`,
      params.tokenAddress as `0x${string}`,
      BigInt(params.amountBaseUnits),
      params.recipientAddress as `0x${string}`,
      params.payloadHash as `0x${string}`,
    ],
  });

  await wagmiWaitForTransactionReceipt(wagmiConfig, {
    hash: txHash,
  });

  return String(txHash);
};

export const connectDemoWallet = (preset: DemoWalletPreset = 'evm', persist = true) => {
  const demoPreset = demoWalletPresets[preset];
  const demoAccount = deterministicAccountForWallet(demoPreset.namespace, demoPreset.chainId);
  if (!demoAccount) return;

  demoWalletActive = true;
  if (persist) persistDemoWalletPreset(preset);
  namespaceAccounts.evm = { address: null, connected: false, status: 'disconnected' };
  namespaceAccounts.solana = { address: null, connected: false, status: 'disconnected' };
  namespaceAccounts[demoPreset.namespace] = {
    address: demoAccount.address,
    connected: true,
    status: demoAccount.unsupported ? 'unsupported' : 'connected',
  };

  walletStatus.set(demoAccount.unsupported ? 'unsupported' : 'connected');
  walletAddress.set(demoAccount.address);
  walletNamespace.set(demoAccount.namespace);
  walletChainId.set(demoAccount.chainId);
  walletNetwork.set(demoAccount.network);
};

export const disconnectWallet = async () => {
  await appKitInstance?.disconnect();
  clearWalletState();
};

export const openMockWallet = openWalletModal;
export const closeMockWallet = closeWalletModal;

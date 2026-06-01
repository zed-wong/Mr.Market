import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  sepolia,
  solana,
  type AppKitNetwork,
} from '@reown/appkit/networks';
import { get } from 'svelte/store';
import { getReownProjectId, isValidationWalletEnabled } from '../constants';
import { createValidationWalletConnector } from './validation-wallet';
import { darkTheme } from '$lib/stores/theme';

let appKitInstance: ReturnType<typeof createAppKit> | null = null;
let wagmiAdapter: WagmiAdapter | null = null;
let solanaAdapter: SolanaAdapter | null = null;

export const getAppKit = () => appKitInstance;
export const getWagmiAdapter = () => wagmiAdapter;
export const getSolanaAdapter = () => solanaAdapter;

export const APPKIT_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet,
  sepolia,
  arbitrum,
  base,
  polygon,
  optimism,
  solana,
];

const EVM_APPKIT_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet,
  sepolia,
  arbitrum,
  base,
  polygon,
  optimism,
];

export const initAppKit = () => {
  if (appKitInstance) return appKitInstance;
  if (typeof window === 'undefined') return null;

  const projectId = getReownProjectId();
  const validationWalletEnabled = isValidationWalletEnabled();
  const connectors = validationWalletEnabled ? [createValidationWalletConnector()] : undefined;
  const networks = validationWalletEnabled ? EVM_APPKIT_NETWORKS : APPKIT_NETWORKS;

  wagmiAdapter = new WagmiAdapter({
    networks,
    projectId,
    ...(connectors ? { connectors } : {}),
  });

  solanaAdapter = validationWalletEnabled ? null : new SolanaAdapter({});

  appKitInstance = createAppKit({
    adapters: solanaAdapter ? [wagmiAdapter, solanaAdapter] : [wagmiAdapter],
    networks,
    projectId,
    metadata: {
      name: 'Mr.Market',
      description: 'Mr.Market web3 interface',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://web3.mrmarket.one',
      icons: [],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
    themeMode: get(darkTheme) ? 'dark' : 'light',
  });

  return appKitInstance;
};

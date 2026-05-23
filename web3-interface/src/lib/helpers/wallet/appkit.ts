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
import { getReownProjectId } from '../constants';

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

export const initAppKit = () => {
  if (appKitInstance) return appKitInstance;
  if (typeof window === 'undefined') return null;

  const projectId = getReownProjectId();

  wagmiAdapter = new WagmiAdapter({
    networks: APPKIT_NETWORKS,
    projectId,
  });

  solanaAdapter = new SolanaAdapter({});

  appKitInstance = createAppKit({
    adapters: [wagmiAdapter, solanaAdapter],
    networks: APPKIT_NETWORKS,
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
    themeMode: 'light',
  });

  return appKitInstance;
};

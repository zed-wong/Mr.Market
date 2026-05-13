import { createAppKit } from '@reown/appkit/core';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, sepolia } from '@reown/appkit/networks';
import { getReownProjectId } from '../constants';

let appKitInstance: ReturnType<typeof createAppKit> | null = null;
let wagmiAdapter: WagmiAdapter | null = null;

export const getAppKit = () => appKitInstance;
export const getWagmiAdapter = () => wagmiAdapter;

export const initAppKit = () => {
  if (appKitInstance) return appKitInstance;

  wagmiAdapter = new WagmiAdapter({
    networks: [mainnet, sepolia],
    projectId: getReownProjectId(),
  });

  appKitInstance = createAppKit({
    adapters: [wagmiAdapter],
    networks: [mainnet, sepolia],
    projectId: getReownProjectId(),
    features: {
      analytics: false,
    },
  });

  return appKitInstance;
};
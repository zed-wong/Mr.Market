import { env } from '$env/dynamic/public';

interface ChainConfig {
  namespace: string;
  chainId: number;
  name: string;
  currency: string;
  explorerUrl: string;
  rpcUrl: string;
}

const requireEnv = (key: string): string => {
  const val = env[key as keyof typeof env];
  if (!val || val.trim().length === 0) {
    throw new Error(`${key} is not set. Configure it before building web3-interface.`);
  }
  return val;
};

export const getMrmBackendUrl = (): string => requireEnv('PUBLIC_MRM_BACKEND_URL').replace(/\/$/, '');
export const getReownProjectId = (): string => requireEnv('PUBLIC_REOWN_PROJECT_ID');
export const getEthereumVaultAddress = (): string | undefined =>
  env.PUBLIC_ETHEREUM_VAULT_ADDRESS || undefined;

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    namespace: 'eip155',
    chainId: 1,
    name: 'Ethereum',
    currency: 'ETH',
    explorerUrl: 'https://etherscan.io',
    rpcUrl: 'https://eth.drpc.org',
  },
  sepolia: {
    namespace: 'eip155',
    chainId: 11155111,
    name: 'Sepolia',
    currency: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl: 'https://rpc.sepolia.org',
  },
};

export type SupportedChainKey = keyof typeof SUPPORTED_CHAINS;

export const ORDER_STATE_FETCH_INTERVAL = 3000;
export const ORDER_STATE_TIMEOUT_DURATION = 180000;
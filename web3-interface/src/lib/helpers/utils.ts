import { SUPPORTED_CHAINS } from './constants';

export const getChainConfig = (key: string) => SUPPORTED_CHAINS[key] ?? null;

export const getChainById = (chainId: number): ChainConfig | null => {
  return Object.values(SUPPORTED_CHAINS).find((c) => c.chainId === chainId) ?? null;
};

export const getExplorerTxUrl = (chainId: number, txHash: string): string => {
  const chain = getChainById(chainId);
  if (!chain) return '';
  return `${chain.explorerUrl}/tx/${txHash}`;
};

export const getExplorerAddressUrl = (chainId: number, address: string): string => {
  const chain = getChainById(chainId);
  if (!chain) return '';
  return `${chain.explorerUrl}/address/${address}`;
};

export const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

interface ChainConfig {
  namespace: string;
  chainId: number;
  name: string;
  currency: string;
  explorerUrl: string;
  rpcUrl: string;
}
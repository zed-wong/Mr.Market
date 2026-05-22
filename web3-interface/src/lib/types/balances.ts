import type { WalletNamespace } from '$lib/helpers/mock-web3';

export interface BalanceEntry {
  asset: string;
  chainNamespace: WalletNamespace;
  chainId: number | null;
  tokenAddress: string | null;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  usdValue: string;
  pendingAmount?: string;
}
export interface BalanceEntry {
  asset: string;
  chainNamespace: string;
  chainId: number;
  tokenAddress: string | null;
  symbol: string;
  decimals: number;
  amount: string;
  usdValue: string;
}
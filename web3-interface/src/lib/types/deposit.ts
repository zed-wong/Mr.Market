export interface DepositInstructions {
  vaultAddress: string;
  chainId: string;
  chainName: string;
  tokens: DepositToken[];
}

export interface DepositToken {
  address: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
}
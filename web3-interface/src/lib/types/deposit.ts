export interface DepositInstructions {
  namespace: '/web3/funding-requests';
  chainId: number;
  receiverAddress: string;
  supportedTokens: DepositToken[];
}

export interface DepositToken {
  chainId: number;
  assetId: string;
  name: string;
  tokenAddress: string;
  symbol: string;
  decimals: number;
}

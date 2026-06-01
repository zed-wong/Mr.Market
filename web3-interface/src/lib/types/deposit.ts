export interface DepositInstructions {
  namespace: '/web3/deposit';
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

export interface DepositVerifyRequest {
  chainId: number;
  txHash: string;
  tokenAddress: string;
  amount: string;
}

export interface DepositVerifyResponse {
  namespace: '/web3/deposit';
  deposit: {
    status: 'credited' | 'already_credited';
    applied: boolean;
    chainId: number;
    txHash: string;
    tokenAddress: string;
    assetId: string;
    amount: string;
    receiverAddress: string;
    fromAddress: string;
    ledgerEntryId: string;
  };
  balance: {
    orderId: string;
    assetId: string;
    available: string;
    locked: string;
    total: string;
    updatedAt: string;
  };
}

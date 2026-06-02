export type Web3FundingRequestStatus =
  | 'created'
  | 'onchain_seen'
  | 'order_created'
  | 'rejected'
  | 'expired';

export interface Web3FundingRequestBody {
  chainId: number;
  routerAddress: string;
  tokenAddress: string;
  amount: string;
  orderDraft: Record<string, unknown>;
}

export interface Web3FundingVerifyBody {
  txHash: string;
}

export interface Web3FundingRequestResponse {
  namespace: '/web3/funding-requests';
  fundingRequest: {
    requestId: string;
    userId: string;
    evmAddress: string;
    chainId: number;
    routerAddress: string;
    receiverAddress: string;
    tokenAddress: string;
    assetId: string;
    amount: string;
    payloadHash: string;
    orderDraft: Record<string, unknown>;
    status: Web3FundingRequestStatus;
    txHash: string | null;
    logIndex: number | null;
    orderId: string | null;
    rejectionReason: string | null;
    createdAt: string;
    expiresAt: string;
    updatedAt: string;
  };
  routerCall?: {
    functionName: 'routeFunds';
    routerAddress: string;
    requestId: string;
    tokenAddress: string;
    amount: string;
    amountBaseUnits: string;
    payloadHash: string;
  };
}

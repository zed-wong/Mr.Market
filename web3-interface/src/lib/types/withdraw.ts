export interface WithdrawRequest {
  orderId: string;
  chainId: number;
  routerAddress: string;
  tokenAddress: string;
  amount: string;
  recipientAddress: string;
  idempotencyKey?: string;
}

export interface WithdrawVerifyRequest {
  txHash: string;
}

export type Web3WithdrawalStatus =
  | 'created'
  | 'onchain_seen'
  | 'processing'
  | 'submitted'
  | 'paid'
  | 'failed'
  | 'blocked'
  | 'rejected'
  | 'expired';

export interface WithdrawResponse {
  namespace: '/web3/withdrawal-requests';
  withdrawalId: string;
  status: Web3WithdrawalStatus;
  requestTxHash: string | null;
  payoutTxHash: string | null;
  txHash: string | null;
  failureReason: string | null;
  routerCall: {
    functionName: 'requestWithdrawal';
    routerAddress: string;
    requestId: string;
    tokenAddress: string;
    amount: string;
    amountBaseUnits: string;
    recipientAddress: string;
    payloadHash: string;
  } | null;
  withdrawal: {
    withdrawalId: string;
    userId: string;
    orderId: string;
    chainId: number;
    routerAddress: string;
    tokenAddress: string;
    assetId: string;
    amount: string;
    recipientAddress: string;
    feeTokenAddress: string;
    feeAssetId: string;
    feeAmount: string;
    status: Web3WithdrawalStatus;
    requestTxHash: string | null;
    requestLogIndex: number | null;
    payoutTxHash: string | null;
    externalPayoutId: string | null;
    failureReason: string | null;
    ledgerEntryId: string | null;
    feeLedgerEntryId: string | null;
    idempotencyKey: string;
    createdAt: string;
    expiresAt: string;
    updatedAt: string;
  };
  balance: {
    orderId: string;
    assetId: string;
    available: string;
    locked: string;
    total: string;
    initialDeposit: string;
    realizedDelta: string;
    feePaid: string;
    updatedAt: string;
  } | null;
}

export type WithdrawStatus = 'idle' | 'submitting' | Web3WithdrawalStatus;

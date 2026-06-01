export interface WithdrawRequest {
  chainId: number;
  tokenAddress: string;
  amount: string;
  idempotencyKey?: string;
}

export type Web3WithdrawalStatus = 'pending' | 'submitted' | 'completed' | 'failed' | 'blocked';

export interface WithdrawResponse {
  namespace: '/web3/withdraw';
  withdrawalId: string;
  status: Web3WithdrawalStatus;
  txHash: string | null;
  failureReason: string | null;
  withdrawal: {
    withdrawalId: string;
    userId: string;
    chainId: number;
    tokenAddress: string;
    assetId: string;
    amount: string;
    recipientAddress: string;
    status: Web3WithdrawalStatus;
    txHash: string | null;
    failureReason: string | null;
    ledgerEntryId: string | null;
    idempotencyKey: string;
    createdAt: string;
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

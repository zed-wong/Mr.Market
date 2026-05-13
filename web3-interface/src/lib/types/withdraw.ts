export interface WithdrawRequest {
  token: string;
  amount: string;
  to: string;
}

export interface WithdrawResponse {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
}

export type WithdrawStatus = 'idle' | 'submitting' | 'pending' | 'completed' | 'failed';
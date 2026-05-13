import { apiFetch } from './client';
import type { BalanceEntry } from '$lib/types/balances';
import type { DepositInstructions } from '$lib/types/deposit';
import type { WithdrawRequest, WithdrawResponse } from '$lib/types/withdraw';

export const getBalances = async (): Promise<BalanceEntry[]> => {
  return apiFetch<BalanceEntry[]>('/web3/balances');
};

export const getDepositInstructions = async (chainId?: string): Promise<DepositInstructions> => {
  return apiFetch<DepositInstructions>('/web3/deposit/instructions', {
    query: chainId ? { chainId } : undefined,
  });
};

export const submitWithdraw = async (request: WithdrawRequest): Promise<WithdrawResponse> => {
  return apiFetch<WithdrawResponse>('/web3/withdraw', {
    method: 'POST',
    json: request,
  });
};

export const getWithdrawStatus = async (id: string): Promise<WithdrawResponse> => {
  return apiFetch<WithdrawResponse>(`/web3/withdraw/${id}`);
};
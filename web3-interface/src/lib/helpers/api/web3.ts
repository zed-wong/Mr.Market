import { apiFetch } from './client';
import type { BalanceEntry } from '$lib/types/balances';
import type { DepositInstructions } from '$lib/types/deposit';
import type {
  Web3MarketMakingCreateRequest,
  Web3MarketMakingCreateResponse,
  Web3MarketMakingMoneyMovementRequest,
  Web3MarketMakingMutationResponse,
  Web3MarketMakingOptionsResponse,
  Web3MarketMakingOrderDetailResponse,
  Web3MarketMakingOrderListResponse,
  Web3MarketMakingStrategiesResponse,
} from '$lib/types/market-making';
import type { WithdrawRequest, WithdrawResponse } from '$lib/types/withdraw';

const WEB3_MARKET_MAKING_NAMESPACE = '/api/v1/web3/market-making';

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

export const listMarketMakingOrders = async (): Promise<Web3MarketMakingOrderListResponse> => {
  return apiFetch<Web3MarketMakingOrderListResponse>(`${WEB3_MARKET_MAKING_NAMESPACE}/orders`);
};

export const listMarketMakingStrategies = async (): Promise<Web3MarketMakingStrategiesResponse> => {
  return apiFetch<Web3MarketMakingStrategiesResponse>(`${WEB3_MARKET_MAKING_NAMESPACE}/strategies`);
};

export const listMarketMakingOptions = async (): Promise<Web3MarketMakingOptionsResponse> => {
  return apiFetch<Web3MarketMakingOptionsResponse>(`${WEB3_MARKET_MAKING_NAMESPACE}/options`);
};

export const createMarketMakingOrder = async (
  request: Web3MarketMakingCreateRequest
): Promise<Web3MarketMakingCreateResponse> => {
  return apiFetch<Web3MarketMakingCreateResponse>(`${WEB3_MARKET_MAKING_NAMESPACE}/orders`, {
    method: 'POST',
    json: request,
  });
};

export const getMarketMakingOrderDetail = async (
  orderId: string
): Promise<Web3MarketMakingOrderDetailResponse> => {
  return apiFetch<Web3MarketMakingOrderDetailResponse>(
    `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${orderId}`
  );
};

export const depositMarketMakingOrder = async (
  orderId: string,
  request: Web3MarketMakingMoneyMovementRequest
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(
    `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${orderId}/deposit`,
    {
      method: 'POST',
      json: request,
    }
  );
};

export const withdrawMarketMakingOrder = async (
  orderId: string,
  request: Web3MarketMakingMoneyMovementRequest
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(
    `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${orderId}/withdraw`,
    {
      method: 'POST',
      json: request,
    }
  );
};

export const startMarketMakingOrder = async (
  orderId: string
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(
    `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${orderId}/start`,
    {
      method: 'POST',
    }
  );
};

export const pauseMarketMakingOrder = async (
  orderId: string
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(
    `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${orderId}/pause`,
    {
      method: 'POST',
    }
  );
};

export const resumeMarketMakingOrder = async (
  orderId: string
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(
    `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${orderId}/resume`,
    {
      method: 'POST',
    }
  );
};

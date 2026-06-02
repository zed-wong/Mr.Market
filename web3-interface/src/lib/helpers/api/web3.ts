import { apiFetch } from './client';
import type { Web3BalancesResponse } from '$lib/types/balances';
import type { DepositInstructions } from '$lib/types/deposit';
import type {
  Web3FundingRequestBody,
  Web3FundingRequestResponse,
  Web3FundingVerifyBody,
} from '$lib/types/funding';
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
import type { WithdrawRequest, WithdrawResponse, WithdrawVerifyRequest } from '$lib/types/withdraw';

const WEB3_MARKET_MAKING_NAMESPACE = '/web3/market-making';

const orderEndpoint = (orderId: string, suffix = ''): string =>
  `${WEB3_MARKET_MAKING_NAMESPACE}/orders/${encodeURIComponent(orderId)}${suffix}`;

export const getBalances = async (): Promise<Web3BalancesResponse> => {
  return apiFetch<Web3BalancesResponse>('/web3/balances');
};

export const getDepositInstructions = async (chainId?: string): Promise<DepositInstructions> => {
  return apiFetch<DepositInstructions>('/web3/funding-requests/instructions', {
    query: chainId ? { chainId } : undefined,
  });
};

export const createFundingRequest = async (
  request: Web3FundingRequestBody
): Promise<Web3FundingRequestResponse> => {
  return apiFetch<Web3FundingRequestResponse>('/web3/funding-requests', {
    method: 'POST',
    json: request,
  });
};

export const getFundingRequest = async (
  requestId: string
): Promise<Web3FundingRequestResponse> => {
  return apiFetch<Web3FundingRequestResponse>(
    `/web3/funding-requests/${encodeURIComponent(requestId)}`
  );
};

export const verifyFundingRequest = async (
  requestId: string,
  request: Web3FundingVerifyBody
): Promise<Web3FundingRequestResponse> => {
  return apiFetch<Web3FundingRequestResponse>(
    `/web3/funding-requests/${encodeURIComponent(requestId)}/verify`,
    {
      method: 'POST',
      json: request,
    }
  );
};

export const submitWithdraw = async (request: WithdrawRequest): Promise<WithdrawResponse> => {
  return apiFetch<WithdrawResponse>('/web3/withdrawal-requests', {
    method: 'POST',
    json: request,
  });
};

export const getWithdrawStatus = async (id: string): Promise<WithdrawResponse> => {
  return apiFetch<WithdrawResponse>(`/web3/withdrawal-requests/${encodeURIComponent(id)}`);
};

export const verifyWithdrawRequest = async (
  id: string,
  request: WithdrawVerifyRequest
): Promise<WithdrawResponse> => {
  return apiFetch<WithdrawResponse>(
    `/web3/withdrawal-requests/${encodeURIComponent(id)}/verify`,
    {
      method: 'POST',
      json: request,
    }
  );
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
  return apiFetch<Web3MarketMakingOrderDetailResponse>(orderEndpoint(orderId));
};

export const depositMarketMakingOrder = async (
  orderId: string,
  request: Web3MarketMakingMoneyMovementRequest
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(
    orderEndpoint(orderId, '/deposit'),
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
    orderEndpoint(orderId, '/withdraw'),
    {
      method: 'POST',
      json: request,
    }
  );
};

export const startMarketMakingOrder = async (
  orderId: string
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(orderEndpoint(orderId, '/start'), {
    method: 'POST',
  });
};

export const pauseMarketMakingOrder = async (
  orderId: string
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(orderEndpoint(orderId, '/pause'), {
    method: 'POST',
  });
};

export const resumeMarketMakingOrder = async (
  orderId: string
): Promise<Web3MarketMakingMutationResponse> => {
  return apiFetch<Web3MarketMakingMutationResponse>(orderEndpoint(orderId, '/resume'), {
    method: 'POST',
  });
};

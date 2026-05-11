import { MRM_BACKEND_URL, MIXIN_API_BASE_URL } from "$lib/helpers/constants";

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
};

export const getMixinTx = async (txId: string) => {
  try {
    const response = await fetch(`${MIXIN_API_BASE_URL}/safe/transactions/${txId}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching mixin tx state:', error);
  }
}

export const getOrderPaymentState = async (orderId: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/payment-state/market-making/${orderId}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching payment state:', error);
  }
}

export const getSimplyGrowDetailsById = async (id: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/simply-grow/${id}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching simply grow order details by id:', error);
  }
}

export const getAllSimplyGrowByUser = async (userId: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/simply-grow/all?user_id=${userId}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching all simply grow orders by user:', error);
  }
}

export const getAllStrategyByUser = async (userId: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/all?userId=${userId}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching all strategies for user:', error);
  }
}

export const getAllMarketMakingByUser = async (userId: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/market-making/all?userId=${userId}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching all market making by user:', error);
  }
}

export const getMarketMakingDetailsById = async (id: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/market-making/${id}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching market making details by id:', error);
  }
}

export const getUserOrderMarketMakingById = async (id: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/market-making/${id}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching user order market making details by id:', error);
  }
}

export const getMarketMakingPaymentState = async (orderId: string) => {
  try {
    const response = await fetch(`${MRM_BACKEND_URL}/user-orders/payment-state/market-making/${orderId}`);
    return await handleResponse(response);
  } catch (error) {
    console.error('Error fetching market making payment state:', error);
  }
}

export const getMarketMakingHistoryByInstanceId = async (_id: string) => {
  return [];
}

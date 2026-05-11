import { apiFetch } from "$lib/helpers/api/client";

export const fetchMiniumBalanceSettings = async (jwtToken: string): Promise<unknown> => {
  try {
    return await apiFetch('/rebalance/minimum_balance/all', {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });
  } catch (error) {
    console.error('Failed to fetch minium balance settings:', error);
    throw error;
  }
}

export const addMinimumBalanceSetting = async (jwtToken: string, settings: { symbol: string; assetId: string; exchangeName: string; minimumBalance: string; }): Promise<unknown> => {
  try {
    return await apiFetch('/rebalance/minimum_balance/add', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwtToken}` },
      json: settings,
    });
  } catch (error) {
    console.error('Failed to add minimum balance setting:', error);
    throw error;
  }
}

export const updateMinimumBalanceSetting = async (jwtToken: string, settings: { assetId: string; exchangeName: string; minimumBalance: string; }): Promise<unknown> => {
  try {
    const data = await apiFetch<{ message?: unknown }>('/rebalance/minimum_balance/update', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwtToken}` },
      json: settings,
    });
    return {
      message: data.message,
    };
  } catch (error) {
    console.error('Failed to update minimum balance setting:', error);
    throw error;
  }
}
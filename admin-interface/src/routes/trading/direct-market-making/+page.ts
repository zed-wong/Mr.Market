import { browser } from "$app/environment";
import { getAccessToken } from "$lib/helpers/api/client";
import { getGrowBasicInfoStrict } from "$lib/helpers/mrm/grow";
import { getAllAPIKeys } from "$lib/helpers/mrm/admin/exchanges";
import {
  getDirectWalletStatus,
  listDirectStrategies,
  listAdminCampaigns,
  listDirectOrders,
} from "$lib/helpers/mrm/admin/direct-market-making";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ depends }) => {
  depends("admin:market-making:direct");

  if (!browser) {
    return {
      growInfo: null,
      growInfoError: null,
      strategies: [],
      strategiesError: null,
      apiKeys: [],
      apiKeysError: null,
      directOrders: [],
      directOrdersError: null,
      campaigns: [],
      campaignsError: null,
      walletStatus: { configured: false, address: null },
      walletStatusError: null,
      waitingForClientSession: true,
    };
  }

  const token = getAccessToken();

  if (!token) {
    const sessionError = 'Session expired. Sign in again before viewing direct market-making operations.';
    return {
      growInfo: null,
      growInfoError: sessionError,
      strategies: [],
      strategiesError: sessionError,
      apiKeys: [],
      apiKeysError: sessionError,
      directOrders: [],
      directOrdersError: sessionError,
      campaigns: [],
      campaignsError: sessionError,
      walletStatus: { configured: false, address: null },
      walletStatusError: sessionError,
      waitingForClientSession: false,
    };
  }

  const settle = async <T>(task: Promise<T>, fallback: T) => {
    try {
      return { value: await task, error: null };
    } catch (cause) {
      return {
        value: fallback,
        error: cause instanceof Error ? cause.message : 'Direct market-making data failed to load',
      };
    }
  };

  const [growInfo, strategies, apiKeys, directOrders, campaigns, walletStatus] = await Promise.all([
    settle(getGrowBasicInfoStrict(token), null),
    settle(listDirectStrategies(token), []),
    settle(getAllAPIKeys(token), []),
    settle(listDirectOrders(token), []),
    settle(listAdminCampaigns(token), []),
    settle(getDirectWalletStatus(token), { configured: false, address: null }),
  ]);

  return {
    growInfo: growInfo.value,
    growInfoError: growInfo.error,
    strategies: strategies.value,
    strategiesError: strategies.error,
    apiKeys: apiKeys.value,
    apiKeysError: apiKeys.error,
    directOrders: directOrders.value,
    directOrdersError: directOrders.error,
    campaigns: campaigns.value,
    campaignsError: campaigns.error,
    walletStatus: walletStatus.value,
    walletStatusError: walletStatus.error,
    waitingForClientSession: false,
  };
};

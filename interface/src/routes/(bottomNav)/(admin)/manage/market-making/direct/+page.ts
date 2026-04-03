import { browser } from "$app/environment";
import { getGrowBasicInfo, getEnabledMarketMakingStrategies } from "$lib/helpers/mrm/grow";
import { getAllAPIKeys } from "$lib/helpers/mrm/admin/exchanges";
import {
  getDirectWalletStatus,
  listAdminCampaigns,
  listDirectOrders,
} from "$lib/helpers/mrm/admin/direct-market-making";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ depends }) => {
  depends("admin:market-making:direct");

  if (!browser) {
    return {
      growInfo: null,
      strategies: [],
      apiKeys: [],
      directOrders: [],
      campaigns: [],
      walletStatus: { configured: false, address: null },
    };
  }

  const token = localStorage.getItem("admin-access-token");

  if (!token) {
    return {
      growInfo: null,
      strategies: [],
      apiKeys: [],
      directOrders: [],
      campaigns: [],
      walletStatus: { configured: false, address: null },
    };
  }

  try {
    const [growInfo, strategies, apiKeys, directOrders, campaigns, walletStatus] =
      await Promise.all([
        getGrowBasicInfo(),
        getEnabledMarketMakingStrategies(),
        getAllAPIKeys(token),
        listDirectOrders(token),
        listAdminCampaigns(token),
        getDirectWalletStatus(token),
      ]);

    return {
      growInfo,
      strategies,
      apiKeys,
      directOrders,
      campaigns,
      walletStatus,
    };
  } catch (error) {
    console.error("Failed to load admin direct market-making page", error);

    return {
      growInfo: null,
      strategies: [],
      apiKeys: [],
      directOrders: [],
      campaigns: [],
      walletStatus: { configured: false, address: null },
    };
  }
};

import { browser } from "$app/environment";
import { getGrowBasicInfo } from "$lib/helpers/mrm/grow";
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

  return {
    growInfo: getGrowBasicInfo().catch(() => null),
    strategies: listDirectStrategies(token).catch(() => []),
    apiKeys: getAllAPIKeys(token).catch(() => []),
    directOrders: listDirectOrders(token).catch(() => []),
    campaigns: listAdminCampaigns(token).catch(() => []),
    walletStatus: getDirectWalletStatus(token).catch(() => ({ configured: false, address: null })),
  };
};

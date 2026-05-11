import { getSpotInfo } from "$lib/helpers/mrm/spot";
import { getGrowBasicInfo } from "$lib/helpers/mrm/grow";
import { browser } from "$app/environment";

import type { PageLoad } from './$types';

export const load: PageLoad = async ({ depends }) => {
  depends('admin:settings:spot-trading');
  if (!browser) {
    return {
      spotInfo: { trading_pairs: [] },
      growInfo: { exchanges: [] },
    };
  }
  const token = localStorage.getItem("admin-access-token") || undefined;
  return {
    spotInfo: await getSpotInfo(token).catch(() => ({ trading_pairs: [] })),
    growInfo: await getGrowBasicInfo(token).catch(() => ({ exchanges: [] })),
  }
}

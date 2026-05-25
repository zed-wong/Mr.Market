import { getActiveCampaigns, getCampaignStats } from "$lib/helpers/mrm/campaignLauncher.js";
import { getAllMarketMakingByUser } from "$lib/helpers/mrm/strategy";
export const ssr = false;

/** @type {import('./$types').PageLoad} */
export async function load() {
  return {
    active_campaigns: getActiveCampaigns(137),
    campaign_stats: getCampaignStats(137),
    orders: getAllMarketMakingByUser(),
  };
}

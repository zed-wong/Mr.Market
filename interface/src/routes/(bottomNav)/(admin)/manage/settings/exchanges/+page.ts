import { getGrowBasicInfo } from "$lib/helpers/mrm/grow";
import { getAllAPIKeys } from '$lib/helpers/mrm/admin/exchanges';
import type { AdminSingleKey } from "$lib/types/hufi/admin";
import { browser } from '$app/environment';

import type { PageLoad } from './$types';

export const load: PageLoad = async ({ depends }) => {
  depends('admin:settings:exchanges');

  let apiKeys: AdminSingleKey[] = [];

  if (browser) {
    const token = localStorage.getItem('admin-access-token');

    if (token) {
      try {
        apiKeys = await getAllAPIKeys(token);
      } catch (error) {
        console.error('Failed to load API keys', error);
      }
    }
  }

  return {
    growInfo: await getGrowBasicInfo(),
    apiKeys,
  }
}

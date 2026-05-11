import { getGrowBasicInfo } from "$lib/helpers/mrm/grow";
import { browser } from "$app/environment";

import type { PageLoad } from './$types';

export const load: PageLoad = async ({ depends }) => {
    depends('admin:settings');
    if (!browser) {
        return {
            growInfo: null,
        };
    }
    const token = localStorage.getItem("admin-access-token") || undefined;
    return {
        growInfo: await getGrowBasicInfo(token).catch(() => null),
    }
}
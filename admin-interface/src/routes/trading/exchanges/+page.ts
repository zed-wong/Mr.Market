import { browser } from "$app/environment";
import { getAccessToken } from "$lib/helpers/api/client";
import { getGrowBasicInfoStrict } from "$lib/helpers/mrm/grow";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ depends }) => {
  depends("admin:settings:exchanges");
  if (!browser) {
    return {
      growInfo: null,
      growInfoError: null,
      waitingForClientSession: true,
    };
  }

  const token = getAccessToken();
  if (!token) {
    return {
      growInfo: null,
      growInfoError: 'Session expired. Sign in again before viewing exchange management.',
      waitingForClientSession: false,
    };
  }

  try {
    return {
      growInfo: await getGrowBasicInfoStrict(token),
      growInfoError: null,
      waitingForClientSession: false,
    };
  } catch (cause) {
    return {
      growInfo: null,
      growInfoError: cause instanceof Error ? cause.message : 'Exchange configuration failed to load',
      waitingForClientSession: false,
    };
  }
};

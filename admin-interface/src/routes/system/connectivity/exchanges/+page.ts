import { browser } from "$app/environment";
import { getAccessToken } from "$lib/helpers/api/client";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ depends }) => {
  depends("admin:connectivity:exchanges");
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
      growInfoError: 'Session expired. Sign in again before viewing exchange connectivity.',
      waitingForClientSession: false,
    };
  }

  return {
    growInfo: null,
    growInfoError: null,
    waitingForClientSession: false,
  };
};

import { browser } from "$app/environment";
import { getAccessToken } from "$lib/helpers/api/client";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ depends }) => {
  depends("admin:market-making:direct");

  if (!browser) {
    return {
      sessionError: null,
      waitingForClientSession: true,
    };
  }

  const token = getAccessToken();

  return {
    sessionError: token
      ? null
      : 'Session expired. Sign in again before viewing direct market-making operations.',
    waitingForClientSession: false,
  };
};

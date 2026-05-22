import { browser } from "$app/environment";
import {
  listStrategyDefinitions,
  listStrategyInstances,
} from "$lib/helpers/mrm/admin/strategy";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ depends }) => {
  depends("admin:settings:strategies");

  if (!browser) {
    return {
      definitions: [],
      instances: [],
    };
  }

  const token = localStorage.getItem("admin-access-token");

  if (!token) {
    return {
      definitions: [],
      instances: [],
    };
  }

  try {
    const [definitions, instances] = await Promise.all([
      listStrategyDefinitions(token),
      listStrategyInstances(token),
    ]);

    return {
      definitions: Array.isArray(definitions) ? definitions : [],
      instances: Array.isArray(instances) ? instances : [],
    };
  } catch (error) {
    console.error("Failed to load strategy settings", error);
    return {
      definitions: [],
      instances: [],
    };
  }
};

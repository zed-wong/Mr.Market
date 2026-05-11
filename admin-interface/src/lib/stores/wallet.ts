import { writable } from 'svelte/store';

export const topAssetsCache = writable([]);
export const user = writable(null);
export const userAssets = writable([]);
export const userSpotOrders = writable([]);
export const userSpotOrdersLoaded = writable(false);
export const userStrategyOrdersLoaded = writable(false);

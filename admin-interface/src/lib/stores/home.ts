import { writable } from 'svelte/store';

export const botId = writable<string | null>(null);
export const mixinConnectLoading = writable(false);
export const mixinConnected = writable(false);

import { writable } from 'svelte/store';
import type { BalanceEntry } from '$lib/types/balances';

export const balances = writable<BalanceEntry[]>([]);
export const balancesLoading = writable(false);
import { derived, writable } from 'svelte/store';
import type { BalanceEntry } from '$lib/types/balances';

export const balances = writable<BalanceEntry[]>([]);
export const balancesLoading = writable(false);
export const totalBalanceUsd = derived(balances, ($balances) =>
  $balances.reduce((sum, entry) => sum + Number(entry.usdValue || 0), 0).toFixed(2)
);

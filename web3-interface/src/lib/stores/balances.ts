import { derived, writable } from 'svelte/store';
import { accountBalances, totalUsdValue } from '$lib/helpers/mock-web3';
import { selectedMockAccountId, walletIsConnected } from '$lib/stores/wallet';
import type { BalanceEntry } from '$lib/types/balances';

export const balances = derived(
  [selectedMockAccountId, walletIsConnected],
  ([$accountId, $isConnected]): BalanceEntry[] =>
    $isConnected ? accountBalances($accountId) : []
);
export const balancesLoading = writable(false);
export const totalBalanceUsd = derived(balances, ($balances) => totalUsdValue($balances));
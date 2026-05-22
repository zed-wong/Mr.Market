import { derived, writable } from 'svelte/store';
import { accountBalances, totalUsdValue } from '$lib/helpers/mock-web3';
import { applyFundingDeltas, balanceFundingState } from '$lib/stores/funding';
import { selectedMockAccountId, walletIsConnected } from '$lib/stores/wallet';
import type { BalanceEntry } from '$lib/types/balances';

export const balances = derived(
  [selectedMockAccountId, walletIsConnected, balanceFundingState],
  ([$accountId, $isConnected]): BalanceEntry[] =>
    $isConnected ? applyFundingDeltas($accountId, accountBalances($accountId)) : []
);
export const balancesLoading = writable(false);
export const totalBalanceUsd = derived(balances, ($balances) => totalUsdValue($balances));
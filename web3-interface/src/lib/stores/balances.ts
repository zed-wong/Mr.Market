import { derived, writable } from 'svelte/store';
import { accountBalances } from '$lib/helpers/mock-web3';
import { applyFundingDeltas, balanceFundingState } from '$lib/stores/funding';
import { walletAccount, walletIsConnected, walletIsUnsupported } from '$lib/stores/wallet';
import type { BalanceEntry } from '$lib/types/balances';

export const balancesLoading = writable(false);
export const balances = derived(
  [walletAccount, walletIsConnected, walletIsUnsupported, balanceFundingState],
  ([$walletAccount, $walletIsConnected, $walletIsUnsupported]) => {
    if (!$walletIsConnected || $walletIsUnsupported || !$walletAccount) return [];
    return applyFundingDeltas($walletAccount.id, accountBalances($walletAccount.id));
  }
);
export const totalBalanceUsd = derived(balances, ($balances) =>
  $balances.reduce((sum, entry) => sum + Number(entry.usdValue || 0), 0).toFixed(2)
);

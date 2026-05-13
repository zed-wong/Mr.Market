<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { isAuthed } from '$lib/stores/auth';
  import { walletAddress, walletChainId } from '$lib/stores/wallet';
  import { getExplorerAddressUrl, shortenAddress, getChainById } from '$lib/helpers/utils';
  import { balances, balancesLoading } from '$lib/stores/balances';
  import BigNumber from 'bignumber.js';
  import { onMount } from 'svelte';
  import { getBalances } from '$lib/helpers/api/web3';

  let totalValue = $derived(
    $balances.reduce((sum, b) => sum.plus(b.usdValue || '0'), new BigNumber('0')).toFixed(2)
  );

  let chainInfo = $derived($walletChainId ? getChainById($walletChainId) : null);

  onMount(async () => {
    if (!$isAuthed) return;
    balancesLoading.set(true);
    try {
      const result = await getBalances();
      balances.set(result);
    } catch (e) {
      console.warn('Failed to load balances', e);
    } finally {
      balancesLoading.set(false);
    }
  });
</script>

<section class="space-y-6" data-testid="web3-home">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-2 p-5 md:p-6">
      <span class="text-base-content/60 text-sm capitalize">{$_('portfolio')}</span>
      <span class="text-3xl font-bold text-base-content">${totalValue}</span>
      <div class="text-xs text-base-content/50">
        {#if $walletAddress}
          <a
            href={getExplorerAddressUrl($walletChainId ?? 1, $walletAddress ?? '')}
            target="_blank"
            rel="noopener noreferrer"
            class="link link-hover"
          >
            {shortenAddress($walletAddress)}
            {#if chainInfo}
              <span class="ml-1">({chainInfo.name})</span>
            {/if}
          </a>
        {/if}
      </div>
    </div>
  </div>

  <div>
    <span class="text-base-content/60 text-sm capitalize">{$_('quick_actions')}</span>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <a href="/deposit" class="card bg-base-100 border border-base-300 shadow-sm hover:border-primary transition-colors">
        <div class="card-body items-center text-center p-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6 text-primary">
            <path fill-rule="evenodd" d="M12 2.25a.75.75 0 01.75.75v15.94l5.22-5.22a.75.75 0 011.06 1.06l-6.5 6.5a.75.75 0 01-1.06 0l-6.5-6.5a.75.75 0 111.06-1.06l5.22 5.22V3a.75.75 0 01.75-.75z" clip-rule="evenodd" />
          </svg>
          <span class="text-sm font-medium capitalize">{$_('deposit_funds')}</span>
        </div>
      </a>

      <a href="/withdraw" class="card bg-base-100 border border-base-300 shadow-sm hover:border-primary transition-colors">
        <div class="card-body items-center text-center p-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6 text-primary">
            <path fill-rule="evenodd" d="M11.47 2.22a.75.75 0 011.06 0l6.5 6.5a.75.75 0 01-1.06 1.06L12.75 2.56v15.69a.75.75 0 01-1.5 0V2.56L6.03 9.78a.75.75 0 01-1.06-1.06l6.5-6.5z" clip-rule="evenodd" />
          </svg>
          <span class="text-sm font-medium capitalize">{$_('withdraw_funds')}</span>
        </div>
      </a>

      <a href="/market" class="card bg-base-100 border border-base-300 shadow-sm hover:border-primary transition-colors">
        <div class="card-body items-center text-center p-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6 text-primary">
            <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625C9.75 8.004 10.254 7.5 10.875 7.5h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125C16.5 3.504 17.004 3 17.625 3h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span class="text-sm font-medium capitalize">{$_('view_market')}</span>
        </div>
      </a>

      <a href="/market-making" class="card bg-base-100 border border-base-300 shadow-sm hover:border-primary transition-colors">
        <div class="card-body items-center text-center p-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6 text-primary">
            <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clip-rule="evenodd" />
          </svg>
          <span class="text-sm font-medium capitalize">{$_('start_market_making')}</span>
        </div>
      </a>
    </div>
  </div>

  {#if $balances.length > 0}
    <div>
      <span class="text-base-content/60 text-sm capitalize">{$_('home')}</span>
      <div class="mt-2 space-y-2">
        {#each $balances as balance}
          <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body flex-row items-center justify-between p-3">
              <div>
                <span class="font-medium text-base-content">{balance.symbol}</span>
                <span class="ml-1 text-xs text-base-content/50">{balance.chainId === 1 ? 'Ethereum' : balance.chainId === 11155111 ? 'Sepolia' : ''}</span>
              </div>
              <div class="text-right">
                <div class="font-medium text-base-content">{balance.amount}</div>
                <div class="text-xs text-base-content/50">${balance.usdValue}</div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if !$balancesLoading}
    <div class="text-center py-8 text-base-content/50">
      <span class="capitalize">{$_('no_balance')}</span>
    </div>
  {/if}
</section>
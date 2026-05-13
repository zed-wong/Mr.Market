<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { isAuthed } from '$lib/stores/auth';
  import { walletChainId } from '$lib/stores/wallet';
  import { getEthereumVaultAddress, SUPPORTED_CHAINS } from '$lib/helpers/constants';
  import { shortenAddress } from '$lib/helpers/utils';
  import { onMount } from 'svelte';

  let vaultAddress = $state('');
  let copied = $state(false);

  onMount(() => {
    vaultAddress = getEthereumVaultAddress() || '';
  });

  const copyVaultAddress = () => {
    if (vaultAddress) {
      navigator.clipboard.writeText(vaultAddress);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };
</script>

<section class="space-y-4" data-testid="web3-deposit">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-3 p-5 md:p-6">
      <span class="text-lg font-bold text-base-content capitalize">{$_('deposit_title')}</span>
      <span class="text-base-content/70">{$_('deposit_subtitle')}</span>
    </div>
  </div>

  {#if vaultAddress}
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body gap-3 p-5 md:p-6">
        <span class="text-sm font-medium text-base-content/60 capitalize">{$_('deposit_vault_address')}</span>
        <div class="flex items-center gap-2">
          <code class="flex-1 rounded bg-base-200 px-3 py-2 text-sm break-all">{vaultAddress}</code>
          <button class="btn btn-sm btn-outline capitalize" onclick={copyVaultAddress}>
            {#if copied}
              {$_('deposit_copied')}
            {:else}
              {$_('deposit_copy_address')}
            {/if}
          </button>
        </div>
        <p class="text-xs text-base-content/50 mt-2">
          Send ETH or approved ERC-20 tokens to this address on the Ethereum network. Deposits require 12 confirmations to be credited.
        </p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body gap-3 p-5 md:p-6">
        <span class="text-base-content/70">
          Deposit instructions will be available once the vault contract is deployed. For now, please use the mainnet vault address provided by the operator.
        </span>
      </div>
    </div>
  {/if}

  {#if $walletChainId && $walletChainId !== 1 && $walletChainId !== 11155111}
    <div class="alert alert-warning">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
        <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.31 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
      </svg>
      <span class="capitalize">{$_('wrong_network')} — {$_('switch_network')}</span>
    </div>
  {/if}
</section>
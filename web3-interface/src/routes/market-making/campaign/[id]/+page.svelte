<script lang="ts">
  import { page } from '$app/stores';
  import { mockCampaigns, namespaceLabel } from '$lib/helpers/mock-web3';
  import { openMockWallet, walletIsConnected, walletIsUnsupported, walletNamespace, walletNamespaceLabel } from '$lib/stores/wallet';

  let campaign = $derived(mockCampaigns.find((item) => item.id === $page.params.id) ?? mockCampaigns[0]);
  let eligible = $derived(Boolean($walletIsConnected && campaign.chains.includes($walletNamespace ?? 'evm')));
</script>

<section class="space-y-6" data-testid="campaign-detail">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-2">
          <span class="text-2xl font-bold">{campaign.name}</span>
          <span class="text-base-content/70">{campaign.summary}</span>
        </div>
        <span class="badge badge-outline">{campaign.status}</span>
      </div>

      <div class="grid gap-3 md:grid-cols-3">
        <span class="rounded-box bg-base-200 p-4">Liquidity goal<br /><strong>{campaign.liquidity}</strong></span>
        <span class="rounded-box bg-base-200 p-4">Volume goal<br /><strong>{campaign.volume}</strong></span>
        <span class="rounded-box bg-base-200 p-4">Minimum contribution<br /><strong>{campaign.minimum}</strong></span>
      </div>

      <div class="flex flex-wrap gap-2">
        {#each campaign.chains as chain}
          <span class="badge {chain === $walletNamespace ? 'badge-primary' : 'badge-ghost'}">{namespaceLabel(chain)}</span>
        {/each}
        {#each campaign.assets as asset}
          <span class="badge badge-outline">{asset}</span>
        {/each}
      </div>

      <div class="alert {eligible ? 'alert-success' : $walletIsUnsupported ? 'alert-warning' : 'alert-info'}" data-testid="campaign-eligibility">
        <span>
          {eligible
            ? `Eligible with ${$walletNamespaceLabel}.`
            : $walletIsUnsupported
              ? 'Unsupported chain blocks participation.'
              : 'Connect an eligible EVM or Solana mocked wallet to participate.'}
        </span>
      </div>

      {#if !$walletIsConnected && !$walletIsUnsupported}
        <button class="btn btn-primary w-fit" onclick={openMockWallet}>Connect to join</button>
      {:else}
        <a href="/market-making/order/new?campaign={campaign.id}" class="btn btn-primary w-fit {$walletIsUnsupported || !eligible ? 'btn-disabled' : ''}">Create market-making order</a>
      {/if}
    </div>
  </div>
</section>

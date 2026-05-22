<script lang="ts">
  import { page } from '$app/stores';
  import {
    campaignEligibility,
    namespaceLabel,
    type WalletNamespace,
  } from '$lib/helpers/mock-web3';
  import { allCampaigns } from '$lib/stores/market-making';
  import {
    openMockWallet,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespace,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  const indicatorNamespaces: WalletNamespace[] = ['evm', 'solana'];

  let campaign = $derived($allCampaigns.find((item) => item.id === $page.params.id) ?? null);
  let eligibility = $derived(
    campaign
      ? campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported)
      : null
  );
</script>

<section class="space-y-6" data-testid="campaign-detail">
  {#if !campaign}
    <div class="alert alert-warning" data-testid="campaign-not-found">
      <span>Campaign not found. Return to mocked campaign discovery to choose a public campaign.</span>
      <a href="/market-making" class="btn btn-sm btn-primary">Open campaigns</a>
    </div>
  {:else}
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
        <span class="rounded-box bg-base-200 p-4">Liquidity goal<br /><strong>{campaign.metrics.liquidityGoal}</strong><br /><span class="text-sm text-base-content/60">Current {campaign.metrics.currentLiquidity}</span></span>
        <span class="rounded-box bg-base-200 p-4">Volume goal<br /><strong>{campaign.metrics.volumeGoal}</strong><br /><span class="text-sm text-base-content/60">Current {campaign.metrics.currentVolume}</span></span>
        <span class="rounded-box bg-base-200 p-4">Minimum contribution<br /><strong>{campaign.minimum}</strong></span>
        <span class="rounded-box bg-base-200 p-4">Projected rewards<br /><strong>{campaign.metrics.projectedReward}</strong><br /><span class="text-sm text-base-content/60">{campaign.rewardRate}</span></span>
        <span class="rounded-box bg-base-200 p-4">Timing<br /><strong>{campaign.duration}</strong></span>
        <span class="rounded-box bg-base-200 p-4">Participants<br /><strong>{campaign.participants}</strong></span>
      </div>

      <div class="flex flex-wrap gap-2" data-testid="campaign-detail-indicators">
        {#each indicatorNamespaces as chain}
          <span
            class="badge {campaign.chains.includes(chain) ? (chain === $walletNamespace ? 'badge-primary' : 'badge-ghost') : 'badge-outline'}"
            data-testid="campaign-detail-chain-{chain}"
          >
            {namespaceLabel(chain)} {campaign.chains.includes(chain) ? 'supported' : 'not supported'}
          </span>
        {/each}
        {#each campaign.assets as asset}
          <span class="badge badge-outline">{asset}</span>
        {/each}
      </div>

      <div class="rounded-box border border-base-300 bg-base-200 p-4" data-testid="campaign-wallet-context">
        <span class="font-semibold">Active wallet context</span>
        <span class="block text-sm text-base-content/70">
          {$walletNamespaceLabel} · {$walletNetwork ?? 'not selected'} · {$walletShortAddress || 'no address connected'}
        </span>
      </div>

      <div
        class="alert {eligibility?.canParticipate ? 'alert-success' : $walletIsUnsupported ? 'alert-warning' : 'alert-info'}"
        data-testid="campaign-eligibility"
      >
        <span>
          {eligibility?.message}
        </span>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-box border border-base-300 bg-base-100 p-4" data-testid="campaign-terms">
          <span class="font-semibold">Terms</span>
          <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-base-content/70">
            {#each campaign.terms as term}
              <li>{term}</li>
            {/each}
          </ul>
        </div>

        <div class="rounded-box border border-base-300 bg-base-100 p-4" data-testid="campaign-requirements">
          <span class="font-semibold">Participation requirements</span>
          <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-base-content/70">
            {#each campaign.requirements as requirement}
              <li>{requirement}</li>
            {/each}
          </ul>
        </div>
      </div>

      {#if !$walletIsConnected && !$walletIsUnsupported}
        <button class="btn btn-primary w-fit" onclick={openMockWallet}>Connect to join</button>
      {:else if eligibility?.canParticipate}
        <a href="/market-making/order/new?campaign={campaign.id}" class="btn btn-primary w-fit" data-testid="campaign-detail-create-order">Create market-making order</a>
      {:else}
        <button class="btn btn-primary w-fit" disabled data-testid="campaign-detail-create-order">
          {eligibility?.state === 'unsupported-chain' ? 'Unsupported chain' : 'Switch wallet namespace'}
        </button>
      {/if}
    </div>
  </div>
  {/if}
</section>

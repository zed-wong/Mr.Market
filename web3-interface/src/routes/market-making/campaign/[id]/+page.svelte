<script lang="ts">
  import { page } from '$app/stores';
  import Section from '$lib/components/common/Section.svelte';
  import {
    campaignEligibility,
    namespaceLabel,
    type WalletNamespace,
  } from '$lib/helpers/mock-web3';
  import { allCampaigns } from '$lib/stores/market-making';
  import {
    openNetworkModal,
    openMockWallet,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespace,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  const indicatorNamespaces: WalletNamespace[] = ['evm', 'solana'];
  type DetailState = 'loaded' | 'loading' | 'error';

  let detailState = $state<DetailState>('loaded');
  let campaign = $derived($allCampaigns.find((item) => item.id === $page.params.id) ?? null);
  let eligibility = $derived(
    campaign
      ? campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported)
      : null
  );
</script>

<div data-testid="campaign-detail">
  {#if !campaign}
    <section class="pt-2 max-w-xl" data-testid="campaign-not-found">
      <span class="eyebrow">Not found</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Campaign not found</span>
      <span class="mt-4 block text-base-content/60">
        Return to mocked campaign discovery to choose a public campaign.
      </span>
      <a href="/market-making" class="btn-pill-primary mt-6 inline-flex">Open campaigns</a>
    </section>
  {:else if detailState === 'loading'}
    <section class="pt-2 max-w-xl" data-testid="campaign-detail-loading-state">
      <span class="eyebrow">Loading</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Loading campaign metrics</span>
      <span class="mt-4 flex items-center gap-3 text-sm text-base-content/60">
        <span class="loading loading-spinner loading-sm"></span>
        Preparing campaign liquidity, eligibility, terms, and reward metrics from deterministic local fixtures.
      </span>
      <button class="btn-pill-primary mt-6" onclick={() => { detailState = 'loaded'; }}>Show loaded campaign</button>
    </section>
  {:else if detailState === 'error'}
    <section class="pt-2 max-w-xl" data-testid="campaign-detail-error-state">
      <span class="eyebrow">Recovery</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Campaign preview unavailable</span>
      <span class="mt-4 block text-base-content/60">
        Campaign detail could not be prepared in this preview state. Retry to restore the local deterministic campaign without contacting a backend.
      </span>
      <button class="btn-pill-primary mt-6" onclick={() => { detailState = 'loaded'; }}>Retry campaign detail</button>
    </section>
  {:else}
    <section class="pt-2">
      <span class="eyebrow">{campaign.status}</span>
      <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content">{campaign.name}</span>
      <span class="mt-4 block max-w-2xl text-base-content/60">{campaign.summary}</span>

      <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/50" data-testid="campaign-detail-indicators">
        {#each indicatorNamespaces as chain}
          <span
            class="capitalize {campaign.chains.includes(chain) ? (chain === $walletNamespace ? 'text-primary' : 'text-base-content') : 'text-base-content/35'}"
            data-testid="campaign-detail-chain-{chain}"
          >
            {namespaceLabel(chain)} {campaign.chains.includes(chain) ? '✓' : '—'}
          </span>
        {/each}
        <span class="text-base-content/30">·</span>
        <span>{campaign.assets.join(' / ')}</span>
      </div>
    </section>

    <section class="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="campaign-detail-state-controls">
      <span class="text-sm text-base-content/60">State preview for validation and demos.</span>
      <label class="flex items-center gap-2 text-sm">
        <span class="eyebrow">State</span>
        <select class="bg-transparent border-b border-base-300 px-0 py-1 focus:outline-none focus:border-base-content" bind:value={detailState} data-testid="campaign-detail-state-select">
          <option value="loaded">Loaded detail</option>
          <option value="loading">Loading state</option>
          <option value="error">Error state</option>
        </select>
      </label>
    </section>

    <Section title="Metrics" eyebrow="Targets">
      <div class="grid gap-px bg-base-300 border border-base-300 rounded-2xl overflow-hidden md:grid-cols-3">
        <div class="bg-base-100 p-6">
          <span class="eyebrow">Liquidity</span>
          <span class="mt-2 block font-mono-num text-2xl">{campaign.metrics.liquidityGoal}</span>
          <span class="text-xs text-base-content/50">Current {campaign.metrics.currentLiquidity}</span>
        </div>
        <div class="bg-base-100 p-6">
          <span class="eyebrow">Volume</span>
          <span class="mt-2 block font-mono-num text-2xl">{campaign.metrics.volumeGoal}</span>
          <span class="text-xs text-base-content/50">Current {campaign.metrics.currentVolume}</span>
        </div>
        <div class="bg-base-100 p-6">
          <span class="eyebrow">Minimum</span>
          <span class="mt-2 block font-mono-num text-2xl">{campaign.minimum}</span>
        </div>
        <div class="bg-base-100 p-6">
          <span class="eyebrow">Projected reward</span>
          <span class="mt-2 block font-mono-num text-2xl">{campaign.metrics.projectedReward}</span>
          <span class="text-xs text-base-content/50">{campaign.rewardRate}</span>
        </div>
        <div class="bg-base-100 p-6">
          <span class="eyebrow">Timing</span>
          <span class="mt-2 block text-2xl">{campaign.duration}</span>
        </div>
        <div class="bg-base-100 p-6">
          <span class="eyebrow">Participants</span>
          <span class="mt-2 block font-mono-num text-2xl">{campaign.participants}</span>
        </div>
      </div>
    </Section>

    <Section title="Wallet context" eyebrow="Active session">
      <div class="border-t border-base-300 pt-6" data-testid="campaign-wallet-context">
        <span class="text-sm text-base-content/70">
          {$walletNamespaceLabel} · {$walletNetwork ?? 'not selected'} · <span class="font-mono-num">{$walletShortAddress || 'no address'}</span>
        </span>
      </div>

      <div
        class="mt-6 rounded-2xl border px-5 py-4 text-sm {eligibility?.canParticipate ? 'border-success/40 text-base-content' : $walletIsUnsupported ? 'border-warning/40 text-base-content/70' : 'border-base-300 text-base-content/70'}"
        data-testid="campaign-eligibility"
      >
        {eligibility?.message}
      </div>
    </Section>

    <Section title="Terms & requirements">
      <div class="grid gap-10 border-t border-base-300 pt-6 md:grid-cols-2">
        <div data-testid="campaign-terms">
          <span class="eyebrow">Terms</span>
          <ul class="mt-3 flex flex-col gap-3">
            {#each campaign.terms as term}
              <li class="flex gap-3 text-sm text-base-content/70">
                <span class="text-base-content/30">—</span>
                <span>{term}</span>
              </li>
            {/each}
          </ul>
        </div>

        <div data-testid="campaign-requirements">
          <span class="eyebrow">Requirements</span>
          <ul class="mt-3 flex flex-col gap-3">
            {#each campaign.requirements as requirement}
              <li class="flex gap-3 text-sm text-base-content/70">
                <span class="text-base-content/30">—</span>
                <span>{requirement}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="mt-10 flex flex-wrap gap-3">
        {#if !$walletIsConnected && !$walletIsUnsupported}
          <button class="btn-pill-primary" onclick={openMockWallet}>Connect to join</button>
        {:else if eligibility?.canParticipate}
          <a href="/market-making/order/new?campaign={campaign.id}" class="btn-pill-primary" data-testid="campaign-detail-create-order">
            Create order
          </a>
        {:else}
          {#if eligibility?.state === 'unsupported-chain'}
            <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="campaign-detail-create-order">
              Switch network
            </button>
          {:else if eligibility?.state === 'campaign-paused'}
            <button class="btn-pill-outline opacity-40 cursor-not-allowed" disabled data-testid="campaign-detail-create-order">
              Paused
            </button>
          {:else}
            <button class="btn-pill-outline opacity-40 cursor-not-allowed" disabled data-testid="campaign-detail-create-order">
              Switch namespace
            </button>
          {/if}
        {/if}
        <a href="/market-making" class="btn-pill-ghost">← All pools</a>
      </div>
    </Section>
  {/if}
</div>

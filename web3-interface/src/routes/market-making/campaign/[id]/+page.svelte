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
          <button class="btn-pill-outline opacity-40 cursor-not-allowed" disabled data-testid="campaign-detail-create-order">
            {eligibility?.state === 'unsupported-chain' ? 'Unsupported chain' : 'Switch namespace'}
          </button>
        {/if}
        <a href="/market-making" class="btn-pill-ghost">← All pools</a>
      </div>
    </Section>
  {/if}
</div>

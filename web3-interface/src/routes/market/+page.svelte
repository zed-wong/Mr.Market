<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import { mockCampaigns, namespaceLabel, type CampaignFilter, filterMockCampaigns } from '$lib/helpers/mock-web3';
  import { walletIsConnected, walletIsUnsupported, walletNamespace } from '$lib/stores/wallet';

  const filterChips: { value: CampaignFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'evm', label: 'EVM' },
    { value: 'solana', label: 'Solana' },
    { value: 'open', label: 'Open' },
    { value: 'active', label: 'Active' },
  ];

  let activeFilter = $state<CampaignFilter>('all');

  const filtered = $derived(
    filterMockCampaigns(mockCampaigns, activeFilter, $walletNamespace, $walletIsConnected, $walletIsUnsupported)
  );

  const statusDot = (status: string): string => {
    if (status === 'active') return 'bg-success';
    if (status === 'open') return 'bg-info';
    return 'bg-base-content/30';
  };
</script>

<div class="anim-page-enter" data-testid="web3-market-safe">
  <section class="flex flex-wrap items-end justify-between gap-4 px-1">
    <div class="flex flex-col">
      <span class="eyebrow">Markets</span>
      <span class="mt-1 text-display text-base-content">Campaigns</span>
      <span class="mt-3 max-w-xl text-body-muted">
        Join active liquidity campaigns with your wallet. Each campaign defines its chain support and minimum contribution.
      </span>
    </div>
    <a href="/market-making" class="btn-pill-outline" data-testid="market-safe-campaigns-link">
      View pools →
    </a>
  </section>

  <Section eyebrow="Discovery" title="Active campaigns">
    {#snippet actions()}
      <div class="flex flex-wrap gap-1.5 rounded-2xl bg-base-200 p-1" data-testid="market-filter-chips">
        {#each filterChips as chip}
          <button
            class="btn-pill rounded-xl px-3 py-1.5 text-xs {activeFilter === chip.value ? 'bg-base-100 text-base-content shadow-sm' : 'text-base-content/55 hover:text-base-content'}"
            onclick={() => (activeFilter = chip.value)}
            data-testid="market-filter-{chip.value}"
          >
            {chip.label}
          </button>
        {/each}
      </div>
    {/snippet}

    <div data-testid="market-safe-campaigns">
      {#if filtered.length === 0}
        <div class="card-surface px-5 py-12 text-center text-body-muted">
          No campaigns match the selected filter.
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each filtered as campaign, i}
            <a
              href="/market-making/campaign/{campaign.id}"
              class="group card-surface card-hover flex flex-col gap-3 p-5 anim-card-enter"
              style="animation-delay: {i * 40}ms"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <span class="inline-block size-2 rounded-full {statusDot(campaign.status)}"></span>
                  <span class="text-base font-semibold text-base-content">{campaign.name}</span>
                  <span class="rounded-full bg-base-100 px-2.5 py-0.5 text-[11px] font-medium capitalize tracking-tight text-base-content/60">{campaign.status}</span>
                </div>
                <span class="inline-block text-base-content/40 transition-transform duration-220 ease-out group-hover:translate-x-1 group-hover:text-primary">→</span>
              </div>

              <span class="text-body-muted">{campaign.summary}</span>

              <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  {#each campaign.chains as chain}
                    <span class="rounded-full bg-base-100 px-2.5 py-0.5 text-[11px] font-medium text-base-content/70">{namespaceLabel(chain)}</span>
                  {/each}
                  {#each campaign.assets as asset}
                    <span class="rounded-full bg-base-100 px-2.5 py-0.5 text-[11px] font-medium text-base-content/70">{asset}</span>
                  {/each}
                </div>

                <div class="flex items-baseline gap-5 text-xs">
                  <div class="flex flex-col">
                    <span class="text-base-content/50">Min</span>
                    <span class="font-mono-num font-semibold text-base-content">{campaign.minimum}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-base-content/50">Liquidity</span>
                    <span class="font-mono-num font-semibold text-base-content">{campaign.liquidity}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-base-content/50">APR</span>
                    <span class="font-mono-num font-semibold text-primary">{campaign.rewardRate}</span>
                  </div>
                </div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </Section>
</div>

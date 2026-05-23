<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import { mockCampaigns, namespaceLabel } from '$lib/helpers/mock-web3';
</script>

<div data-testid="web3-market-safe">
  <section class="pt-2 flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col">
      <span class="eyebrow">Markets</span>
      <span class="mt-3 font-display text-5xl md:text-6xl tracking-tight text-base-content">Campaigns</span>
      <span class="mt-4 max-w-xl text-base-content/60">
        This legacy route now exposes only in-scope campaign discovery and market-making guidance.
      </span>
    </div>
    <a href="/market-making" class="btn-pill-outline" data-testid="market-safe-campaigns-link">
      Open campaigns →
    </a>
  </section>

  <Section title="Discovery" eyebrow="Mocked listings">
    <div class="border-t border-base-300" data-testid="market-safe-campaigns">
      {#each mockCampaigns as campaign}
        <a
          href="/market-making/campaign/{campaign.id}"
          class="group flex flex-col gap-3 border-b border-base-300 py-6 transition-colors hover:bg-base-200/40"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-3">
            <span class="font-medium text-base-content text-lg">{campaign.name}</span>
            <div class="flex items-center gap-3">
              <span class="eyebrow">{campaign.status}</span>
              <span class="text-base-content/40 transition-colors group-hover:text-primary">→</span>
            </div>
          </div>
          <span class="text-sm text-base-content/60">{campaign.summary}</span>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            {#each campaign.chains as chain}
              <span class="text-xs capitalize tracking-wide text-base-content/50">{namespaceLabel(chain)}</span>
            {/each}
            {#each campaign.assets as asset}
              <span class="text-xs capitalize tracking-wide text-base-content/50">· {asset}</span>
            {/each}
          </div>
          <span class="text-xs text-base-content/50">
            Minimum {campaign.minimum} · liquidity {campaign.liquidity}
          </span>
        </a>
      {/each}
    </div>
  </Section>
</div>

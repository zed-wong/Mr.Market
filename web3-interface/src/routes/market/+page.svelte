<script lang="ts">
  import { mockCampaigns, namespaceLabel } from '$lib/helpers/mock-web3';
</script>

<section class="space-y-6" data-testid="web3-market-safe">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-4 p-5 md:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-2">
          <span class="text-2xl font-bold text-base-content">Campaigns / Market Making</span>
          <span class="text-base-content/70">
            This legacy route now exposes only in-scope campaign discovery and market-making guidance.
          </span>
        </div>
        <a href="/market-making" class="btn btn-primary" data-testid="market-safe-campaigns-link">
          Open campaigns
        </a>
      </div>
    </div>
  </div>

  <div class="grid gap-4 xl:grid-cols-3" data-testid="market-safe-campaigns">
    {#each mockCampaigns as campaign}
      <a href="/market-making/campaign/{campaign.id}" class="card border border-base-300 bg-base-100 shadow-sm transition-colors hover:border-primary">
        <div class="card-body gap-3">
          <div class="flex items-start justify-between gap-3">
            <span class="font-semibold text-base-content">{campaign.name}</span>
            <span class="badge badge-outline">{campaign.status}</span>
          </div>
          <span class="text-sm text-base-content/60">{campaign.summary}</span>
          <div class="flex flex-wrap gap-2">
            {#each campaign.chains as chain}
              <span class="badge badge-ghost">{namespaceLabel(chain)}</span>
            {/each}
            {#each campaign.assets as asset}
              <span class="badge badge-outline">{asset}</span>
            {/each}
          </div>
          <span class="text-sm text-base-content/70">Minimum {campaign.minimum} · liquidity {campaign.liquidity}</span>
        </div>
      </a>
    {/each}
  </div>
</section>
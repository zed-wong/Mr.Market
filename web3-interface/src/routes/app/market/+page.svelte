<script lang="ts">
  import { onMount } from 'svelte';
  import Section from '$lib/components/common/Section.svelte';
  import {
    HUFI_CAMPAIGN_LIST_LIMIT,
    HUFI_POLYGON_CHAIN_ID,
    fetchActiveHufiCampaigns,
    fetchHufiCampaignStats,
    fetchHufiTotalVolumeStats,
    formatLauncherAmount,
    formatLauncherDate,
    formatLauncherExchange,
    formatLauncherStatus,
    formatLauncherTarget,
    formatLauncherType,
    formatUsd,
    hufiCampaignDetailPath,
    launcherAmountPaid,
    launcherFundUsagePercent,
    shortenLauncherAddress,
    type HufiCampaign,
    type HufiCampaignStats,
    type HufiTotalVolumeStats,
  } from '$lib/helpers/hufi-campaign-launcher';

  const chainOptions = [
    { id: HUFI_POLYGON_CHAIN_ID, name: 'Polygon' },
    { id: 56, name: 'BNB Chain' },
    { id: 8453, name: 'Base' },
    { id: 1, name: 'Ethereum' },
  ];

  let campaigns = $state<HufiCampaign[]>([]);
  let stats = $state<HufiCampaignStats | null>(null);
  let totalVolumeStats = $state<HufiTotalVolumeStats | null>(null);
  let isLoading = $state(true);
  let errorMessage = $state('');
  let lastLoadedAt = $state('');
  let selectedChainId = $state(HUFI_POLYGON_CHAIN_ID);
  let loadSequence = 0;

  const selectedChain = $derived(
    chainOptions.find((chain) => chain.id === selectedChainId) ?? chainOptions[0]
  );
  const displayedCampaigns = $derived(campaigns);
  const showLoading = $derived(isLoading);
  const showError = $derived(Boolean(errorMessage));
  const showEmpty = $derived(!showLoading && !showError && displayedCampaigns.length === 0);

  const statusDot = (status: string): string => {
    if (status === 'active') return 'bg-success';
    if (status === 'completed') return 'bg-info';
    return 'bg-base-content/30';
  };

  const statusBadgeClass = (status: string): string => {
    if (status === 'active') return 'bg-success/10 text-success border-success/20';
    if (status === 'completed') return 'bg-info/10 text-info border-info/20';
    return 'bg-base-100 text-base-content/60 border-base-300/60';
  };

  const loadCampaigns = async () => {
    const sequence = ++loadSequence;
    isLoading = true;
    errorMessage = '';
    campaigns = [];
    stats = null;
    totalVolumeStats = null;
    lastLoadedAt = '';
    try {
      const chainId = selectedChain.id;
      const [campaignList, campaignStats, totalVolume] = await Promise.all([
        fetchActiveHufiCampaigns({ limit: HUFI_CAMPAIGN_LIST_LIMIT, chainId }),
        fetchHufiCampaignStats(chainId).catch(() => null),
        fetchHufiTotalVolumeStats().catch(() => null),
      ]);
      if (sequence !== loadSequence) return;
      campaigns = campaignList.results ?? [];
      stats = campaignStats;
      totalVolumeStats = totalVolume;
      lastLoadedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      if (sequence !== loadSequence) return;
      errorMessage = error instanceof Error
        ? error.message
        : 'HuFi Campaign Launcher data could not be loaded.';
    } finally {
      if (sequence === loadSequence) {
        isLoading = false;
      }
    }
  };

  const handleChainChange = () => {
    void loadCampaigns();
  };

  onMount(() => {
    void loadCampaigns();
  });
</script>

<div class="anim-page-enter" data-testid="web3-market-safe">
  <section class="flex flex-wrap items-end justify-between gap-4 px-1">
    <div class="flex flex-col">
      <span class="eyebrow">Campaigns</span>
      <span class="mt-1 text-display text-base-content">HuFi campaigns</span>
      <span class="mt-3 max-w-xl text-body-muted">
        Browse active campaigns from the public HuFi Campaign Launcher. Discovery is public and does not require a wallet connection.
      </span>
    </div>
  </section>

  <section class="mt-8 grid gap-3 md:grid-cols-4" data-testid="market-launcher-stats">
    <div class="card-surface p-5">
      <span class="eyebrow">Active</span>
      <span class="mt-2 block metric-number text-2xl font-semibold text-base-content">
        {stats?.n_active_campaigns ?? campaigns.length}
      </span>
      <span class="text-xs text-base-content/50">{selectedChain.name} launcher campaigns</span>
    </div>
    <div class="card-surface p-5">
      <span class="eyebrow">Rewards pool</span>
      <span class="mt-2 block metric-number text-2xl font-semibold text-base-content">{formatUsd(stats?.rewards_pool_usd)}</span>
      <span class="text-xs text-base-content/50">Reported by launcher stats</span>
    </div>
    <div class="card-surface p-5">
      <span class="eyebrow">Finished</span>
      <span class="mt-2 block metric-number text-2xl font-semibold text-base-content">
        {stats?.n_finished_campaigns ?? '—'}
      </span>
      <span class="text-xs text-base-content/50">Historical campaigns</span>
    </div>
    <div class="card-surface p-5">
      <span class="eyebrow">Total volume</span>
      <span class="mt-2 block metric-number text-2xl font-semibold text-base-content">{formatUsd(totalVolumeStats?.total_volume)}</span>
      <span class="text-xs text-base-content/50">{lastLoadedAt ? `Updated ${lastLoadedAt}` : 'Waiting for reporting'}</span>
    </div>
  </section>

  <Section eyebrow="Discovery" title="Active campaigns">
    {#snippet actions()}
      <div class="flex flex-wrap items-center gap-2">
        <label class="form-control w-44" data-testid="market-launcher-chain-control" aria-label="Select campaign chain">
          <select class="select select-bordered select-sm w-full bg-base-100" bind:value={selectedChainId} onchange={handleChainChange}>
            {#each chainOptions as chain}
              <option value={chain.id}>{chain.name}</option>
            {/each}
          </select>
        </label>
        <button class="btn-pill-outline" onclick={loadCampaigns} data-testid="market-launcher-retry">
          Refresh launcher
        </button>
      </div>
    {/snippet}

    <div data-testid="market-safe-campaigns">
      {#if showLoading}
        <div class="card-surface px-5 py-12 text-center" data-testid="market-launcher-loading">
          <span class="loading loading-spinner loading-md text-primary"></span>
          <span class="mt-4 block text-base-content/70">
            Loading active {selectedChain.name} campaigns from the public HuFi Campaign Launcher.
          </span>
        </div>
      {:else if showError}
        <div class="card-surface px-5 py-12 text-center" data-testid="market-launcher-error">
          <span class="eyebrow">Launcher unavailable</span>
          <span class="mt-3 block text-2xl font-semibold text-base-content">Campaign discovery could not be loaded</span>
          <span class="mx-auto mt-3 block max-w-2xl text-body-muted">
            {errorMessage}
          </span>
          <button class="btn-pill-primary mt-6" onclick={loadCampaigns}>Retry public launcher</button>
        </div>
      {:else if showEmpty}
        <div class="card-surface px-5 py-12 text-center text-body-muted" data-testid="market-launcher-empty">
          <span class="eyebrow">No active campaigns</span>
          <span class="mt-3 block text-2xl font-semibold text-base-content">No active {selectedChain.name} campaigns were returned</span>
          <span class="mx-auto mt-3 block max-w-xl">
            The launcher responded successfully, but there are no active campaigns for chain id {selectedChain.id}. Refresh to check again.
          </span>
          <button class="btn-pill-outline mt-6" onclick={loadCampaigns}>Refresh launcher</button>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each displayedCampaigns as campaign, i}
            <a
              href={hufiCampaignDetailPath(campaign)}
              class="group card-surface card-hover flex flex-col gap-3 p-5 anim-card-enter"
              style="animation-delay: {i * 40}ms"
              data-testid="market-launcher-campaign-card"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <span class="inline-block size-2 rounded-full {statusDot(campaign.status)}"></span>
                  <span class="text-base font-semibold text-base-content">{campaign.symbol}</span>
                  <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize tracking-tight {statusBadgeClass(campaign.status)}">
                    <span class="size-1.5 rounded-full {statusDot(campaign.status)}"></span>
                    {formatLauncherStatus(campaign.status)}
                  </span>
                  <span class="rounded-full bg-base-100 px-2.5 py-0.5 text-[11px] font-medium text-base-content/60">{formatLauncherType(campaign.type)}</span>
                </div>
                <span class="inline-block text-base-content/40 transition-transform duration-220 ease-out group-hover:translate-x-1 group-hover:text-primary">→</span>
              </div>

              <span class="text-body-muted">
                {formatLauncherExchange(campaign.exchange_name)} - {selectedChain.name} - {shortenLauncherAddress(campaign.address)}
              </span>

              <div class="grid gap-3 pt-1 md:grid-cols-4">
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Funded</span>
                  <span class="text-num font-semibold text-base-content">{formatLauncherAmount(campaign.fund_amount, campaign.fund_token_decimals, campaign.fund_token_symbol)}</span>
                </div>
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Dates</span>
                  <span class="text-num font-semibold text-base-content">{formatLauncherDate(campaign.start_date)} → {formatLauncherDate(campaign.end_date)}</span>
                </div>
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Target</span>
                  <span class="text-num font-semibold text-primary">{formatLauncherTarget(campaign)}</span>
                </div>
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Paid</span>
                  <span class="text-num font-semibold text-base-content">{launcherAmountPaid(campaign)} paid</span>
                  <progress class="progress progress-primary mt-2 h-1.5" value={launcherFundUsagePercent(campaign)} max="100"></progress>
                </div>
              </div>

            </a>
          {/each}
        </div>
      {/if}
    </div>
  </Section>
</div>

<script lang="ts">
  import { onMount } from 'svelte';
  import Section from '$lib/components/common/Section.svelte';
  import {
    HUFI_CAMPAIGN_LIST_LIMIT,
    HUFI_POLYGON_CHAIN_ID,
    fetchActiveHufiCampaigns,
    fetchHufiCampaignStats,
    formatLauncherAmount,
    formatLauncherDate,
    formatLauncherExchange,
    formatLauncherStatus,
    formatLauncherTarget,
    formatLauncherType,
    formatUsd,
    hufiCampaignDetailPath,
    hufiCampaignLauncherBaseUrl,
    launcherAmountPaid,
    launcherFundUsagePercent,
    shortenLauncherAddress,
    type HufiCampaign,
    type HufiCampaignStats,
  } from '$lib/helpers/hufi-campaign-launcher';

  type LauncherPreviewState = 'live' | 'loading' | 'empty' | 'error';

  let campaigns = $state<HufiCampaign[]>([]);
  let stats = $state<HufiCampaignStats | null>(null);
  let isLoading = $state(true);
  let errorMessage = $state('');
  let lastLoadedAt = $state('');
  let previewState = $state<LauncherPreviewState>('live');

  const displayedCampaigns = $derived(previewState === 'empty' ? [] : campaigns);
  const showLoading = $derived(previewState === 'loading' || (previewState === 'live' && isLoading));
  const showError = $derived(previewState === 'error' || Boolean(errorMessage));
  const showEmpty = $derived(!showLoading && !showError && displayedCampaigns.length === 0);

  const polygonContext = `Polygon · chain id ${HUFI_POLYGON_CHAIN_ID}`;

  const statusDot = (status: string): string => {
    if (status === 'active') return 'bg-success';
    if (status === 'completed') return 'bg-info';
    return 'bg-base-content/30';
  };

  const loadCampaigns = async () => {
    previewState = 'live';
    isLoading = true;
    errorMessage = '';
    try {
      const [campaignList, campaignStats] = await Promise.all([
        fetchActiveHufiCampaigns({ limit: HUFI_CAMPAIGN_LIST_LIMIT }),
        fetchHufiCampaignStats().catch(() => null),
      ]);
      campaigns = campaignList.results ?? [];
      stats = campaignStats;
      lastLoadedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      errorMessage = error instanceof Error
        ? error.message
        : 'HuFi Campaign Launcher data could not be loaded.';
    } finally {
      isLoading = false;
    }
  };

  onMount(() => {
    void loadCampaigns();
  });
</script>

<div class="anim-page-enter" data-testid="web3-market-safe">
  <section class="flex flex-wrap items-end justify-between gap-4 px-1">
    <div class="flex flex-col">
      <span class="eyebrow">Markets</span>
      <span class="mt-1 text-display text-base-content">HuFi campaigns</span>
      <span class="mt-3 max-w-xl text-body-muted">
        Browse live active Polygon campaigns from the public HuFi Campaign Launcher. Discovery is public and does not require a wallet connection.
      </span>
      <span class="mt-3 text-xs text-base-content/50" data-testid="launcher-endpoint">
        Source: {hufiCampaignLauncherBaseUrl()} · {polygonContext}
      </span>
    </div>
    <a href="/market-making" class="btn-pill-outline" data-testid="market-safe-campaigns-link">
      Mock order demo →
    </a>
  </section>

  <section class="mt-8 grid gap-3 md:grid-cols-4" data-testid="market-launcher-stats">
    <div class="card-surface p-5">
      <span class="eyebrow">Active</span>
      <span class="mt-2 block font-mono-num text-2xl text-base-content">
        {stats?.n_active_campaigns ?? campaigns.length}
      </span>
      <span class="text-xs text-base-content/50">Polygon launcher campaigns</span>
    </div>
    <div class="card-surface p-5">
      <span class="eyebrow">Rewards pool</span>
      <span class="mt-2 block font-mono-num text-2xl text-base-content">{formatUsd(stats?.rewards_pool_usd)}</span>
      <span class="text-xs text-base-content/50">Reported by launcher stats</span>
    </div>
    <div class="card-surface p-5">
      <span class="eyebrow">Finished</span>
      <span class="mt-2 block font-mono-num text-2xl text-base-content">
        {stats?.n_finished_campaigns ?? '—'}
      </span>
      <span class="text-xs text-base-content/50">Historical campaigns</span>
    </div>
    <div class="card-surface p-5">
      <span class="eyebrow">Paid rewards</span>
      <span class="mt-2 block font-mono-num text-2xl text-base-content">{formatUsd(stats?.paid_rewards_usd)}</span>
      <span class="text-xs text-base-content/50">{lastLoadedAt ? `Updated ${lastLoadedAt}` : 'Waiting for launcher'}</span>
    </div>
  </section>

  <Section eyebrow="Discovery" title="Active real campaigns">
    {#snippet actions()}
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 rounded-2xl bg-base-200 px-3 py-2 text-xs" data-testid="market-launcher-state-control">
          <span class="eyebrow">State</span>
          <select class="bg-transparent focus:outline-none" bind:value={previewState}>
            <option value="live">Live launcher</option>
            <option value="loading">Loading state</option>
            <option value="empty">Empty state</option>
            <option value="error">Error state</option>
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
            Loading active Polygon campaigns from the public HuFi Campaign Launcher.
          </span>
        </div>
      {:else if showError}
        <div class="card-surface px-5 py-12 text-center" data-testid="market-launcher-error">
          <span class="eyebrow">Launcher unavailable</span>
          <span class="mt-3 block text-2xl font-semibold text-base-content">Real campaign discovery could not be loaded</span>
          <span class="mx-auto mt-3 block max-w-2xl text-body-muted">
            {previewState === 'error'
              ? 'Previewing the real launcher error state. The app does not replace launcher failures with mock-as-real campaign content.'
              : errorMessage}
          </span>
          <button class="btn-pill-primary mt-6" onclick={loadCampaigns}>Retry public launcher</button>
        </div>
      {:else if showEmpty}
        <div class="card-surface px-5 py-12 text-center text-body-muted" data-testid="market-launcher-empty">
          <span class="eyebrow">No active campaigns</span>
          <span class="mt-3 block text-2xl font-semibold text-base-content">No active Polygon campaigns were returned</span>
          <span class="mx-auto mt-3 block max-w-xl">
            The launcher responded successfully, but there are no active campaigns for chain id {HUFI_POLYGON_CHAIN_ID}. Refresh to check again.
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
                  <span class="rounded-full bg-base-100 px-2.5 py-0.5 text-[11px] font-medium capitalize tracking-tight text-base-content/60">{formatLauncherStatus(campaign.status)}</span>
                  <span class="rounded-full bg-base-100 px-2.5 py-0.5 text-[11px] font-medium text-base-content/60">{formatLauncherType(campaign.type)}</span>
                </div>
                <span class="inline-block text-base-content/40 transition-transform duration-220 ease-out group-hover:translate-x-1 group-hover:text-primary">→</span>
              </div>

              <span class="text-body-muted">
                {formatLauncherExchange(campaign.exchange_name)} campaign on {polygonContext} at {shortenLauncherAddress(campaign.address)}.
              </span>

              <div class="grid gap-3 pt-1 md:grid-cols-4">
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Funded</span>
                  <span class="font-mono-num font-semibold text-base-content">{formatLauncherAmount(campaign.fund_amount, campaign.fund_token_decimals, campaign.fund_token_symbol)}</span>
                </div>
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Balance</span>
                  <span class="font-mono-num font-semibold text-base-content">{formatLauncherAmount(campaign.balance, campaign.fund_token_decimals, campaign.fund_token_symbol)}</span>
                </div>
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Paid</span>
                  <span class="font-mono-num font-semibold text-base-content">{launcherAmountPaid(campaign)}</span>
                </div>
                <div class="flex flex-col rounded-2xl bg-base-100 px-4 py-3">
                  <span class="text-xs text-base-content/50">Target</span>
                  <span class="font-mono-num font-semibold text-primary">{formatLauncherTarget(campaign)}</span>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-base-content/50">
                <span>{formatLauncherDate(campaign.start_date)} → {formatLauncherDate(campaign.end_date)}</span>
                <span>{launcherFundUsagePercent(campaign).toFixed(1)}% paid from launcher balance</span>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </Section>
</div>

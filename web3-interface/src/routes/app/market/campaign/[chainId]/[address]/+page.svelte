<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import Section from '$lib/components/common/Section.svelte';
  import {
    HUFI_POLYGON_CHAIN_ID,
    fetchHufiCampaignDetail,
    formatLauncherAmount,
    formatLauncherDateTime,
    formatLauncherExchange,
    formatLauncherStatus,
    formatLauncherTarget,
    formatLauncherType,
    hufiCampaignLauncherBaseUrl,
    launcherAmountPaid,
    launcherFundUsagePercent,
    launcherTotalOracleFeePercent,
    shortenLauncherAddress,
    type HufiCampaign,
  } from '$lib/helpers/hufi-campaign-launcher';

  type DetailPreviewState = 'live' | 'loading' | 'error';

  let campaign = $state<HufiCampaign | null>(null);
  let isLoading = $state(true);
  let errorMessage = $state('');
  let previewState = $state<DetailPreviewState>('live');

  const chainId = $derived(Number($page.params.chainId));
  const address = $derived($page.params.address);
  const detailEndpoint = $derived(`${hufiCampaignLauncherBaseUrl()}/campaigns/${chainId}-${address}`);
  const showLoading = $derived(previewState === 'loading' || (previewState === 'live' && isLoading));
  const showError = $derived(previewState === 'error' || Boolean(errorMessage));
  const fundUsagePercent = $derived(campaign ? launcherFundUsagePercent(campaign) : 0);

  const loadCampaignDetail = async () => {
    previewState = 'live';
    errorMessage = '';
    campaign = null;

    if (!Number.isFinite(chainId) || !address) {
      errorMessage = 'Campaign route must include a numeric chain id and contract address.';
      isLoading = false;
      return;
    }

    isLoading = true;
    try {
      campaign = await fetchHufiCampaignDetail(chainId, address);
    } catch (error) {
      errorMessage = error instanceof Error
        ? error.message
        : 'HuFi Campaign Launcher detail could not be loaded.';
    } finally {
      isLoading = false;
    }
  };

  const copyAddress = async (value: string | undefined) => {
    if (!value || typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(value);
  };

  onMount(() => {
    void loadCampaignDetail();
  });
</script>

<div class="anim-page-enter" data-testid="hufi-campaign-detail">
  <section class="flex flex-wrap items-end justify-between gap-4 px-1">
    <div class="flex flex-col">
      <span class="eyebrow">HuFi Campaign Launcher</span>
      <span class="mt-1 text-display text-base-content">
        {campaign?.symbol ?? 'Campaign detail'}
      </span>
      <span class="mt-3 max-w-2xl text-body-muted">
        Public campaign detail for Polygon chain id {Number.isFinite(chainId) ? chainId : HUFI_POLYGON_CHAIN_ID}. Browsing this page does not require a wallet or selected network.
      </span>
      <span class="mt-3 break-all text-xs text-base-content/50" data-testid="hufi-detail-endpoint">
        Source: {detailEndpoint}
      </span>
    </div>
    <a href="/app/market" class="btn-pill-outline" data-testid="hufi-detail-back">
      ← All live campaigns
    </a>
  </section>

  <section class="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="hufi-detail-state-controls">
    <span class="text-sm text-base-content/60">State preview for real launcher loading and recovery surfaces.</span>
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-2 text-sm">
        <span class="eyebrow">State</span>
        <select class="bg-transparent border-b border-base-300 px-0 py-1 focus:outline-none focus:border-base-content" bind:value={previewState} data-testid="hufi-detail-state-select">
          <option value="live">Live detail</option>
          <option value="loading">Loading state</option>
          <option value="error">Error state</option>
        </select>
      </label>
      <button class="btn-pill-outline" onclick={loadCampaignDetail}>Refresh detail</button>
    </div>
  </section>

  {#if showLoading}
    <section class="mt-10 max-w-xl" data-testid="hufi-detail-loading">
      <span class="eyebrow">Loading</span>
      <span class="mt-3 block font-display text-3xl tracking-tight text-base-content">Loading real campaign detail</span>
      <span class="mt-4 flex items-center gap-3 text-sm text-base-content/60">
        <span class="loading loading-spinner loading-sm"></span>
        Fetching identifiers, funding, balances, oracle data, and results from the public HuFi Campaign Launcher.
      </span>
    </section>
  {:else if showError}
    <section class="mt-10 max-w-xl" data-testid="hufi-detail-error">
      <span class="eyebrow">Recovery</span>
      <span class="mt-3 block font-display text-3xl tracking-tight text-base-content">Campaign detail unavailable</span>
      <span class="mt-4 block text-base-content/60">
        {previewState === 'error'
          ? 'Previewing the launcher detail error state. No mock order approval replaces this real campaign detail.'
          : errorMessage}
      </span>
      <button class="btn-pill-primary mt-6" onclick={loadCampaignDetail}>Retry campaign detail</button>
    </section>
  {:else if campaign}
    <section class="mt-8 grid gap-3 md:grid-cols-4" data-testid="hufi-detail-summary">
      <div class="card-surface p-5">
        <span class="eyebrow">Funded</span>
        <span class="mt-2 block font-mono-num text-2xl text-base-content">{formatLauncherAmount(campaign.fund_amount, campaign.fund_token_decimals, campaign.fund_token_symbol)}</span>
        <span class="text-xs text-base-content/50">Total campaign pool</span>
      </div>
      <div class="card-surface p-5">
        <span class="eyebrow">Balance</span>
        <span class="mt-2 block font-mono-num text-2xl text-base-content">{formatLauncherAmount(campaign.balance, campaign.fund_token_decimals, campaign.fund_token_symbol)}</span>
        <span class="text-xs text-base-content/50">Remaining launcher balance</span>
      </div>
      <div class="card-surface p-5">
        <span class="eyebrow">Paid</span>
        <span class="mt-2 block font-mono-num text-2xl text-base-content">{launcherAmountPaid(campaign)}</span>
        <span class="text-xs text-base-content/50">{fundUsagePercent.toFixed(1)}% paid or reserved</span>
      </div>
      <div class="card-surface p-5">
        <span class="eyebrow">Target</span>
        <span class="mt-2 block font-mono-num text-2xl text-primary">{formatLauncherTarget(campaign)}</span>
        <span class="text-xs text-base-content/50">Campaign requirement</span>
      </div>
    </section>

    <Section title="Campaign context" eyebrow="Public data">
      <div class="grid gap-px overflow-hidden rounded-2xl border border-base-300 bg-base-300 md:grid-cols-2" data-testid="hufi-detail-fields">
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Pair</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">{campaign.symbol}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Exchange</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">{formatLauncherExchange(campaign.exchange_name)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Type</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">{formatLauncherType(campaign.type)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Status</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">{formatLauncherStatus(campaign.status)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Escrow</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">{formatLauncherStatus(campaign.escrow_status)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Chain</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">Polygon · {campaign.chain_id}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Start</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">{formatLauncherDateTime(campaign.start_date)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">End</span>
          <span class="mt-2 block text-lg font-semibold text-base-content">{formatLauncherDateTime(campaign.end_date)}</span>
        </div>
      </div>
    </Section>

    <Section title="Participation availability" eyebrow="Backend status">
      <div class="rounded-2xl border border-warning/40 bg-base-100 p-6" data-testid="hufi-backend-not-connected-copy">
        <span class="eyebrow">Real execution not connected</span>
        <span class="mt-3 block text-2xl font-semibold text-base-content">Backend integration is not connected yet</span>
        <span class="mt-3 block max-w-2xl text-base-content/70">
          This page displays real public launcher data only. Real HuFi campaign joining, order creation, token approvals, and exchange execution require backend mediation and are not available in this web3-interface scope.
        </span>
        <div class="mt-5 flex flex-wrap gap-3">
          <button class="btn-pill-primary opacity-60 cursor-not-allowed" disabled data-testid="hufi-real-participation-disabled">
            Join unavailable until backend is connected
          </button>
          <a href="/app/market-making" class="btn-pill-outline">
            Open separate mock order demo
          </a>
        </div>
      </div>
    </Section>

    <Section title="Funds and oracle terms" eyebrow="Launcher settlement">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="card-surface p-5">
          <span class="eyebrow">Reserved funds</span>
          <span class="mt-2 block font-mono-num text-xl text-base-content">{formatLauncherAmount(campaign.reserved_funds, campaign.fund_token_decimals, campaign.fund_token_symbol)}</span>
          <span class="mt-2 block text-xs text-base-content/50">Funds reserved for campaign settlement.</span>
        </div>
        <div class="card-surface p-5">
          <span class="eyebrow">Oracle fee total</span>
          <span class="mt-2 block font-mono-num text-xl text-base-content">{launcherTotalOracleFeePercent(campaign).toFixed(2)}%</span>
          <span class="mt-2 block text-xs text-base-content/50">
            Exchange {campaign.exchange_oracle_fee_percent ?? 0}% · Recording {campaign.recording_oracle_fee_percent ?? 0}% · Reputation {campaign.reputation_oracle_fee_percent ?? 0}%
          </span>
        </div>
      </div>
    </Section>

    <Section title="Identifiers" eyebrow="Addresses">
      <div class="grid gap-3" data-testid="hufi-detail-addresses">
        {#each [
          ['Campaign contract', campaign.address],
          ['Launcher', campaign.launcher],
          ['Fund token', campaign.fund_token],
          ['Exchange oracle', campaign.exchange_oracle],
          ['Recording oracle', campaign.recording_oracle],
          ['Reputation oracle', campaign.reputation_oracle],
        ] as [label, value]}
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-4 py-3">
            <span class="text-sm font-semibold text-base-content">{label}</span>
            <span class="flex items-center gap-2 text-sm text-base-content/60">
              <span class="font-mono break-all">{shortenLauncherAddress(value)}</span>
              {#if value}
                <button class="btn-pill-ghost px-2 py-1 text-xs" onclick={() => copyAddress(value)}>Copy</button>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </Section>

    <Section title="Results and references" eyebrow="External context">
      <div class="flex flex-col gap-3" data-testid="hufi-detail-references">
        <a href={detailEndpoint} target="_blank" rel="noreferrer" class="card-surface card-hover p-5">
          <span class="eyebrow">Launcher API</span>
          <span class="mt-2 block break-all text-sm text-base-content/70">{detailEndpoint}</span>
        </a>
        {#if campaign.intermediate_results_url}
          <a href={campaign.intermediate_results_url} target="_blank" rel="noreferrer" class="card-surface card-hover p-5">
            <span class="eyebrow">Intermediate results</span>
            <span class="mt-2 block break-all text-sm text-base-content/70">{campaign.intermediate_results_url}</span>
          </a>
        {/if}
        {#if campaign.final_results_url}
          <a href={campaign.final_results_url} target="_blank" rel="noreferrer" class="card-surface card-hover p-5">
            <span class="eyebrow">Final results</span>
            <span class="mt-2 block break-all text-sm text-base-content/70">{campaign.final_results_url}</span>
          </a>
        {/if}
        {#if campaign.daily_paid_amounts?.length}
          <div class="card-surface p-5">
            <span class="eyebrow">Daily payments</span>
            <div class="mt-3 flex flex-col gap-2">
              {#each campaign.daily_paid_amounts as payment}
                <span class="flex justify-between gap-3 text-sm text-base-content/70">
                  <span>{payment.date ?? 'Recorded payment'}</span>
                  <span>{payment.amount ?? '—'} {campaign.fund_token_symbol}</span>
                </span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </Section>
  {/if}
</div>

<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import {
    campaignEligibility,
    campaignFilterOptions,
    filterMockCampaigns,
    namespaceLabel,
    type CampaignFilter,
    type MockCampaign,
    type MockOrderStatus,
    type WalletNamespace,
  } from '$lib/helpers/mock-web3';
  import { allCampaigns, allOrders, sessionCampaigns } from '$lib/stores/market-making';
  import { openMockWallet, walletAccount, walletIsConnected, walletIsUnsupported, walletNamespace } from '$lib/stores/wallet';

  type DiscoveryState = 'loaded' | 'loading' | 'empty' | 'error';
  type ChainFilter = 'active-account';
  type StatusFilter = 'all' | MockOrderStatus;

  const indicatorNamespaces: WalletNamespace[] = ['evm', 'solana'];
  const statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'approval', label: 'Approval' },
    { value: 'signing', label: 'Signing' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'paused', label: 'Paused' },
  ];

  let selectedFilter = $state<CampaignFilter>('all');
  let discoveryState = $state<DiscoveryState>('loaded');
  let orderStatusFilter = $state<StatusFilter>('all');
  let orderChainFilter = $state<ChainFilter>('active-account');

  let visibleCampaigns = $derived(
    discoveryState === 'loaded'
      ? filterMockCampaigns($allCampaigns, selectedFilter, $walletNamespace, $walletIsConnected, $walletIsUnsupported)
      : []
  );
  let visibleCreatedCampaigns = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? $sessionCampaigns.filter(
          (campaign) => campaign.accountId === $walletAccount?.id && campaign.chains.includes($walletNamespace as WalletNamespace)
        )
      : []
  );
  let visibleOrders = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? $allOrders.filter((order) => {
          const chainMatches = orderChainFilter === 'active-account' && order.namespace === $walletNamespace;
          const accountMatches = order.accountId === $walletAccount?.id;
          const statusMatches = orderStatusFilter === 'all' || order.status === orderStatusFilter;
          return accountMatches && chainMatches && statusMatches;
        })
      : []
  );

  const actionLabel = (campaign: MockCampaign) => {
    if (!$walletIsConnected && !$walletIsUnsupported) return 'Connect to join';
    if ($walletIsUnsupported) return 'Unsupported chain';
    const eligibility = campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported);
    if (!eligibility.canParticipate) return 'Switch namespace';
    return 'Create order';
  };
</script>

<div data-testid="web3-market-making">
  <section class="pt-2 flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col">
      <span class="eyebrow">Market making</span>
      <span class="mt-3 font-display text-5xl md:text-6xl tracking-tight text-base-content">Pools</span>
      <span class="mt-4 max-w-xl text-base-content/60">
        Mocked campaign discovery for EVM and Solana market-making participation.
      </span>
    </div>
    <a href="/market-making/create" class="btn-pill-outline" data-testid="create-campaign-link">
      Create campaign →
    </a>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="campaign-connect-gate">
      <span class="text-sm text-base-content/70">Discovery is public. Joining or creating prompts a wallet connection.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="campaign-unsupported-gate">
      Unsupported chain selected. Market-making create and join actions are blocked globally.
    </section>
  {/if}

  <Section title="Discovery" eyebrow="Filters">
    <div class="flex flex-col gap-4 border-t border-base-300 pt-6" data-testid="campaign-discovery-controls">
      <div class="flex flex-wrap items-end gap-6">
        <label class="flex flex-col gap-1">
          <span class="eyebrow">Filter</span>
          <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" bind:value={selectedFilter} data-testid="campaign-filter-select">
            {#each campaignFilterOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="eyebrow">State preview</span>
          <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" bind:value={discoveryState} data-testid="campaign-state-select">
            <option value="loaded">Loaded campaigns</option>
            <option value="loading">Loading state</option>
            <option value="empty">Empty state</option>
            <option value="error">Error state</option>
          </select>
        </label>

        <span class="ml-auto text-sm text-base-content/55" data-testid="campaign-filter-summary">
          {visibleCampaigns.length} of {$allCampaigns.length} campaigns
        </span>
      </div>
    </div>

    {#if discoveryState === 'loading'}
      <div class="mt-8 flex items-center gap-3 text-sm text-base-content/70" data-testid="campaign-loading-state">
        <span class="loading loading-spinner loading-sm"></span>
        <span>Loading mocked campaign discovery data…</span>
      </div>
    {:else if discoveryState === 'error'}
      <div class="mt-8 rounded-2xl border border-error/40 px-5 py-4 text-sm text-error" data-testid="campaign-error-state">
        Mock discovery error. Switch state preview back to loaded campaigns to retry.
      </div>
    {:else if discoveryState === 'empty' || visibleCampaigns.length === 0}
      <div class="mt-8 border-t border-base-300 pt-10 text-base-content/55" data-testid="campaign-empty-state">
        <span class="block font-medium text-base-content">No campaigns match this state.</span>
        <span class="mt-1 block text-sm">Change the filter or state preview to render public campaign discovery again.</span>
      </div>
    {:else}
      <div class="mt-8 border-t border-base-300" data-testid="campaign-list">
        {#each visibleCampaigns as campaign}
          {@const eligibility = campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported)}
          <article class="flex flex-col gap-4 border-b border-base-300 py-6" data-testid="campaign-card-{campaign.id}">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
              <div class="flex flex-col">
                <a href="/market-making/campaign/{campaign.id}" class="font-medium text-lg text-base-content hover:text-primary">{campaign.name}</a>
                <span class="text-sm text-base-content/55">{campaign.summary}</span>
              </div>
              <span class="eyebrow">{campaign.status}</span>
            </div>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/50">
              {#each indicatorNamespaces as chain}
                <span
                  class="capitalize {campaign.chains.includes(chain) ? (chain === $walletNamespace ? 'text-primary' : 'text-base-content') : 'text-base-content/35'}"
                  data-testid="campaign-chain-indicator-{campaign.id}-{chain}"
                >
                  {namespaceLabel(chain)} {campaign.chains.includes(chain) ? '✓' : '—'}
                </span>
              {/each}
              <span class="text-base-content/30">·</span>
              <span>{campaign.assets.join(' / ')}</span>
            </div>

            <div class="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
              <div class="flex flex-col">
                <span class="eyebrow">Liquidity</span>
                <span class="mt-1 font-mono-num text-base">{campaign.liquidity}</span>
                <span class="text-xs text-base-content/50">/ {campaign.metrics.liquidityGoal}</span>
              </div>
              <div class="flex flex-col">
                <span class="eyebrow">Volume</span>
                <span class="mt-1 font-mono-num text-base">{campaign.volume}</span>
                <span class="text-xs text-base-content/50">/ {campaign.metrics.volumeGoal}</span>
              </div>
              <div class="flex flex-col">
                <span class="eyebrow">Minimum</span>
                <span class="mt-1 font-mono-num text-base">{campaign.minimum}</span>
              </div>
              <div class="flex flex-col">
                <span class="eyebrow">Eligibility</span>
                <span class="mt-1 text-base">{eligibility.label}</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              {#if !$walletIsConnected && !$walletIsUnsupported}
                <button class="btn-pill-primary" onclick={openMockWallet} data-testid="campaign-connect-action">{actionLabel(campaign)}</button>
              {:else if eligibility.canParticipate}
                <a
                  href="/market-making/order/new?campaign={campaign.id}"
                  class="btn-pill-primary"
                  data-testid="campaign-join-action"
                >
                  {actionLabel(campaign)}
                </a>
              {:else}
                <button class="btn-pill-outline opacity-40 cursor-not-allowed" disabled data-testid="campaign-join-action">
                  {actionLabel(campaign)}
                </button>
                <span class="text-xs text-base-content/55" data-testid="campaign-namespace-guard-{campaign.id}">
                  {eligibility.message}
                </span>
              {/if}
            </div>
          </article>
        {/each}
      </div>

      <div class="mt-12" data-testid="campaign-table">
        <span class="eyebrow">Metrics</span>
        <div class="mt-3 overflow-x-auto border-t border-base-300">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-base-content/50">
                <th class="py-3 pr-4 font-normal">Campaign</th>
                <th class="py-3 pr-4 font-normal">Status</th>
                <th class="py-3 pr-4 font-normal">Namespaces</th>
                <th class="py-3 pr-4 font-normal">Assets</th>
                <th class="py-3 pr-4 font-normal">Liquidity</th>
                <th class="py-3 pr-4 font-normal">Volume</th>
                <th class="py-3 pr-4 font-normal">Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {#each visibleCampaigns as campaign}
                {@const eligibility = campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported)}
                <tr class="border-t border-base-300">
                  <td class="py-3 pr-4"><a class="hover:text-primary" href="/market-making/campaign/{campaign.id}">{campaign.name}</a></td>
                  <td class="py-3 pr-4 capitalize">{campaign.status}</td>
                  <td class="py-3 pr-4">{campaign.chains.map(namespaceLabel).join(', ')}</td>
                  <td class="py-3 pr-4">{campaign.assets.join(', ')}</td>
                  <td class="py-3 pr-4 font-mono-num">{campaign.liquidity}</td>
                  <td class="py-3 pr-4 font-mono-num">{campaign.volume}</td>
                  <td class="py-3 pr-4">{eligibility.label}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </Section>

  <Section title="My participation" eyebrow="Account scoped">
    <div data-testid="my-campaigns-orders">
      {#if $walletIsConnected && !$walletIsUnsupported}
        <div class="flex flex-wrap items-end gap-6 border-t border-base-300 pt-6">
          <label class="flex flex-col gap-1">
            <span class="eyebrow">Order status</span>
            <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" bind:value={orderStatusFilter} data-testid="my-orders-status-filter">
              {#each statusFilterOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="eyebrow">Chain</span>
            <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" bind:value={orderChainFilter} data-testid="my-orders-chain-filter">
              <option value="active-account">Active account namespace</option>
            </select>
          </label>
        </div>

        {#if visibleCreatedCampaigns.length > 0}
          <div class="mt-8" data-testid="created-campaigns-list">
            <span class="eyebrow">Created campaigns</span>
            <div class="mt-2 border-t border-base-300">
              {#each visibleCreatedCampaigns as campaign}
                <StatRow
                  href="/market-making/campaign/{campaign.id}"
                  label={campaign.name}
                  sublabel={`${campaign.status} · ${campaign.chains.map(namespaceLabel).join(', ')} · ${campaign.assets.join(', ')}`}
                  value={campaign.metrics.liquidityGoal}
                  subvalue="goal"
                />
              {/each}
            </div>
          </div>
        {/if}

        {#if visibleOrders.length > 0}
          <div class="mt-8" data-testid="my-orders-list">
            <span class="eyebrow">Orders</span>
            <div class="mt-2 border-t border-base-300">
              {#each visibleOrders as order}
                <a
                  href="/market-making/order/{order.id}"
                  class="flex items-center justify-between gap-4 border-b border-base-300 py-5 transition-colors hover:bg-base-200/40"
                  data-testid="my-order-{order.status}-{order.namespace}"
                >
                  <div class="flex min-w-0 flex-col">
                    <span class="font-medium text-base-content">
                      {order.participation === 'created' ? 'Created' : 'Joined'} · {order.assets}
                    </span>
                    <span class="mt-0.5 text-xs text-base-content/50">
                      <span class="font-mono-num">{order.id}</span> · {order.status} · {namespaceLabel(order.namespace)}
                    </span>
                  </div>
                  <div class="flex flex-col items-end text-right">
                    <span class="font-mono-num text-base">{order.profit}</span>
                    <span class="mt-0.5 text-xs text-base-content/50">vol {order.createdVolume}</span>
                  </div>
                </a>
              {/each}
            </div>
          </div>
        {:else}
          <div class="mt-8 border-t border-base-300 py-10 text-base-content/55" data-testid="my-orders-empty-state">
            No campaign participation matches the selected filters.
          </div>
        {/if}
      {:else if $walletIsUnsupported}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          Switch to a supported EVM or Solana account to view account-scoped campaigns and orders.
        </div>
      {:else}
        <div class="border-t border-base-300 py-10 text-base-content/55">
          Connect a wallet to view account-scoped campaigns and orders. Public discovery stays available above.
        </div>
      {/if}
    </div>
  </Section>
</div>

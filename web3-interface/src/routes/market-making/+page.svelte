<script lang="ts">
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
  import { openMockWallet, walletIsConnected, walletIsUnsupported, walletNamespace } from '$lib/stores/wallet';

  type DiscoveryState = 'loaded' | 'loading' | 'empty' | 'error';
  type ChainFilter = 'all' | WalletNamespace;
  type StatusFilter = 'all' | MockOrderStatus;

  const indicatorNamespaces: WalletNamespace[] = ['evm', 'solana'];
  const statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  let selectedFilter = $state<CampaignFilter>('all');
  let discoveryState = $state<DiscoveryState>('loaded');
  let orderStatusFilter = $state<StatusFilter>('all');
  let orderChainFilter = $state<ChainFilter>('all');
  let visibleCampaigns = $derived(
    discoveryState === 'loaded' ? filterMockCampaigns($allCampaigns, selectedFilter, $walletNamespace) : []
  );
  let visibleOrders = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? $allOrders.filter((order) => {
          const chainMatches = orderChainFilter === 'all' ? order.namespace === $walletNamespace : order.namespace === orderChainFilter;
          const statusMatches = orderStatusFilter === 'all' || order.status === orderStatusFilter;
          return chainMatches && statusMatches;
        })
      : []
  );

  const actionLabel = (campaign: MockCampaign) => {
    if (!$walletIsConnected && !$walletIsUnsupported) return 'Connect to join';
    if ($walletIsUnsupported) return 'Unsupported chain';
    const eligibility = campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported);
    if (!eligibility.canParticipate) return 'Switch wallet namespace';
    return 'Create market-making order';
  };
</script>

<section class="space-y-6" data-testid="web3-market-making">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-2">
          <span class="text-2xl font-bold text-base-content">Campaigns / Market Making</span>
          <span class="text-base-content/70">Mocked campaign discovery data for EVM and Solana market-making participation.</span>
        </div>
        <a href="/market-making/create" class="btn btn-outline" data-testid="create-campaign-link">Create campaign</a>
      </div>
    </div>
  </div>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <div class="alert alert-info" data-testid="campaign-connect-gate">
      <span>Campaign discovery is public. Joining or creating an order prompts mocked Reown connection.</span>
      <button class="btn btn-sm btn-primary" onclick={openMockWallet}>Connect Wallet</button>
    </div>
  {:else if $walletIsUnsupported}
    <div class="alert alert-warning" data-testid="campaign-unsupported-gate">
      <span>Unsupported chain selected. Market-making create and join actions are blocked globally.</span>
    </div>
  {/if}

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="campaign-discovery-controls">
    <div class="card-body gap-4">
      <div class="flex flex-wrap items-end gap-4">
        <label class="form-control w-full max-w-xs">
          <span class="label-text mb-1">Filter campaigns</span>
          <select class="select select-bordered" bind:value={selectedFilter} data-testid="campaign-filter-select">
            {#each campaignFilterOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>

        <label class="form-control w-full max-w-xs">
          <span class="label-text mb-1">State preview</span>
          <select class="select select-bordered" bind:value={discoveryState} data-testid="campaign-state-select">
            <option value="loaded">Loaded campaigns</option>
            <option value="loading">Loading state</option>
            <option value="empty">Empty state</option>
            <option value="error">Error state</option>
          </select>
        </label>

        <span class="rounded-box bg-base-200 px-4 py-3 text-sm text-base-content/70" data-testid="campaign-filter-summary">
          Showing {visibleCampaigns.length} of {$allCampaigns.length} mocked campaigns.
        </span>
      </div>
    </div>
  </div>

  {#if discoveryState === 'loading'}
    <div class="alert alert-info" data-testid="campaign-loading-state">
      <span class="loading loading-spinner loading-sm"></span>
      <span>Loading mocked campaign discovery data...</span>
    </div>
  {:else if discoveryState === 'error'}
    <div class="alert alert-error" data-testid="campaign-error-state">
      <span>Mock campaign discovery error. Retry by switching the state preview back to loaded campaigns.</span>
    </div>
  {:else if discoveryState === 'empty' || visibleCampaigns.length === 0}
    <div class="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center" data-testid="campaign-empty-state">
      <span class="block font-semibold text-base-content">No campaigns match this deterministic state.</span>
      <span class="mt-2 block text-sm text-base-content/70">Change the filter or state preview to render public campaign discovery again.</span>
    </div>
  {:else}
  <div class="grid gap-4 xl:grid-cols-3" data-testid="campaign-list">
    {#each visibleCampaigns as campaign}
      {@const eligibility = campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported)}
      <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="campaign-card-{campaign.id}">
        <div class="card-body gap-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex flex-col gap-1">
              <a href="/market-making/campaign/{campaign.id}" class="link-hover font-semibold text-base-content">{campaign.name}</a>
              <span class="text-sm text-base-content/60">{campaign.summary}</span>
            </div>
            <span class="badge badge-outline">{campaign.status}</span>
          </div>

          <div class="flex flex-wrap gap-2">
            {#each indicatorNamespaces as chain}
              <span
                class="badge {campaign.chains.includes(chain) ? (chain === $walletNamespace ? 'badge-primary' : 'badge-ghost') : 'badge-outline'}"
                data-testid="campaign-chain-indicator-{campaign.id}-{chain}"
              >
                {namespaceLabel(chain)} {campaign.chains.includes(chain) ? 'supported' : 'not supported'}
              </span>
            {/each}
            {#each campaign.assets as asset}
              <span class="badge badge-outline">{asset}</span>
            {/each}
          </div>

          <div class="grid grid-cols-2 gap-2 text-sm">
            <span class="rounded-box bg-base-200 p-3">Liquidity<br /><strong>{campaign.liquidity}</strong> / {campaign.metrics.liquidityGoal}</span>
            <span class="rounded-box bg-base-200 p-3">Volume<br /><strong>{campaign.volume}</strong> / {campaign.metrics.volumeGoal}</span>
            <span class="rounded-box bg-base-200 p-3">Minimum<br /><strong>{campaign.minimum}</strong></span>
            <span class="rounded-box bg-base-200 p-3">Eligibility<br /><strong>{eligibility.label}</strong></span>
          </div>

          {#if !$walletIsConnected && !$walletIsUnsupported}
            <button class="btn btn-primary" onclick={openMockWallet} data-testid="campaign-connect-action">{actionLabel(campaign)}</button>
          {:else if eligibility.canParticipate}
            <a
              href="/market-making/order/new?campaign={campaign.id}"
              class="btn btn-primary"
              data-testid="campaign-join-action"
            >
              {actionLabel(campaign)}
            </a>
          {:else}
            <button class="btn btn-primary" disabled data-testid="campaign-join-action">
              {actionLabel(campaign)}
            </button>
            <span class="text-sm text-base-content/60" data-testid="campaign-namespace-guard-{campaign.id}">
              {eligibility.message}
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="campaign-table">
    <div class="card-body gap-3">
      <span class="font-semibold">Campaign metrics table</span>
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Namespaces</th>
              <th>Assets</th>
              <th>Liquidity</th>
              <th>Volume</th>
              <th>Eligibility</th>
            </tr>
          </thead>
          <tbody>
            {#each visibleCampaigns as campaign}
              {@const eligibility = campaignEligibility(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported)}
              <tr>
                <td><a class="link" href="/market-making/campaign/{campaign.id}">{campaign.name}</a></td>
                <td><span class="badge badge-outline">{campaign.status}</span></td>
                <td>{campaign.chains.map(namespaceLabel).join(', ')}</td>
                <td>{campaign.assets.join(', ')}</td>
                <td>{campaign.liquidity}</td>
                <td>{campaign.volume}</td>
                <td>{eligibility.label}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  {/if}

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="my-campaigns-orders">
    <div class="card-body gap-3">
      {#if $walletIsConnected && !$walletIsUnsupported}
        <div class="flex flex-wrap items-end justify-between gap-3">
          <span class="font-semibold">My mocked campaigns / orders</span>
          <div class="flex flex-wrap gap-3">
            <label class="form-control">
              <span class="label-text mb-1">Order status</span>
              <select class="select select-bordered select-sm" bind:value={orderStatusFilter} data-testid="my-orders-status-filter">
                {#each statusFilterOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="form-control">
              <span class="label-text mb-1">Chain</span>
              <select class="select select-bordered select-sm" bind:value={orderChainFilter} data-testid="my-orders-chain-filter">
                <option value="all">Current wallet namespace</option>
                <option value="evm">EVM</option>
                <option value="solana">Solana / SVM</option>
              </select>
            </label>
          </div>
        </div>
        {#if $sessionCampaigns.length > 0}
          <div class="grid gap-3 md:grid-cols-2" data-testid="created-campaigns-list">
            {#each $sessionCampaigns as campaign}
              <a href="/market-making/campaign/{campaign.id}" class="rounded-box border border-base-300 bg-base-200 p-4">
                <span class="font-semibold">Created campaign · {campaign.name}</span>
                <span class="block text-sm text-base-content/60">
                  {campaign.status} · {campaign.chains.map(namespaceLabel).join(', ')} · {campaign.assets.join(', ')} · goal {campaign.metrics.liquidityGoal}
                </span>
              </a>
            {/each}
          </div>
        {/if}
        {#if visibleOrders.length > 0}
          <div class="grid gap-3 md:grid-cols-2" data-testid="my-orders-list">
            {#each visibleOrders as order}
              <a href="/market-making/order/{order.id}" class="rounded-box border border-base-300 bg-base-200 p-4" data-testid="my-order-{order.status}-{order.namespace}">
                <span class="font-semibold">{order.participation === 'created' ? 'Created' : 'Joined'} order · {order.id} · {order.assets}</span>
                <span class="block text-sm text-base-content/60">
                  {order.status} {namespaceLabel(order.namespace)} order · created volume {order.createdVolume} · profit {order.profit}
                </span>
              </a>
            {/each}
          </div>
        {:else}
          <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70" data-testid="my-orders-empty-state">
            No campaign participation matches the selected status and chain filters.
          </span>
        {/if}
      {:else if $walletIsUnsupported}
        <span class="font-semibold">Account campaign participation</span>
        <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70">
          Switch to a supported EVM or Solana account to view account-scoped campaigns and orders.
        </span>
      {:else}
        <span class="font-semibold">Account campaign participation</span>
        <span class="rounded-box border border-base-300 bg-base-200 p-4 text-base-content/70">
          Connect a mocked Reown wallet to view account-scoped campaigns and orders. Public campaign discovery stays available above.
        </span>
      {/if}
    </div>
  </div>
</section>

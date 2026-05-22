<script lang="ts">
  import { mockCampaigns, namespaceLabel } from '$lib/helpers/mock-web3';
  import { openMockWallet, walletIsConnected, walletIsUnsupported, walletNamespace } from '$lib/stores/wallet';

  const actionLabel = () => {
    if (!$walletIsConnected && !$walletIsUnsupported) return 'Connect to join';
    if ($walletIsUnsupported) return 'Unsupported chain';
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

  <div class="grid gap-4 xl:grid-cols-3" data-testid="campaign-list">
    {#each mockCampaigns as campaign}
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
            {#each campaign.chains as chain}
              <span class="badge {chain === $walletNamespace ? 'badge-primary' : 'badge-ghost'}">{namespaceLabel(chain)}</span>
            {/each}
            {#each campaign.assets as asset}
              <span class="badge badge-outline">{asset}</span>
            {/each}
          </div>

          <div class="grid grid-cols-2 gap-2 text-sm">
            <span class="rounded-box bg-base-200 p-3">Liquidity<br /><strong>{campaign.liquidity}</strong></span>
            <span class="rounded-box bg-base-200 p-3">Volume<br /><strong>{campaign.volume}</strong></span>
            <span class="rounded-box bg-base-200 p-3">Minimum<br /><strong>{campaign.minimum}</strong></span>
            <span class="rounded-box bg-base-200 p-3">Eligibility<br /><strong>{campaign.chains.includes($walletNamespace ?? 'evm') && $walletIsConnected ? 'eligible' : 'review'}</strong></span>
          </div>

          {#if !$walletIsConnected && !$walletIsUnsupported}
            <button class="btn btn-primary" onclick={openMockWallet} data-testid="campaign-connect-action">{actionLabel()}</button>
          {:else}
            <a
              href="/market-making/order/new?campaign={campaign.id}"
              class="btn btn-primary {$walletIsUnsupported ? 'btn-disabled' : ''}"
              aria-disabled={$walletIsUnsupported}
              data-testid="campaign-join-action"
            >
              {actionLabel()}
            </a>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="my-campaigns-orders">
    <div class="card-body gap-3">
      <span class="font-semibold">My mocked campaigns / orders</span>
      <div class="grid gap-3 md:grid-cols-2">
        <a href="/market-making/order/MM-1001" class="rounded-box border border-base-300 bg-base-200 p-4">
          <span class="font-semibold">MM-1001 · ETH / USDC Depth Builder</span>
          <span class="block text-sm text-base-content/60">Active EVM order · created volume $124,000</span>
        </a>
        <a href="/market-making/order/MM-2001" class="rounded-box border border-base-300 bg-base-200 p-4">
          <span class="font-semibold">MM-2001 · SOL / USDC Growth Campaign</span>
          <span class="block text-sm text-base-content/60">Pending Solana order · zero metrics state</span>
        </a>
      </div>
    </div>
  </div>
</section>

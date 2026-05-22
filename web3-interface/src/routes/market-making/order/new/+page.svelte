<script lang="ts">
  import BigNumber from 'bignumber.js';
  import { page } from '$app/stores';
  import { balances, totalBalanceUsd } from '$lib/stores/balances';
  import { mockCampaigns } from '$lib/helpers/mock-web3';
  import { openMockWallet, walletIsConnected, walletIsUnsupported, walletNamespaceLabel, walletNetwork } from '$lib/stores/wallet';

  let campaign = $derived(
    mockCampaigns.find((item) => item.id === $page.url.searchParams.get('campaign')) ?? mockCampaigns[0]
  );
  let contributionAmount = $state('');
  let campaignMinimumUsd = $derived(new BigNumber(campaign.minimum.replace(/[$,]/g, '')));
  let requestedContributionUsd = $derived(new BigNumber(contributionAmount || campaignMinimumUsd));
  let hasLowBalance = $derived(
    Boolean($walletIsConnected && !$walletIsUnsupported && new BigNumber($totalBalanceUsd).lt(requestedContributionUsd))
  );

  $effect(() => {
    if (!contributionAmount) {
      contributionAmount = campaignMinimumUsd.toFixed(0);
    }
  });
</script>

<section class="space-y-6" data-testid="order-create">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold">Create market-making order</span>
      <span class="text-base-content/70">Campaign: {campaign.name}</span>
    </div>
  </div>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <div class="alert alert-info">
      <span>Connect a mocked Reown wallet before preparing an order.</span>
      <button class="btn btn-sm btn-primary" onclick={openMockWallet}>Connect Wallet</button>
    </div>
  {:else if $walletIsUnsupported}
    <div class="alert alert-warning">
      <span>Unsupported chain blocks order creation.</span>
    </div>
  {:else if hasLowBalance}
    <div class="alert alert-warning" data-testid="order-low-balance-funding-cta">
      <span>
        Available campaign balance is below {campaign.minimum}. Deposit is the funding remedy for low balance; withdraw is still available only from Wallet / Funding.
      </span>
      <a class="btn btn-sm btn-primary" href="/deposit">Deposit funds</a>
      <a class="btn btn-sm btn-outline" href="/wallet">Wallet / Funding</a>
    </div>
  {/if}

  <div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-3">
        <span class="font-semibold">Wallet and balances</span>
        <span class="text-base-content/70">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'}</span>
        {#each $balances as balance}
          <div class="rounded-box border border-base-300 bg-base-200 p-3">
            <span class="font-semibold">{balance.symbol}</span>
            <span class="block text-sm text-base-content/60">{balance.amount} available</span>
          </div>
        {:else}
          <span class="rounded-box border border-base-300 bg-base-200 p-3 text-base-content/70">No account balances available.</span>
        {/each}
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-4">
        <label class="form-control">
          <span class="label-text mb-1">Contribution amount</span>
          <input
            class="input input-bordered"
            bind:value={contributionAmount}
            disabled={!$walletIsConnected || $walletIsUnsupported}
            data-testid="order-contribution-amount"
          />
          <span class="label-text-alt mt-1 text-base-content/60">
            Available funding balance: ${$totalBalanceUsd}. Increase this above available balance to see deposit guidance.
          </span>
        </label>
        <div class="rounded-box border border-base-300 bg-base-200 p-4">
          <span class="font-semibold">Mock fee estimate</span>
          <span class="block text-sm text-base-content/60">0.35% campaign fee · approval, signing, and submission are mocked.</span>
        </div>
        <button class="btn btn-primary" disabled={!$walletIsConnected || $walletIsUnsupported || hasLowBalance}>Review mocked order</button>
      </div>
    </div>
  </div>
</section>

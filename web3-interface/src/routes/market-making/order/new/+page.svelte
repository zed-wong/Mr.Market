<script lang="ts">
  import { page } from '$app/stores';
  import { balances, totalBalanceUsd } from '$lib/stores/balances';
  import {
    allCampaigns,
    clearOrderDraft,
    createMockOrder,
    feeEstimateFor,
    minimumContributionUsd,
    orderDraft,
    saveOrderDraft,
    validateOrderDraft,
    type OrderFlowStep,
  } from '$lib/stores/market-making';
  import type { MockOrder } from '$lib/helpers/mock-web3';
  import {
    openMockWallet,
    walletAccount,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespace,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  let campaign = $derived(
    $allCampaigns.find((item) => item.id === $page.url.searchParams.get('campaign')) ?? $allCampaigns[0]
  );
  let contributionAmount = $state('');
  let attemptedReview = $state(false);
  let flowStep = $state<OrderFlowStep>('form');
  let submittedOrder = $state<MockOrder | null>(null);
  let initializedCampaignId = $state('');
  let campaignMinimumUsd = $derived(minimumContributionUsd(campaign));
  let feeEstimate = $derived(feeEstimateFor(contributionAmount || campaignMinimumUsd.toFixed(0)));
  let validationErrors = $derived(
    validateOrderDraft(campaign, $walletNamespace, $walletIsConnected, $walletIsUnsupported, contributionAmount, $balances)
  );
  let hasValidationErrors = $derived(Object.keys(validationErrors).length > 0);
  let hasLowBalance = $derived(
    Boolean($walletIsConnected && !$walletIsUnsupported && validationErrors.amount?.includes('exceeds available'))
  );

  $effect(() => {
    const existingDraft = $orderDraft;
    if (campaign && existingDraft?.campaignId === campaign.id) {
      contributionAmount = existingDraft.amount;
      initializedCampaignId = campaign.id;
    } else if (campaign && initializedCampaignId !== campaign.id) {
      contributionAmount = campaignMinimumUsd.toFixed(0);
      initializedCampaignId = campaign.id;
    }
  });

  $effect(() => {
    if (!campaign || !contributionAmount || flowStep === 'success') return;
    saveOrderDraft({
      campaignId: campaign.id,
      namespace: $walletNamespace,
      amount: contributionAmount,
      selectedAssets: campaign.assets.join(' + '),
      updatedAt: '2026-05-23 09:18',
    });
  });

  const reviewOrder = () => {
    attemptedReview = true;
    if (hasValidationErrors) return;
    flowStep = 'review';
  };

  const cancelDraft = () => {
    clearOrderDraft();
    contributionAmount = campaignMinimumUsd.toFixed(0);
    flowStep = 'form';
    attemptedReview = false;
  };

  const confirmOrder = async () => {
    if (!$walletNamespace || hasValidationErrors) return;
    flowStep = 'approving';
    await new Promise((resolve) => setTimeout(resolve, 300));
    flowStep = 'signing';
    await new Promise((resolve) => setTimeout(resolve, 300));
    flowStep = 'submitting';
    await new Promise((resolve) => setTimeout(resolve, 300));
    submittedOrder = createMockOrder(campaign, $walletNamespace, contributionAmount, $walletAccount?.id);
    flowStep = 'success';
    attemptedReview = false;
  };
</script>

<section class="space-y-6" data-testid="order-create">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold">Create market-making order</span>
      <span class="text-base-content/70">Campaign: {campaign.name} · minimum {campaign.minimum} · assets {campaign.assets.join(' + ')}</span>
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

  {#if $orderDraft && flowStep !== 'success'}
    <div class="alert alert-info" data-testid="order-draft-state">
      <span>
        Draft saved locally for {$orderDraft.selectedAssets} · {$orderDraft.amount} USD · namespace {$orderDraft.namespace ? $walletNamespaceLabel : 'not connected'}.
      </span>
      <a class="btn btn-sm btn-outline" href="/market-making/campaign/{campaign.id}">Visit campaign detail</a>
      <a class="btn btn-sm btn-outline" href="/wallet">Visit Wallet / Funding</a>
    </div>
  {/if}

  <div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
    <div class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-3">
        <span class="font-semibold">Wallet and balances</span>
        <span class="text-base-content/70">{$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'} · {$walletShortAddress || 'no address'}</span>
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
          {#if attemptedReview && validationErrors.amount}
            <span class="label-text-alt mt-1 text-error" data-testid="order-amount-error">{validationErrors.amount}</span>
          {/if}
          {#if attemptedReview && validationErrors.wallet}
            <span class="label-text-alt mt-1 text-error" data-testid="order-wallet-error">{validationErrors.wallet}</span>
          {/if}
        </label>
        <div class="rounded-box border border-base-300 bg-base-200 p-4" data-testid="order-estimate-placeholder">
          <span class="font-semibold">Fee estimate gate</span>
          <span class="block text-sm text-base-content/60">A mocked fee estimate appears only after required fields and constraints pass validation.</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-primary" onclick={reviewOrder} disabled={!$walletIsConnected || $walletIsUnsupported} data-testid="order-review-button">Review mocked order</button>
          <button class="btn btn-outline" onclick={cancelDraft} disabled={!$orderDraft} data-testid="order-cancel-draft">Cancel draft</button>
        </div>
      </div>
    </div>
  </div>

  {#if flowStep === 'review'}
    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="order-fee-estimate">
      <div class="card-body gap-4">
        <span class="font-semibold">Review mocked fee estimate before confirmation</span>
        <span class="text-base-content/70">No server endpoint, wallet popup, real signature, RPC call, or on-chain transaction will be used.</span>
        <div class="grid gap-3 md:grid-cols-4">
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Campaign fee<br /><strong>{feeEstimate.campaignFee}</strong></span>
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Liquidity contribution<br /><strong>{feeEstimate.liquidityContribution}</strong></span>
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Expected volume<br /><strong>{feeEstimate.expectedVolume}</strong></span>
          <span class="rounded-box border border-base-300 bg-base-200 p-3">Expected profit<br /><strong>{feeEstimate.expectedProfit}</strong></span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-outline" onclick={() => { flowStep = 'form'; }}>Edit draft</button>
          <button class="btn btn-primary" onclick={confirmOrder} data-testid="order-confirm-button">Approve and sign mocked order</button>
        </div>
      </div>
    </div>
  {:else if flowStep === 'approving' || flowStep === 'signing' || flowStep === 'submitting'}
    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="order-processing-state">
      <div class="card-body gap-3">
        <span class="font-semibold">
          {flowStep === 'approving' ? 'Mock Reown approval requested' : flowStep === 'signing' ? 'Mock Reown signing requested' : 'Submitting mocked order'}
        </span>
        <span class="text-base-content/70">
          {flowStep === 'approving'
            ? 'Approval is visible and local; no wallet extension or SDK request is opened.'
            : flowStep === 'signing'
              ? 'Signing is simulated with Reown-style language and no real signature.'
              : 'Submitting the order into local mocked campaign state.'}
        </span>
        <span class="loading loading-spinner loading-md"></span>
      </div>
    </div>
  {:else if flowStep === 'success' && submittedOrder}
    <div class="alert alert-success" data-testid="order-success-state">
      <span>
        Success: {submittedOrder.id} for {campaign.name} · {submittedOrder.contributionAmount} · {submittedOrder.assets} · {$walletNamespaceLabel} · status {submittedOrder.status}.
      </span>
      <a class="btn btn-sm btn-primary" href="/market-making/order/{submittedOrder.id}" data-testid="order-success-detail-link">Open order detail</a>
      <a class="btn btn-sm btn-outline" href="/market-making">View My Campaigns / Orders</a>
    </div>
  {/if}
</section>

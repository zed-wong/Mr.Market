<script lang="ts">
  import { page } from '$app/stores';
  import Section from '$lib/components/common/Section.svelte';
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
    openNetworkModal,
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

<div class="max-w-3xl" data-testid="order-create">
  <section class="pt-2">
    <span class="eyebrow">Market making · new order</span>
    <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content">{campaign.name}</span>
    <span class="mt-4 block text-base-content/60">
      Minimum {campaign.minimum} · assets {campaign.assets.join(' + ')}
    </span>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4">
      <span class="text-sm text-base-content/70">Connect a wallet before preparing an order.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70">
      <span>Wrong network selected. Order creation is blocked until Ethereum, Sepolia, or Solana is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="order-switch-network">Switch network</button>
    </section>
  {:else if hasLowBalance}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4" data-testid="order-low-balance-funding-cta">
      <span class="max-w-md text-sm text-base-content/70">
        Available campaign balance is below {campaign.minimum}. Deposit is the funding remedy; withdraw is still available from Wallet.
      </span>
      <div class="flex gap-2">
        <a class="btn-pill-primary" href="/deposit">Deposit</a>
        <a class="btn-pill-outline" href="/wallet">Wallet</a>
      </div>
    </section>
  {/if}

  {#if $orderDraft && flowStep !== 'success'}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="order-draft-state">
      <span class="max-w-md text-sm text-base-content/70">
        Draft saved locally for {$orderDraft.selectedAssets} · {$orderDraft.amount} USD · namespace {$orderDraft.namespace ? $walletNamespaceLabel : 'not connected'}.
      </span>
      <div class="flex gap-2">
        <a class="btn-pill-ghost" href="/market-making/campaign/{campaign.id}">Campaign detail →</a>
        <a class="btn-pill-ghost" href="/wallet">Wallet →</a>
      </div>
    </section>
  {/if}

  <Section title="Wallet & balances" eyebrow="Account">
    <div class="border-t border-base-300 pt-6">
      <span class="text-sm text-base-content/70">
        {$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'} · <span class="font-mono-num">{$walletShortAddress || 'no address'}</span>
      </span>
      <div class="mt-4">
        {#each $balances as balance}
          <div class="flex items-center justify-between border-b border-base-300 py-3">
            <span class="font-medium">{balance.symbol}</span>
            <span class="font-mono-num text-sm text-base-content/70">{balance.amount} available</span>
          </div>
        {:else}
          <div class="py-6 text-sm text-base-content/55">No account balances available.</div>
        {/each}
      </div>
    </div>
  </Section>

  <Section title="Contribution" eyebrow="Order draft">
    <div class="flex flex-col gap-6 border-t border-base-300 pt-6">
      <label class="flex flex-col gap-2">
        <span class="eyebrow">Amount (USD)</span>
        <input
          class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-3xl focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={contributionAmount}
          disabled={!$walletIsConnected || $walletIsUnsupported}
          data-testid="order-contribution-amount"
        />
        <span class="text-xs text-base-content/50">
          Available funding balance: ${$totalBalanceUsd}. Exceed it to see deposit guidance.
        </span>
        {#if attemptedReview && validationErrors.amount}
          <span class="text-xs text-error" data-testid="order-amount-error">{validationErrors.amount}</span>
        {/if}
        {#if attemptedReview && validationErrors.wallet}
          <span class="text-xs text-error" data-testid="order-wallet-error">{validationErrors.wallet}</span>
        {/if}
      </label>

      <div class="rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/60" data-testid="order-estimate-placeholder">
        <span class="eyebrow block">Fee estimate gate</span>
        <span class="mt-1.5 block">A mocked fee estimate appears only after required fields and constraints pass validation.</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed"
          onclick={reviewOrder}
          disabled={!$walletIsConnected || $walletIsUnsupported}
          data-testid="order-review-button"
        >
          Review order
        </button>
        <button
          class="btn-pill-outline disabled:opacity-40 disabled:cursor-not-allowed"
          onclick={cancelDraft}
          disabled={!$orderDraft}
          data-testid="order-cancel-draft"
        >
          Cancel draft
        </button>
      </div>
    </div>
  </Section>

  {#if flowStep === 'review'}
    <Section title="Fee estimate" eyebrow="Review" caption="No server endpoint, wallet popup, signature, RPC, or on-chain transaction will be used.">
      <div class="grid gap-px bg-base-300 border border-base-300 rounded-2xl overflow-hidden md:grid-cols-2 lg:grid-cols-4" data-testid="order-fee-estimate">
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Campaign fee</span>
          <span class="mt-2 block font-mono-num text-xl">{feeEstimate.campaignFee}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Liquidity</span>
          <span class="mt-2 block font-mono-num text-xl">{feeEstimate.liquidityContribution}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Expected volume</span>
          <span class="mt-2 block font-mono-num text-xl">{feeEstimate.expectedVolume}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Expected profit</span>
          <span class="mt-2 block font-mono-num text-xl">{feeEstimate.expectedProfit}</span>
        </div>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <button class="btn-pill-outline" onclick={() => { flowStep = 'form'; }}>Edit draft</button>
        <button class="btn-pill-primary" onclick={confirmOrder} data-testid="order-confirm-button">Approve & sign</button>
      </div>
    </Section>
  {:else if flowStep === 'approving' || flowStep === 'signing' || flowStep === 'submitting'}
    <Section title="Processing" eyebrow="Mocked">
      <div class="flex items-center gap-3 border-t border-base-300 pt-6 text-base-content/70" data-testid="order-processing-state">
        <span class="loading loading-spinner loading-sm"></span>
        <span class="text-sm">
          {flowStep === 'approving'
            ? 'Mock Reown approval requested. No wallet extension or SDK request is opened.'
            : flowStep === 'signing'
              ? 'Mock Reown signing requested. No real signature is performed.'
              : 'Submitting the order into local mocked campaign state.'}
        </span>
      </div>
    </Section>
  {:else if flowStep === 'success' && submittedOrder}
    <Section title="Submitted" eyebrow="Success">
      <div class="border-t border-base-300 pt-6" data-testid="order-success-state">
        <span class="block text-sm text-base-content/70">
          <span class="font-mono-num">{submittedOrder.id}</span> for {campaign.name} · {submittedOrder.contributionAmount} · {submittedOrder.assets} · {$walletNamespaceLabel} · status {submittedOrder.status}.
        </span>
        <div class="mt-6 flex flex-wrap gap-2">
          <a class="btn-pill-primary" href="/market-making/order/{submittedOrder.id}" data-testid="order-success-detail-link">Open order →</a>
          <a class="btn-pill-outline" href="/market-making">My campaigns / orders</a>
        </div>
      </div>
    </Section>
  {/if}
</div>

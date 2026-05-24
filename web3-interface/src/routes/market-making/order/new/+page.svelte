<script lang="ts">
  import { goto } from '$app/navigation';
  import BigNumber from 'bignumber.js';
  import Section from '$lib/components/common/Section.svelte';
  import {
    createMarketMakingOrder,
    listMarketMakingOptions,
    listMarketMakingStrategies,
  } from '$lib/helpers/api/web3';
  import { balances } from '$lib/stores/balances';
  import {
    openMockWallet,
    openNetworkModal,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';
  import type { BalanceEntry } from '$lib/types/balances';
  import type {
    Web3MarketMakingPairOption,
    Web3MarketMakingStrategyOption,
  } from '$lib/types/market-making';

  type CreateOptionsState = 'loading' | 'loaded' | 'error';
  type CreateFlowStep = 'form' | 'review' | 'wallet-pending' | 'submitting' | 'success' | 'submit-error';
  type WalletInteractionMode = 'approve' | 'reject' | 'timeout' | 'network-mismatch';

  let strategies = $state<Web3MarketMakingStrategyOption[]>([]);
  let pairOptions = $state<Web3MarketMakingPairOption[]>([]);
  let createOptionsState = $state<CreateOptionsState>('loading');
  let optionsError = $state<string | null>(null);
  let selectedStrategyId = $state('');
  let selectedPairId = $state('');
  let selectedDepositAsset = $state('');
  let depositAmount = $state('');
  let attemptedSubmit = $state(false);
  let flowStep = $state<CreateFlowStep>('form');
  let submitError = $state<string | null>(null);
  let fundingInstruction = $state<string | null>(null);
  let isSubmitting = $state(false);
  let walletInteractionMode = $state<WalletInteractionMode>('approve');
  let loadSequence = 0;

  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return 'The order request could not be completed right now.';
  };

  const normalized = (value: string | null | undefined): string => String(value || '').trim().toLowerCase();

  const selectedStrategy = $derived(
    strategies.find((strategy) => strategy.id === selectedStrategyId) ?? null
  );
  const compatiblePairOptions = $derived(
    pairOptions.filter((option) => {
      if (option.unavailable) return false;
      if (!selectedStrategy) return true;
      if (!option.strategyCompatibility.length) return true;

      const strategyKeys = [
        selectedStrategy.key,
        selectedStrategy.controllerType,
        selectedStrategy.controller,
      ].map(normalized).filter(Boolean);
      return option.strategyCompatibility.some((compatibility) => {
        const key = normalized(compatibility);
        return key === 'puremarketmaking' || strategyKeys.includes(key);
      });
    })
  );
  const selectedPair = $derived(
    compatiblePairOptions.find((option) => option.pairId === selectedPairId) ?? null
  );
  const selectedBalance = $derived(
    $balances.find((balance) => assetMatchesBalance(selectedDepositAsset, balance)) ?? null
  );
  const selectedMinimum = $derived(new BigNumber(selectedPair?.minimums.orderAmount || 0));
  const selectedMaximum = $derived(new BigNumber(selectedPair?.minimums.maximumOrderAmount || 0));
  const selectedAvailableAmount = $derived(new BigNumber(selectedBalance?.amount || 0));
  const validationErrors = $derived(validateCreateOrder());
  const hasValidationErrors = $derived(Object.keys(validationErrors).length > 0);
  const hasInsufficientBalance = $derived(
    Boolean(validationErrors.amount?.includes('exceeds available'))
  );

  function assetMatchesBalance(assetId: string, balance: BalanceEntry): boolean {
    const assetKey = normalized(assetId);
    return assetKey === normalized(balance.asset) || assetKey === normalized(balance.symbol);
  }

  const assetLabel = (assetId: string): string => {
    if (!selectedPair) return assetId || 'Asset unavailable';
    const assets = [selectedPair.base, selectedPair.quote];
    const match = assets.find(
      (asset) => normalized(asset.assetId) === normalized(assetId) || normalized(asset.symbol) === normalized(assetId)
    );
    return match?.symbol || match?.assetId || assetId || 'Asset unavailable';
  };

  const formatAmount = (value: BigNumber.Value, fallback = '0'): string => {
    const amount = new BigNumber(value || 0);
    if (!amount.isFinite()) return fallback;
    return amount.toFormat(amount.isInteger() ? 0 : 6);
  };

  const strategyLabel = (strategy: Web3MarketMakingStrategyOption | null): string =>
    strategy?.name || strategy?.key || strategy?.controllerType || strategy?.controller || 'Strategy unavailable';

  const pairSpecs = (option: Web3MarketMakingPairOption | null): string => {
    if (!option) return 'Pair specs unavailable';
    const parts = [
      option.exchangeName ? `exchange ${option.exchangeName}` : null,
      option.minimums.orderAmount ? `minimum ${formatAmount(option.minimums.orderAmount)}` : null,
      option.minimums.maximumOrderAmount ? `maximum ${formatAmount(option.minimums.maximumOrderAmount)}` : null,
      option.precision.amount ? `amount precision ${option.precision.amount}` : null,
      option.precision.price ? `price precision ${option.precision.price}` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : 'Specs available from the web3 market-making API';
  };

  function validateCreateOrder(): Record<string, string> {
    const errors: Record<string, string> = {};
    const amount = new BigNumber(depositAmount || '');

    if (!$walletIsConnected) errors.wallet = 'Connect a supported wallet before creating a market-making order.';
    if ($walletIsUnsupported) errors.wallet = 'Switch to a supported network before creating a market-making order.';
    if (createOptionsState !== 'loaded') errors.options = 'Strategy and pair/spec options must load before submission.';
    if (!selectedStrategyId || !selectedStrategy) errors.strategy = 'Choose a market-making strategy.';
    if (!selectedPairId || !selectedPair) errors.specs = 'Choose a supported pair/spec option.';
    if (!selectedDepositAsset) {
      errors.asset = 'Choose a supported initial deposit asset.';
    } else if (selectedPair && !selectedPair.supportedDepositAssets.includes(selectedDepositAsset)) {
      errors.asset = `${assetLabel(selectedDepositAsset)} is not supported for the selected pair/spec.`;
    }

    if (!depositAmount.trim()) {
      errors.amount = 'Initial deposit amount is required.';
    } else if (!amount.isFinite() || amount.isNaN()) {
      errors.amount = 'Enter a numeric initial deposit amount.';
    } else if (amount.isLessThanOrEqualTo(0)) {
      errors.amount = 'Initial deposit amount must be greater than zero.';
    } else if (selectedMinimum.isFinite() && selectedMinimum.isGreaterThan(0) && amount.isLessThan(selectedMinimum)) {
      errors.amount = `Initial deposit must be at least ${formatAmount(selectedMinimum)} ${assetLabel(selectedDepositAsset)}.`;
    } else if (selectedMaximum.isFinite() && selectedMaximum.isGreaterThan(0) && amount.isGreaterThan(selectedMaximum)) {
      errors.amount = `Initial deposit must not exceed ${formatAmount(selectedMaximum)} ${assetLabel(selectedDepositAsset)} for this pair/spec.`;
    } else if (amount.isGreaterThan(selectedAvailableAmount)) {
      errors.amount = `Initial deposit exceeds available ${assetLabel(selectedDepositAsset)} balance of ${formatAmount(selectedAvailableAmount)}.`;
    }

    return errors;
  }

  const loadCreateOptions = async () => {
    const sequence = ++loadSequence;
    createOptionsState = 'loading';
    optionsError = null;
    strategies = [];
    pairOptions = [];

    try {
      const [strategyResponse, optionsResponse] = await Promise.all([
        listMarketMakingStrategies(),
        listMarketMakingOptions(),
      ]);
      if (sequence !== loadSequence) return;
      const enabledStrategies = strategyResponse.strategies;
      const enabledPairOptions = optionsResponse.options.filter((option) => !option.unavailable);
      if (enabledStrategies.length === 0) {
        throw new Error('No enabled market-making strategies are available for order creation.');
      }
      if (enabledPairOptions.length === 0) {
        throw new Error('No supported pair/spec options are available for order creation.');
      }
      strategies = enabledStrategies;
      pairOptions = enabledPairOptions;
      createOptionsState = 'loaded';
    } catch (error) {
      if (sequence !== loadSequence) return;
      createOptionsState = 'error';
      optionsError = errorMessage(error);
    }
  };

  const reviewOrder = () => {
    attemptedSubmit = true;
    submitError = null;
    if (hasValidationErrors) return;
    flowStep = 'review';
  };

  const editOrder = () => {
    flowStep = 'form';
    submitError = null;
  };

  const submitOrder = async () => {
    attemptedSubmit = true;
    submitError = null;
    fundingInstruction = null;
    if (isSubmitting) return;
    if (hasValidationErrors || !selectedPair || !selectedStrategy || !selectedDepositAsset) return;

    isSubmitting = true;
    flowStep = 'wallet-pending';

    try {
      await delay(250);
      if (walletInteractionMode === 'reject') {
        throw new Error('Wallet approval was rejected. Review the order and submit again when ready.');
      }
      if (walletInteractionMode === 'timeout') {
        throw new Error('Wallet approval timed out. The order was not created; retry submission when the wallet is responsive.');
      }
      if (walletInteractionMode === 'network-mismatch') {
        throw new Error('Wallet network changed during approval. Switch back to a supported network and retry.');
      }

      flowStep = 'submitting';
      const response = await createMarketMakingOrder({
        marketMakingPairId: selectedPair.pairId,
        strategyDefinitionId: selectedStrategy.id,
        initialDeposit: {
          assetId: selectedDepositAsset,
          amount: new BigNumber(depositAmount).toFixed(),
        },
      });
      fundingInstruction = response.funding?.depositEndpoint || response.initialDeposit?.message || null;
      flowStep = 'success';
      await goto(`/market-making/order/${response.orderId}`);
    } catch (error) {
      submitError = errorMessage(error);
      flowStep = 'submit-error';
    } finally {
      isSubmitting = false;
    }
  };

  $effect(() => {
    void loadCreateOptions();
  });

  $effect(() => {
    if (!selectedStrategyId && strategies.length > 0) {
      selectedStrategyId = strategies[0].id;
    }
  });

  $effect(() => {
    if (!selectedPairId || !compatiblePairOptions.some((option) => option.pairId === selectedPairId)) {
      selectedPairId = compatiblePairOptions[0]?.pairId || '';
    }
  });

  $effect(() => {
    if (!selectedPair) {
      selectedDepositAsset = '';
      return;
    }
    if (!selectedDepositAsset || !selectedPair.supportedDepositAssets.includes(selectedDepositAsset)) {
      selectedDepositAsset = selectedPair.supportedDepositAssets[0] || '';
    }
  });
</script>

<div class="max-w-4xl" data-testid="order-create">
  <section class="pt-2 flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col">
      <span class="eyebrow">Market making · new order</span>
      <span class="mt-3 font-display text-5xl md:text-6xl tracking-tight text-base-content">Create market-making order</span>
      <span class="mt-4 max-w-2xl text-base-content/60">
        Choose a server-backed strategy, select explicit pair/spec details, and prepare an order-attributed initial deposit.
      </span>
    </div>
    <a class="btn-pill-outline" href="/market-making" data-testid="order-create-back-link">Orders →</a>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="order-create-connect-gate">
      <span class="text-sm text-base-content/70">Connect a supported wallet before preparing a market-making order.</span>
      <button class="btn-pill-primary" onclick={openMockWallet} data-testid="order-create-connect-action">Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="order-create-unsupported-gate">
      <span>Wrong network selected. Order creation is blocked until Ethereum, Sepolia, or Solana is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="order-switch-network">Switch network</button>
    </section>
  {/if}

  <Section title="Create options" eyebrow="Server backed">
    {#if createOptionsState === 'loading'}
      <div class="flex items-center gap-3 border-t border-base-300 pt-6 text-sm text-base-content/70" data-testid="order-create-options-loading">
        <span class="loading loading-spinner loading-sm"></span>
        <span>Loading market-making strategies and pair/spec options from the web3 market-making API…</span>
      </div>
    {:else if createOptionsState === 'error'}
      <div class="border-t border-base-300 pt-6" data-testid="order-create-options-error">
        <div class="rounded-2xl border border-error/40 px-5 py-4">
          <span class="block font-medium text-error">Create options could not be loaded.</span>
          <span class="mt-2 block text-sm text-base-content/70">{optionsError}</span>
          <button class="btn-pill-primary mt-4" onclick={() => void loadCreateOptions()} data-testid="order-create-options-retry">Retry options</button>
        </div>
      </div>
    {:else}
      <div class="grid gap-6 border-t border-base-300 pt-6 lg:grid-cols-2">
        <label class="flex flex-col gap-2">
          <span class="eyebrow">Strategy</span>
          <select
            class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40"
            bind:value={selectedStrategyId}
            disabled={isSubmitting}
            data-testid="order-strategy-select"
          >
            {#each strategies as strategy}
              <option value={strategy.id}>{strategyLabel(strategy)}</option>
            {/each}
          </select>
          <span class="text-xs text-base-content/50">Selected strategy is included in the review and create request.</span>
          {#if attemptedSubmit && validationErrors.strategy}
            <span class="text-xs text-error" data-testid="order-strategy-error">{validationErrors.strategy}</span>
          {/if}
        </label>

        <label class="flex flex-col gap-2">
          <span class="eyebrow">Pair / specs</span>
          <select
            class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40"
            bind:value={selectedPairId}
            disabled={isSubmitting}
            data-testid="order-pair-select"
          >
            {#each compatiblePairOptions as option}
              <option value={option.pairId}>{option.pair} · {option.exchangeName ?? 'exchange unavailable'}</option>
            {/each}
          </select>
          <span class="text-xs text-base-content/50">{pairSpecs(selectedPair)}</span>
          {#if attemptedSubmit && validationErrors.specs}
            <span class="text-xs text-error" data-testid="order-specs-error">{validationErrors.specs}</span>
          {/if}
        </label>
      </div>
    {/if}
  </Section>

  <Section title="Wallet & initial deposit" eyebrow="Order funding">
    <div class="grid gap-6 border-t border-base-300 pt-6 lg:grid-cols-[1fr_1fr]">
      <div class="flex flex-col gap-4">
        <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-wallet-scope">
          <span class="eyebrow block">Active wallet</span>
          <span class="mt-2 block text-sm text-base-content/70">
            {$walletNamespaceLabel} · {$walletNetwork ?? 'not connected'} · <span class="font-mono-num">{$walletShortAddress || 'no address'}</span>
          </span>
          {#if attemptedSubmit && validationErrors.wallet}
            <span class="mt-2 block text-xs text-error" data-testid="order-wallet-error">{validationErrors.wallet}</span>
          {/if}
        </div>

        <label class="flex flex-col gap-2">
          <span class="eyebrow">Initial deposit asset</span>
          <select
            class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40"
            bind:value={selectedDepositAsset}
            disabled={isSubmitting || !selectedPair}
            data-testid="order-deposit-asset-select"
          >
            {#if selectedPair}
              {#each selectedPair.supportedDepositAssets as asset}
                <option value={asset}>{assetLabel(asset)}</option>
              {/each}
            {/if}
          </select>
          <span class="text-xs text-base-content/50">Supported assets come from the selected pair/spec option.</span>
          {#if attemptedSubmit && validationErrors.asset}
            <span class="text-xs text-error" data-testid="order-asset-error">{validationErrors.asset}</span>
          {/if}
        </label>
      </div>

      <label class="flex flex-col gap-2">
        <span class="eyebrow">Initial deposit amount</span>
        <input
          class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-3xl focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={depositAmount}
          disabled={isSubmitting || !$walletIsConnected || $walletIsUnsupported || createOptionsState !== 'loaded'}
          inputmode="decimal"
          data-testid="order-deposit-amount"
        />
        <span class="text-xs text-base-content/50">
          Available {assetLabel(selectedDepositAsset)} balance: {formatAmount(selectedAvailableAmount)}. Minimum: {formatAmount(selectedMinimum)}.
        </span>
        {#if attemptedSubmit && validationErrors.amount}
          <span class="text-xs text-error" data-testid="order-amount-error">{validationErrors.amount}</span>
        {/if}
      </label>
    </div>

    {#if hasInsufficientBalance}
      <div class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4" data-testid="order-low-balance-funding-cta">
        <span class="max-w-xl text-sm text-base-content/70">
          This order needs more {assetLabel(selectedDepositAsset)} before creation can proceed. Deposit to the connected wallet, then return to submit the order.
        </span>
        <div class="flex flex-wrap gap-2">
          <a class="btn-pill-primary" href="/deposit">Deposit</a>
          <a class="btn-pill-outline" href="/wallet">Wallet</a>
        </div>
      </div>
    {/if}
  </Section>

  <Section title="Review & submit" eyebrow="Order intent">
    <div class="border-t border-base-300 pt-6">
      <div class="grid gap-px overflow-hidden rounded-2xl border border-base-300 bg-base-300 md:grid-cols-2 xl:grid-cols-4" data-testid="order-review-summary">
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Strategy</span>
          <span class="mt-2 block text-base text-base-content">{strategyLabel(selectedStrategy)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Pair / specs</span>
          <span class="mt-2 block text-base text-base-content">{selectedPair?.pair ?? 'Pair unavailable'}</span>
          <span class="mt-1 block text-xs text-base-content/50">{pairSpecs(selectedPair)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Deposit</span>
          <span class="mt-2 block font-mono-num text-base text-base-content">{depositAmount || '0'} {assetLabel(selectedDepositAsset)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Funding</span>
          <span class="mt-2 block text-base text-base-content">Separate order deposit</span>
          <span class="mt-1 block text-xs text-base-content/50">Balances remain order-attributed after the deposit endpoint succeeds.</span>
        </div>
      </div>

      <label class="mt-6 flex flex-col gap-2 max-w-md">
        <span class="eyebrow">Wallet interaction preview</span>
        <select
          class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={walletInteractionMode}
          disabled={isSubmitting}
          data-testid="order-wallet-interaction-mode"
        >
          <option value="approve">Approve normally</option>
          <option value="reject">Preview user rejection</option>
          <option value="timeout">Preview wallet timeout</option>
          <option value="network-mismatch">Preview network mismatch</option>
        </select>
        <span class="text-xs text-base-content/50">Recoverable wallet approval, rejection, timeout, and network mismatch states are handled before the create request.</span>
      </label>

      {#if flowStep === 'review'}
        <div class="mt-6 rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/70" data-testid="order-review-ready">
          Review is ready. Submitting will create the order intent through the web3 market-making API and then route to order detail.
        </div>
      {:else if flowStep === 'wallet-pending'}
        <div class="mt-6 flex items-center gap-3 rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/70" data-testid="order-wallet-pending">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Waiting for wallet approval for this market-making order…</span>
        </div>
      {:else if flowStep === 'submitting'}
        <div class="mt-6 flex items-center gap-3 rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/70" data-testid="order-submit-pending">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Submitting the order through /api/v1/web3/market-making/orders…</span>
        </div>
      {:else if flowStep === 'submit-error' && submitError}
        <div class="mt-6 rounded-2xl border border-error/40 px-5 py-4" data-testid="order-submit-error">
          <span class="block font-medium text-error">Order was not created.</span>
          <span class="mt-2 block text-sm text-base-content/70">{submitError}</span>
          <span class="mt-2 block text-xs text-base-content/50">Entered strategy, pair/spec, deposit asset, and amount were preserved for retry.</span>
        </div>
      {:else if flowStep === 'success'}
        <div class="mt-6 rounded-2xl border border-success/40 px-5 py-4" data-testid="order-submit-success">
          <span class="block font-medium text-success">Order created. Opening detail…</span>
          {#if fundingInstruction}
            <span class="mt-2 block text-sm text-base-content/70">Funding instruction: {fundingInstruction}</span>
          {/if}
        </div>
      {/if}

      {#if attemptedSubmit && validationErrors.options}
        <span class="mt-4 block text-xs text-error" data-testid="order-options-error">{validationErrors.options}</span>
      {/if}

      <div class="mt-6 flex flex-wrap gap-2">
        {#if flowStep === 'review' || flowStep === 'submit-error'}
          <button class="btn-pill-outline" onclick={editOrder} disabled={isSubmitting} data-testid="order-edit-button">Edit order</button>
          <button
            class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={() => void submitOrder()}
            disabled={isSubmitting || hasValidationErrors || createOptionsState !== 'loaded' || !$walletIsConnected || $walletIsUnsupported}
            data-testid="order-confirm-button"
          >
            {isSubmitting ? 'Submitting order…' : 'Submit order'}
          </button>
        {:else}
          <button
            class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={reviewOrder}
            disabled={isSubmitting || createOptionsState !== 'loaded' || !$walletIsConnected || $walletIsUnsupported}
            data-testid="order-review-button"
          >
            Review order
          </button>
        {/if}
      </div>
    </div>
  </Section>
</div>

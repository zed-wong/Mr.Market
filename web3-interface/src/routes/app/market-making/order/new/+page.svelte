<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { flushSync } from 'svelte';
  import BigNumber from 'bignumber.js';
  import { _ } from 'svelte-i18n';
  import Section from '$lib/components/common/Section.svelte';
  import {
    createMarketMakingOrder,
    listMarketMakingOptions,
    listMarketMakingStrategies,
  } from '$lib/helpers/api/web3';
  import {
    createFlowSteps,
    isCreateFlowStep,
    isCreateStepPanelHidden,
    type CreateFlowStep,
  } from '$lib/helpers/market-making/create-step-panels';
  import { authMatchesWalletScope } from '$lib/helpers/market-making/wallet-scope';
  import { signInWithEthereum } from '$lib/helpers/siwe/siwe';
  import { balances } from '$lib/stores/balances';
  import { authState, hasUsableAuthSession, isAuthed } from '$lib/stores/auth';
  import {
    openNetworkModal,
    openWalletModal,
    signWalletMessage,
    walletAccount,
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
  type SubmitState = 'idle' | 'signing' | 'submitting' | 'success' | 'error';

  const stepFromUrl = (): CreateFlowStep => {
    const step = page.url.searchParams.get('step');
    return isCreateFlowStep(step) ? step : 'pair';
  };

  let strategies = $state<Web3MarketMakingStrategyOption[]>([]);
  let pairOptions = $state<Web3MarketMakingPairOption[]>([]);
  let createOptionsState = $state<CreateOptionsState>('loading');
  let activeStep = $state<CreateFlowStep>(stepFromUrl());
  let submitState = $state<SubmitState>('idle');
  let selectedPairId = $state('');
  let selectedDepositAsset = $state('');
  let depositAmount = $state('');
  let attemptedPair = $state(false);
  let attemptedFunds = $state(false);
  let optionsError = $state<string | null>(null);
  let authPromptError = $state<string | null>(null);
  let submitError = $state<string | null>(null);
  let fundingInstruction = $state<string | null>(null);
  let isSubmitting = $state(false);
  let loadSequence = 0;
  let pairNextButton = $state<HTMLButtonElement | null>(null);
  let fundsBackButton = $state<HTMLButtonElement | null>(null);
  let reviewButton = $state<HTMLButtonElement | null>(null);
  let reviewEditButton = $state<HTMLButtonElement | null>(null);
  let confirmButton = $state<HTMLButtonElement | null>(null);

  const PURE_MARKET_MAKING_KEY = 'pure_market_making';

  const normalized = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  const isPureMarketMakingStrategy = (strategy: Web3MarketMakingStrategyOption): boolean => {
    const keys = [strategy.key, strategy.controllerType, strategy.controller].map(normalized);
    return keys.some((key) => key === 'puremarketmaking' || key === 'marketmaking');
  };

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return $_('market_making_create_error_generic');
  };

  const selectedPureStrategy = $derived(strategies.find(isPureMarketMakingStrategy) ?? null);
  const compatiblePairOptions = $derived.by(() =>
    pairOptions.filter((option) => {
      if (option.unavailable) return false;
      if (!option.strategyCompatibility.length) return true;
      return option.strategyCompatibility.some((compatibility) => {
        const key = normalized(compatibility);
        return key === 'puremarketmaking' || key === 'marketmaking';
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
  const amountValidationError = $derived(validationErrors.amount ?? validationErrors.asset ?? null);
  const hasFundsErrors = $derived(Boolean(validationErrors.asset || validationErrors.amount));
  const hasPairErrors = $derived(Boolean(validationErrors.options || validationErrors.strategy || validationErrors.specs));
  const hasBalanceBlock = $derived(Boolean(validationErrors.amount?.toLowerCase().includes('available')));
  const activeWalletChainId = $derived(String($walletAccount?.chainId ?? '0'));
  const activeWalletAddress = $derived($walletAccount?.address ?? '');
  const authMatchesActiveWallet = $derived(
    authMatchesWalletScope({
      auth: $authState,
      address: activeWalletAddress,
      chainId: activeWalletChainId,
      hasUsableSession: hasUsableAuthSession(),
    })
  );
  const hasAuthenticatedOrderScope = $derived(
    $walletIsConnected && !$walletIsUnsupported && $isAuthed && authMatchesActiveWallet
  );

  function assetMatchesBalance(assetId: string, balance: BalanceEntry): boolean {
    const assetKey = normalized(assetId);
    const pairAsset = selectedPair
      ? [selectedPair.base, selectedPair.quote].find(
          (asset) => normalized(asset.assetId) === assetKey || normalized(asset.symbol) === assetKey
        )
      : null;
    const balanceKeys = [balance.asset, balance.symbol].map(normalized);
    const selectedAssetKeys = [assetId, pairAsset?.assetId, pairAsset?.symbol].map(normalized);
    return selectedAssetKeys.some((key) => key && balanceKeys.includes(key));
  }

  const assetLabel = (assetId: string): string => {
    if (!selectedPair) return assetId || $_('market_making_create_asset_unavailable');
    const assets = [selectedPair.base, selectedPair.quote];
    const match = assets.find(
      (asset) => normalized(asset.assetId) === normalized(assetId) || normalized(asset.symbol) === normalized(assetId)
    );
    return match?.symbol || match?.assetId || assetId || $_('market_making_create_asset_unavailable');
  };

  const formatAmount = (value: BigNumber.Value, fallback = '0'): string => {
    const amount = new BigNumber(value || 0);
    if (!amount.isFinite()) return fallback;
    return amount.toFormat(amount.isInteger() ? 0 : 6);
  };

  const pairSpecs = (option: Web3MarketMakingPairOption | null): string => {
    if (!option) return $_('market_making_create_pair_specs_unavailable');
    const parts = [
      option.exchangeName ? `${$_('market_making_create_exchange')} ${option.exchangeName}` : null,
      option.minimums.orderAmount ? `${$_('market_making_create_minimum')} ${formatAmount(option.minimums.orderAmount)}` : null,
      option.minimums.maximumOrderAmount ? `${$_('market_making_create_maximum')} ${formatAmount(option.minimums.maximumOrderAmount)}` : null,
      option.precision.amount ? `${$_('market_making_create_amount_precision')} ${option.precision.amount}` : null,
      option.precision.price ? `${$_('market_making_create_price_precision')} ${option.precision.price}` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : $_('market_making_create_specs_from_api');
  };

  const attachButtonClick = (node: HTMLButtonElement | null, handler: () => void) => {
    if (!node) return;
    const onClick = () => {
      if (node.disabled) return;
      flushSync(handler);
    };
    node.addEventListener('click', onClick);
    return () => node.removeEventListener('click', onClick);
  };

  const setCreateStep = async (step: CreateFlowStep) => {
    activeStep = step;
  };

  function validateCreateOrder(): Record<string, string> {
    const errors: Record<string, string> = {};
    const amount = new BigNumber(depositAmount.trim() || 0);

    if (createOptionsState !== 'loaded') errors.options = $_('market_making_create_error_options_required');
    if (!selectedPureStrategy) errors.strategy = $_('market_making_create_error_strategy_unavailable');
    if (!selectedPairId || !selectedPair) errors.specs = $_('market_making_create_error_pair_required');
    if (!selectedDepositAsset) {
      errors.asset = $_('market_making_create_error_asset_required');
    } else if (selectedPair && !selectedPair.supportedDepositAssets.includes(selectedDepositAsset)) {
      errors.asset = $_('market_making_create_error_asset_unsupported', { values: { asset: assetLabel(selectedDepositAsset) } });
    }

    if (!depositAmount.trim()) {
      errors.amount = $_('market_making_create_error_amount_required');
    } else if (!amount.isFinite() || amount.isNaN()) {
      errors.amount = $_('market_making_create_error_amount_numeric');
    } else if (amount.isLessThanOrEqualTo(0)) {
      errors.amount = $_('market_making_create_error_amount_positive');
    } else if (selectedMinimum.isFinite() && selectedMinimum.isGreaterThan(0) && amount.isLessThan(selectedMinimum)) {
      errors.amount = $_('market_making_create_error_amount_minimum', {
        values: { amount: formatAmount(selectedMinimum), asset: assetLabel(selectedDepositAsset) },
      });
    } else if (selectedMaximum.isFinite() && selectedMaximum.isGreaterThan(0) && amount.isGreaterThan(selectedMaximum)) {
      errors.amount = $_('market_making_create_error_amount_maximum', {
        values: { amount: formatAmount(selectedMaximum), asset: assetLabel(selectedDepositAsset) },
      });
    } else if (amount.isGreaterThan(selectedAvailableAmount)) {
      errors.amount = $_('market_making_create_error_amount_available', {
        values: { asset: assetLabel(selectedDepositAsset), amount: formatAmount(selectedAvailableAmount) },
      });
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
      strategies = strategyResponse.strategies.filter(isPureMarketMakingStrategy);
      pairOptions = optionsResponse.options.filter((option) => !option.unavailable);
      if (strategies.length === 0) throw new Error($_('market_making_create_error_strategy_unavailable'));
      if (pairOptions.length === 0) throw new Error($_('market_making_create_error_no_pairs'));
      createOptionsState = 'loaded';
    } catch (error) {
      if (sequence !== loadSequence) return;
      createOptionsState = 'error';
      optionsError = errorMessage(error);
    }
  };

  const beginAuthFlow = async (): Promise<boolean> => {
    authPromptError = null;
    if ($walletIsUnsupported) {
      await openNetworkModal();
      return false;
    }
    if (!$walletIsConnected) {
      await openWalletModal();
      return false;
    }
    try {
      await signInWithEthereum();
      return true;
    } catch (error) {
      authPromptError = errorMessage(error);
      return false;
    }
  };

  const requireAuthenticatedOrderScope = async (): Promise<boolean> => {
    if (hasAuthenticatedOrderScope) return true;
    return await beginAuthFlow();
  };

  const showFundsStep = () => {
    attemptedPair = true;
    submitError = null;
    void setCreateStep('funds');
  };

  const reviewOrder = async () => {
    attemptedFunds = true;
    submitError = null;
    if (hasPairErrors) {
      void setCreateStep('pair');
      return;
    }
    if (hasFundsErrors) return;
    if (!(await requireAuthenticatedOrderScope())) return;
    await setCreateStep('review');
  };

  const buildApprovalMessage = (): string =>
    [
      'Approve Mr.Market pure market-making order intent',
      `strategy: ${PURE_MARKET_MAKING_KEY}`,
      `pair: ${selectedPair?.pair ?? ''}`,
      `exchange: ${selectedPair?.exchangeName ?? ''}`,
      `asset: ${selectedDepositAsset}`,
      `amount: ${new BigNumber(depositAmount || 0).toFixed()}`,
      `wallet: ${activeWalletAddress}`,
      `issuedAt: ${new Date().toISOString()}`,
    ].join('\n');

  const submitOrder = async () => {
    attemptedPair = true;
    attemptedFunds = true;
    submitError = null;
    fundingInstruction = null;
    if (hasPairErrors) {
      void setCreateStep('pair');
      return;
    }
    if (hasFundsErrors || !selectedPair || !selectedPureStrategy || !selectedDepositAsset) {
      void setCreateStep('funds');
      return;
    }
    if (!(await requireAuthenticatedOrderScope())) return;

    isSubmitting = true;
    submitState = 'signing';

    try {
      const approvalMessage = buildApprovalMessage();
      const approvalSignature = await signWalletMessage(approvalMessage);
      if (!approvalSignature) throw new Error($_('market_making_create_error_approval_missing'));

      submitState = 'submitting';
      const response = await createMarketMakingOrder({
        marketMakingPairId: selectedPair.pairId,
        strategyDefinitionId: selectedPureStrategy.id,
        initialDeposit: {
          assetId: selectedDepositAsset,
          amount: new BigNumber(depositAmount).toFixed(),
        },
      });
      fundingInstruction = response.funding?.depositEndpoint || response.initialDeposit?.message || null;
      submitState = 'success';
      await goto(`/app/market-making/order/${encodeURIComponent(response.orderId)}`);
    } catch (error) {
      submitError = errorMessage(error);
      submitState = 'error';
    } finally {
      isSubmitting = false;
    }
  };

  $effect(() => {
    void loadCreateOptions();
  });

  $effect(() => {
    const step = page.url.searchParams.get('step');
    if (isCreateFlowStep(step)) {
      activeStep = step;
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

  $effect(() => attachButtonClick(pairNextButton, showFundsStep));
  $effect(() => attachButtonClick(fundsBackButton, () => void setCreateStep('pair')));
  $effect(() => attachButtonClick(reviewButton, () => void reviewOrder()));
  $effect(() => attachButtonClick(reviewEditButton, () => void setCreateStep('funds')));
  $effect(() => attachButtonClick(confirmButton, () => void submitOrder()));
</script>

<div class="max-w-5xl" data-testid="order-create" data-strategy="pure_market_making">
  <section class="pt-2 flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col">
      <span class="eyebrow">{$_('market_making_create_eyebrow')}</span>
      <span class="mt-3 font-display text-5xl md:text-6xl tracking-tight text-base-content">{$_('market_making_create_title')}</span>
      <span class="mt-4 max-w-2xl text-base-content/60">
        {$_('market_making_create_subtitle')}
      </span>
    </div>
    <a class="btn-pill-outline" href="/app/market-making" data-testid="order-create-back-link">{$_('market_making_create_orders_link')} →</a>
  </section>

  <section class="mt-8 grid gap-3 md:grid-cols-3" data-testid="order-create-steps">
    {#each createFlowSteps as step, index}
      <div class="rounded-2xl border border-base-300 px-4 py-3 {activeStep === step.key ? 'bg-base-200' : 'bg-base-100'}" data-testid="order-create-step-{step.key}">
        <span class="inline-flex h-7 w-7 items-center justify-center rounded-full {activeStep === step.key ? 'bg-base-content text-base-100' : 'bg-base-200 text-base-content/60'} font-mono-num text-xs">{index + 1}</span>
        <span class="ml-2 font-medium text-base-content">{$_(step.labelKey)}</span>
        <span class="mt-2 block text-xs text-base-content/55">{$_(step.detailKey)}</span>
      </div>
    {/each}
  </section>

  {#if !hasAuthenticatedOrderScope}
    <section class="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="order-create-auth-gate">
      <span class="max-w-2xl text-sm text-base-content/70">
        {$_('market_making_create_auth_gate_message')}
      </span>
      <div class="flex flex-wrap gap-2">
        {#if $walletIsUnsupported}
          <button class="btn-pill-primary" onclick={() => void openNetworkModal()} data-testid="order-switch-network">{$_('switch_network')}</button>
        {:else if !$walletIsConnected}
          <button class="btn-pill-primary" onclick={() => void openWalletModal()} data-testid="order-create-connect-action">{$_('connect_wallet')}</button>
        {:else}
          <button class="btn-pill-primary" onclick={() => void beginAuthFlow()} data-testid="order-create-sign-in-action">{$_('sign_in_button')}</button>
        {/if}
      </div>
      {#if authPromptError}
        <span class="basis-full text-xs text-error" data-testid="order-create-auth-error">{authPromptError}</span>
      {/if}
    </section>
  {/if}

  <div hidden={isCreateStepPanelHidden(activeStep, 'pair')} data-testid="order-pair-panel">
    <Section title={$_('market_making_create_pair_title')} eyebrow={$_('market_making_create_pair_eyebrow')}>
      {#if createOptionsState === 'loading'}
        <div class="flex items-center gap-3 border-t border-base-300 pt-6 text-sm text-base-content/70" data-testid="order-create-options-loading">
          <span class="loading loading-spinner loading-sm"></span>
          <span>{$_('market_making_create_options_loading')}</span>
        </div>
      {:else if createOptionsState === 'error'}
        <div class="border-t border-base-300 pt-6" data-testid="order-create-options-error">
          <div class="rounded-2xl border border-error/40 px-5 py-4">
            <span class="block font-medium text-error">{$_('market_making_create_options_error_title')}</span>
            <span class="mt-2 block text-sm text-base-content/70">{optionsError}</span>
            <button class="btn-pill-primary mt-4" onclick={() => void loadCreateOptions()} data-testid="order-create-options-retry">{$_('market_making_create_retry_options')}</button>
          </div>
        </div>
      {:else}
        <div class="grid gap-6 border-t border-base-300 pt-6 lg:grid-cols-[1fr_0.8fr]">
          <label class="flex flex-col gap-2">
            <span class="eyebrow">{$_('market_making_create_pair_label')}</span>
            <select
              class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40"
              bind:value={selectedPairId}
              disabled={isSubmitting}
              data-testid="order-pair-select"
            >
              {#each compatiblePairOptions as option}
                <option value={option.pairId}>{option.pair} · {option.exchangeName ?? $_('market_making_create_exchange_unavailable')}</option>
              {/each}
            </select>
            <span class="text-xs text-base-content/50">{pairSpecs(selectedPair)}</span>
            {#if attemptedPair && validationErrors.specs}
              <span class="text-xs text-error" data-testid="order-specs-error">{validationErrors.specs}</span>
            {/if}
          </label>

          <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-pure-strategy-summary">
            <span class="eyebrow block">{$_('market_making_create_strategy_label')}</span>
            <span class="mt-2 block text-base text-base-content">{$_('market_making_create_strategy_value')}</span>
            <span class="mt-1 block font-mono-num text-xs text-base-content/50">{PURE_MARKET_MAKING_KEY}</span>
            <span class="mt-3 block text-xs text-base-content/55">{$_('market_making_create_strategy_note')}</span>
            {#if attemptedPair && validationErrors.strategy}
              <span class="mt-2 block text-xs text-error" data-testid="order-strategy-error">{validationErrors.strategy}</span>
            {/if}
          </div>
        </div>
        {#if attemptedPair && validationErrors.options}
          <span class="mt-4 block text-xs text-error" data-testid="order-options-error">{validationErrors.options}</span>
        {/if}
      {/if}
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button
          class="btn-pill-primary disabled:opacity-40"
          bind:this={pairNextButton}
          disabled={createOptionsState !== 'loaded' || isSubmitting}
          data-testid="order-pair-next-button"
        >
          {$_('market_making_create_continue_to_funds')}
        </button>
      </div>
    </Section>
  </div>

  <div hidden={isCreateStepPanelHidden(activeStep, 'funds')} data-testid="order-funds-panel">
    <Section title={$_('market_making_create_funds_title')} eyebrow={$_('market_making_create_funds_eyebrow')}>
      <div class="grid gap-6 border-t border-base-300 pt-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div class="flex flex-col gap-4">
          <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-wallet-scope">
            <span class="eyebrow block">{$_('market_making_create_active_wallet')}</span>
            <span class="mt-2 block text-sm text-base-content/70">
              {$walletNamespaceLabel} · {$walletNetwork ?? $_('market_making_create_not_connected')} · <span class="font-mono-num">{$walletShortAddress || $_('market_making_create_no_address')}</span>
            </span>
          </div>

          <label class="flex flex-col gap-2">
            <span class="eyebrow">{$_('market_making_create_deposit_asset')}</span>
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
            <span class="text-xs text-base-content/50">{$_('market_making_create_deposit_asset_hint')}</span>
            {#if attemptedFunds && validationErrors.asset}
              <span class="text-xs text-error" data-testid="order-asset-error">{validationErrors.asset}</span>
            {/if}
          </label>
        </div>

        <label class="flex flex-col gap-2">
          <span class="eyebrow">{$_('market_making_create_deposit_amount')}</span>
          <input
            class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-3xl focus:outline-none focus:border-base-content disabled:opacity-40"
            bind:value={depositAmount}
            disabled={isSubmitting || createOptionsState !== 'loaded'}
            inputmode="decimal"
            data-testid="order-deposit-amount"
          />
          <span class="text-xs text-base-content/50">
            {$_('market_making_create_available_balance', {
              values: {
                asset: assetLabel(selectedDepositAsset),
                amount: formatAmount(selectedAvailableAmount),
                minimum: formatAmount(selectedMinimum),
              },
            })}
          </span>
          {#if attemptedFunds && amountValidationError}
            <span class="text-xs text-error" data-testid="order-amount-error">{amountValidationError}</span>
          {/if}
        </label>
      </div>

      {#if hasBalanceBlock}
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4" data-testid="order-low-balance-funding-cta">
          <span class="max-w-xl text-sm text-base-content/70">
            {$_('market_making_create_low_balance_message', { values: { asset: assetLabel(selectedDepositAsset) } })}
          </span>
          <div class="flex flex-wrap gap-2">
            <a class="btn-pill-primary" href="/app/deposit">{$_('deposit')}</a>
            <a class="btn-pill-outline" href="/app/wallet">{$_('portfolio')}</a>
          </div>
        </div>
      {/if}

      <div class="mt-6 flex flex-wrap justify-between gap-2">
        <button class="btn-pill-outline" bind:this={fundsBackButton} disabled={isSubmitting} data-testid="order-funds-back-button">{$_('market_making_create_back_to_pair')}</button>
        <button class="btn-pill-primary disabled:opacity-40" bind:this={reviewButton} disabled={isSubmitting || createOptionsState !== 'loaded'} data-testid="order-review-button">
          {$_('market_making_create_review_order')}
        </button>
      </div>
    </Section>
  </div>

  <div hidden={isCreateStepPanelHidden(activeStep, 'review')} data-testid="order-review-panel">
    <Section title={$_('market_making_create_review_title')} eyebrow={$_('market_making_create_review_eyebrow')}>
      <div class="border-t border-base-300 pt-6">
        <div class="grid gap-px overflow-hidden rounded-2xl border border-base-300 bg-base-300 md:grid-cols-2 xl:grid-cols-4" data-testid="order-review-summary">
          <div class="bg-base-100 p-5">
            <span class="eyebrow">{$_('market_making_create_review_strategy')}</span>
            <span class="mt-2 block text-base text-base-content">{$_('market_making_create_strategy_value')}</span>
            <span class="mt-1 block font-mono-num text-xs text-base-content/50">{PURE_MARKET_MAKING_KEY}</span>
          </div>
          <div class="bg-base-100 p-5">
            <span class="eyebrow">{$_('market_making_create_review_pair')}</span>
            <span class="mt-2 block text-base text-base-content">{selectedPair?.pair ?? $_('market_making_create_pair_unavailable')}</span>
            <span class="mt-1 block text-xs text-base-content/50">{selectedPair?.exchangeName ?? $_('market_making_create_exchange_unavailable')}</span>
          </div>
          <div class="bg-base-100 p-5">
            <span class="eyebrow">{$_('market_making_create_review_deposit')}</span>
            <span class="mt-2 block font-mono-num text-base text-base-content">{depositAmount || '0'} {assetLabel(selectedDepositAsset)}</span>
            <span class="mt-1 block text-xs text-base-content/50">{$_('market_making_create_review_balance_checked')}</span>
          </div>
          <div class="bg-base-100 p-5">
            <span class="eyebrow">{$_('market_making_create_review_wallet')}</span>
            <span class="mt-2 block font-mono-num text-base text-base-content">{$walletShortAddress || $_('market_making_create_no_address')}</span>
            <span class="mt-1 block text-xs text-base-content/50">{$_('market_making_create_review_wallet_note')}</span>
          </div>
        </div>

        {#if submitState === 'idle'}
          <div class="mt-6 rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/70" data-testid="order-review-ready">
            {$_('market_making_create_review_ready')}
          </div>
        {:else if submitState === 'signing'}
          <div class="mt-6 flex items-center gap-3 rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/70" data-testid="order-wallet-pending">
            <span class="loading loading-spinner loading-sm"></span>
            <span>{$_('market_making_create_wallet_pending')}</span>
          </div>
        {:else if submitState === 'submitting'}
          <div class="mt-6 flex items-center gap-3 rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/70" data-testid="order-submit-pending">
            <span class="loading loading-spinner loading-sm"></span>
            <span>{$_('market_making_create_submit_pending')}</span>
          </div>
        {:else if submitState === 'error' && submitError}
          <div class="mt-6 rounded-2xl border border-error/40 px-5 py-4" data-testid="order-submit-error">
            <span class="block font-medium text-error">{$_('market_making_create_submit_error_title')}</span>
            <span class="mt-2 block text-sm text-base-content/70">{submitError}</span>
            <span class="mt-2 block text-xs text-base-content/50">{$_('market_making_create_submit_error_hint')}</span>
          </div>
        {:else if submitState === 'success'}
          <div class="mt-6 rounded-2xl border border-success/40 px-5 py-4" data-testid="order-submit-success">
            <span class="block font-medium text-success">{$_('market_making_create_submit_success')}</span>
            {#if fundingInstruction}
              <span class="mt-2 block text-sm text-base-content/70">{$_('market_making_create_funding_instruction', { values: { instruction: fundingInstruction } })}</span>
            {/if}
          </div>
        {/if}

        <div class="mt-6 flex flex-wrap justify-between gap-2">
          <button class="btn-pill-outline" bind:this={reviewEditButton} disabled={isSubmitting} data-testid="order-edit-button">{$_('market_making_create_edit_funds')}</button>
          <button
            class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed"
            bind:this={confirmButton}
            disabled={isSubmitting || createOptionsState !== 'loaded'}
            data-testid="order-confirm-button"
          >
            {submitState === 'signing' ? $_('market_making_create_authorizing') : submitState === 'submitting' ? $_('market_making_create_submitting') : $_('market_making_create_authorize_submit')}
          </button>
        </div>
      </div>
    </Section>
  </div>
</div>

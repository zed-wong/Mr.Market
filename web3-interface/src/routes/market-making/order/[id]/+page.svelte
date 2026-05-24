<script lang="ts">
  import { page } from '$app/stores';
  import BigNumber from 'bignumber.js';
  import Section from '$lib/components/common/Section.svelte';
  import {
    depositMarketMakingOrder,
    getMarketMakingOrderDetail,
    pauseMarketMakingOrder,
    resumeMarketMakingOrder,
    startMarketMakingOrder,
    withdrawMarketMakingOrder,
  } from '$lib/helpers/api/web3';
  import { ApiError } from '$lib/helpers/api/client';
  import {
    openMockWallet,
    openNetworkModal,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletShortAddress,
  } from '$lib/stores/wallet';
  import type {
    Web3MarketMakingMutationResponse,
    Web3MarketMakingOrderDetail,
    Web3MarketMakingOrderEvent,
  } from '$lib/types/market-making';

  type LifecycleAction = 'start' | 'pause' | 'resume';
  type FundingAction = 'deposit' | 'withdraw';
  type WalletInteractionMode = 'approve' | 'reject' | 'timeout' | 'network-mismatch';

  let order = $state<Web3MarketMakingOrderDetail | null>(null);
  let detailNamespace = $state('/api/v1/web3/market-making');
  let isLoading = $state(false);
  let detailError = $state<string | null>(null);
  let isNotFound = $state(false);
  let loadSequence = 0;

  let depositAsset = $state('');
  let depositAmount = $state('');
  let withdrawAsset = $state('');
  let withdrawAmount = $state('');
  let attemptedDeposit = $state(false);
  let attemptedWithdraw = $state(false);
  let actionLoading = $state<LifecycleAction | FundingAction | null>(null);
  let actionError = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);
  let walletInteractionMode = $state<WalletInteractionMode>('approve');

  const orderId = $derived($page.params.id);
  const canLoadDetail = $derived($walletIsConnected && !$walletIsUnsupported && Boolean(orderId));
  const supportedAssets = $derived(order ? supportedAssetsForOrder(order) : []);
  const orderedEvents = $derived(order ? [...order.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) : []);
  const selectedWithdrawBalance = $derived(
    order?.balances.find((balance) => normalize(balance.assetId) === normalize(withdrawAsset)) ?? null
  );
  const depositValidationError = $derived(validateMoneyMovement(depositAsset, depositAmount, 'deposit'));
  const withdrawValidationError = $derived(validateMoneyMovement(withdrawAsset, withdrawAmount, 'withdraw'));

  const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const normalize = (value: string | null | undefined): string => String(value || '').trim().toLowerCase();

  const formatState = (value: string | null | undefined): string =>
    value ? value.replace(/[_-]+/g, ' ') : 'unknown';

  const formatText = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === '') return 'Unavailable';
    return String(value);
  };

  const formatAmount = (value: BigNumber.Value | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '0';
    const amount = new BigNumber(value);
    if (!amount.isFinite()) return String(value);
    return amount.toFormat(Math.max(0, amount.decimalPlaces() ?? 0));
  };

  const formatSignedAmount = (value: BigNumber.Value | null | undefined): string => {
    const amount = new BigNumber(value || 0);
    if (!amount.isFinite()) return String(value ?? '0');
    const formatted = amount.toFormat(Math.max(0, amount.decimalPlaces() ?? 0));
    return amount.isGreaterThan(0) ? `+${formatted}` : formatted;
  };

  const formatDate = (value: string | null | undefined): string => {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const compactOrderId = (value: string): string =>
    value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;

  const strategyLabel = (detail: Web3MarketMakingOrderDetail): string =>
    detail.strategy?.name || detail.strategy?.key || detail.strategy?.controller || 'Strategy unavailable';

  const specsSummary = (detail: Web3MarketMakingOrderDetail): string => {
    const specs = detail.specs;
    const parts = [
      specs.exchangeName ? `exchange ${specs.exchangeName}` : null,
      specs.bidSpread ? `bid spread ${formatAmount(specs.bidSpread)}` : null,
      specs.askSpread ? `ask spread ${formatAmount(specs.askSpread)}` : null,
      specs.orderAmount ? `order amount ${formatAmount(specs.orderAmount)}` : null,
      specs.numberOfLayers ? `${specs.numberOfLayers} layers` : null,
      specs.orderRefreshTime ? `refresh ${specs.orderRefreshTime}s` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : 'Specs unavailable';
  };

  function supportedAssetsForOrder(detail: Web3MarketMakingOrderDetail): string[] {
    return [
      ...detail.balances.map((balance) => balance.assetId),
      ...String(detail.pair || detail.specs.pair || '')
        .split('/')
        .map((asset) => asset.trim())
        .filter(Boolean),
    ].filter((asset, index, assets) => assets.findIndex((candidate) => normalize(candidate) === normalize(asset)) === index);
  }

  const eventLabel = (event: Web3MarketMakingOrderEvent): string =>
    event.type.replace(/[_-]+/g, ' ');

  const eventSummary = (event: Web3MarketMakingOrderEvent): string => {
    const parts = [
      event.assetId ? `${event.assetId} ${formatAmount(event.amount)}` : null,
      event.refType ? `source ${event.refType}` : null,
      event.refId ? `reference ${event.refId}` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : 'Order-attributed event';
  };

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return 'Order detail could not be loaded right now.';
  };

  const ensureAssetDefaults = (detail: Web3MarketMakingOrderDetail) => {
    const assets = supportedAssetsForOrder(detail);
    const firstAsset = assets[0] || '';
    if (!assets.some((asset) => normalize(asset) === normalize(depositAsset))) {
      depositAsset = firstAsset;
    }
    if (!assets.some((asset) => normalize(asset) === normalize(withdrawAsset))) {
      withdrawAsset = detail.balances.find((balance) => new BigNumber(balance.available || 0).isGreaterThan(0))?.assetId || firstAsset;
    }
  };

  const applyDetailResponse = (response: { namespace: string; order: Web3MarketMakingOrderDetail }) => {
    detailNamespace = response.namespace;
    order = response.order;
    ensureAssetDefaults(response.order);
  };

  const loadOrderDetail = async () => {
    const sequence = ++loadSequence;
    const currentOrderId = orderId || '';
    isLoading = true;
    detailError = null;
    isNotFound = false;
    actionError = null;
    actionMessage = null;

    try {
      const response = await getMarketMakingOrderDetail(currentOrderId);
      if (sequence !== loadSequence) return;
      if (response.order.source !== 'web3_market_making_order') {
        throw new Error('Order is not available in the web3 market-making namespace.');
      }
      applyDetailResponse(response);
    } catch (error) {
      if (sequence !== loadSequence) return;
      order = null;
      isNotFound = error instanceof ApiError && error.status === 404;
      detailError = isNotFound
        ? null
        : error instanceof ApiError && error.status === 401
          ? 'Authenticate the connected wallet to view this market-making order.'
          : errorMessage(error);
    } finally {
      if (sequence === loadSequence) {
        isLoading = false;
      }
    }
  };

  function validateMoneyMovement(asset: string, amountValue: string, action: FundingAction): string | null {
    if (!order) return 'Order detail must load before moving funds.';
    if (!order.validActions[action]) return `${action === 'deposit' ? 'Deposit' : 'Withdraw'} is unavailable for the latest order state.`;
    if (!asset) return 'Choose an order-supported asset.';
    if (!supportedAssets.some((item) => normalize(item) === normalize(asset))) {
      return `${asset} is not supported by this order pair/spec.`;
    }
    if (!amountValue.trim()) return 'Enter a positive amount.';

    const amount = new BigNumber(amountValue);
    if (!amount.isFinite() || amount.isNaN()) return 'Enter a numeric amount.';
    if (amount.isLessThanOrEqualTo(0)) return 'Amount must be greater than zero.';

    if (action === 'withdraw') {
      const available = new BigNumber(selectedWithdrawBalance?.available || 0);
      if (amount.isGreaterThan(available)) {
        return `Withdraw amount exceeds available ${asset} balance of ${formatAmount(available)}.`;
      }
    }

    return null;
  }

  const makeIdempotencyKey = (action: FundingAction): string => {
    const randomPart =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `web3-detail:${orderId || 'unknown'}:${action}:${randomPart}`;
  };

  const simulateWalletInteraction = async (action: FundingAction) => {
    await delay(200);
    if (walletInteractionMode === 'reject') {
      throw new Error(`Wallet approval for ${action} was rejected. Balances were left unchanged.`);
    }
    if (walletInteractionMode === 'timeout') {
      throw new Error(`Wallet approval for ${action} timed out. Retry when the wallet is responsive.`);
    }
    if (walletInteractionMode === 'network-mismatch') {
      throw new Error(`Wallet network changed during ${action}. Switch back to a supported network and retry.`);
    }
  };

  const runFundingAction = async (action: FundingAction) => {
    if (!order || actionLoading) return;
    if (action === 'deposit') attemptedDeposit = true;
    if (action === 'withdraw') attemptedWithdraw = true;

    const asset = action === 'deposit' ? depositAsset : withdrawAsset;
    const amount = action === 'deposit' ? depositAmount : withdrawAmount;
    const validationError = validateMoneyMovement(asset, amount, action);
    if (validationError) return;

    actionLoading = action;
    actionError = null;
    actionMessage = null;

    try {
      await simulateWalletInteraction(action);
      const request = {
        assetId: asset,
        amount: new BigNumber(amount).toFixed(),
        idempotencyKey: makeIdempotencyKey(action),
      };
      const response =
        action === 'deposit'
          ? await depositMarketMakingOrder(order.orderId, request)
          : await withdrawMarketMakingOrder(order.orderId, request);
      applyDetailResponse(response);
      if (action === 'deposit') depositAmount = '';
      if (action === 'withdraw') withdrawAmount = '';
      actionMessage = `${action === 'deposit' ? 'Deposit' : 'Withdraw'} applied from the latest server response.`;
    } catch (error) {
      actionError = errorMessage(error);
    } finally {
      actionLoading = null;
    }
  };

  const runLifecycleAction = async (action: LifecycleAction) => {
    if (!order || actionLoading || !order.validActions[action]) return;
    actionLoading = action;
    actionError = null;
    actionMessage = null;

    try {
      const response: Web3MarketMakingMutationResponse =
        action === 'start'
          ? await startMarketMakingOrder(order.orderId)
          : action === 'pause'
            ? await pauseMarketMakingOrder(order.orderId)
            : await resumeMarketMakingOrder(order.orderId);
      applyDetailResponse(response);
      actionMessage = `${action.charAt(0).toUpperCase()}${action.slice(1)} applied; controls now reflect the latest server state.`;
    } catch (error) {
      actionError = errorMessage(error);
    } finally {
      actionLoading = null;
    }
  };

  $effect(() => {
    if (!canLoadDetail) {
      loadSequence += 1;
      order = null;
      isLoading = false;
      detailError = null;
      isNotFound = false;
      actionError = null;
      actionMessage = null;
      return;
    }

    void loadOrderDetail();
  });
</script>

<div data-testid="order-detail">
  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="pt-2 max-w-xl" data-testid="order-detail-connect-gate">
      <span class="eyebrow">Wallet scoped</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Connect wallet to view order</span>
      <span class="mt-4 block text-base-content/60">
        Market-making order detail is authenticated and owner scoped. Connect a supported wallet before loading protected order data.
      </span>
      <button class="btn-pill-primary mt-6" onclick={openMockWallet} data-testid="order-detail-connect-action">Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="pt-2 max-w-xl" data-testid="order-detail-unsupported-gate">
      <span class="eyebrow">Network</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Switch to a supported wallet</span>
      <span class="mt-4 block text-base-content/60">
        Order management is blocked until the connected wallet is on a supported EVM or Solana network.
      </span>
      <button class="btn-pill-primary mt-6" onclick={openNetworkModal} data-testid="order-detail-switch-network">Switch network</button>
    </section>
  {:else if isLoading}
    <section class="pt-2 max-w-xl" data-testid="order-loading-state">
      <span class="eyebrow">Loading</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Loading order detail</span>
      <span class="mt-4 flex items-center gap-3 text-sm text-base-content/60">
        <span class="loading loading-spinner loading-sm"></span>
        Loading order state, balances, events, and performance from the web3 market-making API.
      </span>
    </section>
  {:else if detailError}
    <section class="pt-2 max-w-xl" data-testid="order-error-state">
      <span class="eyebrow">Recovery</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Order detail unavailable</span>
      <span class="mt-4 block text-base-content/60">
        {detailError}
      </span>
      <button class="btn-pill-primary mt-6" onclick={() => void loadOrderDetail()} data-testid="order-detail-retry">Retry order detail</button>
    </section>
  {:else if isNotFound || !order}
    <section class="pt-2 max-w-xl" data-testid="order-not-found">
      <span class="eyebrow">Not found</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">Order not found</span>
      <span class="mt-4 block text-base-content/60">
        This market-making order was not found for the authenticated wallet. Return to the order list to select an accessible order.
      </span>
      <a class="btn-pill-primary mt-6 inline-flex" href="/market-making">My orders</a>
    </section>
  {:else}
    <section class="pt-2">
      <span class="eyebrow capitalize">{formatState(order.state)}</span>
      <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content font-mono-num">Order {compactOrderId(order.orderId)}</span>
      <span class="mt-4 block text-base-content/60">
        <span class="font-mono-num">{order.orderId}</span> · {detailNamespace} · {$walletNamespaceLabel} · <span class="font-mono-num">{$walletShortAddress}</span>
      </span>

      <section class="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="order-detail-refresh-controls">
        <span class="text-sm text-base-content/60">Actions are recalculated from the latest server detail or mutation response.</span>
        <button class="btn-pill-outline" onclick={() => void loadOrderDetail()} disabled={isLoading || Boolean(actionLoading)} data-testid="order-detail-refresh">
          Refresh order
        </button>
      </section>

      {#if actionError}
        <section class="mt-6 rounded-2xl border border-error/40 px-5 py-4" data-testid="order-action-error">
          <span class="block font-medium text-error">Order action failed.</span>
          <span class="mt-1 block text-sm text-base-content/70">{actionError}</span>
        </section>
      {/if}

      {#if actionMessage}
        <section class="mt-6 rounded-2xl border border-success/40 px-5 py-4" data-testid="order-action-success">
          <span class="block font-medium text-success">Order updated.</span>
          <span class="mt-1 block text-sm text-base-content/70">{actionMessage}</span>
        </section>
      {/if}

      <div class="mt-8 grid gap-px bg-base-300 border border-base-300 rounded-2xl overflow-hidden md:grid-cols-2 lg:grid-cols-4" data-testid="order-detail-summary">
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Lifecycle status</span>
          <span class="mt-2 block text-xl capitalize">{formatState(order.state)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Pair</span>
          <span class="mt-2 block font-mono-num text-xl">{formatText(order.pair ?? order.specs.pair)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Strategy</span>
          <span class="mt-2 block text-xl">{strategyLabel(order)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">Created</span>
          <span class="mt-2 block font-mono-num text-sm">{formatDate(order.createdAt)}</span>
        </div>
      </div>
    </section>

    <Section title="Strategy and pair specs" eyebrow="Server detail" caption="Pair, exchange, strategy definition, and resolved config are read from the order detail API.">
      <div class="grid gap-5 border-t border-base-300 pt-6 lg:grid-cols-2" data-testid="order-strategy-specs">
        <div class="rounded-2xl border border-base-300 px-5 py-4">
          <span class="eyebrow">Strategy context</span>
          <span class="mt-2 block text-lg text-base-content">{strategyLabel(order)}</span>
          <span class="mt-1 block text-sm text-base-content/60">{formatText(order.strategy.description)}</span>
          <span class="mt-3 block font-mono-num text-xs text-base-content/50">
            {formatText(order.strategy.key)} · {formatText(order.strategy.controller)} · resolved {formatDate(order.strategy.resolvedAt)}
          </span>
        </div>
        <div class="rounded-2xl border border-base-300 px-5 py-4">
          <span class="eyebrow">Pair/spec summary</span>
          <span class="mt-2 block text-lg font-mono-num text-base-content">{formatText(order.specs.pair ?? order.pair)}</span>
          <span class="mt-1 block text-sm text-base-content/60">{specsSummary(order)}</span>
          <span class="mt-3 block text-xs text-base-content/50">
            Price source {formatText(order.specs.priceSourceType)} · amount change {formatText(order.specs.amountChangePerLayer)} {formatText(order.specs.amountChangeType)}
          </span>
        </div>
      </div>
    </Section>

    <Section title="Order balances and funding" eyebrow="Order attributed" caption="Deposited, available, locked, fees, and liquidity values are scoped by order and asset.">
      <div class="border-t border-base-300 pt-6" data-testid="order-balances">
        {#if order.balances.length === 0}
          <span class="block rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/60" data-testid="order-balances-empty">
            No order-attributed balances have been recorded yet.
          </span>
        {:else}
          <div class="grid gap-4 lg:grid-cols-2">
            {#each order.balances as balance}
              <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-balance-{balance.assetId}">
                <span class="eyebrow">{balance.assetId}</span>
                <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <span class="flex flex-col"><span class="text-base-content/50">Deposited</span><span class="font-mono-num">{formatAmount(balance.initialDeposit)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">Available</span><span class="font-mono-num">{formatAmount(balance.available)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">Locked/reserved</span><span class="font-mono-num">{formatAmount(balance.locked)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">Liquidity total</span><span class="font-mono-num">{formatAmount(balance.total)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">Fees</span><span class="font-mono-num">{formatAmount(balance.feePaid)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">Realized delta</span><span class="font-mono-num">{formatSignedAmount(balance.realizedDelta)} {balance.assetId}</span></span>
                </div>
                <span class="mt-3 block text-xs text-base-content/50">Updated {formatDate(balance.updatedAt)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </Section>

    <Section title="Deposit and withdraw" eyebrow="Funding actions" caption="Funding requests use order-scoped endpoints, idempotency keys, and latest-server-state balance refreshes.">
      <div class="border-t border-base-300 pt-6" data-testid="order-funding-actions">
        <label class="mb-5 flex max-w-sm flex-col gap-2">
          <span class="eyebrow">Wallet interaction preview</span>
          <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" bind:value={walletInteractionMode} disabled={Boolean(actionLoading)} data-testid="order-wallet-interaction-mode">
            <option value="approve">Approve wallet action</option>
            <option value="reject">Preview user rejection</option>
            <option value="timeout">Preview wallet timeout</option>
            <option value="network-mismatch">Preview network mismatch</option>
          </select>
        </label>

        <div class="grid gap-6 lg:grid-cols-2">
          <form class="rounded-2xl border border-base-300 px-5 py-4" onsubmit={(event) => { event.preventDefault(); void runFundingAction('deposit'); }} data-testid="order-deposit-form">
            <span class="eyebrow">Deposit</span>
            <span class="mt-2 block text-sm text-base-content/60">Deposit funds into this order only. Server balances refresh after success.</span>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">Asset</span>
              <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40" bind:value={depositAsset} disabled={!order.validActions.deposit || Boolean(actionLoading)} data-testid="order-deposit-asset">
                {#each supportedAssets as asset}
                  <option value={asset}>{asset}</option>
                {/each}
              </select>
            </label>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">Amount</span>
              <input class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num focus:outline-none focus:border-base-content disabled:opacity-40" inputmode="decimal" bind:value={depositAmount} disabled={!order.validActions.deposit || Boolean(actionLoading)} data-testid="order-deposit-amount" />
            </label>
            {#if attemptedDeposit && depositValidationError}
              <span class="mt-3 block text-sm text-error" data-testid="order-deposit-validation">{depositValidationError}</span>
            {/if}
            <button class="btn-pill-primary mt-5 disabled:opacity-40 disabled:cursor-not-allowed" disabled={!order.validActions.deposit || Boolean(actionLoading)} data-testid="order-deposit-submit">
              {actionLoading === 'deposit' ? 'Depositing…' : 'Deposit to order'}
            </button>
          </form>

          <form class="rounded-2xl border border-base-300 px-5 py-4" onsubmit={(event) => { event.preventDefault(); void runFundingAction('withdraw'); }} data-testid="order-withdraw-form">
            <span class="eyebrow">Withdraw</span>
            <span class="mt-2 block text-sm text-base-content/60">Withdraw only available funds. Locked/reserved balances stay protected.</span>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">Asset</span>
              <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40" bind:value={withdrawAsset} disabled={!order.validActions.withdraw || Boolean(actionLoading)} data-testid="order-withdraw-asset">
                {#each supportedAssets as asset}
                  <option value={asset}>{asset}</option>
                {/each}
              </select>
            </label>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">Amount</span>
              <input class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num focus:outline-none focus:border-base-content disabled:opacity-40" inputmode="decimal" bind:value={withdrawAmount} disabled={!order.validActions.withdraw || Boolean(actionLoading)} data-testid="order-withdraw-amount" />
            </label>
            <span class="mt-2 block text-xs text-base-content/50">
              Available {formatAmount(selectedWithdrawBalance?.available || 0)} {withdrawAsset || 'asset'}
            </span>
            {#if attemptedWithdraw && withdrawValidationError}
              <span class="mt-3 block text-sm text-error" data-testid="order-withdraw-validation">{withdrawValidationError}</span>
            {/if}
            <button class="btn-pill-primary mt-5 disabled:opacity-40 disabled:cursor-not-allowed" disabled={!order.validActions.withdraw || Boolean(actionLoading)} data-testid="order-withdraw-submit">
              {actionLoading === 'withdraw' ? 'Withdrawing…' : 'Withdraw available'}
            </button>
          </form>
        </div>
      </div>
    </Section>

    <Section title="Lifecycle controls" eyebrow="State specific" caption="Invalid lifecycle actions remain unavailable and do not submit requests.">
      <div class="flex flex-wrap gap-2 border-t border-base-300 pt-6" data-testid="order-lifecycle-actions">
        <button
          class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!order.validActions.start || Boolean(actionLoading)}
          onclick={() => void runLifecycleAction('start')}
          data-testid="order-start-action"
        >
          {actionLoading === 'start' ? 'Starting…' : 'Start order'}
        </button>
        <button
          class="btn-pill-outline disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!order.validActions.pause || Boolean(actionLoading)}
          onclick={() => void runLifecycleAction('pause')}
          data-testid="order-pause-action"
        >
          {actionLoading === 'pause' ? 'Pausing…' : 'Pause order'}
        </button>
        <button
          class="btn-pill-outline disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!order.validActions.resume || Boolean(actionLoading)}
          onclick={() => void runLifecycleAction('resume')}
          data-testid="order-resume-action"
        >
          {actionLoading === 'resume' ? 'Resuming…' : 'Resume order'}
        </button>
      </div>
    </Section>

    <Section title="PnL and performance" eyebrow="Metrics" caption="Profit, PnL, fees, realized deltas, snapshots, counts, and timestamps are rendered from server-exposed fields when available.">
      <div class="grid gap-4 border-t border-base-300 pt-6 lg:grid-cols-3" data-testid="order-performance">
        {#each Object.entries(order.performance.pnlByAsset || {}) as [asset, value]}
          <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-pnl-{asset}">
            <span class="eyebrow">PnL {asset}</span>
            <span class="mt-2 block font-mono-num text-2xl">{formatSignedAmount(value)} {asset}</span>
            <span class="mt-2 block text-xs text-base-content/50">
              Realized {formatSignedAmount(order.performance.realizedDeltaByAsset?.[asset] || 0)} · fees {formatAmount(order.performance.feePaidByAsset?.[asset] || 0)}
            </span>
          </div>
        {/each}
        {#if Object.keys(order.performance.pnlByAsset || {}).length === 0}
          <span class="rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/60" data-testid="order-pnl-empty">PnL unavailable until order balances or fills are recorded.</span>
        {/if}
      </div>
      <div class="mt-6 border-t border-base-300" data-testid="order-performance-snapshots">
        {#if order.performance.snapshots.length === 0}
          <span class="block py-4 text-sm text-base-content/60">No performance snapshots are available yet.</span>
        {:else}
          {#each order.performance.snapshots as snapshot}
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 py-4" data-testid="order-performance-snapshot">
              <div class="flex flex-col">
                <span class="font-medium text-base-content">{formatText(snapshot.strategyType)}</span>
                <span class="mt-1 font-mono-num text-sm text-base-content/70">Profit/Loss {formatSignedAmount(snapshot.profitLoss)}</span>
              </div>
              <span class="font-mono-num text-xs text-base-content/50">{formatDate(snapshot.executedAt)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </Section>

    <Section title="Execution timeline" eyebrow="Order events" caption="Chronological order-attributed events are loaded from the API, including deposits, withdrawals, fills, placements, failures, cancellations, and lifecycle records when exposed.">
      <div class="border-t border-base-300" data-testid="order-event-timeline">
        {#if orderedEvents.length === 0}
          <span class="block py-6 text-sm text-base-content/60" data-testid="order-event-empty">No order events have been recorded yet.</span>
        {:else}
          {#each orderedEvents as event}
            <div class="flex items-start gap-4 border-b border-base-300 py-4" data-testid="order-event-row">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"></span>
            <div class="flex flex-1 flex-wrap items-baseline justify-between gap-2">
              <div class="flex flex-col">
                <span class="font-medium text-base-content capitalize">{eventLabel(event)}</span>
                <span class="text-xs text-base-content/55">{eventSummary(event)}</span>
              </div>
              <span class="font-mono-num text-xs text-base-content/50">{formatDate(event.timestamp)}</span>
            </div>
          </div>
          {/each}
        {/if}
      </div>
    </Section>
  {/if}
</div>

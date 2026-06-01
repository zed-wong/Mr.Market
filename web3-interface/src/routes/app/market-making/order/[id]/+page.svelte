<script lang="ts">
  import { page } from '$app/stores';
  import BigNumber from 'bignumber.js';
  import { _ } from 'svelte-i18n';
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
    openNetworkModal,
    openWalletModal,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletShortAddress,
  } from '$lib/stores/wallet';
  import { isAuthed } from '$lib/stores/auth';
  import type {
    Web3MarketMakingMutationResponse,
    Web3MarketMakingOrderDetail,
    Web3MarketMakingOrderEvent,
  } from '$lib/types/market-making';

  type LifecycleAction = 'start' | 'pause' | 'resume';
  type FundingAction = 'deposit' | 'withdraw';

  let order = $state<Web3MarketMakingOrderDetail | null>(null);
  let detailNamespace = $state('/web3/market-making');
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

  const orderId = $derived($page.params.id);
  const canLoadDetail = $derived($walletIsConnected && $isAuthed && !$walletIsUnsupported && Boolean(orderId));
  const supportedAssets = $derived(order ? supportedAssetsForOrder(order) : []);
  const orderedEvents = $derived(order ? [...order.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) : []);
  const selectedWithdrawBalance = $derived(
    order?.balances.find((balance) => normalize(balance.assetId) === normalize(withdrawAsset)) ?? null
  );
  const depositValidationError = $derived(validateMoneyMovement(depositAsset, depositAmount, 'deposit'));
  const withdrawValidationError = $derived(validateMoneyMovement(withdrawAsset, withdrawAmount, 'withdraw'));
  const spreadCaptureRows = $derived(order ? spreadCaptureMetrics(order) : []);

  const normalize = (value: string | null | undefined): string => String(value || '').trim().toLowerCase();

  const formatState = (value: string | null | undefined): string =>
    value ? value.replace(/[_-]+/g, ' ') : $_('market_making_detail_unknown');

  const formatText = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === '') return $_('market_making_detail_unavailable');
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

  const formatMetricLabel = (key: string): string =>
    key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/^./, (letter) => letter.toUpperCase()) || $_('market_making_detail_metric');

  const formatAdditionalMetricValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return $_('market_making_detail_unavailable');
    if (typeof value === 'boolean') return value ? $_('market_making_detail_yes') : $_('market_making_detail_no');
    if (typeof value === 'number' || typeof value === 'bigint') {
      const amount = new BigNumber(String(value));
      if (!amount.isFinite()) return String(value);
      return amount.toFormat(amount.isInteger() ? 0 : Math.min(6, amount.decimalPlaces() ?? 6));
    }
    if (typeof value === 'string') {
      const amount = new BigNumber(value);
      if (amount.isFinite()) {
        return amount.toFormat(amount.isInteger() ? 0 : Math.min(6, amount.decimalPlaces() ?? 6));
      }
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const formatDate = (value: string | null | undefined): string => {
    if (!value) return $_('market_making_detail_unavailable');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const compactOrderId = (value: string): string =>
    value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;

  const strategyLabel = (detail: Web3MarketMakingOrderDetail): string =>
    detail.strategy?.name || detail.strategy?.key || detail.strategy?.controller || $_('market_making_detail_strategy_unavailable');

  const specsSummary = (detail: Web3MarketMakingOrderDetail): string => {
    const specs = detail.specs;
    const parts = [
      specs.exchangeName ? `${$_('market_making_detail_exchange')} ${specs.exchangeName}` : null,
      specs.bidSpread ? `${$_('market_making_detail_bid_spread')} ${formatAmount(specs.bidSpread)}` : null,
      specs.askSpread ? `${$_('market_making_detail_ask_spread')} ${formatAmount(specs.askSpread)}` : null,
      specs.orderAmount ? `${$_('market_making_detail_order_amount')} ${formatAmount(specs.orderAmount)}` : null,
      specs.numberOfLayers ? `${specs.numberOfLayers} ${$_('market_making_detail_layers')}` : null,
      specs.orderRefreshTime ? `${$_('market_making_detail_refresh')} ${specs.orderRefreshTime}s` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : $_('market_making_detail_specs_unavailable');
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
      event.refType ? `${$_('market_making_detail_source')} ${event.refType}` : null,
      event.refId ? `${$_('market_making_detail_reference')} ${event.refId}` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : $_('market_making_detail_order_attributed_event');
  };

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return $_('market_making_detail_error_load_fallback');
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

  function spreadCaptureMetrics(detail: Web3MarketMakingOrderDetail): { label: string; value: string }[] {
    const rows: { label: string; value: string }[] = [];
    const snapshots = detail.performance.snapshots || [];
    const latestSnapshot = snapshots[snapshots.length - 1] ?? null;
    const metrics = latestSnapshot?.additionalMetrics || {};
    const spreadKeys = Object.keys(metrics).filter((key) => /spread|capture/i.test(key));

    for (const key of spreadKeys) {
      rows.push({ label: formatMetricLabel(key), value: formatAdditionalMetricValue(metrics[key]) });
    }

    if (detail.specs.bidSpread) {
      rows.push({ label: $_('market_making_detail_bid_spread'), value: formatAmount(detail.specs.bidSpread) });
    }
    if (detail.specs.askSpread) {
      rows.push({ label: $_('market_making_detail_ask_spread'), value: formatAmount(detail.specs.askSpread) });
    }

    return rows;
  }

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
        throw new Error($_('market_making_detail_error_namespace'));
      }
      applyDetailResponse(response);
    } catch (error) {
      if (sequence !== loadSequence) return;
      order = null;
      isNotFound = error instanceof ApiError && error.status === 404;
      detailError = isNotFound
        ? null
        : error instanceof ApiError && error.status === 401
          ? $_('market_making_detail_error_authenticate')
          : errorMessage(error);
    } finally {
      if (sequence === loadSequence) {
        isLoading = false;
      }
    }
  };

  function validateMoneyMovement(asset: string, amountValue: string, action: FundingAction): string | null {
    const actionLabel = action === 'deposit' ? $_('market_making_detail_deposit') : $_('market_making_detail_withdraw');
    if (!order) return $_('market_making_detail_validation_load_required');
    if (!order.validActions[action]) {
      return $_('market_making_detail_validation_action_unavailable', { values: { action: actionLabel } });
    }
    if (!asset) return $_('market_making_detail_validation_asset_required');
    if (!supportedAssets.some((item) => normalize(item) === normalize(asset))) {
      return $_('market_making_detail_validation_asset_unsupported', { values: { asset } });
    }
    if (!amountValue.trim()) return $_('market_making_detail_validation_amount_required');

    const amount = new BigNumber(amountValue);
    if (!amount.isFinite() || amount.isNaN()) return $_('market_making_detail_validation_amount_numeric');
    if (amount.isLessThanOrEqualTo(0)) return $_('market_making_detail_validation_amount_positive');

    if (action === 'withdraw') {
      const available = new BigNumber(selectedWithdrawBalance?.available || 0);
      if (amount.isGreaterThan(available)) {
        return $_('market_making_detail_validation_withdraw_available', {
          values: { asset, amount: formatAmount(available) },
        });
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
      actionMessage = $_('market_making_detail_action_funding_success', {
        values: { action: action === 'deposit' ? $_('market_making_detail_deposit') : $_('market_making_detail_withdraw') },
      });
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
      actionMessage = $_('market_making_detail_action_lifecycle_success', {
        values: { action: $_(`market_making_detail_${action}`) },
      });
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
      <span class="eyebrow">{$_('market_making_detail_wallet_scoped')}</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">{$_('market_making_detail_connect_title')}</span>
      <span class="mt-4 block text-base-content/60">
        {$_('market_making_detail_connect_message')}
      </span>
      <button class="btn-pill-primary mt-6" onclick={openWalletModal} data-testid="order-detail-connect-action">{$_('connect_wallet')}</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="pt-2 max-w-xl" data-testid="order-detail-unsupported-gate">
      <span class="eyebrow">{$_('market_making_detail_network')}</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">{$_('market_making_detail_unsupported_title')}</span>
      <span class="mt-4 block text-base-content/60">
        {$_('market_making_detail_unsupported_message')}
      </span>
      <button class="btn-pill-primary mt-6" onclick={openNetworkModal} data-testid="order-detail-switch-network">{$_('switch_network')}</button>
    </section>
  {:else if isLoading}
    <section class="pt-2 max-w-xl" data-testid="order-loading-state">
      <span class="eyebrow">{$_('market_making_detail_loading_eyebrow')}</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">{$_('market_making_detail_loading_title')}</span>
      <span class="mt-4 flex items-center gap-3 text-sm text-base-content/60">
        <span class="loading loading-spinner loading-sm"></span>
        {$_('market_making_detail_loading_message')}
      </span>
    </section>
  {:else if detailError}
    <section class="pt-2 max-w-xl" data-testid="order-error-state">
      <span class="eyebrow">{$_('market_making_detail_recovery')}</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">{$_('market_making_detail_error_title')}</span>
      <span class="mt-4 block text-base-content/60">
        {detailError}
      </span>
      <button class="btn-pill-primary mt-6" onclick={() => void loadOrderDetail()} data-testid="order-detail-retry">{$_('market_making_detail_retry')}</button>
    </section>
  {:else if isNotFound || !order}
    <section class="pt-2 max-w-xl" data-testid="order-not-found">
      <span class="eyebrow">{$_('market_making_detail_not_found_eyebrow')}</span>
      <span class="mt-3 block font-display text-4xl tracking-tight text-base-content">{$_('market_making_detail_not_found_title')}</span>
      <span class="mt-4 block text-base-content/60">
        {$_('market_making_detail_not_found_message')}
      </span>
      <a class="btn-pill-primary mt-6 inline-flex" href="/app/market-making">{$_('market_making_detail_my_orders')}</a>
    </section>
  {:else}
    <section class="pt-2">
      <span class="eyebrow capitalize">{formatState(order.state)}</span>
      <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content font-mono-num">{$_('market_making_detail_order_prefix')} {compactOrderId(order.orderId)}</span>
      <span class="mt-4 block text-base-content/60">
        <span class="font-mono-num">{order.orderId}</span> · {detailNamespace} · {$walletNamespaceLabel} · <span class="font-mono-num">{$walletShortAddress}</span>
      </span>

      <section class="mt-8 grid gap-4 rounded-2xl border border-base-300 px-5 py-4 lg:grid-cols-[1fr_auto]" data-testid="order-detail-top-controls">
        <div class="flex flex-col gap-2">
          <span class="eyebrow">{$_('market_making_detail_lifecycle_status')}</span>
          <span class="text-2xl capitalize text-base-content">{formatState(order.state)}</span>
          <span class="text-sm text-base-content/60">{$_('market_making_detail_actions_recalculated')}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!order.validActions.start || Boolean(actionLoading)}
            onclick={() => void runLifecycleAction('start')}
            data-testid="order-start-action"
          >
            {actionLoading === 'start' ? $_('market_making_detail_starting') : $_('market_making_detail_start_order')}
          </button>
          <button
            class="btn-pill-outline disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!order.validActions.pause || Boolean(actionLoading)}
            onclick={() => void runLifecycleAction('pause')}
            data-testid="order-pause-action"
          >
            {actionLoading === 'pause' ? $_('market_making_detail_pausing') : $_('market_making_detail_pause_order')}
          </button>
          <button
            class="btn-pill-outline disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!order.validActions.resume || Boolean(actionLoading)}
            onclick={() => void runLifecycleAction('resume')}
            data-testid="order-resume-action"
          >
            {actionLoading === 'resume' ? $_('market_making_detail_resuming') : $_('market_making_detail_resume_order')}
          </button>
          <button class="btn-pill-outline" onclick={() => void loadOrderDetail()} disabled={isLoading || Boolean(actionLoading)} data-testid="order-detail-refresh">
            {$_('market_making_detail_refresh_order')}
          </button>
        </div>
      </section>

      {#if actionError}
        <section class="mt-6 rounded-2xl border border-error/40 px-5 py-4" aria-live="polite" data-testid="order-action-error">
          <span class="block font-medium text-error">{$_('market_making_detail_action_failed')}</span>
          <span class="mt-1 block text-sm text-base-content/70">{actionError}</span>
        </section>
      {/if}

      {#if actionMessage}
        <section class="mt-6 rounded-2xl border border-success/40 px-5 py-4" aria-live="polite" data-testid="order-action-success">
          <span class="block font-medium text-success">{$_('market_making_detail_action_updated')}</span>
          <span class="mt-1 block text-sm text-base-content/70">{actionMessage}</span>
        </section>
      {/if}

      <div class="mt-8 grid gap-px bg-base-300 border border-base-300 rounded-2xl overflow-hidden md:grid-cols-2 lg:grid-cols-4" data-testid="order-detail-summary">
        <div class="bg-base-100 p-5">
          <span class="eyebrow">{$_('market_making_detail_lifecycle_status')}</span>
          <span class="mt-2 block text-xl capitalize">{formatState(order.state)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">{$_('market_making_detail_pair')}</span>
          <span class="mt-2 block font-mono-num text-xl">{formatText(order.pair ?? order.specs.pair)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">{$_('market_making_detail_strategy')}</span>
          <span class="mt-2 block text-xl">{strategyLabel(order)}</span>
        </div>
        <div class="bg-base-100 p-5">
          <span class="eyebrow">{$_('market_making_detail_created')}</span>
          <span class="mt-2 block font-mono-num text-sm">{formatDate(order.createdAt)}</span>
        </div>
      </div>
    </section>

    <Section title={$_('market_making_detail_specs_title')} eyebrow={$_('market_making_detail_server_detail')} caption={$_('market_making_detail_specs_caption')}>
      <div class="grid gap-5 border-t border-base-300 pt-6 lg:grid-cols-2" data-testid="order-strategy-specs">
        <div class="rounded-2xl border border-base-300 px-5 py-4">
          <span class="eyebrow">{$_('market_making_detail_strategy_context')}</span>
          <span class="mt-2 block text-lg text-base-content">{strategyLabel(order)}</span>
          <span class="mt-1 block text-sm text-base-content/60">{formatText(order.strategy.description)}</span>
          <span class="mt-3 block font-mono-num text-xs text-base-content/50">
            {formatText(order.strategy.key)} · {formatText(order.strategy.controller)} · {$_('market_making_detail_resolved')} {formatDate(order.strategy.resolvedAt)}
          </span>
        </div>
        <div class="rounded-2xl border border-base-300 px-5 py-4">
          <span class="eyebrow">{$_('market_making_detail_pair_spec_summary')}</span>
          <span class="mt-2 block text-lg font-mono-num text-base-content">{formatText(order.specs.pair ?? order.pair)}</span>
          <span class="mt-1 block text-sm text-base-content/60">{specsSummary(order)}</span>
          <span class="mt-3 block text-xs text-base-content/50">
            {$_('market_making_detail_price_source')} {formatText(order.specs.priceSourceType)} · {$_('market_making_detail_amount_change')} {formatText(order.specs.amountChangePerLayer)} {formatText(order.specs.amountChangeType)}
          </span>
        </div>
      </div>
    </Section>

    <Section title={$_('market_making_detail_balances_title')} eyebrow={$_('market_making_detail_order_attributed')} caption={$_('market_making_detail_balances_caption')}>
      <div class="border-t border-base-300 pt-6" data-testid="order-balances">
        {#if order.balances.length === 0}
          <span class="block rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/60" data-testid="order-balances-empty">
            {$_('market_making_detail_balances_empty')}
          </span>
        {:else}
          <div class="grid gap-4 lg:grid-cols-2">
            {#each order.balances as balance}
              <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-balance-{balance.assetId}">
                <span class="eyebrow">{balance.assetId}</span>
                <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <span class="flex flex-col"><span class="text-base-content/50">{$_('market_making_detail_deposited')}</span><span class="font-mono-num">{formatAmount(balance.initialDeposit)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">{$_('market_making_detail_available')}</span><span class="font-mono-num">{formatAmount(balance.available)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">{$_('market_making_detail_locked_reserved')}</span><span class="font-mono-num">{formatAmount(balance.locked)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">{$_('market_making_detail_liquidity_total')}</span><span class="font-mono-num">{formatAmount(balance.total)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">{$_('market_making_detail_fees')}</span><span class="font-mono-num">{formatAmount(balance.feePaid)} {balance.assetId}</span></span>
                  <span class="flex flex-col"><span class="text-base-content/50">{$_('market_making_detail_realized_delta')}</span><span class="font-mono-num">{formatSignedAmount(balance.realizedDelta)} {balance.assetId}</span></span>
                </div>
                <span class="mt-3 block text-xs text-base-content/50">{$_('market_making_detail_updated')} {formatDate(balance.updatedAt)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </Section>

    <Section title={$_('market_making_detail_funding_title')} eyebrow={$_('market_making_detail_funding_actions')} caption={$_('market_making_detail_funding_caption')}>
      <div class="border-t border-base-300 pt-6" data-testid="order-funding-actions">
        <div class="grid gap-6 lg:grid-cols-2">
          <form class="rounded-2xl border border-base-300 px-5 py-4" onsubmit={(event) => { event.preventDefault(); void runFundingAction('deposit'); }} data-testid="order-deposit-form">
            <span class="eyebrow">{$_('market_making_detail_deposit')}</span>
            <span class="mt-2 block text-sm text-base-content/60">{$_('market_making_detail_deposit_hint')}</span>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">{$_('market_making_detail_asset')}</span>
              <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40" bind:value={depositAsset} disabled={!order.validActions.deposit || Boolean(actionLoading)} data-testid="order-deposit-asset">
                {#each supportedAssets as asset}
                  <option value={asset}>{asset}</option>
                {/each}
              </select>
            </label>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">{$_('market_making_detail_amount')}</span>
              <input class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num focus:outline-none focus:border-base-content disabled:opacity-40" inputmode="decimal" bind:value={depositAmount} disabled={!order.validActions.deposit || Boolean(actionLoading)} data-testid="order-deposit-amount" />
            </label>
            {#if attemptedDeposit && depositValidationError}
              <span class="mt-3 block text-sm text-error" data-testid="order-deposit-validation">{depositValidationError}</span>
            {/if}
            <button class="btn-pill-primary mt-5 disabled:opacity-40 disabled:cursor-not-allowed" disabled={!order.validActions.deposit || Boolean(actionLoading)} data-testid="order-deposit-submit">
              {actionLoading === 'deposit' ? $_('market_making_detail_depositing') : $_('market_making_detail_deposit_to_order')}
            </button>
          </form>

          <form class="rounded-2xl border border-base-300 px-5 py-4" onsubmit={(event) => { event.preventDefault(); void runFundingAction('withdraw'); }} data-testid="order-withdraw-form">
            <span class="eyebrow">{$_('market_making_detail_withdraw')}</span>
            <span class="mt-2 block text-sm text-base-content/60">{$_('market_making_detail_withdraw_hint')}</span>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">{$_('market_making_detail_asset')}</span>
              <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40" bind:value={withdrawAsset} disabled={!order.validActions.withdraw || Boolean(actionLoading)} data-testid="order-withdraw-asset">
                {#each supportedAssets as asset}
                  <option value={asset}>{asset}</option>
                {/each}
              </select>
            </label>
            <label class="mt-4 flex flex-col gap-2">
              <span class="text-xs text-base-content/50">{$_('market_making_detail_amount')}</span>
              <input class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num focus:outline-none focus:border-base-content disabled:opacity-40" inputmode="decimal" bind:value={withdrawAmount} disabled={!order.validActions.withdraw || Boolean(actionLoading)} data-testid="order-withdraw-amount" />
            </label>
            <span class="mt-2 block text-xs text-base-content/50">
              {$_('market_making_detail_available')} {formatAmount(selectedWithdrawBalance?.available || 0)} {withdrawAsset || $_('market_making_detail_asset')}
            </span>
            {#if attemptedWithdraw && withdrawValidationError}
              <span class="mt-3 block text-sm text-error" data-testid="order-withdraw-validation">{withdrawValidationError}</span>
            {/if}
            <button class="btn-pill-primary mt-5 disabled:opacity-40 disabled:cursor-not-allowed" disabled={!order.validActions.withdraw || Boolean(actionLoading)} data-testid="order-withdraw-submit">
              {actionLoading === 'withdraw' ? $_('market_making_detail_withdrawing') : $_('market_making_detail_withdraw_available')}
            </button>
          </form>
        </div>
      </div>
    </Section>

    <Section title={$_('market_making_detail_performance_title')} eyebrow={$_('market_making_detail_metrics')} caption={$_('market_making_detail_performance_caption')}>
      <div class="grid gap-4 border-t border-base-300 pt-6 lg:grid-cols-3" data-testid="order-performance">
        {#each Object.entries(order.performance.pnlByAsset || {}) as [asset, value]}
          <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-pnl-{asset}">
            <span class="eyebrow">{$_('market_making_detail_pnl')} {asset}</span>
            <span class="mt-2 block font-mono-num text-2xl">{formatSignedAmount(value)} {asset}</span>
            <span class="mt-2 block text-xs text-base-content/50">
              {$_('market_making_detail_realized')} {formatSignedAmount(order.performance.realizedDeltaByAsset?.[asset] || 0)} · {$_('market_making_detail_fees')} {formatAmount(order.performance.feePaidByAsset?.[asset] || 0)}
            </span>
          </div>
        {/each}
        <div class="rounded-2xl border border-base-300 px-5 py-4" data-testid="order-spread-capture">
          <span class="eyebrow">{$_('market_making_detail_spread_capture')}</span>
          {#if spreadCaptureRows.length === 0}
            <span class="mt-2 block text-sm text-base-content/60">{$_('market_making_detail_spread_capture_empty')}</span>
          {:else}
            <div class="mt-3 grid gap-2 text-sm">
              {#each spreadCaptureRows as row}
                <span class="flex items-center justify-between gap-3">
                  <span class="text-base-content/55">{row.label}</span>
                  <span class="font-mono-num text-base-content">{row.value}</span>
                </span>
              {/each}
            </div>
          {/if}
        </div>
        {#if Object.keys(order.performance.pnlByAsset || {}).length === 0}
          <span class="rounded-2xl border border-base-300 px-5 py-4 text-sm text-base-content/60" data-testid="order-pnl-empty">{$_('market_making_detail_pnl_empty')}</span>
        {/if}
      </div>
      <div class="mt-6 border-t border-base-300" data-testid="order-performance-snapshots">
        {#if order.performance.snapshots.length === 0}
          <span class="block py-4 text-sm text-base-content/60">{$_('market_making_detail_snapshots_empty')}</span>
        {:else}
          {#each order.performance.snapshots as snapshot}
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 py-4" data-testid="order-performance-snapshot">
              <div class="flex flex-col">
                <span class="font-medium text-base-content">{formatText(snapshot.strategyType)}</span>
                <span class="mt-1 font-mono-num text-sm text-base-content/70">{$_('market_making_detail_profit_loss')} {formatSignedAmount(snapshot.profitLoss)}</span>
                {#if Object.entries(snapshot.additionalMetrics || {}).length > 0}
                  <div class="mt-3 grid gap-2 sm:grid-cols-2" data-testid="order-performance-additional-metrics">
                    {#each Object.entries(snapshot.additionalMetrics || {}) as [key, value]}
                      <span class="flex flex-col rounded-2xl border border-base-300 px-3 py-2" data-testid="order-performance-metric-{key}">
                        <span class="text-xs text-base-content/50">{formatMetricLabel(key)}</span>
                        <span class="font-mono-num text-sm text-base-content">{formatAdditionalMetricValue(value)}</span>
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
              <span class="font-mono-num text-xs text-base-content/50">{formatDate(snapshot.executedAt)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </Section>

    <Section title={$_('market_making_detail_events_title')} eyebrow={$_('market_making_detail_order_events')} caption={$_('market_making_detail_events_caption')}>
      <div class="border-t border-base-300" data-testid="order-event-timeline">
        {#if orderedEvents.length === 0}
          <span class="block py-6 text-sm text-base-content/60" data-testid="order-event-empty">{$_('market_making_detail_events_empty')}</span>
        {:else}
          {#each orderedEvents as event}
            <div class="flex items-start gap-4 border-b border-base-300 py-4" data-testid="order-event-row">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-base-content"></span>
            <div class="flex flex-1 flex-wrap items-baseline justify-between gap-2">
              <div class="flex flex-col">
                <span class="font-medium text-base-content capitalize">{eventLabel(event)}</span>
                <span class="text-xs text-base-content/55">{eventSummary(event)}</span>
                {#if event.metadata && Object.keys(event.metadata).length > 0}
                  <span class="mt-1 font-mono-num text-xs text-base-content/45" data-testid="order-event-metadata">
                    {JSON.stringify(event.metadata)}
                  </span>
                {/if}
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

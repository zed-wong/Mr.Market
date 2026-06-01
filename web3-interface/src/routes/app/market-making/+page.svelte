<script lang="ts">
  import { page } from '$app/state';
  import BigNumber from 'bignumber.js';
  import { _ } from 'svelte-i18n';
  import {
    listMarketMakingOrders,
    pauseMarketMakingOrder,
    resumeMarketMakingOrder,
    startMarketMakingOrder,
  } from '$lib/helpers/api/web3';
  import { validationOrderListFixtureForState } from '$lib/helpers/market-making/validation-order-list-fixtures';
  import { authMatchesWalletScope } from '$lib/helpers/market-making/wallet-scope';
  import {
    openNetworkModal,
    openWalletModal,
    walletAccount,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespace,
    walletNamespaceLabel,
    walletShortAddress,
  } from '$lib/stores/wallet';
  import { authState, hasUsableAuthSession } from '$lib/stores/auth';
  import type {
    Web3MarketMakingMutationResponse,
    Web3MarketMakingOrderSummary,
  } from '$lib/types/market-making';

  type StatusFilter = 'all' | 'active' | 'paused' | 'errored';
  type StatusTone = 'success' | 'warning' | 'error' | 'muted';
  type LifecycleAction = 'start' | 'pause' | 'resume';

  let orders = $state<Web3MarketMakingOrderSummary[]>([]);
  let isLoading = $state(false);
  let listError = $state<string | null>(null);
  let loadSequence = 0;

  let statusFilter = $state<StatusFilter>('all');
  let searchTerm = $state('');
  let actionInFlight = $state<string | null>(null); // orderId-action
  let actionError = $state<string | null>(null);

  const formatState = (state: string | null | undefined): string =>
    state ? state.replace(/[_-]+/g, ' ') : 'unknown';

  const formatAmount = (value: BigNumber.Value | null | undefined, maxFrac = 4): string => {
    if (value === null || value === undefined || value === '') return '0';
    const amount = new BigNumber(value);
    if (!amount.isFinite()) return String(value);
    const dp = Math.min(amount.decimalPlaces() ?? 0, maxFrac);
    return amount.toFormat(amount.isInteger() ? 0 : dp);
  };

  const formatSigned = (value: BigNumber.Value): string => {
    const amount = new BigNumber(value);
    if (!amount.isFinite()) return String(value);
    const dp = Math.min(amount.decimalPlaces() ?? 0, 4);
    const formatted = amount.toFormat(amount.isInteger() ? 0 : dp);
    return amount.isGreaterThan(0) ? `+${formatted}` : formatted;
  };

  const formatPercent = (value: BigNumber.Value): string => {
    const amount = new BigNumber(value);
    if (!amount.isFinite()) return '—';
    const sign = amount.isGreaterThan(0) ? '+' : '';
    return `${sign}${amount.toFormat(2)}%`;
  };

  const formatRelativeDate = (value: string | null | undefined): string => {
    if (!value) return $_('market_making_list_unknown');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return $_('market_making_list_just_now');
    if (diffMin < 60) return `${diffMin}${$_('market_making_list_minutes_ago_suffix')}`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}${$_('market_making_list_hours_ago_suffix')}`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return `${diffDay}${$_('market_making_list_days_ago_suffix')}`;
    return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  };

  const formatAbsoluteDate = (value: string | null | undefined): string => {
    if (!value) return $_('market_making_list_unknown');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const compactOrderId = (orderId: string): string =>
    orderId.length > 14 ? `${orderId.slice(0, 6)}…${orderId.slice(-4)}` : orderId;

  const orderDetailHref = (orderId: string): string =>
    `/app/market-making/order/${encodeURIComponent(orderId)}`;

  const strategyLabel = (order: Web3MarketMakingOrderSummary): string =>
    order.strategy?.name ||
    order.strategy?.key ||
    order.strategy?.controller ||
    $_('market_making_list_strategy_fallback');

  const exchangeLabel = (order: Web3MarketMakingOrderSummary): string =>
    order.exchangeName ?? order.specs?.exchangeName ?? $_('market_making_list_exchange_fallback');

  const pairLabel = (order: Web3MarketMakingOrderSummary): string =>
    order.pair ?? order.specs?.pair ?? $_('market_making_list_pair_fallback');

  const statusTone = (order: Web3MarketMakingOrderSummary): StatusTone => {
    if (order.lifecycleError) return 'error';
    const s = (order.state || '').toLowerCase();
    if (s.includes('active') || s.includes('running') || s.includes('started')) return 'success';
    if (s.includes('paus')) return 'warning';
    if (s.includes('error') || s.includes('fail') || s.includes('cancel')) return 'error';
    return 'muted';
  };

  const toneDot: Record<StatusTone, string> = {
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
    muted: 'bg-base-content/30',
  };

  const tonePnl = (value: BigNumber): string =>
    value.isGreaterThan(0)
      ? 'text-success'
      : value.isLessThan(0)
        ? 'text-error'
        : 'text-base-content/70';

  const orderFinancials = (order: Web3MarketMakingOrderSummary) => {
    const assets = new Set([
      ...Object.keys(order.performance?.pnlByAsset || {}),
      ...Object.keys(order.performance?.feePaidByAsset || {}),
    ]);
    if (assets.size === 0) return [];
    return Array.from(assets).map((asset) => {
      const value = order.performance?.pnlByAsset?.[asset] || '0';
      const pnl = new BigNumber(value || 0);
      const fees = new BigNumber(order.performance?.feePaidByAsset?.[asset] || 0);
      const deposit = new BigNumber(
        order.balances.find((b) => b.assetId === asset)?.initialDeposit || 0
      );
      const pct = deposit.isGreaterThan(0) ? pnl.dividedBy(deposit).multipliedBy(100) : null;
      return { asset, pnl, fees, pct };
    });
  };

  const orderLockedFunds = (order: Web3MarketMakingOrderSummary) =>
    order.balances.map((balance) => ({
      asset: balance.assetId,
      available: new BigNumber(balance.available || 0),
      locked: new BigNumber(balance.locked || 0),
      total: new BigNumber(balance.total || 0),
    }));

  const lockedPercent = (total: BigNumber.Value, locked: BigNumber.Value): string => {
    const t = new BigNumber(total);
    const l = new BigNumber(locked);
    if (!t.isFinite() || t.isZero()) return '0%';
    return `${l.dividedBy(t).multipliedBy(100).toFormat(0)}%`;
  };

  const specsChips = (order: Web3MarketMakingOrderSummary): string[] => {
    const s = order.specs;
    return [
      s?.bidSpread ? `${$_('market_making_list_bid')} ${s.bidSpread}` : null,
      s?.askSpread ? `${$_('market_making_list_ask')} ${s.askSpread}` : null,
      s?.numberOfLayers ? `${s.numberOfLayers} ${$_('market_making_list_layers')}` : null,
      s?.orderRefreshTime ? `${s.orderRefreshTime}s ${$_('market_making_list_refresh_interval')}` : null,
      s?.orderAmount ? `${$_('market_making_list_amount')} ${s.orderAmount}` : null,
    ].filter((x): x is string => Boolean(x));
  };

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return $_('market_making_list_load_error_fallback');
  };

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
  const hasActiveOrderScope = $derived(
    $walletIsConnected &&
      !$walletIsUnsupported &&
      Boolean($walletAccount?.id) &&
      Boolean($walletNamespace) &&
      authMatchesActiveWallet
  );
  const validationListState = $derived(page.url.searchParams.get('validationListState') || '');
  const validationLoadingRequested = $derived(
    validationListState === 'loading' || page.url.searchParams.get('validationLoading') === '1'
  );

  type GateMode = 'connected' | 'connect' | 'unsupported' | 'sign-in';
  const gateMode = $derived<GateMode>(
    !$walletIsConnected && !$walletIsUnsupported
      ? 'connect'
      : $walletIsUnsupported
        ? 'unsupported'
        : !hasActiveOrderScope
          ? 'sign-in'
          : 'connected'
  );
  const createOrderHref = $derived(
    hasActiveOrderScope
      ? '/app/market-making/order/new'
      : `/app/login?next=${encodeURIComponent('/app/market-making/order/new')}`
  );

  const filteredOrders = $derived.by(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
      const tone = statusTone(order);
      if (statusFilter === 'active' && tone !== 'success') return false;
      if (statusFilter === 'paused' && tone !== 'warning') return false;
      if (statusFilter === 'errored' && tone !== 'error') return false;
      if (!term) return true;
      const haystack = [
        order.orderId,
        order.pair ?? '',
        order.specs?.pair ?? '',
        order.exchangeName ?? '',
        order.specs?.exchangeName ?? '',
        order.strategy?.name ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  });

  const counts = $derived({
    all: orders.length,
    active: orders.filter((o) => statusTone(o) === 'success').length,
    paused: orders.filter((o) => statusTone(o) === 'warning').length,
    errored: orders.filter((o) => statusTone(o) === 'error').length,
  });

  const useRichOrderCards = $derived(filteredOrders.length <= 4);

  const loadOrders = async () => {
    const sequence = ++loadSequence;
    isLoading = true;
    listError = null;
    orders = [];

    try {
      const validationFixture = validationOrderListFixtureForState(validationListState);
      if (validationFixture) {
        if (sequence !== loadSequence) return;
        orders = validationFixture.orders.filter((order) => order.source === 'web3_market_making_order');
        return;
      }

      const response = await listMarketMakingOrders();
      if (sequence !== loadSequence) return;
      orders = response.orders.filter((order) => order.source === 'web3_market_making_order');
    } catch (error) {
      if (sequence !== loadSequence) return;
      orders = [];
      listError = errorMessage(error);
    } finally {
      if (sequence === loadSequence) {
        isLoading = false;
      }
    }
  };

  const runLifecycle = async (orderId: string, action: LifecycleAction) => {
    actionError = null;
    actionInFlight = `${orderId}-${action}`;
    try {
      let response: Web3MarketMakingMutationResponse;
      if (action === 'start') response = await startMarketMakingOrder(orderId);
      else if (action === 'pause') response = await pauseMarketMakingOrder(orderId);
      else response = await resumeMarketMakingOrder(orderId);
      const updated = response.order;
      orders = orders.map((o) => (o.orderId === orderId ? { ...updated, source: 'web3_market_making_order' } : o));
    } catch (error) {
      actionError = errorMessage(error);
    } finally {
      actionInFlight = null;
    }
  };

  $effect(() => {
    if (!hasActiveOrderScope) {
      loadSequence += 1;
      orders = [];
      listError = null;
      isLoading = false;
      return;
    }

    if (validationLoadingRequested) {
      loadSequence += 1;
      orders = [];
      listError = null;
      isLoading = true;
      return;
    }

    void loadOrders();
  });

  const filterTabs: { key: StatusFilter; labelKey: string }[] = [
    { key: 'all', labelKey: 'market_making_list_filter_all' },
    { key: 'active', labelKey: 'market_making_list_filter_active' },
    { key: 'paused', labelKey: 'market_making_list_filter_paused' },
    { key: 'errored', labelKey: 'market_making_list_filter_errored' },
  ];
</script>

<div data-testid="web3-market-making" class="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
  <!-- Hero -->
  <section class="flex flex-wrap items-end justify-between gap-6 pt-8">
    <div class="flex max-w-2xl flex-col">
      <span class="eyebrow">{$_('market_making_list_eyebrow')}</span>
      <span class="mt-3 font-display text-4xl tracking-tight text-base-content md:text-5xl lg:text-6xl">
        {$_('market_making_list_title')}
      </span>
      <span class="mt-4 text-base-content/60">
        {$_('market_making_list_subtitle')}
      </span>
    </div>
    <a
      href={createOrderHref}
      class="btn-pill-primary"
      data-testid="market-making-create-order-cta"
    >
      {$_('market_making_list_create_order')} →
    </a>
  </section>

  {#if gateMode !== 'connected'}
    <!-- Public read-only overview + action-boundary gate -->
    <section class="mt-12 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]" data-testid="market-making-public-overview">
      <article class="card-surface px-6 py-7">
        <span class="eyebrow">{$_('market_making_list_public_eyebrow')}</span>
        <span class="mt-3 block font-display text-3xl text-base-content">
          {$_('market_making_list_public_title')}
        </span>
        <span class="mt-3 block text-sm leading-6 text-base-content/65">
          {$_('market_making_list_public_message')}
        </span>

        <div class="mt-6 grid gap-3">
          <div class="rounded-2xl border border-base-300/70 bg-base-200/40 px-4 py-3">
            <span class="block text-sm font-semibold text-base-content">{$_('market_making_list_public_step_status')}</span>
            <span class="mt-1 block text-xs leading-5 text-base-content/55">
              {$_('market_making_list_public_step_status_detail')}
            </span>
          </div>
          <div class="rounded-2xl border border-base-300/70 bg-base-200/40 px-4 py-3">
            <span class="block text-sm font-semibold text-base-content">{$_('market_making_list_public_step_funding')}</span>
            <span class="mt-1 block text-xs leading-5 text-base-content/55">
              {$_('market_making_list_public_step_funding_detail')}
            </span>
          </div>
          <div class="rounded-2xl border border-base-300/70 bg-base-200/40 px-4 py-3">
            <span class="block text-sm font-semibold text-base-content">{$_('market_making_list_public_step_control')}</span>
            <span class="mt-1 block text-xs leading-5 text-base-content/55">
              {$_('market_making_list_public_step_control_detail')}
            </span>
          </div>
        </div>
      </article>

      <aside class="card-surface px-6 py-7" data-testid={
        gateMode === 'connect'
          ? 'order-connect-gate'
          : gateMode === 'unsupported'
            ? 'order-unsupported-gate'
            : 'order-sign-in-gate'
      }>
        <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-base-300/60">
          {#if gateMode === 'unsupported'}
            <span class="text-2xl">⚠</span>
          {:else}
            <span class="text-2xl">⌁</span>
          {/if}
        </div>
        <span class="block font-display text-2xl text-base-content">
          {#if gateMode === 'connect'}
            {$_('market_making_list_connect_title')}
          {:else if gateMode === 'unsupported'}
            {$_('market_making_list_unsupported_title')}
          {:else}
            {$_('market_making_list_sign_in_title')}
          {/if}
        </span>
        <span class="mt-3 block text-sm leading-6 text-base-content/60">
          {#if gateMode === 'connect'}
            {$_('market_making_list_connect_message')}
          {:else if gateMode === 'unsupported'}
            {$_('market_making_list_unsupported_message')}
          {:else}
            {$_('market_making_list_sign_in_message')}
          {/if}
        </span>
        <div class="mt-6 flex flex-wrap gap-2">
          {#if gateMode === 'connect'}
            <a class="btn-pill-primary" href={createOrderHref} data-testid="order-sign-in-create-action">
              {$_('market_making_list_sign_in_to_create')}
            </a>
            <button class="btn-pill-ghost" onclick={openWalletModal} data-testid="order-connect-action">
              {$_('connect_wallet')}
            </button>
          {:else if gateMode === 'unsupported'}
            <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="order-switch-network">
              {$_('switch_network')}
            </button>
          {:else}
            <a class="btn-pill-primary" href={createOrderHref} data-testid="order-sign-in-create-action">
              {$_('market_making_list_sign_in_to_create')}
            </a>
          {/if}
        </div>
      </aside>
    </section>
  {:else}
    <!-- Filters + scope row -->
    <section class="mt-10 flex flex-wrap items-center justify-between gap-4" data-testid="order-session-scope">
      <div class="flex flex-wrap items-center gap-2">
        {#each filterTabs as tab}
          <button
            class="btn-pill-ghost {statusFilter === tab.key ? 'bg-base-200 text-base-content' : ''}"
            onclick={() => (statusFilter = tab.key)}
            data-testid="order-filter-{tab.key}"
          >
            {$_(tab.labelKey)}
            <span class="ml-1 text-xs text-base-content/50">{counts[tab.key]}</span>
          </button>
        {/each}
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="search"
          bind:value={searchTerm}
          placeholder={$_('market_making_list_search_placeholder')}
          class="w-64 rounded-2xl border border-base-300/60 bg-base-200 px-4 py-2.5 text-sm placeholder:text-base-content/40 focus:border-base-content/30 focus:outline-none"
          data-testid="order-search"
        />
        <span class="text-xs text-base-content/50">
          {$walletNamespaceLabel} · <span class="font-mono-num">{$walletShortAddress}</span>
        </span>
        <button
          class="btn-pill-ghost"
          onclick={() => { if (hasActiveOrderScope) void loadOrders(); }}
          disabled={isLoading}
          data-testid="order-list-retry"
          aria-label={$_('market_making_list_refresh_orders')}
          title={$_('market_making_list_refresh_orders')}
        >
          {isLoading ? `⟳ ${$_('market_making_list_refresh_loading')}` : `⟳ ${$_('market_making_list_refresh')}`}
        </button>
      </div>
    </section>

    {#if actionError}
      <div class="mt-4 rounded-2xl border border-error/40 px-4 py-3 text-sm text-error" data-testid="order-action-error">
        {actionError}
      </div>
    {/if}

    <!-- Body states -->
    {#if isLoading}
      <div class="mt-10 flex items-center gap-3 text-sm text-base-content/70" data-testid="order-list-loading-state">
        <span class="loading loading-spinner loading-sm"></span>
        <span>{$_('market_making_list_loading_orders')}</span>
      </div>
    {:else if listError}
      <div class="mt-10 card-surface px-6 py-8" data-testid="order-list-error-state">
        <span class="block font-display text-lg text-error">{$_('market_making_list_error_title')}</span>
        <span class="mt-2 block text-sm text-base-content/70">{listError}</span>
        <button class="btn-pill-primary mt-5" onclick={() => void loadOrders()} data-testid="order-list-retry">
          {$_('market_making_list_retry')}
        </button>
      </div>
    {:else if orders.length === 0}
      <div class="mt-10 card-surface px-8 py-14 text-center" data-testid="order-list-empty-state">
        <span class="block font-display text-2xl text-base-content">{$_('market_making_list_empty_title')}</span>
        <span class="mt-3 block text-sm text-base-content/60">
          {$_('market_making_list_empty_message')}
        </span>
        <a href="/app/market-making/order/new" class="btn-pill-primary mt-6 inline-flex" data-testid="order-empty-create-cta">
          {$_('market_making_list_empty_cta')} →
        </a>
      </div>
    {:else if filteredOrders.length === 0}
      <div class="mt-10 card-surface px-6 py-10 text-center text-sm text-base-content/60">
        {$_('market_making_list_no_filter_results')}
      </div>
    {:else if useRichOrderCards}
      <div class="mt-8 grid gap-4 lg:grid-cols-2" data-testid="order-list" data-layout="cards">
        {#each filteredOrders as order (order.orderId)}
          {@const tone = statusTone(order)}
          {@const financials = orderFinancials(order)}
          {@const lockedFunds = orderLockedFunds(order)}
          {@const chips = specsChips(order)}
          <article
            class="group card-surface relative overflow-hidden px-6 py-5 transition-colors hover:border-base-content/15"
            data-testid="order-card-{order.orderId}"
          >
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex min-w-0 flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <span class="inline-flex h-2 w-2 rounded-full {toneDot[tone]} {tone === 'success' ? 'anim-pulse-dot' : ''}"></span>
                  <span class="text-xs font-medium capitalize tracking-wider text-base-content/60" data-testid="order-status-{order.orderId}">
                    {formatState(order.state)}
                  </span>
                  <span class="text-base-content/30">·</span>
                  <span class="font-mono-num text-xs text-base-content/50">{compactOrderId(order.orderId)}</span>
                </div>
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span class="font-display text-2xl text-base-content">{pairLabel(order)}</span>
                  <span class="text-sm text-base-content/55">{$_('market_making_list_on_exchange')} {exchangeLabel(order)}</span>
                </div>
                <span class="text-xs text-base-content/50">
                  {strategyLabel(order)} · {$_('market_making_list_created')} <span title={formatAbsoluteDate(order.createdAt)}>{formatRelativeDate(order.createdAt)}</span>
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                {#if order.validActions.start}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'start')}
                    data-testid="order-quick-start-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-start` ? '…' : `▶ ${$_('market_making_list_action_start')}`}
                  </button>
                {/if}
                {#if order.validActions.pause}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'pause')}
                    data-testid="order-quick-pause-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-pause` ? '…' : `⏸ ${$_('market_making_list_action_pause')}`}
                  </button>
                {/if}
                {#if order.validActions.resume}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'resume')}
                    data-testid="order-quick-resume-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-resume` ? '…' : `⏵ ${$_('market_making_list_action_resume')}`}
                  </button>
                {/if}
                <a
                  href={orderDetailHref(order.orderId)}
                  class="btn-pill-outline"
                  data-testid="order-open-{order.orderId}"
                >
                  {$_('market_making_list_open')} →
                </a>
              </div>
            </div>

            <div class="mt-5 grid gap-5 border-t border-base-300/60 pt-5 md:grid-cols-3">
              <div class="flex flex-col gap-1.5">
                <span class="eyebrow">{$_('market_making_list_pnl_fees')}</span>
                {#if financials.length === 0}
                  <span class="text-sm text-base-content/50">{$_('market_making_list_no_pnl_fees')}</span>
                {:else}
                  {#each financials as metric}
                    <div class="flex items-baseline justify-between gap-3" data-testid="order-pnl-fees-{order.orderId}-{metric.asset}">
                      <span class="font-mono-num text-sm {tonePnl(metric.pnl)}">{formatSigned(metric.pnl)} {metric.asset}</span>
                      <span class="font-mono-num text-xs text-base-content/50">
                        {$_('market_making_list_fees')} {formatAmount(metric.fees)}{metric.pct !== null ? ` · ${formatPercent(metric.pct)}` : ''}
                      </span>
                    </div>
                  {/each}
                {/if}
              </div>

              <div class="flex flex-col gap-1.5">
                <span class="eyebrow">{$_('market_making_list_locked_funds')}</span>
                {#if lockedFunds.length === 0}
                  <span class="text-sm text-base-content/50">{$_('market_making_list_no_locked_funds')}</span>
                {:else}
                  {#each lockedFunds as funds}
                    <div class="flex items-baseline justify-between gap-3" title="{$_('market_making_list_available')} {formatAmount(funds.available)} · {$_('market_making_list_locked')} {formatAmount(funds.locked)}" data-testid="order-locked-funds-{order.orderId}-{funds.asset}">
                      <span class="font-mono-num text-sm text-base-content">{formatAmount(funds.locked)} {funds.asset}</span>
                      <span class="text-xs text-base-content/50">{lockedPercent(funds.total, funds.locked)} {$_('market_making_list_locked')}</span>
                    </div>
                  {/each}
                {/if}
              </div>

              <div class="flex flex-col gap-1.5">
                <span class="eyebrow">{$_('market_making_list_specs')}</span>
                {#if chips.length === 0}
                  <span class="text-sm text-base-content/50">{$_('market_making_list_no_specs')}</span>
                {:else}
                  <div class="flex flex-wrap gap-1.5">
                    {#each chips as chip}
                      <span class="rounded-full bg-base-100 px-2.5 py-0.5 text-xs text-base-content/70">{chip}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            {#if order.lifecycleError}
              <div class="mt-4 rounded-xl border border-warning/40 bg-warning/5 px-4 py-2.5 text-xs text-base-content/70" data-testid="order-lifecycle-error-{order.orderId}">
                <span class="font-medium text-warning">{$_('market_making_list_lifecycle_note')}:</span> {order.lifecycleError}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {:else}
      <div class="mt-8 overflow-hidden rounded-3xl border border-base-300/60 bg-base-100/70" data-testid="order-list" data-layout="compact">
        <div class="divide-y divide-base-300/60">
          {#each filteredOrders as order (order.orderId)}
            {@const tone = statusTone(order)}
            {@const financials = orderFinancials(order)}
            {@const lockedFunds = orderLockedFunds(order)}
            <article
              class="grid gap-4 px-4 py-4 transition-colors hover:bg-base-200/50 lg:grid-cols-[minmax(12rem,1.4fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] lg:items-center"
              data-testid="order-row-{order.orderId}"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="inline-flex h-2 w-2 rounded-full {toneDot[tone]} {tone === 'success' ? 'anim-pulse-dot' : ''}"></span>
                  <span class="text-xs font-medium capitalize tracking-wider text-base-content/60" data-testid="order-status-{order.orderId}">
                    {formatState(order.state)}
                  </span>
                </div>
                <div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span class="font-display text-lg text-base-content">{pairLabel(order)}</span>
                  <span class="text-xs text-base-content/55">{$_('market_making_list_on_exchange')} {exchangeLabel(order)}</span>
                </div>
                <span class="mt-1 block font-mono-num text-xs text-base-content/45">{compactOrderId(order.orderId)}</span>
              </div>

              <div class="min-w-0" data-testid="order-compact-pnl-fees-{order.orderId}">
                <span class="eyebrow">{$_('market_making_list_pnl_fees')}</span>
                {#if financials.length === 0}
                  <span class="mt-1 block text-sm text-base-content/50">{$_('market_making_list_no_pnl_fees')}</span>
                {:else}
                  <div class="mt-1 flex flex-wrap gap-2">
                    {#each financials.slice(0, 2) as metric}
                      <span class="rounded-full bg-base-200 px-2.5 py-1 font-mono-num text-xs {tonePnl(metric.pnl)}">
                        {formatSigned(metric.pnl)} {metric.asset} · {$_('market_making_list_fees')} {formatAmount(metric.fees)}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="min-w-0" data-testid="order-compact-locked-funds-{order.orderId}">
                <span class="eyebrow">{$_('market_making_list_locked_funds')}</span>
                {#if lockedFunds.length === 0}
                  <span class="mt-1 block text-sm text-base-content/50">{$_('market_making_list_no_locked_funds')}</span>
                {:else}
                  <div class="mt-1 flex flex-wrap gap-2">
                    {#each lockedFunds.slice(0, 2) as funds}
                      <span class="rounded-full bg-base-200 px-2.5 py-1 font-mono-num text-xs text-base-content/70">
                        {formatAmount(funds.locked)} {funds.asset} · {lockedPercent(funds.total, funds.locked)} {$_('market_making_list_locked')}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="flex flex-wrap items-center gap-2 lg:justify-end">
                {#if order.validActions.start}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'start')}
                    data-testid="order-quick-start-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-start` ? '…' : `▶ ${$_('market_making_list_action_start')}`}
                  </button>
                {/if}
                {#if order.validActions.pause}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'pause')}
                    data-testid="order-quick-pause-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-pause` ? '…' : `⏸ ${$_('market_making_list_action_pause')}`}
                  </button>
                {/if}
                {#if order.validActions.resume}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'resume')}
                    data-testid="order-quick-resume-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-resume` ? '…' : `⏵ ${$_('market_making_list_action_resume')}`}
                  </button>
                {/if}
                <a
                  href={orderDetailHref(order.orderId)}
                  class="btn-pill-outline"
                  data-testid="order-open-{order.orderId}"
                >
                  {$_('market_making_list_open')} →
                </a>
              </div>
            </article>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

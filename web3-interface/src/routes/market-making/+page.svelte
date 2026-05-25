<script lang="ts">
  import { page } from '$app/state';
  import BigNumber from 'bignumber.js';
  import {
    listMarketMakingOrders,
    pauseMarketMakingOrder,
    resumeMarketMakingOrder,
    startMarketMakingOrder,
  } from '$lib/helpers/api/web3';
  import { authMatchesWalletScope } from '$lib/helpers/market-making/wallet-scope';
  import {
    openMockWallet,
    openNetworkModal,
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

  const formatAmount = (value: string | number | null | undefined, maxFrac = 4): string => {
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
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  };

  const formatAbsoluteDate = (value: string | null | undefined): string => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const compactOrderId = (orderId: string): string =>
    orderId.length > 14 ? `${orderId.slice(0, 6)}…${orderId.slice(-4)}` : orderId;

  const orderDetailHref = (orderId: string): string =>
    `/market-making/order/${encodeURIComponent(orderId)}`;

  const strategyLabel = (order: Web3MarketMakingOrderSummary): string =>
    order.strategy?.name || order.strategy?.key || order.strategy?.controller || 'Strategy';

  const exchangeLabel = (order: Web3MarketMakingOrderSummary): string =>
    order.exchangeName ?? order.specs?.exchangeName ?? 'Exchange';

  const pairLabel = (order: Web3MarketMakingOrderSummary): string =>
    order.pair ?? order.specs?.pair ?? 'Pair';

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

  const orderPnl = (order: Web3MarketMakingOrderSummary) => {
    const pnlEntries = Object.entries(order.performance?.pnlByAsset || {});
    if (pnlEntries.length === 0) return null;
    return pnlEntries.map(([asset, value]) => {
      const pnl = new BigNumber(value || 0);
      const deposit = new BigNumber(
        order.balances.find((b) => b.assetId === asset)?.initialDeposit || 0
      );
      const pct = deposit.isGreaterThan(0) ? pnl.dividedBy(deposit).multipliedBy(100) : null;
      return { asset, pnl, pct };
    });
  };

  const lockedPercent = (total: BigNumber.Value, locked: BigNumber.Value): string => {
    const t = new BigNumber(total);
    const l = new BigNumber(locked);
    if (!t.isFinite() || t.isZero()) return '0%';
    return `${l.dividedBy(t).multipliedBy(100).toFormat(0)}%`;
  };

  const specsChips = (order: Web3MarketMakingOrderSummary): string[] => {
    const s = order.specs;
    return [
      s?.bidSpread ? `bid ${s.bidSpread}` : null,
      s?.askSpread ? `ask ${s.askSpread}` : null,
      s?.numberOfLayers ? `${s.numberOfLayers} layers` : null,
      s?.orderRefreshTime ? `${s.orderRefreshTime}s refresh` : null,
      s?.orderAmount ? `amount ${s.orderAmount}` : null,
    ].filter((x): x is string => Boolean(x));
  };

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return 'Orders could not be loaded right now.';
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

  type GateMode = 'connected' | 'connect' | 'unsupported' | 'authenticating';
  const gateMode = $derived<GateMode>(
    !$walletIsConnected && !$walletIsUnsupported
      ? 'connect'
      : $walletIsUnsupported
        ? 'unsupported'
        : !hasActiveOrderScope
          ? 'authenticating'
          : 'connected'
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

  const loadOrders = async () => {
    const sequence = ++loadSequence;
    isLoading = true;
    listError = null;
    orders = [];

    try {
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

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'paused', label: 'Paused' },
    { key: 'errored', label: 'Errored' },
  ];
</script>

<div data-testid="web3-market-making" class="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
  <!-- Hero -->
  <section class="flex flex-wrap items-end justify-between gap-6 pt-8">
    <div class="flex max-w-2xl flex-col">
      <span class="eyebrow">Market making</span>
      <span class="mt-3 font-display text-4xl tracking-tight text-base-content md:text-5xl lg:text-6xl">
        Your market-making orders
      </span>
      <span class="mt-4 text-base-content/60">
        Create, manage, and monitor wallet-scoped market-making orders. Balances, PnL, and lifecycle actions stay attributed to each order.
      </span>
    </div>
    <a
      href="/market-making/order/new"
      class="btn-pill-primary"
      data-testid="market-making-create-order-cta"
    >
      Create order →
    </a>
  </section>

  {#if gateMode !== 'connected'}
    <!-- Unified gate state -->
    <section class="mt-12 card-surface mx-auto max-w-2xl px-8 py-12 text-center" data-testid={
      gateMode === 'connect'
        ? 'order-connect-gate'
        : gateMode === 'unsupported'
          ? 'order-unsupported-gate'
          : 'order-list-authenticating-state'
    }>
      <div class="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-base-300/60">
        {#if gateMode === 'connect'}
          <span class="text-2xl">⌁</span>
        {:else if gateMode === 'unsupported'}
          <span class="text-2xl">⚠</span>
        {:else}
          <span class="loading loading-spinner loading-sm"></span>
        {/if}
      </div>
      <span class="block font-display text-2xl text-base-content">
        {#if gateMode === 'connect'}
          Connect a wallet to begin
        {:else if gateMode === 'unsupported'}
          Unsupported network
        {:else}
          Authenticating wallet
        {/if}
      </span>
      <span class="mt-3 block text-sm text-base-content/60">
        {#if gateMode === 'connect'}
          Market-making orders are wallet and session scoped. Connect a supported EVM or Solana account to load and create orders.
        {:else if gateMode === 'unsupported'}
          Switch to a supported EVM or Solana account to load market-making orders for this wallet.
        {:else}
          Verifying the active wallet session before loading account-scoped orders.
        {/if}
      </span>
      {#if gateMode === 'connect'}
        <button class="btn-pill-primary mt-6" onclick={openMockWallet} data-testid="order-connect-action">
          Connect wallet
        </button>
      {:else if gateMode === 'unsupported'}
        <button class="btn-pill-primary mt-6" onclick={openNetworkModal} data-testid="order-switch-network">
          Switch network
        </button>
      {/if}
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
            {tab.label}
            <span class="ml-1 text-xs text-base-content/50">{counts[tab.key]}</span>
          </button>
        {/each}
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="search"
          bind:value={searchTerm}
          placeholder="Filter by pair, exchange, or id"
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
          aria-label="Refresh orders"
          title="Refresh orders"
        >
          {isLoading ? '⟳ Loading…' : '⟳ Refresh'}
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
        <span>Loading market-making orders…</span>
      </div>
    {:else if listError}
      <div class="mt-10 card-surface px-6 py-8" data-testid="order-list-error-state">
        <span class="block font-display text-lg text-error">Could not load orders</span>
        <span class="mt-2 block text-sm text-base-content/70">{listError}</span>
        <button class="btn-pill-primary mt-5" onclick={() => void loadOrders()} data-testid="order-list-retry">
          Retry
        </button>
      </div>
    {:else if orders.length === 0}
      <div class="mt-10 card-surface px-8 py-14 text-center" data-testid="order-list-empty-state">
        <span class="block font-display text-2xl text-base-content">No orders yet</span>
        <span class="mt-3 block text-sm text-base-content/60">
          Create your first market-making order to choose a strategy, define pair specs, and fund an order-attributed balance.
        </span>
        <a href="/market-making/order/new" class="btn-pill-primary mt-6 inline-flex" data-testid="order-empty-create-cta">
          Create order →
        </a>
      </div>
    {:else if filteredOrders.length === 0}
      <div class="mt-10 card-surface px-6 py-10 text-center text-sm text-base-content/60">
        No orders match the current filter.
      </div>
    {:else}
      <div class="mt-8 flex flex-col gap-4" data-testid="order-list">
        {#each filteredOrders as order (order.orderId)}
          {@const tone = statusTone(order)}
          {@const pnl = orderPnl(order)}
          {@const chips = specsChips(order)}
          <article
            class="group card-surface relative overflow-hidden px-6 py-5 transition-colors hover:border-base-content/15"
            data-testid="order-row-{order.orderId}"
          >
            <!-- Header row -->
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex min-w-0 flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <span class="inline-flex h-2 w-2 rounded-full {toneDot[tone]} {tone === 'success' ? 'anim-pulse-dot' : ''}"></span>
                  <span class="text-xs font-medium uppercase tracking-wider text-base-content/60" data-testid="order-status-{order.orderId}">
                    {formatState(order.state)}
                  </span>
                  <span class="text-base-content/30">·</span>
                  <span class="font-mono-num text-xs text-base-content/50">{compactOrderId(order.orderId)}</span>
                </div>
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span class="font-display text-2xl text-base-content">{pairLabel(order)}</span>
                  <span class="text-sm text-base-content/55">on {exchangeLabel(order)}</span>
                </div>
                <span class="text-xs text-base-content/50">
                  {strategyLabel(order)} · created <span title={formatAbsoluteDate(order.createdAt)}>{formatRelativeDate(order.createdAt)}</span>
                </span>
              </div>

              <!-- Quick actions -->
              <div class="flex flex-wrap items-center gap-2">
                {#if order.validActions.start}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'start')}
                    data-testid="order-quick-start-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-start` ? '…' : '▶ Start'}
                  </button>
                {/if}
                {#if order.validActions.pause}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'pause')}
                    data-testid="order-quick-pause-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-pause` ? '…' : '⏸ Pause'}
                  </button>
                {/if}
                {#if order.validActions.resume}
                  <button
                    class="btn-pill-ghost"
                    disabled={actionInFlight !== null}
                    onclick={() => void runLifecycle(order.orderId, 'resume')}
                    data-testid="order-quick-resume-{order.orderId}"
                  >
                    {actionInFlight === `${order.orderId}-resume` ? '…' : '⏵ Resume'}
                  </button>
                {/if}
                <a
                  href={orderDetailHref(order.orderId)}
                  class="btn-pill-outline"
                  data-testid="order-open-{order.orderId}"
                >
                  Open →
                </a>
              </div>
            </div>

            <!-- Metrics row -->
            <div class="mt-5 grid gap-5 border-t border-base-300/60 pt-5 md:grid-cols-3">
              <!-- Balances -->
              <div class="flex flex-col gap-1.5">
                <span class="eyebrow">Balances</span>
                {#if order.balances.length === 0}
                  <span class="text-sm text-base-content/50">No balances yet</span>
                {:else}
                  {#each order.balances as balance}
                    <div class="flex items-baseline justify-between gap-3" title="available {formatAmount(balance.available)} · locked {formatAmount(balance.locked)}">
                      <span class="font-mono-num text-sm text-base-content">{formatAmount(balance.total)} {balance.assetId}</span>
                      <span class="text-xs text-base-content/50">{lockedPercent(balance.total, balance.locked)} locked</span>
                    </div>
                  {/each}
                {/if}
              </div>

              <!-- PnL -->
              <div class="flex flex-col gap-1.5">
                <span class="eyebrow">PnL</span>
                {#if !pnl || pnl.length === 0}
                  <span class="text-sm text-base-content/50">No data yet</span>
                {:else}
                  {#each pnl as { asset, pnl: amount, pct }}
                    <div class="flex items-baseline justify-between gap-3">
                      <span class="font-mono-num text-sm {tonePnl(amount)}">{formatSigned(amount)} {asset}</span>
                      {#if pct !== null}
                        <span class="font-mono-num text-xs {tonePnl(amount)}">{formatPercent(pct)}</span>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>

              <!-- Specs -->
              <div class="flex flex-col gap-1.5">
                <span class="eyebrow">Specs</span>
                {#if chips.length === 0}
                  <span class="text-sm text-base-content/50">No specs</span>
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
                <span class="font-medium text-warning">Lifecycle note:</span> {order.lifecycleError}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>

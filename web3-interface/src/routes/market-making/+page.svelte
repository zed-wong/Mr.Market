<script lang="ts">
  import BigNumber from 'bignumber.js';
  import Section from '$lib/components/common/Section.svelte';
  import { listMarketMakingOrders } from '$lib/helpers/api/web3';
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
  import { isAuthed } from '$lib/stores/auth';
  import type { Web3MarketMakingOrderActions, Web3MarketMakingOrderSummary } from '$lib/types/market-making';

  let orders = $state<Web3MarketMakingOrderSummary[]>([]);
  let isLoading = $state(false);
  let listError = $state<string | null>(null);
  let loadSequence = 0;

  const formatState = (state: string | null | undefined): string =>
    state ? state.replace(/[_-]+/g, ' ') : 'unknown';

  const formatText = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === '') return 'Unavailable';
    return String(value);
  };

  const formatAmount = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '0';
    const amount = new BigNumber(value);
    if (!amount.isFinite()) return String(value);
    const precision = amount.isInteger() ? 0 : 4;
    return amount.toFormat(precision);
  };

  const formatPnl = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '0';
    const amount = new BigNumber(value);
    if (!amount.isFinite()) return String(value);
    const formatted = amount.toFormat(amount.isInteger() ? 0 : 4);
    return amount.isGreaterThan(0) ? `+${formatted}` : formatted;
  };

  const formatDate = (value: string | null | undefined): string => {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const compactOrderId = (orderId: string): string =>
    orderId.length > 18 ? `${orderId.slice(0, 10)}…${orderId.slice(-6)}` : orderId;

  const orderDetailHref = (orderId: string): string =>
    `/market-making/order/${encodeURIComponent(orderId)}`;

  const strategyLabel = (order: Web3MarketMakingOrderSummary): string =>
    order.strategy?.name || order.strategy?.key || order.strategy?.controller || 'Strategy unavailable';

  const specsSummary = (order: Web3MarketMakingOrderSummary): string => {
    const specs = order.specs;
    const parts = [
      specs?.bidSpread ? `bid ${formatAmount(specs.bidSpread)}` : null,
      specs?.askSpread ? `ask ${formatAmount(specs.askSpread)}` : null,
      specs?.orderAmount ? `amount ${formatAmount(specs.orderAmount)}` : null,
      specs?.numberOfLayers ? `${specs.numberOfLayers} layers` : null,
      specs?.orderRefreshTime ? `refresh ${specs.orderRefreshTime}s` : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : 'Specs unavailable';
  };

  const balanceSummary = (order: Web3MarketMakingOrderSummary): string => {
    if (!order.balances.length) return 'No order-attributed balances yet';
    return order.balances
      .map(
        (balance) =>
          `${balance.assetId} total ${formatAmount(balance.total)} · available ${formatAmount(balance.available)} · locked ${formatAmount(balance.locked)}`
      )
      .join(' | ');
  };

  const depositSummary = (order: Web3MarketMakingOrderSummary): string => {
    if (!order.balances.length) return 'Initial deposit unavailable';
    return order.balances
      .map((balance) => `${balance.assetId} initial ${formatAmount(balance.initialDeposit)}`)
      .join(' | ');
  };

  const pnlSummary = (order: Web3MarketMakingOrderSummary): string => {
    const entries = Object.entries(order.performance?.pnlByAsset || {});
    if (entries.length === 0) return 'PnL unavailable';
    return entries.map(([asset, value]) => `${asset} ${formatPnl(value)}`).join(' | ');
  };

  const actionSummary = (actions: Web3MarketMakingOrderActions): string => {
    const available = Object.entries(actions)
      .filter(([, enabled]) => enabled)
      .map(([action]) => action);
    return available.length > 0 ? available.join(' · ') : 'No actions available';
  };

  const errorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return 'Orders could not be loaded right now.';
  };

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

  $effect(() => {
    const accountId = $walletAccount?.id ?? '';
    const namespace = $walletNamespace ?? '';
    const canLoadOrders = $walletIsConnected && $isAuthed && !$walletIsUnsupported && Boolean(accountId) && Boolean(namespace);

    if (!canLoadOrders) {
      loadSequence += 1;
      orders = [];
      listError = null;
      isLoading = false;
      return;
    }

    void loadOrders();
  });
</script>

<div data-testid="web3-market-making">
  <section class="pt-2 flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col">
      <span class="eyebrow">Market making</span>
      <span class="mt-3 font-display text-5xl md:text-6xl tracking-tight text-base-content">Market-making orders</span>
      <span class="mt-4 max-w-xl text-base-content/60">
        Manage API-backed market-making orders for the connected wallet, review order-attributed balances, and open detail pages for lifecycle actions.
      </span>
    </div>
    <div class="flex flex-wrap gap-2">
      <a href="/market-making/order/new" class="btn-pill-primary" data-testid="market-making-create-order-cta">Create order →</a>
    </div>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="order-connect-gate">
      <span class="text-sm text-base-content/70">Connect a supported wallet to load your account-scoped market-making orders.</span>
      <button class="btn-pill-primary" onclick={openMockWallet} data-testid="order-connect-action">Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="order-unsupported-gate">
      <span>Switch to a supported EVM or Solana account to load market-making orders for this wallet.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="order-switch-network">Switch network</button>
    </section>
  {/if}

  <Section title="Orders" eyebrow="Wallet scoped">
    {#if $walletIsConnected && !$walletIsUnsupported}
      <div class="flex flex-wrap items-end justify-between gap-4 border-t border-base-300 pt-6" data-testid="order-session-scope">
        <div class="flex flex-col">
          <span class="eyebrow">Active scope</span>
          <span class="mt-1 text-sm text-base-content/70">
            {$walletNamespaceLabel} · <span class="font-mono-num">{$walletShortAddress}</span>
          </span>
        </div>
        <button class="btn-pill-outline" onclick={() => void loadOrders()} disabled={isLoading} data-testid="order-list-retry">
          {isLoading ? 'Loading orders…' : 'Retry orders'}
        </button>
      </div>

      {#if isLoading}
        <div class="mt-8 flex items-center gap-3 text-sm text-base-content/70" data-testid="order-list-loading-state">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Loading market-making orders from the web3 market-making API…</span>
        </div>
      {:else if listError}
        <div class="mt-8 rounded-2xl border border-error/40 px-5 py-4" data-testid="order-list-error-state">
          <span class="block font-medium text-error">Market-making orders could not be loaded.</span>
          <span class="mt-2 block text-sm text-base-content/70">{listError}</span>
          <button class="btn-pill-primary mt-4" onclick={() => void loadOrders()} data-testid="order-list-retry">Retry loading orders</button>
        </div>
      {:else if orders.length === 0}
        <div class="mt-8 border-t border-base-300 py-10 text-base-content/55" data-testid="order-list-empty-state">
          <span class="block font-medium text-base-content">No market-making orders yet</span>
          <span class="mt-1 block text-sm">Create an order to choose a strategy, define pair specs, and fund order-attributed balances.</span>
          <a href="/market-making/order/new" class="btn-pill-primary mt-5 inline-flex" data-testid="order-empty-create-cta">Create order →</a>
        </div>
      {:else}
        <div class="mt-8 border-t border-base-300" data-testid="order-list">
          {#each orders as order}
            <a
              href={orderDetailHref(order.orderId)}
              class="flex flex-col gap-4 border-b border-base-300 py-6 transition-colors hover:bg-base-300/30"
              data-testid="order-row-{order.orderId}"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex min-w-0 flex-col">
                  <span class="font-medium text-lg text-base-content">Order {compactOrderId(order.orderId)}</span>
                  <span class="mt-1 text-sm text-base-content/55">
                    <span class="font-mono-num">{order.orderId}</span> · created {formatDate(order.createdAt)}
                  </span>
                </div>
                <span class="eyebrow capitalize" data-testid="order-status-{order.orderId}">{formatState(order.state)}</span>
              </div>

              <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div class="flex flex-col">
                  <span class="eyebrow">Strategy</span>
                  <span class="mt-1 text-base text-base-content">{strategyLabel(order)}</span>
                  <span class="mt-0.5 text-xs text-base-content/50">Next actions: {actionSummary(order.validActions)}</span>
                </div>

                <div class="flex flex-col">
                  <span class="eyebrow">Pair / specs</span>
                  <span class="mt-1 text-base text-base-content">{formatText(order.pair ?? order.specs?.pair)}</span>
                  <span class="mt-0.5 text-xs text-base-content/50">{formatText(order.exchangeName ?? order.specs?.exchangeName)} · {specsSummary(order)}</span>
                </div>

                <div class="flex flex-col">
                  <span class="eyebrow">Balances / deposit</span>
                  <span class="mt-1 font-mono-num text-base text-base-content">{balanceSummary(order)}</span>
                  <span class="mt-0.5 text-xs text-base-content/50">{depositSummary(order)}</span>
                </div>

                <div class="flex flex-col">
                  <span class="eyebrow">PnL / performance</span>
                  <span class="mt-1 font-mono-num text-base text-base-content">{pnlSummary(order)}</span>
                  <span class="mt-0.5 text-xs text-base-content/50">Fees and realized deltas are scoped to this order.</span>
                </div>
              </div>

              {#if order.lifecycleError}
                <span class="rounded-2xl border border-warning/40 px-4 py-3 text-sm text-base-content/70" data-testid="order-lifecycle-error-{order.orderId}">
                  Lifecycle note: {order.lifecycleError}
                </span>
              {/if}
            </a>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="border-t border-base-300 py-10 text-base-content/55" data-testid="order-list-gated-state">
        Market-making orders are wallet and session scoped. Connect a supported account to load orders from the web3 market-making API.
      </div>
    {/if}
  </Section>
</div>

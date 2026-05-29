<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchAdminUserOrders,
    type AdminUserOrder,
    type AdminUserOrderType,
    type AdminUserOrdersResponse,
  } from '$lib/helpers/api/trading';

  const limitOptions = [10, 25, 50, 100];
  const autoRefreshIntervalMs = 10_000;
  const types: Array<'all' | AdminUserOrderType> = ['all', 'market_making', 'simply_grow'];
  const states = [
    '',
    'active',
    'running',
    'started',
    'created',
    'pending',
    'payment_pending',
    'stopped',
    'finished',
    'failed',
    'deleted',
    'cancelled',
  ];

  const stateTone: Record<string, string> = {
    active: 'bg-success/10 text-success',
    running: 'bg-success/10 text-success',
    started: 'bg-success/10 text-success',
    created: 'bg-info/10 text-info',
    pending: 'bg-warning/10 text-warning',
    payment_pending: 'bg-warning/10 text-warning',
    stopped: 'bg-base-content/5 text-base-content/60',
    finished: 'bg-success/10 text-success',
    failed: 'bg-error/10 text-error',
    deleted: 'bg-error/10 text-error',
    cancelled: 'bg-base-content/5 text-base-content/60',
  };

  let response = $state<AdminUserOrdersResponse | null>(null);
  let typeFilter = $state<'all' | AdminUserOrderType>('all');
  let stateFilter = $state('');
  let query = $state('');
  let page = $state(1);
  let limit = $state(25);
  let loading = $state(true);
  let refreshing = $state(false);
  let backgroundRefreshing = $state(false);
  let searchInputFocused = $state(false);
  let error = $state<string | null>(null);
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  const rows = $derived(response?.items ?? []);

  const summary = $derived.by(() => ({
    total: response?.pagination.total ?? 0,
    marketMaking: rows.filter((order) => order.type === 'market_making').length,
    simplyGrow: rows.filter((order) => order.type === 'simply_grow').length,
    active: rows.filter((order) => ['active', 'running', 'started', 'created'].includes(order.state)).length,
  }));

  const labelize = (value?: string | null) => (value || 'unavailable').replaceAll('_', ' ');

  const formatTimestamp = (value?: string | null) => {
    if (!value) return 'unavailable';

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;

    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatValue = (value?: string | null) => {
    if (!value) return '—';

    const number = Number(value);
    if (!Number.isFinite(number)) return value;

    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(number);
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Unable to load user orders';

  const loadOrders = async (options: { throwOnError?: boolean; silentError?: boolean; background?: boolean } = {}) => {
    const initialLoad = response === null;

    if (options.background) {
      backgroundRefreshing = true;
    } else {
      loading = initialLoad;
      refreshing = !initialLoad;
    }

    if (!options.silentError) {
      error = null;
    }

    try {
      response = await fetchAdminUserOrders({
        type: typeFilter,
        state: stateFilter,
        query,
        page,
        limit,
      });
      page = response.pagination.page;
      limit = response.pagination.limit;
      error = null;
    } catch (cause) {
      const message = errorMessage(cause);
      if (!options.silentError) {
        error = message;
      }
      if (options.throwOnError) {
        throw new Error(message);
      }
    } finally {
      if (options.background) {
        backgroundRefreshing = false;
      } else {
        loading = false;
        refreshing = false;
      }
    }
  };

  const autoRefreshOrders = () => {
    if (
      loading ||
      refreshing ||
      backgroundRefreshing ||
      searchInputFocused ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    void loadOrders({ silentError: true, background: true });
  };

  const refreshOrders = () =>
    toast.promise(loadOrders({ throwOnError: true }), {
      loading: 'refreshing user orders',
      success: 'user orders refreshed',
      error: 'failed to refresh user orders',
    });

  const changeType = (next: 'all' | AdminUserOrderType) => {
    typeFilter = next;
    page = 1;
    void loadOrders();
  };

  const changeState = () => {
    page = 1;
    void loadOrders();
  };

  const applySearch = () => {
    page = 1;
    void loadOrders();
  };

  const resetFilters = () => {
    typeFilter = 'all';
    stateFilter = '';
    query = '';
    page = 1;
    void loadOrders();
  };

  const goToPage = (next: number) => {
    if (!response || next < 1 || next > response.pagination.totalPages || next === page) return;

    page = next;
    void loadOrders();
  };

  const changeLimit = () => {
    page = 1;
    void loadOrders();
  };

  const orderDetail = (order: AdminUserOrder) => {
    if (order.type === 'market_making') {
      return [order.pair, order.exchangeName, order.strategyKey].filter(Boolean).join(' · ') || 'market-making order';
    }

    return order.mixinAssetId ? `asset ${order.mixinAssetId}` : 'simply grow order';
  };

  onMount(() => {
    void loadOrders();

    autoRefreshTimer = setInterval(autoRefreshOrders, autoRefreshIntervalMs);
    document.addEventListener('visibilitychange', autoRefreshOrders);
  });

  onDestroy(() => {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
    }

    document.removeEventListener('visibilitychange', autoRefreshOrders);
  });
</script>

<section class="space-y-6" data-testid="user-orders-page">
  <PageHeader
    eyebrow="trading"
    title={$_('admin.nav.user_orders')}
    subtitle="User-initiated market-making and simply-grow orders from authenticated clients."
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void refreshOrders()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">matching user orders</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{summary.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">market making on page</span>
        <span class="font-mono text-2xl font-semibold text-info">{summary.marketMaking}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">simply grow on page</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{summary.simplyGrow}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">active on page</span>
        <span class="font-mono text-2xl font-semibold text-success">{summary.active}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <div class="join">
          {#each types as type (type)}
            <button
              type="button"
              class="btn btn-sm join-item capitalize {typeFilter === type ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-100 text-base-content'}"
              disabled={loading || refreshing}
              onclick={() => changeType(type)}
            >{labelize(type)}</button>
          {/each}
        </div>

        <select
          class="select select-sm select-bordered w-44 border-base-300 bg-base-100 font-mono text-xs capitalize"
          bind:value={stateFilter}
          disabled={loading || refreshing}
          onchange={changeState}
        >
          {#each states as state (state || 'all')}
            <option value={state}>{state ? labelize(state) : 'all states'}</option>
          {/each}
        </select>

        <input
          type="text"
          placeholder="order id, user id, pair, exchange or asset…"
          class="input input-sm input-bordered min-w-[240px] flex-1 border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxQueryLength ?? 100}
          bind:value={query}
          onfocus={() => (searchInputFocused = true)}
          onblur={() => (searchInputFocused = false)}
          onkeydown={(event) => {
            if (event.key === 'Enter') applySearch();
          }}
        />

        <button
          type="button"
          class="btn btn-sm btn-ghost rounded-full capitalize"
          disabled={loading || refreshing}
          onclick={applySearch}
        >search</button>

        <select
          class="select select-sm select-bordered border-base-300 bg-base-100 font-mono text-xs"
          bind:value={limit}
          disabled={loading || refreshing}
          onchange={changeLimit}
        >
          {#each limitOptions as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="user-orders-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">loading backend user orders</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="user-orders-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">user orders unavailable</span>
            <span class="text-sm text-base-content/60">{error}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadOrders()}>retry</button>
              <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>reset filters</button>
            </div>
          </div>
        </div>
      {:else if response}
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-base-content/50">
            page {response.pagination.page} / {response.pagination.totalPages} · {rows.length} of {response.pagination.total}
          </span>
          {#if refreshing}
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
          {/if}
        </div>

        {#if rows.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="user-orders-empty">
            <span class="text-sm font-semibold text-base-content capitalize">no user orders returned</span>
            <span class="text-sm text-base-content/60">The admin API returned an empty result for the current filters.</span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>reset filters</button>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                  <th class="font-medium">created</th>
                  <th class="font-medium">order</th>
                  <th class="font-medium">user</th>
                  <th class="font-medium">type</th>
                  <th class="font-medium">state</th>
                  <th class="font-medium">details</th>
                  <th class="font-medium text-right">amount</th>
                  <th class="font-medium">balances</th>
                  <th class="font-medium">reward</th>
                </tr>
              </thead>
              <tbody>
                {#each rows as order (order.orderId)}
                  <tr class="border-b border-base-300 hover:bg-neutral">
                    <td class="font-mono text-xs text-base-content/70">{formatTimestamp(order.createdAt)}</td>
                    <td class="font-mono text-xs text-base-content">{order.orderId}</td>
                    <td class="font-mono text-xs text-base-content/70">{order.userId}</td>
                    <td class="text-xs capitalize text-base-content/70">{labelize(order.type)}</td>
                    <td>
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {stateTone[order.state] || 'bg-base-content/5 text-base-content/60'}">
                        {labelize(order.state)}
                      </span>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="text-sm text-base-content/70">{orderDetail(order)}</span>
                        <span class="font-mono text-[10px] text-base-content/40">{order.source || order.apiKeyId || 'source unavailable'}</span>
                      </div>
                    </td>
                    <td class="text-right font-mono text-sm">{formatValue(order.amount)}</td>
                    <td>
                      <div class="flex flex-col font-mono text-[10px] text-base-content/50">
                        <span>base {formatValue(order.baseBalance)}</span>
                        <span>quote {formatValue(order.quoteBalance)}</span>
                      </div>
                    </td>
                    <td class="font-mono text-[10px] text-base-content/50">{order.rewardAddress || '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-base-content/50">
              API limit max {response.limits.maxLimit}; scan limit {response.limits.maxScanRows} per order type
            </span>
            <div class="join">
              <button
                type="button"
                class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                disabled={!response.pagination.hasPrevious || refreshing}
                onclick={() => goToPage(page - 1)}
              >previous</button>
              <button
                type="button"
                class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                disabled={!response.pagination.hasNext || refreshing}
                onclick={() => goToPage(page + 1)}
              >next</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>

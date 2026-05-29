<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchAdminOrders,
    type AdminOrder,
    type AdminOrderStatus,
    type AdminOrdersResponse,
  } from '$lib/helpers/api/trading';

  const statuses: Array<'all' | AdminOrderStatus> = ['all', 'open', 'filled', 'failed', 'cancelled'];

  const statusTone: Record<string, string> = {
    pending_create: 'bg-warning/10 text-warning',
    open: 'bg-info/10 text-info',
    partially_filled: 'bg-warning/10 text-warning',
    pending_cancel: 'bg-warning/10 text-warning',
    filled: 'bg-success/10 text-success',
    cancelled: 'bg-base-content/5 text-base-content/60',
    failed: 'bg-error/10 text-error',
    external_missing: 'bg-error/10 text-error',
    internal_missing: 'bg-error/10 text-error',
  };

  let response = $state<AdminOrdersResponse | null>(null);
  let statusFilter = $state<'all' | AdminOrderStatus>('all');
  let query = $state('');
  let page = $state(1);
  let limit = $state(25);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  const rows = $derived(response?.items ?? []);

  const formatNumber = (value: string | number, options: Intl.NumberFormatOptions = {}) => {
    const number = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(number)) {
      return String(value || '0');
    }

    return new Intl.NumberFormat('en-US', options).format(number);
  };

  const formatTimestamp = (value?: string | null) => {
    if (!value) {
      return 'unavailable';
    }

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
      return value;
    }

    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Unable to load tracked orders';

  const labelize = (value?: string | null) => (value || 'unavailable').replaceAll('_', ' ');

  const percent = (order: AdminOrder) => {
    const fillPercent = Number(order.fillPercent);

    if (Number.isFinite(fillPercent)) {
      return Math.max(0, Math.min(100, fillPercent));
    }

    const quantity = Number(order.quantity);
    const filled = Number(order.filledQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(filled)) {
      return 0;
    }

    return Math.max(0, Math.min(100, (filled / quantity) * 100));
  };

  const loadOrders = async () => {
    const initialLoad = response === null;

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      response = await fetchAdminOrders({
        status: statusFilter,
        query,
        page,
        limit,
      });
      page = response.pagination.page;
      limit = response.pagination.limit;
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const changeStatus = (next: 'all' | AdminOrderStatus) => {
    statusFilter = next;
    page = 1;
    void loadOrders();
  };

  const applySearch = () => {
    page = 1;
    void loadOrders();
  };

  const resetFilters = () => {
    statusFilter = 'all';
    query = '';
    page = 1;
    void loadOrders();
  };

  const goToPage = (next: number) => {
    if (!response || next < 1 || next > response.pagination.totalPages || next === page) {
      return;
    }

    page = next;
    void loadOrders();
  };

  onMount(() => {
    void loadOrders();
  });
</script>

<section class="space-y-6" data-testid="orders-page">
  <PageHeader
    eyebrow="trading"
    title="orders"
    subtitle="Exchange-tracked orders loaded from the admin API."
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void loadOrders()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">matching orders</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.pagination.total ?? 0)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">updated</span>
        <span class="font-mono text-sm font-semibold text-base-content">{formatTimestamp(response?.generatedAt)}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div class="join">
          {#each statuses as status (status)}
            <button
              type="button"
              class="btn btn-sm join-item capitalize {statusFilter === status ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-100 text-base-content'}"
              disabled={loading || refreshing}
              onclick={() => changeStatus(status)}
            >{labelize(status)}</button>
          {/each}
        </div>

        <input
          type="text"
          placeholder="order id, pair, exchange or strategy…"
          class="input input-sm input-bordered min-w-[260px] flex-1 border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxQueryLength ?? 100}
          bind:value={query}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              applySearch();
            }
          }}
        />

        <button
          type="button"
          class="btn btn-sm btn-ghost rounded-full capitalize"
          disabled={loading || refreshing}
          onclick={applySearch}
        >search</button>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="orders-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">loading backend tracked orders</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="orders-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">orders unavailable</span>
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
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="orders-empty">
            <span class="text-sm font-semibold text-base-content capitalize">no backend orders returned</span>
            <span class="text-sm text-base-content/60">
              The admin API returned an empty result for the current filters; no sample orders are shown.
            </span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>reset filters</button>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                  <th class="font-medium">time</th>
                  <th class="font-medium">order id</th>
                  <th class="font-medium">symbol / pair</th>
                  <th class="font-medium">side</th>
                  <th class="font-medium">type</th>
                  <th class="font-medium text-right">quantity</th>
                  <th class="font-medium text-right">filled</th>
                  <th class="font-medium text-right">price</th>
                  <th class="font-medium">fill</th>
                  <th class="font-medium">status</th>
                  <th class="font-medium">exchange</th>
                  <th class="font-medium">strategy</th>
                  <th class="font-medium">actions</th>
                </tr>
              </thead>
              <tbody>
                {#each rows as order (order.trackingKey)}
                  {@const fillPercent = percent(order)}
                  <tr class="border-b border-base-300 hover:bg-neutral">
                    <td class="font-mono text-xs text-base-content/70">{formatTimestamp(order.updatedAt || order.createdAt)}</td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-xs text-base-content">{order.orderId}</span>
                        <span class="font-mono text-[10px] text-base-content/40">{order.exchangeOrderId || 'exchange id unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-sm text-base-content">{order.pair}</span>
                        <span class="font-mono text-[10px] text-base-content/50">{order.symbol || 'symbol unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        class="text-xs font-medium capitalize"
                        class:text-success={order.side.toLowerCase() === 'buy'}
                        class:text-error={order.side.toLowerCase() === 'sell'}
                      >{order.side}</span>
                    </td>
                    <td class="text-xs text-base-content/70 capitalize">{labelize(order.type || order.role)}</td>
                    <td class="text-right font-mono text-sm">{formatNumber(order.quantity, { maximumFractionDigits: 8 })}</td>
                    <td class="text-right font-mono text-sm">{formatNumber(order.filledQuantity, { maximumFractionDigits: 8 })}</td>
                    <td class="text-right font-mono text-sm">{formatNumber(order.price, { maximumFractionDigits: 8 })}</td>
                    <td>
                      <div class="flex w-24 flex-col gap-1">
                        <div class="flex items-center justify-between">
                          <span class="font-mono text-[10px] text-base-content/60">{fillPercent.toFixed(0)}%</span>
                          <span class="font-mono text-[10px] text-base-content/40">{order.executions.count} exec</span>
                        </div>
                        <div class="h-1 w-full overflow-hidden rounded-full bg-base-300">
                          <div class="h-full bg-base-content" style="width: {fillPercent}%"></div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {statusTone[order.status] || 'bg-base-content/5 text-base-content/60'}">
                        {labelize(order.status)}
                      </span>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="text-sm text-base-content/70 capitalize">{order.exchange}</span>
                        <span class="text-xs text-base-content/50">{order.accountLabel || 'account unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-xs text-base-content/70">{order.strategyKey || 'unattributed'}</span>
                        <span class="text-xs text-base-content/50">{order.slotKey || order.clientOrderId || 'slot unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs rounded-full capitalize text-base-content/60"
                        disabled
                        title="No safe scoped order mutation endpoint is exposed for this action."
                      >disabled</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-base-content/50">
              API limit max {response.limits.maxLimit}; execution scan limit {response.limits.executionScanLimit}
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

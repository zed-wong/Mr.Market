<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchAdminOrders,
    type AdminOrder,
    type AdminOrderStatus,
    type AdminOrdersResponse,
  } from '$lib/helpers/api/trading';

  const statuses: Array<'all' | AdminOrderStatus> = ['all', 'open', 'filled', 'failed', 'cancelled'];
  const autoRefreshIntervalMs = 10_000;

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
  let backgroundRefreshing = $state(false);
  let searchInputFocused = $state(false);
  let error = $state<string | null>(null);
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

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
    cause instanceof Error ? cause.message : $_('admin_exchange_orders_load_failed');

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
      response = await fetchAdminOrders({
        status: statusFilter,
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
      loading: 'refreshing exchange orders',
      success: 'exchange orders refreshed',
      error: 'failed to refresh exchange orders',
    });

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

<section class="space-y-6" data-testid="orders-page">
  <PageHeader
    eyebrow={$_('admin.nav.trading')}
    title={$_('orders')}
    subtitle={$_('admin_exchange_orders_subtitle')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void refreshOrders()}
      >{refreshing ? $_('refreshing_msg') : $_('refresh')}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin_exchange_orders_matching')}</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.pagination.total ?? 0)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin_strategy_updated')}</span>
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
          placeholder={$_('admin_exchange_orders_search_placeholder')}
          class="input input-sm input-bordered min-w-[260px] flex-1 border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxQueryLength ?? 100}
          bind:value={query}
          onfocus={() => (searchInputFocused = true)}
          onblur={() => (searchInputFocused = false)}
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
        >{$_('search')}</button>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="orders-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">{$_('admin_exchange_orders_loading')}</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="orders-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_exchange_orders_unavailable')}</span>
            <span class="text-sm text-base-content/60">{error}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadOrders()}>{$_('admin_retry')}</button>
              <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
            </div>
          </div>
        </div>
      {:else if response}
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-base-content/50">
            {$_('admin_page_count', {
              values: {
                page: response.pagination.page,
                totalPages: response.pagination.totalPages,
                rows: rows.length,
                total: response.pagination.total,
              },
            })}
          </span>
          {#if refreshing}
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
          {/if}
        </div>

        {#if rows.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="orders-empty">
            <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_exchange_orders_empty_title')}</span>
            <span class="text-sm text-base-content/60">
              {$_('admin_exchange_orders_empty_message')}
            </span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                  <th class="font-medium">{$_('time')}</th>
                  <th class="font-medium">{$_('order_id')}</th>
                  <th class="font-medium">{$_('admin_symbol_pair')}</th>
                  <th class="font-medium">{$_('side')}</th>
                  <th class="font-medium">{$_('type')}</th>
                  <th class="font-medium text-right">{$_('admin_quantity')}</th>
                  <th class="font-medium text-right">{$_('filled_orders')}</th>
                  <th class="font-medium text-right">{$_('price')}</th>
                  <th class="font-medium">{$_('admin_fill')}</th>
                  <th class="font-medium">{$_('status')}</th>
                  <th class="font-medium">{$_('exchange')}</th>
                  <th class="font-medium">{$_('admin_direct_mm_strategy')}</th>
                  <th class="font-medium">{$_('actions')}</th>
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
                        title={$_('admin_exchange_orders_action_disabled_title')}
                      >{$_('disabled')}</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-base-content/50">
              {$_('admin_exchange_orders_limit_hint', {
                values: {
                  max: response.limits.maxLimit,
                  scan: response.limits.executionScanLimit,
                },
              })}
            </span>
            <div class="join">
              <button
                type="button"
                class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                disabled={!response.pagination.hasPrevious || refreshing}
                onclick={() => goToPage(page - 1)}
              >{$_('previous')}</button>
              <button
                type="button"
                class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                disabled={!response.pagination.hasNext || refreshing}
                onclick={() => goToPage(page + 1)}
              >{$_('next')}</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>

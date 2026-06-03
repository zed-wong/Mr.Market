<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchAdminSystemHealth,
    type AdminHealthStatus,
    type AdminSystemHealthService,
    type AdminSystemHealthResponse,
  } from '$lib/helpers/api/system';

  const statusDot: Record<AdminHealthStatus, string> = {
    healthy: 'bg-success',
    warning: 'bg-warning',
    critical: 'bg-error',
    unknown: 'bg-base-content/30',
  };

  const statusTone: Record<AdminHealthStatus, string> = {
    healthy: 'text-success',
    warning: 'text-warning',
    critical: 'text-error',
    unknown: 'text-base-content/60',
  };

  const statusTextTone: Record<AdminHealthStatus, string> = {
    healthy: 'text-success',
    warning: 'text-warning',
    critical: 'text-error',
    unknown: 'text-base-content/60',
  };

  let response = $state<AdminSystemHealthResponse | null>(null);
  let viewFilter = $state('all');
  let serviceFilter = $state('all');
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  type HealthViewKey = 'all' | 'trading' | 'data' | 'exchange' | 'orders' | 'infrastructure';

  const healthViews: Array<{ key: HealthViewKey; label: string; description: string }> = [
    { key: 'all', label: 'admin_health_view_all', description: 'admin_health_view_all_desc' },
    { key: 'trading', label: 'admin_health_view_trading', description: 'admin_health_view_trading_desc' },
    { key: 'data', label: 'admin_health_view_data', description: 'admin_health_view_data_desc' },
    { key: 'exchange', label: 'admin_health_view_exchange', description: 'admin_health_view_exchange_desc' },
    { key: 'orders', label: 'admin_health_view_orders', description: 'admin_health_view_orders_desc' },
    { key: 'infrastructure', label: 'admin_health_view_infrastructure', description: 'admin_health_view_infrastructure_desc' },
  ];

  const rawServices = $derived(response?.services ?? []);
  const serviceView = (service: AdminSystemHealthService): Exclude<HealthViewKey, 'all'>[] => {
    if (service.id === 'core.api' || service.group === 'queue' || service.group === 'runtime') {
      return ['infrastructure'];
    }

    if (service.group === 'connector') {
      return service.id.startsWith('connector.balance-cache') ? ['trading', 'data', 'exchange'] : ['trading', 'exchange'];
    }

    if (service.group === 'orders') {
      return ['trading', 'data', 'orders'];
    }

    if (service.group === 'stream') {
      return ['trading', 'data', 'orders'];
    }

    return ['infrastructure'];
  };

  const viewServices = (view: HealthViewKey) =>
    rawServices.filter((service) => view === 'all' || serviceView(service).includes(view));

  const services = $derived.by(() => {
    const rows = viewServices(viewFilter as HealthViewKey);

    return serviceFilter === 'all' ? rows : rows.filter((service) => service.id === serviceFilter);
  });

  const selectedView = $derived(healthViews.find((view) => view.key === viewFilter) ?? healthViews[0]);
  const serviceOptions = $derived.by(() => {
    const available = viewServices(viewFilter as HealthViewKey);

    return ['all', ...available.map((row) => row.id)];
  });

  const reduceStatus = (rows: AdminSystemHealthService[]): AdminHealthStatus => {
    if (rows.some((row) => row.status === 'critical')) {
      return 'critical';
    }

    if (rows.some((row) => row.status === 'warning')) {
      return 'warning';
    }

    if (rows.some((row) => row.status === 'unknown')) {
      return 'unknown';
    }

    return rows.length > 0 ? 'healthy' : 'unknown';
  };

  const statusLabel = (status: AdminHealthStatus, emptyLabel = $_('admin_health_not_configured')) => {
    if (status === 'healthy') {
      return $_('admin_health_ready');
    }

    if (status === 'warning') {
      return $_('admin_health_degraded');
    }

    if (status === 'critical') {
      return $_('admin_health_blocked');
    }

    return emptyLabel;
  };

  const cardStatus = (view: HealthViewKey) => reduceStatus(viewServices(view));
  const tradingStatus = $derived(cardStatus('trading'));
  const dataStatus = $derived(cardStatus('data'));
  const exchangeStatus = $derived(cardStatus('exchange'));
  const infrastructureStatus = $derived(cardStatus('infrastructure'));

  const cardSummary = (view: HealthViewKey) => {
    const rows = viewServices(view);
    const critical = rows.filter((row) => row.status === 'critical').length;
    const warning = rows.filter((row) => row.status === 'warning').length;
    const unknown = rows.filter((row) => row.status === 'unknown').length;

    if (critical > 0) {
      return $_('admin_health_summary_blocked', { values: { count: formatNumber(critical) } });
    }

    if (warning > 0) {
      return $_('admin_health_summary_degraded', { values: { count: formatNumber(warning) } });
    }

    if (unknown > 0) {
      return $_('admin_health_summary_not_configured', { values: { count: formatNumber(unknown) } });
    }

    return $_('admin_health_summary_ready', { values: { count: formatNumber(rows.length) } });
  };

  const formatNumber = (value: number | string | undefined) => {
    const number = Number(value ?? 0);

    if (!Number.isFinite(number)) {
      return String(value ?? '0');
    }

    return new Intl.NumberFormat('en-US').format(number);
  };

  const formatTimestamp = (value?: string | null) => {
    if (!value) {
      return $_('admin_unavailable');
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

  const readNumber = (value: unknown) => {
    const number = Number(value ?? 0);

    return Number.isFinite(number) ? number : 0;
  };

  const serviceImpact = (service: AdminSystemHealthService) => {
    if (service.id === 'core.api') {
      return $_('admin_health_impact_core_api');
    }

    if (service.id === 'queue.snapshots') {
      return $_('admin_health_impact_snapshots');
    }

    if (service.id === 'runtime.timing') {
      return $_('admin_health_impact_runtime_timing');
    }

    if (service.id === 'connector.api-keys') {
      return $_('admin_health_impact_api_keys');
    }

    if (service.id.startsWith('connector.balance-cache')) {
      return service.status === 'unknown'
        ? $_('admin_health_impact_balance_cache_missing')
        : $_('admin_health_impact_balance_cache');
    }

    if (service.id === 'stream.user') {
      return $_('admin_health_impact_user_stream');
    }

    if (service.id === 'orders.tracker') {
      return $_('admin_health_impact_order_tracker');
    }

    return service.message;
  };

  const serviceMeta = (service: AdminSystemHealthService) => {
    const parts: string[] = [];

    if (service.metrics) {
      const waiting = readNumber(service.metrics.waiting);
      const active = readNumber(service.metrics.active);
      const failed = readNumber(service.metrics.failed);
      const delayed = readNumber(service.metrics.delayed);

      if (waiting || active || failed || delayed || service.id === 'queue.snapshots') {
        parts.push($_('admin_health_meta_waiting', { values: { count: formatNumber(waiting) } }));
        parts.push($_('admin_health_meta_active', { values: { count: formatNumber(active) } }));
        parts.push($_('admin_health_meta_failed', { values: { count: formatNumber(failed) } }));
        parts.push($_('admin_health_meta_delayed', { values: { count: formatNumber(delayed) } }));
      }
    }

    if (service.details && typeof service.details.isPollingActive === 'boolean') {
      parts.push(service.details.isPollingActive ? $_('admin_health_polling_active') : $_('admin_health_polling_inactive'));
    }

    if (service.details && typeof service.details.recentFailureCount === 'number') {
      parts.push($_('admin_health_recent_failures', { values: { count: formatNumber(service.details.recentFailureCount) } }));
    }

    return parts.join(' · ');
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : $_('admin_health_load_failed');

  const loadHealth = async (options: { throwOnError?: boolean } = {}) => {
    const initialLoad = response === null;

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      response = await fetchAdminSystemHealth();
    } catch (cause) {
      error = errorMessage(cause);
      if (options.throwOnError) {
        throw new Error(error);
      }
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const refreshHealth = () =>
    toast.promise(loadHealth({ throwOnError: true }), {
      loading: $_('admin_health_refreshing'),
      success: $_('admin_health_refreshed'),
      error: $_('admin_health_refresh_failed'),
    });

  const changeView = (next: HealthViewKey) => {
    viewFilter = next;
    serviceFilter = 'all';
  };

  const changeService = () => {};

  const resetFilters = () => {
    viewFilter = 'all';
    serviceFilter = 'all';
  };

  onMount(() => {
    void loadHealth();
  });
</script>

<section class="space-y-6" data-testid="system-health-page">
  <PageHeader
    eyebrow={$_('admin.nav.system')}
    title={$_('admin.nav.health')}
    subtitle={$_('admin_health_subtitle')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void refreshHealth()}
      >{refreshing ? $_('refreshing_msg') : $_('refresh')}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">{$_('admin_health_trading_readiness')}</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[tradingStatus]}">
          {response ? statusLabel(tradingStatus) : $_('admin_health_pending')}
        </span>
        <span class="text-xs text-base-content/50">{response ? cardSummary('trading') : $_('admin_health_loading_checks')}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">{$_('admin_health_data_freshness')}</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[dataStatus]}">
          {response ? statusLabel(dataStatus) : $_('admin_health_pending')}
        </span>
        <span class="text-xs text-base-content/50">{response ? cardSummary('data') : $_('admin_health_loading_checks')}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">{$_('admin_health_exchange_access')}</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[exchangeStatus]}">
          {response ? statusLabel(exchangeStatus) : $_('admin_health_pending')}
        </span>
        <span class="text-xs text-base-content/50">{response ? cardSummary('exchange') : $_('admin_health_loading_checks')}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">{$_('admin_health_infrastructure')}</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[infrastructureStatus]}">
          {response ? statusLabel(infrastructureStatus) : $_('admin_health_pending')}
        </span>
        <span class="text-xs text-base-content/50">{$_('admin_health_updated_at', { values: { time: formatTimestamp(response?.generatedAt) } })}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <span class="text-lg font-semibold tracking-tight text-base-content">{$_('admin_health_checks')}</span>
          <span class="text-sm text-base-content/55">{$_(selectedView.description)}</span>
        </div>

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div class="join w-full overflow-x-auto lg:w-auto">
          {#each healthViews as view (view.key)}
            <button
              type="button"
              class="btn btn-sm join-item shrink-0 {viewFilter === view.key ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-100 text-base-content'}"
              disabled={loading || refreshing}
              onclick={() => changeView(view.key)}
            >{$_(view.label)}</button>
          {/each}
          </div>
          <div class="flex items-center gap-3 lg:ml-auto">
            <select
              class="select select-sm select-bordered w-full border-base-300 bg-base-100 text-xs lg:w-72"
              bind:value={serviceFilter}
              disabled={loading || refreshing}
              onchange={changeService}
            >
              {#each serviceOptions as service (service)}
                <option value={service}>{service === 'all' ? $_('admin_health_all_checks_in_view') : service}</option>
              {/each}
            </select>
            <span class="shrink-0 font-mono text-xs text-base-content/50">{services.length} / {rawServices.length}</span>
          </div>
        </div>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="health-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">{$_('admin_health_loading_status')}</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="health-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_health_unavailable')}</span>
            <span class="text-sm text-base-content/60">{error}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadHealth()}>{$_('admin_retry')}</button>
              <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
            </div>
          </div>
        </div>
      {:else if response}
        {#if refreshing}
          <div class="flex items-center gap-3">
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
            <span class="text-xs text-base-content/50 capitalize">{$_('admin_health_refreshing')}</span>
          </div>
        {/if}

        {#if services.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="health-empty">
            <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_health_empty_title')}</span>
            <span class="text-sm text-base-content/60">{$_('admin_health_empty_message')}</span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                  <th class="font-medium">{$_('admin_health_col_check')}</th>
                  <th class="font-medium">{$_('admin_health_col_state')}</th>
                  <th class="font-medium">{$_('admin_health_col_meaning')}</th>
                  <th class="font-medium">{$_('admin_health_col_issues')}</th>
                </tr>
              </thead>
              <tbody>
                {#each services as service (service.id)}
                  {@const meta = serviceMeta(service)}
                  <tr class="border-b border-base-300 hover:bg-neutral">
                    <td>
                      <div class="flex flex-col">
                        <span class="text-sm font-medium text-base-content">{service.name}</span>
                        <span class="font-mono text-xs text-base-content/50">{service.id} · {service.group}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex items-center gap-2">
                        <span class="h-1.5 w-1.5 rounded-full {statusDot[service.status]}"></span>
                        <span class="text-xs font-semibold capitalize {statusTone[service.status]}">
                          {statusLabel(service.status)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col gap-1">
                        <span class="text-sm text-base-content/70">{serviceImpact(service)}</span>
                        <span class="text-xs text-base-content/45">{service.message}</span>
                        {#if meta}
                          <span class="font-mono text-xs text-base-content/45">{meta}</span>
                        {/if}
                      </div>
                    </td>
                    <td>
                      {#if service.issues && service.issues.length > 0}
                        <div class="flex flex-col gap-1">
                          {#each service.issues.slice(0, 3) as issue (issue)}
                            <span
                              class="text-xs"
                              class:text-error={service.status === 'critical'}
                              class:text-warning={service.status !== 'critical'}
                            >
                              {issue}
                            </span>
                          {/each}
                        </div>
                      {:else}
                        <span class="text-xs text-base-content/30">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>

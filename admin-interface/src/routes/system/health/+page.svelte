<script lang="ts">
  import { onMount } from 'svelte';
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
    { key: 'all', label: 'All', description: 'Every backend health check returned by the admin API.' },
    { key: 'trading', label: 'Trading', description: 'Checks that affect whether trading can run.' },
    { key: 'data', label: 'Data freshness', description: 'Balances, streams, and order state freshness.' },
    { key: 'exchange', label: 'Exchange access', description: 'API keys and exchange account connectivity.' },
    { key: 'orders', label: 'Orders', description: 'Tracked orders and user-stream order ingestion.' },
    { key: 'infrastructure', label: 'Infrastructure', description: 'API process, queues, and runtime diagnostics.' },
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

  const statusLabel = (status: AdminHealthStatus, emptyLabel = 'Not configured') => {
    if (status === 'healthy') {
      return 'Ready';
    }

    if (status === 'warning') {
      return 'Degraded';
    }

    if (status === 'critical') {
      return 'Blocked';
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
      return `${formatNumber(critical)} blocked`;
    }

    if (warning > 0) {
      return `${formatNumber(warning)} degraded`;
    }

    if (unknown > 0) {
      return `${formatNumber(unknown)} not configured`;
    }

    return `${formatNumber(rows.length)} checks ready`;
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

  const readNumber = (value: unknown) => {
    const number = Number(value ?? 0);

    return Number.isFinite(number) ? number : 0;
  };

  const serviceImpact = (service: AdminSystemHealthService) => {
    if (service.id === 'core.api') {
      return 'Admin API is reachable.';
    }

    if (service.id === 'queue.snapshots') {
      return 'Snapshot polling diagnostics. Usually not a trading blocker.';
    }

    if (service.id === 'runtime.timing') {
      return 'Backend timing diagnostics for slow operations.';
    }

    if (service.id === 'connector.api-keys') {
      return 'Exchange credentials and permissions can be checked.';
    }

    if (service.id.startsWith('connector.balance-cache')) {
      return service.status === 'unknown'
        ? 'No balance cache account is registered.'
        : 'Balance data freshness for exchange accounts.';
    }

    if (service.id === 'stream.user') {
      return 'Private user-stream events are being ingested.';
    }

    if (service.id === 'orders.tracker') {
      return 'Tracked exchange orders can be reconciled with local orders.';
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
        parts.push(`waiting ${formatNumber(waiting)}`);
        parts.push(`active ${formatNumber(active)}`);
        parts.push(`failed ${formatNumber(failed)}`);
        parts.push(`delayed ${formatNumber(delayed)}`);
      }
    }

    if (service.details && typeof service.details.isPollingActive === 'boolean') {
      parts.push(service.details.isPollingActive ? 'polling active' : 'polling inactive');
    }

    if (service.details && typeof service.details.recentFailureCount === 'number') {
      parts.push(`${formatNumber(service.details.recentFailureCount)} recent failures`);
    }

    return parts.join(' · ');
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Unable to load system health';

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
      loading: 'refreshing health status',
      success: 'health status refreshed',
      error: 'failed to refresh health status',
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
    eyebrow="system"
    title="health"
    subtitle="Trading readiness, data freshness, exchange access, and infrastructure diagnostics from the admin API."
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void refreshHealth()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">Trading readiness</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[tradingStatus]}">
          {response ? statusLabel(tradingStatus) : 'Pending'}
        </span>
        <span class="text-xs text-base-content/50">{response ? cardSummary('trading') : 'loading checks'}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">Data freshness</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[dataStatus]}">
          {response ? statusLabel(dataStatus) : 'Pending'}
        </span>
        <span class="text-xs text-base-content/50">{response ? cardSummary('data') : 'loading checks'}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">Exchange access</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[exchangeStatus]}">
          {response ? statusLabel(exchangeStatus) : 'Pending'}
        </span>
        <span class="text-xs text-base-content/50">{response ? cardSummary('exchange') : 'loading checks'}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60">Infrastructure</span>
        <span class="font-mono text-xl font-semibold {statusTextTone[infrastructureStatus]}">
          {response ? statusLabel(infrastructureStatus) : 'Pending'}
        </span>
        <span class="text-xs text-base-content/50">Updated {formatTimestamp(response?.generatedAt)}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <span class="text-lg font-semibold tracking-tight text-base-content">Health checks</span>
          <span class="text-sm text-base-content/55">{selectedView.description}</span>
        </div>

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div class="join w-full overflow-x-auto lg:w-auto">
          {#each healthViews as view (view.key)}
            <button
              type="button"
              class="btn btn-sm join-item shrink-0 {viewFilter === view.key ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-100 text-base-content'}"
              disabled={loading || refreshing}
              onclick={() => changeView(view.key)}
            >{view.label}</button>
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
                <option value={service}>{service === 'all' ? 'All checks in this view' : service}</option>
              {/each}
            </select>
            <span class="shrink-0 font-mono text-xs text-base-content/50">{services.length} / {rawServices.length}</span>
          </div>
        </div>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="health-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">loading backend health status</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="health-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">health unavailable</span>
            <span class="text-sm text-base-content/60">{error}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadHealth()}>retry</button>
              <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>reset filters</button>
            </div>
          </div>
        </div>
      {:else if response}
        {#if refreshing}
          <div class="flex items-center gap-3">
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
            <span class="text-xs text-base-content/50 capitalize">refreshing health status</span>
          </div>
        {/if}

        {#if services.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="health-empty">
            <span class="text-sm font-semibold text-base-content capitalize">no backend services returned</span>
            <span class="text-sm text-base-content/60">The health API returned no rows for the selected filters; no fixture services are shown.</span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>reset filters</button>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                  <th class="font-medium">check</th>
                  <th class="font-medium">state</th>
                  <th class="font-medium">what it means</th>
                  <th class="font-medium">issues</th>
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

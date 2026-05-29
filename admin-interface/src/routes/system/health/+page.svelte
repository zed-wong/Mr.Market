<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchAdminSystemHealth,
    type AdminHealthStatus,
    type AdminSystemHealthResponse,
  } from '$lib/helpers/api/system';

  const statusDot: Record<AdminHealthStatus, string> = {
    healthy: 'bg-success',
    warning: 'bg-warning',
    critical: 'bg-error',
    unknown: 'bg-base-content/30',
  };

  const statusTone: Record<AdminHealthStatus, string> = {
    healthy: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    critical: 'bg-error/10 text-error',
    unknown: 'bg-base-content/5 text-base-content/60',
  };

  let response = $state<AdminSystemHealthResponse | null>(null);
  let groupFilter = $state('all');
  let serviceFilter = $state('all');
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  const services = $derived(response?.services ?? []);
  const groups = $derived(['all', ...(response?.filters.availableGroups ?? [])]);
  const serviceOptions = $derived.by(() => {
    const available = response?.filters.availableServices ?? [];
    const filtered = groupFilter === 'all' ? available : available.filter((row) => row.group === groupFilter);

    return ['all', ...filtered.map((row) => row.id)];
  });

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

  const labelize = (value?: string | null) => (value || 'unavailable').replaceAll('_', ' ');

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Unable to load system health';

  const loadHealth = async (options: { throwOnError?: boolean } = {}) => {
    const initialLoad = response === null;

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      response = await fetchAdminSystemHealth({
        group: groupFilter,
        service: serviceFilter,
      });
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

  const changeGroup = (next: string) => {
    groupFilter = next;
    serviceFilter = 'all';
    void loadHealth();
  };

  const changeService = () => {
    void loadHealth();
  };

  const resetFilters = () => {
    groupFilter = 'all';
    serviceFilter = 'all';
    void loadHealth();
  };

  onMount(() => {
    void loadHealth();
  });
</script>

<section class="space-y-6" data-testid="system-health-page">
  <PageHeader
    eyebrow="system"
    title="health"
    subtitle="Authenticated server health, connector, runtime, queue, and tracked-order status from the admin API."
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

  <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">overall status</span>
        <span class="font-mono text-xl font-semibold capitalize {response ? statusTone[response.overallStatus] : 'text-base-content'}">
          {response?.overallStatus ?? 'pending'}
        </span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">critical</span>
        <span class="font-mono text-2xl font-semibold text-error">{formatNumber(response?.summary.critical)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">healthy</span>
        <span class="font-mono text-2xl font-semibold text-success">{formatNumber(response?.summary.healthy)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">warnings</span>
        <span class="font-mono text-2xl font-semibold text-warning">{formatNumber(response?.summary.warning)}</span>
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
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-lg font-semibold tracking-tight text-base-content capitalize">services</span>
        <div class="join">
          {#each groups as group (group)}
            <button
              type="button"
              class="btn btn-sm join-item capitalize {groupFilter === group ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-100 text-base-content'}"
              disabled={loading || refreshing}
              onclick={() => changeGroup(group)}
            >{labelize(group)}</button>
          {/each}
        </div>
        <select
          class="select select-sm select-bordered border-base-300 bg-base-100 font-mono text-xs"
          bind:value={serviceFilter}
          disabled={loading || refreshing}
          onchange={changeService}
        >
          {#each serviceOptions as service (service)}
            <option value={service}>{service === 'all' ? 'all services' : service}</option>
          {/each}
        </select>
        <span class="ml-auto font-mono text-xs text-base-content/50">{services.length} / {response?.summary.total ?? 0}</span>
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
                  <th class="font-medium">service</th>
                  <th class="font-medium">status</th>
                  <th class="font-medium">message</th>
                  <th class="font-medium">issues</th>
                </tr>
              </thead>
              <tbody>
                {#each services as service (service.id)}
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
                        <span class="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {statusTone[service.status]}">
                          {service.status}
                        </span>
                      </div>
                    </td>
                    <td class="text-sm text-base-content/70">{service.message}</td>
                    <td>
                      {#if service.issues && service.issues.length > 0}
                        <div class="flex flex-col gap-1">
                          {#each service.issues.slice(0, 3) as issue (issue)}
                            <span class="text-xs text-warning">{issue}</span>
                          {/each}
                        </div>
                      {:else}
                        <span class="text-xs text-base-content/40 capitalize">none reported</span>
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

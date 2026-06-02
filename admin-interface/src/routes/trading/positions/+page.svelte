<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchAdminPositions,
    type AdminPosition,
    type AdminPositionsResponse,
  } from '$lib/helpers/api/trading';

  const limitOptions = [10, 25, 50, 100];

  let response = $state<AdminPositionsResponse | null>(null);
  let exchangeFilter = $state('all');
  let assetFilter = $state('');
  let query = $state('');
  let lockedOnly = $state(false);
  let page = $state(1);
  let limit = $state(25);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  const rows = $derived(response?.items ?? []);
  const assetRows = $derived(response?.summary.byAsset ?? []);
  const displayedRows = $derived(
    lockedOnly ? rows.filter((position) => Number(position.locked) > 0) : rows,
  );
  const lockedRows = $derived(rows.filter((position) => Number(position.locked) > 0));
  const mappedRows = $derived(rows.filter((position) => position.exchange && position.accountLabel));

  const exchangeOptions = $derived.by(() => {
    const exchanges = new Set(
      rows
        .map((position) => position.exchange)
        .filter((exchange): exchange is string => Boolean(exchange)),
    );

    if (response?.filters.exchange) {
      exchanges.add(response.filters.exchange);
    }

    return ['all', ...[...exchanges].sort()];
  });

  const formatNumber = (value: string | number | null | undefined, options: Intl.NumberFormatOptions = {}) => {
    if (value === null || value === undefined || value === '') {
      return 'unavailable';
    }

    const number = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
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

  const labelize = (value?: string | null) => (value || 'unavailable').replaceAll('_', ' ');

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Unable to load backend positions';

  const shortId = (value?: string | null) => {
    if (!value) {
      return 'unavailable';
    }

    return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  };

  const shortStrategy = (value?: string | null) =>
    shortId(value?.replace(/-pureMarketMaking$/i, '').replace(/-marketMaking$/i, ''));

  const statusTone = (value?: string | null) => {
    const status = (value || '').toLowerCase();

    if (status === 'running' || status === 'open') {
      return 'text-success';
    }

    if (status === 'stopped' || status === 'cancelled' || status === 'canceled') {
      return 'text-base-content/50';
    }

    return 'text-warning';
  };

  const loadPositions = async (options: { throwOnError?: boolean } = {}) => {
    const initialLoad = response === null;

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      response = await fetchAdminPositions({
        exchange: exchangeFilter,
        asset: assetFilter,
        query,
        page,
        limit,
      });
      page = response.pagination.page;
      limit = response.pagination.limit;
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

  const refreshPositions = () =>
    toast.promise(loadPositions({ throwOnError: true }), {
      loading: 'refreshing positions',
      success: 'positions refreshed',
      error: 'failed to refresh positions',
    });

  const applyFilters = () => {
    page = 1;
    void loadPositions();
  };

  const resetFilters = () => {
    exchangeFilter = 'all';
    assetFilter = '';
    query = '';
    lockedOnly = false;
    page = 1;
    void loadPositions();
  };

  const changeExchange = () => {
    page = 1;
    void loadPositions();
  };

  const changeLimit = () => {
    page = 1;
    void loadPositions();
  };

  const goToPage = (next: number) => {
    if (!response || next < 1 || next > response.pagination.totalPages || next === page) {
      return;
    }

    page = next;
    void loadPositions();
  };

  const dataSources = (position: AdminPosition) =>
    position.dataSources.length > 0 ? position.dataSources.map(labelize).join(', ') : 'source unavailable';

  onMount(() => {
    void loadPositions();
  });
</script>

<section class="space-y-6" data-testid="positions-page">
  <PageHeader
    eyebrow="trading"
    title="positions"
    subtitle="Track available and locked balances by asset, exchange, and strategy."
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void refreshPositions()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">positions</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.pagination.total ?? 0)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">locked positions</span>
        <span class="font-mono text-2xl font-semibold" class:text-warning={lockedRows.length > 0} class:text-base-content={lockedRows.length === 0}>
          {formatNumber(lockedRows.length)}
        </span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">mapped accounts</span>
        <span class="font-mono text-2xl font-semibold text-base-content">
          {formatNumber(mappedRows.length)} / {formatNumber(rows.length)}
        </span>
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
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold tracking-tight capitalize">inventory by asset</span>
        <span class="text-xs text-base-content/50 font-mono">{assetRows.length} assets</span>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">loading backend position summary</span>
        </div>
      {:else if assetRows.length === 0}
        <div class="rounded-lg border border-base-300 p-4">
          <span class="text-sm text-base-content/60">No asset totals were returned by the backend summary.</span>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {#each assetRows as asset (asset.asset)}
            {@const total = Number(asset.total)}
            {@const locked = Number(asset.locked)}
            {@const lockedPct = total > 0 && Number.isFinite(locked) ? (locked / total) * 100 : 0}
            <div class="rounded-lg border border-base-300 p-3">
              <div class="flex items-center justify-between gap-3">
                <span class="font-mono text-sm font-semibold text-base-content">{asset.asset}</span>
                <span class="font-mono text-sm text-base-content">{formatNumber(asset.total, { maximumFractionDigits: 8 })}</span>
              </div>
              <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-base-300">
                <div class="h-full w-full bg-base-content"></div>
                <div
                  class="-mt-1.5 h-full bg-warning"
                  style="width: {Math.max(0, Math.min(100, lockedPct))}%"
                ></div>
              </div>
              <div class="mt-2 flex flex-col gap-1">
                <span class="text-xs text-base-content/50">
                  available {formatNumber(asset.available, { maximumFractionDigits: 8 })}
                </span>
                <span class="text-xs {lockedPct > 0 ? 'text-warning' : 'text-base-content/50'}">
                  locked {formatNumber(asset.locked, { maximumFractionDigits: 8 })} · {lockedPct.toFixed(1)}%
                </span>
              </div>
            </div>
          {/each}
        </div>
        {#if response?.summary.truncated}
          <span class="text-xs text-warning">Summary is truncated by backend metadata scan limits.</span>
        {/if}
      {/if}
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-lg font-semibold tracking-tight capitalize">positions</span>
        <select
          class="select select-sm select-bordered ml-auto min-w-44 border-base-300 bg-base-100 capitalize"
          bind:value={exchangeFilter}
          disabled={loading || refreshing}
          onchange={changeExchange}
        >
          {#each exchangeOptions as exchange (exchange)}
            <option value={exchange}>{exchange === 'all' ? 'all exchanges' : exchange}</option>
          {/each}
        </select>
        <input
          type="text"
          placeholder="asset id…"
          class="input input-sm input-bordered w-32 border-base-300 bg-base-100 font-mono text-xs"
          maxlength="64"
          bind:value={assetFilter}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              applyFilters();
            }
          }}
        />
        <input
          type="text"
          placeholder="order or asset search…"
          class="input input-sm input-bordered min-w-[220px] border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxQueryLength ?? 100}
          bind:value={query}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              applyFilters();
            }
          }}
        />
        <label class="flex cursor-pointer items-center gap-2 rounded-full border border-base-300 px-3 py-1.5 text-xs text-base-content/70">
          <input type="checkbox" class="checkbox checkbox-xs" bind:checked={lockedOnly} />
          <span class="capitalize">locked only</span>
        </label>
        <button
          type="button"
          class="btn btn-sm btn-primary rounded-full capitalize"
          disabled={loading || refreshing}
          onclick={applyFilters}
        >filter</button>
      </div>

      {#if loading}
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="positions-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">loading backend positions</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="positions-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">positions unavailable</span>
            <span class="text-sm text-base-content/60">{error}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadPositions()}>retry</button>
              <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>reset filters</button>
            </div>
          </div>
        </div>
      {:else if response}
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-base-content/50">
            page {response.pagination.page} / {response.pagination.totalPages} · {displayedRows.length} shown · {response.pagination.total} total
          </span>
          {#if refreshing}
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
          {/if}
        </div>

        {#if displayedRows.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="positions-empty">
            <span class="text-sm font-semibold text-base-content capitalize">no backend positions returned</span>
            <span class="text-sm text-base-content/60">
              The admin API returned an empty result for the current filters; no sample balances are shown.
            </span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>reset filters</button>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                  <th class="font-medium">asset</th>
                  <th class="font-medium">exchange</th>
                  <th class="font-medium">strategy</th>
                  <th class="font-medium">order</th>
                  <th class="font-medium">status</th>
                  <th class="font-medium text-right">total</th>
                  <th class="font-medium text-right">available</th>
                  <th class="font-medium text-right">locked</th>
                  <th class="font-medium">source</th>
                  <th class="font-medium">updated</th>
                </tr>
              </thead>
              <tbody>
                {#each displayedRows as position (position.id)}
                  {@const status = position.strategyStatus || position.orderStatus}
                  {@const isMapped = Boolean(position.exchange && position.accountLabel)}
                  <tr class="border-b border-base-300 hover:bg-neutral">
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-sm font-medium text-base-content">{position.asset}</span>
                        <span class="font-mono text-[10px] text-base-content/50">{position.assetId}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="text-sm capitalize {isMapped ? 'text-base-content' : 'text-base-content/50'}">
                          {position.exchange || 'unmapped'}
                        </span>
                        <span class="text-xs text-base-content/50">{position.accountLabel || 'account unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-xs text-base-content/70" title={position.strategyKey || ''}>
                          {shortStrategy(position.strategyKey)}
                        </span>
                        <span class="text-xs text-base-content/50 capitalize">{labelize(position.strategyType)}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-xs text-base-content" title={position.orderId}>{shortId(position.orderId)}</span>
                        <span class="text-xs text-base-content/50">{position.pair || 'pair unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <span class="text-xs font-semibold capitalize {statusTone(status)}">
                        {labelize(status)}
                      </span>
                    </td>
                    <td class="text-right font-mono text-sm">{formatNumber(position.total, { maximumFractionDigits: 8 })}</td>
                    <td class="text-right font-mono text-sm">{formatNumber(position.available, { maximumFractionDigits: 8 })}</td>
                    <td class="text-right font-mono text-sm" class:text-warning={Number(position.locked) > 0}>
                      {formatNumber(position.locked, { maximumFractionDigits: 8 })}
                    </td>
                    <td class="text-xs text-base-content/60 capitalize">{dataSources(position)}</td>
                    <td class="font-mono text-xs text-base-content/60">{formatTimestamp(position.updatedAt)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-base-content/50">
              API limit max {response.limits.maxLimit}; metadata scan limit {response.limits.metadataScanLimit}
            </span>
            <div class="flex flex-wrap items-center gap-2">
              <select
                class="select select-sm select-bordered border-base-300 bg-base-100 font-mono text-xs"
                bind:value={limit}
                disabled={loading || refreshing}
                onchange={changeLimit}
                aria-label="rows per page"
              >
                {#each limitOptions as option (option)}
                  <option value={option}>{option} rows</option>
                {/each}
              </select>
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
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>

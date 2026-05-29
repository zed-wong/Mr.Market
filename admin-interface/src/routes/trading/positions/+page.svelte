<script lang="ts">
  import { onMount } from 'svelte';
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
  let page = $state(1);
  let limit = $state(25);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  const rows = $derived(response?.items ?? []);
  const assetRows = $derived(response?.summary.byAsset ?? []);

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

  const unavailableReason = $derived(
    rows.find((position) => position.pnl.unavailableReason)?.pnl.unavailableReason ||
      'PnL metrics are unavailable because the backend did not return cost basis or mark-price valuation data.',
  );

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

  const safeMetric = (value: string | null, reason?: string) => ({
    value: value === null ? 'unavailable' : formatNumber(value, { maximumFractionDigits: 8 }),
    reason: value === null ? reason || unavailableReason : null,
  });

  const loadPositions = async () => {
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
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const applyFilters = () => {
    page = 1;
    void loadPositions();
  };

  const resetFilters = () => {
    exchangeFilter = 'all';
    assetFilter = '';
    query = '';
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
    subtitle="Order-scoped balances loaded from the admin API. PnL and mark metrics are shown only when the backend can support them; refresh is manual."
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full capitalize"
        disabled
        title="Snapshot is unavailable because no safe backend snapshot workflow exists for this page."
      >snapshot unavailable</button>
      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full capitalize"
        disabled
        title="Reconcile is unavailable because this page exposes read-only positions only."
      >reconcile unavailable</button>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void loadPositions()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">matching positions</span>
        <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(response?.pagination.total ?? 0)}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">ledger rows scanned</span>
        <span class="font-mono text-2xl font-semibold text-base-content">
          {formatNumber(response?.summary.scannedRows ?? 0)} / {formatNumber(response?.summary.totalRows ?? 0)}
        </span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">pnl metrics</span>
        <span class="font-mono text-lg font-semibold text-base-content">unavailable</span>
        <span class="text-xs text-base-content/40">no fabricated mark data</span>
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
            <div class="rounded-lg border border-base-300 p-3">
              <div class="flex items-center justify-between gap-3">
                <span class="font-mono text-sm font-semibold text-base-content">{asset.asset}</span>
                <span class="font-mono text-sm text-base-content">{formatNumber(asset.total, { maximumFractionDigits: 8 })}</span>
              </div>
              <div class="mt-2 flex flex-col gap-1">
                <span class="text-xs text-base-content/50">
                  available {formatNumber(asset.available, { maximumFractionDigits: 8 })}
                </span>
                <span class="text-xs text-base-content/50">
                  locked {formatNumber(asset.locked, { maximumFractionDigits: 8 })}
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
          class="select select-sm select-bordered ml-auto border-base-300 bg-base-100 capitalize"
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
          class="input input-sm input-bordered min-w-[200px] border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxQueryLength ?? 100}
          bind:value={query}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              applyFilters();
            }
          }}
        />
        <button
          type="button"
          class="btn btn-sm btn-ghost rounded-full capitalize"
          disabled={loading || refreshing}
          onclick={applyFilters}
        >filter</button>
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
            page {response.pagination.page} / {response.pagination.totalPages} · {rows.length} of {response.pagination.total}
          </span>
          {#if refreshing}
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
          {/if}
        </div>

        <div class="rounded-lg border border-base-300 p-4">
          <span class="text-sm font-semibold text-base-content capitalize">unavailable valuation metrics</span>
          <span class="mt-1 block text-sm text-base-content/60">{unavailableReason}</span>
        </div>

        {#if rows.length === 0}
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
                  <th class="font-medium">order</th>
                  <th class="font-medium">strategy</th>
                  <th class="font-medium text-right">quantity</th>
                  <th class="font-medium text-right">available</th>
                  <th class="font-medium text-right">locked</th>
                  <th class="font-medium text-right">exposure</th>
                  <th class="font-medium text-right">avg cost</th>
                  <th class="font-medium text-right">realized pnl</th>
                  <th class="font-medium text-right">unrealized pnl</th>
                  <th class="font-medium">source</th>
                  <th class="font-medium">updated</th>
                </tr>
              </thead>
              <tbody>
                {#each rows as position (position.id)}
                  {@const exposure = safeMetric(position.exposure.notional, position.exposure.unavailableReason)}
                  {@const avgCost = safeMetric(position.avgCost, position.pnl.unavailableReason)}
                  {@const realized = safeMetric(position.realizedPnl, position.pnl.unavailableReason)}
                  {@const unrealized = safeMetric(position.unrealizedPnl, position.pnl.unavailableReason)}
                  <tr class="border-b border-base-300 hover:bg-neutral">
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-sm font-medium text-base-content">{position.asset}</span>
                        <span class="font-mono text-[10px] text-base-content/50">{position.assetId}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="text-sm text-base-content/70 capitalize">{position.exchange || 'unavailable'}</span>
                        <span class="text-xs text-base-content/50">{position.accountLabel || 'account unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-xs text-base-content">{position.orderId}</span>
                        <span class="text-xs text-base-content/50">{position.pair || 'pair unavailable'}</span>
                      </div>
                    </td>
                    <td>
                      <div class="flex flex-col">
                        <span class="font-mono text-xs text-base-content/70">{position.strategyKey || 'unattributed'}</span>
                        <span class="text-xs text-base-content/50 capitalize">{labelize(position.strategyStatus || position.orderStatus)}</span>
                      </div>
                    </td>
                    <td class="text-right font-mono text-sm">{formatNumber(position.quantity, { maximumFractionDigits: 8 })}</td>
                    <td class="text-right font-mono text-sm">{formatNumber(position.available, { maximumFractionDigits: 8 })}</td>
                    <td class="text-right font-mono text-sm">{formatNumber(position.locked, { maximumFractionDigits: 8 })}</td>
                    <td class="text-right">
                      <span class="font-mono text-sm text-base-content/70" title={exposure.reason || ''}>{exposure.value}</span>
                    </td>
                    <td class="text-right">
                      <span class="font-mono text-sm text-base-content/70" title={avgCost.reason || ''}>{avgCost.value}</span>
                    </td>
                    <td class="text-right">
                      <span class="font-mono text-sm text-base-content/70" title={realized.reason || ''}>{realized.value}</span>
                    </td>
                    <td class="text-right">
                      <span class="font-mono text-sm text-base-content/70" title={unrealized.reason || ''}>{unrealized.value}</span>
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

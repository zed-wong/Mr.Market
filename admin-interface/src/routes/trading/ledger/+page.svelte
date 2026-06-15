<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    fetchLedgerSummary,
    fetchLedgerEntries,
    fetchLedgerBalances,
    type LedgerSummaryResponse,
    type LedgerEntriesResponse,
    type LedgerBalancesResponse,
    type LedgerEntry,
    type LedgerBalance,
    type LedgerEntryType,
    LEDGER_ENTRY_TYPES,
  } from '$lib/helpers/api/trading';

  const limitOptions = [10, 25, 50, 100];

  let summary = $state<LedgerSummaryResponse | null>(null);
  let entriesResponse = $state<LedgerEntriesResponse | null>(null);
  let balancesResponse = $state<LedgerBalancesResponse | null>(null);

  let activeTab = $state<'journal' | 'balances'>('journal');
  let entryTypeFilter = $state<LedgerEntryType | 'all'>('all');
  let assetFilter = $state('');
  let query = $state('');
  let exchangeFilter = $state('all');
  let page = $state(1);
  let limit = $state(25);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);

  const entryRows = $derived(entriesResponse?.items ?? []);
  const balanceRows = $derived(balancesResponse?.items ?? []);
  const assetRows = $derived(summary?.balances.byAsset ?? []);

  const exchangeOptions = $derived.by(() => {
    const exchanges = new Set(
      balanceRows
        .map((b) => b.exchange)
        .filter((e): e is string => Boolean(e)),
    );
    if (balancesResponse?.filters.exchange) {
      exchanges.add(balancesResponse.filters.exchange);
    }
    return ['all', ...[...exchanges].sort()];
  });

  const formatNumber = (value: string | number | null | undefined, options: Intl.NumberFormatOptions = {}) => {
    if (value === null || value === undefined || value === '') return 'unavailable';
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return String(value);
    return new Intl.NumberFormat('en-US', options).format(number);
  };

  const formatTimestamp = (value?: string | null) => {
    if (!value) return 'unavailable';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const labelize = (value?: string | null) => (value || 'unavailable').replaceAll('_', ' ');

  const shortId = (value?: string | null) => {
    if (!value) return 'unavailable';
    return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  };

  const amountTone = (amount: string) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 'text-base-content';
    return n >= 0 ? 'text-success' : 'text-error';
  };

  const statusTone = (value?: string | null) => {
    const s = (value || '').toLowerCase();
    if (s === 'running' || s === 'open') return 'text-success';
    if (s === 'stopped' || s === 'cancelled' || s === 'canceled') return 'text-base-content/50';
    return 'text-warning';
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : $_('admin_ledger_load_failed');

  const loadAll = async (options: { throwOnError?: boolean } = {}) => {
    const initialLoad = summary === null;
    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      const [summaryResult, entriesResult, balancesResult] = await Promise.all([
        fetchLedgerSummary(),
        fetchLedgerEntries({
          type: entryTypeFilter,
          asset: assetFilter || undefined,
          query: query || undefined,
          limit,
          page,
        }),
        fetchLedgerBalances({
          exchange: exchangeFilter,
          asset: assetFilter || undefined,
          query: query || undefined,
          limit,
          page,
        }),
      ]);
      summary = summaryResult;
      entriesResponse = entriesResult;
      balancesResponse = balancesResult;
      page = entriesResult.pagination.page;
      limit = entriesResult.pagination.limit;
    } catch (cause) {
      error = errorMessage(cause);
      if (options.throwOnError) throw new Error(error);
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const refreshAll = () =>
    toast.promise(loadAll({ throwOnError: true }), {
      loading: 'refreshing ledger',
      success: 'ledger refreshed',
      error: 'failed to refresh ledger',
    });

  const applyFilters = () => {
    page = 1;
    void loadAll();
  };

  const resetFilters = () => {
    entryTypeFilter = 'all';
    exchangeFilter = 'all';
    assetFilter = '';
    query = '';
    page = 1;
    void loadAll();
  };

  const changeTab = (tab: 'journal' | 'balances') => {
    activeTab = tab;
    page = 1;
    void loadAll();
  };

  const changeLimit = () => {
    page = 1;
    void loadAll();
  };

  const goToPage = (next: number) => {
    const resp = activeTab === 'journal' ? entriesResponse : balancesResponse;
    if (!resp || next < 1 || next > resp.pagination.totalPages || next === page) return;
    page = next;
    void loadAll();
  };

  const dataSources = (row: LedgerBalance) =>
    row.dataSources.length > 0 ? row.dataSources.map(labelize).join(', ') : 'source unavailable';

  onMount(() => { void loadAll(); });
</script>

<section class="space-y-6" data-testid="ledger-page">
  <PageHeader
    eyebrow={$_('admin.nav.trading')}
    title={$_('admin.nav.ledger')}
    subtitle={$_('admin_ledger_subtitle')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void refreshAll()}
      >{refreshing ? $_('refreshing_msg') : $_('refresh')}</button>
    {/snippet}
  </PageHeader>

  {#if loading}
    <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4">
      <span class="loading loading-spinner loading-sm text-base-content/60"></span>
      <span class="text-sm text-base-content/60 capitalize">{$_('admin_ledger_loading')}</span>
    </div>
  {:else if error}
    <div class="rounded-lg border border-error/30 p-4" data-testid="ledger-error">
      <div class="flex flex-col gap-3">
        <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_ledger_unavailable')}</span>
        <span class="text-sm text-base-content/60">{error}</span>
        <div class="flex gap-2">
          <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadAll()}>{$_('admin_retry')}</button>
          <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
        </div>
      </div>
    </div>
  {:else if summary}
    {@const healthy = summary.balances.healthy}

    <div class="rounded-lg border {healthy ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'} px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold capitalize {healthy ? 'text-success' : 'text-warning'}">
          {healthy ? $_('admin_ledger_health_healthy') : $_('admin_ledger_health_issues')}
        </span>
        {#if !healthy}
          <span class="text-xs text-warning font-mono">
            {#if summary.balances.invariantViolations > 0}
              {summary.balances.invariantViolations} {$_('admin_ledger_invariant_violations')}
            {/if}
            {#if summary.balances.negativeBalances > 0}
              · {summary.balances.negativeBalances} {$_('admin_ledger_negative_balances')}
            {/if}
          </span>
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-1 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_('admin_ledger_total_entries')}</span>
          <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(summary.entries.total)}</span>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-1 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_('admin_ledger_balance_rows')}</span>
          <span class="font-mono text-2xl font-semibold text-base-content">{formatNumber(summary.balances.total)}</span>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-1 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_('admin_ledger_invariant_violations')}</span>
          <span class="font-mono text-2xl font-semibold" class:text-warning={summary.balances.invariantViolations > 0} class:text-base-content={summary.balances.invariantViolations === 0}>
            {formatNumber(summary.balances.invariantViolations)}
          </span>
        </div>
      </div>
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-1 p-4">
          <span class="text-xs text-base-content/60 capitalize">{$_('admin_ledger_last_entry')}</span>
          <span class="font-mono text-sm font-semibold text-base-content">{formatTimestamp(summary.entries.lastEntryAt)}</span>
        </div>
      </div>
    </div>

    {#if summary.entries.byType.length > 0}
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <span class="text-lg font-semibold tracking-tight capitalize">{$_('admin_ledger_entries_by_type')}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-9">
            {#each summary.entries.byType as typeEntry (typeEntry.type)}
              {@const pct = summary!.entries.total > 0 ? (typeEntry.count / summary!.entries.total) * 100 : 0}
              <div class="rounded-lg border border-base-300 p-2 text-center">
                <span class="font-mono text-xs text-base-content/50 capitalize">{labelize(typeEntry.type)}</span>
                <span class="block font-mono text-lg font-semibold text-base-content">{formatNumber(typeEntry.count)}</span>
                <span class="text-xs text-base-content/40 font-mono">{pct.toFixed(0)}%</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if summary.balances.byAsset.length > 0}
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <span class="text-lg font-semibold tracking-tight capitalize">{$_('admin_ledger_inventory_by_asset')}</span>
            <span class="text-xs text-base-content/50 font-mono">{$_('admin_dashboard_asset_count_many', { values: { count: summary.balances.byAsset.length } })}</span>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {#each summary.balances.byAsset as asset (asset.asset)}
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
                  <div class="-mt-1.5 h-full bg-warning" style="width: {Math.max(0, Math.min(100, lockedPct))}%"></div>
                </div>
                <div class="mt-2 flex flex-col gap-1">
                  <span class="text-xs text-base-content/50">
                    {$_('admin_ledger_available_value', { values: { amount: formatNumber(asset.available, { maximumFractionDigits: 8 }) } })}
                  </span>
                  <span class="text-xs {lockedPct > 0 ? 'text-warning' : 'text-base-content/50'}">
                    {$_('admin_ledger_locked_value', { values: { amount: formatNumber(asset.locked, { maximumFractionDigits: 8 }), percent: lockedPct.toFixed(1) } })}
                  </span>
                </div>
              </div>
            {/each}
          </div>
          {#if summary.balances.truncated}
            <span class="text-xs text-warning">{$_('admin_ledger_summary_truncated')}</span>
          {/if}
        </div>
      </div>
    {/if}

    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-sm {activeTab === 'journal' ? 'btn-primary' : 'btn-ghost'} rounded-full capitalize"
            onclick={() => changeTab('journal')}
          >{$_('admin_ledger_tab_journal')}</button>
          <button
            type="button"
            class="btn btn-sm {activeTab === 'balances' ? 'btn-primary' : 'btn-ghost'} rounded-full capitalize"
            onclick={() => changeTab('balances')}
          >{$_('admin_ledger_tab_balances')}</button>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          {#if activeTab === 'journal'}
            <select
              class="select select-sm select-bordered min-w-36 border-base-300 bg-base-100 capitalize"
              bind:value={entryTypeFilter}
              disabled={loading || refreshing}
              onchange={applyFilters}
            >
              <option value="all">{$_('admin_ledger_all_types')}</option>
              {#each LEDGER_ENTRY_TYPES as type (type)}
                <option value={type}>{labelize(type)}</option>
              {/each}
            </select>
          {:else}
            <select
              class="select select-sm select-bordered min-w-44 border-base-300 bg-base-100 capitalize"
              bind:value={exchangeFilter}
              disabled={loading || refreshing}
              onchange={applyFilters}
            >
              {#each exchangeOptions as exchange (exchange)}
                <option value={exchange}>{exchange === 'all' ? $_('all_exchanges') : exchange}</option>
              {/each}
            </select>
          {/if}
          <input
            type="text"
            placeholder={$_('admin_ledger_search_placeholder')}
            class="input input-sm input-bordered min-w-[220px] border-base-300 bg-base-100 font-mono text-xs"
            maxlength={100}
            bind:value={query}
            onkeydown={(event) => { if (event.key === 'Enter') applyFilters(); }}
          />
          <button
            type="button"
            class="btn btn-sm btn-primary rounded-full capitalize"
            disabled={loading || refreshing}
            onclick={applyFilters}
          >{$_('admin_filter')}</button>
        </div>

        {#if activeTab === 'journal'}
          {@const resp = entriesResponse}
          {#if resp}
            <div class="flex flex-wrap items-center gap-3">
              <span class="font-mono text-xs text-base-content/50">
                {$_('admin_ledger_page_count', { values: { page: resp.pagination.page, totalPages: resp.pagination.totalPages, shown: entryRows.length, total: resp.pagination.total } })}
              </span>
              {#if refreshing}
                <span class="loading loading-spinner loading-xs text-base-content/50"></span>
              {/if}
            </div>

            {#if entryRows.length === 0}
              <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="ledger-entries-empty">
                <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_ledger_empty_title')}</span>
                <span class="text-sm text-base-content/60">{$_('admin_ledger_empty_message')}</span>
                <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
              </div>
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                      <th class="font-medium">{$_('admin_ledger_col_type')}</th>
                      <th class="font-medium">{$_('admin_ledger_col_order')}</th>
                      <th class="font-medium">{$_('asset_id')}</th>
                      <th class="font-medium text-right">{$_('admin_ledger_col_amount')}</th>
                      <th class="font-medium">{$_('admin_ledger_col_ref')}</th>
                      <th class="font-medium">{$_('admin_ledger_col_reversal')}</th>
                      <th class="font-medium">{$_('admin_ledger_col_created')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each entryRows as entry (entry.entryId)}
                      <tr class="border-b border-base-300 hover:bg-neutral">
                        <td><span class="text-xs font-semibold capitalize">{labelize(entry.type)}</span></td>
                        <td>
                          <div class="flex flex-col">
                            <span class="font-mono text-xs text-base-content" title={entry.orderId}>{shortId(entry.orderId)}</span>
                            <span class="font-mono text-[10px] text-base-content/50" title={entry.userOrderId}>{shortId(entry.userOrderId)}</span>
                          </div>
                        </td>
                        <td>
                          <div class="flex flex-col">
                            <span class="font-mono text-sm font-medium text-base-content">{entry.asset}</span>
                            <span class="font-mono text-[10px] text-base-content/50">{entry.assetId}</span>
                          </div>
                        </td>
                        <td class="text-right font-mono text-sm {amountTone(entry.amount)}">{formatNumber(entry.amount, { maximumFractionDigits: 8 })}</td>
                        <td>
                          {#if entry.refType || entry.refId}
                            <div class="flex flex-col">
                              <span class="text-xs text-base-content/60 capitalize">{labelize(entry.refType)}</span>
                              <span class="font-mono text-[10px] text-base-content/50" title={entry.refId ?? ''}>{shortId(entry.refId)}</span>
                            </div>
                          {:else}
                            <span class="text-xs text-base-content/40">—</span>
                          {/if}
                        </td>
                        <td>
                          {#if entry.reversalOf}
                            <span class="font-mono text-[10px] text-error/70" title={entry.reversalOf}>{shortId(entry.reversalOf)}</span>
                          {:else}
                            <span class="text-xs text-base-content/40">—</span>
                          {/if}
                        </td>
                        <td class="font-mono text-xs text-base-content/60">{formatTimestamp(entry.createdAt)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          {/if}
        {:else}
          {@const resp = balancesResponse}
          {#if resp}
            <div class="flex flex-wrap items-center gap-3">
              <span class="font-mono text-xs text-base-content/50">
                {$_('admin_ledger_page_count', { values: { page: resp.pagination.page, totalPages: resp.pagination.totalPages, shown: balanceRows.length, total: resp.pagination.total } })}
              </span>
              {#if refreshing}
                <span class="loading loading-spinner loading-xs text-base-content/50"></span>
              {/if}
            </div>

            {#if balanceRows.length === 0}
              <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="ledger-balances-empty">
                <span class="text-sm font-semibold text-base-content capitalize">{$_('admin_ledger_empty_title')}</span>
                <span class="text-sm text-base-content/60">{$_('admin_ledger_empty_message')}</span>
                <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>{$_('admin_health_reset_filters')}</button>
              </div>
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr class="border-b border-base-300 text-xs capitalize tracking-wide text-base-content/50">
                      <th class="font-medium">{$_('asset_id')}</th>
                      <th class="font-medium">{$_('exchange')}</th>
                      <th class="font-medium">{$_('admin_direct_mm_strategy')}</th>
                      <th class="font-medium">{$_('order_id')}</th>
                      <th class="font-medium">{$_('status')}</th>
                      <th class="font-medium text-right">{$_('total')}</th>
                      <th class="font-medium text-right">{$_('status_available')}</th>
                      <th class="font-medium text-right">{$_('admin_ledger_col_amount')}</th>
                      <th class="font-medium">{$_('admin_ledger_col_type')}</th>
                      <th class="font-medium">{$_('admin_strategy_updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each balanceRows as balance (balance.id)}
                      {@const status = balance.strategyStatus || balance.orderStatus}
                      {@const isMapped = Boolean(balance.exchange && balance.accountLabel)}
                      <tr class="border-b border-base-300 hover:bg-neutral">
                        <td>
                          <div class="flex flex-col">
                            <span class="font-mono text-sm font-medium text-base-content">{balance.asset}</span>
                            <span class="font-mono text-[10px] text-base-content/50">{balance.assetId}</span>
                          </div>
                        </td>
                        <td>
                          <div class="flex flex-col">
                            <span class="text-sm capitalize {isMapped ? 'text-base-content' : 'text-base-content/50'}">{balance.exchange || 'unmapped'}</span>
                            <span class="text-xs text-base-content/50">{balance.accountLabel || 'account unavailable'}</span>
                          </div>
                        </td>
                        <td>
                          <div class="flex flex-col">
                            <span class="font-mono text-xs text-base-content/70" title={balance.strategyKey || ''}>{shortId(balance.strategyKey?.replace(/-pureMarketMaking$/i, '').replace(/-marketMaking$/i, ''))}</span>
                            <span class="text-xs text-base-content/50 capitalize">{labelize(balance.strategyType)}</span>
                          </div>
                        </td>
                        <td>
                          <div class="flex flex-col">
                            <span class="font-mono text-xs text-base-content" title={balance.orderId}>{shortId(balance.orderId)}</span>
                            <span class="text-xs text-base-content/50">{balance.pair || 'pair unavailable'}</span>
                          </div>
                        </td>
                        <td>
                          <span class="text-xs font-semibold capitalize {statusTone(status)}">{labelize(status)}</span>
                        </td>
                        <td class="text-right font-mono text-sm">{formatNumber(balance.total, { maximumFractionDigits: 8 })}</td>
                        <td class="text-right font-mono text-sm">{formatNumber(balance.available, { maximumFractionDigits: 8 })}</td>
                        <td class="text-right font-mono text-sm" class:text-warning={Number(balance.locked) > 0}>
                          {formatNumber(balance.locked, { maximumFractionDigits: 8 })}
                        </td>
                        <td>
                          <span class="text-xs font-semibold capitalize {balance.balanced ? 'text-success' : 'text-error'}">
                            {balance.balanced ? $_('admin_ledger_balanced') : $_('admin_ledger_unbalanced')}
                          </span>
                        </td>
                        <td class="font-mono text-xs text-base-content/60">{formatTimestamp(balance.updatedAt)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          {/if}
        {/if}

        {#if activeTab === 'journal' ? entriesResponse : balancesResponse}
          {@const activeResp = activeTab === 'journal' ? entriesResponse! : balancesResponse!}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-base-content/50">
              {$_('admin_ledger_limit_hint', { values: { max: activeResp.limits.maxLimit, scan: ('metadataScanLimit' in activeResp.limits ? activeResp.limits.metadataScanLimit : activeResp.limits.maxLimit) } })}
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
                  <option value={option}>{$_('admin_rows_count', { values: { count: option } })}</option>
                {/each}
              </select>
              <div class="join">
                <button
                  type="button"
                  class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                  disabled={!activeResp.pagination.hasPrevious || refreshing}
                  onclick={() => goToPage(page - 1)}
                >{$_('previous')}</button>
                <button
                  type="button"
                  class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
                  disabled={!activeResp.pagination.hasNext || refreshing}
                  onclick={() => goToPage(page + 1)}
                >{$_('next')}</button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>

<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    LOG_LEVELS,
    fetchAdminSystemLogs,
    type AdminLogLevel,
    type AdminLogSource,
    type AdminSystemLogsResponse,
  } from '$lib/helpers/api/system';

  const limitOptions = [25, 50, 100, 200];
  const levels: Array<'all' | AdminLogLevel> = ['all', ...LOG_LEVELS];

  const levelTone: Record<string, string> = {
    debug: 'bg-base-content/5 text-base-content/60',
    info: 'bg-info/10 text-info',
    warn: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  };

  let response = $state<AdminSystemLogsResponse | null>(null);
  let levelFilter = $state<'all' | AdminLogLevel>('all');
  let sourceFilter = $state<AdminLogSource>('combined');
  let query = $state('');
  let limit = $state(100);
  let tail = $state(false);
  let loading = $state(true);
  let refreshing = $state(false);
  let exporting = $state(false);
  let exportMessage = $state<string | null>(null);
  let error = $state<string | null>(null);

  const rows = $derived(response?.entries ?? []);
  const sourceOptions = $derived(['all', ...(response?.sources.available ?? ['combined', 'error'])] as AdminLogSource[]);

  const counts = $derived.by(() => {
    const base: Record<AdminLogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };

    for (const entry of rows) {
      const level = entry.level as AdminLogLevel;
      if (level in base) {
        base[level] += 1;
      }
    }

    return base;
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
      fractionalSecondDigits: 3,
    });
  };

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Unable to load system logs';

  const loadLogs = async (includeExport = false) => {
    const initialLoad = response === null && !includeExport;

    if (includeExport) {
      exporting = true;
    } else {
      loading = initialLoad;
      refreshing = !initialLoad;
      error = null;
    }
    exportMessage = null;

    try {
      const next = await fetchAdminSystemLogs({
        source: sourceFilter,
        level: levelFilter,
        query,
        limit,
        exportLogs: includeExport,
      });

      response = next;
      limit = next.counts.returned > limit ? next.counts.returned : limit;

      if (includeExport) {
        const content = next.export?.content ?? '';
        const blob = new Blob([content], { type: next.export?.format ?? 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `admin-logs-${new Date(next.generatedAt).toISOString()}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        exportMessage = `Exported ${formatNumber(next.counts.returned)} redacted entries (${formatNumber(next.export?.byteLength ?? 0)} bytes).`;
      }
    } catch (cause) {
      if (includeExport) {
        exportMessage = errorMessage(cause);
      } else {
        error = errorMessage(cause);
      }
    } finally {
      loading = false;
      refreshing = false;
      exporting = false;
    }
  };

  const applyFilters = () => {
    void loadLogs();
  };

  const resetFilters = () => {
    levelFilter = 'all';
    sourceFilter = 'combined';
    query = '';
    limit = 100;
    void loadLogs();
  };

  const changeLimit = () => {
    void loadLogs();
  };

  onMount(() => {
    void loadLogs();
    const interval = window.setInterval(() => {
      if (tail && !loading && !refreshing && !exporting) {
        void loadLogs();
      }
    }, 10000);

    return () => window.clearInterval(interval);
  });
</script>

<section class="space-y-6" data-testid="system-logs-page">
  <PageHeader
    eyebrow="system"
    title="logs"
    subtitle="Bounded, source-whitelisted, redacted application logs from the authenticated admin API."
  >
    {#snippet actions()}
      <label class="label cursor-pointer gap-2">
        <span class="label-text text-xs text-base-content/70 capitalize">bounded tail</span>
        <input type="checkbox" class="toggle toggle-sm" bind:checked={tail} />
      </label>
      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full capitalize"
        disabled={loading || refreshing || exporting}
        onclick={() => void loadLogs(true)}
      >{exporting ? 'exporting' : 'export redacted'}</button>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing || exporting}
        onclick={() => void loadLogs()}
      >{refreshing ? 'refreshing' : 'refresh'}</button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
    {#each levels.filter((level) => level !== 'all') as level (level)}
      <div class="card border border-base-300 bg-base-100 shadow-none">
        <div class="card-body gap-1 p-3">
          <span class="text-xs text-base-content/60 capitalize">{level}</span>
          <span class="font-mono text-xl font-semibold {levelTone[level] || 'text-base-content'}">{formatNumber(counts[level])}</span>
        </div>
      </div>
    {/each}
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-3">
        <span class="text-xs text-base-content/60 capitalize">returned</span>
        <span class="font-mono text-xl font-semibold text-base-content">{formatNumber(response?.counts.returned)}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <div class="join">
          {#each levels as level (level)}
            <button
              type="button"
              class="btn btn-sm join-item border-base-300 bg-base-100 capitalize"
              class:btn-primary={levelFilter === level}
              disabled={loading || refreshing}
              onclick={() => {
                levelFilter = level;
                applyFilters();
              }}
            >{level}</button>
          {/each}
        </div>

        <select
          class="select select-sm select-bordered border-base-300 bg-base-100 capitalize"
          bind:value={sourceFilter}
          disabled={loading || refreshing}
          onchange={applyFilters}
        >
          {#each sourceOptions as source (source)}
            <option value={source}>{source === 'all' ? 'all allowed sources' : source}</option>
          {/each}
        </select>

        <input
          type="text"
          placeholder="filter redacted message or context…"
          class="input input-sm input-bordered min-w-[220px] flex-1 border-base-300 bg-base-100 font-mono text-xs"
          maxlength={response?.limits.maxQueryLength ?? 120}
          bind:value={query}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              applyFilters();
            }
          }}
        />

        <button type="button" class="btn btn-sm btn-ghost rounded-full capitalize" disabled={loading || refreshing} onclick={applyFilters}>search</button>
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
        <div class="flex items-center gap-3 rounded-lg border border-base-300 p-4" data-testid="logs-loading">
          <span class="loading loading-spinner loading-sm text-base-content/60"></span>
          <span class="text-sm text-base-content/60 capitalize">loading bounded backend logs</span>
        </div>
      {:else if error}
        <div class="rounded-lg border border-error/30 p-4" data-testid="logs-error">
          <div class="flex flex-col gap-3">
            <span class="text-sm font-semibold text-base-content capitalize">logs unavailable</span>
            <span class="text-sm text-base-content/60">{error}</span>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-primary capitalize" onclick={() => void loadLogs()}>retry</button>
              <button type="button" class="btn btn-sm btn-ghost capitalize" onclick={resetFilters}>reset filters</button>
            </div>
          </div>
        </div>
      {:else if response}
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-base-content/50">
            {response.counts.returned} returned · {response.counts.matched} matched · {response.counts.scannedLines} scanned
          </span>
          <span class="text-xs text-base-content/50 capitalize">
            backend filters · source {response.filters.source} · level {response.filters.level || 'all'}
          </span>
          <span class="text-xs text-base-content/50">
            max {response.limits.maxLimit} entries · {formatNumber(response.byteLength)} bytes
          </span>
          {#if refreshing}
            <span class="loading loading-spinner loading-xs text-base-content/50"></span>
          {/if}
        </div>

        {#if exportMessage}
          <div class="rounded-lg border border-base-300 p-3">
            <span class="text-sm text-base-content/70">{exportMessage}</span>
          </div>
        {/if}

        {#if response.warnings.length > 0}
          <div class="rounded-lg border border-warning/30 p-3">
            {#each response.warnings as warning (warning)}
              <span class="block text-sm text-warning">{warning}</span>
            {/each}
          </div>
        {/if}

        {#if rows.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-base-300 py-12 text-center" data-testid="logs-empty">
            <span class="text-sm font-semibold text-base-content capitalize">no backend logs returned</span>
            <span class="text-sm text-base-content/60">The logs API returned no redacted entries for these filters; no sample log lines are shown.</span>
            <button class="btn btn-ghost btn-xs rounded-full capitalize" onclick={resetFilters}>reset filters</button>
          </div>
        {:else}
          <div class="rounded-lg border border-base-300 bg-base-100">
            <ul class="divide-y divide-base-300">
              {#each rows as entry, index (`${entry.timestamp}-${entry.source}-${index}`)}
                <li class="flex items-start gap-3 px-4 py-2 hover:bg-neutral">
                  <span class="w-40 shrink-0 font-mono text-xs text-base-content/50">{formatTimestamp(entry.timestamp)}</span>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize tracking-wider {levelTone[entry.level] || 'bg-base-content/5 text-base-content/60'}">
                    {entry.level}
                  </span>
                  <span class="w-24 shrink-0 truncate font-mono text-xs text-base-content/60">{entry.source}</span>
                  <span class="w-28 shrink-0 truncate font-mono text-xs text-base-content/50">{entry.context || 'context unavailable'}</span>
                  <span class="flex-1 break-all font-mono text-xs text-base-content">{entry.message}</span>
                </li>
              {/each}
            </ul>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-base-content/50 capitalize">
              {tail ? 'bounded tail re-fetches every 10 seconds' : 'tail paused · showing backend snapshot'}
            </span>
            <span class="text-xs text-base-content/50">
              message truncations {response.truncated.messages} · response truncated {response.truncated.responseBytes ? 'yes' : 'no'} · read truncated {response.truncated.readBytes ? 'yes' : 'no'}
            </span>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>

<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import KpiCard from './components/KpiCard.svelte';
  import { setupStatus } from '$lib/stores/setup';
  import {
    DASHBOARD_RANGES,
    fetchDashboardSummary,
    type AdminDashboardSummary,
    type DashboardRange,
  } from '$lib/helpers/api/dashboard';

  let summary = $state<AdminDashboardSummary | null>(null);
  let timeRange = $state<DashboardRange>('24h');
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let dashboardRequestSequence = 0;
  let setupCardDismissed = $state(false);

  const statusDot: Record<string, string> = {
    healthy: 'bg-success',
    running: 'bg-success',
    delayed: 'bg-warning',
    paused: 'bg-base-content/30',
    stopped: 'bg-base-content/30',
    error: 'bg-error',
    failed: 'bg-error',
    deleted: 'bg-error',
    removed: 'bg-error',
    degraded: 'bg-warning',
    unknown: 'bg-base-content/30',
    ok: 'bg-success',
    open: 'bg-success',
    pending: 'bg-warning',
    warn: 'bg-warning',
    queued: 'bg-warning',
    sent: 'bg-info',
    done: 'bg-success',
    cancelled: 'bg-base-content/30',
  };

  const intentTone: Record<string, string> = {
    CREATE_LIMIT_ORDER: 'bg-info/10 text-info',
    CANCEL_ORDER: 'bg-base-content/5 text-base-content/60',
    SETTLE_ORDER: 'bg-success/10 text-success',
    SKIP: 'bg-base-content/5 text-base-content/60',
  };

  const formatNumber = (value: string | number, options: Intl.NumberFormatOptions = {}) => {
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

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'Unable to load dashboard summary';

  const safeDot = (status?: string | null) =>
    statusDot[(status || 'unknown').toLowerCase()] || statusDot.unknown;

  const statusLabel = (status?: string | null) => status || 'unknown';

  const loadDashboard = async (
    range: DashboardRange = timeRange,
    options: { throwOnError?: boolean } = {},
  ) => {
    const requestSequence = ++dashboardRequestSequence;
    const initialLoad = summary === null;

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;

    try {
      const next = await fetchDashboardSummary(range);

      if (requestSequence !== dashboardRequestSequence) {
        return;
      }

      summary = next;
      timeRange = next.range.key;
    } catch (cause) {
      if (requestSequence !== dashboardRequestSequence) {
        return;
      }

      error = errorMessage(cause);
      if (options.throwOnError) {
        throw new Error(error);
      }
    } finally {
      if (requestSequence === dashboardRequestSequence) {
        loading = false;
        refreshing = false;
      }
    }
  };

  const selectRange = (range: DashboardRange) => {
    if (refreshing) {
      return;
    }

    timeRange = range;
    void loadDashboard(range);
  };

  const refresh = () => {
    if (refreshing) {
      return;
    }

    void toast.promise(loadDashboard(timeRange, { throwOnError: true }), {
      loading: 'refreshing dashboard',
      success: 'dashboard refreshed',
      error: 'failed to refresh dashboard',
    });
  };

  onMount(() => {
    setupCardDismissed = localStorage.getItem('admin-setup-card-dismissed') === 'true';
    void loadDashboard(timeRange);
  });

  const dismissSetupCard = () => {
    setupCardDismissed = true;
    localStorage.setItem('admin-setup-card-dismissed', 'true');
  };

  const kpis = $derived.by(() => {
    if (!summary) {
      return [];
    }

    return [
      {
        key: 'capital',
        label: 'total capital',
        value: formatNumber(summary.kpis.totalCapital, { maximumFractionDigits: 8 }),
        unit: 'units',
      },
      {
        key: 'strategies',
        label: 'active strategies',
        value: `${formatNumber(summary.kpis.activeStrategies)} / ${formatNumber(summary.kpis.totalStrategies)}`,
      },
      {
        key: 'orders',
        label: 'open orders',
        value: formatNumber(summary.kpis.openOrders),
        unit: `${formatNumber(summary.kpis.trackedOrders)} tracked`,
      },
      {
        key: 'intents',
        label: 'pending intents',
        value: formatNumber(summary.kpis.pendingIntents),
        unit: `${summary.kpis.runtimeHealth} health`,
      },
    ];
  });

  const displayedStrategies = $derived(summary?.strategies.recent ?? []);

  const displayedIntents = $derived(summary?.intents.recent ?? []);

  const displayedOrders = $derived(summary?.orderFlow.recent ?? []);

  const capitalRows = $derived(summary?.capital.byAsset ?? []);

  const capitalTotal = $derived(Number(summary?.capital.total ?? 0));

  const systemRows = $derived.by(() => {
    if (!summary) {
      return [];
    }

    const validationCounts = Object.entries(summary.exchanges.byValidationStatus)
      .map(([status, count]) => `${count} ${status}`)
      .join(' · ');

    return [
      {
        key: 'health',
        label: 'runtime health',
        status: summary.health.status,
        meta: `snapshot ${formatTimestamp(summary.health.timestamp)}`,
      },
      {
        key: 'exchanges',
        label: 'exchange accounts',
        status: summary.exchanges.total > 0 ? 'ok' : 'unknown',
        meta: validationCounts || 'no accounts returned',
      },
      {
        key: 'reconciliation',
        label: 'reconciliation',
        status: summary.reconciliation.totalViolations > 0 ? 'failed' : 'ok',
        meta: `${formatNumber(summary.reconciliation.totalViolations)} violations`,
      },
      {
        key: 'runtime',
        label: 'runtime metrics',
        status: summary.runtime.stats.length > 0 || summary.runtime.recent.length > 0 ? 'ok' : 'unknown',
        meta: `${formatNumber(summary.runtime.stats.length + summary.runtime.recent.length)} entries`,
      },
    ];
  });

  const isEmpty = $derived(
    summary !== null &&
      summary.kpis.totalStrategies === 0 &&
      summary.kpis.trackedOrders === 0 &&
      summary.intents.total === 0 &&
      summary.capital.totalRows === 0 &&
      summary.exchanges.total === 0,
  );
  let setupStepCount = $derived(Object.values($setupStatus?.completedSteps || {}).filter(Boolean).length);
</script>

<section class="space-y-6 anim-page-enter" data-testid="admin-dashboard-shell">
  <PageHeader
    eyebrow={$_('admin.nav.dashboard')}
    title={$_('admin.dashboard_overview')}
    subtitle={$_('admin.dashboard_subtitle')}
  >
    {#snippet actions()}
      <div class="flex flex-wrap items-center gap-2">
      <div class="join">
        {#each DASHBOARD_RANGES as r (r)}
          <button
            type="button"
            class="btn btn-sm join-item font-mono-num text-xs {timeRange === r ? 'border-base-content bg-base-content text-base-100' : 'border-base-300 bg-base-200 text-base-content'}"
            disabled={refreshing}
            aria-pressed={timeRange === r}
            onclick={() => selectRange(r)}
          >
            {r}
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={refresh}
      >
        {refreshing ? 'refreshing' : 'refresh'}
      </button>
      <span class="hidden text-xs text-base-content/50 md:inline">
        updated <span class="font-mono-num">{summary ? formatTimestamp(summary.generatedAt) : 'pending'}</span>
      </span>
      </div>
    {/snippet}
  </PageHeader>

  {#if $setupStatus?.initialized && !$setupStatus.completedAt && !setupCardDismissed}
    <div class="card border border-base-300 bg-base-100 shadow-none" data-testid="setup-floating-card">
      <div class="card-body flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div class="flex flex-col gap-1">
          <span class="text-lg font-semibold text-base-content capitalize">setup is not complete</span>
          <span class="text-sm text-base-content/60">
            {setupStepCount} setup steps are marked complete. Continue the wizard to lock setup-only config writes.
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <a class="btn btn-primary btn-sm rounded-full capitalize" href="/setup">continue setup</a>
          <button type="button" class="btn btn-ghost btn-sm rounded-full capitalize" onclick={dismissSetupCard}>
            dismiss
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="card card-surface shadow-none" data-testid="dashboard-loading">
      <div class="card-body flex-row items-center gap-3 p-5">
        <span class="loading loading-spinner loading-sm text-base-content/60"></span>
        <span class="text-sm text-base-content/60 capitalize">loading backend dashboard summary</span>
      </div>
    </div>
  {:else if error}
    <div class="card card-surface border-error/30 shadow-none" data-testid="dashboard-error">
      <div class="card-body gap-3 p-5">
        <span class="text-lg font-semibold text-base-content capitalize">dashboard summary unavailable</span>
        <span class="text-sm text-base-content/60">{error}</span>
        <div>
          <button type="button" class="btn-pill-primary capitalize" onclick={refresh}>retry</button>
        </div>
      </div>
    </div>
  {:else if summary}
    {#if isEmpty}
      <div class="card card-surface shadow-none" data-testid="dashboard-empty">
        <div class="card-body gap-2 p-5">
          <span class="text-lg font-semibold text-base-content capitalize">no dashboard activity yet</span>
          <span class="text-sm text-base-content/60">
            The backend summary returned zero strategies, orders, intents, capital rows, and exchange accounts for
            {summary.range.key}.
          </span>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {#each kpis as kpi (kpi.key)}
        <KpiCard label={kpi.label} value={kpi.value} unit={kpi.unit} deltaPct={0} series={[]} />
      {/each}
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="card card-surface shadow-none">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
              capital by asset
            </span>
            <a href="/trading/positions" class="btn-pill-ghost text-xs capitalize">
              view positions →
            </a>
          </div>

          {#if capitalRows.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">No capital rows were returned by the backend summary.</span>
            </div>
          {:else}
            <ul class="space-y-3">
              {#each capitalRows as asset (asset.asset)}
                {@const amount = Number(asset.total)}
                {@const pct = capitalTotal > 0 && Number.isFinite(amount) ? (amount / capitalTotal) * 100 : 0}
                <li class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-base-content capitalize">{asset.asset}</span>
                    <div class="flex items-center gap-3">
                      <span class="font-mono-num text-sm text-base-content">{formatNumber(asset.total, { maximumFractionDigits: 8 })}</span>
                      <span class="font-mono-num text-xs text-base-content/50 w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-base-300">
                    <div class="h-full bg-base-content" style="width: {Math.max(0, Math.min(100, pct))}%"></div>
                  </div>
                  <span class="text-xs text-base-content/50">
                    available {formatNumber(asset.available, { maximumFractionDigits: 8 })} · locked {formatNumber(asset.locked, { maximumFractionDigits: 8 })}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="card card-surface shadow-none">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
                order flow
              </span>
              <span class="text-xs text-base-content/50 capitalize">
                backend tracked orders · {summary.range.key}
              </span>
            </div>
            <a href="/trading/exchange-orders" class="btn-pill-ghost text-xs capitalize">
              view orders →
            </a>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">tracked</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">{formatNumber(summary.orderFlow.total)}</span>
            </div>
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">trades</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">{formatNumber(summary.orderFlow.volume.tradeCount)}</span>
            </div>
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">notional</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">
                {formatNumber(summary.orderFlow.volume.notionalVolume, { maximumFractionDigits: 8 })}
              </span>
            </div>
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">open</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">{formatNumber(summary.kpis.openOrders)}</span>
            </div>
          </div>

          {#if displayedOrders.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">No recent tracked orders were returned by the backend summary.</span>
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr class="border-b border-base-300 text-xs font-medium capitalize tracking-wide text-base-content/50">
                    <th class="font-medium">order</th>
                    <th class="font-medium">pair</th>
                    <th class="font-medium">side</th>
                    <th class="font-medium text-right">filled</th>
                    <th class="font-medium">status</th>
                  </tr>
                </thead>
                <tbody>
                  {#each displayedOrders.slice(0, 5) as order, index (`${order.orderId}-${index}`)}
                    <tr class="border-b border-base-300 hover:bg-neutral">
                      <td><span class="font-mono-num text-xs text-base-content/70">{order.orderId}</span></td>
                      <td><span class="font-mono-num text-sm text-base-content">{order.pair}</span></td>
                      <td>
                        <span
                          class="text-xs font-medium"
                          class:text-success={order.side.toLowerCase() === 'buy'}
                          class:text-error={order.side.toLowerCase() === 'sell'}
                        >
                          {order.side}
                        </span>
                      </td>
                      <td class="text-right">
                        <span class="font-mono-num text-xs text-base-content/70">{order.filledQty} / {order.qty}</span>
                      </td>
                      <td>
                        <div class="flex items-center gap-2">
                          <span class="h-1.5 w-1.5 rounded-full {safeDot(order.status)}"></span>
                          <span class="text-xs text-base-content/70 capitalize">{order.status}</span>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <div class="card card-surface shadow-none xl:col-span-3">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
              strategy health
            </span>
            <a href="/trading/strategies" class="btn-pill-ghost text-xs capitalize">
              view strategies →
            </a>
          </div>

          {#if displayedStrategies.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">No strategy rows were returned by the backend summary.</span>
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr class="border-b border-base-300 text-xs font-medium capitalize tracking-wide text-base-content/50">
                    <th class="font-medium">strategy</th>
                    <th class="font-medium">status</th>
                    <th class="font-medium">definition</th>
                    <th class="font-medium text-right">updated</th>
                  </tr>
                </thead>
                <tbody>
                  {#each displayedStrategies as strategy (strategy.strategyKey)}
                    <tr class="border-b border-base-300 hover:bg-neutral">
                      <td>
                        <div class="flex flex-col">
                          <span class="text-sm font-medium text-base-content">{strategy.strategyKey}</span>
                          <span class="text-xs text-base-content/50 capitalize">{strategy.strategyType || 'type unavailable'}</span>
                        </div>
                      </td>
                      <td>
                        <div class="flex items-center gap-2">
                          <span class="h-1.5 w-1.5 rounded-full {safeDot(strategy.status)}"></span>
                          <span class="text-xs text-base-content/70 capitalize">{statusLabel(strategy.status)}</span>
                        </div>
                      </td>
                      <td>
                        <span class="text-sm text-base-content/70">{strategy.definitionName || strategy.strategyDefinitionId || 'unavailable'}</span>
                      </td>
                      <td class="text-right">
                        <span class="font-mono-num text-xs text-base-content/60">{formatTimestamp(strategy.updatedAt)}</span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <div class="card card-surface shadow-none xl:col-span-2">
        <div class="card-body gap-3 p-5">
          <div class="flex items-center justify-between">
            <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
              recent intents
            </span>
            <span class="text-xs text-base-content/50 capitalize">
              backend · last {summary.limits.recentItems}
            </span>
          </div>

          {#if displayedIntents.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">No recent intents were returned for {summary.range.key}.</span>
            </div>
          {:else}
            <ul class="divide-y divide-base-300">
              {#each displayedIntents as intent (intent.intentId)}
                <li class="flex items-center gap-3 py-2.5">
                  <span class="font-mono-num text-xs text-base-content/50 w-28 shrink-0">{formatTimestamp(intent.createdAt)}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wider {intentTone[intent.type] || 'bg-base-content/5 text-base-content/60'}"
                  >
                    {intent.type}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      {#if intent.side}
                        <span
                          class="text-xs font-medium"
                          class:text-success={intent.side.toLowerCase() === 'buy'}
                          class:text-error={intent.side.toLowerCase() === 'sell'}
                        >
                          {intent.side}
                        </span>
                      {/if}
                      <span class="font-mono-num text-sm text-base-content">{intent.pair}</span>
                    </div>
                    <span class="text-xs text-base-content/50 capitalize">
                      {intent.exchange}{intent.accountLabel ? ` · ${intent.accountLabel}` : ''}
                    </span>
                  </div>
                  <span class="h-1.5 w-1.5 rounded-full {safeDot(intent.status)}"></span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>

    <div class="card card-surface shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex items-center justify-between">
          <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
            system status
          </span>
          <a href="/system/health" class="btn-pill-ghost text-xs capitalize">
            view health →
          </a>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {#each systemRows as row (row.key)}
            <div class="card-surface-inset flex items-start gap-3 p-3">
              <span class="mt-1 h-2 w-2 shrink-0 rounded-full {safeDot(row.status)}"></span>
              <div class="flex min-w-0 flex-col">
                <span class="text-sm font-medium text-base-content capitalize">{row.label}</span>
                <span class="font-mono-num text-xs text-base-content/50 truncate">{row.meta}</span>
              </div>
            </div>
          {/each}
        </div>

        {#if summary.health.issues.length > 0}
          <div class="card-surface-inset p-4">
            <span class="text-sm font-medium text-base-content capitalize">reported health issues</span>
            <ul class="mt-2 space-y-1">
              {#each summary.health.issues as issue, index (index)}
                <li class="font-mono-num text-xs text-base-content/60">{JSON.stringify(issue)}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>

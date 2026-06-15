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

  type KpiTone = 'neutral' | 'success' | 'warning' | 'error';

  interface DashboardKpi {
    key: string;
    label: string;
    value: string;
    unit: string;
    tone: KpiTone;
  }

  interface AttentionRow {
    key: string;
    label: string;
    meta: string;
    tone: 'warning' | 'error' | 'success';
    href?: string;
  }

  const formatNumber = (value: string | number, options: Intl.NumberFormatOptions = {}) => {
    const number = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    return new Intl.NumberFormat('en-US', options).format(number);
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

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : $_('admin_dashboard_load_failed');

  const safeDot = (status?: string | null) =>
    statusDot[(status || 'unknown').toLowerCase()] || statusDot.unknown;

  const statusLabel = (status?: string | null) => status || 'unknown';

  const statusTone = (status?: string | null): KpiTone => {
    const normalized = (status || 'unknown').toLowerCase();

    if (['healthy', 'running', 'ok', 'open', 'done'].includes(normalized)) {
      return 'success';
    }

    if (['delayed', 'pending', 'warn', 'queued', 'degraded'].includes(normalized)) {
      return 'warning';
    }

    if (['critical', 'error', 'failed', 'deleted', 'removed'].includes(normalized)) {
      return 'error';
    }

    return 'neutral';
  };

  const shortId = (value?: string | null) => {
    if (!value) {
      return 'unavailable';
    }

    return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  };

  const shortStrategyName = (value?: string | null) => {
    if (!value) {
      return 'unavailable';
    }

    return shortId(value.replace(/-pureMarketMaking$/i, '').replace(/-marketMaking$/i, ''));
  };

  const readableIntentType = (value: string) =>
    value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

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
      loading: $_('admin_dashboard_refreshing'),
      success: $_('admin_dashboard_refreshed'),
      error: $_('admin_dashboard_refresh_failed'),
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
        key: 'health',
        label: $_('admin_dashboard_kpi_system_health'),
        value: statusLabel(summary.health.status),
        unit: summary.health.issues.length > 0
          ? $_('admin_dashboard_issues_count', { values: { count: formatNumber(summary.health.issues.length) } })
          : $_('admin_dashboard_no_issues'),
        tone: statusTone(summary.health.status),
      },
      {
        key: 'strategies',
        label: $_('admin_dashboard_kpi_active_strategies'),
        value: formatNumber(summary.kpis.activeStrategies),
        unit: $_('admin_dashboard_total_count', { values: { count: formatNumber(summary.kpis.totalStrategies) } }),
        tone: summary.kpis.activeStrategies > 0 ? 'success' : 'warning',
      },
      {
        key: 'orders',
        label: $_('admin_dashboard_kpi_open_orders'),
        value: formatNumber(summary.kpis.openOrders),
        unit: $_('admin_dashboard_tracked_count', { values: { count: formatNumber(summary.kpis.trackedOrders) } }),
        tone: summary.kpis.openOrders > 0 ? 'success' : 'neutral',
      },
      {
        key: 'violations',
        label: $_('admin_dashboard_kpi_unresolved_issues'),
        value: formatNumber(summary.reconciliation.totalViolations + summary.kpis.pendingIntents),
        unit: $_('admin_dashboard_reconciliation_count', { values: { count: formatNumber(summary.reconciliation.totalViolations) } }),
        tone: summary.reconciliation.totalViolations > 0 || summary.kpis.pendingIntents > 0 ? 'error' : 'success',
      },
      {
        key: 'capital',
        label: $_('admin_dashboard_kpi_tracked_balances'),
        value: formatNumber(summary.kpis.totalCapital, { maximumFractionDigits: 2 }),
        unit: $_(summary.capital.byAsset.length === 1 ? 'admin_dashboard_asset_count_one' : 'admin_dashboard_asset_count_many', {
          values: { count: formatNumber(summary.capital.byAsset.length) },
        }),
        tone: 'neutral',
      },
    ] satisfies DashboardKpi[];
  });

  const displayedStrategies = $derived.by(() => {
    const rows = summary?.strategies.recent ?? [];
    const activeRows = rows.filter((strategy) => !['stopped', 'deleted', 'removed'].includes(strategy.status.toLowerCase()));

    return activeRows.length > 0 ? activeRows : rows.slice(0, 4);
  });

  const displayedIntents = $derived(summary?.intents.recent ?? []);

  const displayedOrders = $derived.by(() => {
    const rows = summary?.orderFlow.recent ?? [];
    const activeRows = rows.filter((order) => !['cancelled', 'canceled', 'done', 'filled'].includes(order.status.toLowerCase()));

    return activeRows.length > 0 ? activeRows : rows.slice(0, 3);
  });

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
        label: $_('admin_dashboard_runtime_health'),
        status: summary.health.status,
        meta: $_('admin_dashboard_snapshot_at', { values: { time: formatTimestamp(summary.health.timestamp) } }),
      },
      {
        key: 'exchanges',
        label: $_('admin_dashboard_exchange_accounts'),
        status: summary.exchanges.total > 0 ? 'ok' : 'unknown',
        meta: validationCounts || $_('admin_dashboard_no_accounts_returned'),
      },
      {
        key: 'reconciliation',
        label: $_('admin_dashboard_reconciliation'),
        status: summary.reconciliation.totalViolations > 0 ? 'failed' : 'ok',
        meta: $_('admin_dashboard_violations_count', { values: { count: formatNumber(summary.reconciliation.totalViolations) } }),
      },
      {
        key: 'runtime',
        label: $_('admin_dashboard_runtime_metrics'),
        status: summary.runtime.stats.length > 0 || summary.runtime.recent.length > 0 ? 'ok' : 'unknown',
        meta: $_('admin_dashboard_entries_count', { values: { count: formatNumber(summary.runtime.stats.length + summary.runtime.recent.length) } }),
      },
    ];
  });

  let setupStepCount = $derived(Object.values($setupStatus?.completedSteps || {}).filter(Boolean).length);

  const attentionRows = $derived.by(() => {
    if (!summary) {
      return [];
    }

    const rows: AttentionRow[] = [];

    if ($setupStatus?.initialized && !$setupStatus.completedAt && !setupCardDismissed) {
      rows.push({
        key: 'setup',
        label: $_('admin_dashboard_setup_needs_completion'),
        meta: $_('admin_dashboard_setup_steps_complete', { values: { count: setupStepCount } }),
        tone: 'warning',
        href: '/setup',
      });
    }

    if (summary.reconciliation.totalViolations > 0) {
      rows.push({
        key: 'reconciliation',
        label: $_('admin_dashboard_reconciliation_violations'),
        meta: $_('admin_dashboard_unresolved_count', { values: { count: formatNumber(summary.reconciliation.totalViolations) } }),
        tone: 'error',
        href: '/system/health?view=orders',
      });
    }

    if (summary.kpis.pendingIntents > 0) {
      rows.push({
        key: 'intents',
        label: $_('admin_dashboard_pending_intents'),
        meta: $_('admin_dashboard_waiting_processing_count', { values: { count: formatNumber(summary.kpis.pendingIntents) } }),
        tone: 'warning',
        href: '/system/health?view=orders',
      });
    }

    return rows.length > 0
      ? rows
      : [{
          key: 'clear',
          label: $_('admin_dashboard_no_action_needed'),
          meta: $_('admin_dashboard_queues_clear'),
          tone: 'success',
        } satisfies AttentionRow];
  });

  const isEmpty = $derived(
    summary !== null &&
      summary.kpis.totalStrategies === 0 &&
      summary.kpis.trackedOrders === 0 &&
      summary.intents.total === 0 &&
      summary.capital.totalRows === 0 &&
      summary.exchanges.total === 0,
  );
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
        {refreshing ? $_('refreshing_msg') : $_('refresh')}
      </button>
      <span class="hidden text-xs text-base-content/50 md:inline">
        {$_('admin_dashboard_updated_at', {
          values: { time: summary ? formatTimestamp(summary.generatedAt) : $_('admin_health_pending') },
        })}
      </span>
      </div>
    {/snippet}
  </PageHeader>

  {#if loading}
    <div class="card card-surface shadow-none" data-testid="dashboard-loading">
      <div class="card-body flex-row items-center gap-3 p-5">
        <span class="loading loading-spinner loading-sm text-base-content/60"></span>
        <span class="text-sm text-base-content/60 capitalize">{$_('admin_dashboard_loading_summary')}</span>
      </div>
    </div>
  {:else if error}
    <div class="card card-surface border-error/30 shadow-none" data-testid="dashboard-error">
      <div class="card-body gap-3 p-5">
        <span class="text-lg font-semibold text-base-content capitalize">{$_('admin_dashboard_unavailable')}</span>
        <span class="text-sm text-base-content/60">{error}</span>
        <div>
          <button type="button" class="btn-pill-primary capitalize" onclick={refresh}>{$_('admin_retry')}</button>
        </div>
      </div>
    </div>
  {:else if summary}
    {#if isEmpty}
      <div class="card card-surface shadow-none" data-testid="dashboard-empty">
        <div class="card-body gap-2 p-5">
          <span class="text-lg font-semibold text-base-content capitalize">{$_('admin_dashboard_empty_title')}</span>
          <span class="text-sm text-base-content/60">
            {$_('admin_dashboard_empty_message', { values: { range: summary.range.key } })}
          </span>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {#each kpis as kpi (kpi.key)}
        {#if kpi.key === 'capital'}
          <a
            href="/system/connectivity/balances"
            class="block rounded-xl focus:outline-none focus:ring-2 focus:ring-base-content/20"
            aria-label={kpi.label}
          >
            <KpiCard label={kpi.label} value={kpi.value} unit={kpi.unit} tone={kpi.tone} deltaPct={0} series={[]} />
          </a>
        {:else}
          <KpiCard label={kpi.label} value={kpi.value} unit={kpi.unit} tone={kpi.tone} deltaPct={0} series={[]} />
        {/if}
      {/each}
    </div>

    <div class="card card-surface shadow-none">
      <div class="card-body gap-4 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex flex-col gap-1">
            <span class="text-lg font-semibold tracking-tight text-base-content capitalize">{$_('admin_dashboard_needs_attention')}</span>
            <span class="text-sm text-base-content/60">{$_('admin_dashboard_needs_attention_subtitle')}</span>
          </div>
          {#if $setupStatus?.initialized && !$setupStatus.completedAt && !setupCardDismissed}
            <div class="flex flex-wrap gap-2">
              <a class="btn btn-primary btn-sm rounded-full capitalize" href="/setup">{$_('admin_dashboard_continue_setup')}</a>
              <button type="button" class="btn btn-ghost btn-sm rounded-full capitalize" onclick={dismissSetupCard}>
                {$_('admin_dashboard_dismiss')}
              </button>
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {#each attentionRows as row (row.key)}
            {#if row.href}
              <a
                href={row.href}
                class="group rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-base-content/20 {row.tone === 'error'
                  ? 'border-error bg-error/5 hover:bg-error/10'
                  : row.tone === 'warning'
                    ? 'border-warning bg-warning/5 hover:bg-warning/10'
                    : 'border-success bg-success/5 hover:bg-success/10'}"
              >
                <div class="flex items-start gap-3">
                  <span
                    class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    class:bg-error={row.tone === 'error'}
                    class:bg-warning={row.tone === 'warning'}
                    class:bg-success={row.tone === 'success'}
                  ></span>
                  <div class="min-w-0 flex flex-col gap-1">
                    <span class="text-sm font-semibold text-base-content group-hover:underline">{row.label}</span>
                    <span class="text-xs text-base-content/60">{row.meta}</span>
                  </div>
                </div>
              </a>
            {:else}
              <div
                class="rounded-lg border p-4 {row.tone === 'error'
                  ? 'border-error bg-error/5'
                  : row.tone === 'warning'
                    ? 'border-warning bg-warning/5'
                    : 'border-success bg-success/5'}"
              >
                <div class="flex items-start gap-3">
                  <span
                    class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    class:bg-error={row.tone === 'error'}
                    class:bg-warning={row.tone === 'warning'}
                    class:bg-success={row.tone === 'success'}
                  ></span>
                  <div class="min-w-0 flex flex-col gap-1">
                    <span class="text-sm font-semibold text-base-content">{row.label}</span>
                    <span class="text-xs text-base-content/60">{row.meta}</span>
                  </div>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="card card-surface shadow-none">
        <div class="card-body gap-4 p-5">
          <div class="flex items-center justify-between">
            <span class="text-lg font-semibold tracking-tight text-base-content capitalize">
              {$_('admin_dashboard_capital_by_asset')}
            </span>
            <a href="/trading/ledger" class="btn-pill-ghost text-xs capitalize">
              {$_('admin_dashboard_view_ledger')}
            </a>
          </div>

          {#if capitalRows.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">{$_('admin_dashboard_no_capital_rows')}</span>
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
                    {$_('admin_dashboard_available_locked', {
                      values: {
                        available: formatNumber(asset.available, { maximumFractionDigits: 8 }),
                        locked: formatNumber(asset.locked, { maximumFractionDigits: 8 }),
                      },
                    })}
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
                {$_('admin_dashboard_order_activity')}
              </span>
              <span class="text-xs text-base-content/50 capitalize">
                {$_('admin_dashboard_active_orders_first', { values: { range: summary.range.key } })}
              </span>
            </div>
            <a href="/trading/exchange-orders" class="btn-pill-ghost text-xs capitalize">
              {$_('admin_dashboard_view_orders')}
            </a>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">{$_('admin_dashboard_tracked')}</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">{formatNumber(summary.orderFlow.total)}</span>
            </div>
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">{$_('admin_dashboard_trades')}</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">{formatNumber(summary.orderFlow.volume.tradeCount)}</span>
            </div>
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">{$_('admin_dashboard_notional')}</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">
                {formatNumber(summary.orderFlow.volume.notionalVolume, { maximumFractionDigits: 8 })}
              </span>
            </div>
            <div class="card-surface-inset flex flex-col p-3">
              <span class="text-xs text-base-content/50 capitalize">{$_('admin_dashboard_open')}</span>
              <span class="font-mono-num text-lg font-semibold text-base-content">{formatNumber(summary.kpis.openOrders)}</span>
            </div>
          </div>

          {#if displayedOrders.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">{$_('admin_dashboard_no_recent_orders')}</span>
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr class="border-b border-base-300 text-xs font-medium capitalize tracking-wide text-base-content/50">
                    <th class="font-medium">{$_('order_id')}</th>
                    <th class="font-medium">{$_('pair')}</th>
                    <th class="font-medium">{$_('side')}</th>
                    <th class="font-medium text-right">{$_('filled_orders')}</th>
                    <th class="font-medium">{$_('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each displayedOrders.slice(0, 5) as order, index (`${order.orderId}-${index}`)}
                    <tr class="border-b border-base-300 hover:bg-neutral">
                      <td><span class="font-mono-num text-xs text-base-content/70">{shortId(order.orderId)}</span></td>
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
              {$_('admin_dashboard_active_strategy_health')}
            </span>
            <a href="/trading/strategies" class="btn-pill-ghost text-xs capitalize">
              {$_('admin_dashboard_view_strategies')}
            </a>
          </div>

          {#if displayedStrategies.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">{$_('admin_dashboard_no_strategy_rows')}</span>
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr class="border-b border-base-300 text-xs font-medium capitalize tracking-wide text-base-content/50">
                    <th class="font-medium">{$_('admin_direct_mm_strategy')}</th>
                    <th class="font-medium">{$_('status')}</th>
                    <th class="font-medium">{$_('admin_strategy_definition_name')}</th>
                    <th class="font-medium text-right">{$_('admin_strategy_updated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each displayedStrategies as strategy (strategy.strategyKey)}
                    <tr class="border-b border-base-300 hover:bg-neutral">
                      <td>
                        <div class="flex flex-col">
                          <span class="text-sm font-medium text-base-content">{shortStrategyName(strategy.strategyKey)}</span>
                          <span class="text-xs text-base-content/50 capitalize">{strategy.strategyType || $_('admin_dashboard_type_unavailable')}</span>
                        </div>
                      </td>
                      <td>
                        <div class="flex items-center gap-2">
                          <span class="h-1.5 w-1.5 rounded-full {safeDot(strategy.status)}"></span>
                          <span class="text-xs text-base-content/70 capitalize">{statusLabel(strategy.status)}</span>
                        </div>
                      </td>
                      <td>
                        <span class="text-sm text-base-content/70">{strategy.definitionName || strategy.strategyDefinitionId || $_('admin_unavailable')}</span>
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
              {$_('admin_dashboard_recent_intents')}
            </span>
            <span class="text-xs text-base-content/50 capitalize">
              {$_('admin_dashboard_backend_last', { values: { count: summary.limits.recentItems } })}
            </span>
          </div>

          {#if displayedIntents.length === 0}
            <div class="card-surface-inset p-4">
              <span class="text-sm text-base-content/60">{$_('admin_dashboard_no_recent_intents', { values: { range: summary.range.key } })}</span>
            </div>
          {:else}
            <ul class="divide-y divide-base-300">
              {#each displayedIntents as intent (intent.intentId)}
                <li class="flex items-center gap-3 py-2.5">
                  <span class="font-mono-num text-xs text-base-content/50 w-28 shrink-0">{formatTimestamp(intent.createdAt)}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium {intentTone[intent.type] || 'bg-base-content/5 text-base-content/60'}"
                  >
                    {readableIntentType(intent.type)}
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
                      {intent.exchange}
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
            {$_('admin_system_status')}
          </span>
          <a href="/system/health" class="btn-pill-ghost text-xs capitalize">
            {$_('admin_dashboard_view_health')}
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
            <span class="text-sm font-medium text-base-content capitalize">{$_('admin_dashboard_reported_health_issues')}</span>
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

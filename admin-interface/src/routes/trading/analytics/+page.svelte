<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';
  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import AdminStatePanel from '$lib/components/admin/shared/AdminStatePanel.svelte';
  import {
    ANALYTICS_RANGES,
    ANALYTICS_SCOPES,
    fetchAdminAnalyticsFoundation,
    fetchDirectMarketMakingDashboard,
    type AdminAnalyticsQuery,
  } from '$lib/helpers/api/analytics';
  import type {
    AdminAnalyticsFoundationResponse,
    AnalyticsRange,
    AnalyticsScope,
    DirectMarketMakingDashboardResponse,
  } from '$lib/types/hufi/admin-analytics';
  import {
    analyticsQueriesMatch,
    buildAnalyticsChartSections,
    buildAnalyticsRequestKey,
    buildAnalyticsScopeLabel,
    buildDirectMarketMakingMetricCards,
    resolveAnalyticsPanelState,
    type AnalyticsRouteQuery,
  } from './analytics-view-model';
  import AnalyticsChartCard from './components/AnalyticsChartCard.svelte';
  import AnalyticsMetricCard from './components/AnalyticsMetricCard.svelte';

  let foundation = $state<AdminAnalyticsFoundationResponse | null>(null);
  let dashboard = $state<DirectMarketMakingDashboardResponse | null>(null);
  let appliedQuery = $state<AnalyticsRouteQuery>({ scope: 'admin', range: '24h' });
  let draftScope = $state<AnalyticsScope>('admin');
  let draftRange = $state<AnalyticsRange>('24h');
  let draftOrderId = $state('');
  let draftExchange = $state('');
  let draftPair = $state('');
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let filterError = $state<string | null>(null);
  let activeRequestKey = '';
  let requestSequence = 0;

  const draftQuery = $derived<AnalyticsRouteQuery>({
    scope: draftScope,
    range: draftRange,
    orderId: draftOrderId.trim(),
    exchange: draftExchange.trim(),
    pair: draftPair.trim(),
  });
  const metricCards = $derived(buildDirectMarketMakingMetricCards(dashboard));
  const chartSections = $derived(buildAnalyticsChartSections(foundation));
  const panelState = $derived(resolveAnalyticsPanelState({ loading, error, foundation, dashboard }));
  const hasUnappliedChanges = $derived(!analyticsQueriesMatch(appliedQuery, draftQuery));
  const selectedScopeLabel = $derived(
    buildAnalyticsScopeLabel(appliedQuery, {
      admin: $_('admin_analytics_scope_admin'),
      pair: $_('admin_analytics_scope_pair'),
      order: $_('admin_analytics_scope_order'),
    }),
  );

  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : $_('admin_analytics_load_failed');

  const validateQuery = (query: AnalyticsRouteQuery) => {
    if (query.scope === 'order' && !query.orderId?.trim()) {
      return $_('admin_analytics_order_required');
    }

    if (query.scope === 'pair' && (!query.exchange?.trim() || !query.pair?.trim())) {
      return $_('admin_analytics_pair_required');
    }

    return null;
  };

  const toApiQuery = (query: AnalyticsRouteQuery): AdminAnalyticsQuery => ({
    scope: query.scope,
    range: query.range,
    orderId: query.orderId?.trim() || '',
    exchange: query.exchange?.trim() || '',
    pair: query.pair?.trim() || '',
  });

  const syncDraftToApplied = (query: AnalyticsRouteQuery) => {
    draftScope = query.scope;
    draftRange = query.range;
    draftOrderId = query.orderId || '';
    draftExchange = query.exchange || '';
    draftPair = query.pair || '';
  };

  const loadAnalytics = async (
    query: AnalyticsRouteQuery = appliedQuery,
    options: { throwOnError?: boolean; force?: boolean; commitDraft?: boolean } = {},
  ) => {
    const validationError = validateQuery(query);

    if (validationError) {
      filterError = validationError;
      loading = false;
      refreshing = false;
      if (options.throwOnError) {
        throw new Error(validationError);
      }
      return;
    }

    const requestKey = buildAnalyticsRequestKey({
      scope: query.scope,
      range: query.range,
      orderId: query.orderId,
      exchange: query.exchange,
      pair: query.pair,
    });

    if (!options.force && requestKey === activeRequestKey && foundation && dashboard) {
      return;
    }

    activeRequestKey = requestKey;
    const sequence = ++requestSequence;
    const initialLoad = foundation === null || dashboard === null;

    loading = initialLoad;
    refreshing = !initialLoad;
    error = null;
    filterError = null;

    try {
      const [nextFoundation, nextDashboard] = await Promise.all([
        fetchAdminAnalyticsFoundation(toApiQuery(query)),
        fetchDirectMarketMakingDashboard(toApiQuery(query)),
      ]);

      if (sequence !== requestSequence) {
        return;
      }

      foundation = nextFoundation;
      dashboard = nextDashboard;
      const nextAppliedQuery: AnalyticsRouteQuery = {
        ...query,
        range: nextFoundation.range.key === 'custom' ? query.range : nextFoundation.range.key,
      };
      appliedQuery = nextAppliedQuery;
      if (options.commitDraft) {
        syncDraftToApplied(nextAppliedQuery);
      }
    } catch (cause) {
      if (sequence !== requestSequence) {
        return;
      }

      error = errorMessage(cause);
      foundation = null;
      dashboard = null;
      if (options.throwOnError) {
        throw new Error(error);
      }
    } finally {
      if (sequence === requestSequence) {
        loading = false;
        refreshing = false;
      }
    }
  };

  const refreshAnalytics = () =>
    toast.promise(loadAnalytics(appliedQuery, { throwOnError: true, force: true }), {
      loading: $_('admin_analytics_refreshing'),
      success: $_('admin_analytics_refreshed'),
      error: $_('admin_analytics_refresh_failed'),
    });

  const applyFilters = () => {
    void loadAnalytics(draftQuery, { force: true, commitDraft: true });
  };

  onMount(() => {
    void loadAnalytics(appliedQuery, { force: true, commitDraft: true });
  });
</script>

<section class="space-y-6" data-testid="analytics-page">
  <PageHeader
    eyebrow={$_('admin.nav.trading')}
    title={$_('admin_analytics_title')}
    subtitle={$_('admin_analytics_subtitle')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        disabled={loading || refreshing}
        onclick={() => void refreshAnalytics()}
      >
        {refreshing ? $_('admin_analytics_refreshing') : $_('refresh')}
      </button>
    {/snippet}
  </PageHeader>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      <div class="flex flex-col gap-1">
        <span class="text-lg font-semibold capitalize">{$_('admin_analytics_filters')}</span>
        <span class="text-sm text-base-content/60">
          {$_('admin_analytics_scope_selected', { values: { scope: selectedScopeLabel, range: appliedQuery.range } })}
        </span>
        {#if hasUnappliedChanges}
          <span class="text-xs text-base-content/60" data-testid="analytics-unapplied-filters">
            {$_('admin_analytics_unapplied_filters')}
          </span>
        {/if}
        {#if filterError}
          <span class="text-xs text-error" data-testid="analytics-filter-error">{filterError}</span>
        {/if}
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-5">
        <label class="form-control gap-1">
          <span class="label-text text-xs capitalize">{$_('admin_analytics_scope')}</span>
          <select bind:value={draftScope} class="select select-bordered select-sm">
            {#each ANALYTICS_SCOPES as option}
              <option value={option}>{$_(`admin_analytics_scope_${option}`)}</option>
            {/each}
          </select>
        </label>
        <label class="form-control gap-1">
          <span class="label-text text-xs capitalize">{$_('admin_direct_mm_date_range')}</span>
          <select bind:value={draftRange} class="select select-bordered select-sm">
            {#each ANALYTICS_RANGES as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>
        <label class="form-control gap-1">
          <span class="label-text text-xs capitalize">{$_('admin_analytics_order_id')}</span>
          <input bind:value={draftOrderId} class="input input-bordered input-sm font-mono" placeholder="order-..." />
        </label>
        <label class="form-control gap-1">
          <span class="label-text text-xs capitalize">{$_('admin_direct_mm_exchange')}</span>
          <input bind:value={draftExchange} class="input input-bordered input-sm" placeholder="binance" />
        </label>
        <label class="form-control gap-1">
          <span class="label-text text-xs capitalize">{$_('admin_symbol_pair')}</span>
          <div class="flex gap-2">
            <input bind:value={draftPair} class="input input-bordered input-sm" placeholder="BTC/USDT" />
            <button
              type="button"
              class="btn btn-sm btn-outline capitalize"
              disabled={loading || refreshing || !hasUnappliedChanges}
              onclick={applyFilters}
            >
              {$_('admin_filter')}
            </button>
          </div>
        </label>
      </div>
    </div>
  </div>

  {#if panelState === 'loading'}
    <AdminStatePanel
      kind="loading"
      title={$_('admin_analytics_loading_title')}
      message={$_('admin_analytics_loading_message')}
      context={$_('admin_analytics_context')}
      testId="analytics-loading"
    />
  {:else if panelState === 'error'}
    <AdminStatePanel
      kind="error"
      title={$_('admin_analytics_unavailable')}
      message={error || $_('admin_analytics_load_failed')}
      context={$_('admin_analytics_context')}
      actionLabel={$_('admin_retry')}
      onAction={() => void loadAnalytics(appliedQuery, { force: true })}
      testId="analytics-error"
    />
  {:else if panelState === 'empty'}
    <AdminStatePanel
      kind="empty"
      title={$_('admin_analytics_empty_title')}
      message={$_('admin_analytics_empty_message')}
      context={$_('admin_analytics_context')}
      actionLabel={$_('admin_retry')}
      onAction={() => void loadAnalytics(appliedQuery, { force: true })}
      testId="analytics-empty"
    />
  {:else}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label={$_('admin_analytics_direct_mm_cards')}>
      {#each metricCards as card (card.key)}
        <AnalyticsMetricCard {card} />
      {/each}
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label={$_('admin_analytics_charts')}>
      {#each chartSections as section (section.key)}
        <AnalyticsChartCard {section} />
      {/each}
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-2 p-4">
        <span class="text-xs font-semibold text-base-content/60 capitalize">{$_('admin_analytics_data_contract')}</span>
        <span class="text-sm text-base-content/60">
          {$_('admin_analytics_contract_summary', {
            values: {
              sources: foundation?.dataSources.length ?? 0,
              orders: dashboard?.dashboard.orderIds.length ?? 0,
              generatedAt: foundation?.generatedAt ?? $_('admin_unavailable'),
            },
          })}
        </span>
      </div>
    </div>
  {/if}
</section>

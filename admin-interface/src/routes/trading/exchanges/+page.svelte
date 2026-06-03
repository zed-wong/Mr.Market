<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import AdminStatePanel from "$lib/components/admin/shared/AdminStatePanel.svelte";
  import { classifyAdminError, type AdminErrorState } from "$lib/helpers/admin/common-states";
  import { summarizeExchangeReadiness } from "$lib/helpers/admin/exchange-readiness";
  import { getAccessToken } from "$lib/helpers/api/client";
  import { getGrowBasicInfoStrict } from "$lib/helpers/mrm/grow";
  import {
    getSupportedExchanges,
    getAllCcxtExchanges,
  } from "$lib/helpers/mrm/admin/growdata";
  import PageHeader from "$lib/components/admin/shared/PageHeader.svelte";
  import AddExchange from "$lib/components/admin/exchanges/addExchange.svelte";
  import ExchangeList from "$lib/components/admin/exchanges/exchangeList.svelte";
  import type { GrowInfo } from "$lib/types/hufi/grow";

  let supportedExchanges = $state<string[]>([]);
  let allCcxtExchanges = $state<string[]>([]);
  let growInfo = $state<GrowInfo | null>(null);
  let loading = $state(true);
  let isRefreshing = $state(false);
  let exchangeError = $state<AdminErrorState | null>(null);
  let metadataError = $state<AdminErrorState | null>(null);

  let exchanges = $derived(
    (growInfo?.exchanges ?? []) as {
      exchange_id: string;
      name: string;
      icon_url?: string;
      enable: boolean;
    }[],
  );

  let totals = $derived({
    ...summarizeExchangeReadiness(exchanges),
    supported: exchanges.filter((e) =>
      supportedExchanges.includes(e.exchange_id),
    ).length,
    ccxt: allCcxtExchanges.length,
  });

  async function loadExchangeManagement(showLoading = true) {
    const token = getAccessToken();
    if (!token) {
      growInfo = null;
      exchangeError = classifyAdminError(
        new Error($_('admin_exchanges_session_message')),
        $_('admin_exchanges_configuration_load_failed'),
      );
      loading = false;
      return;
    }

    if (showLoading) {
      loading = true;
      growInfo = null;
    }
    exchangeError = null;

    try {
      growInfo = await getGrowBasicInfoStrict(token);
    } catch (cause) {
      growInfo = null;
      exchangeError = classifyAdminError(cause, $_('admin_exchanges_configuration_load_failed'));
    } finally {
      loading = false;
    }
  }

  async function RefreshExchanges(showToast = true) {
    isRefreshing = true;
    const refreshTask = loadExchangeManagement(false).finally(() => {
      isRefreshing = false;
    });
    if (showToast) {
      await toast.promise(
        refreshTask.then(() => {
          if (exchangeError) {
            throw new Error(exchangeError.message);
          }
        }),
        {
          loading: $_("admin_exchanges_refreshing"),
          success: $_("admin_exchanges_refreshed"),
          error: $_("admin_exchanges_refresh_failed"),
        },
      );
    } else {
      await refreshTask;
    }
  }

  async function loadMetadata() {
    const token = getAccessToken();
    if (!token) return;
    metadataError = null;
    try {
      supportedExchanges = (await getSupportedExchanges(token)) as string[];
      allCcxtExchanges = await getAllCcxtExchanges(token);
    } catch (cause) {
      metadataError = classifyAdminError(cause, $_('admin_exchanges_metadata_load_failed'));
    }
  }

  onMount(() => {
    if ($page.data.growInfoError) {
      exchangeError = classifyAdminError(
        new Error(String($page.data.growInfoError)),
        $_('admin_exchanges_configuration_load_failed'),
      );
      loading = false;
    } else {
      void loadExchangeManagement();
    }
    void loadMetadata();
  });
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow={$_("admin.nav.trading")}
    title={$_("exchanges")}
    subtitle={$_("manage_connected_exchanges")}
  >
    {#snippet actions()}
      <AddExchange
        {allCcxtExchanges}
        existingExchanges={exchanges}
        onRefresh={() => RefreshExchanges(false)}
      />
      <button
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        onclick={() => RefreshExchanges()}
        disabled={isRefreshing}
      >
        {isRefreshing ? $_("refreshing_msg") : $_("refresh")}
      </button>
    {/snippet}
  </PageHeader>

  {#if $page.data.waitingForClientSession || loading}
    <AdminStatePanel
      kind="loading"
      context={$_("admin_exchanges_management")}
      title={$_("admin_exchanges_loading_title")}
      message={$_("admin_exchanges_loading_message")}
      testId="exchange-loading"
    />
    <div class="grid grid-cols-2 gap-4 md:grid-cols-5" aria-hidden="true">
      {#each Array(5) as _}
        <div class="skeleton h-24 rounded-xl"></div>
      {/each}
    </div>
    <div class="skeleton h-64 w-full rounded-xl" aria-hidden="true"></div>
  {:else if exchangeError}
    <AdminStatePanel
      kind={exchangeError.kind}
      context={$_("admin_exchanges_management")}
      title={exchangeError.title}
      message={exchangeError.message}
      actionLabel={exchangeError.kind === 'session' ? $_("admin_sign_in_again") : $_("admin_retry")}
      actionHref={exchangeError.kind === 'session' ? '/login' : ''}
      onAction={exchangeError.kind === 'session' ? undefined : () => RefreshExchanges(false)}
      testId="exchange-error"
    />
  {:else}
    {#if metadataError}
      <AdminStatePanel
        kind={metadataError.kind}
        context={$_("admin_connectivity_exchange_metadata")}
        title={metadataError.title}
        message={metadataError.message}
        actionLabel={$_("admin_connectivity_retry_metadata")}
        onAction={() => {
          const token = getAccessToken();
          if (!token) return;
          metadataError = null;
          Promise.all([getSupportedExchanges(token), getAllCcxtExchanges(token)])
            .then(([supported, ccxt]) => {
              supportedExchanges = supported as string[];
              allCcxtExchanges = ccxt;
            })
            .catch((cause) => (metadataError = classifyAdminError(cause, 'Exchange metadata failed to load')));
        }}
        testId="exchange-metadata-error"
      />
    {/if}

    <!-- KPI row -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("admin_exchanges_total")}</span>
        <span class="font-mono text-2xl font-semibold">{totals.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("admin_health_ready")}</span>
        <span class="font-mono text-2xl font-semibold text-success">{totals.ready}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("disabled")}</span>
        <span class="font-mono text-2xl font-semibold text-warning">{totals.disabled}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("supported")}</span>
        <span class="font-mono text-2xl font-semibold">{totals.supported}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("admin_direct_mm_state_unknown")}</span>
        <span class="font-mono text-2xl font-semibold">{totals.unknown}</span>
      </div>
    </div>
    </div>

    {#if exchanges.length === 0}
      <AdminStatePanel
        kind="empty"
        context={$_("admin_exchanges_management")}
        title={$_("admin_exchanges_empty_title")}
        message={$_("admin_exchanges_empty_message")}
        actionLabel={$_("add_exchange")}
        onAction={() => document.querySelector<HTMLButtonElement>('[data-testid="add-exchange-trigger"]')?.click()}
        testId="exchange-empty"
      />
    {:else}
      <ExchangeList {exchanges} {supportedExchanges} onRefresh={() => RefreshExchanges(false)} />
    {/if}
  {/if}
</section>

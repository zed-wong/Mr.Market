<script lang="ts">
  import clsx from "clsx";
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
        new Error('Session expired. Sign in again before viewing exchange management.'),
        'Exchange configuration failed to load',
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
      exchangeError = classifyAdminError(cause, 'Exchange configuration failed to load');
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
          loading: $_("refreshing_msg"),
          success: $_("refresh_success_msg"),
          error: $_("refresh_failed_msg"),
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
      metadataError = classifyAdminError(cause, 'Exchange metadata failed to load');
    }
  }

  onMount(() => {
    if ($page.data.growInfoError) {
      exchangeError = classifyAdminError(
        new Error(String($page.data.growInfoError)),
        'Exchange configuration failed to load',
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
    eyebrow="trading"
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
        class="btn btn-square btn-outline btn-sm"
        onclick={() => RefreshExchanges()}
        aria-label="refresh"
      >
        <span
          class={clsx(isRefreshing && "loading loading-spinner loading-sm")}
        >
          {#if !isRefreshing}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="w-5 h-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          {/if}
        </span>
      </button>
    {/snippet}
  </PageHeader>

  {#if $page.data.waitingForClientSession || loading}
    <AdminStatePanel
      kind="loading"
      context="exchange management"
      title="loading exchange management"
      message="Loading configured exchanges, readiness status, and enablement before showing empty or completed exchange-management content."
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
      context="exchange management"
      title={exchangeError.title}
      message={exchangeError.message}
      actionLabel={exchangeError.kind === 'session' ? 'sign in again' : 'retry'}
      actionHref={exchangeError.kind === 'session' ? '/login' : ''}
      onAction={exchangeError.kind === 'session' ? undefined : () => RefreshExchanges(false)}
      testId="exchange-error"
    />
  {:else}
    {#if metadataError}
      <AdminStatePanel
        kind={metadataError.kind}
        context="exchange metadata"
        title={metadataError.title}
        message={metadataError.message}
        actionLabel="retry metadata"
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
        <span class="text-xs text-base-content/60 capitalize">total exchanges</span>
        <span class="font-mono text-2xl font-semibold">{totals.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">ready</span>
        <span class="font-mono text-2xl font-semibold text-success">{totals.ready}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">disabled</span>
        <span class="font-mono text-2xl font-semibold text-warning">{totals.disabled}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">supported</span>
        <span class="font-mono text-2xl font-semibold">{totals.supported}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">unknown</span>
        <span class="font-mono text-2xl font-semibold">{totals.unknown}</span>
      </div>
    </div>
    </div>

    {#if exchanges.length === 0}
      <AdminStatePanel
        kind="empty"
        context="exchange management"
        title="exchange readiness missing"
        message="No exchanges are configured yet. Add the first exchange before configuring API keys or starting direct market-making operations."
        actionLabel="add exchange"
        onAction={() => document.querySelector<HTMLButtonElement>('[data-testid="add-exchange-trigger"]')?.click()}
        testId="exchange-empty"
      />
    {:else}
      <ExchangeList {exchanges} {supportedExchanges} onRefresh={() => RefreshExchanges(false)} />
    {/if}
  {/if}
</section>

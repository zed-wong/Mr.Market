<script lang="ts">
  import clsx from "clsx";
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { invalidate } from "$app/navigation";
  import AdminStatePanel from "$lib/components/admin/shared/AdminStatePanel.svelte";
  import { classifyAdminError, type AdminErrorState } from "$lib/helpers/admin/common-states";
  import { summarizeExchangeReadiness } from "$lib/helpers/admin/exchange-readiness";
  import { getAccessToken } from "$lib/helpers/api/client";
  import {
    getSupportedExchanges,
    getAllCcxtExchanges,
  } from "$lib/helpers/mrm/admin/growdata";
  import PageHeader from "$lib/components/admin/shared/PageHeader.svelte";
  import AddExchange from "$lib/components/admin/exchanges/addExchange.svelte";
  import ExchangeList from "$lib/components/admin/exchanges/exchangeList.svelte";

  let supportedExchanges = $state<string[]>([]);
  let allCcxtExchanges = $state<string[]>([]);
  let isRefreshing = $state(false);
  let metadataError = $state<AdminErrorState | null>(null);

  let exchanges = $derived(
    ($page.data.growInfo?.exchanges ?? []) as {
      exchange_id: string;
      name: string;
      icon_url?: string;
      enable: boolean;
    }[],
  );

  let exchangeLoadError = $derived(
    $page.data.growInfoError
      ? classifyAdminError(new Error(String($page.data.growInfoError)), 'Exchange configuration failed to load')
      : null,
  );

  let totals = $derived({
    ...summarizeExchangeReadiness(exchanges),
    supported: exchanges.filter((e) =>
      supportedExchanges.includes(e.exchange_id),
    ).length,
    ccxt: allCcxtExchanges.length,
  });

  function getRandomDelay() {
    return Math.floor(Math.random() * (3000 - 2000 + 1)) + 2000;
  }

  async function RefreshExchanges(showToast = true) {
    isRefreshing = true;
    const refreshTask = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        invalidate("admin:settings:exchanges")
          .then(() => resolve())
          .catch((error) => reject(error))
          .finally(() => {
            isRefreshing = false;
          });
      }, getRandomDelay());
    });
    if (showToast) {
      await toast.promise(refreshTask, {
        loading: $_("refreshing_msg"),
        success: $_("refresh_success_msg"),
        error: $_("refresh_failed_msg"),
      });
    } else {
      await refreshTask;
    }
  }

  onMount(async () => {
    const token = getAccessToken();
    if (!token) return;
    metadataError = null;
    try {
      supportedExchanges = (await getSupportedExchanges(token)) as string[];
      allCcxtExchanges = await getAllCcxtExchanges(token);
    } catch (cause) {
      metadataError = classifyAdminError(cause, 'Exchange metadata failed to load');
    }
  });
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title={$_("exchanges")}
    subtitle={$_("manage_connected_exchanges")}
  >
    {#snippet actions()}
      <AddExchange {allCcxtExchanges} existingExchanges={exchanges} />
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

  {#if $page.data.waitingForClientSession}
    <AdminStatePanel
      kind="loading"
      context="exchange management"
      title="loading exchange configuration"
      message="Waiting for the browser session before loading configured exchanges and supported exchange metadata."
      testId="exchange-loading"
    />
  {:else if exchangeLoadError}
    <AdminStatePanel
      kind={exchangeLoadError.kind}
      context="exchange management"
      title={exchangeLoadError.title}
      message={exchangeLoadError.message}
      actionLabel={exchangeLoadError.kind === 'session' ? 'sign in again' : 'retry'}
      actionHref={exchangeLoadError.kind === 'session' ? '/login' : ''}
      onAction={exchangeLoadError.kind === 'session' ? undefined : () => RefreshExchanges(false)}
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
      <ExchangeList {exchanges} {supportedExchanges} />
    {/if}
  {/if}
</section>

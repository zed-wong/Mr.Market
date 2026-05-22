<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { page } from "$app/stores";
  import { invalidate } from "$app/navigation";

  import type { MarketMakingPair, Exchange } from "$lib/types/hufi/grow";

  import PageHeader from "$lib/components/admin/shared/PageHeader.svelte";
  import AddMarketMakingPair from "$lib/components/admin/settings/marketMaking/AddMarketMakingPair.svelte";
  import MarketMakingPairList from "$lib/components/admin/settings/marketMaking/MarketMakingPairList.svelte";

  let marketMakingPairs = $derived(
    ($page.data.growInfo?.market_making?.pairs ?? []) as MarketMakingPair[],
  );
  let configuredExchanges = $derived(
    ($page.data.growInfo?.exchanges ?? []) as Exchange[],
  );

  let isRefreshing = $state(false);

  let totals = $derived({
    total: marketMakingPairs.length,
    enabled: marketMakingPairs.filter((p) => p.enable).length,
    venues: new Set(marketMakingPairs.map((p) => p.exchange_id)).size,
  });

  async function RefreshMarketMakingPairs(showToast = true) {
    isRefreshing = true;
    const refreshTask = () =>
      invalidate("admin:settings:market-making").finally(() => {
        isRefreshing = false;
      });
    if (showToast) {
      await toast.promise(refreshTask, {
        loading: $_("refreshing_msg"),
        success: $_("refresh_success_msg"),
        error: $_("refresh_failed_msg"),
      });
    } else {
      await refreshTask();
    }
  }
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="trading"
    title={$_("market_making")}
    subtitle={$_("manage_market_making_pairs")}
  >
    {#snippet actions()}
      <AddMarketMakingPair
        {configuredExchanges}
        existingPairs={marketMakingPairs}
        on:refresh={() => RefreshMarketMakingPairs(false)}
      />
      <button
        class="btn btn-square btn-outline btn-sm"
        onclick={() => RefreshMarketMakingPairs()}
        aria-label="refresh"
      >
        <span
          class={isRefreshing ? "loading loading-spinner loading-sm" : ""}
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

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">total pairs</span>
        <span class="font-mono text-2xl font-semibold">{totals.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">enabled</span>
        <span class="font-mono text-2xl font-semibold text-success">{totals.enabled}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">venues</span>
        <span class="font-mono text-2xl font-semibold">{totals.venues}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">exchanges configured</span>
        <span class="font-mono text-2xl font-semibold">{configuredExchanges.length}</span>
      </div>
    </div>
  </div>

  <MarketMakingPairList
    {marketMakingPairs}
    {configuredExchanges}
    on:refresh={() => RefreshMarketMakingPairs()}
  />
</section>

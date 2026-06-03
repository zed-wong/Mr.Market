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
      await toast.promise(refreshTask(), {
        loading: "refreshing market-making pairs",
        success: "market-making pairs refreshed",
        error: "failed to refresh market-making pairs",
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
        type="button"
        class="btn btn-primary btn-sm rounded-full capitalize"
        onclick={() => RefreshMarketMakingPairs()}
        disabled={isRefreshing}
      >
        {isRefreshing ? "refreshing" : "refresh"}
      </button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("admin_market_making_total_pairs")}</span>
        <span class="font-mono text-2xl font-semibold">{totals.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("enabled")}</span>
        <span class="font-mono text-2xl font-semibold text-success">{totals.enabled}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("admin_connectivity_venues")}</span>
        <span class="font-mono text-2xl font-semibold">{totals.venues}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_("admin_market_making_exchanges_configured")}</span>
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

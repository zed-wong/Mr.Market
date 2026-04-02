<script lang="ts">
  import { _ } from "svelte-i18n";

  export let show = false;
  export let campaigns: Array<Record<string, unknown>> = [];
  export let onJoin: (campaign: Record<string, unknown>) => void;
  export let onClose: () => void;

  function formatFundAmount(amount: unknown, decimals: unknown): string {
    if (!amount) return "—";
    const raw = String(amount);
    const dec = Number(decimals) || 0;
    if (dec <= 0) return raw;
    const num = Number(raw) / Math.pow(10, dec);
    if (isNaN(num)) return raw;
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function getDetail(campaign: Record<string, unknown>, key: string): unknown {
    const d = campaign.details;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      return (d as Record<string, unknown>)[key];
    }
    return undefined;
  }

  const PAGE_SIZE = 3;
  let currentPage = 0;
  let searchQuery = "";
  let filterExchange = "";
  let filterPair = "";
  let filterType = "";

  $: exchanges = [...new Set(campaigns.map((c) => String(c.exchange_name || c.exchange || "")))].filter(Boolean);
  $: pairsOptions = [...new Set(campaigns.map((c) => String(c.symbol || c.name || "")))].filter(Boolean);
  $: types = [...new Set(campaigns.map((c) => String(c.type || "")))].filter(Boolean);

  $: filtered = campaigns.filter((c) => {
    const name = String(c.symbol || c.name || "").toLowerCase();
    const exchange = String(c.exchange_name || c.exchange || "");
    const type = String(c.type || "");
    const pair = String(c.symbol || c.name || "");

    if (searchQuery && !name.includes(searchQuery.toLowerCase())) return false;
    if (filterExchange && exchange !== filterExchange) return false;
    if (filterPair && pair !== filterPair) return false;
    if (filterType && type !== filterType) return false;
    return true;
  });

  $: totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  $: if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
  $: paginated = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function formatDate(d: unknown): string {
    if (!d) return "";
    const date = new Date(String(d));
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function statusColor(s: string): string {
    switch (s.toLowerCase()) {
      case "active": return "text-success border-success bg-success/10";
      case "ended":
      case "closed": return "text-error border-error bg-error/10";
      default: return "text-warning border-warning bg-warning/10";
    }
  }

  function resetFilters() {
    searchQuery = "";
    filterExchange = "";
    filterPair = "";
    filterType = "";
    currentPage = 0;
  }
</script>

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div class="modal-box bg-base-100 p-0 rounded-2xl max-w-[620px] shadow-2xl border border-base-200/50 max-h-[90vh] flex flex-col">
      <!-- Header -->
      <div class="p-6 pb-0">
        <div class="flex items-start justify-between mb-1">
          <div>
            <span class="text-xl font-bold text-base-content block">{$_("admin_direct_mm_available_campaigns")}</span>
            <span class="text-sm text-base-content/50">{$_("admin_direct_mm_all_campaigns_subtitle")}</span>
          </div>
          <button
            class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
            on:click={() => { resetFilters(); onClose(); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Search -->
        <div class="relative mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            class="input input-bordered w-full h-10 min-h-[40px] pl-9 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary"
            placeholder={$_("admin_direct_mm_search_campaign")}
            bind:value={searchQuery}
            on:input={() => (currentPage = 0)}
          />
        </div>

        <!-- Filters -->
        <div class="flex gap-3 mt-3 pb-4">
          <select
            class="select select-bordered select-sm flex-1 bg-base-100 text-base-content text-sm"
            bind:value={filterExchange}
            on:change={() => (currentPage = 0)}
          >
            <option value="">{$_("admin_direct_mm_all_exchanges")}</option>
            {#each exchanges as ex}
              <option value={ex}>{ex}</option>
            {/each}
          </select>
          <select
            class="select select-bordered select-sm flex-1 bg-base-100 text-base-content text-sm"
            bind:value={filterPair}
            on:change={() => (currentPage = 0)}
          >
            <option value="">{$_("admin_direct_mm_all_pairs")}</option>
            {#each pairsOptions as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
          <select
            class="select select-bordered select-sm flex-1 bg-base-100 text-base-content text-sm"
            bind:value={filterType}
            on:change={() => (currentPage = 0)}
          >
            <option value="">{$_("admin_direct_mm_all_types")}</option>
            {#each types as t}
              <option value={t}>{t}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Campaign list -->
      <div class="flex-1 overflow-y-auto px-6 pb-2">
        {#if paginated.length === 0}
          <div class="flex items-center justify-center py-12 text-base-content/40 text-sm">
            {$_("admin_direct_mm_campaigns_empty")}
          </div>
        {/if}

        <div class="flex flex-col gap-5">
          {#each paginated as campaign}
            {@const name = String(campaign.symbol || campaign.name || "—")}
            {@const status = String(campaign.status || "active")}
            {@const exchange = String(campaign.exchange_name || campaign.exchange || "—")}
            {@const rewardPool = formatFundAmount(campaign.fund_amount || campaign.rewardPool, campaign.fund_token_decimals)}
            {@const rewardToken = String(campaign.fund_token_symbol || campaign.rewardToken || "")}
            {@const dailyVolTarget = String(campaign.daily_vol_target || getDetail(campaign, "daily_vol_target") || campaign.dailyVolTarget || "—")}
            {@const dailyVolToken = String(campaign.daily_vol_token || getDetail(campaign, "daily_vol_token") || campaign.dailyVolToken || "")}
            {@const campaignType = String(campaign.type || campaign.campaignType || "Market Making")}
            {@const startDate = formatDate(campaign.start_date || campaign.startDate)}
            {@const endDate = formatDate(campaign.end_date || campaign.endDate)}

            <div class="flex flex-col gap-3">
              <!-- Name + exchange + status -->
              <div class="flex items-start justify-between">
                <div>
                  <span class="font-bold text-base-content text-[15px] block">
                    {name} {campaignType !== "—" ? campaignType : ""}
                  </span>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 text-base-content/40">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                    </svg>
                    <span class="text-xs text-base-content/50">{exchange}</span>
                  </div>
                </div>
                <span class="text-[10px] font-bold tracking-wider capitalize rounded-md px-2 py-0.5 {statusColor(status)}">
                  {status}
                </span>
              </div>

              <!-- Info grid -->
              <div class="grid grid-cols-2 border border-base-300 rounded-xl">
                <div class="p-3 border-r border-b border-base-300">
                  <span class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_reward_pool")}</span>
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content">{rewardPool}{rewardToken ? ` ${rewardToken}` : ""}</span>
                  </div>
                </div>
                <div class="p-3 border-b border-base-300">
                  <span class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_campaign_type")}</span>
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content capitalize">{campaignType}</span>
                  </div>
                </div>
                <div class="p-3 border-r border-base-300">
                  <span class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_daily_volume_target")}</span>
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content">{dailyVolTarget}{dailyVolToken ? ` ${dailyVolToken}` : ""}</span>
                  </div>
                </div>
                <div class="p-3">
                  <span class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_duration")}</span>
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content">
                      {#if startDate && endDate}
                        {startDate} - {endDate}
                      {:else}
                        —
                      {/if}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Join button -->
              <button
                class="btn btn-primary text-white text-sm font-semibold rounded-lg w-full shadow-sm"
                on:click={() => onJoin(campaign)}
              >
                {$_("admin_direct_mm_join_campaign_title")}
              </button>
            </div>

            <!-- Divider between campaigns (not after last) -->
            {#if paginated.indexOf(campaign) < paginated.length - 1}
              <div class="border-b border-base-200"></div>
            {/if}
          {/each}
        </div>
      </div>

      <!-- Footer: pagination -->
      {#if filtered.length > 0}
        <div class="flex items-center justify-between px-6 py-4 border-t border-base-200">
          <span class="text-sm text-base-content/50">
            {$_("admin_direct_mm_showing")}
            <span class="font-semibold text-base-content">{paginated.length}</span>
            {$_("admin_direct_mm_of")}
            <span class="font-semibold text-base-content">{filtered.length}</span>
          </span>
          <div class="flex gap-1">
            <button
              class="btn btn-sm btn-ghost btn-square border border-base-300"
              disabled={currentPage === 0}
              on:click={() => (currentPage = Math.max(0, currentPage - 1))}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              class="btn btn-sm btn-ghost btn-square border border-base-300"
              disabled={currentPage >= totalPages - 1}
              on:click={() => (currentPage = Math.min(totalPages - 1, currentPage + 1))}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

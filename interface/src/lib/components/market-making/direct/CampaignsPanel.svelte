<script lang="ts">
  import { _ } from "svelte-i18n";
  export let campaigns: Array<Record<string, unknown>> = [];
  export let onJoin: (campaign: Record<string, unknown>) => void;
  export let onViewAll: () => void = () => {};

  $: campaign = campaigns.length > 0 ? campaigns[0] : null;
  $: campaignDetails = ((campaign?.details as Record<string, unknown>) || {});

  function formatFundAmount(amount: unknown, decimals: unknown): string {
    if (!amount) return "—";
    const raw = String(amount);
    const dec = Number(decimals) || 0;
    if (dec <= 0) return raw;
    const num = Number(raw) / Math.pow(10, dec);
    if (isNaN(num)) return raw;
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function formatDate(d: unknown): string {
    if (!d) return "";
    const date = new Date(String(d));
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function statusColor(s: string): string {
    switch (s.toLowerCase()) {
      case "active": return "text-success border-success";
      case "ended":
      case "closed": return "text-error border-error";
      default: return "text-warning border-warning";
    }
  }
</script>

<div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full">
  <div class="flex items-start justify-between mb-4">
    <div>
      <span class="text-[1.1rem] font-bold text-base-content block">
        {$_("admin_direct_mm_available_campaigns")}
      </span>
      <span class="text-[13px] text-base-content/50 mt-1">
        {$_("admin_direct_mm_campaigns_subtitle")}
      </span>
    </div>
    {#if campaigns.length > 1}
      <button
        class="text-primary font-semibold text-sm flex items-center gap-1 hover:underline whitespace-nowrap bg-transparent border-none p-0 cursor-pointer"
        on:click={onViewAll}
      >
        {$_("admin_direct_mm_view_all")}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    {/if}
  </div>

  {#if campaign}
    {@const name = String(campaign.symbol || campaign.name || "—")}
    {@const status = String(campaign.status || "active")}
    {@const exchange = String(campaign.exchange_name || campaign.exchange || "—")}
    {@const rewardPool = formatFundAmount(campaign.fund_amount || campaign.rewardPool, campaign.fund_token_decimals)}
    {@const rewardToken = String(campaign.fund_token_symbol || campaign.rewardToken || "")}
    {@const dailyVolTarget = String(campaign.daily_vol_target || campaignDetails.daily_vol_target || campaign.dailyVolTarget || "—")}
    {@const dailyVolToken = String(campaign.daily_vol_token || campaignDetails.daily_vol_token || campaign.dailyVolToken || "")}
    {@const campaignType = String(campaign.type || campaign.campaignType || "Market Making")}
    {@const startDate = formatDate(campaign.start_date || campaign.startDate)}
    {@const endDate = formatDate(campaign.end_date || campaign.endDate)}

    <div class="bg-base-200/40 rounded-xl p-5 flex flex-col gap-4 mt-2">
      <!-- Header: pair name + status -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex items-center -space-x-2">
            <div class="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold ring-2 ring-base-100">
              {name.split(/[/ -]/)[0]?.charAt(0) || "?"}
            </div>
            <div class="w-9 h-9 rounded-full bg-info flex items-center justify-center text-white text-xs font-bold ring-2 ring-base-100">
              {name.split(/[/ -]/)[1]?.trim().charAt(0) || "$"}
            </div>
          </div>
          <div class="flex flex-col">
            <span class="font-bold text-base-content text-[15px]">{name}</span>
            <span class="text-xs text-base-content/50"
              >{$_("admin_direct_mm_exchange_label")}: {exchange}</span
            >
          </div>
        </div>
        <span class="text-xs font-bold tracking-wider capitalize border rounded-md px-2 py-0.5 {statusColor(status)}">
          {status}
        </span>
      </div>

      <!-- Info grid -->
      <div class="grid grid-cols-2 gap-y-4 gap-x-6">
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_reward_pool")}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">{rewardPool}{rewardToken ? ` ${rewardToken}` : ""}</span>
          </div>
        </div>
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_daily_volume_target")}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">{dailyVolTarget}{dailyVolToken ? ` ${dailyVolToken}` : ""}</span>
          </div>
        </div>
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_campaign_type")}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">{campaignType}</span>
          </div>
        </div>
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_date_range")}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">
              {#if startDate && endDate}
                {startDate} - {endDate}
              {:else}
                {$_("admin_direct_mm_na")}
              {/if}
            </span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-4 mt-1">
        <button
          class="btn btn-primary text-white text-sm font-semibold py-2.5 rounded-lg flex-grow shadow-sm"
          on:click={() => onJoin(campaign)}
        >
          {$_("admin_direct_mm_join_campaign_title")}
        </button>
        <button
          class="text-primary text-sm font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer w-[80px] text-center"
        >
          {$_("admin_direct_mm_details")}
        </button>
      </div>
    </div>
  {:else}
    <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
      {$_("admin_direct_mm_campaigns_empty")}
    </div>
  {/if}
</div>

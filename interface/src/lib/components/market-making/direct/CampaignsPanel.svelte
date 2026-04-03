<script lang="ts">
  import { _ } from "svelte-i18n";
  import { formatFundAmount } from "./helpers";
  import type { AdminCampaign } from "$lib/types/hufi/admin-direct-market-making";

  export let campaigns: AdminCampaign[] = [];
  export let onJoin: (campaign: AdminCampaign) => void;
  export let onViewAll: () => void = () => {};

  $: joinedCampaigns = campaigns.filter((campaign) => campaign.joined);
  $: availableCampaigns = campaigns.filter((campaign) => !campaign.joined);
  $: featuredCampaign = availableCampaigns[0] || joinedCampaigns[0] || null;

  function formatDate(d: unknown): string {
    if (!d) return "";
    const date = new Date(String(d));
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTargetValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function getTargetLabel(type: unknown): string {
    switch (String(type || "").toUpperCase()) {
      case "THRESHOLD":
        return $_("admin_direct_mm_minimum_balance_target");
      case "HOLDING":
        return $_("admin_direct_mm_daily_balance_target");
      default:
        return $_("admin_direct_mm_daily_volume_target");
    }
  }

  function getTargetValue(campaign: AdminCampaign): string {
    const details = (campaign.details as Record<string, unknown>) || {};
    const type = String(campaign.type || "");
    if (type === "THRESHOLD") {
      return formatTargetValue(details.minimum_balance_target);
    }
    if (type === "HOLDING") {
      return formatTargetValue(details.daily_balance_target);
    }
    return formatTargetValue(details.daily_volume_target);
  }

  function getTargetToken(campaign: AdminCampaign): string {
    const type = String(campaign.type || "");
    if (type === "THRESHOLD" || type === "HOLDING") {
      return String(campaign.symbol || campaign.name || "");
    }
    return String(campaign.fund_token_symbol || campaign.rewardToken || "");
  }

  function statusColor(s: string): string {
    switch (s.toLowerCase()) {
      case "active":
        return "text-success border-success";
      case "ended":
      case "closed":
        return "text-error border-error";
      default:
        return "text-warning border-warning";
    }
  }
</script>

<div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full gap-4">
  <div class="flex items-start justify-between">
    <div>
      <span class="text-[1.1rem] font-base text-base-content block">
        {joinedCampaigns.length > 0
          ? $_("admin_direct_mm_joined_campaigns")
          : $_("admin_direct_mm_available_campaigns")}
      </span>
      <span class="text-[13px] text-base-content/50 mt-1">
        {joinedCampaigns.length > 0
          ? `${joinedCampaigns.length} ${$_("admin_direct_mm_campaign").toLowerCase()}${joinedCampaigns.length === 1 ? "" : "s"}`
          : $_("admin_direct_mm_campaigns_subtitle")}
      </span>
    </div>
    {#if campaigns.length > 1}
      <button
        class="text-primary font-base text-sm flex items-center gap-1 hover:underline whitespace-nowrap bg-transparent border-none p-0 cursor-pointer"
        on:click={onViewAll}
      >
        {$_("admin_direct_mm_view_all")}
      </button>
    {/if}
  </div>

  {#if joinedCampaigns.length > 0}
    <div class="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
      {#each joinedCampaigns as campaign}
        <div class="bg-base-200/40 rounded-xl p-4 flex items-center justify-between gap-3">
          <div class="flex flex-col">
            <span class="text-sm font-bold text-base-content">
              {String(campaign.symbol || campaign.name || "—")}
            </span>
            <span class="text-xs text-base-content/50">
              {String(campaign.exchange_name || campaign.exchange || "—")}
            </span>
          </div>
          <span class="badge badge-success badge-outline capitalize">
            {$_("admin_direct_mm_joined_campaigns")}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if featuredCampaign}
    {@const rewardPool = formatFundAmount(
      featuredCampaign.fund_amount || featuredCampaign.rewardPool,
      featuredCampaign.fund_token_decimals,
    )}
    {@const rewardToken = String(featuredCampaign.fund_token_symbol || featuredCampaign.rewardToken || "")}
    {@const startDate = formatDate(featuredCampaign.start_date || featuredCampaign.startDate)}
    {@const endDate = formatDate(featuredCampaign.end_date || featuredCampaign.endDate)}
    <div class="bg-base-200/40 rounded-xl p-5 flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <span class="font-bold text-base-content text-[15px]">
            {String(featuredCampaign.symbol || featuredCampaign.name || "—")}
          </span>
          <span class="text-xs text-base-content/50">
            {$_("admin_direct_mm_exchange_label")}: {String(featuredCampaign.exchange_name || featuredCampaign.exchange || "—")}
          </span>
        </div>
        <span class={`text-xs font-bold tracking-wider capitalize border rounded-md px-2 py-0.5 ${statusColor(String(featuredCampaign.status || "active"))}`}>
          {String(featuredCampaign.status || "active")}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-y-4 gap-x-6">
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_reward_pool")}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">{rewardPool}{rewardToken ? ` ${rewardToken}` : ""}</span>
          </div>
        </div>
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{getTargetLabel(featuredCampaign.type)}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">{getTargetValue(featuredCampaign)}{getTargetToken(featuredCampaign) ? ` ${getTargetToken(featuredCampaign)}` : ""}</span>
          </div>
        </div>
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_campaign_type")}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">{String(featuredCampaign.type || featuredCampaign.campaignType || "Market Making")}</span>
          </div>
        </div>
        <div>
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_date_range")}</span>
          <div class="mt-0.5">
            <span class="text-[15px] font-bold text-base-content">
              {#if startDate && endDate}{startDate} - {endDate}{:else}{$_("admin_direct_mm_na")}{/if}
            </span>
          </div>
        </div>
      </div>

      {#if !featuredCampaign.joined}
        <button class="btn btn-primary text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm" on:click={() => onJoin(featuredCampaign)}>
          {$_("admin_direct_mm_join_campaign_title")}
        </button>
      {/if}
    </div>
  {:else}
    <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
      {$_("admin_direct_mm_campaigns_empty")}
    </div>
  {/if}
</div>

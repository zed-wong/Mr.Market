<script lang="ts">
  import { _ } from "svelte-i18n";
  import { formatFundAmount, getBadgeClass, getStateLabel } from "./helpers";
  import type { CampaignJoinRecord } from "$lib/types/hufi/admin-direct-market-making";

  export let campaigns: Array<Record<string, unknown>> = [];
  export let campaignJoins: CampaignJoinRecord[] = [];
  export let onJoin: (campaign: Record<string, unknown>) => void;
  export let onViewAll: () => void = () => {};
  export let onViewCampaigns: () => void = () => {};

  $: campaign = campaigns.length > 0 ? campaigns[0] : null;
  $: campaignDetails = (campaign?.details as Record<string, unknown>) || {};
  $: hasJoins = campaignJoins.length > 0;

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

  function getTargetValue(
    campaign: Record<string, unknown>,
    details: Record<string, unknown>,
  ): string {
    const type = String(campaign.type || "");
    if (type === "THRESHOLD") {
      return formatTargetValue(details.minimum_balance_target);
    }
    if (type === "HOLDING") {
      return formatTargetValue(details.daily_balance_target);
    }
    return formatTargetValue(details.daily_volume_target);
  }

  function getTargetToken(campaign: Record<string, unknown>): string {
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

  function shortenAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
</script>

<div
  class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full"
>
  {#if hasJoins}
    <!-- Joined Campaigns View -->
    <div class="flex items-start justify-between mb-4">
      <div>
        <span class="text-[1.1rem] font-base text-base-content block">
          {$_("admin_direct_mm_joined_campaigns")}
        </span>
        <span class="text-[13px] text-base-content/50 mt-1">
          {campaignJoins.length} {campaignJoins.length === 1 ? $_("admin_direct_mm_campaign").toLowerCase() : $_("admin_direct_mm_campaign").toLowerCase() + "s"}
        </span>
      </div>
      <button
        class="text-primary font-base text-sm flex items-center gap-1 hover:underline whitespace-nowrap bg-transparent border-none p-0 cursor-pointer"
        on:click={onViewCampaigns}
      >
        {$_("admin_direct_mm_view_all")}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2.5"
          stroke="currentColor"
          class="w-3.5 h-3.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
      </button>
    </div>

    <div class="flex flex-col gap-3 mt-2">
      {#each campaignJoins as join}
        <div class="bg-base-200/40 rounded-xl p-4 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div
                class="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold"
              >
                {shortenAddress(join.campaignAddress).charAt(0).toUpperCase()}
              </div>
              <span class="text-sm font-bold text-base-content">
                {shortenAddress(join.campaignAddress)}
              </span>
            </div>
            <span class={getBadgeClass(join.status)}>
              {getStateLabel(join.status)}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-base-content/60">
            <div>
              <span class="text-base-content/40">{$_("admin_direct_mm_evm_address")}:</span>
              <span class="ml-1 font-mono">{shortenAddress(join.evmAddress)}</span>
            </div>
            <div>
              <span class="text-base-content/40">API Key:</span>
              <span class="ml-1 font-mono">{shortenAddress(join.apiKeyId)}</span>
            </div>
            {#if join.orderId}
              <div>
                <span class="text-base-content/40">Order:</span>
                <span class="ml-1 font-mono">{shortenAddress(join.orderId)}</span>
              </div>
            {/if}
            <div>
              <span class="text-base-content/40">{$_("admin_direct_mm_created_time")}:</span>
              <span class="ml-1">{formatDate(join.createdAt)}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Available Campaigns View (original) -->
    <div class="flex items-start justify-between mb-4">
      <div>
        <span class="text-[1.1rem] font-base text-base-content block">
          {$_("admin_direct_mm_available_campaigns")}
        </span>
        <span class="text-[13px] text-base-content/50 mt-1">
          {$_("admin_direct_mm_campaigns_subtitle")}
        </span>
      </div>
      {#if campaigns.length > 1}
        <button
          class="text-primary font-base text-sm flex items-center gap-1 hover:underline whitespace-nowrap bg-transparent border-none p-0 cursor-pointer"
          on:click={onViewAll}
        >
          {$_("admin_direct_mm_view_all")}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2.5"
            stroke="currentColor"
            class="w-3.5 h-3.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>
      {/if}
    </div>

    {#if campaign}
      {@const name = String(campaign.symbol || campaign.name || "—")}
      {@const status = String(campaign.status || "active")}
      {@const exchange = String(
        campaign.exchange_name || campaign.exchange || "—",
      )}
      {@const rewardPool = formatFundAmount(
        campaign.fund_amount || campaign.rewardPool,
        campaign.fund_token_decimals,
      )}
      {@const rewardToken = String(
        campaign.fund_token_symbol || campaign.rewardToken || "",
      )}
      {@const campaignType = String(
        campaign.type || campaign.campaignType || "Market Making",
      )}
      {@const startDate = formatDate(campaign.start_date || campaign.startDate)}
      {@const endDate = formatDate(campaign.end_date || campaign.endDate)}
      {@const targetLabel = getTargetLabel(campaign.type)}
      {@const targetValue = getTargetValue(campaign, campaignDetails)}
      {@const targetToken = getTargetToken(campaign)}

      <div class="bg-base-200/40 rounded-xl p-5 flex flex-col gap-4 mt-2">
        <!-- Header: pair name + status -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex items-center -space-x-2">
              <div
                class="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold ring-2 ring-base-100"
              >
                {name.split(/[/ -]/)[0]?.charAt(0) || "?"}
              </div>
              <div
                class="w-9 h-9 rounded-full bg-info flex items-center justify-center text-white text-xs font-bold ring-2 ring-base-100"
              >
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
          <span
            class="text-xs font-bold tracking-wider capitalize border rounded-md px-2 py-0.5 {statusColor(
              status,
            )}"
          >
            {status}
          </span>
        </div>

        <!-- Info grid -->
        <div class="grid grid-cols-2 gap-y-4 gap-x-6">
          <div>
            <span
              class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
              >{$_("admin_direct_mm_reward_pool")}</span
            >
            <div class="mt-0.5">
              <span class="text-[15px] font-bold text-base-content"
                >{rewardPool}{rewardToken ? ` ${rewardToken}` : ""}</span
              >
            </div>
          </div>
          <div>
            <span
              class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
              >{targetLabel}</span
            >
            <div class="mt-0.5">
              <span class="text-[15px] font-bold text-base-content"
                >{targetValue}{targetToken ? ` ${targetToken}` : ""}</span
              >
            </div>
          </div>
          <div>
            <span
              class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
              >{$_("admin_direct_mm_campaign_type")}</span
            >
            <div class="mt-0.5">
              <span class="text-[15px] font-bold text-base-content"
                >{campaignType}</span
              >
            </div>
          </div>
          <div>
            <span
              class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize"
              >{$_("admin_direct_mm_date_range")}</span
            >
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
      <div
        class="flex items-center justify-center h-full text-base-content/40 text-sm"
      >
        {$_("admin_direct_mm_campaigns_empty")}
      </div>
    {/if}
  {/if}
</div>

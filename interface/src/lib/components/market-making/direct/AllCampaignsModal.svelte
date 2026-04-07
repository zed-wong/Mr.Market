<script lang="ts">
  import { _ } from "svelte-i18n";
  import { formatFundAmount, formatCampaignType } from "./helpers";
  import type { AdminCampaign } from "$lib/types/hufi/admin-direct-market-making";

  export let show = false;
  export let campaigns: AdminCampaign[] = [];
  export let onJoin: (campaign: AdminCampaign) => void;
  export let onClose: () => void;

  let searchQuery = "";
  let filterExchange = "";
  let filterPair = "";
  let filterType = "";

  $: exchanges = [
    ...new Set(
      campaigns.map((c) => String(c.exchange_name || c.exchange || "")),
    ),
  ].filter(Boolean);
  $: pairsOptions = [
    ...new Set(campaigns.map((c) => String(c.symbol || c.name || ""))),
  ].filter(Boolean);
  $: types = [...new Set(campaigns.map((c) => String(c.type || "")))].filter(
    Boolean,
  );
  $: filtered = campaigns
    .filter((c) => {
      const name = String(c.symbol || c.name || "").toLowerCase();
      const exchange = String(c.exchange_name || c.exchange || "");
      const type = String(c.type || "");
      const pair = String(c.symbol || c.name || "");

      if (searchQuery && !name.includes(searchQuery.toLowerCase()))
        return false;
      if (filterExchange && exchange !== filterExchange) return false;
      if (filterPair && pair !== filterPair) return false;
      if (filterType && type !== filterType) return false;
      return true;
    })
    .sort((a, b) => Number(!!a.joined) - Number(!!b.joined));

  function getDetail(campaign: AdminCampaign, key: string): unknown {
    const details = campaign.details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
      return (details as Record<string, unknown>)[key];
    }
    return undefined;
  }

  function formatDate(d: unknown): string {
    if (!d) return "";
    const date = new Date(String(d));
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    const type = String(campaign.type || "");
    if (type === "THRESHOLD") {
      return formatTargetValue(getDetail(campaign, "minimum_balance_target"));
    }
    if (type === "HOLDING") {
      return formatTargetValue(getDetail(campaign, "daily_balance_target"));
    }
    return formatTargetValue(getDetail(campaign, "daily_volume_target"));
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
        return "text-success border-success bg-success/10";
      case "ended":
      case "closed":
        return "text-error border-error bg-error/10";
      default:
        return "text-warning border-warning bg-warning/10";
    }
  }

  function resetFilters() {
    searchQuery = "";
    filterExchange = "";
    filterPair = "";
    filterType = "";
  }
</script>

<svelte:window on:keydown={(e) => show && e.key === 'Escape' && onClose()} />

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-[620px] shadow-2xl border border-base-200/50 max-h-[90vh] flex flex-col"
    >
      <div class="p-6 pb-0">
        <div class="flex items-start justify-between mb-1">
          <div>
            <span class="text-xl font-bold text-base-content block"
              >{$_("admin_direct_mm_available_campaigns")}</span
            >
            <span class="text-sm text-base-content/50"
              >{$_("admin_direct_mm_all_campaigns_subtitle")}</span
            >
          </div>
          <button
            class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
            on:click={() => {
              resetFilters();
              onClose();
            }}
          >
            x
          </button>
        </div>
        <div class="relative mt-4">
          <input
            class="input input-bordered w-full h-10 min-h-[40px] pl-4 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary"
            placeholder={$_("admin_direct_mm_search_campaign")}
            bind:value={searchQuery}
          />
        </div>
        <div class="flex gap-3 mt-3 pb-4">
          <select
            class="select select-bordered select-sm flex-1 bg-base-100 text-base-content text-sm capitalize"
            bind:value={filterExchange}
          >
            <option value="">{$_("admin_direct_mm_all_exchanges")}</option>
            {#each exchanges as ex}<option class="capitalize" value={ex}
                >{ex}</option
              >{/each}
          </select>
          <select
            class="select select-bordered select-sm flex-1 bg-base-100 text-base-content text-sm"
            bind:value={filterPair}
          >
            <option value="">{$_("admin_direct_mm_all_pairs")}</option>
            {#each pairsOptions as p}<option value={p}>{p}</option>{/each}
          </select>
          <select
            class="select select-bordered select-sm flex-1 bg-base-100 text-base-content text-sm"
            bind:value={filterType}
          >
            <option value="">{$_("admin_direct_mm_all_types")}</option>
            {#each types as t}<option value={t}>{t}</option>{/each}
          </select>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-6 pb-6 min-h-[240px]">
        {#if filtered.length === 0}
          <div
            class="flex items-center justify-center min-h-[240px] text-base-content/40 text-sm"
          >
            {$_("admin_direct_mm_campaigns_empty")}
          </div>
        {/if}

        <div class="flex flex-col gap-5">
          {#each filtered as campaign}
            {@const rewardPool = formatFundAmount(
              campaign.fund_amount || campaign.rewardPool,
              campaign.fund_token_decimals,
            )}
            {@const rewardToken = String(
              campaign.fund_token_symbol || campaign.rewardToken || "",
            )}
            <div class="flex flex-col gap-3 rounded-2xl bg-base-200 p-6">
              <div class="flex items-start justify-between">
                <div>
                  <span class="font-bold text-base-content text-[15px] block"
                    >{String(campaign.symbol || campaign.name || "—")}</span
                  >
                  <span class="text-xs text-base-content/50"
                    >{String(
                      campaign.exchange_name || campaign.exchange || "—",
                    )}</span
                  >
                </div>
                <span
                  class={`text-[10px] font-bold tracking-wider capitalize rounded-md px-2 py-0.5 ${statusColor(String(campaign.status || "active"))}`}
                >
                  {String(campaign.status || "active")}
                </span>
              </div>
              <div class="grid grid-cols-2 border border-base-300 rounded-xl">
                <div class="p-3 border-r border-b border-base-300">
                  <span
                    class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize"
                    >{$_("admin_direct_mm_reward_pool")}</span
                  >
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content"
                      >{rewardPool}{rewardToken ? ` ${rewardToken}` : ""}</span
                    >
                  </div>
                </div>
                <div class="p-3 border-b border-base-300">
                  <span
                    class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize"
                    >{$_("admin_direct_mm_campaign_type")}</span
                  >
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content capitalize"
                      >{formatCampaignType(
                        campaign.type ||
                          campaign.campaignType
                      )}</span
                    >
                  </div>
                </div>
                <div class="p-3 border-r border-base-300">
                  <span
                    class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize"
                    >{getTargetLabel(campaign.type)}</span
                  >
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content"
                      >{getTargetValue(campaign)}{getTargetToken(campaign)
                        ? ` ${getTargetToken(campaign)}`
                        : ""}</span
                    >
                  </div>
                </div>
                <div class="p-3">
                  <span
                    class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize"
                    >{$_("admin_direct_mm_duration")}</span
                  >
                  <div class="mt-0.5">
                    <span class="text-sm font-bold text-base-content"
                      >{formatDate(campaign.start_date || campaign.startDate)} -
                      {formatDate(campaign.end_date || campaign.endDate)}</span
                    >
                  </div>
                </div>
              </div>
              {#if campaign.joined}
                <span class="btn btn-disabled w-full rounded-lg shadow-sm"
                  >{$_("admin_direct_mm_joined")}</span
                >
              {:else}
                <button
                  class="btn btn-primary text-white text-sm font-semibold rounded-lg w-full shadow-sm"
                  on:click={() => onJoin(campaign)}
                  >{$_("admin_direct_mm_join_campaign_title")}</button
                >
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

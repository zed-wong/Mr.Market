<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";

  export let show = false;
  export let isJoiningCampaign = false;
  export let apiKeys: AdminSingleKey[] = [];
  export let campaign: Record<string, unknown> = {};

  export let joinCampaignApiKeyId = "";
  export let joinCampaignEvmAddress = "";

  export let onConfirm: () => void;
  export let onCancel: () => void;

  $: campaignName = String(campaign.symbol || campaign.name || $_("admin_direct_mm_title"));
  $: status = String(campaign.status || "active");
  $: exchange = String(campaign.exchange_name || campaign.exchange || $_("admin_direct_mm_na"));
  $: rewardPool = String(campaign.fund_amount || campaign.rewardPool || $_("admin_direct_mm_na"));
  $: rewardToken = String(campaign.fund_token_symbol || campaign.rewardToken || "");
  $: dailyVolTarget = String(campaign.daily_vol_target || (campaign.details as Record<string, unknown>)?.daily_vol_target || campaign.dailyVolTarget || $_("admin_direct_mm_na"));
  $: dailyVolToken = String(campaign.daily_vol_token || (campaign.details as Record<string, unknown>)?.daily_vol_token || campaign.dailyVolToken || "");
  $: oracleFees = String(campaign.oracleFees || $_("admin_direct_mm_na"));
  $: oracleFeesToken = String(campaign.oracleFeesToken || "");
  $: oracleFeesPercent = String(campaign.oracleFeesPercent || "");
  $: startDate = campaign.start_date ? String(campaign.start_date) : (campaign.startDate ? String(campaign.startDate) : "");
  $: endDate = campaign.end_date ? String(campaign.end_date) : (campaign.endDate ? String(campaign.endDate) : "");
  $: dateRange = startDate && endDate ? `(${startDate} - ${endDate})` : "";

  function statusColor(s: string): string {
    switch (s.toLowerCase()) {
      case "active": return "text-success";
      case "ended":
      case "closed": return "text-error";
      default: return "text-warning";
    }
  }
</script>

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div class="modal-box bg-base-100 p-8 rounded-2xl max-w-[520px] shadow-2xl border border-base-200/50">
      <!-- Header -->
      <div class="flex items-start justify-between mb-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-base-content/70">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
          </div>
          <div>
            <span class="text-lg font-bold text-base-content">{campaignName}</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="w-2 h-2 rounded-full {status.toLowerCase() === 'active' ? 'bg-success' : 'bg-warning'}"></span>
              <span class="text-xs font-semibold tracking-wider capitalize {statusColor(status)}">{status}</span>
            </div>
          </div>
        </div>
        <button
          class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
          on:click={onCancel}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Description -->
      <span class="text-sm text-base-content/70 leading-relaxed">
        {$_("admin_direct_mm_join_campaign_description", {
          values: {
            campaignName,
            exchange: exchange !== $_("admin_direct_mm_na") ? exchange : "",
            dateRange,
          },
        })}
      </span>

      <!-- Info Grid -->
      <div class="grid grid-cols-2 border border-base-300 rounded-xl mt-5">
        <div class="p-4 border-r border-b border-base-300">
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_reward_pool")}</span>
          <div class="mt-1">
            <span class="text-base font-bold text-primary">{rewardPool}</span>
            {#if rewardToken}
              <span class="text-base font-bold text-primary ml-1">{rewardToken}</span>
            {/if}
          </div>
        </div>
        <div class="p-4 border-b border-base-300">
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_daily_vol_target")}</span>
          <div class="mt-1">
            <span class="text-base font-bold text-base-content">{dailyVolTarget}</span>
            {#if dailyVolToken}
              <span class="text-base font-bold text-base-content ml-1">{dailyVolToken}</span>
            {/if}
          </div>
        </div>
        <div class="p-4 border-r border-base-300">
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_oracle_fees")}</span>
          <div class="mt-1">
            <span class="text-base font-bold text-base-content">{oracleFees}</span>
            {#if oracleFeesToken}
              <span class="text-base font-bold text-base-content ml-1">{oracleFeesToken}</span>
            {/if}
            {#if oracleFeesPercent}
              <span class="text-sm text-base-content/40 ml-1">({oracleFeesPercent})</span>
            {/if}
          </div>
        </div>
        <div class="p-4">
          <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_direct_mm_exchange")}</span>
          <div class="mt-1">
            <span class="text-base font-bold text-base-content">{exchange}</span>
          </div>
        </div>
      </div>

      <!-- Form Fields -->
      <div class="flex flex-col gap-4 mt-5">
        <label class="form-control w-full">
          <span class="label-text text-base-content text-sm font-semibold mb-1.5">
            {$_("admin_direct_mm_evm_address")}
          </span>
          <input
            class="input input-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            bind:value={joinCampaignEvmAddress}
            placeholder={$_("admin_direct_mm_evm_address_placeholder")}
          />
        </label>
        <label class="form-control w-full">
          <span class="label-text text-base-content text-sm font-semibold mb-1.5">
            {$_("admin_direct_mm_api_key")}
          </span>
          <select
            class="select select-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            bind:value={joinCampaignApiKeyId}
          >
            <option value="">{$_("admin_direct_mm_select_api_key")}</option>
            {#each apiKeys as apiKey}
              <option value={apiKey.key_id}>
                {apiKey.name} · {apiKey.exchange} · {apiKey.exchange_index}
              </option>
            {/each}
          </select>
        </label>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 justify-end mt-6">
        <button
          class="btn btn-ghost text-primary font-semibold px-6"
          on:click={onCancel}
        >
          <span>{$_("admin_direct_mm_cancel")}</span>
        </button>
        <button
          class="btn btn-primary text-white font-semibold px-6 gap-2"
          disabled={isJoiningCampaign}
          on:click={onConfirm}
        >
          <span>
            {isJoiningCampaign
              ? $_("admin_direct_mm_joining")
              : $_("admin_direct_mm_join")}
          </span>
          {#if !isJoiningCampaign}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

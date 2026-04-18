<script lang="ts">
  import CampaignSmallCard from "$lib/components/grow/marketMaking/hufi/CampaignSmallCard.svelte";
  import IntroCard from "$lib/components/grow/marketMaking/hufi/IntroCard.svelte";
  import CampaignFilterDialog from "./components/CampaignFilterDialog.svelte";
  import { formatCampaigns } from "$lib/helpers/mrm/campaignFormatter.js";
  import type { ApiCampaign } from "$lib/helpers/mrm/campaignFormatter.js";
  import { _ } from "svelte-i18n";

  export let data;

  let showFilter = false;
  let filterType = "";
  let sortField: "date" | "reward" = "date";
  let sortOrder: "desc" | "asc" = "desc";

  $: rawCampaigns = (data.active_campaigns?.results ?? []) as ApiCampaign[];
  $: types = [...new Set(rawCampaigns.map((c) => c.type))].filter(Boolean);

  $: filtered = rawCampaigns
    .filter((c) => (!filterType || c.type === filterType))
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      } else {
        cmp = Number(a.fund_amount) - Number(b.fund_amount);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

  $: campaigns = formatCampaigns(filtered);
  $: hasActiveFilter = filterType !== "" || sortField !== "date" || sortOrder !== "desc";

  function handleApply(e: CustomEvent) {
    filterType = e.detail.filterType;
    sortField = e.detail.sortField;
    sortOrder = e.detail.sortOrder;
  }
</script>

<IntroCard />

<div
  class="campaigns-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 md:p-8 bg-base-100 mt-4 mb-36 content-start"
>
  <div class="col-span-full flex items-center justify-between">
    <span class="font-semibold text-base text-base-content">
      {$_("hufi_campaigns_heading")}
      {#if campaigns.length > 0}
        <span class="text-base-content/50 text-sm font-normal ml-1">({campaigns.length})</span>
      {/if}
    </span>
    <button
      class="btn btn-sm btn-ghost gap-1 text-base-content/60"
      class:text-primary={hasActiveFilter}
      on:click={() => (showFilter = true)}
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
      </svg>
      {$_("hufi_filter_button")}
    </button>
  </div>
  {#if campaigns.length > 0}
    {#each campaigns as campaign}
      <CampaignSmallCard {campaign} />
    {/each}
  {:else}
    <div
      class="col-span-full flex flex-col items-center justify-center py-20 text-base-content/60"
    >
      <span class="text-xl font-semibold mb-2">{$_("hufi_no_active_campaigns_title")}</span>
      <span class="text-sm">{$_("hufi_no_active_campaigns_desc")}</span>
    </div>
  {/if}
</div>

<CampaignFilterDialog
  bind:show={showFilter}
  {types}
  bind:filterType
  bind:sortField
  bind:sortOrder
  on:apply={handleApply}
/>

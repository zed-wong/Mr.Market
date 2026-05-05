<script lang="ts">
  import clsx from "clsx";
  import { _ } from "svelte-i18n";
  import { goto } from "$app/navigation";
  import { findCoinIconBySymbol } from "$lib/helpers/helpers";
  import emptyToken from "$lib/images/empty-token.svg";

  export let campaign: any; // We'll type this properly if we knew the exact shape, using any for flexibility now

  // Helper to get icon if not present in campaign object directly
  $: symbolIcon =
    campaign.symbolIcon ||
    findCoinIconBySymbol(campaign.symbol?.split("/")[0]) ||
    emptyToken;

  const handleClick = () => {
    const id = campaign.id || campaign.address;
    goto(`/market-making/hufi/campaign/${id}`);
  };
</script>

<button
  class="bg-slate-50 rounded-xl p-4 text-base-content border border-slate-100 hover:border-primary transition-colors cursor-pointer flex flex-col gap-4 text-left"
  on:click={handleClick}
>
  <div class="flex justify-between items-center">
    <div class="flex items-center gap-3">
      <img
        src={symbolIcon}
        alt={campaign.symbol}
        class="w-10 h-10 rounded-full bg-base-300"
      />
      <div class="flex flex-col">
        <span class="font-semibold text-base">{campaign.symbol}</span>
        <span class="text-sm text-base-content/60">{campaign.exchange}</span>
      </div>
    </div>
    <span
      class={clsx(
        "badge text-xs text-base-content font-medium",
        "badge-outline badge-neutral",
      )}>{campaign.type}</span
    >
  </div>

  <div class="grid grid-cols-2 gap-2 mt-2">
    <div class="bg-base-100 p-4 py-3 rounded-xl">
      <span class="block text-[10px] text-base-content/60 capitalize">
        {$_("total_funded")}
      </span>
      <span class="block text-base font-semibold text-primary/80">
        {campaign.totalFundedAmount || "0"}
      </span>
    </div>
    <div class="bg-base-100 p-4 py-3 rounded-xl">
      <span class="block text-[10px] text-base-content/60 capitalize">
        {$_("target")}
      </span>
      <span class="block text-base font-semibold text-primary/80">
        {campaign.targetValue || "0"}
      </span>
    </div>
    <div class="bg-base-100 p-4 py-3 rounded-xl col-span-2">
      <span class="block text-[10px] text-base-content/60 capitalize">
        {$_("campaign_period")}
      </span>
      <span
        class="flex items-center gap-2 text-base font-semibold text-primary/80"
      >
        <span>{campaign.startDate || "-"}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="w-4 h-4 opacity-60"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
          />
        </svg>
        <span>{campaign.endDate || "-"}</span>
      </span>
    </div>
  </div>
</button>

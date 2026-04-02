<script lang="ts">
  export let campaigns: Array<Record<string, unknown>> = [];
  export let onJoin: (campaign: Record<string, unknown>) => void;
</script>

<div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full">
  <div class="mb-4">
    <h2 class="text-[1.1rem] font-bold text-base-content">
      Available Campaigns
    </h2>
    <span class="text-[13px] text-base-content/50 mt-1">
      Boost liquidity and earn additional rewards.
    </span>
  </div>

  <div class="flex flex-col gap-4 mt-2 h-full">
    {#each campaigns.slice(0, 2) as campaign, i}
      <div class="bg-indigo-50 rounded-xl p-5 flex flex-col justify-between">
        <div class="flex justify-between items-start w-full">
          <div class="flex flex-col gap-1 w-full">
            <span class="text-blue-600 font-bold text-[15px]"
              >{String(
                campaign.symbol ||
                  campaign.name ||
                  (i === 0
                    ? "SOL-USDT Volatility Shield"
                    : "ETH-BTC Arbitrage Engine"),
              )}</span
            >
            <span class="text-xs text-base-content/50"
              >Reward Pool: {String(
                campaign.rewardPool ||
                  (i === 0 ? "50,000 USDT" : "12.5 BTC"),
              )}</span
            >
          </div>
          <div class="flex flex-col items-end whitespace-nowrap">
            <span class="font-bold text-[15px] text-base-content"
              >{String(
                campaign.apr || (i === 0 ? "18.5% APR" : "12.2% APR"),
              )}</span
            >
            <span
              class="text-[10px] font-bold text-base-content/40 tracking-wider"
              >EST. YIELD</span
            >
          </div>
        </div>

        <div class="flex items-center justify-between gap-4 w-full mt-5">
          <button
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg flex-grow transition-colors shadow-sm"
            on:click={() => onJoin(campaign)}
          >
            Join Campaign
          </button>
          <div class="w-[80px] flex justify-center">
            <button
              class="text-blue-600 text-sm font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
              >Details</button
            >
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

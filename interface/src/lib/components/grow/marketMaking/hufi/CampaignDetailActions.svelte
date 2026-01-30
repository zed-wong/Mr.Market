<script lang="ts">
  import { goto } from "$app/navigation";
  import { createEventDispatcher } from "svelte";
  import type { ApiCampaign } from "$lib/helpers/mrm/campaignFormatter";

  export let campaign: ApiCampaign;

  const dispatch = createEventDispatcher();

  let showDialog = $state(false);
</script>

<div
  class="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-gray-100 flex gap-4 pb-8 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
>
  <button
    class="flex-1 btn bg-white hover:bg-gray-50 text-base-content border border-gray-200 rounded-full h-12 min-h-12 text-sm font-bold normal-case shadow-sm"
    onclick={() => goto("/market-making/hufi/join")}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
      class="w-4 h-4"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
      />
    </svg>
    Join Directly
  </button>
  <button
    class="flex-[1.5] btn bg-black hover:bg-gray-900 text-white border-none rounded-full h-12 min-h-12 text-sm font-bold normal-case shadow-lg"
    onclick={() => (showDialog = true)}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
      class="w-4 h-4"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
    Create M-Making
  </button>
</div>

<!-- Create Market-Making Dialog -->
{#if showDialog}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold">Create M-Making</h2>
        <button
          class="btn btn-sm btn-circle btn-ghost"
          onclick={() => (showDialog = false)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <!-- Campaign Info -->
        <div class="bg-gray-50 rounded-lg p-4 space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600">Exchange</span>
            <span class="text-sm font-semibold capitalize">{campaign.exchange_name}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600">Trading Pair</span>
            <span class="text-sm font-semibold">{campaign.symbol}</span>
          </div>
          {#if campaign.details?.daily_volume_target}
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600">Daily Target</span>
              <span class="text-sm font-semibold text-primary"
                >{campaign.details.daily_volume_target.toLocaleString()} {campaign.fund_token_symbol}</span
              >
            </div>
          {/if}
        </div>

        <!-- Amount Input -->
        <div class="form-control w-full">
          <label class="label" for="fund-amount">
            <span class="label-text font-medium">Fund Amount</span>
            <span class="label-text-alt text-gray-500">{campaign.fund_token_symbol}</span>
          </label>
          <input
            id="fund-amount"
            type="number"
            class="input input-bordered w-full focus:input-primary"
            placeholder="Enter amount"
          />
          <label class="label">
            <span class="label-text-alt text-gray-500"
              >Available: {Number(campaign.fund_amount) / Math.pow(10, campaign.fund_token_decimals)} {campaign.fund_token_symbol}</span
            >
          </label>
        </div>

        <!-- Warning -->
        <div class="alert alert-warning text-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span
            >You'll need to configure your exchange API keys to complete the setup.</span
          >
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3 pt-2">
          <button
            class="btn btn-ghost flex-1"
            onclick={() => (showDialog = false)}
          >
            Cancel
          </button>
          <button
            class="btn btn-primary flex-1"
            onclick={() => {
              showDialog = false;
              goto("/market-making/create");
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

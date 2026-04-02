<script lang="ts">
  import type { AdminSingleKey } from "$lib/types/hufi/admin";
  import type { MarketMakingStrategy } from "$lib/helpers/mrm/grow";

  export let show = false;
  export let isStarting = false;
  export let exchangeOptions: string[] = [];
  export let filteredPairs: { symbol: string }[] = [];
  export let filteredApiKeys: AdminSingleKey[] = [];
  export let strategies: MarketMakingStrategy[] = [];

  export let startExchangeName = "";
  export let startPair = "";
  export let startStrategyDefinitionId = "";
  export let startApiKeyId = "";
  export let orderAmount = "";
  export let orderSpread = "";

  export let onSubmit: () => void;
  export let onClose: () => void;
</script>

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-white p-0 rounded-[20px] max-w-[480px] overflow-hidden shadow-[0_24px_80px_-20px_rgba(15,23,42,0.25)] border border-white/70"
    >
      <div class="px-6 pt-6 pb-5 bg-violet-50/60 flex justify-between items-center">
        <h3 class="font-bold text-[22px] text-base-content tracking-tight">
          Create New Order
        </h3>
        <button
          class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
          on:click={onClose}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="w-5 h-5"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            /></svg
          >
        </button>
      </div>

      <div class="px-6 py-6 flex flex-col gap-5 bg-white border-t border-slate-100">
        <!-- Exchange -->
        <div class="form-control w-full">
          <label for="direct-order-exchange" class="label pb-2 pt-0"
            ><span class="label-text font-semibold text-base-content"
              >Exchange</span
            ></label
          >
          <select
            id="direct-order-exchange"
            class="select select-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
            bind:value={startExchangeName}
          >
            <option value="" disabled selected>Select Exchange</option>
            {#each exchangeOptions as exchangeName}
              <option value={exchangeName}>{exchangeName}</option>
            {/each}
          </select>
        </div>

        <!-- Trading Pair -->
        <div class="form-control w-full">
          <label for="direct-order-pair" class="label pb-2 pt-0"
            ><span class="label-text font-semibold text-base-content"
              >Trading Pair</span
            ></label
          >
          <div class="relative">
            <div
              class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-base-content/50"
                ><circle cx="11" cy="11" r="8" /><path
                  d="m21 21-4.3-4.3"
                /></svg
              >
            </div>
            <select
              id="direct-order-pair"
              class="select select-bordered w-full pl-10 h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
              bind:value={startPair}
            >
              <option value="" disabled selected>Select Trading Pair</option>
              {#each filteredPairs as pair}
                <option value={pair.symbol}>{pair.symbol}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Strategy -->
        <div class="form-control w-full">
          <label for="direct-order-strategy" class="label pb-2 pt-0"
            ><span class="label-text font-semibold text-base-content"
              >Strategy</span
            ></label
          >
          <select
            id="direct-order-strategy"
            class="select select-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
            bind:value={startStrategyDefinitionId}
          >
            <option value="" disabled selected>Select Strategy</option>
            {#each strategies as strategy}
              <option value={strategy.id}>{strategy.name}</option>
            {/each}
          </select>
        </div>

        <!-- API Key -->
        <div class="form-control w-full">
          <label for="direct-order-api-key" class="label pb-2 pt-0"
            ><span class="label-text font-semibold text-base-content"
              >API Key</span
            ></label
          >
          <select
            id="direct-order-api-key"
            class="select select-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
            bind:value={startApiKeyId}
          >
            <option value="" disabled selected>Select API Key</option>
            {#each filteredApiKeys as apiKey}
              <option value={apiKey.key_id}>{apiKey.name}</option>
            {/each}
          </select>
        </div>

        <!-- Order Parameters (Amount & Spread %) -->
        <div class="form-control w-full mt-1">
          <label for="direct-order-amount" class="label pb-3 pt-0"
            ><span class="label-text font-semibold text-base-content"
              >Order Parameters</span
            ></label
          >
          <div class="flex gap-4">
            <div class="flex-1">
              <span class="text-sm text-base-content/80 mb-2 block font-medium"
                >Amount</span
              >
              <input
                id="direct-order-amount"
                type="text"
                placeholder="Amount"
                class="input input-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                bind:value={orderAmount}
              />
            </div>
            <div class="flex-1">
              <span class="text-sm text-base-content/80 mb-2 block font-medium"
                >Spread %</span
              >
              <input
                id="direct-order-spread"
                type="text"
                placeholder="Spread %"
                class="input input-bordered w-full h-11 min-h-[44px] bg-base-100 text-base-content focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                bind:value={orderSpread}
              />
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 justify-end mt-4">
          <button
            class="btn bg-violet-50 hover:bg-violet-100 border-none text-slate-700 px-6 h-[44px] min-h-[44px] rounded-lg font-semibold shadow-none"
            on:click={onClose}>Cancel</button
          >
          <button
            class="btn bg-indigo-600 hover:bg-indigo-700 border-none text-white px-6 h-[44px] min-h-[44px] rounded-lg font-semibold shadow-[0_10px_24px_-12px_rgba(79,70,229,0.9)]"
            on:click={onSubmit}
            disabled={isStarting}
          >
            {isStarting ? "Launching..." : "Launch Order"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

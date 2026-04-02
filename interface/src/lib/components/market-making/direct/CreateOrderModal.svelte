<script lang="ts">
  import { _ } from "svelte-i18n";
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
  export let orderQuoteAmount = "";
  export let orderSpread = "";

  export let onSubmit: () => void;
  export let onClose: () => void;

  let pairSearch = "";

  $: searchedPairs = pairSearch
    ? filteredPairs.filter((p) =>
        p.symbol.toLowerCase().includes(pairSearch.toLowerCase()),
      )
    : filteredPairs;

  $: if (filteredApiKeys.length > 0 && !filteredApiKeys.find(k => k.key_id === startApiKeyId)) {
    startApiKeyId = filteredApiKeys[0].key_id;
  }
</script>

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div class="modal-box bg-base-100 p-0 rounded-2xl max-w-[480px] shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="px-7 pt-6 pb-4">
        <div class="flex items-start justify-between">
          <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-primary">
              <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clip-rule="evenodd" />
            </svg>
          </div>
          <button
            class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
            on:click={onClose}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <span class="text-xl font-bold text-base-content block mt-3">{$_("admin_direct_mm_create_new_order")}</span>
        <span class="text-sm text-base-content/50 block mt-1">{$_("admin_direct_mm_configure_deploy")}</span>
      </div>

      <!-- Form -->
      <div class="px-7 pb-7 flex flex-col gap-5">
        <!-- Exchange -->
        <div class="bg-base-200/40 rounded-xl p-4">
          <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2">{$_("admin_direct_mm_exchange")}</span>
          <select
            class="select select-bordered w-full h-10 min-h-[40px] bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
            bind:value={startExchangeName}
          >
            <option value="" disabled selected>{$_("admin_direct_mm_select_exchange")}</option>
            {#each exchangeOptions as exchangeName}
              <option value={exchangeName}>{exchangeName}</option>
            {/each}
          </select>
        </div>

        <!-- Trading Pair -->
        <div class="bg-base-200/40 rounded-xl p-4">
          <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2">{$_("admin_direct_mm_trading_pair")}</span>
          <div class="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              class="input input-bordered w-full h-10 min-h-[40px] pl-9 bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
              placeholder={$_("admin_direct_mm_search_pairs")}
              bind:value={pairSearch}
            />
          </div>
          {#if pairSearch && searchedPairs.length > 0}
            <div class="mt-2 max-h-32 overflow-y-auto border border-base-300 rounded-lg bg-base-100 shadow-sm">
              {#each searchedPairs as pair}
                <button
                  class="w-full text-left px-3 py-2 text-sm hover:bg-base-200 transition-colors
                    {startPair === pair.symbol ? 'bg-primary/10 text-primary font-semibold' : 'text-base-content'}"
                  on:click={() => { startPair = pair.symbol; pairSearch = ''; }}
                >
                  {pair.symbol}
                </button>
              {/each}
            </div>
          {/if}
          {#if startPair && !pairSearch}
            <span class="text-sm text-base-content mt-2 block font-medium">{startPair}</span>
          {/if}
        </div>

        <!-- Strategy -->
        <div class="bg-base-200/40 rounded-xl p-4">
          <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2">{$_("admin_direct_mm_strategy")}</span>
          {#if strategies.length <= 3}
            <div class="flex flex-col gap-1.5">
              {#each strategies as strategy}
                <button
                  class="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors border
                    {startStrategyDefinitionId === strategy.id
                      ? 'bg-primary/5 text-primary font-semibold border-primary/20'
                      : 'text-base-content hover:bg-base-200 border-transparent'}"
                  on:click={() => (startStrategyDefinitionId = strategy.id)}
                >
                  <span>{strategy.name}</span>
                  {#if startStrategyDefinitionId === strategy.id}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 text-primary">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <select
              class="select select-bordered w-full h-10 min-h-[40px] bg-base-100 text-base-content focus:outline-none focus:border-primary border-base-300"
              bind:value={startStrategyDefinitionId}
            >
              <option value="" disabled selected>{$_("admin_direct_mm_select_strategy")}</option>
              {#each strategies as strategy}
                <option value={strategy.id}>{strategy.name}</option>
              {/each}
            </select>
          {/if}
        </div>

        <!-- Order Parameters -->
        <div>
          <span class="text-xs font-semibold text-base-content/60 tracking-wider block mb-3">{$_("admin_direct_mm_order_parameters")}</span>
          <div class="flex gap-3">
            <div class="flex-1 bg-base-200/40 rounded-xl p-4">
              <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2">{$_("admin_direct_mm_base_amount")}</span>
              <input
                type="text"
                placeholder="0.00"
                class="input input-bordered w-full h-10 min-h-[40px] bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                bind:value={orderAmount}
              />
            </div>
            <div class="flex-1 bg-base-200/40 rounded-xl p-4">
              <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2">{$_("admin_direct_mm_quote_amount")}</span>
              <input
                type="text"
                placeholder="0.00"
                class="input input-bordered w-full h-10 min-h-[40px] bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
                bind:value={orderQuoteAmount}
              />
            </div>
          </div>
        </div>

        <!-- Spread -->
        <div class="bg-base-200/40 rounded-xl p-4">
          <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2">{$_("admin_direct_mm_spread_optional")}</span>
          <input
            type="text"
            placeholder="0.0%"
            class="input input-bordered w-full h-10 min-h-[40px] bg-base-100 text-base-content text-sm focus:outline-none focus:border-primary border-base-300"
            bind:value={orderSpread}
          />
        </div>

        <!-- Actions -->
        <div class="flex gap-3 justify-end mt-2">
          <button
            class="btn btn-ghost text-base-content font-semibold px-6"
            on:click={onClose}
          >
            {$_("admin_direct_mm_cancel")}
          </button>
          <button
            class="btn btn-primary text-primary-content font-semibold px-6 gap-2"
            on:click={onSubmit}
            disabled={isStarting}
          >
            <span>{isStarting ? $_("admin_direct_mm_launching") : $_("admin_direct_mm_launch_order")}</span>
            {#if !isStarting}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

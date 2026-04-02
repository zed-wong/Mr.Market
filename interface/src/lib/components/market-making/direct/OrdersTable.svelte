<script lang="ts">
  import ExchangeIcon from "$lib/components/common/exchangeIcon.svelte";
  import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";

  export let orders: DirectOrderSummary[] = [];
  export let onCreateClick: () => void;
  export let onStartAllClick: () => void;
  export let onStopAllClick: () => void;
  export let onStopOrder: (order: DirectOrderSummary) => void;
  export let onOrderClick: (order: DirectOrderSummary) => void;
</script>

<div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50">
  <div
    class="flex flex-col sm:flex-row justify-between items-start xl:items-center gap-4 mb-6"
  >
    <div>
      <h2 class="text-[1.1rem] font-bold text-base-content">
        Market Making
      </h2>
      <span class="text-[13px] text-base-content/50 mt-1">
        Strategic execution and real-time liquidity management.
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        class="btn bg-blue-600 hover:bg-blue-700 text-white border-none min-h-[42px] h-[42px] px-5 rounded-lg text-sm font-semibold shadow-sm"
        on:click={onCreateClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="mr-1"
          ><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path
            d="M12 8v8"
          /></svg
        >
        Create New Order
      </button>
      <button
        class="btn bg-indigo-50 hover:bg-indigo-100 text-base-content border-none min-h-[42px] h-[42px] px-5 rounded-lg text-sm font-semibold shadow-sm text-opacity-90"
        on:click={onStartAllClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="mr-1"><polygon points="5 3 19 12 5 21 5 3" /></svg
        >
        Start All
      </button>
      <button
        class="btn bg-indigo-50 hover:bg-indigo-100 text-base-content border-none min-h-[42px] h-[42px] px-5 rounded-lg text-sm font-semibold shadow-sm"
        on:click={onStopAllClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="mr-1.5"
          ><rect width="18" height="18" x="3" y="3" rx="2" /></svg
        >
        Stop All
      </button>
    </div>
  </div>

  <div class="overflow-x-auto w-full">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr>
          <th
            class="py-4 px-4 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >Exchange</th
          >
          <th
            class="py-4 px-4 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >Trading Pair</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >Strategy</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >Status</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >Created Time</th
          >
          <th
            class="py-4 px-4 text-xs text-right font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >Actions</th
          >
        </tr>
      </thead>
      <tbody>
        {#if orders.length === 0}
          <tr>
            <td colspan="6" class="text-center py-10 text-base-content/50"
              >No orders active</td
            >
          </tr>
        {/if}
        {#each orders as order, i}
          <tr
            class="hover:bg-base-200/30 transition-colors border-b border-base-300/60 last:border-0 cursor-pointer"
            on:click={() => onOrderClick(order)}
          >
            <td class="py-4 px-4">
              <div class="flex items-center gap-3">
                <div
                  class="bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center border border-slate-100"
                >
                  <ExchangeIcon
                    exchangeName={order.exchangeName}
                    clazz="w-4 h-4"
                  />
                </div>
                <span class="font-bold text-sm text-base-content"
                  >{order.exchangeName}</span
                >
              </div>
            </td>
            <td class="py-4 px-4">
              <span
                class="font-bold text-[14px] text-base-content whitespace-nowrap"
                >{order.pair.replace("-", " / ").replace("_", " / ")}</span
              >
            </td>
            <td class="py-4 px-2">
              <span
                class="inline-flex bg-indigo-50 text-blue-600 px-2.5 py-1 rounded-[6px] text-xs font-semibold whitespace-nowrap"
              >
                {order.strategyName ||
                  (i === 0
                    ? "Cross-Exchange"
                    : i === 1
                      ? "Market Maker"
                      : "Pure MM")}
              </span>
            </td>
            <td class="py-4 px-2 whitespace-nowrap">
              {#if order.runtimeState === "running" || order.runtimeState === "active"}
                <span
                  class="inline-flex items-center gap-1.5 bg-green-50 text-green-600 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide capitalize"
                >
                  <span class="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                  Running
                </span>
              {:else if order.runtimeState === "stopped"}
                <span
                  class="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide capitalize"
                >
                  Paused
                </span>
              {:else}
                <span
                  class="inline-flex items-center gap-1.5 bg-green-50 text-green-600 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide capitalize"
                >
                  <span class="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                  Running
                </span>
              {/if}
            </td>
            <td class="py-4 px-2">
              <span
                class="text-[13px] text-base-content/60 whitespace-nowrap text-opacity-80"
              >
                {order.createdAt
                  ? new Date(order.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) +
                    " • " +
                    new Date(order.createdAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : i === 0
                    ? "Oct 24, 2023 • 14:20"
                    : i === 1
                      ? "Oct 22, 2023 • 09:15"
                      : "Oct 20, 2023 • 18:45"}
              </span>
            </td>
            <td class="py-4 px-4 flex justify-end items-center gap-3">
              {#if order.runtimeState === "running" || order.runtimeState === "active"}
                <button
                  class="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-100 text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Stop"
                  on:click|stopPropagation={() => onStopOrder(order)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><rect
                      width="14"
                      height="14"
                      x="5"
                      y="5"
                      rx="2"
                      fill="currentColor"
                    /></svg
                  >
                </button>
              {:else}
                <button
                  class="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-100 text-blue-600 hover:bg-blue-50 transition-colors"
                  aria-label="Play"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><polygon points="6 3 20 12 6 21 6 3" /></svg
                  >
                </button>
              {/if}
              <button
                class="bg-indigo-50 text-blue-600 px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors whitespace-nowrap"
              >
                Details
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

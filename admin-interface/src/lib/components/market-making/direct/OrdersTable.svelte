<script lang="ts">
  import { _ } from "svelte-i18n";
  import ExchangeIcon from "$lib/components/common/exchangeIcon.svelte";
  import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";
  import {
    getDirectOrderActionAvailability,
    getDirectOrderDisplayState,
    getStateLabel,
  } from "$lib/helpers/market-making/direct/helpers";

  export let orders: DirectOrderSummary[] = [];
  export let onCreateClick: () => void;
  export let onStartAllClick: () => void;
  export let onStopAllClick: () => void;
  export let onStopOrder: (order: DirectOrderSummary) => void;
  export let onResumeOrder: (order: DirectOrderSummary) => void;
  export let onRemoveOrder: (order: DirectOrderSummary) => void;
  export let onOrderClick: (order: DirectOrderSummary) => void;

  $: resumableOrdersCount = orders.filter((order) => canResume(order)).length;
  $: stoppableOrdersCount = orders.filter((order) => canStop(order)).length;

  function formatPair(pair: string): string {
    return pair.replace(/[-_]/g, " / ");
  }

  function formatCreatedAt(createdAt: string): string {
    if (!createdAt) return $_("admin_direct_mm_na");

    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return $_("admin_direct_mm_na");

    return `${date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} • ${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
  }

  function getStrategyLabel(order: DirectOrderSummary): string {
    return order.strategyName || order.strategyDefinitionId || $_("admin_direct_mm_na");
  }

  function isActiveState(state: string): boolean {
    return state === "running";
  }

  function canStop(order: DirectOrderSummary): boolean {
    return getDirectOrderActionAvailability(order).canStop;
  }

  function canResume(order: DirectOrderSummary): boolean {
    return getDirectOrderActionAvailability(order).canResume;
  }

  function canRemove(order: DirectOrderSummary): boolean {
    return getDirectOrderActionAvailability(order).canRemove;
  }

  function getStatusClasses(state: string): string {
    if (isActiveState(state)) {
      return "bg-success/10 text-success";
    }

    if (state === "stopped") {
      return "bg-base-300/50 text-base-content/55";
    }

    if (state === "failed" || state === "deleted" || state === "refunded") {
      return "bg-error/10 text-error";
    }

    if (state === "created" || state === "paused") {
      return "bg-warning/10 text-warning";
    }

    return "bg-base-300/50 text-base-content/55";
  }
</script>

<div class="card-surface p-6">
  <div
    class="flex flex-col sm:flex-row justify-between items-start xl:items-center gap-4 mb-6"
  >
    <div>
      <span class="text-title block text-base-content">
        {$_("admin_direct_mm_title")}
      </span>
      <span class="text-body-muted mt-1 block">
        {$_("admin_direct_mm_orders_subtitle")}
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="btn-pill-primary"
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
        {$_("admin_direct_mm_create_new_order")}
      </button>
      <button
        type="button"
        class="btn-pill-outline"
        on:click={onStartAllClick}
        disabled={resumableOrdersCount === 0}
        title={resumableOrdersCount === 0 ? $_("admin_direct_mm_no_stopped_orders_to_resume") : $_("admin_direct_mm_resume_stopped_orders")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="mr-1"><polygon points="5 3 19 12 5 21 5 3" /></svg
        >
        {$_("admin_direct_mm_start_all")}
      </button>
      <button
        type="button"
        class="btn-pill-outline"
        on:click={onStopAllClick}
        disabled={stoppableOrdersCount === 0}
        title={stoppableOrdersCount === 0 ? $_("admin_direct_mm_no_running_orders_to_stop") : $_("admin_direct_mm_stop_running_orders")}
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
        {$_("admin_direct_mm_stop_all")}
      </button>
    </div>
  </div>

  <div class="overflow-x-auto w-full">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr>
          <th
            class="py-4 px-4 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_direct_mm_exchange")}</th
          >
          <th
            class="py-4 px-4 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_direct_mm_trading_pair")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_direct_mm_strategy")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_direct_mm_status")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_direct_mm_created_time")}</th
          >
          <th
            class="py-4 px-4 text-xs text-right font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_direct_mm_actions")}</th
          >
        </tr>
      </thead>
      <tbody>
        {#if orders.length === 0}
          <tr>
            <td colspan="6" class="text-center py-10 text-base-content/50"
              >{$_("admin_direct_mm_empty_title")}</td
            >
          </tr>
        {/if}
        {#each orders as order}
          <tr
            class="hover:bg-base-200/30 transition-colors border-b border-base-300/60 last:border-0 cursor-pointer"
            on:click={() => onOrderClick(order)}
          >
            <td class="py-4 px-4">
              <div class="flex items-center gap-3">
                <div
                  class="bg-base-100 w-8 h-8 rounded-full flex items-center justify-center border border-base-300"
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
                >{formatPair(order.pair)}</span
              >
            </td>
            <td class="py-4 px-2">
              <span
                class="inline-flex bg-base-100 text-base-content px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border border-base-300"
              >
                {getStrategyLabel(order)}
              </span>
            </td>
            <td class="py-4 px-2 whitespace-nowrap">
              <span
                class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide capitalize ${getStatusClasses(getDirectOrderDisplayState(order))}`}
              >
                {#if isActiveState(getDirectOrderDisplayState(order))}
                  <span class="w-1.5 h-1.5 bg-current rounded-full"></span>
                {/if}
                {getStateLabel(getDirectOrderDisplayState(order))}
              </span>
            </td>
            <td class="py-4 px-2">
              <span
                class="text-[13px] text-base-content/60 whitespace-nowrap text-opacity-80"
              >
                {formatCreatedAt(order.createdAt)}
              </span>
            </td>
            <td class="py-4 px-4 flex justify-end items-center gap-3">
              {#if canStop(order)}
                <button
                  class="w-6 h-6 flex items-center justify-center rounded-full bg-base-100 border border-base-300 text-error hover:bg-error/10 transition-colors"
                  aria-label={$_("admin_direct_mm_stop")}
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
              {/if}
              {#if canResume(order) || canRemove(order)}
                <div class="flex items-center gap-2">
                  {#if canResume(order)}
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded-full bg-base-100 border border-base-300 text-info hover:bg-info/10 transition-colors"
                      aria-label={$_("admin_direct_mm_play")}
                      on:click|stopPropagation={() => onResumeOrder(order)}
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
                  {#if canRemove(order)}
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded-full bg-base-100 border border-base-300 text-error hover:bg-error/10 transition-colors"
                      aria-label={$_("admin_direct_mm_remove")}
                      on:click|stopPropagation={() => onRemoveOrder(order)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  {/if}
                </div>
              {/if}
              <button
                class="bg-base-100 text-base-content px-3.5 py-1.5 rounded-full text-xs font-semibold hover:bg-base-300 transition-colors whitespace-nowrap border border-base-300"
                type="button"
                aria-label={`Open diagnosis details for ${order.pair} on ${order.exchangeName}`}
                on:click|stopPropagation={() => onOrderClick(order)}
              >
                {$_("admin_direct_mm_details")}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

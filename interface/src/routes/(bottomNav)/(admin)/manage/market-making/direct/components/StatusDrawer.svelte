<script lang="ts">
  import { _ } from "svelte-i18n";
  import {
    getBadgeClass,
    getStateLabel,
  } from "./helpers";
  import type { DirectOrderSummary, DirectOrderStatus } from "$lib/types/hufi/admin-direct-market-making";

  export let order: DirectOrderSummary | null = null;
  export let data: DirectOrderStatus | null = null;
  export let loading = false;
  export let nowMs = Date.now();
  export let onClose: () => void;

  function secondsAgo(value: string | null): number {
    if (!value) return 0;
    return Math.max(0, Math.floor((nowMs - Date.parse(value)) / 1000));
  }

  function statusAgeLabel(value: string | null): string {
    return $_("admin_direct_mm_seconds_ago", {
      values: { seconds: secondsAgo(value) },
    });
  }
</script>

{#if order}
  <div
    class="fixed inset-y-0 right-0 w-full md:w-96 bg-base-100 border-l border-base-300 shadow-2xl z-40 overflow-y-auto"
  >
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-lg font-semibold text-base-content"
            >{order.pair}</span
          >
          <span class="text-sm text-base-content/60"
            >{order.exchangeName}</span
          >
        </div>
        <button
          class="btn btn-ghost"
          on:click={onClose}
          aria-label={$_("admin_direct_mm_close")}
        >
          <span>{$_("admin_direct_mm_close")}</span>
        </button>
      </div>

      {#if loading && !data}
        <span class="text-base-content/60"
          >{$_("admin_direct_mm_updating")}</span
        >
      {:else if data}
        <div class="flex items-center justify-between gap-3">
          <span class={getBadgeClass(data.runtimeState)}
            >{getStateLabel(data.runtimeState)}</span
          >
          <span class="text-sm text-base-content/60"
            >{$_("admin_direct_mm_last_updated", {
              values: { age: statusAgeLabel(data.lastUpdatedAt) },
            })}</span
          >
        </div>

        {#if secondsAgo(data.lastUpdatedAt) > 15}
          <div class="badge badge-warning">
            {$_("admin_direct_mm_status_stale")}
          </div>
        {/if}

        <div class="space-y-2">
          <span class="text-sm font-semibold text-base-content"
            >{$_("admin_direct_mm_spread")}</span
          >
          <div class="grid grid-cols-3 gap-2 text-sm">
            <span
              >{$_("admin_direct_mm_bid")}: {data.spread?.bid ||
                $_("admin_direct_mm_na")}</span
            >
            <span
              >{$_("admin_direct_mm_ask")}: {data.spread?.ask ||
                $_("admin_direct_mm_na")}</span
            >
            <span
              >{$_("admin_direct_mm_absolute")}: {data.spread
                ?.absolute || $_("admin_direct_mm_na")}</span
            >
          </div>
        </div>

        <div class="space-y-2">
          <span class="text-sm font-semibold text-base-content"
            >{$_("admin_direct_mm_inventory_balances")}</span
          >
          {#each data.inventoryBalances as balance}
            <div class="border border-base-300 rounded-box p-2 text-sm">
              <span>{balance.asset}</span>
              <span class="block text-base-content/60"
                >{$_("admin_direct_mm_free")}: {balance.free}</span
              >
              <span class="block text-base-content/60"
                >{$_("admin_direct_mm_used")}: {balance.used}</span
              >
              <span class="block text-base-content/60"
                >{$_("admin_direct_mm_total")}: {balance.total}</span
              >
            </div>
          {/each}
        </div>

        <div class="space-y-2">
          <span class="text-sm font-semibold text-base-content"
            >{$_("admin_direct_mm_open_orders")}</span
          >
          {#if data.openOrders.length === 0}
            <span class="text-sm text-base-content/60"
              >{$_("admin_direct_mm_no_open_orders")}</span
            >
          {/if}
          {#each data.openOrders as openOrder}
            <div class="border border-base-300 rounded-box p-2 text-sm">
              <span>{openOrder.side} · {openOrder.price} · {openOrder.qty}</span
              >
              <span class="block text-base-content/60"
                >{openOrder.exchangeOrderId}</span
              >
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

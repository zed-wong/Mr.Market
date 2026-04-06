<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import type {
    DirectOrderSummary,
    DirectOrderStatus,
  } from "$lib/types/hufi/admin-direct-market-making";
  import { formatTimestamp } from "$lib/components/market-making/direct/helpers";

  export let show = false;
  export let order: DirectOrderSummary | null = null;
  export let data: DirectOrderStatus | null = null;
  export let loading = false;
  export let onClose: () => void;
  export let onStartOrder: () => void;
  export let onStopOrder: () => void;

  function copyOrderId() {
    if (!order) return;
    navigator.clipboard.writeText(order.orderId);
    toast.success($_("admin_direct_mm_order_id_copied"));
  }

  function getHealthDot(health: string): string {
    if (health === "active") return "bg-green-500";
    if (health === "gone") return "bg-red-500";
    return "bg-yellow-500";
  }

  function getHealthLabel(health: string): string {
    return health.charAt(0).toUpperCase() + health.slice(1);
  }

  function getHealthColor(health: string): string {
    if (health === "active") return "text-green-600";
    if (health === "gone") return "text-red-600";
    return "text-yellow-600";
  }

  function getConnectivity(d: DirectOrderStatus): string {
    if (!d.privateStreamEventAt)
      return $_("admin_direct_mm_connectivity_inactive");
    return $_("admin_direct_mm_connectivity_active");
  }

  $: stateLabel = data
    ? data.runtimeState.charAt(0).toUpperCase() + data.runtimeState.slice(1)
    : order?.runtimeState
      ? order.runtimeState.charAt(0).toUpperCase() + order.runtimeState.slice(1)
      : "";

  $: lastUpdated = data?.lastUpdatedAt
    ? data.lastUpdatedAt.replace("T", " ").slice(0, 19)
    : "";
  $: isRunning =
    order?.runtimeState === "running" || order?.runtimeState === "active";
</script>

{#if show && order}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-[520px] shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto"
    >
      <!-- Header -->
      <div class="px-7 pt-6 pb-4">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="w-5 h-5 text-primary"
              >
                <path
                  d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V8.625L14.25 1.5H5.625ZM14.25 3.75v3.375c0 .621.504 1.125 1.125 1.125h3.375"
                />
                <path d="M8.25 13.5h7.5M8.25 16.5h4.5" />
              </svg>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-base-content/50 font-semibold"
                >{$_("admin_direct_mm_order_details_title")}</span
              >
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-bold text-base-content font-mono"
                  >{order.orderId}</span
                >
                <button
                  class="text-base-content/30 hover:text-base-content/60 transition-colors"
                  on:click={copyOrderId}
                  aria-label="Copy order ID"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="w-3.5 h-3.5"
                  >
                    <path
                      d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z"
                    />
                    <path
                      d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
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
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {#if loading && !data}
        <div class="px-7 pb-7 flex items-center justify-center py-12">
          <span class="loading loading-spinner loading-md text-primary"></span>
        </div>
      {:else}
        <div class="px-7 pb-7 flex flex-col gap-5">
          <!-- Status Cards Row -->
          <div class="grid grid-cols-2 gap-4">
            <!-- General Status -->
            <div class="border border-base-300 rounded-xl p-4">
              <div class="flex items-center gap-1.5 mb-3">
                <span class="text-primary text-sm">{"<>"}</span>
                <span class="text-xs font-bold text-base-content"
                  >{$_("admin_direct_mm_general_status")}</span
                >
              </div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-base-content/60"
                  >{$_("admin_direct_mm_order_state")}</span
                >
                <span
                  class="text-xs font-semibold bg-base-200 px-2 py-0.5 rounded capitalize"
                  >{stateLabel}</span
                >
              </div>
              <div class="flex items-center justify-between">
                <span
                  class="text-[10px] font-bold text-base-content/40 tracking-wider capitalize"
                  >{$_("admin_direct_mm_last_updated_label")}</span
                >
                <span class="text-[10px] text-base-content/50"
                  >{lastUpdated || $_("admin_direct_mm_na")}</span
                >
              </div>
            </div>

            <!-- Health Metrics -->
            <div class="border border-base-300 rounded-xl p-4">
              <div class="flex items-center gap-1.5 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-3.5 h-3.5 text-primary"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span class="text-xs font-bold text-base-content"
                  >{$_("admin_direct_mm_health_metrics")}</span
                >
              </div>
              {#if data}
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_executor_health")}</span
                  >
                  <div class="flex items-center gap-1.5">
                    <span
                      class="w-2 h-2 rounded-full {getHealthDot(
                        data.executorHealth,
                      )}"
                    ></span>
                    <span
                      class="text-xs font-semibold {getHealthColor(
                        data.executorHealth,
                      )}">{getHealthLabel(data.executorHealth)}</span
                    >
                  </div>
                </div>
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_stale_status")}</span
                  >
                  <div class="flex items-center gap-1.5">
                    <span
                      class="w-2 h-2 rounded-full {data.stale
                        ? 'bg-yellow-500'
                        : 'bg-green-500'}"
                    ></span>
                    <span class="text-xs font-semibold"
                      >{data.stale ? "True" : "False"}</span
                    >
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-base-content/60"
                    >{$_("admin_direct_mm_connectivity")}</span
                  >
                  <span class="text-xs font-semibold text-base-content/70"
                    >{getConnectivity(data)}</span
                  >
                </div>
              {:else}
                <span class="text-xs text-base-content/40"
                  >{$_("admin_direct_mm_na")}</span
                >
              {/if}
            </div>
          </div>

          <!-- Inventory Balances -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-3.5 h-3.5 text-primary"
                >
                  <path
                    d="M1 4.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 2H3.25A2.25 2.25 0 0 0 1 4.25ZM1 7.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 5H3.25A2.25 2.25 0 0 0 1 7.25ZM7 8a1 1 0 0 1 1 1 2 2 0 1 0 4 0 1 1 0 0 1 1-1h4.75A2.25 2.25 0 0 1 20 10.25v5.5A2.25 2.25 0 0 1 17.75 18H2.25A2.25 2.25 0 0 1 0 15.75v-5.5A2.25 2.25 0 0 1 2.25 8H7Z"
                  />
                </svg>
                <span class="text-xs font-bold text-base-content"
                  >{$_("admin_direct_mm_inventory_balances")}</span
                >
              </div>
              <span class="text-[10px] text-base-content/40 font-semibold"
                >{$_("admin_direct_mm_currency_allocation")}</span
              >
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead>
                  <tr>
                    <th
                      class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                      >{$_("admin_direct_mm_asset")}</th
                    >
                    <th
                      class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                      >{$_("admin_direct_mm_free_balance")}</th
                    >
                    <th
                      class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize border-b border-base-300"
                      >{$_("admin_direct_mm_used_balance")}</th
                    >
                    <th
                      class="py-2.5 px-3 text-[10px] font-bold text-base-content/40 tracking-wider capitalize text-right border-b border-base-300"
                      >{$_("admin_direct_mm_total")}</th
                    >
                  </tr>
                </thead>
                <tbody>
                  {#if data && data.inventoryBalances.length > 0}
                    {#each data.inventoryBalances as balance}
                      <tr class="border-b border-base-300/50 last:border-0">
                        <td class="py-3 px-3">
                          <div class="flex items-center gap-2">
                            <div
                              class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center"
                            >
                              <span class="text-[8px] font-bold text-primary"
                                >{balance.asset.slice(0, 4)}</span
                              >
                            </div>
                            <span
                              class="text-sm font-semibold text-base-content"
                              >{balance.asset}</span
                            >
                          </div>
                        </td>
                        <td class="py-3 px-3 text-sm text-base-content/70"
                          >{balance.free}</td
                        >
                        <td class="py-3 px-3 text-sm text-base-content/70"
                          >{balance.used}</td
                        >
                        <td
                          class="py-3 px-3 text-sm font-bold text-base-content text-right"
                          >{balance.total}</td
                        >
                      </tr>
                    {/each}
                  {:else}
                    <tr>
                      <td
                        colspan="4"
                        class="py-6 text-center text-sm text-base-content/40"
                        >{$_("admin_direct_mm_no_balances")}</td
                      >
                    </tr>
                  {/if}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Open Orders & Active Intents -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="flex items-center gap-1.5 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-3.5 h-3.5 text-primary"
                >
                  <path
                    fill-rule="evenodd"
                    d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.25 2.25 0 0 1 1 14.75l-.01-9.51Zm1.51 2.06v7.45c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75V7.3H2.5Z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span class="text-xs font-bold text-base-content"
                  >{$_("admin_direct_mm_open_orders")}</span
                >
              </div>
              {#if data && data.openOrders.length > 0}
                <div class="flex flex-col gap-2">
                  {#each data.openOrders as openOrder}
                    <div
                      class="border border-base-300 rounded-lg p-2.5 text-xs"
                    >
                      <span class="font-semibold capitalize"
                        >{openOrder.side}</span
                      >
                      <span class="text-base-content/50">
                        · {openOrder.price} · {openOrder.qty}</span
                      >
                    </div>
                  {/each}
                </div>
              {:else}
                <div
                  class="border border-dashed border-base-300 rounded-xl py-5 flex items-center justify-center"
                >
                  <span class="text-xs text-base-content/40 italic"
                    >{$_("admin_direct_mm_no_open_orders")}</span
                  >
                </div>
              {/if}
            </div>

            <div>
              <div class="flex items-center gap-1.5 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-3.5 h-3.5 text-primary"
                >
                  <path
                    d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z"
                  />
                </svg>
                <span class="text-xs font-bold text-base-content"
                  >{$_("admin_direct_mm_active_intents")}</span
                >
              </div>
              {#if data && data.intents.length > 0}
                <div class="flex flex-col gap-2">
                  {#each data.intents as intent}
                    <div
                      class="border border-base-300 rounded-lg p-2.5 text-xs"
                    >
                      <span class="font-semibold capitalize"
                        >{intent.type || intent.side || ""}</span
                      >
                      {#if intent.price}<span class="text-base-content/50">
                          · {intent.price}</span
                        >{/if}
                      {#if intent.qty}<span class="text-base-content/50">
                          · {intent.qty}</span
                        >{/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <div
                  class="border border-dashed border-base-300 rounded-xl py-5 flex items-center justify-center"
                >
                  <span class="text-xs text-base-content/40 italic"
                    >{$_("admin_direct_mm_no_active_intents")}</span
                  >
                </div>
              {/if}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-center gap-4 mt-2">
            <button
              class="btn btn-ghost text-base-content font-semibold px-6"
              on:click={onClose}
            >
              {$_("close")}
            </button>
            <button
              class={`btn font-semibold px-6 rounded-lg ${
                isRunning
                  ? "bg-error hover:bg-error/90 text-error-content"
                  : "bg-primary hover:bg-primary/90 text-primary-content"
              }`}
              on:click={isRunning ? onStopOrder : onStartOrder}
            >
              {isRunning
                ? $_("admin_direct_mm_stop")
                : $_("admin_direct_mm_start_order")}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

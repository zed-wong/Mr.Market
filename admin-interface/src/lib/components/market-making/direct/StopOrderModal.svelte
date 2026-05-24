<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";

  export let order: DirectOrderSummary | null = null;
  export let isStopping = false;
  export let onConfirm: () => void;
  export let onCancel: () => void;

  function truncateId(id: string): string {
    if (id.length <= 20) return id;
    return `${id.slice(0, 8)}...${id.slice(-12)}`;
  }
</script>

<svelte:window on:keydown={(e) => order && e.key === 'Escape' && onCancel()} />

{#if order}
  <div class="modal modal-open bg-base-content/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-[440px] overflow-hidden shadow-2xl border border-base-300 text-left"
    >
      <div class="px-6 pt-6 pb-5 bg-error/10">
        <div class="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center ring-1 ring-error/20 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" class="fill-error"/>
            <rect x="9" y="9" width="6" height="6" rx="1" class="fill-error-content"/>
          </svg>
        </div>

        <span class="mt-5 block font-display text-[22px] text-base-content leading-[1.15]">
          {$_("admin_direct_mm_stop_confirm_title")}
        </span>
      </div>

      <div class="px-6 py-5 bg-base-100 border-t border-error/20">
        <span class="text-[15px] text-base-content/70 leading-relaxed">
          {$_("admin_direct_mm_stop_confirm_body", {
            values: { pair: order.pair },
          })}
        </span>

        <div class="mt-4 flex flex-col gap-2">
          <div class="flex justify-between items-center text-[13px]">
            <span class="text-base-content/55">{$_("admin_direct_mm_stop_confirm_order_id")}</span>
            <span class="text-base-content font-mono-num">{truncateId(order.orderId)}</span>
          </div>
          <div class="flex justify-between items-center text-[13px]">
            <span class="text-base-content/55">{$_("admin_direct_mm_stop_confirm_trading_pair")}</span>
            <span class="text-base-content font-semibold">{order.pair}</span>
          </div>
        </div>

        <div
          class="mt-5 flex gap-4 px-4 py-3 rounded-xl bg-error/10 border border-error/20 relative overflow-hidden"
        >
          <div class="absolute inset-y-0 left-0 w-[3px] bg-error rounded-full"></div>
          <div class="mt-0.5 ml-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              class="text-error"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <span class="text-[13px] text-base-content/70 leading-relaxed pr-2">
            {$_("admin_direct_mm_stop_confirm_warning")}
          </span>
        </div>

        <div class="flex gap-3 w-full mt-6">
          <button
            class="btn-pill-outline flex-1"
            on:click={onCancel}
          >
            {$_("admin_direct_mm_cancel")}
          </button>
          <button
            class="btn-pill-primary flex-1 bg-error text-error-content"
            on:click={onConfirm}
            disabled={isStopping}
          >
            {isStopping ? $_("admin_direct_mm_stopping") : $_("admin_direct_mm_confirm_stop")}
            {#if !isStopping}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="ml-1"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

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
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-white p-0 rounded-[20px] max-w-[440px] overflow-hidden shadow-[0_24px_80px_-20px_rgba(15,23,42,0.25)] border border-white/70 text-left"
    >
      <div class="px-6 pt-6 pb-5 bg-rose-50/60">
        <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center ring-1 ring-red-100 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" class="fill-red-600"/>
            <rect x="9" y="9" width="6" height="6" rx="1" class="fill-white"/>
          </svg>
        </div>

        <h3 class="mt-5 font-bold text-[22px] text-slate-900 tracking-tight leading-[1.15]">
          {$_("admin_direct_mm_stop_confirm_title")}
        </h3>
      </div>

      <div class="px-6 py-5 bg-white border-t border-rose-100">
        <span class="text-[15px] text-slate-700 leading-relaxed">
          {$_("admin_direct_mm_stop_confirm_body", {
            values: { pair: order.pair },
          })}
        </span>

        <div class="mt-4 flex flex-col gap-2">
          <div class="flex justify-between items-center text-[13px]">
            <span class="text-slate-500">{$_("admin_direct_mm_stop_confirm_order_id")}</span>
            <span class="text-slate-800 font-mono">{truncateId(order.orderId)}</span>
          </div>
          <div class="flex justify-between items-center text-[13px]">
            <span class="text-slate-500">{$_("admin_direct_mm_stop_confirm_trading_pair")}</span>
            <span class="text-slate-800 font-semibold">{order.pair}</span>
          </div>
        </div>

        <div
          class="mt-5 flex gap-4 px-4 py-3 rounded-xl bg-rose-50/70 border border-rose-100 relative overflow-hidden"
        >
          <div class="absolute inset-y-0 left-0 w-[3px] bg-red-600 rounded-full"></div>
          <div class="mt-0.5 ml-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              class="text-red-600"
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
          <span class="text-[13px] text-slate-600 leading-relaxed pr-2">
            {$_("admin_direct_mm_stop_confirm_warning")}
          </span>
        </div>

        <div class="flex gap-3 w-full mt-6">
          <button
            class="btn flex-1 bg-violet-50 hover:bg-violet-100 border-none text-slate-700 h-[44px] min-h-[44px] rounded-lg font-semibold shadow-none"
            on:click={onCancel}
          >
            {$_("admin_direct_mm_cancel")}
          </button>
          <button
            class="btn flex-1 bg-red-600 hover:bg-red-700 border-none text-white h-[44px] min-h-[44px] rounded-lg font-semibold shadow-[0_10px_24px_-12px_rgba(220,38,38,0.9)]"
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

<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";

  export let order: DirectOrderSummary | null = null;
  export let isRemoving = false;
  export let onConfirm: () => void;
  export let onCancel: () => void;

  function truncateId(id: string): string {
    if (id.length <= 20) return id;
    return `${id.slice(0, 8)}...${id.slice(-12)}`;
  }
</script>

<svelte:window on:keydown={(e) => order && e.key === 'Escape' && onCancel()} />

{#if order}
  <div class="modal modal-open bg-black/10 backdrop-blur-sm">
    <div
      class="modal-box bg-white p-8 rounded-3xl max-w-md overflow-hidden shadow-[0_24px_80px_-20px_rgba(15,23,42,0.25)] text-left"
    >
      <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500">
          <path d="M3 6h18"/>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      </div>

      <span class="block mt-4 font-bold text-[22px] text-base-content tracking-tight leading-tight">
        {$_("admin_direct_mm_remove_confirm_title")}
      </span>

      <span class="block mt-4 text-[15px] text-base-content/60 leading-relaxed">
        {$_("admin_direct_mm_remove_confirm_body", {
          values: { pair: order.pair },
        })}
      </span>

      <div class="mt-5 flex flex-col gap-2">
        <div class="flex justify-between items-center text-[13px]">
          <span class="text-base-content/40">{$_("admin_direct_mm_stop_confirm_order_id")}</span>
          <span class="text-base-content/70 font-mono">{truncateId(order.orderId)}</span>
        </div>
        <div class="flex justify-between items-center text-[13px]">
          <span class="text-base-content/40">{$_("admin_direct_mm_stop_confirm_trading_pair")}</span>
          <span class="text-base-content font-semibold">{order.pair}</span>
        </div>
      </div>

      <div
        class="mt-5 flex gap-3 px-4 py-3 rounded-xl bg-red-50/50 border-l-2 border-red-500 relative"
      >
        <div class="mt-0.5 shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            class="text-red-500"
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
        <span class="text-[13px] text-base-content/60 leading-relaxed">
          {$_("admin_direct_mm_stop_confirm_warning")}
        </span>
      </div>

      <div class="flex gap-3 w-full mt-8">
        <button
          class="btn flex-1 bg-base-200 hover:bg-base-300 border-none text-base-content h-[44px] min-h-[44px] rounded-lg font-semibold shadow-none"
          on:click={onCancel}
        >
          {$_("admin_direct_mm_cancel")}
        </button>
        <button
          class="btn flex-1 bg-red-600 hover:bg-red-700 border-none text-white h-[44px] min-h-[44px] rounded-lg font-semibold shadow-none"
          on:click={onConfirm}
          disabled={isRemoving}
        >
          {isRemoving ? $_("admin_direct_mm_removing") : $_("admin_direct_mm_remove")}
          {#if !isRemoving}
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
{/if}

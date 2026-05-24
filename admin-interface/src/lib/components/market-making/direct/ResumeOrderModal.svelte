<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";

  export let order: DirectOrderSummary | null = null;
  export let isResuming = false;
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
      <div class="px-6 pt-6 pb-5 bg-info/10">
        <div
          class="w-10 h-10 rounded-full bg-info/10 flex items-center justify-center text-info ring-1 ring-info/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>

        <span class="mt-5 block font-display text-[22px] text-base-content leading-[1.15]">
          {$_("admin_direct_mm_resume_confirm_title")}
        </span>
      </div>

      <div class="px-6 py-5 bg-base-100 border-t border-base-300">
        <span class="text-[15px] text-base-content/70 leading-relaxed">
          {$_("admin_direct_mm_resume_confirm_body", {
            values: { pair: order.pair },
          })}
        </span>

        <div class="mt-4 flex flex-col gap-2">
          <div class="flex justify-between items-center text-[13px]">
            <span class="text-base-content/55">{$_("admin_direct_mm_resume_confirm_order_id")}</span>
            <span class="text-base-content font-mono-num">{truncateId(order.orderId)}</span>
          </div>
          <div class="flex justify-between items-center text-[13px]">
            <span class="text-base-content/55">{$_("admin_direct_mm_resume_confirm_trading_pair")}</span>
            <span class="text-base-content font-semibold">{order.pair}</span>
          </div>
        </div>

        <div
          class="mt-5 bg-info/10 rounded-xl px-4 py-3 flex gap-3 items-center relative overflow-hidden border border-info/20"
        >
          <div class="absolute inset-y-0 left-0 w-[3px] bg-info rounded-full"></div>
          <div class="text-info flex-shrink-0 ml-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
            </svg>
          </div>
          <span class="text-[12.5px] leading-relaxed text-base-content/70 pr-2">
            {$_("admin_direct_mm_resume_confirm_warning")}
          </span>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            class="btn-pill-outline w-[120px]"
            on:click={onCancel}
          >
            {$_("admin_direct_mm_cancel")}
          </button>
          <button
            class="btn-pill-primary flex-1"
            disabled={isResuming}
            on:click={onConfirm}
          >
            {isResuming ? $_("admin_direct_mm_resuming") : $_("admin_direct_mm_resume_order")}
            {#if !isResuming}
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
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

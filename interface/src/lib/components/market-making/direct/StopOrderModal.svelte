<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { DirectOrderSummary } from "$lib/types/hufi/admin-direct-market-making";

  export let order: DirectOrderSummary | null = null;
  export let isStopping = false;
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

{#if order}
  <div class="modal modal-open">
    <div class="modal-box">
      <div class="flex flex-col gap-3">
        <span class="text-lg font-semibold text-base-content"
          >{$_("admin_direct_mm_stop_confirm_title")}</span
        >
        <span class="text-base-content/70"
          >{$_("admin_direct_mm_stop_confirm_body", {
            values: { pair: order.pair },
          })}</span
        >
        <div class="modal-action">
          <button
            class="btn btn-ghost"
            on:click={onCancel}
          >
            <span>{$_("admin_direct_mm_cancel")}</span>
          </button>
          <button
            class="btn btn-error"
            disabled={isStopping}
            on:click={onConfirm}
          >
            <span
              >{isStopping
                ? $_("admin_direct_mm_stopping")
                : $_("admin_direct_mm_stop")}</span
            >
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

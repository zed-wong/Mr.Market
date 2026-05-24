<script lang="ts">
  import { _ } from "svelte-i18n";
  export let show = false;
  export let isStartingAll = false;
  export let stoppedOrdersCount = 0;
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<svelte:window on:keydown={(e) => show && e.key === 'Escape' && onCancel()} />

{#if show}
  <div class="modal modal-open bg-base-content/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-[420px] overflow-hidden shadow-2xl border border-base-300"
    >
      <div class="flex flex-col">
        <div class="px-6 pt-6 pb-5 bg-info/10">
          <div
            class="w-10 h-10 rounded-full bg-info/10 flex items-center justify-center text-info ring-1 ring-info/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg
            >
          </div>

          <span
            class="mt-5 block font-display text-[22px] leading-[1.15] text-base-content"
          >
            {$_("admin_direct_mm_start_all_title")}<br />{$_("admin_direct_mm_start_all_title_suffix")}
          </span>
        </div>

        <div class="px-6 py-5 bg-base-100 border-t border-base-300">
          <span class="text-[15px] leading-relaxed text-base-content/70">
            {$_("admin_direct_mm_start_all_body", {
              values: { stoppedOrdersCount },
            })}
          </span>

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
                ><path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                /></svg
              >
            </div>
            <span class="text-[12.5px] leading-relaxed text-base-content/70 pr-2">
              {$_("admin_direct_mm_start_all_warning")}
            </span>
          </div>

          <div class="flex gap-3 mt-6">
            <button
              class="btn-pill-outline w-[120px]"
              on:click={onCancel}>{$_("admin_direct_mm_cancel")}</button
            >
            <button
              class="btn-pill-primary flex-1"
              disabled={isStartingAll}
              on:click={onConfirm}
            >
              {isStartingAll ? $_("admin_direct_mm_starting") : $_("admin_direct_mm_confirm_start")}
              {#if !isStartingAll}<svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg
                >{/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

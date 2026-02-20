<script lang="ts">
  import { _ } from "svelte-i18n";
  import { invalidate } from "$app/navigation";
  import QuickAddTradingPair from "$lib/components/admin/settings/spotTrading/QuickAddTradingPair.svelte";
  import type { SpotTradingPair } from "$lib/types/hufi/spot";

  export let configuredExchanges: {
    exchange_id: string;
    name: string;
    icon_url?: string;
    enable: boolean;
  }[] = [];
  export let existingPairs: SpotTradingPair[] = [];

  let addDialogEl: HTMLDialogElement | null = null;
  let quickResetToken = 0;

  function closeDialog() {
    addDialogEl?.close();
  }

  function openDialog() {
    quickResetToken += 1;
    addDialogEl?.showModal();
  }
</script>

<button
  type="button"
  class="btn btn-primary gap-2 shadow-lg hover:shadow-primary/20 transition-all"
  on:click={openDialog}
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    class="w-4 h-4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M12 4.5v15m7.5-7.5h-15"
    />
  </svg>
  {$_("add_pair")}
</button>

<dialog
  bind:this={addDialogEl}
  class="modal modal-bottom sm:modal-middle backdrop-blur-sm"
>
  <div
    class="modal-box w-full sm:max-w-[36rem] rounded-t-3xl sm:rounded-box space-y-3 pt-0 px-0 max-h-[88vh] overflow-y-auto"
  >
    <div class="sticky top-0 bg-base-100 z-10">
      <div class="mx-auto mt-2 mb-2 h-1 w-10 rounded-full bg-base-content/20 sm:hidden"></div>
      <div class="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-base-200">
        <span class="font-semibold text-base sm:text-lg">{$_("quick_add_pair")}</span>
        <button
          type="button"
          class="btn btn-sm btn-circle btn-ghost"
          on:click={closeDialog}
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="px-4 sm:px-6 pb-5">
      <QuickAddTradingPair
        embedded
        resetToken={quickResetToken}
        {configuredExchanges}
        existingPairs={existingPairs}
        on:refresh={async () => {
          await invalidate("admin:settings:spot-trading");
          closeDialog();
        }}
      />
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="Close">close</button>
  </form>
</dialog>

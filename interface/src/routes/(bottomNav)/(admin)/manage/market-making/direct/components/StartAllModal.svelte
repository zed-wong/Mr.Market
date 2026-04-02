<script lang="ts">
  export let show = false;
  export let isStartingAll = false;
  export let stoppedOrdersCount = 0;
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-8 rounded-[20px] max-w-[420px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-base-200/50"
    >
      <div class="flex flex-col gap-6">
        <div
          class="w-10 h-10 rounded-full bg-[#F3F2FF] flex items-center justify-center text-[#4F39F6]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg
          >
        </div>

        <h3
          class="font-bold text-[22px] leading-snug text-base-content tracking-tight mt-[-8px]"
        >
          Confirm Operations<br />Commencement
        </h3>

        <p class="text-[15px] leading-relaxed text-base-content/80 mt-[-4px]">
          You are about to initiate the <span class="font-bold text-[#4F39F6]"
            >Start All</span
          >
          command. This action will resume
          <span class="font-bold text-base-content"
            >{stoppedOrdersCount || 14} currently
            paused algorithmic strategies</span
          >
          across the Global Equity portfolio.
        </p>

        <div
          class="bg-[#F8F8FA] rounded-xl p-4 flex gap-3 items-center relative overflow-hidden"
        >
          <div class="absolute inset-y-0 left-0 w-1 bg-[#4F39F6]"></div>
          <div class="text-[#4F39F6] flex-shrink-0 ml-1">
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
          <p class="text-[12.5px] leading-relaxed text-base-content/80">
            Active orders will begin execution against current market spreads
            immediately upon confirmation.
          </p>
        </div>

        <div class="flex gap-3 mt-1">
          <button
            class="btn bg-[#F0EEF7] hover:bg-[#E5E2F0] border-none text-base-content w-[120px] h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14px] shadow-sm"
            on:click={onCancel}>Cancel</button
          >
          <button
            class="btn bg-[#503CF5] hover:bg-[#432EEB] border-none text-white flex-1 h-[44px] min-h-[44px] rounded-[10px] font-semibold text-[14.5px] shadow-sm flex items-center justify-center gap-1.5"
            disabled={isStartingAll}
            on:click={onConfirm}
          >
            {isStartingAll ? "Starting..." : "Confirm Start"}
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
{/if}

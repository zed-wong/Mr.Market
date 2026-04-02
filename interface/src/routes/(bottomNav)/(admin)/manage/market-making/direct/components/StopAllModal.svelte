<script lang="ts">
  export let show = false;
  export let isStoppingAll = false;
  export let activeOrdersCount = 0;
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-8 rounded-2xl max-w-[440px] shadow-2xl border border-base-200/50 text-left"
    >
      <div class="w-12 h-12 rounded-full bg-[#FEE4E2] flex items-center justify-center mb-8 ring-8 ring-[#FEF3F2] ml-2 mt-2 shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#D83232"/>
          <path d="M8 8l8 8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>

      <h3 class="font-bold text-[22px] text-base-content tracking-tight mb-4">
        Confirm Stop All Orders
      </h3>

      <p class="text-[15px] text-base-content/80 mb-6 leading-relaxed">
        You are about to stop all <strong
          >{activeOrdersCount} currently running algorithmic strategies.</strong
        >
      </p>

      <div
        class="flex gap-4 p-4 rounded-xl bg-[#FCEDED]/50 border-l-[3px] border-[#D83232] mb-8"
      >
        <div class="mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            class="text-[#D83232]"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
              d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
            /><path d="M12 9v4" /><path d="M12 17h.01" /></svg
          >
        </div>
        <p class="text-[13px] text-base-content/80 leading-relaxed">
          This will immediately halt all automated order management and
          execution for the selected campaigns.
        </p>
      </div>

      <div class="flex gap-3 w-full">
        <button
          class="btn flex-1 bg-[#F0EEF7] hover:bg-[#E5E2F0] border-none text-base-content h-[44px] min-h-[44px] rounded-lg font-semibold shadow-sm"
          on:click={onCancel}
        >
          Cancel
        </button>
        <button
          class="btn flex-1 bg-[#D83232] hover:bg-[#C02929] border-none text-white h-[44px] min-h-[44px] rounded-lg font-semibold shadow-sm"
          on:click={onConfirm}
          disabled={isStoppingAll}
        >
          {isStoppingAll ? "Stopping..." : "Stop All Orders"}
          {#if !isStoppingAll}
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
              class="ml-1"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
            >
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

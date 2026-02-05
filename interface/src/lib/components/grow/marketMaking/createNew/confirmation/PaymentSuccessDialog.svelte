<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { _ } from "svelte-i18n";
  import { fade, fly } from "svelte/transition";

  export let isOpen = false;

  const dispatch = createEventDispatcher();

  function handleConfirm() {
    dispatch("confirm");
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
    transition:fade|global={{ duration: 200 }}
    role="dialog"
    aria-modal="true"
  />

  <!-- Modal Content -->
  <div
    class="fixed inset-x-0 bottom-0 z-50 w-full bg-base-100 rounded-t-[24px] md:rounded-[24px] md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-y-1/2 md:w-[400px] md:max-w-[90vw] overflow-hidden flex flex-col"
    transition:fly|global={{ y: 50, duration: 300 }}
  >
    <!-- Drag Handle (Mobile only visual) -->
    <div class="w-full flex justify-center pt-3 pb-1 md:hidden">
      <div class="w-10 h-1 bg-base-300 rounded-full" />
    </div>

    <!-- Content -->
    <div class="px-6 py-8 flex flex-col items-center text-center">
      <!-- Success Icon -->
      <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <svg
          class="w-8 h-8 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <!-- Title -->
      <h3 class="text-xl font-bold text-base-content mb-2">
        {$_("payment_successful")}
      </h3>

      <!-- Subtitle -->
      <p class="text-base-content/60 text-sm mb-6">
        {$_("market_making_order_created")}
      </p>

      <!-- Confirm Button -->
      <button
        class="btn btn-xl bg-base-content text-base-100 w-full rounded-full!"
        on:click={handleConfirm}
      >
        {$_("view_order_details")}
      </button>
    </div>
  </div>
{/if}

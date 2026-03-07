<script lang="ts">
  import { _ } from "svelte-i18n";
</script>

<div class="p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto">
  <div class="flex items-center gap-3 sm:gap-4">
    <button on:click={() => window.history.back()} class="btn btn-ghost btn-circle">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="w-5 h-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
        />
      </svg>
    </button>

    <div class="flex flex-col text-start items-start justify-center min-w-0">
      <span class="text-xl sm:text-2xl font-bold">{$_("strategies")}</span>
    </div>
  </div>
</div>

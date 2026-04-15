<script lang="ts">
  import { _ } from "svelte-i18n";
  import { getControllerTypeLabel, getControllerTypeClasses } from "$lib/helpers/admin/settings/strategies/helpers";
  import type { StrategyDefinition } from "$lib/types/hufi/strategy-definition";

  export let definitions: StrategyDefinition[] = [];

  $: total = definitions.length;
  $: enabled = definitions.filter((d) => d.enabled).length;
  $: byType = definitions.reduce<Record<string, number>>((acc, d) => {
    const type = d.controllerType || "unknown";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
</script>

<div
  class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full"
>
  <div class="flex items-center justify-between mb-2">
    <span class="text-[1.1rem] text-base-content">
      {$_("admin_strategy_definitions_title")}
    </span>
    <span class="text-xs font-semibold text-base-content/40">
      {$_("admin_strategy_definitions_subtitle")}
    </span>
  </div>

  <div class="flex flex-col gap-4 flex-grow mt-2">
    <div class="flex gap-6">
      <div class="flex flex-col">
        <span class="text-3xl font-bold text-base-content">{total}</span>
        <span class="text-xs text-base-content/50 mt-0.5">Total</span>
      </div>
      <div class="flex flex-col">
        <span class="text-3xl font-bold text-success">{enabled}</span>
        <span class="text-xs text-base-content/50 mt-0.5">Enabled</span>
      </div>
      <div class="flex flex-col">
        <span class="text-3xl font-bold text-base-content">{total - enabled}</span>
        <span class="text-xs text-base-content/50 mt-0.5">Disabled</span>
      </div>
    </div>

    {#if Object.keys(byType).length > 0}
      <div class="flex flex-wrap gap-2 mt-1">
        {#each Object.entries(byType) as [type, count]}
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-semibold {getControllerTypeClasses(type)}"
          >
            {getControllerTypeLabel(type)}
            <span class="opacity-70">({count})</span>
          </span>
        {/each}
      </div>
    {:else}
      <div class="text-center text-sm text-base-content/50 my-auto">
        {$_("admin_strategy_no_definitions")}
      </div>
    {/if}
  </div>

  <button
    class="w-full mt-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors border-none"
    on:click={() => {
      const el = document.getElementById("definitions-table");
      el?.scrollIntoView({ behavior: "smooth" });
    }}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    {$_("admin_strategy_view_all_definitions")}
  </button>
</div>

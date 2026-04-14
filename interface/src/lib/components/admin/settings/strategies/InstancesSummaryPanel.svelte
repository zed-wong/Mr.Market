<script lang="ts">
  import { _ } from "svelte-i18n";
  import { formatRelativeTime } from "$lib/helpers/admin/settings/strategies/helpers";
  import type { StrategyInstanceView } from "$lib/types/hufi/strategy-definition";

  export let instances: StrategyInstanceView[] = [];

  $: total = instances.length;
  $: running = instances.filter((i) => i.status === "running").length;
  $: stopped = instances.filter((i) => i.status === "stopped").length;
  $: latestActivity = instances.reduce<string | null>((latest, i) => {
    if (!latest) return i.updatedAt;
    return new Date(i.updatedAt) > new Date(latest) ? i.updatedAt : latest;
  }, null);
</script>

<div
  class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full"
>
  <div class="flex items-center justify-between mb-2">
    <span class="text-[1.1rem] text-base-content">
      {$_("admin_strategy_instances_title")}
    </span>
    <span class="text-xs font-semibold text-base-content/40">
      {$_("admin_strategy_instances_subtitle")}
    </span>
  </div>

  <div class="flex flex-col gap-4 flex-grow mt-2">
    <div class="flex gap-6">
      <div class="flex flex-col">
        <span class="text-3xl font-bold text-base-content">{total}</span>
        <span class="text-xs text-base-content/50 mt-0.5">Total</span>
      </div>
      <div class="flex flex-col">
        <span class="text-3xl font-bold text-success">{running}</span>
        <span class="text-xs text-base-content/50 mt-0.5">Running</span>
      </div>
      <div class="flex flex-col">
        <span class="text-3xl font-bold text-base-content">{stopped}</span>
        <span class="text-xs text-base-content/50 mt-0.5">Stopped</span>
      </div>
    </div>

    {#if latestActivity}
      <div class="text-xs text-base-content/50">
        {$_("admin_strategy_latest_activity")}:
        <span class="font-medium text-base-content/70">{formatRelativeTime(latestActivity)}</span>
      </div>
    {/if}

    {#if total === 0}
      <div class="text-center text-sm text-base-content/50 my-auto">
        {$_("admin_strategy_no_instances")}
      </div>
    {/if}
  </div>

  <button
    class="w-full mt-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors border-none"
    on:click={() => {
      const el = document.getElementById("instances-table");
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
    {$_("admin_strategy_view_all_instances")}
  </button>
</div>

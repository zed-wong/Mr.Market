<script lang="ts">
  import { _ } from "svelte-i18n";
  import { formatDate, getStatusClasses, getStatusLabel } from "$lib/helpers/admin/settings/strategies/helpers";
  import type { StrategyInstanceView } from "$lib/types/hufi/strategy-definition";

  export let instances: StrategyInstanceView[] = [];
  export let onStop: (instance: StrategyInstanceView) => void;
  export let onRefresh: () => void;

  let showRunningOnly = false;

  $: filtered = showRunningOnly
    ? instances.filter((i) => i.status === "running")
    : instances;
</script>

<div id="instances-table" class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50">
  <div
    class="flex flex-col sm:flex-row justify-between items-start xl:items-center gap-4 mb-6"
  >
    <div>
      <h2 class="text-[1.1rem] font-bold text-base-content">
        {$_("admin_strategy_instances_table_title")}
      </h2>
      <span class="text-[13px] text-base-content/50 mt-1">
        {$_("admin_strategy_instances_table_subtitle")}
      </span>
    </div>

    <div class="flex items-center gap-3">
      <div class="flex bg-base-200/60 rounded-lg p-1 gap-1">
        <button
          class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
            {!showRunningOnly ? 'bg-white text-base-content shadow-sm' : 'text-base-content/50'}"
          on:click={() => { showRunningOnly = false; }}
        >
          {$_("admin_strategy_all")}
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
            {showRunningOnly ? 'bg-white text-base-content shadow-sm' : 'text-base-content/50'}"
          on:click={() => { showRunningOnly = true; }}
        >
          {$_("admin_strategy_running_only")}
        </button>
      </div>
      <button
        class="btn bg-indigo-50 hover:bg-indigo-100 text-base-content border-none min-h-[42px] h-[42px] px-4 rounded-lg text-sm font-semibold shadow-sm"
        on:click={onRefresh}
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
          stroke-linejoin="round"
          class="mr-1"
          ><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path
            d="M21 3v5h-5"
          /></svg
        >
        {$_("admin_strategy_refresh")}
      </button>
    </div>
  </div>

  <div class="overflow-x-auto w-full">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr>
          <th
            class="py-4 px-4 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_strategy_key")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_definition_name")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_type")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_status")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_user")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_created")}</th
          >
          <th
            class="py-4 px-4 text-xs text-right font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_actions")}</th
          >
        </tr>
      </thead>
      <tbody>
        {#if filtered.length === 0}
          <tr>
            <td colspan="7" class="text-center py-10 text-base-content/50">
              {showRunningOnly ? $_("admin_strategy_no_running_instances") : $_("admin_strategy_no_instances")}
            </td>
          </tr>
        {/if}
        {#each filtered as instance}
          {@const isRunning = instance.status === "running"}
          <tr class="hover:bg-base-200/30 transition-colors border-b border-base-300/60 last:border-0">
            <td class="py-4 px-4">
              <span class="font-mono text-[13px] text-base-content/70 bg-base-200/60 px-2 py-0.5 rounded">
                {instance.strategyKey || "—"}
              </span>
            </td>
            <td class="py-4 px-2">
              <span class="font-semibold text-sm text-base-content">
                {instance.definitionName || instance.definitionKey || "—"}
              </span>
            </td>
            <td class="py-4 px-2">
              <span class="text-sm text-base-content/70 capitalize">
                {instance.strategyType || instance.controllerType || "—"}
              </span>
            </td>
            <td class="py-4 px-2 whitespace-nowrap">
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide capitalize {getStatusClasses(instance.status)}"
              >
                {#if isRunning}
                  <span class="w-1.5 h-1.5 bg-current rounded-full"></span>
                {/if}
                {getStatusLabel(instance.status)}
              </span>
            </td>
            <td class="py-4 px-2">
              <span class="text-[13px] text-base-content/60 truncate max-w-[120px] block" title={instance.userId}>
                {instance.userId || "—"}
              </span>
            </td>
            <td class="py-4 px-2">
              <span class="text-[13px] text-base-content/60 whitespace-nowrap">
                {formatDate(instance.createdAt)}
              </span>
            </td>
            <td class="py-4 px-4 flex justify-end items-center">
              {#if isRunning}
                <button
                  class="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-100 text-red-600 hover:bg-red-50 transition-colors"
                  aria-label={$_("admin_strategy_stop_instance")}
                  on:click={() => onStop(instance)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><rect
                      width="14"
                      height="14"
                      x="5"
                      y="5"
                      rx="2"
                      fill="currentColor"
                    /></svg
                  >
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<script lang="ts">
  import { _ } from "svelte-i18n";
  import { formatDate, getStatusClasses, getStatusLabel } from "$lib/helpers/admin/settings/strategies/helpers";
  import type { StrategyInstanceView } from "$lib/types/hufi/strategy-definition";

  export let instances: StrategyInstanceView[] = [];
  export let onStop: (instance: StrategyInstanceView) => void;
  export let onRefresh: () => void;

  let showRunningOnly = false;
  let searchTerm = "";

  function shortStrategyKey(value: string | undefined): string {
    if (!value) return "—";
    if (value.length <= 30) return value;
    return `${value.slice(0, 12)}…${value.slice(-16)}`;
  }

  function matchesSearch(instance: StrategyInstanceView): boolean {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return [
      instance.strategyKey,
      instance.definitionName,
      instance.definitionKey,
      instance.strategyType,
      instance.controllerType,
      instance.status,
      instance.userId,
      instance.clientId,
    ].some((value) => (value || "").toLowerCase().includes(query));
  }

  $: filtered = instances
    .filter((i) => !showRunningOnly || i.status === "running")
    .filter(matchesSearch)
    .slice()
    .sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (a.status !== "running" && b.status === "running") return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
</script>

<div id="instances-table" class="bg-base-100 rounded-2xl p-4 sm:p-6 shadow-sm border border-base-200/50">
  <div
    class="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6"
  >
    <div>
      <h2 class="text-[1.1rem] font-bold text-base-content">
        {$_("admin_strategy_instances_table_title")}
      </h2>
      <span class="text-[13px] text-base-content/50 mt-1">
        {$_("admin_strategy_instances_table_subtitle")}
      </span>
    </div>

    <div class="flex w-full flex-col sm:w-auto sm:flex-row sm:items-center gap-3">
      <label class="relative w-full sm:w-64">
        <span class="sr-only">{$_("search")}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
          ><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg
        >
        <input
          class="input input-bordered h-10 min-h-10 w-full rounded-lg border-base-300 bg-base-100 pl-9 text-sm focus:border-primary focus:outline-none"
          placeholder={$_("admin_strategy_search_placeholder")}
          bind:value={searchTerm}
        />
      </label>
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
          {$_("admin_strategy_running_only")} ({instances.filter((i) => i.status === "running").length})
        </button>
      </div>
      <button
        class="btn bg-base-200 hover:bg-base-300 text-base-content border-none min-h-[40px] h-10 w-10 px-0 rounded-lg shadow-sm"
        on:click={onRefresh}
        aria-label={$_("admin_strategy_refresh")}
        title={$_("admin_strategy_refresh")}
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
          class=""
          ><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path
            d="M21 3v5h-5"
          /></svg
        >
      </button>
    </div>
  </div>

  <div class="hidden md:block overflow-x-auto w-full">
    <table class="w-full min-w-[860px] text-left border-collapse">
      <thead>
        <tr>
          <th
            class="py-4 px-4 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_strategy_key")} / {$_("admin_strategy_definition_name")}</th
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
            class="sticky right-0 z-10 bg-base-100 py-4 px-4 text-xs text-right font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300 shadow-[-12px_0_16px_-18px_rgba(0,0,0,0.45)]"
            >{$_("admin_strategy_actions")}</th
          >
        </tr>
      </thead>
      <tbody>
        {#if filtered.length === 0}
          <tr>
            <td colspan="6" class="text-center py-10 text-base-content/50">
              {showRunningOnly ? $_("admin_strategy_no_running_instances") : $_("admin_strategy_no_instances")}
            </td>
          </tr>
        {/if}
        {#each filtered as instance}
          {@const isRunning = instance.status === "running"}
          <tr class="hover:bg-base-200/30 transition-colors border-b border-base-300/60 last:border-0">
            <td class="py-4 px-4">
              <div class="flex flex-col gap-1.5 min-w-0">
                <span class="font-semibold text-sm text-base-content">
                  {instance.definitionName || instance.definitionKey || "—"}
                </span>
                <span class="w-fit max-w-[320px] truncate font-mono text-[12px] text-base-content/70 bg-base-200/60 px-2 py-0.5 rounded" title={instance.strategyKey}>
                  {shortStrategyKey(instance.strategyKey)}
                </span>
              </div>
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
            <td class="sticky right-0 bg-base-100 py-4 px-4 shadow-[-12px_0_16px_-18px_rgba(0,0,0,0.45)]">
              <div class="flex justify-end items-center">
              {#if isRunning}
                <button
                  class="inline-flex h-8 items-center justify-center rounded-lg bg-error/10 px-3 text-xs font-semibold text-error transition-colors hover:bg-error/15"
                  aria-label={$_("admin_strategy_stop_instance")}
                  on:click={() => onStop(instance)}
                >
                  {$_("admin_strategy_stop")}
                </button>
              {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="md:hidden space-y-3">
    {#if filtered.length === 0}
      <div class="text-center py-10 text-base-content/50">
        {showRunningOnly ? $_("admin_strategy_no_running_instances") : $_("admin_strategy_no_instances")}
      </div>
    {/if}
    {#each filtered as instance}
      {@const isRunning = instance.status === "running"}
      <article class="rounded-xl border border-base-300/70 bg-base-100 p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-base-content">
              {instance.definitionName || instance.definitionKey || "—"}
            </h3>
            <p class="mt-1 max-w-full truncate font-mono text-xs text-base-content/60" title={instance.strategyKey}>
              {shortStrategyKey(instance.strategyKey)}
            </p>
          </div>
          <span
            class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide capitalize {getStatusClasses(instance.status)}"
          >
            {#if isRunning}
              <span class="w-1.5 h-1.5 bg-current rounded-full"></span>
            {/if}
            {getStatusLabel(instance.status)}
          </span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span class="block text-base-content/40">{$_("admin_strategy_type")}</span>
            <span class="font-semibold text-base-content/75">{instance.strategyType || instance.controllerType || "—"}</span>
          </div>
          <div>
            <span class="block text-base-content/40">{$_("admin_strategy_user")}</span>
            <span class="block truncate font-semibold text-base-content/75" title={instance.userId}>{instance.userId || "—"}</span>
          </div>
          <div class="col-span-2">
            <span class="block text-base-content/40">{$_("admin_strategy_created")}</span>
            <span class="font-semibold text-base-content/75">{formatDate(instance.createdAt)}</span>
          </div>
        </div>

        {#if isRunning}
          <div class="mt-4 flex justify-end">
            <button
              class="inline-flex h-9 items-center justify-center rounded-lg bg-error/10 px-4 text-xs font-semibold text-error"
              on:click={() => onStop(instance)}
            >
              {$_("admin_strategy_stop")}
            </button>
          </div>
        {/if}
      </article>
    {/each}
  </div>
</div>

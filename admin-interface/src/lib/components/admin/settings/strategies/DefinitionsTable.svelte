<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { formatDate, getControllerTypeLabel, getControllerTypeClasses, getVisibilityLabel } from "$lib/helpers/admin/settings/strategies/helpers";
  import {
    enableStrategyDefinition,
    disableStrategyDefinition,
  } from "$lib/helpers/mrm/admin/strategy";
  import type { StrategyDefinition } from "$lib/types/hufi/strategy-definition";

  export let definitions: StrategyDefinition[] = [];
  export let onEdit: (definition: StrategyDefinition) => void;
  export let onRemove: (definition: StrategyDefinition) => void;
  export let onDetails: (definition: StrategyDefinition) => void;
  export let onRefresh: () => void;
  export let onNewClick: () => void;

  let togglingId: string | null = null;

  function shortKey(value: string | undefined): string {
    if (!value) return "—";
    if (value.length <= 34) return value;
    return `${value.slice(0, 18)}…${value.slice(-10)}`;
  }

  function getToken(): string {
    return localStorage.getItem("admin-access-token") || "";
  }

  async function handleToggle(definition: StrategyDefinition) {
    if (togglingId === definition.id) return;
    const token = getToken();
    if (!token) return;

    togglingId = definition.id;

    try {
      if (definition.enabled) {
        await disableStrategyDefinition(definition.id, token);
        toast.success($_("admin_strategy_definition_disabled"));
      } else {
        await enableStrategyDefinition(definition.id, token);
        toast.success($_("admin_strategy_definition_enabled"));
      }
      await onRefresh();
    } catch (error) {
      toast.error(
        $_("admin_strategy_toggle_failed"),
        { description: String(error) },
      );
    } finally {
      togglingId = null;
    }
  }
</script>

<div id="definitions-table" class="bg-base-100/70 rounded-2xl p-4 sm:p-6 shadow-sm border border-dashed border-base-300/80">
  <div
    class="flex flex-col sm:flex-row justify-between items-start xl:items-center gap-4 mb-6"
  >
    <div>
      <h2 class="text-[1rem] font-bold text-base-content/80">
        {$_("admin_strategy_definitions_table_title")}
      </h2>
      <span class="text-[13px] text-base-content/50 mt-1">
        {$_("admin_strategy_definitions_table_subtitle")}
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <button
        class="btn bg-base-200 hover:bg-base-300 text-base-content border-none min-h-[40px] h-10 px-4 rounded-lg text-sm font-semibold shadow-sm"
        on:click={onNewClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="mr-1"
          ><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path
            d="M12 8v8"
          /></svg
        >
        {$_("admin_strategy_new_definition")}
      </button>
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
    <table class="w-full min-w-[820px] text-left border-collapse">
      <thead>
        <tr>
          <th
            class="py-4 px-4 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_name")} / {$_("admin_strategy_key")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_controller_type")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_visibility")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_enabled")}</th
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
        {#if definitions.length === 0}
          <tr>
            <td colspan="6" class="text-center py-10 text-base-content/50"
              >{$_("admin_strategy_no_definitions")}</td
            >
          </tr>
        {/if}
        {#each definitions as definition}
          <tr
            class="hover:bg-base-200/30 transition-colors border-b border-base-300/60 last:border-0 cursor-pointer"
            on:click={() => onDetails(definition)}
          >
            <td class="py-4 px-4">
              <div class="flex flex-col gap-1.5 min-w-0">
                <span class="font-bold text-sm text-base-content">{definition.name || "—"}</span>
                <span class="w-fit max-w-[280px] truncate font-mono text-[12px] text-base-content/70 bg-base-200/60 px-2 py-0.5 rounded" title={definition.key}>
                  {shortKey(definition.key)}
                </span>
              </div>
            </td>
            <td class="py-4 px-2">
              <span
                class="inline-flex px-2.5 py-1 rounded-[6px] text-xs font-semibold {getControllerTypeClasses(definition.controllerType)}"
              >
                {getControllerTypeLabel(definition.controllerType)}
              </span>
            </td>
            <td class="py-4 px-2">
              <span class="text-sm text-base-content/70">
                {getVisibilityLabel(definition.visibility)}
              </span>
            </td>
            <td class="py-4 px-2" on:click|stopPropagation={() => {}}>
              <div class="flex items-center gap-2">
                <button
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                    {definition.enabled ? 'bg-success' : 'bg-base-300'}"
                  on:click={() => handleToggle(definition)}
                  disabled={togglingId === definition.id}
                  aria-label={definition.enabled ? $_("admin_strategy_disable") : $_("admin_strategy_enable")}
                >
                  <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform
                      {definition.enabled ? 'translate-x-5' : 'translate-x-1'}"
                  ></span>
                </button>
                <span class="text-xs font-semibold {definition.enabled ? 'text-success' : 'text-base-content/50'}">
                  {definition.enabled ? $_("enabled") : $_("disabled")}
                </span>
              </div>
            </td>
            <td class="py-4 px-2">
              <span class="text-[13px] text-base-content/60 whitespace-nowrap">
                {formatDate(definition.createdAt)}
              </span>
            </td>
            <td class="sticky right-0 bg-base-100 py-4 px-4 shadow-[-12px_0_16px_-18px_rgba(0,0,0,0.45)]" on:click|stopPropagation={() => {}}>
              <div class="flex justify-end items-center gap-2">
                <button
                  class="bg-base-300 text-base-content px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-base-300 transition-colors whitespace-nowrap"
                  on:click={() => onEdit(definition)}
                >
                  {$_("admin_strategy_edit")}
                </button>
                <button
                  class="bg-base-300 text-base-content px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-base-300 transition-colors whitespace-nowrap"
                  on:click={() => onRemove(definition)}
                >
                  {$_("admin_strategy_remove")}
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="md:hidden space-y-3">
    {#if definitions.length === 0}
      <div class="text-center py-10 text-base-content/50">
        {$_("admin_strategy_no_definitions")}
      </div>
    {/if}
    {#each definitions as definition}
      <article class="rounded-xl border border-base-300/70 bg-base-100 p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-base-content">{definition.name || "—"}</h3>
            <p class="mt-1 max-w-full truncate font-mono text-xs text-base-content/60" title={definition.key}>
              {shortKey(definition.key)}
            </p>
          </div>
          <span
            class="shrink-0 inline-flex px-2.5 py-1 rounded-[6px] text-xs font-semibold {getControllerTypeClasses(definition.controllerType)}"
          >
            {getControllerTypeLabel(definition.controllerType)}
          </span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span class="block text-base-content/40">{$_("admin_strategy_visibility")}</span>
            <span class="font-semibold text-base-content/75">{getVisibilityLabel(definition.visibility)}</span>
          </div>
          <div>
            <span class="block text-base-content/40">{$_("admin_strategy_created")}</span>
            <span class="font-semibold text-base-content/75">{formatDate(definition.createdAt)}</span>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3">
          <button
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
              {definition.enabled ? 'bg-success' : 'bg-base-300'}"
            on:click={() => handleToggle(definition)}
            disabled={togglingId === definition.id}
            aria-label={definition.enabled ? $_("admin_strategy_disable") : $_("admin_strategy_enable")}
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
                {definition.enabled ? 'translate-x-6' : 'translate-x-1'}"
            ></span>
          </button>
          <div class="flex items-center gap-2">
            <button
              class="bg-base-100 text-base-content px-3 py-1.5 rounded-lg text-xs font-semibold border border-base-300"
              on:click={() => onDetails(definition)}
            >
              {$_("admin_strategy_details")}
            </button>
            <button
              class="bg-base-200 text-base-content px-3 py-1.5 rounded-lg text-xs font-semibold"
              on:click={() => onEdit(definition)}
            >
              {$_("admin_strategy_edit")}
            </button>
            <button
              class="bg-error/10 text-error px-3 py-1.5 rounded-lg text-xs font-semibold"
              on:click={() => onRemove(definition)}
            >
              {$_("admin_strategy_remove")}
            </button>
          </div>
        </div>
      </article>
    {/each}
  </div>
</div>

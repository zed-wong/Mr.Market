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

<div id="definitions-table" class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50">
  <div
    class="flex flex-col sm:flex-row justify-between items-start xl:items-center gap-4 mb-6"
  >
    <div>
      <h2 class="text-[1.1rem] font-bold text-base-content">
        {$_("admin_strategy_definitions_table_title")}
      </h2>
      <span class="text-[13px] text-base-content/50 mt-1">
        {$_("admin_strategy_definitions_table_subtitle")}
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        class="btn bg-blue-600 hover:bg-blue-700 text-white border-none min-h-[42px] h-[42px] px-5 rounded-lg text-sm font-semibold shadow-sm"
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
            >{$_("admin_strategy_name")}</th
          >
          <th
            class="py-4 px-2 text-xs font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_key")}</th
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
            class="py-4 px-4 text-xs text-right font-bold text-base-content/50 capitalize tracking-widest border-b border-base-300"
            >{$_("admin_strategy_actions")}</th
          >
        </tr>
      </thead>
      <tbody>
        {#if definitions.length === 0}
          <tr>
            <td colspan="7" class="text-center py-10 text-base-content/50"
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
              <span class="font-bold text-sm text-base-content">{definition.name || "—"}</span>
            </td>
            <td class="py-4 px-2">
              <span class="font-mono text-[13px] text-base-content/70 bg-base-200/60 px-2 py-0.5 rounded">
                {definition.key || "—"}
              </span>
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
                />
              </button>
            </td>
            <td class="py-4 px-2">
              <span class="text-[13px] text-base-content/60 whitespace-nowrap">
                {formatDate(definition.createdAt)}
              </span>
            </td>
            <td class="py-4 px-4 flex justify-end items-center gap-2" on:click|stopPropagation={() => {}}>
              <button
                class="bg-indigo-50 text-blue-600 px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors whitespace-nowrap"
                on:click={() => onEdit(definition)}
              >
                {$_("admin_strategy_edit")}
              </button>
              <button
                class="bg-red-50 text-red-600 px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors whitespace-nowrap"
                on:click={() => onRemove(definition)}
              >
                {$_("admin_strategy_remove")}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

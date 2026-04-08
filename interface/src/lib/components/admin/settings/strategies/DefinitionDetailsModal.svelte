<script lang="ts">
  import { _ } from "svelte-i18n";
  import { formatDate, getControllerTypeLabel, getControllerTypeClasses, getVisibilityLabel } from "./helpers";
  import type { StrategyDefinition } from "$lib/types/hufi/strategy-definition";

  export let show = false;
  export let definition: StrategyDefinition | null = null;
  export let onClose: () => void;
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && onClose()} />

{#if show && definition}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-[640px] shadow-2xl border border-base-300 max-h-[85vh] overflow-y-auto no-scrollbar"
    >
      <!-- Header -->
      <div class="px-7 pt-6 pb-4 sticky top-0 bg-base-100 z-10 border-b border-base-200/60">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="w-5 h-5 text-primary"
              >
                <path d="M9 12h6" />
                <path d="M12 9v6" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div>
              <span class="text-xl font-bold text-base-content block">{definition.name || "—"}</span>
              <span class="font-mono text-xs text-base-content/50">{definition.key}</span>
            </div>
          </div>
          <button
            class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
            on:click={onClose}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-5 h-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="px-7 pb-7 flex flex-col gap-5 mt-5">
        <!-- Meta badges -->
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="inline-flex px-2.5 py-1 rounded-[6px] text-xs font-semibold {getControllerTypeClasses(definition.controllerType)}"
          >
            {getControllerTypeLabel(definition.controllerType)}
          </span>
          <span
            class="inline-flex px-2.5 py-1 rounded-[6px] text-xs font-semibold bg-base-200 text-base-content/70"
          >
            {getVisibilityLabel(definition.visibility)}
          </span>
          {#if definition.enabled}
            <span class="inline-flex bg-success/10 text-success px-2.5 py-1 rounded-[6px] text-xs font-semibold border border-success/20">
              Enabled
            </span>
          {:else}
            <span class="inline-flex bg-base-200 text-base-content/50 px-2.5 py-1 rounded-[6px] text-xs font-semibold">
              Disabled
            </span>
          {/if}
        </div>

        {#if definition.description}
          <p class="text-sm text-base-content/70 leading-relaxed">{definition.description}</p>
        {/if}

        <!-- Details grid -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-base-200/40 rounded-xl p-4">
            <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_strategy_created")}</span>
            <div class="mt-1">
              <span class="text-sm font-medium text-base-content">{formatDate(definition.createdAt)}</span>
            </div>
          </div>
          <div class="bg-base-200/40 rounded-xl p-4">
            <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_strategy_updated")}</span>
            <div class="mt-1">
              <span class="text-sm font-medium text-base-content">{formatDate(definition.updatedAt)}</span>
            </div>
          </div>
          {#if definition.createdBy}
            <div class="bg-base-200/40 rounded-xl p-4">
              <span class="text-[11px] font-semibold tracking-wider text-base-content/40 capitalize">{$_("admin_strategy_created_by")}</span>
              <div class="mt-1">
                <span class="text-sm font-medium text-base-content">{definition.createdBy}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Config Schema -->
        <div class="bg-base-200/40 rounded-xl p-4">
          <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
            >{$_("admin_strategy_config_schema")}</span
          >
          <pre class="text-xs text-base-content/70 font-mono bg-base-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(definition.configSchema, null, 2)}</pre>
        </div>

        <!-- Default Config -->
        <div class="bg-base-200/40 rounded-xl p-4">
          <span class="text-xs font-semibold text-base-content/50 tracking-wider block mb-2"
            >{$_("admin_strategy_default_config")}</span
          >
          <pre class="text-xs text-base-content/70 font-mono bg-base-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(definition.defaultConfig, null, 2)}</pre>
        </div>
      </div>
    </div>
  </div>
{/if}

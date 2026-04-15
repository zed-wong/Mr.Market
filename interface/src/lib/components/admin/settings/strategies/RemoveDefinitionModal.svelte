<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { removeStrategyDefinition } from "$lib/helpers/mrm/admin/strategy";
  import type { StrategyDefinition } from "$lib/types/hufi/strategy-definition";

  export let show = false;
  export let definition: StrategyDefinition | null = null;
  export let isRemoving = false;
  export let onSuccess: () => void;
  export let onClose: () => void;

  function getToken(): string {
    return localStorage.getItem("admin-access-token") || "";
  }

  async function handleRemove() {
    if (!definition) return;

    isRemoving = true;

    try {
      await removeStrategyDefinition(definition.id, getToken());
      toast.success($_("admin_strategy_definition_removed"));
      onSuccess();
    } catch (error) {
      toast.error($_("admin_strategy_remove_failed"), {
        description: String(error),
      });
    } finally {
      isRemoving = false;
    }
  }

  $: canRemove = definition && !definition.enabled;
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && onClose()} />

{#if show && definition}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-[400px] shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto no-scrollbar"
    >
      <div class="px-7 pt-6 pb-5">
        <div class="flex items-start justify-between">
          <div
            class="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-5 h-5 text-error"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
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

      <div class="px-7 pb-7 flex flex-col gap-4">
        <div>
          <span class="text-xl font-bold text-base-content block"
            >{$_("admin_strategy_remove_definition")}</span
          >
          <span class="font-mono text-sm text-base-content/60 bg-base-200/60 px-2 py-0.5 rounded mt-1 inline-block">
            {definition.key}
          </span>
        </div>

        {#if !canRemove}
          <div
            class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800"
          >
            <span class="font-semibold">{$_("admin_strategy_cannot_remove_title")}</span>
            <ul class="mt-2 space-y-1 text-xs list-disc list-inside opacity-80">
              {#if definition.enabled}
                <li>{$_("admin_strategy_must_disable_first")}</li>
              {/if}
              <li>{$_("admin_strategy_no_linked_instances")}</li>
            </ul>
          </div>
        {:else}
          <p class="text-sm text-base-content/60">
            {$_("admin_strategy_remove_confirm_body")}
          </p>
        {/if}

        <div class="flex gap-3 justify-end mt-2">
          <button
            class="btn btn-ghost text-base-content font-semibold px-6"
            on:click={onClose}
          >
            {$_("admin_strategy_cancel")}
          </button>
          <button
            class="btn bg-error hover:bg-error text-error-content font-semibold px-6 gap-2"
            on:click={handleRemove}
            disabled={isRemoving || !canRemove}
          >
            {#if isRemoving}
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="w-4 h-4"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            {/if}
            {$_("admin_strategy_remove")}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

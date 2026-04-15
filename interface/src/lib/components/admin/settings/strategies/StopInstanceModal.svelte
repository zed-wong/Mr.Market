<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { stopStrategyInstance } from "$lib/helpers/mrm/admin/strategy";
  import type { StrategyInstanceView } from "$lib/types/hufi/strategy-definition";

  export let show = false;
  export let instance: StrategyInstanceView | null = null;
  export let isStopping = false;
  export let onSuccess: () => void;
  export let onClose: () => void;

  function getToken(): string {
    return localStorage.getItem("admin-access-token") || "";
  }

  async function handleStop() {
    if (!instance) return;

    isStopping = true;

    try {
      await stopStrategyInstance(
        {
          definitionId: String(instance.definitionId || ""),
          userId: instance.userId || "",
          clientId: instance.clientId || "",
        },
        getToken(),
      );

      toast.success($_("admin_strategy_instance_stopped"));
      onSuccess();
    } catch (error) {
      toast.error($_("admin_strategy_stop_instance_failed"), {
        description: String(error),
      });
    } finally {
      isStopping = false;
    }
  }
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && onClose()} />

{#if show && instance}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-[400px] shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto no-scrollbar"
    >
      <div class="px-7 pt-6 pb-5">
        <div class="flex items-start justify-between">
          <div
            class="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-5 h-5 text-amber-600"
            >
              <rect
                width="14"
                height="14"
                x="5"
                y="5"
                rx="2"
                fill="currentColor"
              />
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
            >{$_("admin_strategy_stop_instance_title")}</span
          >
          <span class="font-mono text-sm text-base-content/60 bg-base-200/60 px-2 py-0.5 rounded mt-1 inline-block">
            {instance.strategyKey}
          </span>
        </div>

        <p class="text-sm text-base-content/60">
          {$_("admin_strategy_stop_instance_body")}
        </p>

        <div class="flex gap-3 justify-end mt-2">
          <button
            class="btn btn-ghost text-base-content font-semibold px-6"
            on:click={onClose}
          >
            {$_("admin_strategy_cancel")}
          </button>
          <button
            class="btn bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 gap-2"
            on:click={handleStop}
            disabled={isStopping}
          >
            {#if isStopping}
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
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
              >
                <rect width="14" height="14" x="5" y="5" rx="2" fill="currentColor" />
              </svg>
            {/if}
            {$_("admin_strategy_stop")}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

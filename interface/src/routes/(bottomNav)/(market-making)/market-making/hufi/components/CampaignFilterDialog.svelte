<script lang="ts">
  import { _ } from "svelte-i18n";
  import { createEventDispatcher } from "svelte";

  export let show = false;
  export let types: string[] = [];
  export let filterType = "";
  export let sortField: "date" | "reward" = "date";
  export let sortOrder: "desc" | "asc" = "desc";

  const dispatch = createEventDispatcher();

  function close() {
    show = false;
  }

  function apply() {
    dispatch("apply", { filterType, sortField, sortOrder });
    close();
  }

  function reset() {
    filterType = "";
    sortField = "date";
    sortOrder = "desc";
    dispatch("apply", { filterType, sortField, sortOrder });
    close();
  }
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && close()} />

<dialog class="modal modal-bottom" class:modal-open={show}>
  <div class="modal-box bg-base-100 rounded-t-3xl p-6 w-full relative">
    <!-- Handle for mobile feel -->
    <div
      class="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-base-300 rounded-full"
    ></div>

    <div class="flex items-center justify-between mb-6 mt-2">
      <span class="text-xl font-bold text-base-content">
        {$_("hufi_filter_title")}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-circle absolute right-4 top-4"
        on:click={close}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2.5"
          stroke="currentColor"
          class="w-5 h-5 opacity-40"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <div class="space-y-5">
      <div class="space-y-2 text-left">
        <span
          class="block text-[13px] font-bold text-base-content/40 pl-1 capitalize"
        >
          {$_("hufi_filter_campaign_type")}
        </span>
        <select
          class="select select-bordered w-full bg-base-100 text-base-content text-sm capitalize rounded-2xl border-base-300 h-12"
          bind:value={filterType}
        >
          <option value="">{$_("hufi_filter_all_types")}</option>
          {#each types as t}
            <option value={t} class="capitalize">
              {t.replace(/_/g, " ").toLowerCase()}
            </option>
          {/each}
        </select>
      </div>

      <div class="space-y-2 text-left">
        <span
          class="block text-[13px] font-bold text-base-content/40 pl-1 capitalize"
        >
          {$_("hufi_filter_sort_by")}
        </span>
        <select
          class="select select-bordered w-full bg-base-100 text-base-content text-sm rounded-2xl border-base-300 h-12"
          bind:value={sortField}
        >
          <option value="date">{$_("hufi_filter_sort_date")}</option>
          <option value="reward">{$_("hufi_filter_sort_reward")}</option>
        </select>
      </div>

      <div class="space-y-2 text-left">
        <span
          class="block text-[13px] font-bold text-base-content/40 pl-1 capitalize"
        >
          {$_("hufi_filter_order")}
        </span>
        <select
          class="select select-bordered w-full bg-base-100 text-base-content text-sm rounded-2xl border-base-300 h-12"
          bind:value={sortOrder}
        >
          <option value="desc">{$_("hufi_filter_desc")}</option>
          <option value="asc">{$_("hufi_filter_asc")}</option>
        </select>
      </div>
    </div>

    <div class="mt-8 flex gap-3">
      <button
        class="btn btn-block flex-1 bg-base-200 text-base-content hover:bg-base-300 rounded-full h-12 min-h-12 border-none text-sm font-bold"
        on:click={reset}
      >
        {$_("hufi_filter_reset")}
      </button>
      <button
        class="btn btn-block flex-1 bg-base-content text-base-100 hover:bg-base-content/90 rounded-full h-12 min-h-12 border-none text-sm font-bold"
        on:click={apply}
      >
        {$_("hufi_filter_apply")}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop bg-black/20 backdrop-blur-sm">
    <button on:click={close}>close</button>
  </form>
</dialog>
